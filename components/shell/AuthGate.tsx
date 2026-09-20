'use client';

import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AppShell } from '@/components/shell/AppShell';
import { Button } from '@/components/primitives/Button';
import { createBrowserSupabase } from '@/lib/supabase/browser';

export function AuthGate() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    let supabase;
    try {
      supabase = createBrowserSupabase();
    } catch (err) {
      setConfigError((err as Error).message);
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (configError) {
    return (
      <main style={{ padding: 32, maxWidth: 480 }}>
        <h1 style={{ fontSize: 20 }}>AuthGate</h1>
        <p style={{ color: 'var(--danger)' }}>{configError}</p>
        <p style={{ color: 'var(--ink-muted)', fontSize: 13 }}>
          Preview/dev may use develop ref bkwhqfkosxnoffpsjcug. Production must use parent
          krcwpupbdizzjyydzaqp. Never a third Supabase project.
        </p>
      </main>
    );
  }

  if (loading) {
    return (
      <main style={{ padding: 32, color: 'var(--ink-muted)' }}>Checking Supabase Auth session…</main>
    );
  }

  if (session) {
    return (
      <AppShell
        authSession={session}
        onSignOut={() => {
          void createBrowserSupabase().auth.signOut();
        }}
      />
    );
  }

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    const supabase = createBrowserSupabase();
    const { error: signError } = await supabase.auth.signInWithPassword({ email, password });
    if (signError) {
      setError(signError.message);
    }
  }

  async function magicLink() {
    setError(null);
    const supabase = createBrowserSupabase();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (otpError) {
      setError(otpError.message);
    } else {
      setInfo('Check email for a magic link. Password sign-in also works.');
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--paper)',
      }}
    >
      <form
        onSubmit={(event) => void signIn(event)}
        style={{
          width: minWidth(),
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 10,
          padding: 24,
          display: 'grid',
          gap: 12,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 18 }}>XVfinance</h1>
        <p style={{ margin: 0, color: 'var(--ink-muted)', fontSize: 13 }}>
          Supabase Auth only. The user JWT is sent to <code>/v1</code>.
        </p>
        <label style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            style={inputStyle}
          />
        </label>
        {error ? <p style={{ margin: 0, color: 'var(--danger)', fontSize: 13 }}>{error}</p> : null}
        {info ? <p style={{ margin: 0, color: 'var(--success)', fontSize: 13 }}>{info}</p> : null}
        <Button type="submit" variant="accent">
          Sign in
        </Button>
        <Button type="button" variant="ghost" onClick={() => void magicLink()}>
          Email magic link
        </Button>
      </form>
    </main>
  );
}

function minWidth() {
  return 'min(420px, calc(100% - 32px))';
}

const inputStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: 4,
  border: '1px solid var(--line)',
  borderRadius: 10,
  padding: '8px 10px',
  font: 'inherit',
  background: 'var(--paper)',
};
