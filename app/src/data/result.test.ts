import { describe, expect, it } from 'vitest'
import { rpcArgs, unwrap, unwrapList } from '@/data/result'

const failure = { message: 'permission denied for table observations' }

describe('unwrap', () => {
  it('returns the data when there is no error', () => {
    expect(unwrap({ data: { id: 'a' }, error: null })).toEqual({ id: 'a' })
  })

  it('throws the database\'s own message', () => {
    // The message is what a producer ends up reading in half these
    // cases, so it has to survive rather than being replaced with
    // something generic here.
    expect(() => unwrap({ data: null, error: failure as never })).toThrow(
      'permission denied for table observations',
    )
  })

  it('throws even when data came back alongside the error', () => {
    // Postgrest can return both. Treating a partial result as success is
    // how a failed delete ends up looking like it worked.
    expect(() => unwrap({ data: [{ id: 'a' }], error: failure as never })).toThrow()
  })
})

describe('unwrapList', () => {
  it('passes rows through', () => {
    expect(unwrapList({ data: [{ id: 'a' }], error: null })).toEqual([{ id: 'a' }])
  })

  it('turns a null list into an empty one', () => {
    expect(unwrapList({ data: null, error: null })).toEqual([])
  })

  it('still throws on an error', () => {
    expect(() => unwrapList({ data: null, error: failure as never })).toThrow()
  })
})

describe('rpcArgs', () => {
  it('passes every argument through untouched, nulls included', () => {
    // The whole point: this is a type-level bridge, not a transform.
    // Dropping the null arguments would change which function PostgREST
    // resolves the call to, so the object it returns has to be the
    // object it was given.
    const args = { p_summary: 'a note', p_planting_id: null, p_photo_path: null }
    expect(rpcArgs(args)).toEqual(args)
    expect(Object.keys(rpcArgs(args))).toEqual(['p_summary', 'p_planting_id', 'p_photo_path'])
  })
})
