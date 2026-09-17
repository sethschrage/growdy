import { isValidElement, type ComponentPropsWithoutRef } from 'react'
import type { Session } from '@supabase/supabase-js'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage } from './chatTypes'
import { SvgGraphic } from './SvgGraphic'
import { ConfirmWriteCard } from './ConfirmWriteCard'

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
  // SvgGraphic); a fenced ```confirm-write block becomes a real
  // confirm/decline button (see ConfirmWriteCard, docs/decisions/0022).
  // Every other fence (or no fence at all) renders exactly as it always
  // has, unaffected by this override. Defined inside the component (not
  // module-level) so it can close over session/conversationId -- SvgGraphic
  // needs both to save a shared artifact (0027) under the right producer
  // and conversation.
  // \w alone doesn't match a hyphen, which would silently truncate
  // "confirm-write" to "confirm" and miss it entirely (confirmed
  // directly -- this was the actual bug the first time).
  function getLanguage(className?: string) {
    return /language-([\w-]+)/.exec(className ?? '')?.[1]
  }

  const components = {
    code({ className, children, ...props }: ComponentPropsWithoutRef<'code'>) {
      const language = getLanguage(className)
      if (language === 'svg') {
        return <SvgGraphic code={String(children)} session={session} conversationId={conversationId} />
      }
      if (language === 'confirm-write') {
        return <ConfirmWriteCard code={String(children)} />
      }
      return (
        <code className={className} {...props}>
          {children}
        </code>
      )
    },
    // react-markdown still wraps a fenced block in its own <pre>, even
    // once the code override above replaces what's inside it -- confirmed
    // directly (SvgGraphic never showed it because white-space doesn't
    // affect SVG layout, but ConfirmWriteCard's own text content
    // inherited <pre>'s default white-space: pre and overflowed its
    // bubble instead of wrapping). The child here is the *element*
    // created for the code override, not yet invoked by React -- its
    // type is the code() function above, not SvgGraphic/ConfirmWriteCard
    // (confirmed directly; checking child.type against those two doesn't
    // work). Reading child.props.className the same way code() does is
    // what actually works. Every other fenced block still gets a normal
    // <pre>, unaffected.
    pre({ children, ...props }: ComponentPropsWithoutRef<'pre'>) {
      const child = Array.isArray(children) ? children[0] : children
      const language = isValidElement(child) ? getLanguage((child.props as { className?: string })?.className) : undefined
      if (language === 'svg' || language === 'confirm-write') {
        return <>{children}</>
      }
      return <pre {...props}>{children}</pre>
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
