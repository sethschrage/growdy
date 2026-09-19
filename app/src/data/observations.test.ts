import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fake } from '@/test/fakeSupabase'
import {
  confirmObservationCandidate,
  createObservationCandidate,
  deleteObservation,
  dismissObservationCandidate,
  listObservations,
  listPendingCandidates,
} from '@/data/observations'

vi.mock('@/lib/supabaseClient', async () => ({
  supabase: (await import('@/test/fakeSupabase')).fakeClient,
}))

beforeEach(() => fake.reset())

describe('listObservations', () => {
  it('reads the log newest first', async () => {
    fake.returns([{ id: 'o1' }])
    expect(await listObservations()).toEqual([{ id: 'o1' }])
    const query = fake.only()
    expect(query.name).toBe('observations')
    expect(query.chain).toContainEqual(['order', ['created_at', { ascending: false }]])
  })

  it('asks for photo_metadata, which is where a photo path lives', async () => {
    // Named for what 0009 reserved the column as, not for what 0030 put
    // in it. Leave it out of the select and every observation renders
    // without its photo, silently.
    fake.returns([])
    await listObservations()
    expect(String(fake.only().chain[0][1][0])).toContain('photo_metadata')
  })

  it('throws when the read fails, rather than showing an empty log', async () => {
    fake.fails('network error')
    await expect(listObservations()).rejects.toThrow('network error')
  })
})

describe('deleteObservation', () => {
  it('deletes exactly the row it was given', async () => {
    await deleteObservation('o1')
    const query = fake.only()
    expect(query.name).toBe('observations')
    expect(query.chain).toContainEqual(['delete', []])
    expect(query.chain).toContainEqual(['eq', ['id', 'o1']])
  })

  it('throws on failure', async () => {
    // Deletion is the correction mechanism after approval (0030), so a
    // delete that quietly does nothing leaves a record the producer
    // believes they removed.
    fake.fails('row level security')
    await expect(deleteObservation('o1')).rejects.toThrow('row level security')
  })
})

describe('listPendingCandidates', () => {
  it('asks only for pending rows', async () => {
    // Without this filter the review queue shows rows that have already
    // been confirmed or dismissed, and confirming one again is a
    // duplicate observation.
    fake.returns([])
    await listPendingCandidates()
    expect(fake.chainArgs('eq')).toEqual([['status', 'pending']])
  })
})

describe('createObservationCandidate', () => {
  it('sends every argument, including the ones that are null', async () => {
    fake.returns('candidate-1')
    const id = await createObservationCandidate({ summary: 'Leaf damage', source: 'producer' })

    expect(id).toBe('candidate-1')
    const query = fake.only()
    expect(query.kind).toBe('rpc')
    expect(query.name).toBe('create_observation_candidate')
    // PostgREST resolves a function by the argument names it receives,
    // so the unset ones have to arrive as nulls rather than vanish.
    expect(query.args[0]).toEqual({
      p_summary: 'Leaf damage',
      p_note: null,
      p_observed_date: null,
      p_planting_id: null,
      p_photo_path: null,
      p_conversation_id: null,
      p_source: 'producer',
      p_photo_latitude: null,
      p_photo_longitude: null,
      p_photo_accuracy_m: null,
    })
  })

  it('carries the photo path, its date and where the camera was', async () => {
    fake.returns('candidate-2')
    await createObservationCandidate({
      summary: 'Beetle damage',
      note: 'Chewed margins on the east side',
      observedDate: '2026-09-18',
      plantingId: 'planting-1',
      photoPath: 'producer-1/abc.jpg',
      conversationId: 'conversation-1',
      source: 'photo',
      photoLatitude: 38.41,
      photoLongitude: -122.4383,
      photoAccuracyM: 12,
    })

    expect(fake.only().args[0]).toMatchObject({
      p_photo_path: 'producer-1/abc.jpg',
      p_observed_date: '2026-09-18',
      p_planting_id: 'planting-1',
      // Where the camera was and what the photo is about are different
      // facts, and both are recorded.
      p_photo_latitude: 38.41,
      p_photo_longitude: -122.4383,
      p_photo_accuracy_m: 12,
      p_source: 'photo',
    })
  })
})

describe('confirming and dismissing', () => {
  it('confirms through the one transactional function', async () => {
    // Not an insert plus an update from the client: 0030 replaced those
    // with this because a failure between them left an observation whose
    // candidate still read pending.
    await confirmObservationCandidate('candidate-1')
    const query = fake.only()
    expect(query.kind).toBe('rpc')
    expect(query.name).toBe('confirm_observation_candidate')
    expect(query.args[0]).toEqual({ p_candidate_id: 'candidate-1' })
  })

  it('reports a failed confirm instead of swallowing it', async () => {
    fake.fails('candidate not found')
    await expect(confirmObservationCandidate('candidate-1')).rejects.toThrow('candidate not found')
  })

  it('stamps a dismissal with the time it was reviewed', async () => {
    await dismissObservationCandidate('candidate-1')
    const [[patch]] = fake.chainArgs('update') as [[{ status: string; reviewed_at: string }]]
    expect(patch.status).toBe('dismissed')
    expect(Number.isNaN(Date.parse(patch.reviewed_at))).toBe(false)
    expect(fake.chainArgs('eq')).toEqual([['id', 'candidate-1']])
  })
})
