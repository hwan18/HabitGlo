import { useEffect, useState } from 'react'
import { supabase, hasSupabase } from '@/lib/supabaseClient'
import { useHabitsStore } from '@/stores/useHabitsStore'
import { Button } from './Button'

export function AuthPanel() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const user = useHabitsStore((s) => s.user)
  const setUser = useHabitsStore((s) => s.setUser)

  useEffect(() => {
    const init = async () => {
      if (!supabase) return
      const { data } = await supabase.auth.getSession()
      if (data.session?.user) {
        setUser(data.session.user)
      }
    }
    init()

    const sub = supabase?.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) setUser(session.user)
      if (event === 'SIGNED_OUT') setUser(null)
    })

    return () => {
      sub?.data.subscription.unsubscribe()
    }
  }, [setUser])

  const sendMagicLink = async () => {
    if (!supabase) return
    setStatus('Sending magic link...')
    const { error } = await supabase.auth.signInWithOtp({ email })
    if (error) {
      setStatus(error.message)
      return
    }
    setStatus('Check your email for the login link.')
  }

  const signOut = async () => {
    await supabase?.auth.signOut()
    setUser(null)
  }

  if (!hasSupabase) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
        <div className="font-semibold text-white">Offline demo</div>
        <p className="mt-2">No Supabase keys detected. Data will be stored locally.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-white/80">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">Supabase Auth</p>
          <p className="text-xs text-white/60">{user ? 'Signed in' : 'Magic link login'}</p>
        </div>
        {user && (
          <Button size="sm" variant="ghost" onClick={signOut}>
            Sign out
          </Button>
        )}
      </div>
      {!user ? (
        <div className="mt-3 flex gap-2">
          <input
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-glow-pink"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button onClick={sendMagicLink}>Send link</Button>
        </div>
      ) : (
        <div className="mt-3 text-xs text-white/70">Logged in as {user.email}</div>
      )}
      {status && <div className="mt-2 text-xs text-glow-amber">{status}</div>}
    </div>
  )
}
