import React, { useCallback, useEffect, useState } from 'react';

export const FIELD = 'w-full rounded-xl border border-[#E4D7EE] px-3 py-2 text-sm';
export const PRIMARY = 'px-4 py-2 rounded-full bg-[#5C2A6E] text-white text-sm disabled:opacity-60';
export const OUTLINE = 'px-4 py-2 rounded-full border border-[#E4D7EE] text-sm disabled:opacity-60';
export const DANGER = 'px-4 py-2 rounded-full bg-red-700 text-white text-sm disabled:opacity-60';

export const day = (value: string | null | undefined) => (value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const dayTime = (value: string | null | undefined) => (value ? new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
export const naira = (value: number) => `₦${value.toLocaleString()}`;

const CODES: Record<string, string> = {
  FORBIDDEN: 'You do not have permission to do that.',
  NOT_FOUND: 'That could not be found. It may already be gone.',
  SELF: 'You cannot do that to your own account.',
  REASON_REQUIRED: 'Say why first.',
  NAME_REQUIRED: 'Enter a name.',
  EMAIL_TAKEN: 'Another account already uses that email.',
  EMAIL_INVALID: 'Enter a real email address.',
  PHONE_INVALID: 'Enter a real telephone number. Gymnasts must have one.',
  LEVEL_INVALID: 'Choose a level from 1 to 10.',
  PASSWORD_SHORT: 'Give a password of at least 8 characters.',
  IS_CLUB_ADMIN: 'This is a club’s administrator. Delete the club instead, on the Clubs tab.',
  NOT_SUSPENDED: 'That account is already active.',
  CONFIRM_NAME: 'Type the club’s name exactly as it is shown.',
  VIDEO_LINK: 'That is not a YouTube link.',
  CATEGORY: 'Choose an apparatus.',
  EMPTY: 'There is nothing to save.',
  DATE: 'Choose the date of the event.',
  END_DATE: 'The last day cannot be before the first day.',
  LINK_INVALID: 'Links must start with https://.',
  MISSING: 'Fill in the title and the message.',
  AUDIENCE: 'Choose who this is for.',
  CLUB_REQUIRED: 'Choose the club.',
  FEE: 'Enter the monthly fee in naira, as a whole number.',
  TRIAL_DAYS: 'Free days must be a whole number from 0 to 365.',
  ALREADY_ADMIN: 'That account is already an administrator, or is suspended.',
  PERMISSIONS: 'Tick at least one area.',
};

export function adminError(error: unknown, fallback = 'That did not work. Try again.') {
  const { status, body } = error as { status?: number; body?: { code?: string } };
  if (!status) return 'Could not reach GymTrack. Check your connection and try again.';
  return CODES[body?.code ?? ''] ?? fallback;
}

/** Loads a tab's data once, and again on reload(). */
export function useLoad<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => load().then((result) => { setData(result); setError(null); }).catch((failure) => setError(adminError(failure, 'This could not be loaded. Try again.'))), [load]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, reload };
}

export interface Note {
  ok: boolean;
  text: string;
}

export const Flash: React.FC<{ note: Note | null }> = ({ note }) =>
  note ? <p className={`text-sm ${note.ok ? 'text-emerald-800' : 'text-red-600'}`} role={note.ok ? 'status' : 'alert'}>{note.text}</p> : null;

/** Runs an action, then says how it went. Refuses a second click while the first is working. */
export function useAction(after?: () => unknown) {
  const [note, setNote] = useState<Note | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (action: () => Promise<unknown>, done: string) => {
      setBusy(true);
      setNote(null);
      try {
        await action();
        setNote({ ok: true, text: done });
        await after?.();
        return true;
      } catch (failure) {
        setNote({ ok: false, text: adminError(failure) });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [after],
  );
  return { note, setNote, busy, run };
}

export const Card: React.FC<{ title?: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="bg-white border border-[#E4D7EE] rounded-2xl p-4 space-y-3 text-sm">
    {title && <h2 className="font-display text-xl text-[#3E1B4A]">{title}</h2>}
    {children}
  </section>
);

export const Tile: React.FC<{ label: string; value: number | string; hint?: string }> = ({ label, value, hint }) => (
  <div className="bg-white border border-[#E4D7EE] rounded-2xl p-4">
    <p className="text-3xl font-display text-[#3E1B4A]">{value}</p>
    <p className="text-sm text-[#241628]">{label}</p>
    {hint && <p className="text-xs text-[#5C4A68]">{hint}</p>}
  </div>
);

export const Table: React.FC<{ head: string[]; children: React.ReactNode }> = ({ head, children }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[#5C4A68] border-b border-[#E4D7EE]">
          {head.map((cell) => <th key={cell} className="py-2 pr-3 font-medium whitespace-nowrap">{cell}</th>)}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);

export const Loading: React.FC<{ error: string | null }> = ({ error }) =>
  error ? <p className="text-sm text-red-600" role="alert">{error}</p> : <p className="text-sm text-[#5C4A68]">Loading…</p>;

/** Two steps, so one slip of the finger cannot delete anything. */
export const ConfirmButton: React.FC<{ label: string; confirm: string; disabled?: boolean; onConfirm: () => void }> = ({ label, confirm, disabled, onConfirm }) => {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" disabled={disabled} onClick={() => setOpen(true)} className={OUTLINE}>{label}</button>;
  return (
    <span className="inline-flex flex-wrap gap-2">
      <button type="button" disabled={disabled} onClick={() => { setOpen(false); onConfirm(); }} className={DANGER}>{confirm}</button>
      <button type="button" onClick={() => setOpen(false)} className={OUTLINE}>Keep</button>
    </span>
  );
};
