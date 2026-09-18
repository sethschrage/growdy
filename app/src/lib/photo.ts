import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Geolocation } from '@capacitor/geolocation'
import { Capacitor } from '@capacitor/core'
import { supabase } from './supabaseClient'
import { readExif, type PhotoExif } from './exif'

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

export type PhotoLocation = { latitude: number; longitude: number; accuracyM: number | null }
export type PickedPhoto = { blob: Blob; exif: PhotoExif | null; location: PhotoLocation | null }

// Where the camera was, which is a different fact from what the photo is
// about. Most photos never get a planting attached -- weed pressure
// across a block, standing water, something odd at the fence line -- and
// for those this is the only spatial information that will ever exist.
//
// Read from the device rather than from the photo's own EXIF: iOS
// strips location from a camera capture unless the app holds location
// authorization, and the camera plugin documents nothing about GPS at
// all, so trusting EXIF here would mean a field that silently stays
// empty. Asking the device is explicit and testable.
//
// Only for captures. A photo picked from the library was taken
// somewhere else, possibly weeks ago, so the phone's position now says
// nothing about it -- that case falls back to whatever GPS the file
// itself carries.
//
// A refusal or a timeout returns null rather than throwing. Location is
// worth having and never worth blocking on: a producer who declined the
// permission, or is standing somewhere without a fix, should still be
// able to attach a photo.
async function currentLocation(): Promise<PhotoLocation | null> {
  if (!canUseNativeCamera) return null
  try {
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 8000,
    })
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracyM: position.coords.accuracy ?? null,
    }
  } catch {
    return null
  }
}

function exifLocation(exif: PhotoExif | null): PhotoLocation | null {
  if (!exif || exif.gpsLatitude === undefined || exif.gpsLongitude === undefined) return null
  return { latitude: exif.gpsLatitude, longitude: exif.gpsLongitude, accuracyM: null }
}

// Backing out of the camera is a decision, not a failure, but the plugin
// reports it by throwing -- "User cancelled photos app" -- which arrives
// at a catch block indistinguishable from a real fault and gets painted
// red. A producer who changed their mind should see nothing at all.
//
// Matched on the message because the plugin gives no error code to check
// and the wording differs by platform and picker. Anything that doesn't
// look like a cancellation is rethrown untouched: a genuine failure --
// permission denied, no camera, out of space -- still has to reach the
// producer, and swallowing everything here would hide it.
async function getPhotoOrNull(options: Parameters<typeof Camera.getPhoto>[0]) {
  try {
    return await Camera.getPhoto(options)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/cancel/i.test(message) || /no image (picked|selected)/i.test(message)) return null
    throw err
  }
}

// `source` is honoured on native only. On web the browser's own file
// dialog covers both cases, and on a phone browser it offers the camera
// itself.
export async function pickPhoto(source: 'camera' | 'library'): Promise<PickedPhoto | null> {
  if (!canUseNativeCamera) {
    return await pickFromFileInput()
  }

  const photo = await getPhotoOrNull({
    resultType: CameraResultType.Uri,
    source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
    quality: 90,
    correctOrientation: true,
    // The full-resolution original, metadata intact, goes to the
    // producer's own photo library. That makes the phone the archive and
    // means this app only has to store the working copy: we downscale to
    // ~400KB for upload, and the thing we downscaled from still exists,
    // backed up, where anyone would look for a photo they took.
    // Only meaningful for camera captures -- a library photo is already
    // in the library.
    saveToGallery: source === 'camera',
  })
  if (!photo?.webPath) return null

  const response = await fetch(photo.webPath)
  const original = await response.blob()
  // Asked for alongside the capture, not before it -- a producer who
  // cancels the camera should never have been prompted for location.
  const location = source === 'camera' ? await currentLocation() : null
  // Read before downscaling. Drawing to a canvas produces a new JPEG
  // from pixels alone, so whatever EXIF the original carried is gone by
  // the time the upload happens -- this is the only moment it exists.
  const exif = photo.exif
    ? nativeExif(photo.exif)
    : await readExif(original)
  return {
    blob: await downscale(original),
    exif,
    location: location ?? exifLocation(exif),
  }
}

// The plugin hands back a parsed object rather than raw bytes, and keys
// it the way the platform does -- so the two tags worth having are
// pulled out by name into the same shape the web path produces, instead
// of two call sites each knowing about two formats.
function nativeExif(raw: Record<string, unknown>): PhotoExif | null {
  const pick = (...names: string[]) => {
    for (const name of names) {
      const value = raw[name]
      if (typeof value === 'string' && value.trim()) return value
      if (typeof value === 'number') return String(value)
    }
    return undefined
  }
  const result: PhotoExif = {}
  const taken = pick('DateTimeOriginal', 'DateTimeDigitized', 'CreateDate', 'DateTime')
  if (taken) result.dateTimeOriginal = taken
  const lat = raw.GPSLatitude ?? raw.Latitude
  const lon = raw.GPSLongitude ?? raw.Longitude
  if (typeof lat === 'number' && typeof lon === 'number') {
    result.gpsLatitude = lat
    result.gpsLongitude = lon
  }
  return Object.keys(result).length > 0 ? result : null
}

function pickFromFileInput(): Promise<PickedPhoto | null> {
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
      if (!file) return resolve(null)
      const exif = await readExif(file)
      resolve({ blob: await downscale(file), exif, location: exifLocation(exif) })
    }
    input.click()
  })
}

// The path is the tenancy check. storage.objects has no producer column,
// so the RLS policies read the first path segment -- '<producer_id>/...'
// -- which means an upload that doesn't start with the caller's own
// producer is rejected by the database rather than by this function.
export async function uploadPhoto(
  blob: Blob,
  producerId: string,
  exif: PhotoExif | null,
): Promise<string> {
  const path = `${producerId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: false,
    // Kept on the object rather than in a column: it belongs to the file,
    // it is the only copy left once the downscale has happened, and
    // storing it here means no schema has to be reshaped to hold fields
    // nothing reads yet. The map work this eventually feeds needs
    // coordinates on plantings, not on photos -- but a photo's own
    // metadata is unrecoverable later, so it gets kept now regardless.
    ...(exif ? { metadata: exif as Record<string, unknown> } : {}),
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
