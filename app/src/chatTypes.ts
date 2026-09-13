export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  feedback?: 'up' | 'down'
}
