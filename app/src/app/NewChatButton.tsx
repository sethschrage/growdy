import { ComposeIcon } from '@/ui/icons'

/**
 * Start a new chat, always on screen.
 *
 * It was the first item in the burger, which meant the one thing a
 * producer does most often -- put the last question down and ask a
 * different one -- cost two taps and a menu, and only worked if they
 * remembered the menu had it. A control used that often is not a menu
 * item.
 *
 * It sits where the sprout used to. The sprout opened onto an empty
 * menu and was kept on the understanding that the next feature would
 * fill it; this is the next feature, and it turned out not to want a
 * menu at all.
 *
 * Dressed as one of the burger's own buttons rather than as a new kind
 * of thing: same wood, same size, same press. The header has two
 * controls in it now and they should look like they belong to the same
 * app.
 */
export function NewChatButton({ onNewChat }: { onNewChat: () => void }) {
  return (
    <button type="button" className="new-chat" onClick={onNewChat} aria-label="Start a new chat">
      <ComposeIcon size={20} />
    </button>
  )
}
