import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabaseClient'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

type Draft = {
  plot: string
  row_number: number
  position: number
  note: string
  observed_date: string | null
}

type PlantingMatch = { id: string; label: string | null }

export function ObservationChat({ session }: { session: Session }) {
  const [producerId, setProducerId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [match, setMatch] = useState<PlantingMatch | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

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
    setInput('')
    setSending(true)
    setError(null)

    const { data, error } = await supabase.functions.invoke('observation-chat', {
      body: { messages: nextMessages },
    })

    setSending(false)

    if (error) {
      setError(error.message)
      return
    }

    if (data.type === 'error') {
      setError(data.message)
      return
    }

    if (data.type === 'question') {
      setMessages((m) => [...m, { role: 'assistant', content: data.text }])
      return
    }

    const { plot, row_number, position, note, observed_date } = data
    const { data: found } = await supabase
      .from('planting_readable')
      .select('id, label')
      .ilike('plot', plot)
      .eq('row_number', row_number)
      .eq('position', position)

    if (!found || found.length !== 1) {
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: `I couldn't find exactly one planting matching Plot ${plot}, Row ${row_number}, Position ${position} -- can you double check?`,
        },
      ])
      return
    }

    setDraft({ plot, row_number, position, note, observed_date: observed_date ?? null })
    setMatch(found[0])
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
      transcript: messages,
    })
    setSending(false)
    if (error) {
      setError(error.message)
      return
    }
    setSubmitted(true)
  }

  function cancelDraft() {
    setDraft(null)
    setMatch(null)
  }

  if (submitted) {
    return <p>Submitted for review. Thank you.</p>
  }

  return (
    <div>
      {messages.map((m, i) => (
        <p key={i}>
          <strong>{m.role === 'user' ? 'You' : 'Growdy'}:</strong> {m.content}
        </p>
      ))}
      {error && <p className="error">{error}</p>}
      {draft && match ? (
        <div>
          <p>
            Log this on {match.label ?? `Plot ${draft.plot}, Row ${draft.row_number}, Position ${draft.position}`}:
            {' '}"{draft.note}"?
          </p>
          <button type="button" onClick={confirmSubmit} disabled={sending}>
            Confirm
          </button>
          <button type="button" onClick={cancelDraft}>
            Cancel
          </button>
        </div>
      ) : (
        <form onSubmit={send}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe what you observed..."
          />
          <button type="submit" disabled={sending}>
            Send
          </button>
        </form>
      )}
    </div>
  )
}
