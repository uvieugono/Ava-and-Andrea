import React, { useEffect, useState } from 'react';
import { ClubBilling, gymApi } from '../services/gymApi';
import { useGym } from '../context/GymContext';
import { SUPPORT_WHATSAPP_DISPLAY, SUPPORT_WHATSAPP_INTERNATIONAL, whatsappLink } from '../lib/support';

/** Shown to a club account until GymTrack has approved the club. It opens by itself once approved. */
export const ClubAwaitingApproval: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const { refreshAccount, refreshOverview } = useGym();
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
      await refreshAccount();
      await refreshOverview();
      const me = await gymApi.me();
      setClub(me.user.club ?? null);
      if (me.user.access === 'pending') setMessage('Not yet. GymTrack is still checking your club.');
    } catch {
      setMessage('Could not check. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const declined = club?.approval === 'rejected';
  const name = club?.name ?? 'Your club';

  return (
    <div className="p-4">
      <div className="w-full max-w-md mx-auto bg-white rounded-3xl p-6 border border-[#E4D7EE] space-y-4">
        <h1 className="font-display text-2xl text-[#3E1B4A]">{declined ? `${name} was not approved` : `${name} is waiting for approval`}</h1>
        {declined ? (
          <p className="text-sm text-[#5C4A68]">
            GymTrack could not approve this club{club?.rejectionReason ? `: “${club.rejectionReason}”` : '.'} If you think this is a mistake, please message us.
          </p>
        ) : (
          <>
            <p className="text-sm text-[#5C4A68]">
              GymTrack checks every new club before gymnasts can choose it, to keep young gymnasts safe. We may contact you on the telephone number you gave.
            </p>
            <p className="text-sm text-[#241628]">Your seven free days start when the club is approved, so you lose nothing by waiting.</p>
          </>
        )}
        <a
          href={whatsappLink(SUPPORT_WHATSAPP_INTERNATIONAL, `Hello GymTrack, this is about the approval of ${name}.`)}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full text-center py-3 rounded-full bg-[#5C2A6E] text-white font-semibold"
        >
          Message GymTrack on {SUPPORT_WHATSAPP_DISPLAY}
        </a>
        {message && <p className="text-sm text-[#3E1B4A]" role="status">{message}</p>}
        <button type="button" disabled={busy} onClick={check} className="w-full py-3 rounded-full border border-[#5C2A6E] text-[#5C2A6E] font-semibold disabled:opacity-60">
          {busy ? 'Checking…' : 'Check again'}
        </button>
        <button type="button" onClick={onLogout} className="w-full py-2 text-sm text-[#5C4A68]">Log out</button>
      </div>
    </div>
  );
};
