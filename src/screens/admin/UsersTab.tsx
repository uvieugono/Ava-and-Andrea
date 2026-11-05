import React, { useCallback, useState } from 'react';
import { useGym } from '../../context/GymContext';
import { whatsappLink } from '../../lib/support';
import { adminApi, AdminUserRow } from '../../services/adminApi';
import { gymApi, OperatorResetLink } from '../../services/gymApi';
import { adminError, Card, ConfirmButton, day, DANGER, FIELD, Flash, Loading, OUTLINE, PRIMARY, useAction, useLoad } from './adminUi';

const ROLE: Record<string, string> = { GYMNAST: 'Gymnast', CLUB_ADMIN: 'Club administrator', COACH: 'Coach', ADMIN: 'Administrator' };
const STATE: Record<AdminUserRow['state'], string> = { active: 'Active', suspended: 'Suspended', deactivated: 'Deactivated' };
const STATE_STYLE: Record<AdminUserRow['state'], string> = { active: 'bg-[#F4EEF8] text-[#3E1B4A]', suspended: 'bg-red-50 text-red-800', deactivated: 'bg-amber-50 text-amber-900' };

export const UsersTab: React.FC = () => {
  const { adminOwner, user: me } = useGym();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [state, setState] = useState('');
  const load = useCallback(() => adminApi.users({ q, role, state }), [q, role, state]);
  const { data, error, reload } = useLoad(load);
  const { note, busy, run, setNote } = useAction(reload);
  const [openId, setOpenId] = useState<string | null>(null);
  const [mode, setMode] = useState<'edit' | 'suspend' | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', level: 1 });
  const [reason, setReason] = useState('');
  const [link, setLink] = useState<(OperatorResetLink & { url: string }) | null>(null);

  const open = (row: AdminUserRow, next: 'edit' | 'suspend') => {
    setOpenId(row.id);
    setMode(next);
    setNote(null);
    setForm({ name: row.name, email: row.email, phone: row.phone ?? '', level: row.level ?? 1 });
    setReason('');
  };
  const close = () => { setOpenId(null); setMode(null); };

  const makeLink = async (row: AdminUserRow) => {
    setNote(null);
    setLink(null);
    try {
      const made = await gymApi.operatorResetLink(row.email);
      setLink({ ...made, url: `${window.location.origin}/?reset=${made.token}` });
    } catch (failure) {
      setNote({ ok: false, text: adminError(failure, 'The link could not be made. Try again.') });
    }
  };

  /** Only an owner may touch another administrator. The server refuses it too. */
  const locked = (row: AdminUserRow) => row.id === me.id || row.isOwner || (row.isAdmin && !adminOwner);

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone or club" aria-label="Search accounts" className={FIELD} />
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Type of account" className={FIELD}>
          <option value="">All types of account</option>
          {Object.entries(ROLE).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select value={state} onChange={(e) => setState(e.target.value)} aria-label="State of account" className={FIELD}>
          <option value="">Active, suspended and deactivated</option>
          {Object.entries(STATE).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <Flash note={note} />
      {link && (
        <Card title={`Password reset link for ${link.name}`}>
          <p className="text-[#5C4A68]">Check it is really them first. Send it only to the telephone number on the account. It works once, for 24 hours.</p>
          <input readOnly value={link.url} aria-label="Reset link" onFocus={(e) => e.target.select()} className={`${FIELD} text-xs`} />
          <div className="flex flex-wrap gap-2">
            {link.phone ? (
              <a href={whatsappLink(link.phone, `Hello ${link.name}, use this link to choose a new GymTrack password. It works once, for 24 hours: ${link.url}`)} target="_blank" rel="noopener noreferrer" className={PRIMARY}>
                Send on WhatsApp to {link.phone}
              </a>
            ) : <p>No telephone number on file. Find another safe way to give it to them.</p>}
            <button type="button" onClick={() => setLink(null)} className={OUTLINE}>Done</button>
          </div>
        </Card>
      )}
      {!data ? <Loading error={error} /> : (
        <>
          <p className="text-sm text-[#5C4A68]">{data.users.length} {data.users.length === 1 ? 'account' : 'accounts'}</p>
          {data.users.map((row) => (
            <article key={row.id} className="bg-white border border-[#E4D7EE] rounded-2xl p-4 space-y-2 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold text-[#3E1B4A]">{row.name}{row.isOwner ? ' · Owner' : row.isAdmin ? ' · Administrator' : ''}</h2>
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATE_STYLE[row.state]}`}>{STATE[row.state]}</span>
              </div>
              <p className="text-[#5C4A68]">
                {ROLE[row.role] ?? row.role}{row.level ? ` · Level ${row.level}` : ''}{row.clubName ? ` · ${row.clubName}` : ''} · {row.email}{row.phone ? ` · ${row.phone}` : ''}
              </p>
              <p className="text-xs text-[#5C4A68]">Registered {day(row.createdAt)} · Last signed in {day(row.lastLoginAt)}</p>
              {row.suspendedReason && <p>Reason given: “{row.suspendedReason}”</p>}

              {openId === row.id && mode === 'edit' && (
                <form
                  className="grid sm:grid-cols-2 gap-2 border-t border-[#F4EEF8] pt-2"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const saved = await run(() => adminApi.updateUser(row.id, { name: form.name, email: form.email, phone: form.phone, ...(row.role === 'GYMNAST' ? { level: Number(form.level) } : {}) }), `${form.name} is updated.`);
                    if (saved) close();
                  }}
                >
                  <label>Name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={FIELD} /></label>
                  <label>Email<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={FIELD} /></label>
                  <label>Telephone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={FIELD} /></label>
                  {row.role === 'GYMNAST' && (
                    <label>Level
                      <select value={form.level} onChange={(e) => setForm({ ...form, level: Number(e.target.value) })} className={FIELD}>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>Level {n}</option>)}
                      </select>
                    </label>
                  )}
                  <div className="sm:col-span-2 flex gap-2">
                    <button disabled={busy} className={PRIMARY}>Save</button>
                    <button type="button" onClick={close} className={OUTLINE}>Cancel</button>
                  </div>
                </form>
              )}

              {openId === row.id && mode === 'suspend' && (
                <form
                  className="space-y-2 border-t border-[#F4EEF8] pt-2"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const saved = await run(() => adminApi.suspendUser(row.id, reason.trim()), `${row.name} is suspended and signed out.`);
                    if (saved) close();
                  }}
                >
                  <label className="block">Why? This is kept with the account.<input required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className={FIELD} /></label>
                  <div className="flex gap-2">
                    <button disabled={busy} className={DANGER}>Suspend account</button>
                    <button type="button" onClick={close} className={OUTLINE}>Cancel</button>
                  </div>
                </form>
              )}

              {openId !== row.id && !locked(row) && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => open(row, 'edit')} className={OUTLINE}>Edit</button>
                  {row.state === 'active' && <button type="button" onClick={() => makeLink(row)} className={OUTLINE}>Reset password</button>}
                  {row.state === 'active'
                    ? <button type="button" onClick={() => open(row, 'suspend')} className={OUTLINE}>Suspend</button>
                    : <button type="button" disabled={busy} onClick={() => run(() => adminApi.restoreUser(row.id), `${row.name} can sign in again.`)} className={PRIMARY}>Restore</button>}
                  {row.role !== 'CLUB_ADMIN' && (
                    <ConfirmButton label="Delete" confirm="Delete for good" disabled={busy} onConfirm={() => run(() => adminApi.deleteUser(row.id), `${row.name}’s account and files are deleted.`)} />
                  )}
                </div>
              )}
            </article>
          ))}
        </>
      )}
    </div>
  );
};
