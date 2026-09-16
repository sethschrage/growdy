import { useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabaseClient'
import { PixelCloud, PixelSprout } from './icons'

// The only entry point that turns a fresh Google sign-in into a real
// producer: nothing else creates a producers/profiles row (see
// docs/decisions/0026). Two short steps, no skipping the first one --
// every other screen in this app assumes profiles.producer_id exists --
// but the second (first parcel) can be skipped, since a producer can
// always add one later from the tree view's own "+ Add parcel" button.
export function OnboardingWizard({ session, onComplete }: { session: Session; onComplete: () => void }) {
  const [step, setStep] = useState<'producer' | 'parcel'>('producer')
  const [producerName, setProducerName] = useState('')
  const [fullName, setFullName] = useState('')
  const [parcelName, setParcelName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreateProducer(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const { error } = await supabase.rpc('create_producer_and_profile', {
      p_producer_name: producerName,
      p_full_name: fullName || null,
    })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    setStep('parcel')
  }

  async function handleCreateParcel(e: FormEvent) {
    e.preventDefault()
    if (!parcelName.trim()) {
      onComplete()
      return
    }
    setSaving(true)
    setError(null)
    const { data: profile } = await supabase
      .from('profiles')
      .select('producer_id')
      .eq('id', session.user.id)
      .single()
    if (!profile) {
      setSaving(false)
      setError('Could not find your new producer -- try refreshing.')
      return
    }
    const { error } = await supabase.from('parcels').insert({ producer_id: profile.producer_id, name: parcelName })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    onComplete()
  }

  return (
    <div className="login-screen">
      <PixelCloud width={90} top="8%" left="8%" duration="9s" />
      <PixelCloud width={70} top="16%" left="62%" duration="7s" />
      <div className="login-content">
        <span className="app-icon" role="img" aria-label="growdy">
          <PixelSprout size={56} />
        </span>
        <h1>growdy</h1>
        {step === 'producer' && (
          <form className="onboarding-form" onSubmit={handleCreateProducer}>
            <p className="onboarding-intro">Let's set up your vineyard.</p>
            <label>
              Vineyard or business name
              <input
                value={producerName}
                onChange={(e) => setProducerName(e.target.value)}
                placeholder="e.g. Mudgett Vineyard"
                required
              />
            </label>
            <label>
              Your name (optional)
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Virgil Mudgett" />
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={saving}>
              {saving ? 'Creating...' : 'Continue'}
            </button>
          </form>
        )}
        {step === 'parcel' && (
          <form className="onboarding-form" onSubmit={handleCreateParcel}>
            <p className="onboarding-intro">Add your first parcel -- you can add more, or skip this for now.</p>
            <label>
              Parcel name
              <input
                value={parcelName}
                onChange={(e) => setParcelName(e.target.value)}
                placeholder="e.g. East Hill Block"
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={saving}>
              {saving ? 'Saving...' : parcelName.trim() ? 'Add parcel' : 'Skip for now'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
