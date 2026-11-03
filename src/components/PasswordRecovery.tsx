import React, { useState } from 'react';
import { gymApi } from '../services/gymApi';
import { SUPPORT_WHATSAPP_DISPLAY, SUPPORT_WHATSAPP_INTERNATIONAL, whatsappLink } from '../lib/support';
import { PasswordInput } from './PasswordInput';

const FIELD = 'w-full rounded-2xl border border-[#E4D7EE] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5C2A6E]';
const MAIN_BUTTON = 'w-full py-3 rounded-full bg-[#5C2A6E] text-white font-bold disabled:opacity-60';

export const MIN_PASSWORD = 8;

/** Asks for a reset link. The answer is the same whether or not the email has an account. */
export const ForgotPassword: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ emailed: boolean } | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setSent(await gymApi.forgotPassword(email.trim()));
    } catch (failure) {
      setError((failure as { status?: number }).status === 429
        ? 'Too many requests from this connection. Please try again in an hour.'
        : 'Could not reach GymTrack. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="space-y-3 text-sm text-[#241628]">
        <h1 className="text-lg font-black text-[#3E1B4A] text-center">Check your messages</h1>
        {sent.emailed ? (
          <p>If that email has a GymTrack account, a reset link is on its way. It works once, for one hour. Check your spam folder too.</p>
        ) : (
          <>
            <p>If that email has a GymTrack account, the GymTrack team has your request. They will send a reset link on WhatsApp to the telephone number on the account.</p>
            <a href={whatsappLink(SUPPORT_WHATSAPP_INTERNATIONAL, 'Hello GymTrack, I need to reset my password.')} target="_blank" rel="noopener noreferrer" className="block text-center py-2 rounded-full border border-[#5C2A6E] text-[#5C2A6E] font-semibold">
              Message GymTrack on {SUPPORT_WHATSAPP_DISPLAY}
            </a>
          </>
        )}
        <button type="button" onClick={onBack} className="w-full py-2 text-[#5C2A6E] underline">Back to sign in</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="text-center">
        <h1 className="text-lg font-black text-[#3E1B4A]">Forgot your password?</h1>
        <p className="text-xs text-[#5C4A68]">Enter the email you registered with.</p>
      </div>
      <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={FIELD} />
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      <button disabled={busy} className={MAIN_BUTTON}>{busy ? 'Please wait…' : 'Send reset link'}</button>
      <button type="button" onClick={onBack} className="w-full py-2 text-sm text-[#5C2A6E] underline">Back to sign in</button>
    </form>
  );
};

/** Opened from a reset link (/?reset=…). */
export const ResetPassword: React.FC<{ token: string; onDone: (changed: boolean) => void }> = ({ token, onDone }) => {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await gymApi.resetPassword(token, password);
      onDone(true);
    } catch (failure) {
      const { status, body } = failure as { status?: number; body?: { code?: string } };
      if (body?.code === 'RESET_INVALID') setError('This link has run out or was already used. Ask for a new one.');
      else if (body?.code === 'PASSWORD_SHORT') setError(`Choose a password of at least ${MIN_PASSWORD} characters.`);
      else setError(status ? 'The password could not be changed. Try again.' : 'Could not reach GymTrack. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="text-center">
        <h1 className="text-lg font-black text-[#3E1B4A]">Choose a new password</h1>
        <p className="text-xs text-[#5C4A68]">You will then sign in with it. Any other device is signed out.</p>
      </div>
      <PasswordInput required minLength={MIN_PASSWORD} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={`New password (at least ${MIN_PASSWORD} characters)`} className={FIELD} />
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      <button disabled={busy} className={MAIN_BUTTON}>{busy ? 'Please wait…' : 'Save new password'}</button>
      <button type="button" onClick={() => onDone(false)} className="w-full py-2 text-sm text-[#5C2A6E] underline">Back to sign in</button>
    </form>
  );
};

/** On the profile page: change the password while signed in. */
export const ChangePassword: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      await gymApi.changePassword(current, next);
      setCurrent('');
      setNext('');
      setOpen(false);
      setNote({ ok: true, text: 'Password changed. Any other device has been signed out.' });
    } catch (failure) {
      const code = (failure as { body?: { code?: string } }).body?.code;
      setNote({
        ok: false,
        text: code === 'WRONG_PASSWORD' ? 'Your current password is not right.' : code === 'PASSWORD_SHORT' ? `Choose a new password of at least ${MIN_PASSWORD} characters.` : 'The password could not be changed. Try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-3 rounded-2xl bg-[#F7F4FB] border border-[#E4D7EE] space-y-2 text-xs">
      {!open && (
        <button type="button" onClick={() => { setOpen(true); setNote(null); }} className="font-bold text-[#3E1B4A] underline">Change password</button>
      )}
      {open && (
        <form onSubmit={submit} className="space-y-2">
          <PasswordInput required value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Current password" className={FIELD} />
          <PasswordInput required minLength={MIN_PASSWORD} value={next} onChange={(e) => setNext(e.target.value)} placeholder={`New password (at least ${MIN_PASSWORD} characters)`} className={FIELD} />
          <div className="flex gap-2">
            <button disabled={busy} className="px-4 py-2 rounded-full bg-[#5C2A6E] text-white font-bold disabled:opacity-60">{busy ? 'Saving…' : 'Save new password'}</button>
            <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 rounded-full border border-[#E4D7EE]">Cancel</button>
          </div>
        </form>
      )}
      {note && <p className={note.ok ? 'text-emerald-800' : 'text-red-600'} role={note.ok ? 'status' : 'alert'}>{note.text}</p>}
    </div>
  );
};
