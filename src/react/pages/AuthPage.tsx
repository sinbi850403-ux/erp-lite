import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';

export function AuthPage() {
  const {
    isPending,
    isReady,
    profile,
    signOut,
    loginWithEmailPassword,
    loginWithGoogleAccount,
    registerWithEmail,
    sendPasswordReset,
    user,
  } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const redirectTo =
    typeof location.state === 'object' && location.state && 'from' in location.state
      ? String(location.state.from || '/')
      : '/';

  if (isReady && user) {
    return <Navigate to={redirectTo} replace />;
  }

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleEmailLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (!form.email || !form.password) {
      setError('Enter your email and password.');
      return;
    }

    const result = await loginWithEmailPassword(form.email, form.password);
    if (!result) {
      setError('Login failed. Check your credentials and try again.');
    }
  }

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (!form.name || !form.email || !form.password) {
      setError('Enter name, email, and password.');
      return;
    }

    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError('Password confirmation does not match.');
      return;
    }

    const result = await registerWithEmail(form.email, form.password, form.name);
    if (!result) {
      setError('Signup could not be completed.');
      return;
    }

    setMessage('Signup request sent. Please verify your email.');
    setMode('login');
  }

  async function handlePasswordReset() {
    setMessage(null);
    setError(null);

    if (!form.email) {
      setError('Enter your email first to receive a reset link.');
      return;
    }

    const success = await sendPasswordReset(form.email);
    if (success) {
      setMessage('Password reset email sent.');
      return;
    }

    setError('Could not send password reset email.');
  }

  async function handleLogout() {
    await signOut();
  }

  return (
    <section className="react-page">
      <article className="react-card">
        <span className="react-chip">Auth page</span>
        <h2>React auth now owns the login entry for the new workspace.</h2>
        <p>
          Email login, Google OAuth redirect, signup, reset password, and sign out are all routed
          through the shared auth facade.
        </p>
      </article>

      <div className="react-grid react-grid--two-auth">
        <article className="react-card">
          <div className="react-segmented">
            <button type="button" className={mode === 'login' ? 'is-active' : ''} onClick={() => setMode('login')}>
              Login
            </button>
            <button type="button" className={mode === 'signup' ? 'is-active' : ''} onClick={() => setMode('signup')}>
              Signup
            </button>
          </div>

          <button type="button" className="react-auth-google" onClick={() => void loginWithGoogleAccount()} disabled={isPending}>
            Continue with Google
          </button>

          <div className="react-auth-divider">or continue with email</div>

          {mode === 'login' ? (
            <form className="react-auth-form" onSubmit={handleEmailLogin}>
              <label className="react-field">
                <span>Email</span>
                <input type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} />
              </label>
              <label className="react-field">
                <span>Password</span>
                <input type="password" value={form.password} onChange={(event) => updateField('password', event.target.value)} />
              </label>
              <button type="submit" className="react-auth-submit" disabled={isPending}>
                Sign in
              </button>
              <button type="button" className="react-auth-text-button" onClick={handlePasswordReset} disabled={isPending}>
                Send password reset
              </button>
            </form>
          ) : (
            <form className="react-auth-form" onSubmit={handleSignup}>
              <label className="react-field">
                <span>Name</span>
                <input type="text" value={form.name} onChange={(event) => updateField('name', event.target.value)} />
              </label>
              <label className="react-field">
                <span>Email</span>
                <input type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} />
              </label>
              <label className="react-field">
                <span>Password</span>
                <input type="password" value={form.password} onChange={(event) => updateField('password', event.target.value)} />
              </label>
              <label className="react-field">
                <span>Confirm password</span>
                <input
                  type="password"
                  value={form.confirmPassword}
                  onChange={(event) => updateField('confirmPassword', event.target.value)}
                />
              </label>
              <button type="submit" className="react-auth-submit" disabled={isPending}>
                Create account
              </button>
            </form>
          )}

          {error ? <p className="react-auth-feedback is-error">{error}</p> : null}
          {message ? <p className="react-auth-feedback is-success">{message}</p> : null}
        </article>

        <article className="react-card">
          <span className="react-card__eyebrow">Session</span>
          <h3>Current auth snapshot</h3>
          <div className="react-session-card">
            <div>
              <strong>Status</strong>
              <p>{isReady ? 'Ready' : 'Checking'}</p>
            </div>
            <div>
              <strong>User</strong>
              <p>{user?.email || 'Signed out'}</p>
            </div>
            <div>
              <strong>Role</strong>
              <p>{profile?.role || '-'}</p>
            </div>
            <div>
              <strong>Plan</strong>
              <p>{profile?.plan || '-'}</p>
            </div>
          </div>

          <button type="button" className="react-auth-logout" onClick={handleLogout} disabled={!user || isPending}>
            Sign out
          </button>
        </article>
      </div>
    </section>
  );
}
