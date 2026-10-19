import React, { useState } from 'react';
import { gymApi } from '../services/gymApi';

type Errors = { name?: string; phone?: string; message?: string };

export const ContactForm: React.FC = () => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const validate = () => {
    const next: Errors = {};
    if (!name.trim()) next.name = 'Enter your name.';
    if (!phone.trim()) next.phone = 'Enter your telephone number.';
    else if (phone.replace(/[^\d]/g, '').length < 7) next.phone = 'Enter a valid telephone number.';
    if (!message.trim()) next.message = 'Tell us how we can help.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFailure(null);
    if (!validate()) return;
    setBusy(true);
    try {
      await gymApi.contact({ name: name.trim(), phone: phone.trim(), message: message.trim() });
      setDone(true);
      setName('');
      setPhone('');
      setMessage('');
    } catch (error) {
      const status = (error as { status?: number }).status;
      setFailure(
        status === 429
          ? 'You have sent several messages in a short time. Please wait a few minutes and try again.'
          : 'Your message could not be sent. Check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="bg-white border border-[#E4D7EE] rounded-2xl p-5 space-y-3" role="status">
        <p className="font-display text-xl text-[#3E1B4A]">Thank you</p>
        <p className="text-sm text-[#5C4A68]">Your message has been sent. We will get back to you on the telephone number you gave.</p>
        <button type="button" onClick={() => setDone(false)} className="text-sm text-[#5C2A6E] underline">Send another message</button>
      </div>
    );
  }

  const input = 'w-full rounded-xl border border-[#E4D7EE] px-3 py-2 text-sm bg-white';
  return (
    <form onSubmit={submit} noValidate className="bg-white border border-[#E4D7EE] rounded-2xl p-5 space-y-3">
      <label className="block text-sm text-[#241628]">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} className={`${input} mt-1`} autoComplete="name" aria-invalid={Boolean(errors.name)} />
        {errors.name && <span className="text-xs text-red-600">{errors.name}</span>}
      </label>
      <label className="block text-sm text-[#241628]">
        Telephone number
        <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" className={`${input} mt-1`} autoComplete="tel" aria-invalid={Boolean(errors.phone)} />
        {errors.phone && <span className="text-xs text-red-600">{errors.phone}</span>}
      </label>
      <label className="block text-sm text-[#241628]">
        Comments or enquiry
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} className={`${input} mt-1`} aria-invalid={Boolean(errors.message)} />
        {errors.message && <span className="text-xs text-red-600">{errors.message}</span>}
      </label>
      {failure && <p className="text-sm text-red-600" role="alert">{failure}</p>}
      <button type="submit" disabled={busy} className="px-5 py-2 rounded-full bg-[#5C2A6E] text-white text-sm disabled:opacity-60">
        {busy ? 'Sending…' : 'Send message'}
      </button>
    </form>
  );
};
