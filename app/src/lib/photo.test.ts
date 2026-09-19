import { describe, expect, it } from 'vitest'
import { nativeExif } from '@/lib/photo'

// The plugin's exif object, as @capacitor/camera actually builds it on
// iOS: the {Exif} dictionary flattened at the top level, with the
// CoreGraphics GPS dictionary nested under "GPS"
// (CameraPlugin.swift: `exif["GPS"] = properties[kCGImagePropertyGPSDictionary]`).
//
// This shape is documented nowhere but in that Swift file, which is why
// it is written down here: the first version of this reader looked for a
// flat GPSLatitude, found nothing, and uploaded every photo this app has
// ever taken without its position.

const iosLibraryPhoto = {
  DateTimeOriginal: '2009:10:09 14:09:20',
  PixelXDimension: 4032,
  GPS: {
    Latitude: 38.41,
    LatitudeRef: 'N',
    Longitude: 122.4383,
    LongitudeRef: 'W',
    Altitude: 64.3,
  },
}

describe('nativeExif', () => {
  it('reads the capture date', () => {
    expect(nativeExif(iosLibraryPhoto)?.dateTimeOriginal).toBe('2009:10:09 14:09:20')
  })

  it('reads the coordinates out of the nested GPS dictionary', () => {
    const exif = nativeExif(iosLibraryPhoto)
    expect(exif?.gpsLatitude).toBeCloseTo(38.41, 6)
    // West, so negative: the number itself is unsigned and the
    // hemisphere is a separate key.
    expect(exif?.gpsLongitude).toBeCloseTo(-122.4383, 6)
  })

  it('puts a southern, eastern photo in the right hemisphere', () => {
    // Marlborough. Read without the refs it would land off Portugal.
    const exif = nativeExif({
      GPS: { Latitude: 41.5, LatitudeRef: 'S', Longitude: 173.9, LongitudeRef: 'E' },
    })
    expect(exif?.gpsLatitude).toBeCloseTo(-41.5, 6)
    expect(exif?.gpsLongitude).toBeCloseTo(173.9, 6)
  })

  it('accepts the flatter shape the Android implementation returns', () => {
    const exif = nativeExif({
      DateTimeOriginal: '2026:09:19 07:30:00',
      GPSLatitude: 38.41,
      GPSLatitudeRef: 'N',
      GPSLongitude: 122.4383,
      GPSLongitudeRef: 'W',
    })
    expect(exif?.gpsLatitude).toBeCloseTo(38.41, 6)
    expect(exif?.gpsLongitude).toBeCloseTo(-122.4383, 6)
  })

  it('keeps the date when there is no GPS at all', () => {
    // Location services off, or a photo whose location was stripped.
    // Ordinary, and not a reason to discard the date.
    const exif = nativeExif({ DateTimeOriginal: '2026:09:19 07:30:00' })
    expect(exif?.dateTimeOriginal).toBe('2026:09:19 07:30:00')
    expect(exif?.gpsLatitude).toBeUndefined()
  })

  it('ignores a GPS dictionary with only an altitude in it', () => {
    expect(nativeExif({ GPS: { Altitude: 64.3 } })).toBeNull()
  })

  it('returns null when there is nothing worth keeping', () => {
    expect(nativeExif({})).toBeNull()
    expect(nativeExif({ PixelXDimension: 4032 })).toBeNull()
  })

  it('falls back through the date keys the platforms disagree about', () => {
    expect(nativeExif({ CreateDate: '2026:09:19 07:30:00' })?.dateTimeOriginal).toBe(
      '2026:09:19 07:30:00',
    )
    expect(nativeExif({ DateTime: '2026:09:19 07:30:00' })?.dateTimeOriginal).toBe(
      '2026:09:19 07:30:00',
    )
  })
})
