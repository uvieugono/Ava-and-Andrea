import React, { useState } from 'react';
import { gymApi, PaymentInstructions } from '../services/gymApi';
import { PasswordInput } from './PasswordInput';
import { useGym } from '../context/GymContext';

export const AddStudentsPanel: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('2014-01-01');
  const [phone, setPhone] = useState('');
  const [level, setLevel] = useState(1);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const { refreshOverview } = useGym();
  const [payment, setPayment] = useState<PaymentInstructions | null>(null);
  const [devMatch, setDevMatch] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setFailed(false);
    setBusy(true);
    try {
      const result = await gymApi.addStudents([{ name: name.trim(), email: email.trim(), password, dateOfBirth, level, phone: phone.trim() }]);
      setPayment(result.payment);
      setDevMatch(result.devMatch);
      // Show the new gymnast in the roster straight away.
      await refreshOverview();
      setMessage(`${name.trim()} is added to your club roster.`);
    } catch (error) {
      setFailed(true);
      const status = (error as { status?: number }).status;
      setMessage(status === 409 ? 'That email is already registered. Each gymnast needs their own email.' : 'Could not add that gymnast. Check every field and try again.');
    } finally {
      setBusy(false);
    }
  };

  const match = async () => {
    if (!payment) return;
    await gymApi.devMatch(payment.reference, payment.amount);
    setMessage(`${name} is allocated to this club.`);
    setPayment(null);
    setName('');
    setEmail('');
  };

  return (
    <section id="add-student-panel" className="pt-2">
      <form onSubmit={submit} className="bg-[#F4EEF8] border border-[#E4D7EE] rounded-2xl p-4 space-y-2">
        <h2 className="font-display text-xl text-[#3E1B4A]">Add a Gymnast</h2>
        <p className="text-xs text-[#5C4A68]">They can sign in and use GymTrack during your club's free week. After that, each student is ₦1,000 a month.</p>
        <div className="grid sm:grid-cols-2 gap-2">
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Student name" className="rounded-2xl border border-[#E4D7EE] px-3 py-2 text-sm" />
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="rounded-2xl border border-[#E4D7EE] px-3 py-2 text-sm" />
          <PasswordInput required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Temporary password" className="w-full rounded-2xl border border-[#E4D7EE] px-3 py-2 text-sm" />
          <label className="text-xs text-[#5C4A68]">
            Date of birth
            <input required type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className="mt-1 w-full rounded-2xl border border-[#E4D7EE] px-3 py-2 text-sm" />
          </label>
          <label className="text-xs text-[#5C4A68]">
            Level
            <select value={level} onChange={(e) => setLevel(Number(e.target.value))} className="mt-1 w-full rounded-2xl border border-[#E4D7EE] px-3 py-2 text-sm">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>Level {n}</option>)}
            </select>
          </label>
          <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telephone (for WhatsApp fee reminders)" className="rounded-2xl border border-[#E4D7EE] px-3 py-2 text-sm sm:col-span-2" />
        </div>
        <button disabled={busy} className="px-4 py-2 rounded-full bg-[#5C2A6E] text-white text-sm font-bold disabled:opacity-60">{busy ? 'Adding…' : 'Add gymnast'}</button>
        {payment && (
          <div className="text-sm space-y-1">
            <p>{name} can sign in now and use the app during the free week.</p>
            <p className="text-[#5C4A68]">After that week, the monthly reference is <strong>{payment.reference}</strong>.</p>
            {devMatch && <button type="button" onClick={match} className="underline text-[#5C2A6E]">Simulate transfer match</button>}
          </div>
        )}
        {message && <p className={`text-sm ${failed ? 'text-red-600' : 'text-[#166534]'}`} role={failed ? 'alert' : 'status'}>{message}</p>}
      </form>
    </section>
  );
};
