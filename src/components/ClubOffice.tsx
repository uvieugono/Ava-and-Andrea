import React, { useRef, useState } from 'react';
import { Award, Banknote, ClipboardCheck, FolderOpen, Megaphone, Trash2 } from 'lucide-react';
import { useGym } from '../context/GymContext';
import { mediaUrl } from '../services/gymApi';
import { CertificateGenerator, ClubCertificateDetails } from './CertificateGenerator';

type Note = { ok: boolean; message: string } | null;

const ACCEPTED_DOCUMENTS = '.pdf,.png,.jpg,.jpeg,.txt,.csv,.doc,.docx,.xls,.xlsx';
const SECTION = 'bg-white border border-[#E4D7EE] rounded-2xl p-4 space-y-2';

/** A section title with the same icon tile as the Club & Gymnast Profile heading. */
const SectionTitle: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
  <h2 className="font-display text-2xl text-[#3E1B4A] flex items-center gap-3">
    <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#5C2A6E] to-[#3E1B4A] text-white flex items-center justify-center shrink-0" aria-hidden="true">
      {icon}
    </span>
    {children}
  </h2>
);

export const ClubOffice: React.FC = () => {
  const {
    isStaff,
    userRole,
    rosterGymnasts,
    clubOverview,
    notices,
    certificates,
    markAttendance,
    sendFeeReminder,
    publishNotice,
    deleteNotice,
    addDocument,
  } = useGym();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeBody, setNoticeBody] = useState('');
  const [feeId, setFeeId] = useState('');
  const [feeMessage, setFeeMessage] = useState('Your training fee is due.');
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, Note>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  if (!isStaff) return null;

  const attendance = clubOverview?.attendance ?? [];
  const documents = clubOverview?.documents ?? [];
  const reminders = clubOverview?.feeReminders ?? [];
  const selectedFeeId = feeId || rosterGymnasts[0]?.id || '';
  const feeGymnast = rosterGymnasts.find((item) => item.id === selectedFeeId);
  const canDeleteNotices = userRole === 'CLUB_ADMIN';
  const say = (key: string, note: Note) => setNotes((prev) => ({ ...prev, [key]: note }));
  const nameOf = (id: string) => rosterGymnasts.find((g) => g.id === id)?.name ?? 'Gymnast';

  // Past register dates, newest first, with who was present and absent.
  const pastDates = Array.from(new Set(attendance.map((item) => item.date))).sort((a, b) => b.localeCompare(a));

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
      <section id="attendance-register" className={SECTION}>
        <SectionTitle icon={<ClipboardCheck className="w-5 h-5" />}>Attendance Register</SectionTitle>
        <div className="flex flex-wrap items-center gap-3">
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-xl border border-[#E4D7EE] px-3 py-2 text-sm" aria-label="Register date" />
          <button type="button" onClick={() => setShowHistory((value) => !value)} className="text-sm text-[#5C2A6E] underline">
            {showHistory ? 'Hide past registers' : `Past registers (${pastDates.length})`}
          </button>
        </div>
        {rosterGymnasts.length === 0 && <p className="text-sm text-[#5C4A68]">No gymnasts in the club yet.</p>}
        <div className="space-y-2">
          {rosterGymnasts.map((gymnast) => {
            const mark = attendance.find((item) => item.gymnastId === gymnast.id && item.date === date);
            return (
              <div key={gymnast.id} className="border border-[#E4D7EE] rounded-2xl p-3 flex items-center justify-between gap-3">
                <span className="text-sm">
                  {gymnast.name}
                  <span className="block text-xs text-[#5C4A68]">{mark ? (mark.present ? 'Marked present' : 'Marked absent') : 'Not marked'}</span>
                </span>
                <span className="flex gap-2">
                  <button type="button" aria-pressed={mark?.present === true} onClick={() => run(`att-${gymnast.id}`, () => markAttendance(gymnast.id, date, true))} className={`px-3 py-2 rounded-full text-sm ${mark?.present === true ? 'bg-[#5C2A6E] text-white' : 'border border-[#E4D7EE]'}`}>Present</button>
                  <button type="button" aria-pressed={mark?.present === false} onClick={() => run(`att-${gymnast.id}`, () => markAttendance(gymnast.id, date, false))} className={`px-3 py-2 rounded-full text-sm ${mark?.present === false ? 'bg-[#5C2A6E] text-white' : 'border border-[#E4D7EE]'}`}>Absent</button>
                </span>
              </div>
            );
          })}
        </div>
        {rosterGymnasts.map((gymnast) => <Message key={gymnast.id} id={`att-${gymnast.id}`} />)}
        {showHistory && (
          <div className="space-y-2 pt-2 border-t border-[#F4EEF8]">
            <h3 className="text-sm text-[#3E1B4A]">Past registers (last 90 days)</h3>
            {pastDates.length === 0 && <p className="text-sm text-[#5C4A68]">No registers taken yet.</p>}
            {pastDates.map((day) => {
              const marks = attendance.filter((item) => item.date === day);
              const present = marks.filter((item) => item.present).map((item) => nameOf(item.gymnastId));
              const absent = marks.filter((item) => !item.present).map((item) => nameOf(item.gymnastId));
              return (
                <details key={day} className="rounded-xl border border-[#E4D7EE] p-3 text-sm">
                  <summary className="cursor-pointer">
                    {new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · {present.length} present, {absent.length} absent
                  </summary>
                  <p className="mt-2"><strong>Present:</strong> {present.join(', ') || 'None'}</p>
                  <p><strong>Absent:</strong> {absent.join(', ') || 'None'}</p>
                  <button type="button" onClick={() => setDate(day)} className="mt-1 text-[#5C2A6E] underline">Open this register</button>
                </details>
              );
            })}
          </div>
        )}
      </section>

      <section id="fee-reminders" className={SECTION}>
        <SectionTitle icon={<Banknote className="w-5 h-5" />}>Fee Reminders</SectionTitle>
        <p className="text-sm text-[#5C4A68]">Sent as a WhatsApp message to the telephone number saved on the gymnast's profile.</p>
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
        {reminders.length > 0 && <h3 className="text-sm text-[#3E1B4A] pt-2">Sent reminders</h3>}
        {reminders.map((item) => (
          <p key={item.id} className="text-xs text-[#5C4A68]">
            {nameOf(item.gymnastId)} · {new Date(item.sentAt).toLocaleString()} · {item.status === 'sent' ? 'Sent' : item.status === 'not_configured' ? 'Not sent (WhatsApp not set up)' : item.status === 'no_phone' ? 'Not sent (no number)' : 'Failed'}
          </p>
        ))}
      </section>

      <section id="training-noticeboard" className={SECTION}>
        <SectionTitle icon={<Megaphone className="w-5 h-5" />}>Training Noticeboard</SectionTitle>
        <p className="text-sm text-[#5C4A68]">Notices appear here and on every gymnast's profile and home page.</p>
        <input value={noticeTitle} onChange={(event) => setNoticeTitle(event.target.value)} placeholder="Session title" aria-label="Notice title" className="w-full rounded-xl border border-[#E4D7EE] px-3 py-2 text-sm" />
        <textarea value={noticeBody} onChange={(event) => setNoticeBody(event.target.value)} aria-label="Notice details" className="w-full rounded-xl border border-[#E4D7EE] px-3 py-2 text-sm" />
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
        {notices.length > 0 && <h3 className="text-sm text-[#3E1B4A] pt-2">Sent notices</h3>}
        {notices.map((item) => (
          <article key={item.id} className="border-t border-[#F4EEF8] pt-2 flex items-start justify-between gap-3">
            <div>
              <h3>{item.title}</h3>
              <p className="text-sm text-[#5C4A68]">{item.body}</p>
              <p className="text-xs text-[#5C4A68]">{new Date(item.createdAt).toLocaleString()} · {item.authorName}</p>
            </div>
            {canDeleteNotices && (
              confirmDelete === item.id ? (
                <span className="flex flex-col sm:flex-row gap-2 shrink-0 text-sm">
                  <button
                    type="button"
                    disabled={busy === 'delete-notice'}
                    onClick={async () => {
                      await run('delete-notice', () => deleteNotice(item.id));
                      setConfirmDelete(null);
                    }}
                    className="px-3 py-2 rounded-full bg-red-700 text-white"
                  >
                    {busy === 'delete-notice' ? 'Deleting…' : 'Delete for good'}
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(null)} className="px-3 py-2 rounded-full border border-[#E4D7EE]">Keep</button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(item.id)} className="shrink-0 p-2 rounded-full text-[#5C4A68] hover:text-red-700 hover:bg-[#F4EEF8]" aria-label={`Delete notice ${item.title}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              )
            )}
          </article>
        ))}
        <Message id="delete-notice" />
      </section>

      <section id="certificates" className={SECTION}>
        <SectionTitle icon={<Award className="w-5 h-5" />}>Certificates</SectionTitle>
        <button type="button" onClick={() => setGenerating(true)} className="px-4 py-2 rounded-full bg-[#5C2A6E] text-white text-sm">
          Generate Certificate
        </button>
        <ClubCertificateDetails />
        {certificates.length > 0 && <h3 className="text-sm text-[#3E1B4A] pt-2">Issued certificates</h3>}
        {certificates.length === 0 && <p className="text-sm text-[#5C4A68]">No certificates issued yet.</p>}
        {certificates.map((item) => (
          <p key={item.id} className="text-sm flex flex-wrap items-center justify-between gap-2 border-t border-[#F4EEF8] pt-2">
            <span>{item.gymnastName} · {item.title} · {new Date(`${item.awardDate}T12:00:00`).toLocaleDateString()}</span>
            <a href={mediaUrl(`/api/uploads/${item.uploadId}`)} target="_blank" rel="noreferrer" className="text-[#5C2A6E] underline">Open</a>
          </p>
        ))}
        {generating && <CertificateGenerator onClose={() => setGenerating(false)} />}
      </section>

      <section id="document-storage" className={SECTION}>
        <SectionTitle icon={<FolderOpen className="w-5 h-5" />}>Document Storage</SectionTitle>
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
        {documents.length > 0 && <h3 className="text-sm text-[#3E1B4A] pt-2">Uploaded documents</h3>}
        {documents.map((item) => (
          <p key={item.id} className="text-sm flex flex-wrap justify-between gap-2">
            <a href={mediaUrl(`/api/uploads/${item.uploadId}`)} target="_blank" rel="noreferrer" className="text-[#5C2A6E] underline">{item.name}</a>
            <span className="text-xs text-[#5C4A68]">{new Date(item.uploadedAt).toLocaleDateString()}</span>
          </p>
        ))}
      </section>
    </div>
  );
};
