import React, { useEffect, useState } from 'react';
import { gymApi, OperatorClub } from '../services/gymApi';

const day = (value: string | null) => (value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const STATUS_LABEL: Record<OperatorClub['status'], string> = { trial: 'In free trial', paid: 'Subscription active', expired: 'Trial ended, not paid' };

/**
 * For GymTrack operators: check a club's bank transfer (receipt sent on WhatsApp),
 * then switch its subscription on. Each activation is added to the club's history.
 */
export const OperatorScreen: React.FC = () => {
  const [clubs, setClubs] = useState<OperatorClub[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [months, setMonths] = useState(1);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () =>
    gymApi
      .operatorClubs()
      .then((r) => setClubs(r.clubs))
      .catch(() => setError('Could not load the clubs. Only GymTrack operators can open this page.'));

  useEffect(() => {
    load();
  }, []);

  const activate = async (club: OperatorClub) => {
    setResult(null);
    if (!reference.trim()) {
      setResult({ ok: false, text: 'Enter what you checked: the bank reference or receipt details.' });
      return;
    }
    setBusy(true);
    try {
      const done = await gymApi.activateClub(club.id, { months, reference: reference.trim(), note: note.trim() });
      setResult({ ok: true, text: `${club.name} is active until ${day(done.subscription.endsAt)}.` });
      setOpenId(null);
      setReference('');
      setNote('');
      setMonths(1);
      await load();
    } catch {
      setResult({ ok: false, text: 'The subscription could not be activated. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <header>
        <h1 className="font-display text-3xl text-[#3E1B4A]">Club subscriptions</h1>
        <p className="text-sm text-[#5C4A68] mt-1">
          Check the transfer receipt sent on WhatsApp, then activate the club. Receiving a receipt never activates a club by itself.
        </p>
      </header>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      {result && <p className={`text-sm ${result.ok ? 'text-emerald-800' : 'text-red-600'}`} role={result.ok ? 'status' : 'alert'}>{result.text}</p>}
      {clubs?.length === 0 && <p className="text-sm text-[#5C4A68]">No clubs have registered yet.</p>}
      {clubs?.map((club) => (
        <article key={club.id} className="bg-white border border-[#E4D7EE] rounded-2xl p-4 space-y-2 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-xl text-[#3E1B4A]">{club.name}</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full ${club.status === 'expired' ? 'bg-red-50 text-red-800' : 'bg-[#F4EEF8] text-[#3E1B4A]'}`}>{STATUS_LABEL[club.status]}</span>
          </div>
          <p className="text-[#5C4A68]">{club.city} · {club.adminName} · {club.adminEmail}{club.adminPhone ? ` · ${club.adminPhone}` : ''}</p>
          <p>
            Free trial: {day(club.trialStartedAt)} to {day(club.trialEndsAt)}
            {club.trialStartInferred && <span className="text-xs text-[#5C4A68]"> (start worked out from the end date)</span>}
          </p>
          <p>Paid until: {day(club.paidUntil)}</p>
          {club.subscriptions.length > 0 && (
            <details>
              <summary className="cursor-pointer text-[#5C2A6E]">Activation history ({club.subscriptions.length})</summary>
              <ul className="mt-2 space-y-1">
                {club.subscriptions.map((item) => (
                  <li key={item.id} className="text-xs text-[#5C4A68]">
                    {day(item.startsAt)} to {day(item.endsAt)} · {item.months} month{item.months === 1 ? '' : 's'} · ₦{item.amountNgn.toLocaleString()} · “{item.reference}”{item.note ? ` · ${item.note}` : ''} · by {item.activatedBy} on {day(item.activatedAt)}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {openId === club.id ? (
            <div className="space-y-2 border-t border-[#F4EEF8] pt-2">
              <label className="block">
                <span className="block text-[#5C4A68]">Months paid</span>
                <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className="rounded-xl border border-[#E4D7EE] px-3 py-2">
                  {[1, 2, 3, 6, 12].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="block text-[#5C4A68]">What you checked (bank reference or receipt)</span>
                <input value={reference} onChange={(e) => setReference(e.target.value)} className="w-full rounded-xl border border-[#E4D7EE] px-3 py-2" />
              </label>
              <label className="block">
                <span className="block text-[#5C4A68]">Note (optional)</span>
                <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-xl border border-[#E4D7EE] px-3 py-2" />
              </label>
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => activate(club)} className="px-4 py-2 rounded-full bg-[#5C2A6E] text-white disabled:opacity-60">
                  {busy ? 'Activating…' : 'Payment checked: activate'}
                </button>
                <button type="button" onClick={() => setOpenId(null)} className="px-4 py-2 rounded-full border border-[#E4D7EE]">Cancel</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => { setOpenId(club.id); setResult(null); }} className="px-4 py-2 rounded-full border border-[#5C2A6E] text-[#5C2A6E]">
              Activate subscription
            </button>
          )}
        </article>
      ))}
    </div>
  );
};
