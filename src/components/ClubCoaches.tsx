import React, { useState } from 'react';
import { Trash2, UserPlus } from 'lucide-react';
import { useGym } from '../context/GymContext';
import { gymApi } from '../services/gymApi';
import { PasswordInput } from './PasswordInput';

const FIELD = 'w-full rounded-xl border border-[#E4D7EE] px-3 py-2 text-sm';

const ERRORS: Record<string, string> = {
  EMAIL_TAKEN: 'That email already has a GymTrack account. Use another one.',
  EMAIL_INVALID: 'Enter a valid email address.',
  PASSWORD_SHORT: 'The temporary password needs at least 8 characters.',
  PHONE_INVALID: 'Enter a full telephone number, for example 0803 123 4567.',
  NAME_REQUIRED: 'Enter the coach’s name.',
  TOO_MANY: 'This club has reached the limit of 50 coaches.',
};

/** The club administrator gives each coach their own sign-in, and can take it away. */
export const ClubCoaches: React.FC = () => {
  const { clubOverview, refreshOverview, userRole } = useGym();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (userRole !== 'CLUB_ADMIN') return null;
  const coaches = clubOverview?.coaches ?? [];

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      await gymApi.addCoach({ name: name.trim(), email: email.trim(), phone: phone.trim(), password });
      await refreshOverview();
      setNote({ ok: true, text: `${name.trim()} can now use Club sign in with ${email.trim()} and the temporary password you chose. Ask them to change it on their profile.` });
      setName('');
      setEmail('');
      setPhone('');
      setPassword('');
    } catch (failure) {
      const code = (failure as { body?: { code?: string } }).body?.code ?? '';
      setNote({ ok: false, text: ERRORS[code] ?? 'The coach could not be added. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    setNote(null);
    try {
      await gymApi.removeCoach(id);
      await refreshOverview();
      setConfirmId(null);
      setNote({ ok: true, text: 'Coach removed. They can no longer sign in.' });
    } catch {
      setNote({ ok: false, text: 'The coach could not be removed. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="club-coaches" className="bg-white border border-[#E4D7EE] rounded-2xl p-4 space-y-3">
      <h2 className="font-display text-2xl text-[#3E1B4A] flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#5C2A6E] to-[#3E1B4A] text-white flex items-center justify-center shrink-0" aria-hidden="true">
          <UserPlus className="w-5 h-5" />
        </span>
        Coaches
      </h2>
      <p className="text-sm text-[#5C4A68]">
        Each coach gets their own sign-in. They can review skill videos, take attendance, send fee reminders and post notices. They cannot add gymnasts, add other coaches or change the club’s details.
      </p>
      {coaches.map((coach) => (
        <div key={coach.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-[#F4EEF8] pt-2 text-sm">
          <span>
            {coach.name}
            <span className="block text-xs text-[#5C4A68] break-all">{coach.email}{coach.phone ? ` · ${coach.phone}` : ''}</span>
          </span>
          {confirmId === coach.id ? (
            <span className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => remove(coach.id)} className="px-3 py-1.5 rounded-full bg-red-700 text-white disabled:opacity-60">Remove coach</button>
              <button type="button" onClick={() => setConfirmId(null)} className="px-3 py-1.5 rounded-full border border-[#E4D7EE]">Keep</button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmId(coach.id)} className="p-2 rounded-full text-[#5C4A68] hover:text-red-700 hover:bg-[#F4EEF8]" aria-label={`Remove coach ${coach.name}`}>
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
      <form onSubmit={add} className="grid sm:grid-cols-2 gap-2 border-t border-[#F4EEF8] pt-3">
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Coach name" aria-label="Coach name" className={FIELD} />
        <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Coach email" aria-label="Coach email" className={FIELD} />
        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telephone (optional)" aria-label="Coach telephone" className={FIELD} />
        <PasswordInput required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Temporary password (8+ characters)" aria-label="Coach temporary password" className={FIELD} />
        <button disabled={busy} className="sm:col-span-2 px-4 py-2 rounded-full bg-[#5C2A6E] text-white text-sm disabled:opacity-60">{busy ? 'Saving…' : 'Add coach'}</button>
      </form>
      {note && <p className={`text-sm ${note.ok ? 'text-emerald-800' : 'text-red-600'}`} role={note.ok ? 'status' : 'alert'}>{note.text}</p>}
    </section>
  );
};
