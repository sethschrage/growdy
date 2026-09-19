import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { NoProducerScreen } from '@/app/NoProducerScreen'
import { SignedIn } from '@/app/SignedIn'
import { supabase } from '@/lib/supabaseClient'

// Every screen below this assumes profiles.producer_id exists -- nothing
// creates that row automatically (see docs/decisions/0026), so this is
// still the one gate deciding whether a signed-in account has a producer
// at all. What changed is what happens when it doesn't.
//
// 0026's self-serve wizard used to run here: name your vineyard,
// optionally add a first parcel. It was withdrawn in UAT. Two reasons,
// and the second is the real one. It could not be tested by the only
// account that exists -- the gate is "has a profile", the owner has one,
// so the wizard was unreachable for the person who had to sign it off.
// And the shape of it is about to be wrong anyway: parcels are becoming
// the thing Growdy sells, and the seat someone buys, so the first run of
// a new account is going to be a purchase and a GIS-drawn boundary, not
// a text box asking for a vineyard name.
//
// Rather than leave a wizard that creates the wrong shape of account, an
// account with no producer now says so plainly and stops. Growdy has one
// producer and a waiting list of nobody, so this costs nothing today,
// and it fails honestly instead of half-working. create_producer_and_profile
// is deliberately left in the database: it is how a producer gets created
// by hand in the meantime, and the purchase flow will want it back.
export function SessionRouter({ session }: { session: Session }) {
  const [hasProfile, setHasProfile] = useState<boolean | null>(null)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setHasProfile(data !== null))
  }, [session.user.id])

  if (hasProfile === null) return null
  if (!hasProfile) return <NoProducerScreen />
  return <SignedIn session={session} />
}
