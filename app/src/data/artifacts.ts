import { supabase } from '@/lib/supabaseClient'
import { unwrap, unwrapList } from '@/data/result'

// Saved graphics (0021) and the links that share them (0027).

export type Artifact = {
  id: string
  title: string | null
  content: string
  created_at: string
}

export type PublicArtifact = {
  title: string | null
  content: string
  created_at: string
}

export async function listArtifacts(): Promise<Artifact[]> {
  return unwrapList(
    await supabase
      .from('artifacts')
      .select('id, title, content, created_at')
      .order('created_at', { ascending: false }),
  )
}

// Saving a graphic the model drew, so it can be shared. Stores the raw
// model output rather than the sanitized copy (0027): every read
// sanitizes, so a stored "already safe" flag would be a claim nobody
// re-checks.
export async function createArtifact(artifact: {
  producerId: string
  conversationId: string | null
  content: string
}): Promise<string> {
  const row = unwrap(
    await supabase
      .from('artifacts')
      .insert({
        producer_id: artifact.producerId,
        conversation_id: artifact.conversationId,
        content: artifact.content,
      })
      .select('id')
      .single(),
  )
  // .single() with .select() after an insert returns the row or an
  // error, never both null -- but the generated types can't say that,
  // and a silent '' would become a link to /a/.
  if (!row) throw new Error('The graphic was not saved.')
  return row.id
}

export async function deleteArtifact(id: string): Promise<void> {
  unwrap(await supabase.from('artifacts').delete().eq('id', id))
}

// The one RPC an anonymous caller can reach (0027). Returns null for an
// id that doesn't resolve, which is the ordinary answer for a link that
// was revoked or mistyped -- the caller renders "not found", not an
// error.
export async function fetchPublicArtifact(id: string): Promise<PublicArtifact | null> {
  const rows = unwrapList(await supabase.rpc('get_public_artifact', { p_id: id }))
  return rows[0] ?? null
}
