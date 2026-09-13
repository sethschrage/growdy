import { useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabaseClient'
import { PixelArrow, PixelCloud } from './icons'
import { useConversationLog } from './useConversationLog'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

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

export function DataQuestionChat({ session }: { session: Session }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { log } = useConversationLog(session, 'ask')

  async function send(event: FormEvent) {
    event.preventDefault()
    if (!input.trim() || sending) return

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: input }]
    setMessages(nextMessages)
    log(nextMessages)
    setInput('')
    setSending(true)
    setError(null)

    const { data, error } = await supabase.functions.invoke('data-qa', {
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

    const { query_type, parcel, plot, row_number, position, status } = data

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

      setMessages((m) => [...m, { role: 'assistant', content: answer }])
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

  return (
    <div className="chat">
      <PixelCloud width={80} top="6%" left="10%" duration="9s" />
      <PixelCloud width={64} top="14%" left="66%" duration="7s" />
      <div className="star" style={{ top: '4%', left: '40%', animationDelay: '0s' }} />
      <div className="star" style={{ top: '10%', left: '82%', animationDelay: '1s' }} />
      <div className="chat-messages">
        {messages.map((m, i) => (
          <p key={i} className={`chat-message chat-message-${m.role}`}>
            {m.content}
          </p>
        ))}
        {error && <p className="error">{error}</p>}
      </div>
      <form className="chat-input" onSubmit={send}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your data..."
        />
        <button type="submit" className="icon-button" disabled={sending} aria-label="Send">
          <PixelArrow size={18} />
        </button>
      </form>
    </div>
  )
}
