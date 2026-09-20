// What to say when a request does not arrive, and when to try again.
//
// A vineyard is the place this matters. The producer is standing in a
// block, two bars or none, and what the app said until now was the
// browser's own words for it -- "Load failed" on iOS, "Failed to fetch"
// elsewhere -- which names the mechanism and not the situation. The
// question was left in the transcript with no answer and no way to send
// it again except retyping it.
//
// None of this makes the chat work offline. The model is on the other
// side of the network and nothing here changes that. What it changes is
// that the app knows the difference between "you have no signal" and
// "something is broken", and says which.

/** navigator.onLine is only honest when it is false, which is the case we want. */
export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

// Every browser words a dead connection differently, and none of them
// are worth showing a producer.
const TRANSPORT_FAILURE =
  /load failed|failed to fetch|networkerror|network error|network request failed|the internet connection/i

/**
 * The producer-facing reason a message did not send.
 *
 * A message the server composed is always preferred -- it is specific,
 * and it knows things this side does not. Only the transport's own
 * strings get replaced.
 */
export function describeSendFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : ''

  if (isOffline()) {
    return 'No signal. Your question is saved, and will send as soon as you are back.'
  }
  if (!message || TRANSPORT_FAILURE.test(message)) {
    return 'Could not reach growdy just now. It will try again, or you can.'
  }
  return message
}

/**
 * Runs `handler` when the browser next believes it is online again.
 * Returns the unsubscribe, so an effect can hand it straight back.
 */
export function onBackOnline(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('online', handler)
  return () => window.removeEventListener('online', handler)
}
