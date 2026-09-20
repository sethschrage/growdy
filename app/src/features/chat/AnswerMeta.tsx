import { useEffect, useState } from 'react'
import { listProviders, listSources } from '@/data/dataSources'
import type { SourceKind } from '@/features/chat/thinking'

// What an answer looked at, and what it cost, kept under the answer
// itself.
//
// Both halves existed already and neither was ever shown. The reducer
// has accumulated a list of finished tools since streaming landed and
// nothing rendered it; the token count lived in the status line, which
// unmounts the moment the answer arrives -- so the only way to find out
// what a question cost was to pull the function logs.
//
// "Looked at" rather than "Sources" on purpose. The stream can prove a
// query ran. It cannot prove the answer rests on what came back, and a
// heading that claims the second thing would be the kind of confident
// overstatement this project keeps trying to design out.

/**
 * The producer's own name for their weather station, e.g. "Lockehaven
 * Field (Tempest)". Read once per session rather than per answer: four
 * rows that change when somebody adds a source, which is rare enough
 * that a stale label for one session costs nothing.
 */
let weatherLabelPromise: Promise<string | null> | null = null

function loadWeatherLabel(): Promise<string | null> {
  weatherLabelPromise ??= (async () => {
    try {
      const [sources, providers] = await Promise.all([listSources(), listProviders()])
      const weather = providers.filter((provider) => provider.category === 'weather')
      const mine = sources.filter(
        (source) => source.enabled && weather.some((provider) => provider.id === source.provider_id),
      )
      // Exactly one is nameable. With several, the relation name alone
      // does not say which was read -- weather_observations.source_id is
      // rarely in the projected columns -- and naming the wrong station
      // is worse than naming none.
      if (mine.length !== 1) return null
      const provider = weather.find((p) => p.id === mine[0].provider_id)
      return provider ? `${mine[0].name} (${provider.name})` : mine[0].name
    } catch {
      return null
    }
  })()
  return weatherLabelPromise
}

const LABELS: Record<SourceKind, string> = {
  weather: 'your weather station',
  vineyard: 'your vineyard records',
  memory: 'what it remembers',
  phenology: 'the phenology network',
  web: 'the web',
  photo: 'your photo',
}

export function AnswerMeta({
  sources,
  tokens,
}: {
  sources?: SourceKind[]
  tokens?: { total: number; cached: number }
}) {
  const [weatherLabel, setWeatherLabel] = useState<string | null>(null)

  useEffect(() => {
    if (!sources?.includes('weather')) return
    let cancelled = false
    loadWeatherLabel().then((label) => {
      if (!cancelled) setWeatherLabel(label)
    })
    return () => {
      cancelled = true
    }
  }, [sources])

  const looked = (sources ?? []).map((kind) =>
    kind === 'weather' ? (weatherLabel ?? LABELS.weather) : LABELS[kind],
  )

  if (looked.length === 0 && !tokens) return null

  return (
    <p className="answer-meta">
      {looked.length > 0 ? <span>Looked at: {looked.join(' · ')}</span> : null}
      {looked.length > 0 && tokens ? <span aria-hidden="true"> · </span> : null}
      {tokens ? (
        <span>
          {tokens.total.toLocaleString()} tokens
          {tokens.cached > 0 ? ` (${tokens.cached.toLocaleString()} cached)` : null}
        </span>
      ) : null}
    </p>
  )
}
