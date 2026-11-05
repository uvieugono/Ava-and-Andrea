import React, { useState } from 'react';
import { whatsappLink } from '../../lib/support';
import { adminApi } from '../../services/adminApi';
import { gymApi, OperatorClub } from '../../services/gymApi';
import { adminError, day, DANGER, FIELD, Flash, Loading, OUTLINE, PRIMARY, useAction, useLoad } from './adminUi';
import { ActivateForm, STATUS_LABEL } from './PaymentsTab';

const APPROVAL_LABEL = { pending: 'Waiting for approval', rejected: 'Not approved', approved: '' };

const Members: React.FC<{ clubId: string }> = ({ clubId }) => {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof adminApi.clubMembers>>['members'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <details onToggle={(event) => {
      if ((event.target as HTMLDetailsElement).open && !rows) adminApi.clubMembers(clubId).then((result) => setRows(result.members)).catch((failure) => setError(adminError(failure)));
    }}>
      <summary className="cursor-pointer text-[#5C2A6E]">People in this club</summary>
      {error && <p className="text-red-600" role="alert">{error}</p>}
      {rows?.length === 0 && <p className="text-[#5C4A68] mt-1">Nobody yet.</p>}
      <ul className="mt-1 space-y-1">
        {rows?.map((row) => (
          <li key={row.id} className="text-xs text-[#5C4A68]">
            {row.name} · {row.role === 'GYMNAST' ? `Gymnast${row.level ? `, level ${row.level}` : ''}` : row.role === 'COACH' ? 'Coach' : 'Club administrator'}
            {row.role === 'GYMNAST' && !row.member ? ' · Chose this club' : ''}{row.state !== 'active' ? ` · ${row.state}` : ''}
          </li>
        ))}
      </ul>
    </details>
  );
};

/** Check a new club is real, approve it, follow who is in it and switch its subscription on. */
export const ClubsTab: React.FC = () => {
  const { data, error, reload } = useLoad(gymApi.operatorClubs);
  const { note, setNote, busy, run } = useAction(reload);
  const [whatsapp, setWhatsapp] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [typedName, setTypedName] = useState('');

  if (!data) return <Loading error={error} />;

  const approve = async (club: OperatorClub) => {
    setWhatsapp(null);
    const done = await run(() => gymApi.approveClub(club.id), `${club.name} is approved. Gymnasts can choose it now, and its free days have started.`);
    if (done && club.adminPhone) setWhatsapp(whatsappLink(club.adminPhone, `Hello ${club.adminName}, ${club.name} has been approved on GymTrack. Your free days start today. Please sign in with Club sign in.`));
  };

  const ordered = data.clubs.slice().sort((a, b) => Number(b.approval === 'pending') - Number(a.approval === 'pending'));
  const waiting = ordered.filter((club) => club.approval === 'pending').length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#5C4A68]">Check that a new club is real before approving it: gymnasts who choose it share their contact details with it.</p>
      <p className="text-sm font-semibold text-[#3E1B4A]">{waiting === 0 ? 'No clubs are waiting for approval.' : `${waiting} ${waiting === 1 ? 'club is' : 'clubs are'} waiting for approval.`}</p>
      <Flash note={note} />
      {whatsapp && <a className="text-sm underline text-[#5C2A6E]" href={whatsapp} target="_blank" rel="noopener noreferrer">Tell the club on WhatsApp</a>}
      {ordered.length === 0 && <p className="text-sm text-[#5C4A68]">No clubs have registered yet.</p>}
      {ordered.map((club) => (
        <article key={club.id} className="bg-white border border-[#E4D7EE] rounded-2xl p-4 space-y-2 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-xl text-[#3E1B4A]">{club.name}</h2>
            {club.approval === 'approved' ? (
              <span className={`text-xs px-2 py-0.5 rounded-full ${club.status === 'expired' ? 'bg-red-50 text-red-800' : 'bg-[#F4EEF8] text-[#3E1B4A]'}`}>{STATUS_LABEL[club.status]}</span>
            ) : (
              <span className={`text-xs px-2 py-0.5 rounded-full ${club.approval === 'rejected' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'}`}>{APPROVAL_LABEL[club.approval]}</span>
            )}
          </div>
          <p className="text-[#5C4A68]">{club.city} · {club.adminName} · {club.adminEmail}{club.adminPhone ? ` · ${club.adminPhone}` : ''}</p>

          {club.approval !== 'approved' && (
            <div className="space-y-2">
              {club.approval === 'rejected' && <p>Reason given: “{club.rejectionReason}”</p>}
              {decliningId === club.id ? (
                <form
                  className="space-y-2"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const done = await run(() => gymApi.rejectClub(club.id, reason.trim()), `${club.name} was not approved. It stays hidden from gymnasts.`);
                    if (done) setDecliningId(null);
                  }}
                >
                  <label className="block">
                    <span className="block text-[#5C4A68]">Why? The club reads this when it signs in.</span>
                    <input required value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className={FIELD} />
                  </label>
                  <div className="flex gap-2">
                    <button disabled={busy} className={DANGER}>Do not approve</button>
                    <button type="button" onClick={() => setDecliningId(null)} className={OUTLINE}>Cancel</button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy} onClick={() => approve(club)} className={PRIMARY}>Approve club</button>
                  {club.approval === 'pending' && (
                    <button type="button" onClick={() => { setDecliningId(club.id); setReason(''); setNote(null); }} className={OUTLINE}>Do not approve</button>
                  )}
                </div>
              )}
            </div>
          )}

          {club.approval === 'approved' && (
            <>
              <p>Gymnasts: {club.members}</p>
              <p>
                Free trial: {day(club.trialStartedAt)} to {day(club.trialEndsAt)}
                {club.trialStartInferred && <span className="text-xs text-[#5C4A68]"> (start worked out from the end date)</span>}
              </p>
              <p>Paid until: {day(club.paidUntil)}</p>
              <Members clubId={club.id} />
              {activatingId === club.id ? (
                <ActivateForm club={club} onClose={() => setActivatingId(null)} onDone={async () => { setNote({ ok: true, text: `${club.name}’s subscription is recorded.` }); await reload(); }} />
              ) : (
                <button type="button" onClick={() => { setActivatingId(club.id); setNote(null); }} className={OUTLINE}>Activate subscription</button>
              )}
            </>
          )}

          {deletingId === club.id ? (
            <form
              className="space-y-2 border-t border-[#F4EEF8] pt-2"
              onSubmit={async (event) => {
                event.preventDefault();
                const done = await run(() => adminApi.deleteClub(club.id, typedName), `${club.name} is deleted. Its staff accounts are gone, and its gymnasts keep their accounts with no club.`);
                if (done) setDeletingId(null);
              }}
            >
              <label className="block">
                <span className="block text-[#5C4A68]">This deletes the club, its staff accounts and its records. Gymnasts keep their accounts. It cannot be undone. Type <strong>{club.name}</strong> to confirm.</span>
                <input required value={typedName} onChange={(e) => setTypedName(e.target.value)} className={FIELD} aria-label="Type the club’s name" />
              </label>
              <div className="flex gap-2">
                <button disabled={busy} className={DANGER}>Delete club for good</button>
                <button type="button" onClick={() => setDeletingId(null)} className={OUTLINE}>Keep</button>
              </div>
            </form>
          ) : (
            <button type="button" onClick={() => { setDeletingId(club.id); setTypedName(''); setNote(null); }} className="text-xs text-red-700 underline">Delete this club</button>
          )}
        </article>
      ))}
    </div>
  );
};
