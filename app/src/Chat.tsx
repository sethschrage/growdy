import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabaseClient'
import { PixelArrow, PixelCloud, PixelThumbDown, PixelThumbUp } from './icons'
import { useConversationLog } from './useConversationLog'
import type { ChatMessage } from './chatTypes'

type Draft = {
  plot: string
  row_number: number
  position: number
  note: string
  observed_date: string | null
}

type PlantingMatch = { id: string; label: string | null }

type PlantingRow = {
  label: string | null
  plot: string
  row_number: number | null
  position: number | null
  variety: string | null
  scion: string | null
  rootstock: string | null
  nickname: string | null
  dead_date: string | null
  removed_date: string | null
  removed_reason: string | null
}

function describePlanting(row: PlantingRow): string {
  const identityParts: string[] = []
  if (row.variety) identityParts.push(row.variety)
  if (row.scion || row.rootstock) {
    const graft = [row.scion && `scion ${row.scion}`, row.rootstock && `rootstock ${row.rootstock}`]
      .filter(Boolean)
      .join(', ')
    identityParts.push(`(${graft})`)
  }
  if (row.nickname) identityParts.push(`"${row.nickname}"`)
  const identity = identityParts.length > 0 ? identityParts.join(' ') : 'an unidentified plant'
  const location = row.label ?? `Plot ${row.plot}, Row ${row.row_number}, Position ${row.position}`

  let answer = `${location}: ${identity}.`
  if (row.dead_date) answer += ` Marked dead on ${row.dead_date}.`
  if (row.removed_date) {
    answer += ` Removed on ${row.removed_date}${row.removed_reason ? ` (${row.removed_reason})` : ''}.`
  }
  return answer
}

function describeStatuses(rows: { position: number; status: string }[], statusFilter?: string): string {
  if (rows.length === 0) {
    return statusFilter ? `No positions there are ${statusFilter}.` : `No positions found there.`
  }
  const sorted = [...rows].sort((a, b) => a.position - b.position)
  if (statusFilter) {
    return `${statusFilter} positions: ${sorted.map((r) => r.position).join(', ')}.`
  }
  return `Status by position: ${sorted.map((r) => `${r.position} (${r.status})`).join(', ')}.`
}

export function Chat({ session }: { session: Session }) {
  const [producerId, setProducerId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [match, setMatch] = useState<PlantingMatch | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { log, conversationId, markSubmission } = useConversationLog(session)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, draft])

  useEffect(() => {
    supabase
      .from('profiles')
      .select('producer_id')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setProducerId(data?.producer_id ?? null))
  }, [session.user.id])

  async function send(event: FormEvent) {
    event.preventDefault()
    if (!input.trim() || sending) return

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: input }]
    setMessages(nextMessages)
    log(nextMessages)
    setInput('')
    setSending(true)
    setError(null)

    const { data, error } = await supabase.functions.invoke('chat', {
      body: { messages: nextMessages },
    })

    if (error) {
      setSending(false)
      setError(error.message)
      return
    }

    if (data.type === 'error') {
      setSending(false)
      setError(data.message)
      return
    }

    if (data.type === 'question') {
      setSending(false)
      const withAssistant = [...nextMessages, { role: 'assistant' as const, content: data.text }]
      setMessages(withAssistant)
      log(withAssistant)
      return
    }

    if (data.tool === 'submit_observation_draft') {
      const { plot, row_number, position, note, observed_date } = data
      const { data: found, error: lookupError } = await supabase
        .from('planting_readable')
        .select('id, label')
        .ilike('plot', plot)
        .eq('row_number', row_number)
        .eq('position', position)

      setSending(false)

      if (lookupError) {
        setError(lookupError.message)
        return
      }

      if (!found || found.length !== 1) {
        const withAssistant = [
          ...nextMessages,
          {
            role: 'assistant' as const,
            content: `I couldn't find exactly one planting matching Plot ${plot}, Row ${row_number}, Position ${position} -- can you double check?`,
          },
        ]
        setMessages(withAssistant)
        log(withAssistant)
        return
      }

      setDraft({ plot, row_number, position, note, observed_date: observed_date ?? null })
      setMatch(found[0])
      return
    }

    const { query_type, variety, parcel, plot, row_number, position, status } = data

    if (query_type === 'variety_lookup') {
      const columns =
        'id, parcel, label, plot, row_number, position, variety, scion, rootstock, nickname, dead_date, removed_date, removed_reason'
      const [byVariety, byScion, byRootstock] = await Promise.all([
        supabase.from('planting_readable').select(columns).ilike('variety', `%${variety}%`),
        supabase.from('planting_readable').select(columns).ilike('scion', `%${variety}%`),
        supabase.from('planting_readable').select(columns).ilike('rootstock', `%${variety}%`),
      ])

      setSending(false)

      const varietyError = byVariety.error ?? byScion.error ?? byRootstock.error
      if (varietyError) {
        setError(varietyError.message)
        return
      }

      const seen = new Set<string>()
      const matches: (PlantingRow & { id: string; parcel: string })[] = []
      for (const row of [...(byVariety.data ?? []), ...(byScion.data ?? []), ...(byRootstock.data ?? [])]) {
        if (!seen.has(row.id)) {
          seen.add(row.id)
          matches.push(row)
        }
      }
      matches.sort((a, b) => (a.parcel + a.plot).localeCompare(b.parcel + b.plot))

      const answer =
        matches.length === 0
          ? `Nothing matches "${variety}".`
          : matches.map((m) => `${m.parcel} -- ${describePlanting(m)}`).join('\n')

      const withAssistant = [...nextMessages, { role: 'assistant' as const, content: answer }]
      setMessages(withAssistant)
      log(withAssistant)
      return
    }

    if (query_type === 'parcel_lookup') {
      const { data: plantings, error: plantingError } = await supabase
        .from('planting_readable')
        .select(
          'label, plot, row_number, position, variety, scion, rootstock, nickname, dead_date, removed_date, removed_reason',
        )
        .ilike('parcel', parcel)
        .order('plot')
        .order('row_number')
        .order('position')

      setSending(false)

      if (plantingError) {
        setError(plantingError.message)
        return
      }

      const answer =
        !plantings || plantings.length === 0
          ? `Nothing's recorded in Parcel ${parcel} yet.`
          : plantings.map(describePlanting).join('\n')

      const withAssistant = [...nextMessages, { role: 'assistant' as const, content: answer }]
      setMessages(withAssistant)
      log(withAssistant)
      return
    }

    const { data: rowsMatch, error: rowError } = await supabase
      .from('plot_rows')
      .select('id, plots!inner(name)')
      .eq('number', row_number)
      .ilike('plots.name', plot)

    setSending(false)

    if (rowError) {
      setError(rowError.message)
      return
    }

    if (!rowsMatch || rowsMatch.length !== 1) {
      const withAssistant = [
        ...nextMessages,
        {
          role: 'assistant' as const,
          content: `I couldn't find exactly one row matching Plot ${plot}, Row ${row_number} -- can you double check?`,
        },
      ]
      setMessages(withAssistant)
      log(withAssistant)
      return
    }

    if (query_type === 'planting_lookup') {
      const { data: planting, error: plantingError } = await supabase
        .from('planting_readable')
        .select(
          'label, plot, row_number, position, variety, scion, rootstock, nickname, dead_date, removed_date, removed_reason',
        )
        .ilike('plot', plot)
        .eq('row_number', row_number)
        .eq('position', position)

      if (plantingError) {
        setError(plantingError.message)
        return
      }

      const answer =
        !planting || planting.length === 0
          ? `Nothing's recorded at Plot ${plot}, Row ${row_number}, Position ${position}.`
          : describePlanting(planting[0])

      const withAssistant = [...nextMessages, { role: 'assistant' as const, content: answer }]
      setMessages(withAssistant)
      log(withAssistant)
      return
    }

    const plotRowId = rowsMatch[0].id
    let statusQuery = supabase.from('position_status').select('position, status').eq('plot_row_id', plotRowId)
    if (status) statusQuery = statusQuery.eq('status', status)

    const { data: statuses, error: statusError } = await statusQuery

    if (statusError) {
      setError(statusError.message)
      return
    }

    const withAssistant = [
      ...nextMessages,
      { role: 'assistant' as const, content: describeStatuses(statuses ?? [], status) },
    ]
    setMessages(withAssistant)
    log(withAssistant)
  }

  async function confirmSubmit() {
    if (!draft || !match || !producerId) return
    setSending(true)
    const { error } = await supabase.from('observations').insert({
      planting_id: match.id,
      producer_id: producerId,
      note: draft.note,
      observed_date: draft.observed_date,
      status: 'pending',
      conversation_id: conversationId.current,
    })
    setSending(false)
    if (error) {
      setError(error.message)
      return
    }
    markSubmission()
    setDraft(null)
    setMatch(null)
    const withConfirmation = [
      ...messages,
      { role: 'assistant' as const, content: 'Submitted for review. Thank you.' },
    ]
    setMessages(withConfirmation)
    log(withConfirmation)
  }

  function cancelDraft() {
    setDraft(null)
    setMatch(null)
  }

  function setFeedback(index: number, feedback: 'up' | 'down') {
    setMessages((prev) => {
      const updated = prev.map((m, i) =>
        i === index ? { ...m, feedback: m.feedback === feedback ? undefined : feedback } : m,
      )
      log(updated)
      return updated
    })
  }

  return (
    <div className="chat">
      <PixelCloud width={80} top="6%" left="10%" duration="9s" />
      <PixelCloud width={64} top="14%" left="66%" duration="7s" />
      <div className="star" style={{ top: '4%', left: '40%', animationDelay: '0s' }} />
      <div className="star" style={{ top: '10%', left: '82%', animationDelay: '1s' }} />
      <div className="chat-messages">
        <div className="chat-messages-inner">
          {messages.map((m, i) => (
            <div key={i} className={`chat-message-wrap chat-message-wrap--${m.role}`}>
              <p className={`chat-message chat-message-${m.role}`}>{m.content}</p>
              {m.role === 'assistant' && (
                <div className="feedback-row">
                  <button
                    type="button"
                    className={`feedback-button${m.feedback === 'up' ? ' feedback-button--selected' : ''}`}
                    aria-label="Good response"
                    aria-pressed={m.feedback === 'up'}
                    onClick={() => setFeedback(i, 'up')}
                  >
                    <PixelThumbUp size={14} />
                  </button>
                  <button
                    type="button"
                    className={`feedback-button feedback-button--down${m.feedback === 'down' ? ' feedback-button--selected' : ''}`}
                    aria-label="Bad response"
                    aria-pressed={m.feedback === 'down'}
                    onClick={() => setFeedback(i, 'down')}
                  >
                    <PixelThumbDown size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
          {error && <p className="error">{error}</p>}
          {draft && match && (
            <div className="chat-confirm">
              <p>
                Log this on{' '}
                {match.label ?? `Plot ${draft.plot}, Row ${draft.row_number}, Position ${draft.position}`}:
                {' '}"{draft.note}"?
              </p>
              <div className="chat-confirm-actions">
                <button type="button" onClick={confirmSubmit} disabled={sending}>
                  Confirm
                </button>
                <button type="button" onClick={cancelDraft}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
      {!draft && (
        <form className="chat-input" onSubmit={send}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question or log what you observed..."
          />
          <button type="submit" className="icon-button" disabled={sending} aria-label="Send">
            <PixelArrow size={18} />
          </button>
        </form>
      )}
    </div>
  )
}
