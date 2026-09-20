import { useCallback, useEffect, useMemo, useState } from 'react'
import { createObservationCandidate, type ObservationCandidateSource } from '@/data/observations'
import { onBackOnline } from '@/lib/connectivity'
import {
  canQueue,
  flushQueue,
  inCaptureOrder,
  indexedDbStore,
  isStuck,
  memoryStore,
  type FlushResult,
  type QueuedObservation,
} from '@/lib/observationQueue'
import { uploadPhoto, type PhotoLocation } from '@/lib/photo'

// Capture, then delivery -- in that order, always.
//
// Not "send, and queue if that fails". Everything goes through the queue
// and the queue is flushed immediately, so the path that runs in a block
// with no signal is the path that runs at a desk with five bars. A
// fallback only exercised in a field is a fallback nobody finds out is
// broken until they are standing in one (0037).

export type Capture = {
  summary: string
  note?: string | null
  observedDate?: string | null
  plantingId?: string | null
  conversationId?: string | null
  source: ObservationCandidateSource
  photo?: Blob | null
  location?: PhotoLocation | null
}

// Deliveries that happened without anybody asking, counted outside React.
//
// It was state inside the hook, which meant it belonged to whichever
// screen happened to be mounted when the signal came back -- and the
// producer, who had put the phone away and come back to the observation
// log afterwards, saw nothing at all. The queue is a thing about the
// device rather than about a screen, so what it has done lives at the
// same level and any screen that mounts can report it.
let deliveredUnprompted = 0
const listeners = new Set<() => void>()

function recordUnpromptedDelivery(count: number) {
  deliveredUnprompted += count
  for (const listener of listeners) listener()
}

/** For tests, which must not inherit a count from the file before them. */
export function forgetUnpromptedDeliveries() {
  deliveredUnprompted = 0
  for (const listener of listeners) listener()
}

export function useObservationQueue(producerId: string | null) {
  // Falls back to memory where IndexedDB is missing -- a private window,
  // an old WebView. Captures then last as long as the screen does, which
  // is worse than the queue and better than the RPC failing outright.
  const store = useMemo(() => (canQueue() ? indexedDbStore() : memoryStore()), [])
  const [waiting, setWaiting] = useState<QueuedObservation[]>([])
  // What went out without anybody pressing anything. The producer
  // watched a queue empty itself when the signal came back and could
  // not tell whether their observations had been sent or dropped:
  // "it just goes... no indication that signal returned". A count the
  // screen can render is the difference between those two readings.
  const [deliveredOnItsOwn, setDeliveredOnItsOwn] = useState(deliveredUnprompted)

  useEffect(() => {
    const listener = () => setDeliveredOnItsOwn(deliveredUnprompted)
    listeners.add(listener)
    listener()
    return () => void listeners.delete(listener)
  }, [])

  const refresh = useCallback(async () => {
    setWaiting(inCaptureOrder(await store.all()))
  }, [store])

  /**
   * Delivers what is waiting and says what it managed to deliver.
   *
   * The result is returned rather than swallowed because the screen has
   * no other way to find out. A flush that succeeds empties the queue,
   * the "waiting for signal" notice disappears with it, and what it sent
   * does not turn up in the observation log either -- a flushed capture
   * is a candidate awaiting review (0030), and only an approval puts it
   * in the log. So the producer watched an observation leave one screen
   * and arrive on none, which reads exactly like losing it. With the
   * count in hand the screen can say where it went.
   */
  const flush = useCallback(async (): Promise<FlushResult> => {
    // Nothing can be delivered without the producer id the upload below
    // needs. It answers with the queue as it actually stands rather than
    // an empty result: a caller reads `sent` as "this many got through",
    // so the numbers beside it have to be true as well.
    if (!producerId) {
      const left = await store.all()
      return { sent: 0, stuck: left.filter(isStuck).length, remaining: left.length }
    }

    const result = await flushQueue(store, {
      // The path carries the tenancy check, so the upload needs the
      // producer -- which is also why it cannot be done at capture time
      // with no signal: a path handed out offline is unverifiable.
      uploadPhoto: (blob) => uploadPhoto(blob, producerId, null),
      createCandidate: (item) =>
        createObservationCandidate({
          clientId: item.clientId,
          summary: item.summary,
          note: item.note,
          observedDate: item.observedDate,
          plantingId: item.plantingId,
          conversationId: item.conversationId,
          source: item.source,
          photoPath: item.photoPath,
          photoLatitude: item.location?.latitude ?? null,
          photoLongitude: item.location?.longitude ?? null,
          photoAccuracyM: item.location?.accuracyM ?? null,
        }),
    })
    await refresh()
    return result
  }, [store, producerId, refresh])

  /**
   * A flush nobody asked for -- on opening the screen, or when the
   * browser says the connection is back. Its result is remembered rather
   * than returned, because there is no caller waiting on it.
   */
  const flushQuietly = useCallback(async () => {
    const result = await flush()
    if (result && result.sent > 0) recordUnpromptedDelivery(result.sent)
  }, [flush])

  // Delivers whatever a previous session left behind. oxlint warns
  // about setState in an effect here and the warning is a false one it
  // cannot see through: `flush` is async, so nothing is set during the
  // effect -- and what it eventually sets is the queue's own contents,
  // read back from IndexedDB, which is precisely the external system an
  // effect exists to synchronise with. Neither disable directive is
  // honoured by this version, so the reasoning lives here instead.
  useEffect(() => {
    void flushQuietly()
  }, [flushQuietly])

  useEffect(() => onBackOnline(() => void flushQuietly()), [flushQuietly])

  /**
   * Records the capture and tries to deliver it. Resolves once it is
   * safely written down, which is the promise being made to the producer
   * -- delivery is this hook's problem from then on.
   *
   * Returns whether it got through, so the screen can say "saved" or
   * "saved, waiting for signal" rather than guessing.
   */
  const capture = useCallback(
    async (input: Capture): Promise<{ delivered: boolean }> => {
      const item: QueuedObservation = {
        clientId: crypto.randomUUID(),
        summary: input.summary,
        note: input.note ?? null,
        observedDate: input.observedDate ?? null,
        plantingId: input.plantingId ?? null,
        conversationId: input.conversationId ?? null,
        source: input.source,
        photo: input.photo ?? null,
        location: input.location ?? null,
        photoPath: null,
        queuedAt: Date.now(),
        attempts: 0,
        lastError: null,
      }

      await store.put(item)
      await refresh()
      await flush()
      const left = await store.all()
      return { delivered: !left.some((queued) => queued.clientId === item.clientId) }
    },
    [store, refresh, flush],
  )

  return { capture, waiting, flush, deliveredOnItsOwn }
}
