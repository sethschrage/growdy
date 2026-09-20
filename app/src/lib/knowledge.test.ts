import { describe, expect, it } from 'vitest'
import { categoryLabel, hasSourceList, PROVIDERS_WITHOUT_SOURCE_LISTS } from '@/lib/knowledge'

describe('naming a category', () => {
  it('capitalises the categories that exist today', () => {
    expect(categoryLabel('weather')).toBe('Weather')
    expect(categoryLabel('phenology')).toBe('Phenology')
    expect(categoryLabel('location')).toBe('Location')
    expect(categoryLabel('web')).toBe('Web')
  })

  it('reads an underscored category as words', () => {
    // category is open-vocabulary text, so this is a shape somebody will
    // eventually insert.
    expect(categoryLabel('soil_moisture')).toBe('Soil moisture')
    expect(categoryLabel('disease-pressure')).toBe('Disease pressure')
  })

  it('leaves a name that is already written like one alone', () => {
    expect(categoryLabel('Weather')).toBe('Weather')
  })

  it('does not swallow the rest of the word', () => {
    expect(categoryLabel('a')).toBe('A')
    expect(categoryLabel('ab')).toBe('Ab')
  })

  it('answers nothing for nothing, rather than crashing a heading', () => {
    expect(categoryLabel('')).toBe('')
    expect(categoryLabel('   ')).toBe('')
  })

  it('collapses a run of separators rather than leaving a gap', () => {
    expect(categoryLabel('soil__moisture')).toBe('Soil moisture')
  })
})

describe('which providers have a list of sources under them', () => {
  it('says yes for a provider whose screen is a source list', () => {
    expect(hasSourceList('Tempest')).toBe(true)
  })

  it('says no for every provider that renders its own panel instead', () => {
    for (const name of PROVIDERS_WITHOUT_SOURCE_LISTS) {
      expect(hasSourceList(name)).toBe(false)
    }
  })

  it('matches the whole name, not a piece of it', () => {
    // "Device" is on the list; "Device Manager" would be a different
    // provider and would have its own sources.
    expect(hasSourceList('Device Manager')).toBe(true)
  })
})
