// What the knowledge screen calls things.
//
// The producer's words: "just call it knowledge -- we call them
// knowledge categories but that doesn't have to be in the UI." The
// taxonomy is real and stays (docs/decisions/0019): a category holds
// providers, a provider holds sources. It is the labelling that was
// leaking the schema onto the screen.
//
// data_providers.category is an open-vocabulary text column, so the
// values in it are whatever was inserted -- today "weather",
// "phenology", "location", "web". Lowercase database strings rendered
// straight into a heading read as debug output, and there is no
// display-name column to read instead (adding one would be a migration
// for a presentation problem).

/**
 * A category's name as a person would write it.
 *
 * A rule rather than a lookup table, so a category nobody has thought of
 * yet still renders like a name instead of like a column value. Any
 * category that wants a label this rule cannot produce -- an acronym, a
 * proper noun with internal capitals -- is the point at which this
 * should become a map, and not before.
 */
export function categoryLabel(category: string): string {
  const words = category.replace(/[_-]+/g, ' ').trim()
  if (!words) return ''
  return words[0].toUpperCase() + words.slice(1)
}

/**
 * Providers whose screen is a panel of their own rather than a list of
 * sources.
 *
 * Named once because two things read it and they have to agree: the
 * branch that decides which panel to render, and the title above it.
 * Titling one of these "Device sources" would be a lie -- there is no
 * source list under it to be the plural of.
 */
export const PROVIDERS_WITHOUT_SOURCE_LISTS = [
  'Device',
  'USA National Phenology Network',
  'Anthropic Web Search',
] as const

export function hasSourceList(providerName: string): boolean {
  return !PROVIDERS_WITHOUT_SOURCE_LISTS.some((name) => name === providerName)
}
