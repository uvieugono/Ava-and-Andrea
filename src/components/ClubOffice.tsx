import React, { useRef, useState } from 'react';
import { useGym } from '../context/GymContext';
import { mediaUrl } from '../services/gymApi';

type Note = { ok: boolean; message: string } | null;

const ACCEPTED_DOCUMENTS = '.pdf,.png,.jpg,.jpeg,.txt,.csv,.doc,.docx,.xls,.xlsx';

export const ClubOffice: React.FC = () => {
  const {
    isStaff,
    rosterGymnasts,
    clubOverview,
    notices,
    certificates,
    markAttendance,
    sendFeeReminder,
    publishNotice,
    addDocument,
    issueCertificate,
  } = useGym();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeBody, setNoticeBody] = useState('');
  const [feeId, setFeeId] = useState('');
  const [feeMessage, setFeeMessage] = useState('Your training fee is due.');
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, Note>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  if (!isStaff) return null;

  const attendance = clubOverview?.attendance ?? [];
  const documents = clubOverview?.documents ?? [];
  const reminders = clubOverview?.feeReminders ?? [];
  const selectedFeeId = feeId || rosterGymnasts[0]?.id || '';
  const feeGymnast = rosterGymnasts.find((item) => item.id === selectedFeeId);
  const say = (key: string, note: Note) => setNotes((prev) => ({ ...prev, [key]: note }));

  const run = async (key: string, task: () => Promise<{ ok: boolean; message: string }>) => {
    setBusy(key);
    say(key, null);
    const result = await task();
    say(key, result);
    setBusy(null);
    return result;
  };

  const Message: React.FC<{ id: string }> = ({ id }) =>
    notes[id] ? (
      <p className={`text-sm ${notes[id]!.ok ? 'text-emerald-800' : 'text-red-600'}`} role={notes[id]!.ok ? 'status' : 'alert'}>
        {notes[id]!.message}
      </p>
    ) : null;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    await run('document', () => addDocument(file));
    if (fileInput.current) fileInput.current.value = '';
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="font-display text-2xl text-[#3E1B4A]">Attendance register</h2>
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-xl border border-[#E4D7EE] px-3 py-2 text-sm" />
        {rosterGymnasts.length === 0 && <p className="text-sm text-[#5C4A68]">No gymnasts in the club yet.</p>}
        <div className="space-y-2">
          {rosterGymnasts.map((gymnast) => {
            const mark = attendance.find((item) => item.gymnastId === gymnast.id && item.date === date);
            return (
              <div key={gymnast.id} className="bg-white border border-[#E4D7EE] rounded-2xl p-3 flex items-center justify-between gap-3">
                <span className="text-sm">{gymnast.name}</span>
                <span className="flex gap-2">
                  <button type="button" onClick={() => run(`att-${gymnast.id}`, () => markAttendance(gymnast.id, date, true))} className={`px-3 py-1 rounded-full text-sm ${mark?.present === true ? 'bg-[#5C2A6E] text-white' : 'border border-[#E4D7EE]'}`}>Present</button>
                  <button type="button" onClick={() => run(`att-${gymnast.id}`, () => markAttendance(gymnast.id, date, false))} className={`px-3 py-1 rounded-full text-sm ${mark?.present === false ? 'bg-[#5C2A6E] text-white' : 'border border-[#E4D7EE]'}`}>Absent</button>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="bg-white border border-[#E4D7EE] rounded-2xl p-4 space-y-2">
        <h2 className="font-display text-2xl text-[#3E1B4A]">Fee reminders</h2>
        <p className="text-sm text-[#5C4A68]">Sent as a WhatsApp message to the telephone number registered for the gymnast.</p>
        <select value={selectedFeeId} onChange={(event) => setFeeId(event.target.value)} className="w-full rounded-xl border border-[#E4D7EE] px-3 py-2 text-sm" aria-label="Gymnast">
          {rosterGymnasts.map((gymnast) => <option key={gymnast.id} value={gymnast.id}>{gymnast.name}</option>)}
        </select>
        {feeGymnast && (
          <p className="text-xs text-[#5C4A68]">
            {feeGymnast.phone ? `Will be sent to ${feeGymnast.phone}.` : 'This gymnast has no telephone number on file, so nothing can be sent.'}
          </p>
        )}
        <textarea value={feeMessage} onChange={(event) => setFeeMessage(event.target.value)} className="w-full rounded-xl border border-[#E4D7EE] px-3 py-2 text-sm" aria-label="Message with the fee amount" />
        <button
          type="button"
          disabled={!feeGymnast || !feeMessage.trim() || busy === 'fee'}
          onClick={() => feeGymnast && run('fee', () => sendFeeReminder(feeGymnast.id, feeMessage.trim()))}
          className="px-4 py-2 rounded-full bg-[#5C2A6E] text-white text-sm disabled:opacity-60"
        >
          {busy === 'fee' ? 'Sending…' : 'Send reminder'}
        </button>
        <Message id="fee" />
        {reminders.slice(0, 5).map((item) => {
          const name = rosterGymnasts.find((g) => g.id === item.gymnastId)?.name ?? 'Gymnast';
          return (
            <p key={item.id} className="text-xs text-[#5C4A68]">
              {name} · {new Date(item.sentAt).toLocaleDateString()} · {item.status === 'sent' ? 'Sent' : item.status === 'not_configured' ? 'Not sent (WhatsApp not set up)' : item.status === 'no_phone' ? 'Not sent (no number)' : 'Failed'}
            </p>
          );
        })}
      </section>

      <section className="bg-white border border-[#E4D7EE] rounded-2xl p-4 space-y-2">
        <h2 className="font-display text-2xl text-[#3E1B4A]">Training notice board</h2>
        <p className="text-sm text-[#5C4A68]">Notices appear here and on every gymnast's profile and home page.</p>
        <input value={noticeTitle} onChange={(event) => setNoticeTitle(event.target.value)} placeholder="Session title" className="w-full rounded-xl border border-[#E4D7EE] px-3 py-2 text-sm" />
        <textarea value={noticeBody} onChange={(event) => setNoticeBody(event.target.value)} placeholder="Day, time and what to bring" className="w-full rounded-xl border border-[#E4D7EE] px-3 py-2 text-sm" />
        <button
          type="button"
          disabled={busy === 'notice'}
          onClick={async () => {
            if (!noticeTitle.trim() || !noticeBody.trim()) {
              say('notice', { ok: false, message: 'Add a title and the details before publishing.' });
              return;
            }
            const result = await run('notice', () => publishNotice(noticeTitle.trim(), noticeBody.trim()));
            if (result.ok) {
              setNoticeTitle('');
              setNoticeBody('');
            }
          }}
          className="px-4 py-2 rounded-full bg-[#5C2A6E] text-white text-sm disabled:opacity-60"
        >
          {busy === 'notice' ? 'Publishing…' : 'Publish notice'}
        </button>
        <Message id="notice" />
        {notices.map((item) => (
          <article key={item.id} className="border-t border-[#F4EEF8] pt-2">
            <h3>{item.title}</h3>
            <p className="text-sm text-[#5C4A68]">{item.body}</p>
          </article>
        ))}
      </section>

      <section className="bg-white border border-[#E4D7EE] rounded-2xl p-4 space-y-2">
        <h2 className="font-display text-2xl text-[#3E1B4A]">Certificates</h2>
        {rosterGymnasts.map((gymnast) => (
          <div key={gymnast.id} className="flex items-center justify-between gap-3 text-sm">
            <span>{gymnast.name} · Level {gymnast.level}</span>
            <button
              type="button"
              className="text-[#5C2A6E]"
              onClick={() => {
                issueCertificate(gymnast.name, gymnast.level, `${gymnast.name} passed level ${gymnast.level}.`);
                say('certificate', { ok: true, message: `Certificate issued to ${gymnast.name}.` });
              }}
            >
              Send certificate
            </button>
          </div>
        ))}
        {certificates.slice(0, 5).map((item) => (
          <p key={item.id} className="text-sm text-[#5C4A68]">{item.gymnastName} · level {item.level}</p>
        ))}
        <Message id="certificate" />
      </section>

      <section className="bg-white border border-[#E4D7EE] rounded-2xl p-4 space-y-2">
        <h2 className="font-display text-2xl text-[#3E1B4A]">Document storage</h2>
        <input ref={fileInput} type="file" accept={ACCEPTED_DOCUMENTS} className="hidden" onChange={(event) => onFile(event.target.files?.[0])} />
        <button
          type="button"
          disabled={busy === 'document'}
          onClick={() => fileInput.current?.click()}
          className="px-4 py-2 rounded-full bg-[#5C2A6E] text-white text-sm disabled:opacity-60"
        >
          {busy === 'document' ? 'Uploading…' : 'Upload document'}
        </button>
        <p className="text-xs text-[#5C4A68]">PDF, Word, Excel, CSV, text or image files up to 10 MB.</p>
        <Message id="document" />
        {documents.map((item) => (
          <a key={item.id} href={mediaUrl(`/api/uploads/${item.uploadId}`)} target="_blank" rel="noreferrer" className="block text-sm text-[#5C2A6E]">{item.name}</a>
        ))}
      </section>
    </div>
  );
};
