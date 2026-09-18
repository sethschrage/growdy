// Just enough EXIF to date a photo, read straight out of the JPEG.
//
// Native doesn't need this -- @capacitor/camera hands back a parsed
// `exif` object -- but the web path picks a File through a plain input,
// and the one field that actually matters is only in the bytes:
// DateTimeOriginal, when the shutter fired. That is the difference
// between an observation dated the day it was uploaded and one dated the
// morning it was seen, and nobody ever catches the wrong one later.
//
// The obvious move is a library, and the obvious library (exifr) has not
// been touched since 2022 and unpacks to 1.3MB, against six current
// runtime dependencies in this project. Reading two tags out of a
// well-specified container is smaller than the dependency and doesn't
// rot.
//
// Deliberately partial: no orientation (the plugin already corrects it),
// no camera or lens (noise for agronomy), no thumbnail. Anything
// unparseable returns null -- a photo without EXIF is completely normal
// (screenshots, anything edited, anything stripped by a messaging app),
// so absence is an outcome, never an error.

export type PhotoExif = {
  dateTimeOriginal?: string
  gpsLatitude?: number
  gpsLongitude?: number
}

const TAG_DATE_TIME_ORIGINAL = 0x9003
const TAG_EXIF_IFD_POINTER = 0x8769
const TAG_GPS_IFD_POINTER = 0x8825
const TAG_GPS_LAT_REF = 0x0001
const TAG_GPS_LAT = 0x0002
const TAG_GPS_LON_REF = 0x0003
const TAG_GPS_LON = 0x0004

// EXIF writes coordinates as three rationals -- degrees, minutes,
// seconds -- plus a separate N/S/E/W reference tag, which is why the
// sign has to be applied afterwards rather than read from the number.
function toDecimal(dms: number[], ref: string | undefined): number | undefined {
  if (dms.length < 3) return undefined
  const value = dms[0] + dms[1] / 60 + dms[2] / 3600
  return ref === 'S' || ref === 'W' ? -value : value
}

function readIfd(
  view: DataView,
  tiffStart: number,
  ifdOffset: number,
  little: boolean,
): Map<number, { type: number; count: number; valueOffset: number }> {
  const entries = new Map<number, { type: number; count: number; valueOffset: number }>()
  const count = view.getUint16(tiffStart + ifdOffset, little)
  for (let i = 0; i < count; i++) {
    const entry = tiffStart + ifdOffset + 2 + i * 12
    if (entry + 12 > view.byteLength) break
    entries.set(view.getUint16(entry, little), {
      type: view.getUint16(entry + 2, little),
      count: view.getUint32(entry + 4, little),
      valueOffset: entry + 8,
    })
  }
  return entries
}

function readAscii(view: DataView, tiffStart: number, e: { count: number; valueOffset: number }, little: boolean) {
  // Values of four bytes or fewer sit in the entry itself; anything
  // longer stores an offset instead. A date is 20 bytes, so it is always
  // the second case, but the check keeps the reader honest.
  const start = e.count <= 4 ? e.valueOffset : tiffStart + view.getUint32(e.valueOffset, little)
  let out = ''
  for (let i = 0; i < e.count - 1; i++) {
    const c = view.getUint8(start + i)
    if (c === 0) break
    out += String.fromCharCode(c)
  }
  return out
}

function readRationals(
  view: DataView,
  tiffStart: number,
  e: { count: number; valueOffset: number },
  little: boolean,
) {
  const start = tiffStart + view.getUint32(e.valueOffset, little)
  const out: number[] = []
  for (let i = 0; i < e.count; i++) {
    const numerator = view.getUint32(start + i * 8, little)
    const denominator = view.getUint32(start + i * 8 + 4, little)
    out.push(denominator === 0 ? 0 : numerator / denominator)
  }
  return out
}

export async function readExif(blob: Blob): Promise<PhotoExif | null> {
  try {
    // 128KB is far more than any EXIF block needs and avoids pulling a
    // whole 4MB photo into memory to read its header.
    const view = new DataView(await blob.slice(0, 131072).arrayBuffer())
    if (view.getUint16(0, false) !== 0xffd8) return null // not a JPEG

    let offset = 2
    let tiffStart = -1
    while (offset + 4 < view.byteLength) {
      if (view.getUint16(offset, false) !== 0xffe1) {
        // Not APP1 -- skip this segment by its own declared length.
        const size = view.getUint16(offset + 2, false)
        if (size < 2) return null
        offset += 2 + size
        continue
      }
      // "Exif\0\0" then the TIFF header the offsets are relative to.
      if (view.getUint32(offset + 4, false) !== 0x45786966) return null
      tiffStart = offset + 10
      break
    }
    if (tiffStart < 0 || tiffStart + 8 > view.byteLength) return null

    const little = view.getUint16(tiffStart, false) === 0x4949
    const ifd0 = readIfd(view, tiffStart, view.getUint32(tiffStart + 4, little), little)
    const result: PhotoExif = {}

    const exifPointer = ifd0.get(TAG_EXIF_IFD_POINTER)
    if (exifPointer) {
      const exifIfd = readIfd(view, tiffStart, view.getUint32(exifPointer.valueOffset, little), little)
      const date = exifIfd.get(TAG_DATE_TIME_ORIGINAL)
      if (date) result.dateTimeOriginal = readAscii(view, tiffStart, date, little)
    }

    const gpsPointer = ifd0.get(TAG_GPS_IFD_POINTER)
    if (gpsPointer) {
      const gps = readIfd(view, tiffStart, view.getUint32(gpsPointer.valueOffset, little), little)
      const lat = gps.get(TAG_GPS_LAT)
      const lon = gps.get(TAG_GPS_LON)
      const latRef = gps.get(TAG_GPS_LAT_REF)
      const lonRef = gps.get(TAG_GPS_LON_REF)
      if (lat && lon) {
        result.gpsLatitude = toDecimal(
          readRationals(view, tiffStart, lat, little),
          latRef && readAscii(view, tiffStart, latRef, little),
        )
        result.gpsLongitude = toDecimal(
          readRationals(view, tiffStart, lon, little),
          lonRef && readAscii(view, tiffStart, lonRef, little),
        )
      }
    }

    return Object.keys(result).length > 0 ? result : null
  } catch {
    return null
  }
}

// EXIF dates are "YYYY:MM:DD HH:MM:SS" in the camera's own local time,
// with no zone. Treated as local rather than UTC on purpose: a producer
// photographing at 7am wants the observation dated that day, and
// pretending the string is UTC can move it across midnight.
export function exifDateToIso(value: string | undefined): string | null {
  if (!value) return null
  const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value.trim())
  if (!match) return null
  const [, y, mo, d, h, mi, s] = match
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

// The observed_date an observation should carry: the day the shutter
// fired, not the day the photo happened to be uploaded.
export function exifObservedDate(value: string | undefined): string | null {
  const iso = exifDateToIso(value)
  if (!iso) return null
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
