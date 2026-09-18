import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core'
import { supabase } from './supabaseClient'

// Taking and attaching a vineyard photo, which is two problems wearing
// one coat: getting bytes out of a camera or a photo library, and
// getting them into storage under a path RLS will accept.
//
// The picker is the plugin's on native and a plain file input on web,
// because @capacitor/camera's web implementation opens its own modal
// rather than the file dialog and is worse than the thing the browser
// already does well. Native gets the real prompt -- camera or library --
// which is the behaviour a producer standing in a row actually wants.

export const PHOTO_BUCKET = 'observation-photos'

// Full-resolution phone photos are 3-4MB and nothing here benefits from
// them: the model downsizes internally, storage is a free-tier bucket,
// and a producer on cellular in a vineyard is the one uploading. 1600px
// on the long edge keeps leaf lesions and canopy detail legible while
// cutting the upload by an order of magnitude.
const MAX_EDGE = 1600
const JPEG_QUALITY = 0.82

async function downscale(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  if (scale === 1) return blob

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return blob
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const resized = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  )
  return resized ?? blob
}

export const canUseNativeCamera = Capacitor.isNativePlatform()

// `source` is honoured on native only. On web the browser's own file
// dialog covers both cases, and on a phone browser it offers the camera
// itself.
export async function pickPhoto(source: 'camera' | 'library'): Promise<Blob | null> {
  if (!canUseNativeCamera) {
    return await pickFromFileInput()
  }

  const photo = await Camera.getPhoto({
    resultType: CameraResultType.Uri,
    source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
    quality: 90,
    correctOrientation: true,
  })
  if (!photo.webPath) return null

  const response = await fetch(photo.webPath)
  return await downscale(await response.blob())
}

function pickFromFileInput(): Promise<Blob | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    // Resolves null on cancel rather than hanging: `change` never fires
    // if the dialog is dismissed, so a promise waiting only on it would
    // leave the compose box disabled forever.
    input.oncancel = () => resolve(null)
    input.onchange = async () => {
      const file = input.files?.[0]
      resolve(file ? await downscale(file) : null)
    }
    input.click()
  })
}

// The path is the tenancy check. storage.objects has no producer column,
// so the RLS policies read the first path segment -- '<producer_id>/...'
// -- which means an upload that doesn't start with the caller's own
// producer is rejected by the database rather than by this function.
export async function uploadPhoto(blob: Blob, producerId: string): Promise<string> {
  const path = `${producerId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: false,
  })
  if (error) throw error
  return path
}

// Reads go through a short-lived signed URL because the bucket is
// private (see the storage migration): a vineyard photo shows the
// producer's own operation, in a recognisable place, and a public bucket
// would make every upload readable by anyone holding the URL with no way
// to take it back.
export async function signedPhotoUrl(path: string, expiresInSeconds = 300): Promise<string | null> {
  const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, expiresInSeconds)
  return data?.signedUrl ?? null
}
