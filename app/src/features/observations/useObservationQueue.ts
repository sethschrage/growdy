import { useCallback, useEffect, useMemo, useState } from 'react'
import { createObservationCandidate, type ObservationCandidateSource } from '@/data/observations'
import { onBackOnline } from '@/lib/connectivity'
import {
  canQueue,
  flushQueue,
  inCaptureOrder,
  indexedDbStore,
  memoryStore,
  type QueuedObservation,
} from '@/lib/observationQueue'
import { uploadPhoto, type PhotoLocation } from '@/lib/photo'

// Capture, then delivery -- in that order, always.
//
// Not "send, and queue if that fails". Everything goes through the queue
// and the queue is flushed immediately, so the path that runs in a block
// with no signal is the path that runs at a desk with five bars. A
// fallback only exercised in a field is a fallback nobody finds out is
// broken until they are standing in one (0037).

export type Capture = {
  summary: string
  note?: string | null
  observedDate?: string | null
  plantingId?: string | null
  conversationId?: string | null
  source: ObservationCandidateSource
  photo?: Blob | null
  location?: PhotoLocation | null
}

export function useObservationQueue(producerId: string | null) {
  // Falls back to memory where IndexedDB is missing -- a private window,
  // an old WebView. Captures then last as long as the screen does, which
  // is worse than the queue and better than the RPC failing outright.
  const store = useMemo(() => (canQueue() ? indexedDbStore() : memoryStore()), [])
  const [waiting, setWaiting] = useState<QueuedObservation[]>([])

  const refresh = useCallback(async () => {
    setWaiting(inCaptureOrder(await store.all()))
  }, [store])

  const flush = useCallback(async () => {
    if (!producerId) return
    await flushQueue(store, {
      // The path carries the tenancy check, so the upload needs the
      // producer -- which is also why it cannot be done at capture time
      // with no signal: a path handed out offline is unverifiable.
      uploadPhoto: (blob) => uploadPhoto(blob, producerId, null),
      createCandidate: (item) =>
        createObservationCandidate({
          clientId: item.clientId,
          summary: item.summary,
          note: item.note,
          observedDate: item.observedDate,
          plantingId: item.plantingId,
          conversationId: item.conversationId,
          source: item.source,
          photoPath: item.photoPath,
          photoLatitude: item.location?.latitude ?? null,
          photoLongitude: item.location?.longitude ?? null,
          photoAccuracyM: item.location?.accuracyM ?? null,
        }),
    })
    await refresh()
  }, [store, producerId, refresh])

  // Delivers whatever a previous session left behind. oxlint warns
  // about setState in an effect here and the warning is a false one it
  // cannot see through: `flush` is async, so nothing is set during the
  // effect -- and what it eventually sets is the queue's own contents,
  // read back from IndexedDB, which is precisely the external system an
  // effect exists to synchronise with. Neither disable directive is
  // honoured by this version, so the reasoning lives here instead.
  useEffect(() => {
    void flush()
  }, [flush])

  useEffect(() => onBackOnline(() => void flush()), [flush])

  /**
   * Records the capture and tries to deliver it. Resolves once it is
   * safely written down, which is the promise being made to the producer
   * -- delivery is this hook's problem from then on.
   *
   * Returns whether it got through, so the screen can say "saved" or
   * "saved, waiting for signal" rather than guessing.
   */
  const capture = useCallback(
    async (input: Capture): Promise<{ delivered: boolean }> => {
      const item: QueuedObservation = {
        clientId: crypto.randomUUID(),
        summary: input.summary,
        note: input.note ?? null,
        observedDate: input.observedDate ?? null,
        plantingId: input.plantingId ?? null,
        conversationId: input.conversationId ?? null,
        source: input.source,
        photo: input.photo ?? null,
        location: input.location ?? null,
        photoPath: null,
        queuedAt: Date.now(),
        attempts: 0,
        lastError: null,
      }

      await store.put(item)
      await refresh()
      await flush()
      const left = await store.all()
      return { delivered: !left.some((queued) => queued.clientId === item.clientId) }
    },
    [store, refresh, flush],
  )

  return { capture, waiting, flush }
}
