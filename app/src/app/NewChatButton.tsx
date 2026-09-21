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
 * Only once there is a chat to leave. On an empty transcript the button
 * offers to do the thing that has already happened, so it fades out and
 * the corner is clear until the producer says something.
 *
 * It stays in the DOM rather than unmounting. The header's measured
 * height feeds --header-height and the conversation's top padding reads
 * it, so a button that came and went would drag the whole conversation
 * up and down by its own height at the exact moment the first answer is
 * arriving. Holding the space costs nothing -- there is nothing else in
 * that corner -- and it buys the button an entrance.
 */
export function NewChatButton({ onNewChat, shown }: { onNewChat: () => void; shown: boolean }) {
  return (
    <button
      type="button"
      className={`new-chat${shown ? '' : ' new-chat--gone'}`}
      onClick={onNewChat}
      aria-label="Start a new chat"
      // Invisible is not the same as absent. Opacity alone leaves it in
      // the tab order and readable by a screen reader, offering a
      // control that does nothing from a corner nobody can see.
      aria-hidden={!shown}
      tabIndex={shown ? undefined : -1}
    >
      <ComposeIcon size={20} />
    </button>
  )
}
