import type { ObservationCandidateSource } from '@/data/observations'
import type { PhotoLocation } from '@/lib/photo'

// Observations captured before they can be sent.
//
// A producer standing in front of a vine with no signal is the case this
// app exists for, and until now the RPC simply failed and the capture was
// gone. So every capture is written here first and delivered afterwards
// -- online, that afterwards is immediate, which is the point: the code
// that runs in a block is the same code that runs at a desk, rather than
// a rarely-exercised fallback that rots unnoticed
// (docs/decisions/0037-what-happens-with-no-signal.md).
//
// The storage is behind an interface because the logic worth testing --
// what order things go in, what happens when one fails, when something
// is declared stuck -- has nothing to do with IndexedDB, and jsdom has
// no IndexedDB to test it against.

export type QueuedObservation = {
  /** Minted at capture, before anything has reached the server. */
  clientId: string
  summary: string
  note: string | null
  observedDate: string | null
  plantingId: string | null
  conversationId: string | null
  source: ObservationCandidateSource
  /** The bytes themselves: with no signal there is nowhere to put them yet. */
  photo: Blob | null
  /**
   * Where the producer was standing when they captured it, not where
   * they were when the phone found a signal again. A point taken at
   * flush is a lie about where the vine is.
   */
  location: PhotoLocation | null
  /** Set once the photo is uploaded, so a retry does not upload it twice. */
  photoPath: string | null
  queuedAt: number
  attempts: number
  lastError: string | null
}

export type QueueStore = {
  all(): Promise<QueuedObservation[]>
  put(item: QueuedObservation): Promise<void>
  remove(clientId: string): Promise<void>
}

/**
 * After this many failures an item stops being retried and starts being
 * shown as stuck. It stays in the queue either way: a queue that drops
 * things quietly is worse than no queue, because the producer believes
 * the observation was recorded.
 */
export const GIVE_UP_AFTER = 5

export function isStuck(item: QueuedObservation): boolean {
  return item.attempts >= GIVE_UP_AFTER
}

/** The order they were captured in, which is the order they should arrive. */
export function inCaptureOrder(items: QueuedObservation[]): QueuedObservation[] {
  return [...items].sort((a, b) => a.queuedAt - b.queuedAt)
}

export type FlushDeps = {
  /** Uploads the bytes and returns the storage path. */
  uploadPhoto: (blob: Blob) => Promise<string>
  /** Files the candidate. Returns the id, whether it inserted or replayed. */
  createCandidate: (item: QueuedObservation) => Promise<string | null>
}

export type FlushResult = { sent: number; stuck: number; remaining: number }

/**
 * Delivers what is waiting, oldest first, and stops at the first failure.
 *
 * Stopping is deliberate. The overwhelming reason a flush fails is that
 * there is still no signal, in which case every remaining item would fail
 * too -- and trying them anyway would burn the attempt counter on all of
 * them at once and declare the whole queue stuck over one bad minute.
 */
export async function flushQueue(store: QueueStore, deps: FlushDeps): Promise<FlushResult> {
  const waiting = inCaptureOrder(await store.all())
  let sent = 0

  for (const item of waiting) {
    if (isStuck(item)) continue

    // Declared out here so the failure path below writes back the path
    // rather than the null it started with. Writing `item` unchanged on
    // failure forgot an upload that had already happened, and the next
    // flush left another copy of the photo in the bucket -- one per
    // retry, each one paid for and referenced by nothing.
    let photoPath = item.photoPath

    try {
      // Uploaded first and remembered, because the bucket has no idea it
      // has seen these bytes before. The candidate does: its client id
      // makes a replay free, which is why only the photo needs this.
      if (item.photo && !photoPath) {
        photoPath = await deps.uploadPhoto(item.photo)
        await store.put({ ...item, photoPath })
      }

      await deps.createCandidate({ ...item, photoPath })
      await store.remove(item.clientId)
      sent += 1
    } catch (error) {
      await store.put({
        ...item,
        photoPath,
        attempts: item.attempts + 1,
        lastError: error instanceof Error ? error.message : String(error),
      })
      break
    }
  }

  const left = await store.all()
  return { sent, stuck: left.filter(isStuck).length, remaining: left.length }
}

/** For tests, and for any environment without IndexedDB. */
export function memoryStore(initial: QueuedObservation[] = []): QueueStore {
  const items = new Map(initial.map((item) => [item.clientId, item]))
  return {
    all: async () => [...items.values()],
    put: async (item) => void items.set(item.clientId, item),
    remove: async (clientId) => void items.delete(clientId),
  }
}

const DB_NAME = 'growdy'
const STORE_NAME = 'queued-observations'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'clientId' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function run<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * IndexedDB rather than localStorage: photos are the point of this queue
 * and they are megabytes, which localStorage cannot hold and would not
 * hold as bytes anyway.
 */
export function indexedDbStore(): QueueStore {
  async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => Promise<T>) {
    const db = await open()
    try {
      return await fn(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME))
    } finally {
      db.close()
    }
  }

  return {
    all: () => withStore('readonly', (store) => run(store.getAll() as IDBRequest<QueuedObservation[]>)),
    put: (item) => withStore('readwrite', async (store) => void (await run(store.put(item)))),
    remove: (clientId) => withStore('readwrite', async (store) => void (await run(store.delete(clientId)))),
  }
}

/** Whether this browser can queue at all. */
export function canQueue(): boolean {
  return typeof indexedDB !== 'undefined'
}
