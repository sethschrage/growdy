import { isValidElement, type ComponentPropsWithoutRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage } from '@/features/chat/types'
import { ConfirmWriteCard } from '@/features/chat/ConfirmWriteCard'
import { LogObservationCard } from '@/features/chat/LogObservationCard'
import type { PhotoLocation } from '@/lib/photo'

// Fence tags that render as a real component rather than a code block.
// Both overrides below read this one set: the code() override picks the
// component, and the pre() override has to strip the <pre> wrapper for
// the same tags. Keeping them in step matters -- a tag handled in code()
// but missed in pre() renders inside a <pre>, inheriting white-space:
// pre, which is what broke ConfirmWriteCard's text wrapping the first
// time.
const INTERACTIVE_FENCES = new Set(['confirm-write', 'log-observation'])

// Shared by the live Chat view and the History drawer so a transcript
// renders identically in both places -- assistant answers are markdown
// (tables, lists, bold), user messages are plain text.
export function MessageContent({
  role,
  content,
  conversationId,
  photoMetaFor,
  lastPhotoPath,
}: {
  role: ChatMessage['role']
  content: string
  conversationId: string | null
  // Resolves a photo's storage path to what is known about it -- where
  // and when it was taken. Passed down rather than looked up in the card,
  // because both are known in Chat and neither travels through the model.
  photoMetaFor?: (path: string) => { location: PhotoLocation | null; takenOn: string | null } | null
  // The most recent photo attached in this conversation, used when the
  // model's block has no path of its own -- see Chat.tsx for why it
  // often won't.
  lastPhotoPath?: string | null
}) {
  // A fenced ```confirm-write block becomes a real confirm/decline
  // button (see ConfirmWriteCard, docs/decisions/0022); a fenced
  // ```log-observation block becomes a real "Log this" button on the
  // message where the observation was worked out (see
  // LogObservationCard).
  // Every other fence (or no fence at all) renders exactly as it always
  // has, unaffected by this override. Defined inside the component (not
  // module-level) so it can close over conversationId and the photo
  // props -- LogObservationCard needs all three to log the observation
  // against the right conversation and photo.
  // \w alone doesn't match a hyphen, which would silently truncate
  // "confirm-write" to "confirm" and miss it entirely (confirmed
  // directly -- this was the actual bug the first time).
  function getLanguage(className?: string) {
    return /language-([\w-]+)/.exec(className ?? '')?.[1]
  }

  const components = {
    code({ className, children, ...props }: ComponentPropsWithoutRef<'code'>) {
      const language = getLanguage(className)
      if (language === 'confirm-write') {
        return <ConfirmWriteCard code={String(children)} />
      }
      if (language === 'log-observation') {
        return (
          <LogObservationCard
            code={String(children)}
            conversationId={conversationId}
            photoMetaFor={photoMetaFor}
            lastPhotoPath={lastPhotoPath}
          />
        )
      }
      return (
        <code className={className} {...props}>
          {children}
        </code>
      )
    },
    // react-markdown still wraps a fenced block in its own <pre>, even
    // once the code override above replaces what's inside it -- confirmed
    // directly: ConfirmWriteCard's own text content inherited <pre>'s
    // default white-space: pre and overflowed its bubble instead of
    // wrapping. The child here is the *element* created for the code
    // override, not yet invoked by React -- its type is the code()
    // function above, not ConfirmWriteCard or LogObservationCard
    // (confirmed directly; checking child.type against those doesn't
    // work). Reading child.props.className the same way code() does is
    // what actually works. Every other fenced block still gets a normal
    // <pre>, unaffected.
    pre({ children, ...props }: ComponentPropsWithoutRef<'pre'>) {
      const child = Array.isArray(children) ? children[0] : children
      const language = isValidElement(child) ? getLanguage((child.props as { className?: string })?.className) : undefined
      if (language && INTERACTIVE_FENCES.has(language)) {
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
