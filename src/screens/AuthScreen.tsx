import React, { useEffect, useState } from 'react';
import { useGym } from '../context/GymContext';
import { ApiUser, gymApi, PublicSettings, setAccess, setMediaToken, setToken } from '../services/gymApi';
import { USAGLevel } from '../types';
import { Logo } from '../components/Logo';
import { Sparkles } from 'lucide-react';
import { PasswordInput } from '../components/PasswordInput';
import { PageSketch } from '../components/GymnastSketch';
import { ForgotPassword, ResetPassword } from '../components/PasswordRecovery';

type Who = 'student' | 'club' | 'admin';
type Action = 'register' | 'signin';

const FIELD = 'w-full rounded-2xl border border-[#E4D7EE] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5C2A6E]';
const CHOICE_ON = 'bg-[#5C2A6E] text-white border-[#5C2A6E]';
const CHOICE_OFF = 'bg-white text-[#5C4A68] border-[#E4D7EE]';
const MIN_PASSWORD = 8;

const REGISTER_ERRORS: Record<string, string> = {
  EMAIL_INVALID: 'Enter a valid email address.',
  PASSWORD_SHORT: `Choose a password of at least ${MIN_PASSWORD} characters.`,
  PHONE_INVALID: 'Enter a full telephone number, for example 0803 123 4567.',
  DOB_INVALID: 'Enter a real date of birth.',
  NAME_REQUIRED: 'Enter a name of up to 120 characters.',
  CITY_REQUIRED: 'Enter the city.',
  LEVEL_INVALID: 'Choose a level from 1 to 10.',
  MISSING: 'Fill in every field.',
  TOO_MANY: 'Too many new accounts from this connection. Please try again in an hour.',
  SIGNUPS_CLOSED: 'New registrations are closed for now. Please try again later.',
};

function registerError(error: unknown) {
  const { status, body } = error as { status?: number; body?: { code?: string } };
  const code = body?.code ?? '';
  if (status === 409) return 'That email is already registered. Use Sign in instead.';
  if (!status) return 'Could not reach GymTrack. Check your connection and try again.';
  return REGISTER_ERRORS[code] ?? 'The account could not be created. Check every field and try again.';
}

function signInError(error: unknown) {
  const { status, body } = error as { status?: number; body?: { code?: string } };
  if (body?.code === 'SUSPENDED') return 'This account has been suspended. Ask your club or GymTrack for help.';
  if (status === 401) return 'Email or password is wrong.';
  if (status === 429) return 'Too many wrong passwords. Please wait 15 minutes and try again.';
  return 'Could not reach GymTrack. Check your connection and try again.';
}

export const AuthScreen: React.FC = () => {
  const { loginFromServer } = useGym();
  const [who, setWho] = useState<Who>('student');
  const [action, setAction] = useState<Action>('signin');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('2014-01-01');
  const [level, setLevel] = useState<USAGLevel>(1);
  const [clubName, setClubName] = useState('');
  const [city, setCity] = useState('Lagos');
  const [clubId, setClubId] = useState('');
  const [clubs, setClubs] = useState<{ id: string; name: string; city: string }[]>([]);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [resetToken, setResetToken] = useState(() => new URLSearchParams(window.location.search).get('reset'));
  const [notice, setNotice] = useState<string | null>(null);
  const [settings, setSettings] = useState<PublicSettings | null>(null);

  useEffect(() => {
    gymApi.registeredClubs().then((result) => setClubs(result.clubs)).catch(() => setClubs([]));
    gymApi.publicSettings().then(setSettings).catch(() => setSettings(null));
  }, []);

  const choose = (nextWho: Who, nextAction: Action) => {
    setWho(nextWho);
    setAction(nextAction);
    setError(null);
    setNotice(null);
  };

  const finishReset = (changed: boolean) => {
    // The link has done its job: take it out of the address bar.
    const url = new URL(window.location.href);
    url.searchParams.delete('reset');
    window.history.replaceState(null, '', url.toString());
    setResetToken(null);
    setNotice(changed ? 'Your password is changed. Sign in with the new one.' : null);
  };

  const enter = (user: ApiUser) => {
    loginFromServer(user);
  };

  const onSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await gymApi.login(email, password);
      const isClubAccount = result.user.role === 'CLUB_ADMIN' || result.user.role === 'COACH';
      if (who === 'admin' && !result.user.operator) {
        setError('That account is not a GymTrack administrator.');
        return;
      }
      if (who !== 'admin' && result.user.role === 'ADMIN') {
        setError('That is an administrator account. Use Admin sign in.');
        return;
      }
      if (who === 'club' && !isClubAccount) {
        setError('That is a student account. Use Student sign in.');
        return;
      }
      if (who === 'student' && isClubAccount) {
        setError('That is a club account. Use Club sign in.');
        return;
      }
      setToken(result.token);
      setMediaToken(result.mediaToken);
      setAccess(result.user.access ?? result.user.status, result.payment, false, result.user.periodEnd ?? null);
      loginFromServer(result.user, who === 'admin' ? 'operator' : undefined);
    } catch (failure) {
      setError(signInError(failure));
    } finally {
      setBusy(false);
    }
  };

  const onRegisterStudent = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await gymApi.signupStudent({ name, email, password, phone, level, dateOfBirth, selectedClubId: clubId || null, acceptedPrivacy });
      setToken(result.token);
      setMediaToken(result.mediaToken);
      setAccess(result.user.access ?? result.user.status, result.payment, result.devMatch, result.user.periodEnd ?? null);
      enter(result.user);
    } catch (failure) {
      setError(registerError(failure));
    } finally {
      setBusy(false);
    }
  };

  const onRegisterClub = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await gymApi.registerClub({ clubName, city, adminName: name, email, password, phone, acceptedPrivacy });
      setToken(result.token);
      setMediaToken(result.mediaToken);
      setAccess(result.user.access ?? result.user.status, result.payment, false, result.user.periodEnd ?? null);
      enter(result.user);
    } catch (failure) {
      setError(registerError(failure));
    } finally {
      setBusy(false);
    }
  };

  const heading =
    action === 'register'
      ? who === 'student' ? 'New student registration' : 'New club registration'
      : who === 'admin' ? 'Admin sign in' : who === 'student' ? 'Student sign in' : 'Club sign in';
  const closed = action === 'register' && settings !== null && !(who === 'student' ? settings.gymnastSignupsOpen : settings.clubSignupsOpen);
  const subline =
    action === 'register'
      ? 'First time on GymTrack? Create your account.'
      : 'Already registered? Sign in to continue.';

  return (
    <div className="min-h-screen bg-[#F7F4FB] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white/95 rounded-3xl p-6 border border-[#E4D7EE] space-y-4">
        <div className="text-center flex flex-col items-center">
          <Logo size="lg" />
          <p className="inline-flex items-center gap-1 text-[11px] font-bold text-[#3E1B4A] bg-[#F4EEF8] border border-[#E4D7EE] rounded-full px-3 py-1 mt-2">
            <Sparkles className="w-3.5 h-3.5 text-[#5C2A6E]" /> Train. Improve. Level Up.
          </p>
        </div>

        {resetToken ? (
          <ResetPassword token={resetToken} onDone={finishReset} />
        ) : forgot ? (
          <ForgotPassword onBack={() => setForgot(false)} />
        ) : (
          <>
            <div className="space-y-6">
              <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#5C4A68]">New to GymTrack? Register</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => choose('student', 'register')} className={`py-2 rounded-full text-xs font-bold border ${who === 'student' && action === 'register' ? CHOICE_ON : CHOICE_OFF}`}>
                  Register as a student
                </button>
                <button type="button" onClick={() => choose('club', 'register')} className={`py-2 rounded-full text-xs font-bold border ${who === 'club' && action === 'register' ? CHOICE_ON : CHOICE_OFF}`}>
                  Register a club
                </button>
              </div>
              </div>
              <div className="space-y-2 pt-5 border-t border-[#E4D7EE]">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#5C4A68]">Already registered? Sign in</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => choose('student', 'signin')} className={`py-2 rounded-full text-xs font-bold border ${who === 'student' && action === 'signin' ? CHOICE_ON : CHOICE_OFF}`}>
                  Student sign in
                </button>
                <button type="button" onClick={() => choose('club', 'signin')} className={`py-2 rounded-full text-xs font-bold border ${who === 'club' && action === 'signin' ? CHOICE_ON : CHOICE_OFF}`}>
                  Club sign in
                </button>
              </div>
              </div>
            </div>

            <div className="text-center">
              <h1 className="text-lg font-black text-[#3E1B4A]">{heading}</h1>
              <p className="text-xs text-[#5C4A68]">{subline}</p>
            </div>

            <form
              onSubmit={action === 'signin' ? onSignIn : who === 'student' ? onRegisterStudent : onRegisterClub}
              className="space-y-3"
            >
              {action === 'register' && (
                <input required value={name} onChange={(e) => setName(e.target.value)} placeholder={who === 'club' ? 'Your name' : 'Student name'} className={FIELD} />
              )}
              {action === 'register' && who === 'club' && (
                <>
                  <input required value={clubName} onChange={(e) => setClubName(e.target.value)} placeholder="Club name" className={FIELD} />
                  <input required value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className={FIELD} />
                </>
              )}
              {action === 'register' && who === 'student' && (
                <>
                  <label className="block text-xs text-[#5C4A68]">
                    Date of birth
                    <input required type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className={`${FIELD} mt-1`} />
                  </label>
                  <select value={level} onChange={(e) => setLevel(Number(e.target.value) as USAGLevel)} className={FIELD} aria-label="Level">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>Level {n}</option>)}
                  </select>
                  <select value={clubId} onChange={(e) => setClubId(e.target.value)} className={FIELD} aria-label="Your club">
                    <option value="">I have not chosen a club yet</option>
                    {clubs.map((club) => <option key={club.id} value={club.id}>{club.name} ({club.city})</option>)}
                  </select>
                </>
              )}
              {action === 'register' && (
                <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telephone number" className={FIELD} />
              )}
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={FIELD} />
              <PasswordInput required minLength={action === 'register' ? MIN_PASSWORD : undefined} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={action === 'register' ? `Password (at least ${MIN_PASSWORD} characters)` : 'Password'} className={FIELD} />
              {action === 'register' && who === 'student' && (
                <p className="text-xs text-[#5C4A68]">GymTrack is free for gymnasts. Choose your club and it reviews your skills.</p>
              )}
              {action === 'register' && who === 'club' && (
                <p className="text-xs text-[#5C4A68]">GymTrack checks each new club before gymnasts can choose it. Your {settings?.trialDays ?? 7} free days start when your club is approved. After that, the office is ₦{(settings?.monthlyFeeNgn ?? 1000).toLocaleString()} a month.</p>
              )}
              {action === 'register' && (
                <label className="flex items-start gap-2 text-xs text-[#241628]">
                  <input required type="checkbox" checked={acceptedPrivacy} onChange={(e) => setAcceptedPrivacy(e.target.checked)} className="mt-0.5" />
                  <span>
                    I have read the <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-[#5C2A6E] underline">Privacy Policy</a>
                    {who === 'student' ? '. If I am under 18, my parent or guardian has read it and agrees.' : ' and agree to it on behalf of my club.'}
                  </span>
                </label>
              )}
              {closed && <p className="text-sm text-[#3E1B4A]" role="status">New {who === 'student' ? 'student' : 'club'} registrations are closed for now. Please try again later.</p>}
              {notice && <p className="text-sm text-emerald-800" role="status">{notice}</p>}
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button disabled={busy || closed} className="w-full py-3 rounded-full bg-[#5C2A6E] text-white font-bold disabled:opacity-60">
                {busy ? 'Please wait…' : action === 'signin' ? 'Sign in' : 'Create account'}
              </button>
              {action === 'signin' && (
                <button type="button" onClick={() => { setForgot(true); setError(null); setNotice(null); }} className="w-full py-1 text-sm text-[#5C2A6E] underline">Forgot your password?</button>
              )}
            </form>
          </>
        )}
        <p className="text-center text-xs space-x-3">
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-[#5C2A6E] underline">Privacy Policy</a>
          {!resetToken && !forgot && <button type="button" onClick={() => choose('admin', 'signin')} className="text-[#5C2A6E] underline">Admin sign in</button>}
        </p>
      </div>
      <PageSketch page="auth" />
    </div>
  );
};
