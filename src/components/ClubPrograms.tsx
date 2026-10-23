import React, { useState } from 'react';
import { Dumbbell, Medal, Trophy, X } from 'lucide-react';
import { useGym } from '../context/GymContext';
import { CompetitionView, mediaUrl } from '../services/gymApi';

type Note = { ok: boolean; message: string } | null;

const FIELD = 'w-full rounded-xl border border-[#E4D7EE] px-3 py-2 text-sm';
const SECTION = 'bg-white border border-[#E4D7EE] rounded-2xl p-4 space-y-3';
const MEDALS: { value: string; label: string }[] = [
  { value: '', label: 'No medal' },
  { value: 'gold', label: 'Gold' },
  { value: 'silver', label: 'Silver' },
  { value: 'bronze', label: 'Bronze' },
];

export const medalLabel = (medal?: string) => MEDALS.find((item) => item.value === (medal ?? ''))?.label ?? 'No medal';

const Title: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
  <h2 className="font-display text-2xl text-[#3E1B4A] flex items-center gap-3">
    <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#5C2A6E] to-[#3E1B4A] text-white flex items-center justify-center shrink-0" aria-hidden="true">
      {icon}
    </span>
    {children}
  </h2>
);

const Feedback: React.FC<{ note: Note }> = ({ note }) =>
  note ? <p className={`text-sm ${note.ok ? 'text-emerald-800' : 'text-red-600'}`} role={note.ok ? 'status' : 'alert'}>{note.message}</p> : null;

/** Uploads a drill and assigns it to the chosen gymnasts' profiles. */
export const DrillForm: React.FC<{ initialGymnastIds?: string[]; onSaved?: () => void }> = ({ initialGymnastIds = [], onSaved }) => {
  const { rosterGymnasts, addDrill } = useGym();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [chosen, setChosen] = useState<string[]>(initialGymnastIds);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const levels = Array.from(new Set(rosterGymnasts.map((item) => item.level))).sort((a, b) => a - b);

  const toggle = (id: string) => setChosen((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  const chooseLevel = (level: number) => setChosen(Array.from(new Set([...chosen, ...rosterGymnasts.filter((item) => item.level === level).map((item) => item.id)])));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setNote(null);
    if (!title.trim()) return setNote({ ok: false, message: 'Give the drill a title.' });
    if (chosen.length === 0) return setNote({ ok: false, message: 'Choose at least one gymnast.' });
    setBusy(true);
    const result = await addDrill({ gymnastIds: chosen, title: title.trim(), description: description.trim(), instructions: instructions.trim(), attachment });
    setBusy(false);
    setNote(result);
    if (result.ok) {
      setTitle('');
      setDescription('');
      setInstructions('');
      setAttachment(null);
      setChosen(initialGymnastIds);
      onSaved?.();
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 text-sm">
      <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Drill title" aria-label="Drill title" className={FIELD} />
      <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" aria-label="Description" rows={2} className={FIELD} />
      <textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Instructions (sets, reps, what to watch for)" aria-label="Instructions" rows={3} className={FIELD} />
      <label className="block">
        <span className="block text-[#5C4A68] mb-1">Attachment (optional): PDF, image or document up to 10 MB</span>
        <input type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,.doc,.docx" onChange={(event) => setAttachment(event.target.files?.[0] ?? null)} className="text-xs" />
      </label>
      <fieldset className="space-y-2">
        <legend className="text-[#5C4A68]">Assign to</legend>
        {levels.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {levels.map((level) => (
              <button key={level} type="button" onClick={() => chooseLevel(level)} className="px-3 py-1 rounded-full border border-[#E4D7EE] text-xs">All at Level {level}</button>
            ))}
          </div>
        )}
        {rosterGymnasts.length === 0 && <p className="text-[#5C4A68]">Add gymnasts to your club first.</p>}
        <div className="grid sm:grid-cols-2 gap-1">
          {rosterGymnasts.map((gymnast) => (
            <label key={gymnast.id} className="flex items-center gap-2 py-1">
              <input type="checkbox" checked={chosen.includes(gymnast.id)} onChange={() => toggle(gymnast.id)} />
              {gymnast.name} · Level {gymnast.level}
            </label>
          ))}
        </div>
      </fieldset>
      <Feedback note={note} />
      <button disabled={busy} className="px-4 py-2 rounded-full bg-[#5C2A6E] text-white disabled:opacity-60">{busy ? 'Saving…' : 'Upload drill'}</button>
    </form>
  );
};

export const ClubDrills: React.FC = () => {
  const { drills, rosterGymnasts } = useGym();
  const nameOf = (id: string) => rosterGymnasts.find((item) => item.id === id)?.name ?? 'Gymnast';
  return (
    <section id="practice-drills" className={SECTION}>
      <Title icon={<Dumbbell className="w-5 h-5" />}>Practice Drills</Title>
      <p className="text-sm text-[#5C4A68]">Upload a drill and choose who it is for. It shows on each chosen gymnast's profile straight away.</p>
      <DrillForm />
      {drills.length > 0 && <h3 className="text-sm text-[#3E1B4A] pt-2">Uploaded drills</h3>}
      {drills.map((drill) => (
        <article key={drill.id} className="border-t border-[#F4EEF8] pt-2 text-sm space-y-1">
          <h4 className="text-[#241628]">{drill.title}</h4>
          {drill.description && <p className="text-[#5C4A68]">{drill.description}</p>}
          {drill.instructions && <p className="whitespace-pre-line">{drill.instructions}</p>}
          {drill.attachmentUploadId && (
            <a href={mediaUrl(`/api/uploads/${drill.attachmentUploadId}`)} target="_blank" rel="noreferrer" className="text-[#5C2A6E] underline">Open attachment</a>
          )}
          <p className="text-xs text-[#5C4A68]">For {drill.gymnastIds.map(nameOf).join(', ')} · {new Date(drill.createdAt).toLocaleDateString()} · {drill.createdBy}</p>
        </article>
      ))}
    </section>
  );
};

type Entry = { gymnastId: string; level: string; result: string; medal: string };

const CompetitionForm: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const { rosterGymnasts, addCompetitionEvent } = useGym();
  const [name, setName] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('');
  const [venue, setVenue] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);

  const toggle = (gymnastId: string) => {
    const gymnast = rosterGymnasts.find((item) => item.id === gymnastId);
    setEntries((prev) =>
      prev.some((item) => item.gymnastId === gymnastId)
        ? prev.filter((item) => item.gymnastId !== gymnastId)
        : [...prev, { gymnastId, level: gymnast ? `Level ${gymnast.level}` : '', result: '', medal: '' }],
    );
  };
  const update = (gymnastId: string, change: Partial<Entry>) => setEntries((prev) => prev.map((item) => (item.gymnastId === gymnastId ? { ...item, ...change } : item)));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setNote(null);
    if (!name.trim()) return setNote({ ok: false, message: 'Enter the event name.' });
    if (!date) return setNote({ ok: false, message: 'Enter the event date.' });
    if (entries.length === 0) return setNote({ ok: false, message: 'Choose at least one participating gymnast.' });
    setBusy(true);
    const result = await addCompetitionEvent({ name: name.trim(), date, time, venue: venue.trim(), participants: entries });
    setBusy(false);
    setNote(result);
    if (result.ok) onDone();
  };

  return (
    <form onSubmit={submit} className="space-y-3 text-sm border border-[#E4D7EE] rounded-xl p-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Event name" aria-label="Event name" className={FIELD} />
        <input value={venue} onChange={(event) => setVenue(event.target.value)} placeholder="Venue" aria-label="Venue" className={FIELD} />
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-label="Date" className={FIELD} />
        <input type="time" value={time} onChange={(event) => setTime(event.target.value)} aria-label="Time" className={FIELD} />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-[#5C4A68]">Participating gymnasts, their competition level and any result</legend>
        {rosterGymnasts.map((gymnast) => {
          const entry = entries.find((item) => item.gymnastId === gymnast.id);
          return (
            <div key={gymnast.id} className="border border-[#F4EEF8] rounded-xl p-2 space-y-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={Boolean(entry)} onChange={() => toggle(gymnast.id)} />
                {gymnast.name}
              </label>
              {entry && (
                <div className="grid sm:grid-cols-3 gap-2">
                  <input value={entry.level} onChange={(event) => update(gymnast.id, { level: event.target.value })} placeholder="Competition level" aria-label={`Competition level for ${gymnast.name}`} className={FIELD} />
                  <input value={entry.result} onChange={(event) => update(gymnast.id, { result: event.target.value })} placeholder="Result (can be added later)" aria-label={`Result for ${gymnast.name}`} className={FIELD} />
                  <select value={entry.medal} onChange={(event) => update(gymnast.id, { medal: event.target.value })} aria-label={`Medal for ${gymnast.name}`} className={FIELD}>
                    {MEDALS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </div>
              )}
            </div>
          );
        })}
      </fieldset>
      <Feedback note={note} />
      <div className="flex gap-2">
        <button disabled={busy} className="px-4 py-2 rounded-full bg-[#5C2A6E] text-white disabled:opacity-60">{busy ? 'Publishing…' : 'Publish competition'}</button>
        <button type="button" onClick={onDone} className="px-4 py-2 rounded-full border border-[#E4D7EE]">Cancel</button>
      </div>
    </form>
  );
};

const ResultsForm: React.FC<{ eventId: string; rows: CompetitionView[]; onDone: () => void }> = ({ eventId, rows, onDone }) => {
  const { rosterGymnasts, recordCompetitionResults } = useGym();
  const [values, setValues] = useState<{ gymnastId: string; result: string; medal: string }[]>(() =>
    rows.map((row) => ({ gymnastId: row.gymnastId, result: row.result, medal: row.medal ?? '' })),
  );
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const nameOf = (id: string) => rosterGymnasts.find((item) => item.id === id)?.name ?? 'Gymnast';

  const save = async () => {
    setBusy(true);
    const result = await recordCompetitionResults(eventId, values);
    setBusy(false);
    setNote(result);
    if (result.ok) onDone();
  };

  return (
    <div className="space-y-2 text-sm">
      {values.map((row) => (
        <div key={row.gymnastId} className="grid sm:grid-cols-[10rem_1fr_9rem] gap-2 items-center">
          <span>{nameOf(row.gymnastId)}</span>
          <input value={row.result} onChange={(event) => setValues((prev) => prev.map((item) => (item.gymnastId === row.gymnastId ? { ...item, result: event.target.value } : item)))} placeholder="Result" aria-label={`Result for ${nameOf(row.gymnastId)}`} className={FIELD} />
          <select value={row.medal} onChange={(event) => setValues((prev) => prev.map((item) => (item.gymnastId === row.gymnastId ? { ...item, medal: event.target.value } : item)))} aria-label={`Medal for ${nameOf(row.gymnastId)}`} className={FIELD}>
            {MEDALS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
      ))}
      <Feedback note={note} />
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={save} className="px-4 py-2 rounded-full bg-[#5C2A6E] text-white disabled:opacity-60">{busy ? 'Saving…' : 'Save results'}</button>
        <button type="button" onClick={onDone} className="px-4 py-2 rounded-full border border-[#E4D7EE]">Close</button>
      </div>
    </div>
  );
};

export const ClubCompetitions: React.FC = () => {
  const { rosterGymnasts } = useGym();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const nameOf = (id: string) => rosterGymnasts.find((item) => item.id === id)?.name ?? 'Gymnast';

  // Group the club's records into events. Older single-gymnast records are their own event.
  const all = rosterGymnasts.flatMap((gymnast) => (gymnast.competitions ?? []) as CompetitionView[]);
  const groups = new Map<string, CompetitionView[]>();
  for (const row of all) {
    const key = row.eventId ?? row.id;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const events = Array.from(groups.entries()).sort((a, b) => b[1][0].date.localeCompare(a[1][0].date));

  return (
    <section id="competitions" className={SECTION}>
      <Title icon={<Trophy className="w-5 h-5" />}>Competitions</Title>
      <p className="text-sm text-[#5C4A68]">Publish an event with its date, time, venue and the gymnasts taking part. Log each gymnast's result and medal afterwards. Results show on each gymnast's profile.</p>
      {creating ? (
        <CompetitionForm onDone={() => setCreating(false)} />
      ) : (
        <button type="button" onClick={() => setCreating(true)} className="px-4 py-2 rounded-full bg-[#5C2A6E] text-white text-sm">Publish a competition</button>
      )}
      {events.length === 0 && <p className="text-sm text-[#5C4A68]">No competitions recorded yet.</p>}
      {events.map(([key, rows]) => {
        const first = rows[0];
        return (
          <article key={key} className="border-t border-[#F4EEF8] pt-3 space-y-2 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[#241628]">{first.name}</h3>
              <span className="text-xs text-[#5C4A68]">
                {new Date(`${first.date}T12:00:00`).toLocaleDateString()}{first.time ? ` · ${first.time}` : ''}{first.venue ? ` · ${first.venue}` : ''}
              </span>
            </div>
            <ul className="space-y-1">
              {rows.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-2">
                  <span>{nameOf(row.gymnastId)}</span>
                  {row.level && <span className="text-xs text-[#5C4A68]">{row.level}</span>}
                  {row.medal && (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[#F4EEF8] text-[#3E1B4A]">
                      <Medal className="w-3 h-3" />{medalLabel(row.medal)}
                    </span>
                  )}
                  <span className="text-[#5C4A68]">{row.result || 'No result logged yet'}</span>
                </li>
              ))}
            </ul>
            {first.eventId && (
              editing === key ? (
                <ResultsForm eventId={first.eventId} rows={rows} onDone={() => setEditing(null)} />
              ) : (
                <button type="button" onClick={() => setEditing(key)} className="text-[#5C2A6E] underline">Log results and medals</button>
              )
            )}
          </article>
        );
      })}
    </section>
  );
};

/** The drill form in a pop-up, for one gymnast from their profile. */
export const DrillDialog: React.FC<{ gymnastId: string; gymnastName: string; onClose: () => void }> = ({ gymnastId, gymnastName, onClose }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#241628]/65 p-4" role="dialog" aria-modal="true" aria-label={`Assign a drill to ${gymnastName}`}>
    <div className="w-full max-w-md bg-white rounded-3xl p-6 border border-[#E4D7EE] space-y-3 max-h-[92vh] overflow-y-auto">
      <div className="flex items-center justify-between">
        <h4 className="font-display text-xl text-[#3E1B4A]">Assign a drill to {gymnastName}</h4>
        <button type="button" onClick={onClose} aria-label="Close" className="p-1"><X className="w-5 h-5" /></button>
      </div>
      <DrillForm initialGymnastIds={[gymnastId]} onSaved={onClose} />
    </div>
  </div>
);
