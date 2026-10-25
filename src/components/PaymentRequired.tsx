import React, { useEffect, useState } from 'react';
import { ClubBilling, gymApi, readAccess, setAccess, setToken } from '../services/gymApi';

// Bank transfer details for club subscriptions, exactly as GymTrack gave them.
const BANK = {
  accountName: 'Ava-Grace Ugono',
  bank: '9 Payment Service Bank',
  accountNumber: '6178205544',
};
const EVIDENCE_WHATSAPP_DISPLAY = '0704 065 5667';
const EVIDENCE_WHATSAPP_INTERNATIONAL = '2347040655667';

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : 'not recorded';

/**
 * Shown to a club account once the club's seven-day trial has ended and no subscription is
 * active. Paying does not switch the club back on by itself: GymTrack checks the transfer
 * evidence and then activates the subscription.
 */
export const PaymentRequired: React.FC<{ onUnlock: () => void; onLogout: () => void }> = ({ onUnlock, onLogout }) => {
  const [club, setClub] = useState<ClubBilling | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    gymApi.me().then((me) => setClub(me.user.club ?? null)).catch(() => setClub(null));
  }, []);

  const check = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const me = await gymApi.me();
      setAccess(me.user.access ?? me.user.status, me.payment, readAccess().devMatch, me.user.periodEnd ?? null);
      setClub(me.user.club ?? null);
      if (me.user.access === 'paid' || me.user.access === 'trial' || me.user.access === 'free') onUnlock();
      else setMessage('The subscription is not active yet. GymTrack activates it once the transfer has been checked.');
    } catch {
      setMessage('Could not check the subscription. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const fee = club?.monthlyFeeNgn;
  const clubName = club?.name ?? 'our club';
  const whatsappText = `Hello GymTrack, this is the transfer receipt for the subscription of ${clubName}${club ? ` (club ID ${club.id})` : ''}.`;

  return (
    <div className="p-4">
      <div className="w-full max-w-md mx-auto bg-white rounded-3xl p-6 border border-[#E4D7EE] space-y-4">
        <h1 className="font-display text-2xl text-[#3E1B4A]">Your club's free trial has ended</h1>
        <p className="text-sm text-[#5C4A68]">
          {clubName}'s seven-day free trial ran from {formatDate(club?.trialStartedAt ?? null)} to {formatDate(club?.trialEndsAt ?? null)}.
          Payment is needed to restore the club's access to GymTrack.
        </p>
        <p className="text-sm text-[#241628]">
          {fee ? <>The subscription is <strong>₦{fee.toLocaleString()} a month</strong>.</> : <>The subscription price is not set up yet. Please contact GymTrack.</>}
        </p>

        <div className="rounded-2xl bg-[#F4EEF8] border border-[#E4D7EE] p-4 space-y-2">
          <h2 className="text-sm font-semibold text-[#3E1B4A]">Pay by bank transfer</h2>
          <dl className="text-sm space-y-1.5">
            <div className="flex justify-between gap-4"><dt className="text-[#5C4A68]">Account Name</dt><dd className="font-semibold text-right">{BANK.accountName}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-[#5C4A68]">Bank</dt><dd className="font-semibold text-right">{BANK.bank}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-[#5C4A68]">Account Number</dt><dd className="font-semibold text-right">{BANK.accountNumber}</dd></div>
          </dl>
        </div>

        <div className="space-y-2 text-sm text-[#241628]">
          <p>
            <strong>Payment evidence:</strong> send the transfer receipt by WhatsApp to <strong>{EVIDENCE_WHATSAPP_DISPLAY}</strong>, and say which club the payment is for ({clubName}).
          </p>
          <a
            href={`https://wa.me/${EVIDENCE_WHATSAPP_INTERNATIONAL}?text=${encodeURIComponent(whatsappText)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center py-3 rounded-full bg-[#5C2A6E] text-white font-semibold"
          >
            Send receipt on WhatsApp
          </a>
          <p className="text-xs text-[#5C4A68]">
            Your subscription is switched on once GymTrack has checked the payment. This page opens the club again as soon as it is active.
          </p>
        </div>

        {message && <p className="text-sm text-[#3E1B4A]" role="status">{message}</p>}
        <button type="button" disabled={busy} onClick={check} className="w-full py-3 rounded-full border border-[#5C2A6E] text-[#5C2A6E] font-semibold disabled:opacity-60">
          {busy ? 'Checking…' : 'Check if my subscription is active'}
        </button>
        <button type="button" onClick={() => { setToken(null); onLogout(); }} className="w-full py-2 text-sm text-[#5C4A68]">Log out</button>
      </div>
    </div>
  );
};
