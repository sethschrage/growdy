import type { ComponentPropsWithoutRef } from 'react'
import type { Session } from '@supabase/supabase-js'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage } from './chatTypes'
import { SvgGraphic } from './SvgGraphic'

// Shared by the live Chat view and the History drawer so a transcript
// renders identically in both places -- assistant answers are markdown
// (tables, lists, bold), user messages are plain text.
export function MessageContent({
  role,
  content,
  session,
  conversationId,
}: {
  role: ChatMessage['role']
  content: string
  session: Session
  conversationId: string | null
}) {
  // A fenced ```svg block becomes a real rendered picture (see
  // SvgGraphic); every other fence (or no fence at all) renders exactly
  // as it always has, unaffected by this override. Defined inside the
  // component (not module-level) so it can close over session/
  // conversationId -- SvgGraphic needs both to save a shared artifact
  // (0027) under the right producer and conversation.
  const components = {
    code({ className, children, ...props }: ComponentPropsWithoutRef<'code'>) {
      const language = /language-(\w+)/.exec(className ?? '')?.[1]
      if (language === 'svg') {
        return <SvgGraphic code={String(children)} session={session} conversationId={conversationId} />
      }
      return (
        <code className={className} {...props}>
          {children}
        </code>
      )
    },
  }

  if (role === 'assistant') {
    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    )
  }
  return <>{content}</>
}
