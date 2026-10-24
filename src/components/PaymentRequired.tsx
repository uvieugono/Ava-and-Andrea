import React, { useState } from 'react';
import { gymApi, readAccess, setAccess, setToken } from '../services/gymApi';

export const PaymentRequired: React.FC<{ onUnlock: () => void; onLogout: () => void }> = ({ onUnlock, onLogout }) => {
  const access = readAccess();
  const payment = access.payment;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const unlockIfPaid = async () => {
    const me = await gymApi.me();
    setAccess(me.user.access ?? me.user.status, me.payment, access.devMatch, me.user.periodEnd ?? null);
    if (me.user.access === 'paid' || me.user.access === 'trial' || me.user.access === 'club' || me.user.status === 'active') onUnlock();
    else setMessage('The transfer has not matched yet.');
  };

  const check = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await unlockIfPaid();
    } catch {
      setMessage('Could not check the account.');
    } finally {
      setBusy(false);
    }
  };

  const simulate = async () => {
    if (!payment) return;
    setBusy(true);
    setMessage(null);
    try {
      await gymApi.devMatch(payment.reference, payment.amount);
      await unlockIfPaid();
    } catch {
      setMessage('The transfer has not matched yet.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4">
      <div className="w-full max-w-md mx-auto bg-white rounded-3xl p-6 border border-[#fce7f3] space-y-4">
        <h1 className="text-2xl font-black">You're signed in</h1>
        <p className="text-sm text-[#6b555c]">Your free week has ended. Pay ₦1,000 for the next month to keep using skills, progress, meets, clubs, and Inspo.</p>
        {payment ? (
          <dl className="text-sm space-y-2">
            <div className="flex justify-between"><dt>Amount</dt><dd className="font-bold">₦{payment.amount.toLocaleString()}</dd></div>
            <div className="flex justify-between"><dt>Account</dt><dd className="font-bold">{payment.accountName}</dd></div>
            <div className="flex justify-between gap-4"><dt>Number</dt><dd className="font-bold text-right">{payment.accountNumber}</dd></div>
            <div className="flex justify-between"><dt>Reference</dt><dd className="font-bold">{payment.reference}</dd></div>
          </dl>
        ) : (
          <p className="text-sm">No payment is waiting on this account.</p>
        )}
        {message && <p className="text-sm text-red-600">{message}</p>}
        <button type="button" disabled={busy} onClick={check} className="w-full py-3 rounded-full bg-[#ec4899] text-white font-bold">
          {busy ? 'Please wait…' : 'I have paid'}
        </button>
        {access.devMatch && payment && (
          <button type="button" disabled={busy} onClick={simulate} className="w-full py-2 text-sm font-bold text-[#db2777]">
            Simulate transfer match
          </button>
        )}
        <button type="button" onClick={() => { setToken(null); onLogout(); }} className="w-full py-2 text-sm text-[#6b555c]">Log out</button>
      </div>
    </div>
  );
};
