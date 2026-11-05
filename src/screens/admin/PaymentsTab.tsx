import React, { useState } from 'react';
import { gymApi, OperatorClub } from '../../services/gymApi';
import { adminError, Card, day, FIELD, Flash, Loading, naira, Note, OUTLINE, PRIMARY, Table, Tile, useLoad } from './adminUi';

export const STATUS_LABEL: Record<OperatorClub['status'], string> = { trial: 'In free trial', paid: 'Subscription active', expired: 'Trial ended, not paid' };

const DAY_MS = 24 * 60 * 60 * 1000;

export const ActivateForm: React.FC<{ club: OperatorClub; onClose: () => void; onDone: () => unknown }> = ({ club, onClose, onDone }) => {
  const [months, setMonths] = useState(1);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Note | null>(null);
  return (
    <form
      className="space-y-2 border-t border-[#F4EEF8] pt-2"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setResult(null);
        try {
          await gymApi.activateClub(club.id, { months, reference: reference.trim(), note: note.trim() });
          onClose();
          await onDone();
        } catch (failure) {
          setResult({ ok: false, text: adminError(failure, 'The subscription could not be activated. Try again.') });
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="block">
        <span className="block text-[#5C4A68]">Months paid</span>
        <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className="rounded-xl border border-[#E4D7EE] px-3 py-2">
          {[1, 2, 3, 6, 12].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="block text-[#5C4A68]">What you checked (bank reference or receipt)</span>
        <input required value={reference} onChange={(e) => setReference(e.target.value)} className={FIELD} />
      </label>
      <label className="block">
        <span className="block text-[#5C4A68]">Note (optional)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} className={FIELD} />
      </label>
      <Flash note={result} />
      <div className="flex gap-2">
        <button disabled={busy} className={PRIMARY}>{busy ? 'Activating…' : 'Payment checked: activate'}</button>
        <button type="button" onClick={onClose} className={OUTLINE}>Cancel</button>
      </div>
    </form>
  );
};

/** Who is on a free trial, who has paid, and who is due. Payments are bank transfers checked by a person. */
export const PaymentsTab: React.FC = () => {
  const { data, error, reload } = useLoad(gymApi.operatorClubs);
  const [openId, setOpenId] = useState<string | null>(null);
  const [done, setDone] = useState<Note | null>(null);
  if (!data) return <Loading error={error} />;

  const clubs = data.clubs.filter((club) => club.approval === 'approved');
  const history = clubs.flatMap((club) => club.subscriptions.map((item) => ({ ...item, clubName: club.name }))).sort((a, b) => b.activatedAt.localeCompare(a.activatedAt));
  const received = history.reduce((sum, item) => sum + item.amountNgn, 0);
  const soon = Date.now() + 14 * DAY_MS;
  const renewing = clubs.filter((club) => club.status === 'paid' && club.paidUntil && new Date(club.paidUntil).getTime() <= soon);
  const endingTrials = clubs.filter((club) => club.status === 'trial' && club.trialEndsAt && new Date(club.trialEndsAt).getTime() <= soon);
  const order = { expired: 0, trial: 1, paid: 2 };

  return (
    <div className="space-y-5">
      <p className="text-sm text-[#5C4A68]">Clubs pay by bank transfer and send the receipt on WhatsApp. GymTrack does not see the bank, so nothing here changes until someone checks the receipt and activates the club below.</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Paying clubs" value={clubs.filter((club) => club.status === 'paid').length} />
        <Tile label="In free trial" value={clubs.filter((club) => club.status === 'trial').length} />
        <Tile label="Trial ended, not paid" value={clubs.filter((club) => club.status === 'expired').length} />
        <Tile label="Recorded so far" value={naira(received)} />
      </div>
      <Card title="Due in the next 14 days">
        {renewing.length === 0 && endingTrials.length === 0 && <p className="text-[#5C4A68]">Nothing is due.</p>}
        <ul className="space-y-1">
          {renewing.map((club) => <li key={club.id}>{club.name}: subscription ends {day(club.paidUntil)}</li>)}
          {endingTrials.map((club) => <li key={club.id}>{club.name}: free trial ends {day(club.trialEndsAt)}</li>)}
        </ul>
      </Card>
      <Card title="Clubs">
        <Flash note={done} />
        {clubs.length === 0 && <p className="text-[#5C4A68]">No approved clubs yet.</p>}
        {clubs.slice().sort((a, b) => order[a.status] - order[b.status]).map((club) => (
          <div key={club.id} className="border-t border-[#F4EEF8] pt-2 space-y-1">
            <p className="font-semibold text-[#3E1B4A]">{club.name} · {STATUS_LABEL[club.status]}</p>
            <p className="text-[#5C4A68]">Free trial {day(club.trialStartedAt)} to {day(club.trialEndsAt)} · Paid until {day(club.paidUntil)} · {club.members} gymnasts</p>
            {openId === club.id ? (
              <ActivateForm club={club} onClose={() => setOpenId(null)} onDone={async () => { setDone({ ok: true, text: `${club.name}’s subscription is recorded.` }); await reload(); }} />
            ) : (
              <button type="button" onClick={() => { setOpenId(club.id); setDone(null); }} className={OUTLINE}>Record a payment</button>
            )}
          </div>
        ))}
      </Card>
      <Card title="Payment history">
        {history.length === 0 ? <p className="text-[#5C4A68]">No payments recorded yet.</p> : (
          <Table head={['Club', 'From', 'To', 'Months', 'Amount', 'Checked', 'By']}>
            {history.map((item) => (
              <tr key={item.id} className="border-b border-[#F4EEF8]">
                <td className="py-2 pr-3">{item.clubName}</td>
                <td className="py-2 pr-3 whitespace-nowrap">{day(item.startsAt)}</td>
                <td className="py-2 pr-3 whitespace-nowrap">{day(item.endsAt)}</td>
                <td className="py-2 pr-3">{item.months}</td>
                <td className="py-2 pr-3">{naira(item.amountNgn)}</td>
                <td className="py-2 pr-3">{item.reference}{item.note ? ` · ${item.note}` : ''}</td>
                <td className="py-2 pr-3">{item.activatedBy}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
};
