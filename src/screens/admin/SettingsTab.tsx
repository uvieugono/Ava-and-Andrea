import React, { useEffect, useState } from 'react';
import { useGym } from '../../context/GymContext';
import { adminApi, AdminPermission, AdminRow, PERMISSION_LABELS } from '../../services/adminApi';
import { gymApi, PublicSettings } from '../../services/gymApi';
import { Card, ConfirmButton, dayTime, FIELD, Flash, Loading, OUTLINE, PRIMARY, useAction, useLoad } from './adminUi';

const ALL = Object.keys(PERMISSION_LABELS) as AdminPermission[];

const Ticks: React.FC<{ value: AdminPermission[]; onChange: (next: AdminPermission[]) => void }> = ({ value, onChange }) => (
  <div className="grid sm:grid-cols-2 gap-1">
    {ALL.map((item) => (
      <label key={item} className="flex gap-2">
        <input type="checkbox" checked={value.includes(item)} onChange={(e) => onChange(e.target.checked ? [...value, item] : value.filter((other) => other !== item))} />
        {PERMISSION_LABELS[item]}
      </label>
    ))}
  </div>
);

const SiteSettings: React.FC = () => {
  const { data, error, reload } = useLoad(gymApi.publicSettings);
  const { note, busy, run } = useAction(reload);
  const [draft, setDraft] = useState<PublicSettings | null>(null);
  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);
  if (!draft) return <Loading error={error} />;
  const tick = (key: 'clubSignupsOpen' | 'gymnastSignupsOpen' | 'connectUploadsOpen', text: string) => (
    <label className="flex gap-2"><input type="checkbox" checked={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })} /> {text}</label>
  );
  return (
    <Card title="General settings">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void run(() => adminApi.saveSettings({ ...draft, monthlyFeeNgn: Number(draft.monthlyFeeNgn), trialDays: Number(draft.trialDays) }), 'Settings saved.');
        }}
      >
        {tick('gymnastSignupsOpen', 'New gymnasts can register')}
        {tick('clubSignupsOpen', 'New clubs can register')}
        {tick('connectUploadsOpen', 'People can post new videos on Connect')}
        <div className="grid sm:grid-cols-2 gap-2">
          <label>Club subscription, naira a month
            <input type="number" min={0} step={1} value={draft.monthlyFeeNgn} onChange={(e) => setDraft({ ...draft, monthlyFeeNgn: e.target.value as unknown as number })} className={FIELD} />
          </label>
          <label>Free days for a new club
            <input type="number" min={0} max={365} step={1} value={draft.trialDays} onChange={(e) => setDraft({ ...draft, trialDays: e.target.value as unknown as number })} className={FIELD} />
          </label>
        </div>
        <p className="text-xs text-[#5C4A68]">A new fee applies to the next payment you record. New free days apply to clubs approved from now on. Clubs already on a trial or subscription keep theirs.</p>
        <fieldset>
          <legend className="font-semibold text-[#3E1B4A]">Privacy: who sees a new Connect video, unless the person chooses otherwise</legend>
          <label className="flex gap-2"><input type="radio" name="default-audience" checked={draft.defaultVideoAudience === 'all'} onChange={() => setDraft({ ...draft, defaultVideoAudience: 'all' })} /> All clubs</label>
          <label className="flex gap-2"><input type="radio" name="default-audience" checked={draft.defaultVideoAudience === 'club'} onChange={() => setDraft({ ...draft, defaultVideoAudience: 'club' })} /> Only their own club</label>
        </fieldset>
        <p><a className="underline text-[#5C2A6E]" href="/privacy" target="_blank" rel="noopener noreferrer">Read the Privacy Policy</a></p>
        <Flash note={note} />
        <button disabled={busy} className={PRIMARY}>Save settings</button>
      </form>
    </Card>
  );
};

const AdminCard: React.FC<{ row: AdminRow; canManage: boolean; busy: boolean; onSave: (next: AdminPermission[]) => void; onRemove: () => void }> = ({ row, canManage, busy, onSave, onRemove }) => {
  const [open, setOpen] = useState(false);
  const [ticks, setTicks] = useState(row.permissions);
  return (
    <article className="border-t border-[#F4EEF8] pt-2 space-y-2">
      <p className="font-semibold text-[#3E1B4A]">{row.name} · {row.email}{row.owner ? ' · Owner' : ''}</p>
      <p className="text-xs text-[#5C4A68]">{row.owner ? 'Everything, including managing administrators.' : row.permissions.map((item) => PERMISSION_LABELS[item]).join(', ')}</p>
      {canManage && !row.owner && (open ? (
        <div className="space-y-2">
          <Ticks value={ticks} onChange={setTicks} />
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => { setOpen(false); onSave(ticks); }} className={PRIMARY}>Save access</button>
            <button type="button" onClick={() => setOpen(false)} className={OUTLINE}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { setTicks(row.permissions); setOpen(true); }} className={OUTLINE}>Change access</button>
          <ConfirmButton
            label="Remove administrator"
            confirm={row.role === 'ADMIN' ? 'Remove and delete their login' : 'Remove admin access'}
            disabled={busy}
            onConfirm={onRemove}
          />
        </div>
      ))}
    </article>
  );
};

const Administrators: React.FC = () => {
  const { adminOwner } = useGym();
  const { data, error, reload } = useLoad(adminApi.admins);
  const { note, busy, run } = useAction(reload);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [ticks, setTicks] = useState<AdminPermission[]>([]);
  if (!data) return <Loading error={error} />;
  return (
    <>
      <Card title="Administrators">
        {!adminOwner && <p className="text-[#5C4A68]">Only an owner can add or change administrators.</p>}
        <Flash note={note} />
        {data.admins.map((row) => (
          <AdminCard
            key={row.userId}
            row={row}
            canManage={adminOwner}
            busy={busy}
            onSave={(next) => run(() => adminApi.setAdminPermissions(row.userId, next), `${row.name}’s access is changed.`)}
            onRemove={() => run(() => adminApi.removeAdmin(row.userId), `${row.name} is no longer an administrator.`)}
          />
        ))}
        {adminOwner && (
          <form
            className="space-y-2 border-t border-[#E4D7EE] pt-3"
            onSubmit={async (event) => {
              event.preventDefault();
              const done = await run(() => adminApi.addAdmin({ email: email.trim(), name: name.trim(), password, permissions: ticks }), `${email.trim()} is an administrator. They sign in with Admin sign in.`);
              if (done) {
                setEmail('');
                setName('');
                setPassword('');
                setTicks([]);
              }
            }}
          >
            <h3 className="font-semibold text-[#3E1B4A]">Add an administrator</h3>
            <p className="text-[#5C4A68]">If the email already has a GymTrack account, it is given admin access and keeps its own password, and you can leave the name and password empty. Otherwise a new login is made. Give them the temporary password yourself, and ask them to change it on their profile.</p>
            <div className="grid sm:grid-cols-3 gap-2">
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" aria-label="Administrator’s email" className={FIELD} />
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Administrator’s name" className={FIELD} />
              <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Temporary password" aria-label="Temporary password" autoComplete="new-password" className={FIELD} />
            </div>
            <Ticks value={ticks} onChange={setTicks} />
            <button disabled={busy} className={PRIMARY}>Add administrator</button>
          </form>
        )}
      </Card>
      <Card title="Activity log">
        <p className="text-[#5C4A68]">Everything administrators have done, newest first.</p>
        {data.activity.length === 0 && <p className="text-[#5C4A68]">Nothing yet.</p>}
        <ul className="space-y-1">
          {data.activity.map((row) => <li key={row.id}><span className="text-[#5C4A68]">{dayTime(row.at)} · {row.by}:</span> {row.action} · {row.target}</li>)}
        </ul>
      </Card>
    </>
  );
};

export const SettingsTab: React.FC = () => (
  <div className="space-y-5">
    <SiteSettings />
    <Administrators />
  </div>
);
