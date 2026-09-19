import { describe, expect, it } from 'vitest'
import { exifDateToIso, exifObservedDate, readExif } from './exif'

// The fixtures are built here rather than committed as .jpg files. The
// whole point of this reader is that it walks a byte layout by hand, so
// a test whose input is an opaque binary blob proves the reader works on
// that blob and explains nothing. Written out, the offsets in the test
// are the same offsets the reader is looking for, and a failure points
// at which one moved.

const EXIF_DATE = '2025:09:19 07:30:00'

/**
 * A JPEG that is nothing but a marker, an APP1/EXIF segment, and an end
 * marker. Real cameras write far more; this reader only ever looks at
 * APP1, so everything else would be decoration.
 */
function jpegWithExif(): Blob {
  // Offsets below are relative to the start of the TIFF header, which is
  // what every offset inside EXIF is measured from.
  const EXIF_IFD = 38
  const DATE = 56
  const GPS_IFD = 76
  const LAT = 130
  const LON = 154
  const TIFF_LENGTH = 178

  const tiff = new DataView(new ArrayBuffer(TIFF_LENGTH))
  const bytes = new Uint8Array(tiff.buffer)
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i)
  }
  // tag, type, count, then either the value itself (4 bytes or fewer) or
  // an offset to it -- the ambiguity the reader has to handle.
  const entry = (at: number, tag: number, type: number, count: number, value: number) => {
    tiff.setUint16(at, tag, true)
    tiff.setUint16(at + 2, type, true)
    tiff.setUint32(at + 4, count, true)
    tiff.setUint32(at + 8, value, true)
  }
  const rational = (at: number, numerator: number, denominator: number) => {
    tiff.setUint32(at, numerator, true)
    tiff.setUint32(at + 4, denominator, true)
  }

  ascii(0, 'II') // little-endian, the byte order iPhones write
  tiff.setUint16(2, 0x002a, true)
  tiff.setUint32(4, 8, true) // IFD0 starts here

  tiff.setUint16(8, 2, true) // IFD0 has two entries, both pointers
  entry(10, 0x8769, 4, 1, EXIF_IFD)
  entry(22, 0x8825, 4, 1, GPS_IFD)
  tiff.setUint32(34, 0, true) // no IFD1 (no thumbnail)

  tiff.setUint16(EXIF_IFD, 1, true)
  entry(EXIF_IFD + 2, 0x9003, 2, 20, DATE) // DateTimeOriginal, 19 chars + NUL
  tiff.setUint32(EXIF_IFD + 14, 0, true)
  ascii(DATE, EXIF_DATE)

  tiff.setUint16(GPS_IFD, 4, true)
  entry(GPS_IFD + 2, 0x0001, 2, 2, 0) // latitude ref, short enough to sit inline
  ascii(GPS_IFD + 10, 'N')
  entry(GPS_IFD + 14, 0x0002, 5, 3, LAT)
  entry(GPS_IFD + 26, 0x0003, 2, 2, 0)
  ascii(GPS_IFD + 34, 'W')
  entry(GPS_IFD + 38, 0x0004, 5, 3, LON)
  tiff.setUint32(GPS_IFD + 50, 0, true)

  // 38 24' 36" N, 122 26' 18" W -- Sonoma County, in the
  // degrees/minutes/seconds triple EXIF actually stores.
  rational(LAT, 38, 1)
  rational(LAT + 8, 24, 1)
  rational(LAT + 16, 36, 1)
  rational(LON, 122, 1)
  rational(LON + 8, 26, 1)
  rational(LON + 16, 18, 1)

  const app1 = new Uint8Array(6 + TIFF_LENGTH)
  app1.set([0x45, 0x78, 0x69, 0x66, 0, 0]) // "Exif\0\0"
  app1.set(bytes, 6)

  const header = new Uint8Array(4)
  header.set([0xff, 0xd8, 0xff, 0xe1]) // SOI, then the APP1 marker
  const length = new Uint8Array(2)
  new DataView(length.buffer).setUint16(0, 2 + app1.length, false)

  return new Blob([header, length, app1, new Uint8Array([0xff, 0xd9])])
}

/** A JPEG carrying an APP0/JFIF segment and no EXIF at all. */
function jpegWithoutExif(): Blob {
  const app0 = new Uint8Array([
    0xff, 0xd8, // SOI
    0xff, 0xe0, // APP0
    0x00, 0x10, // length: 16
    0x4a, 0x46, 0x49, 0x46, 0x00, // "JFIF\0"
    0x01, 0x02, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xd9, // EOI
  ])
  return new Blob([app0])
}

describe('readExif', () => {
  it('reads the capture date and GPS out of a JPEG', async () => {
    const exif = await readExif(jpegWithExif())
    expect(exif?.dateTimeOriginal).toBe(EXIF_DATE)
    // 38 + 24/60 + 36/3600, and the W reference applied as a sign --
    // the sign is in a separate tag, never in the number itself.
    expect(exif?.gpsLatitude).toBeCloseTo(38.41, 6)
    expect(exif?.gpsLongitude).toBeCloseTo(-122.4383, 4)
  })

  it('returns null for a JPEG with no EXIF, which is completely normal', async () => {
    // Screenshots, anything edited, anything a messaging app has been
    // through. Absence is an outcome here, never an error.
    expect(await readExif(jpegWithoutExif())).toBeNull()
  })

  it('returns null for something that is not a JPEG', async () => {
    expect(await readExif(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])]))).toBeNull()
  })

  it('returns null rather than throwing on a truncated file', async () => {
    const full = new Uint8Array(await jpegWithExif().arrayBuffer())
    expect(await readExif(new Blob([full.slice(0, 40)]))).toBeNull()
  })
})

describe('exifObservedDate', () => {
  it('dates the observation to the day the shutter fired', () => {
    expect(exifObservedDate(EXIF_DATE)).toBe('2025-09-19')
  })

  it('keeps a late-evening photo on its own day in every time zone', () => {
    // The bug this guards: treating the string as UTC. A photo taken at
    // 23:30 would land on the 20th for anyone west of Greenwich, and a
    // 00:30 one on the day before for anyone east -- an observation
    // quietly dated to a day the producer wasn't in the vineyard.
    expect(exifObservedDate('2025:09:19 23:30:00')).toBe('2025-09-19')
    expect(exifObservedDate('2025:09:19 00:30:00')).toBe('2025-09-19')
  })

  it('has nothing to say about a photo with no date', () => {
    expect(exifObservedDate(undefined)).toBeNull()
    expect(exifObservedDate('not a date')).toBeNull()
  })
})

describe('exifDateToIso', () => {
  it('reads the camera clock as local time', () => {
    const iso = exifDateToIso(EXIF_DATE)
    const local = new Date(iso!)
    expect(local.getFullYear()).toBe(2025)
    expect(local.getMonth()).toBe(8) // September
    expect(local.getDate()).toBe(19)
    expect(local.getHours()).toBe(7)
    expect(local.getMinutes()).toBe(30)
  })

  it('accepts the ISO-style separator some cameras write', () => {
    expect(exifDateToIso('2025:09:19T07:30:00')).not.toBeNull()
  })
})
