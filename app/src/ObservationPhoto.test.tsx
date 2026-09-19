import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ObservationPhoto } from './ObservationPhoto'

// The photo bucket is private, so every render of a photo has to mint a
// signed URL first and that call can fail -- an expired token, a
// tenancy rejection, a path pointing at an object that is gone. The
// component's whole job is the three states around that one call, so
// this is where a test earns its keep.
//
// Mocked with a factory rather than a spy: importing the real module
// would pull in the Capacitor camera and geolocation plugins, which
// have nothing to do with rendering an <img> and don't load outside a
// browser.
const signedPhotoUrl = vi.fn()
vi.mock('./lib/photo', () => ({ signedPhotoUrl: (...args: unknown[]) => signedPhotoUrl(...args) }))

describe('ObservationPhoto', () => {
  beforeEach(() => {
    signedPhotoUrl.mockReset()
  })

  it('renders the photo once a URL is signed', async () => {
    signedPhotoUrl.mockResolvedValue('https://storage.example/signed.jpg?token=abc')
    render(<ObservationPhoto path="producer-1/photo.jpg" alt="Leaf damage" />)

    const img = await screen.findByAltText('Leaf damage')
    expect(img).toHaveProperty('src', 'https://storage.example/signed.jpg?token=abc')
    expect(signedPhotoUrl).toHaveBeenCalledWith('producer-1/photo.jpg')
  })

  it('says the photo is unavailable when signing returns nothing', async () => {
    // Not a broken-image glyph: the path is on the row, so a photo that
    // can't be fetched is a storage or permissions problem, and it
    // should read as absence rather than as a bad photo.
    signedPhotoUrl.mockResolvedValue(null)
    render(<ObservationPhoto path="producer-1/photo.jpg" alt="Leaf damage" />)

    expect(await screen.findByText('Photo unavailable')).toBeTruthy()
    expect(screen.queryByAltText('Leaf damage')).toBeNull()
  })

  it('says the same when signing throws', async () => {
    signedPhotoUrl.mockRejectedValue(new Error('network down'))
    render(<ObservationPhoto path="producer-1/photo.jpg" alt="Leaf damage" />)

    expect(await screen.findByText('Photo unavailable')).toBeTruthy()
  })

  it('re-signs when the path changes, since URLs expire per object', async () => {
    signedPhotoUrl.mockResolvedValue('https://storage.example/one.jpg')
    const { rerender } = render(<ObservationPhoto path="producer-1/one.jpg" alt="One" />)
    await screen.findByAltText('One')

    signedPhotoUrl.mockResolvedValue('https://storage.example/two.jpg')
    rerender(<ObservationPhoto path="producer-1/two.jpg" alt="Two" />)

    await waitFor(() => expect(signedPhotoUrl).toHaveBeenCalledWith('producer-1/two.jpg'))
    expect(await screen.findByAltText('Two')).toHaveProperty(
      'src',
      'https://storage.example/two.jpg',
    )
  })
})
