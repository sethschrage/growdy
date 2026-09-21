import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import type { QueuedObservation } from '@/lib/observationQueue'
import { ObservationLogView } from '@/features/observations/ObservationLogView'
import { forgetUnpromptedDeliveries } from '@/features/observations/useObservationQueue'

// The queued notice, which is the part of this screen with real
// behaviour -- and where both of tonight's reports came from.
//
// A press with no signal hangs for tens of seconds rather than failing,
// so the button has to say it is working and refuse a second press. And
// a flush that gets through empties the queue without putting anything
// in the log below it -- what it sent is a candidate awaiting review
// (0030) -- so it has to say where the observation went.

const createObservationCandidate = vi.fn()
vi.mock('@/data/observations', () => ({
  createObservationCandidate: (...args: unknown[]) => createObservationCandidate(...args),
  listObservations: async () => [],
  deleteObservation: async () => {},
}))
vi.mock('@/data/profile', () => ({ fetchProducerId: async () => 'producer-1' }))
// Mocked for the same reason ObservationForm.test.tsx mocks it: the
// queue imports the photo helpers, which build the Supabase client at
// module load and throw without a .env -- fine locally, fatal in CI.
vi.mock('@/lib/photo', () => ({
  uploadPhoto: async () => 'producer-1/photo.jpg',
  signedPhotoUrl: async () => null,
}))

// The queue's store is the one thing a test cannot otherwise reach:
// jsdom has no IndexedDB, so the hook falls back to an in-memory store
// it builds for itself, and nothing outside can put a capture into it.
// Only the store is replaced -- flushQueue, isStuck and the capture
// ordering are the real ones, so what these tests watch is the delivery
// path the phone runs.
const held = vi.hoisted(() => ({ queued: [] as import('@/lib/observationQueue').QueuedObservation[] }))
vi.mock('@/lib/observationQueue', async () => {
  const actual = await vi.importActual<typeof import('@/lib/observationQueue')>('@/lib/observationQueue')
  return {
    ...actual,
    canQueue: () => false,
    memoryStore: () => ({
      all: async () => [...held.queued],
      put: async (item: QueuedObservation) => {
        held.queued = [...held.queued.filter((q) => q.clientId !== item.clientId), item]
      },
      remove: async (clientId: string) => {
        held.queued = held.queued.filter((q) => q.clientId !== clientId)
      },
    }),
  }
})

const session = { user: { id: 'user-1' } } as Session

function capture(overrides: Partial<QueuedObservation> = {}): QueuedObservation {
  return {
    clientId: 'capture-1',
    summary: 'Powdery mildew starting on the north rows',
    note: 'Powdery mildew starting on the north rows',
    observedDate: '2026-09-18',
    plantingId: null,
    conversationId: null,
    source: 'producer',
    photo: null,
    location: null,
    photoPath: null,
    queuedAt: 1,
    attempts: 0,
    lastError: null,
    ...overrides,
  }
}

/**
 * Opens the log with `items` captured and still no signal. The flush
 * this screen runs on open fails, which is what leaves the notice on
 * screen with a button for the producer to press. Resolves once it is
 * there.
 */
async function openWithNoSignal(items: QueuedObservation[]) {
  held.queued = [...items]
  createObservationCandidate.mockRejectedValue(new Error('Load failed'))
  render(<ObservationLogView session={session} onClose={() => {}} />)
  await screen.findByText(/waiting for signal/)
}

beforeEach(() => {
  held.queued = []
  createObservationCandidate.mockReset()
  // The unprompted-delivery count lives at module level, outside React,
  // so it survives unmount and is shared with every other test file in
  // this worker -- including ObservationForm's, which mounts the same
  // hook. A count left over from one of them renders the "Your signal
  // came back" notice in a test that never delivered anything. This is
  // what forgetUnpromptedDeliveries was written for; until now nothing
  // called it, so the guard existed without being installed.
  forgetUnpromptedDeliveries()
})

describe('the queued notice', () => {
  it('says it is sending while it sends', async () => {
    // Without this the button is unchanged for as long as the request
    // hangs, which with no signal is tens of seconds of a screen that
    // looks like it never heard the press.
    await openWithNoSignal([capture()])
    createObservationCandidate.mockReturnValue(new Promise(() => {}))

    fireEvent.click(screen.getByText('Try sending now'))

    const button = await screen.findByText('Sending...')
    expect(button).toHaveProperty('disabled', true)
  })

  it('will not start a second flush while one is still running', async () => {
    // The hung send got pressed again in the field. Two flushes over one
    // queue upload the same photo twice, neither having written the path
    // back yet, and the second copy is paid for and referenced by
    // nothing.
    await openWithNoSignal([capture()])
    createObservationCandidate.mockReturnValue(new Promise(() => {}))
    const beforePress = createObservationCandidate.mock.calls.length

    const button = screen.getByText('Try sending now')
    fireEvent.click(button)
    await screen.findByText('Sending...')
    fireEvent.click(button)

    expect(createObservationCandidate.mock.calls.length).toBe(beforePress + 1)
  })

  it('says where the observation went once it gets through', async () => {
    // The notice disappearing was the whole of the old confirmation, and
    // a flushed capture does not appear in the log below either -- it is
    // a candidate until somebody approves it -- so the producer watched
    // it leave one screen and arrive on none.
    await openWithNoSignal([capture()])
    createObservationCandidate.mockResolvedValue('candidate-1')

    fireEvent.click(screen.getByText('Try sending now'))

    expect(await screen.findByText(/Sent for review/)).toBeTruthy()
    expect(screen.queryByText(/waiting for signal/)).toBeNull()
  })

  it('counts what it sent, so two captures are not reported as one', async () => {
    await openWithNoSignal([
      capture({ clientId: 'capture-1', queuedAt: 1 }),
      capture({ clientId: 'capture-2', queuedAt: 2, summary: 'Deer damage on the fence line' }),
    ])
    createObservationCandidate.mockResolvedValue('candidate-1')

    fireEvent.click(screen.getByText('Try sending now'))

    expect(await screen.findByText(/Sent for review \(2\)/)).toBeTruthy()
  })

  it('claims nothing when the flush delivered nothing', async () => {
    // Still no signal is not a success, and a "sent for review" left
    // over from an attempt that failed would be a worse version of this
    // bug rather than a fix for it.
    await openWithNoSignal([capture()])

    fireEvent.click(screen.getByText('Try sending now'))

    await screen.findByText('Try sending now')
    expect(screen.queryByText(/Sent for review/)).toBeNull()
  })
})
