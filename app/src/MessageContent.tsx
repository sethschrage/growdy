import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage } from './chatTypes'

// Shared by the live Chat view and the History drawer so a transcript
// renders identically in both places -- assistant answers are markdown
// (tables, lists, bold), user messages are plain text.
export function MessageContent({ role, content }: { role: ChatMessage['role']; content: string }) {
  if (role === 'assistant') {
    return <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
  }
  return <>{content}</>
}
