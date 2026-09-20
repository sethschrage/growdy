import { describe, expect, it, vi } from 'vitest'
import {
  GIVE_UP_AFTER,
  flushQueue,
  inCaptureOrder,
  isStuck,
  memoryStore,
  type QueuedObservation,
} from '@/lib/observationQueue'

// The queue holds the only copy of something a producer walked out to a
// vine to record. Every rule here is about not losing it, and about not
// filing it twice.

function queued(overrides: Partial<QueuedObservation> = {}): QueuedObservation {
  return {
    clientId: crypto.randomUUID(),
    summary: 'Mildew on the north row',
    note: null,
    observedDate: '2026-09-19',
    plantingId: null,
    conversationId: null,
    source: 'producer',
    photo: null,
    location: null,
    photoPath: null,
    queuedAt: 1000,
    attempts: 0,
    lastError: null,
    ...overrides,
  }
}

const deps = () => ({
  uploadPhoto: vi.fn(async (_blob: Blob) => 'producer-1/photo.jpg'),
  createCandidate: vi.fn(async (_item: QueuedObservation) => 'candidate-1' as string | null),
})

describe('flushQueue', () => {
  it('delivers what is waiting and empties the queue', async () => {
    const store = memoryStore([queued(), queued()])
    const result = await flushQueue(store, deps())
    expect(result).toEqual({ sent: 2, stuck: 0, remaining: 0 })
    expect(await store.all()).toHaveLength(0)
  })

  it('delivers in the order things were captured', async () => {
    const later = queued({ summary: 'second', queuedAt: 2000 })
    const earlier = queued({ summary: 'first', queuedAt: 1000 })
    // Stored out of order on purpose: IndexedDB returns by key, not by time.
    const store = memoryStore([later, earlier])
    const d = deps()
    await flushQueue(store, d)
    expect(d.createCandidate.mock.calls.map(([item]) => item.summary)).toEqual(['first', 'second'])
  })

  it('keeps an item that fails, and counts the attempt', async () => {
    const store = memoryStore([queued()])
    const d = deps()
    d.createCandidate.mockRejectedValueOnce(new TypeError('Load failed'))

    const result = await flushQueue(store, d)
    expect(result.sent).toBe(0)
    const left = (await store.all())[0]!
    expect(left.attempts).toBe(1)
    expect(left.lastError).toBe('Load failed')
  })

  it('stops at the first failure rather than burning every attempt at once', async () => {
    // Almost always the reason is "still no signal", and trying the rest
    // would fail them all and declare the whole queue stuck over one
    // bad minute.
    const store = memoryStore([queued({ queuedAt: 1 }), queued({ queuedAt: 2 }), queued({ queuedAt: 3 })])
    const d = deps()
    d.createCandidate.mockRejectedValue(new Error('offline'))

    await flushQueue(store, d)
    expect(d.createCandidate).toHaveBeenCalledTimes(1)
    const attempts = (await store.all()).map((item) => item.attempts)
    expect(attempts.filter((n) => n > 0)).toHaveLength(1)
  })

  it('uploads a photo once, even if the flush is interrupted after it', async () => {
    // The bytes are the expensive part and the bucket has no idea it has
    // seen them before -- unlike the candidate, whose client id makes a
    // replay free.
    const store = memoryStore([queued({ photo: new Blob(['jpeg']) })])
    const d = deps()
    d.createCandidate.mockRejectedValueOnce(new Error('dropped'))

    await flushQueue(store, d)
    expect(d.uploadPhoto).toHaveBeenCalledTimes(1)
    expect((await store.all())[0]!.photoPath).toBe('producer-1/photo.jpg')

    await flushQueue(store, d)
    expect(d.uploadPhoto).toHaveBeenCalledTimes(1)
    expect(await store.all()).toHaveLength(0)
  })

  it('sends the path it already has rather than the bytes again', async () => {
    const store = memoryStore([queued({ photo: new Blob(['jpeg']), photoPath: 'producer-1/already.jpg' })])
    const d = deps()
    await flushQueue(store, d)
    expect(d.uploadPhoto).not.toHaveBeenCalled()
    expect(d.createCandidate.mock.calls[0]![0].photoPath).toBe('producer-1/already.jpg')
  })

  it('stops retrying an item that keeps failing, and keeps it', async () => {
    // Visible and stuck beats silently gone: the producer believes the
    // observation was recorded, and it was -- just not delivered.
    const store = memoryStore([queued({ attempts: GIVE_UP_AFTER })])
    const d = deps()
    const result = await flushQueue(store, d)
    expect(d.createCandidate).not.toHaveBeenCalled()
    expect(result).toEqual({ sent: 0, stuck: 1, remaining: 1 })
  })

  it('does not let a stuck item block the ones behind it', async () => {
    const store = memoryStore([
      queued({ attempts: GIVE_UP_AFTER, queuedAt: 1 }),
      queued({ summary: 'behind it', queuedAt: 2 }),
    ])
    const d = deps()
    const result = await flushQueue(store, d)
    expect(result.sent).toBe(1)
    expect(d.createCandidate.mock.calls[0]![0].summary).toBe('behind it')
  })

  it('carries the capture-time location through, untouched', async () => {
    // Recorded where the producer stood, not where the phone found a
    // signal twenty minutes later.
    const location = { latitude: 38.5, longitude: -122.8, accuracyM: 5 }
    const store = memoryStore([queued({ location })])
    const d = deps()
    await flushQueue(store, d)
    expect(d.createCandidate.mock.calls[0]![0].location).toEqual(location)
  })
})

describe('the small rules', () => {
  it('knows when something has been tried enough', () => {
    expect(isStuck(queued({ attempts: GIVE_UP_AFTER - 1 }))).toBe(false)
    expect(isStuck(queued({ attempts: GIVE_UP_AFTER }))).toBe(true)
  })

  it('orders by capture time without mutating what it was given', () => {
    const items = [queued({ queuedAt: 2 }), queued({ queuedAt: 1 })]
    expect(inCaptureOrder(items).map((i) => i.queuedAt)).toEqual([1, 2])
    expect(items.map((i) => i.queuedAt)).toEqual([2, 1])
  })
})
