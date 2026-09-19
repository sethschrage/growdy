import { supabase } from '@/lib/supabaseClient'
import { unwrap, unwrapList } from '@/data/result'

// The physical vineyard: parcels, the plots inside them, the rows inside
// those, and the plantings in the rows (0002).
//
// This is the module the map will read. Nothing here knows about
// geometry yet -- plantings carry a point (planting.location) and
// parcels and plots carry nothing at all -- but when they do, the map
// and the tree below should be reading the same rows through the same
// functions rather than two queries that drift apart.

export type Parcel = { id: string; name: string }
export type Plot = { id: string; name: string }

export type PlotRow = {
  id: string
  number: number
  length_meters: number | null
  spacing_meters: number | null
  end_post_count: number | null
}

export type RowPlanting = {
  id: string
  position: number | null
  nickname: string | null
  variety: string | null
  scion: string | null
  rootstock: string | null
  dead_date: string | null
}

// Everything the detail sheet shows about one planting. A wider read
// than the tree's, and from the same view, so the names are resolved
// rather than being ids into plant_types.
export type PlantingDetails = {
  id: string
  label: string | null
  nickname: string | null
  parcel: string
  plot: string | null
  row_number: number | null
  position: number | null
  variety: string | null
  scion: string | null
  rootstock: string | null
  category: string | null
  planted_date: string | null
  dead_date: string | null
  removed_date: string | null
  removed_reason: string | null
}

export type PlantingSearchResult = {
  id: string
  label: string | null
  nickname: string | null
  variety: string | null
  scion: string | null
  parcel: string
}

const PLANTING_DETAIL_COLUMNS =
  'id, label, nickname, parcel, plot, row_number, position, variety, scion, rootstock, category, planted_date, dead_date, removed_date, removed_reason'

export async function fetchPlanting(id: string): Promise<PlantingDetails> {
  const row = unwrap(
    await supabase.from('planting_readable').select(PLANTING_DETAIL_COLUMNS).eq('id', id).single(),
  )
  return row as PlantingDetails
}

export async function listParcels(): Promise<Parcel[]> {
  return unwrapList(await supabase.from('parcels').select('id, name').order('name'))
}

export async function listPlots(parcelId: string): Promise<Plot[]> {
  return unwrapList(
    await supabase.from('plots').select('id, name').eq('parcel_id', parcelId).order('name'),
  )
}

export async function listPlotRows(plotId: string): Promise<PlotRow[]> {
  return unwrapList(
    await supabase
      .from('plot_rows')
      .select('id, number, length_meters, spacing_meters, end_post_count')
      .eq('plot_id', plotId)
      .order('number'),
  )
}

export async function updatePlotRow(
  id: string,
  measurements: Partial<Pick<PlotRow, 'length_meters' | 'spacing_meters' | 'end_post_count'>>,
): Promise<void> {
  unwrap(await supabase.from('plot_rows').update(measurements).eq('id', id))
}

// Reads the readable view rather than the planting table, because the
// tree shows names -- variety, scion, rootstock -- and the table holds
// ids into plant_types (0018).
//
// Matched by plot *name* and row number rather than by row id, which is
// what the view exposes. Worth knowing when plots get renamed.
export async function listRowPlantings(
  plotName: string,
  rowNumber: number,
): Promise<RowPlanting[]> {
  const rows = unwrapList(
    await supabase
      .from('planting_readable')
      .select('id, position, nickname, variety, scion, rootstock, dead_date')
      .eq('plot', plotName)
      .eq('row_number', rowNumber)
      .is('removed_date', null)
      .order('position'),
  )
  return rows as RowPlanting[]
}

// Typeahead for the observation form. Removed plantings are excluded --
// an observation is being attached to something that is still there.
export async function searchPlantings(term: string): Promise<PlantingSearchResult[]> {
  const trimmed = term.trim()
  if (!trimmed) return []
  // The `or` filter is a PostgREST expression string, so a term
  // containing a comma, a parenthesis or a wildcard would change its
  // structure rather than being matched literally. Stripped rather than
  // escaped: PostgREST has no escape for these inside or(), and none of
  // them can appear in a real label or variety name.
  const safe = trimmed.replace(/[,()%*]/g, '')
  if (!safe) return []
  const rows = unwrapList(
    await supabase
      .from('planting_readable')
      .select('id, label, nickname, variety, scion, parcel')
      .is('removed_date', null)
      .or(
        `label.ilike.%${safe}%,nickname.ilike.%${safe}%,variety.ilike.%${safe}%,scion.ilike.%${safe}%`,
      )
      .order('label')
      .limit(20),
  )
  return rows as PlantingSearchResult[]
}
