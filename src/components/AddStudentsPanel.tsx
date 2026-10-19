import React, { useState } from 'react';
import { gymApi, PaymentInstructions } from '../services/gymApi';

export const AddStudentsPanel: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('2014-01-01');
  const [payment, setPayment] = useState<PaymentInstructions | null>(null);
  const [devMatch, setDevMatch] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    try {
      const result = await gymApi.addStudents([{ name, email, password, dateOfBirth }]);
      setPayment(result.payment);
      setDevMatch(result.devMatch);
    } catch {
      setMessage('Could not add that student. Check the email is new.');
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
    <section id="add-student-panel" className="max-w-3xl mx-auto px-4 mb-4">
      <form onSubmit={submit} className="bg-white border border-[#fce7f3] rounded-3xl p-4 space-y-2">
        <h2 className="font-black">Add a student</h2>
        <p className="text-xs text-[#6b555c]">They can sign in and use GymTrack during your club's free week. After that, each student is ₦1,000 a month.</p>
        <div className="grid sm:grid-cols-2 gap-2">
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Student name" className="rounded-2xl border border-[#fce7f3] px-3 py-2 text-sm" />
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="rounded-2xl border border-[#fce7f3] px-3 py-2 text-sm" />
          <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Temporary password" className="rounded-2xl border border-[#fce7f3] px-3 py-2 text-sm" />
          <input required type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className="rounded-2xl border border-[#fce7f3] px-3 py-2 text-sm" />
        </div>
        <button className="px-4 py-2 rounded-full bg-[#ec4899] text-white text-sm font-bold">Create signup</button>
        {payment && (
          <div className="text-sm space-y-1">
            <p>{name} can sign in now and use the app during the free week.</p>
            <p className="text-[#6b555c]">After that week, the monthly reference is <strong>{payment.reference}</strong>.</p>
            {devMatch && <button type="button" onClick={match} className="underline text-[#db2777]">Simulate transfer match</button>}
          </div>
        )}
        {message && <p className="text-sm text-[#166534]">{message}</p>}
      </form>
    </section>
  );
};
