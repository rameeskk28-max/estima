import { useState } from 'react';
import { Eye, EyeOff, LoaderCircle, LockKeyhole, LogIn, Moon, Sun, User } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { BRAND } from '../../brand.js';

/** Full-screen sign-in shown before the site opens. Accounts are created by the administrator in Supabase. */
export function LoginPage({ credit }) {
  const { cloudSignIn, theme, setTheme } = useStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const light = theme === 'light';

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await cloudSignIn(username, password);
    } catch (err) {
      setError(/invalid/i.test(err.message) ? 'Incorrect username or password.' : err.message || 'Sign-in failed. Check your connection and try again.');
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`bg-grid-pattern relative flex min-h-screen flex-col bg-ink-900 text-slate-200 ${light ? 'theme-light' : ''}`}>
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className={`absolute -left-40 -top-40 h-[520px] w-[520px] animate-pulse-glow rounded-full blur-[130px] ${light ? 'bg-brand-500/15' : 'bg-brand-600/20'}`} />
        <div className={`absolute -right-40 bottom-0 h-[480px] w-[480px] animate-pulse-glow rounded-full blur-[130px] ${light ? 'bg-navy-500/10' : 'bg-navy-500/15'}`} style={{ animationDelay: '2s' }} />
      </div>

      <div className="relative flex justify-end p-4">
        <button onClick={() => setTheme(light ? 'dark' : 'light')} className="glass-pill flex h-10 w-10 items-center justify-center rounded-xl text-slate-300 transition hover:text-slate-50" aria-label="Toggle theme">
          {light ? <Moon size={17} /> : <Sun size={17} />}
        </button>
      </div>

      <main className="relative flex flex-1 items-center justify-center px-4 pb-10">
        <div className="w-full max-w-md">
          <div className="mb-6 flex flex-col items-center text-center">
            <span className="rounded-2xl bg-white px-4 py-2.5 shadow-lg shadow-brand-500/10">
              <img src={BRAND.logoUrl} alt={BRAND.legalName} className="h-10 w-auto" />
            </span>
            <h1 className="mt-5 font-display text-3xl font-bold tracking-tight text-slate-50">
              Pump Engineering <span className="text-brand-400">Suite</span>
            </h1>
            <p className="mt-1 text-sm text-slate-400">Calculations · Pump schedules · Technical submittals</p>
          </div>

          <form onSubmit={submit} className="card space-y-4 rounded-3xl p-6 sm:p-8">
            <div className="flex items-center gap-2 font-display text-lg font-bold text-slate-50">
              <LockKeyhole size={18} className="text-brand-400" /> Sign in
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Username</span>
              <span className="relative block">
                <User size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input className="field !pl-9" autoFocus autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} required />
              </span>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Password</span>
              <span className="relative block">
                <LockKeyhole size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input className="field !pl-9 !pr-10" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-200" aria-label={show ? 'Hide password' : 'Show password'}>
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </span>
            </label>
            {error && (
              <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {error}
              </p>
            )}
            <button className="btn-primary w-full !py-3 text-base" type="submit" disabled={busy || !username || !password}>
              {busy ? <LoaderCircle size={18} className="animate-spin" /> : <LogIn size={18} />} Sign in
            </button>
            <p className="text-center text-[11px] text-slate-500">Authorised Greenland users only. Forgot your password? Ask the site administrator.</p>
          </form>
        </div>
      </main>
      <footer className="relative pb-6 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} {BRAND.legalName}
        <div className="mt-1">{credit}</div>
      </footer>
    </div>
  );
}

export function AuthSplash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-900">
      <LoaderCircle className="animate-spin text-brand-400" size={28} />
    </div>
  );
}
