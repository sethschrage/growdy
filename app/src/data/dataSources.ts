import type { Json } from '@/data/schema'
import { supabase } from '@/lib/supabaseClient'
import { rpcArgs, unwrap, unwrapList } from '@/data/result'

// Knowledge Categories (0019): what the chat is allowed to draw on, and
// the per-producer connections to it.

export type DataProvider = {
  id: string
  category: string
  name: string
  enabled: boolean
}

// Shape used only by the "Device" provider's config -- a geolocation
// reading has no credential and no backfill, just the latest known
// position, overwritten in place each time it's refreshed.
export type DeviceLocationConfig = {
  latitude: number
  longitude: number
  captured_at: string
}

export type DataSource = {
  id: string
  provider_id: string
  name: string
  external_id: string
  enabled: boolean
  config: DeviceLocationConfig | Record<string, unknown> | null
  backfill_status: 'pending' | 'in_progress' | 'complete' | null
  last_synced_at: string | null
  last_error: string | null
  last_warning: string | null
}

const SOURCE_COLUMNS =
  'id, provider_id, name, external_id, enabled, config, backfill_status, last_synced_at, last_error, last_warning'

export async function listProviders(): Promise<DataProvider[]> {
  return unwrapList(
    await supabase.from('data_providers').select('id, category, name, enabled').eq('enabled', true),
  )
}

export async function listSources(): Promise<DataSource[]> {
  const rows = unwrapList(
    await supabase.from('data_sources').select(SOURCE_COLUMNS).order('created_at', { ascending: false }),
  )
  return rows as unknown as DataSource[]
}

// Sources with no credential to keep: a public dataset, or this device's
// own position. A source that needs a secret goes through the
// add-weather-source Edge Function instead, because the secret must not
// pass through the client's own insert -- see addWeatherSource below.
export async function addDataSource(source: {
  providerId: string
  name: string
  externalId: string
  config?: DeviceLocationConfig | null
}): Promise<string | null> {
  return unwrap(
    await supabase.rpc(
      'add_data_source',
      rpcArgs({
        p_provider_id: source.providerId,
        p_name: source.name,
        p_external_id: source.externalId,
        p_config: (source.config ?? null) as Json | null,
      }),
    ),
  )
}

export async function updateSourceConfig(
  id: string,
  config: DeviceLocationConfig,
): Promise<void> {
  unwrap(await supabase.from('data_sources').update({ config }).eq('id', id))
}

export async function setSourceEnabled(id: string, enabled: boolean): Promise<void> {
  unwrap(await supabase.from('data_sources').update({ enabled }).eq('id', id))
}

export async function deleteSource(id: string): Promise<void> {
  unwrap(await supabase.from('data_sources').delete().eq('id', id))
}

// The Edge Function path, for a source whose credential has to be
// stored in the vault rather than in a column the client can read back.
// Its errors arrive as an HTTP response rather than a Postgrest error,
// and the useful message is in the body -- so this unpacks that instead
// of going through unwrap().
export async function addWeatherSource(source: {
  providerId: string
  name: string
  stationId: string
  secret: string
}): Promise<void> {
  const { error } = await supabase.functions.invoke('add-weather-source', {
    body: {
      provider_id: source.providerId,
      name: source.name,
      station_id: source.stationId,
      secret: source.secret,
    },
  })
  if (!error) return

  let message = error.message
  try {
    const body = await (error as { context: Response }).context.json()
    if (body?.error) message = body.error
  } catch {
    // The context wasn't a JSON response -- fall back to error.message.
  }
  throw new Error(message)
}
