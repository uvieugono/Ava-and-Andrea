import React, { useEffect, useState } from 'react';
import { gymApi, OperatorClub, OperatorResetLink } from '../services/gymApi';
import { whatsappLink } from '../lib/support';

const day = (value: string | null) => (value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const STATUS_LABEL: Record<OperatorClub['status'], string> = { trial: 'In free trial', paid: 'Subscription active', expired: 'Trial ended, not paid' };
const APPROVAL_LABEL = { pending: 'Waiting for approval', rejected: 'Not approved', approved: '' };

/**
 * For GymTrack operators: approve new clubs, check a club's bank transfer (receipt sent on
 * WhatsApp) and switch its subscription on, and make password reset links.
 */
export const OperatorScreen: React.FC = () => {
  const [clubs, setClubs] = useState<OperatorClub[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [months, setMonths] = useState(1);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; whatsapp?: string } | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetLink, setResetLink] = useState<(OperatorResetLink & { url: string }) | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  const load = () =>
    gymApi
      .operatorClubs()
      .then((r) => setClubs(r.clubs))
      .catch(() => setError('Could not load the clubs. Only GymTrack operators can open this page.'));

  useEffect(() => {
    load();
  }, []);

  const approve = async (club: OperatorClub) => {
    setBusy(true);
    setResult(null);
    try {
      await gymApi.approveClub(club.id);
      setResult({
        ok: true,
        text: `${club.name} is approved. Gymnasts can choose it now, and its seven free days have started.`,
        whatsapp: club.adminPhone ? whatsappLink(club.adminPhone, `Hello ${club.adminName}, ${club.name} has been approved on GymTrack. Your seven free days start today. Please sign in with Club sign in.`) : undefined,
      });
      await load();
    } catch {
      setResult({ ok: false, text: 'The club could not be approved. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  const decline = async (club: OperatorClub) => {
    if (!reason.trim()) {
      setResult({ ok: false, text: 'Say why, so the club can read it when it signs in.' });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      await gymApi.rejectClub(club.id, reason.trim());
      setResult({ ok: true, text: `${club.name} was not approved. It stays hidden from gymnasts.` });
      setDecliningId(null);
      setReason('');
      await load();
    } catch {
      setResult({ ok: false, text: 'That could not be saved. Try again.' });
    } finally {
      setBusy(false);
    }
  };

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

  const makeResetLink = async (event: React.FormEvent) => {
    event.preventDefault();
    setResetError(null);
    setResetLink(null);
    setBusy(true);
    try {
      const made = await gymApi.operatorResetLink(resetEmail.trim());
      setResetLink({ ...made, url: `${window.location.origin}/?reset=${made.token}` });
    } catch (failure) {
      setResetError((failure as { status?: number }).status === 404 ? 'No account has that email.' : 'The link could not be made. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!resetLink) return;
    try {
      await navigator.clipboard.writeText(resetLink.url);
      setResetError(null);
    } catch {
      setResetError('Could not copy automatically. Select the link and copy it.');
    }
  };

  // Clubs waiting for a decision come first.
  const ordered = (clubs ?? []).slice().sort((a, b) => Number(b.approval === 'pending') - Number(a.approval === 'pending'));
  const waiting = ordered.filter((club) => club.approval === 'pending').length;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <header>
        <h1 className="font-display text-3xl text-[#3E1B4A]">Club approvals and subscriptions</h1>
        <p className="text-sm text-[#5C4A68] mt-1">
          Check that a new club is real before approving it: gymnasts who choose it share their contact details with it. Check the transfer receipt sent on WhatsApp before activating a subscription.
        </p>
        {clubs && <p className="text-sm font-semibold text-[#3E1B4A] mt-2">{waiting === 0 ? 'No clubs are waiting for approval.' : `${waiting} ${waiting === 1 ? 'club is' : 'clubs are'} waiting for approval.`}</p>}
      </header>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      {result && (
        <p className={`text-sm ${result.ok ? 'text-emerald-800' : 'text-red-600'}`} role={result.ok ? 'status' : 'alert'}>
          {result.text}{' '}
          {result.whatsapp && <a className="underline" href={result.whatsapp} target="_blank" rel="noopener noreferrer">Tell the club on WhatsApp</a>}
        </p>
      )}
      {clubs?.length === 0 && <p className="text-sm text-[#5C4A68]">No clubs have registered yet.</p>}
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
                <div className="space-y-2">
                  <label className="block">
                    <span className="block text-[#5C4A68]">Why? The club reads this when it signs in.</span>
                    <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className="w-full rounded-xl border border-[#E4D7EE] px-3 py-2" />
                  </label>
                  <div className="flex gap-2">
                    <button type="button" disabled={busy} onClick={() => decline(club)} className="px-4 py-2 rounded-full bg-red-700 text-white disabled:opacity-60">Do not approve</button>
                    <button type="button" onClick={() => setDecliningId(null)} className="px-4 py-2 rounded-full border border-[#E4D7EE]">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy} onClick={() => approve(club)} className="px-4 py-2 rounded-full bg-[#5C2A6E] text-white disabled:opacity-60">Approve club</button>
                  {club.approval === 'pending' && (
                    <button type="button" onClick={() => { setDecliningId(club.id); setReason(''); setResult(null); }} className="px-4 py-2 rounded-full border border-[#E4D7EE]">Do not approve</button>
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
            </>
          )}
        </article>
      ))}

      <section id="operator-password-reset" className="bg-white border border-[#E4D7EE] rounded-2xl p-4 space-y-2 text-sm">
        <h2 className="font-display text-xl text-[#3E1B4A]">Reset someone’s password</h2>
        <p className="text-[#5C4A68]">
          For someone locked out. Check it is really them first. Send the link only to the telephone number on the account. It works once, for 24 hours.
        </p>
        <form onSubmit={makeResetLink} className="flex flex-wrap gap-2">
          <input required type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} placeholder="Their sign-in email" aria-label="Their sign-in email" className="flex-1 min-w-48 rounded-xl border border-[#E4D7EE] px-3 py-2" />
          <button disabled={busy} className="px-4 py-2 rounded-full bg-[#5C2A6E] text-white disabled:opacity-60">Make reset link</button>
        </form>
        {resetError && <p className="text-red-600" role="alert">{resetError}</p>}
        {resetLink && (
          <div className="space-y-2 border-t border-[#F4EEF8] pt-2">
            <p>{resetLink.name} · {resetLink.email} · {resetLink.phone || 'no telephone number on file'}</p>
            <input readOnly value={resetLink.url} aria-label="Reset link" onFocus={(e) => e.target.select()} className="w-full rounded-xl border border-[#E4D7EE] px-3 py-2 text-xs" />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={copyLink} className="px-4 py-2 rounded-full border border-[#E4D7EE]">Copy link</button>
              {resetLink.phone && (
                <a
                  href={whatsappLink(resetLink.phone, `Hello ${resetLink.name}, use this link to choose a new GymTrack password. It works once, for 24 hours: ${resetLink.url}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-full bg-[#5C2A6E] text-white"
                >
                  Send on WhatsApp to {resetLink.phone}
                </a>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
