'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError('Ongeldige inloggegevens. Probeer het opnieuw.')
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-b from-brand-lavender-light to-brand-lavender">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center justify-center mb-8">
          <h1 className="font-uxum text-headline text-brand-text-primary">The Daley Dash</h1>
          <p className="text-pill text-brand-text-secondary mt-0.5">
            Jouw werkportaal
          </p>
        </div>

        {/* Login Card */}
        <form
          onSubmit={handleLogin}
          className="card p-6 space-y-4"
        >
          <div className="text-center mb-2">
            <h1 className="font-uxum text-sidebar-t text-brand-text-primary">
              Welkom terug
            </h1>
            <p className="text-body text-brand-text-secondary mt-1">
              Log in om verder te gaan
            </p>
          </div>

          {error && (
            <div className="rounded-brand-sm px-3 py-2 text-body bg-brand-pink border border-brand-status-red/25 text-brand-pink-accent">
              {error}
            </div>
          )}

          <div>
            <label className="label">E-mailadres</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="daley@voorbeeld.nl"
              className="input"
            />
          </div>

          <div>
            <label className="label">Wachtwoord</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="input"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-purple text-white font-semibold text-body flex items-center justify-center gap-2 rounded-brand-btn py-2.5 px-5 transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {loading && <Loader2 size={15} className="animate-spin" />}
            {loading ? 'Bezig met inloggen...' : 'Inloggen'}
          </button>
        </form>

        <p className="text-center text-caption text-brand-text-secondary mt-6">
          The Daley Dash &middot; Jouw werkportaal
        </p>
      </div>
    </div>
  )
}
