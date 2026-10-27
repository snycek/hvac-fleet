import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { AUTH_ENABLED } from '../lib/firebase.js';

// Friendly words for Firebase sign-in errors.
const MESSAGES = {
  'auth/invalid-credential': 'That ID and password don\'t match.',
  'auth/wrong-password': 'That ID and password don\'t match.',
  'auth/user-not-found': 'That ID and password don\'t match.',
  'auth/invalid-email': 'Enter your ID, like "owner".',
  'auth/too-many-requests': 'Too many tries. Wait a few minutes and try again.',
  'auth/user-disabled': 'This account is turned off. Ask the owner.',
  'auth/network-request-failed': 'No connection. Check your internet and try again.',
};

/** Staff sign-in (real Firebase accounts). */
export default function Login({ setPage }) {
  const { signIn, role, authReady, loginDemo } = useApp();
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState({ busy: false, error: '' });

  // Once signed in (and the server confirms the role), go to that screen.
  useEffect(() => {
    if (role) setPage(role);
  }, [role, setPage]);

  const submit = async e => {
    e.preventDefault();
    if (!id.trim() || !password) { setState({ busy: false, error: 'Enter your ID and password.' }); return; }
    setState({ busy: true, error: '' });
    try {
      await signIn(id, password);
      // The app picks up the sign-in and moves on (see the effect above).
    } catch (err) {
      setState({ busy: false, error: MESSAGES[err.code] || 'Could not sign in. Try again.' });
    }
  };

  return (
    <div style={{ minHeight: 'calc(100vh - 56px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
      <div style={{ maxWidth: '420px', width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '12px' }}>🌱</div>
        <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '8px' }}>John's Lawn Portal</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: '28px', fontSize: '15px' }}>Sign in with your staff ID.</p>

        {AUTH_ENABLED ? (
          <form className="card" onSubmit={submit} style={{ padding: '20px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label className="form-label" htmlFor="login-id">ID</label>
              <input id="login-id" className="form-input" value={id} onChange={e => setId(e.target.value)} placeholder="owner" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
            </div>
            <div>
              <label className="form-label" htmlFor="login-pw">Password</label>
              <input id="login-pw" className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
            {state.error && <div role="alert" style={{ color: '#f85149', fontSize: '13px' }}>{state.error}</div>}
            <button type="submit" className="btn-primary" disabled={state.busy || !authReady} style={{ padding: '12px', fontSize: '15px' }}>
              {state.busy ? 'Signing in…' : 'Sign in'}
            </button>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>Forgot your password? Ask the owner to reset it.</div>
          </form>
        ) : import.meta.env.DEV ? (
          // Local testing without Firebase set up: pick a screen (never in the live build).
          <div className="card" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Sign-in isn't set up on this computer. Local testing only:</div>
            {[['owner', '📊 Owner'], ['technician', '🔧 Foreman'], ['manager', '📋 Manager']].map(([r, label]) => (
              <button key={r} type="button" className="btn-ghost" onClick={() => { loginDemo(r); setPage(r); }}>{label}</button>
            ))}
          </div>
        ) : (
          <div className="card" style={{ padding: '18px', color: 'var(--text-muted)' }}>Sign-in isn't available right now.</div>
        )}

        <button type="button" className="btn-ghost" onClick={() => setPage('home')} style={{ marginTop: '20px', fontSize: '13px' }}>← Back to home</button>
      </div>
    </div>
  );
}
