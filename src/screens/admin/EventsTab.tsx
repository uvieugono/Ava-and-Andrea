import React, { useState } from 'react';
import { adminApi } from '../../services/adminApi';
import { mediaUrl, PlatformEventView, UploadError, uploadFile } from '../../services/gymApi';
import { Card, ConfirmButton, day, FIELD, Flash, Loading, OUTLINE, PRIMARY, useAction, useLoad } from './adminUi';

const BLANK = { name: '', date: '', endDate: '', time: '', venue: '', city: '', description: '', organiser: '', entryInfo: '', website: '', imageUrl: '', status: 'draft' as const };
type Draft = Omit<PlatformEventView, 'id' | 'status'> & { status: PlatformEventView['status'] };

const EventForm: React.FC<{ initial: Draft; busy: boolean; onSave: (draft: Draft) => void; onCancel: () => void }> = ({ initial, busy, onSave, onCancel }) => {
  const [draft, setDraft] = useState<Draft>(initial);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const field = (name: keyof Draft, text: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label>{text}<input {...extra} value={draft[name] as string} onChange={(e) => setDraft({ ...draft, [name]: e.target.value })} className={FIELD} /></label>
  );
  return (
    <form className="grid sm:grid-cols-2 gap-2 border-t border-[#F4EEF8] pt-2" onSubmit={(event) => { event.preventDefault(); onSave(draft); }}>
      {field('name', 'Name of the event', { required: true })}
      {field('organiser', 'Who is running it')}
      {field('date', 'First day', { required: true, type: 'date' })}
      {field('endDate', 'Last day, if more than one', { type: 'date' })}
      {field('time', 'Time')}
      {field('venue', 'Venue')}
      {field('city', 'City')}
      {field('website', 'Website', { placeholder: 'https://…' })}
      <label className="sm:col-span-2">Entry fees and how to enter<input value={draft.entryInfo} onChange={(e) => setDraft({ ...draft, entryInfo: e.target.value })} className={FIELD} /></label>
      <label className="sm:col-span-2">Details<textarea rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className={FIELD} /></label>
      <div className="sm:col-span-2 space-y-2">
        <label className="block">Flyer or picture
          <input
            type="file"
            accept="image/*"
            className="block mt-1"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setUploading(true);
              setUploadError(null);
              try {
                const stored = await uploadFile(file, { scope: 'public' });
                setDraft((prev) => ({ ...prev, imageUrl: stored.url }));
              } catch (failure) {
                setUploadError(failure instanceof UploadError ? failure.message : 'The picture could not be uploaded. Try again.');
              } finally {
                setUploading(false);
              }
            }}
          />
        </label>
        {uploading && <p className="text-[#5C4A68]">Uploading…</p>}
        {uploadError && <p className="text-red-600" role="alert">{uploadError}</p>}
        {draft.imageUrl && (
          <div className="flex items-center gap-3">
            <img src={mediaUrl(draft.imageUrl)} alt="" className="h-24 rounded-xl" />
            <button type="button" onClick={() => setDraft({ ...draft, imageUrl: '' })} className={OUTLINE}>Remove picture</button>
          </div>
        )}
      </div>
      <fieldset className="sm:col-span-2">
        <legend>Who can see it</legend>
        <label className="flex gap-2"><input type="radio" name="event-status" checked={draft.status === 'draft'} onChange={() => setDraft({ ...draft, status: 'draft' })} /> Draft: only administrators</label>
        <label className="flex gap-2"><input type="radio" name="event-status" checked={draft.status === 'published'} onChange={() => setDraft({ ...draft, status: 'published' })} /> Published: everyone, on the Events page</label>
      </fieldset>
      <div className="sm:col-span-2 flex gap-2">
        <button disabled={busy || uploading} className={PRIMARY}>Save event</button>
        <button type="button" onClick={onCancel} className={OUTLINE}>Cancel</button>
      </div>
    </form>
  );
};

export const EventsTab: React.FC = () => {
  const { data, error, reload } = useLoad(adminApi.events);
  const { note, busy, run } = useAction(reload);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  if (!data) return <Loading error={error} />;

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => { setAdding(true); setEditing(null); }} className={PRIMARY}>Add an event</button>
      <Flash note={note} />
      {adding && (
        <Card title="New event">
          <EventForm
            initial={BLANK}
            busy={busy}
            onCancel={() => setAdding(false)}
            onSave={async (draft) => {
              const done = await run(() => adminApi.addEvent(draft), draft.status === 'published' ? `${draft.name} is on the Events page.` : `${draft.name} is saved as a draft.`);
              if (done) setAdding(false);
            }}
          />
        </Card>
      )}
      {data.events.length === 0 && <p className="text-sm text-[#5C4A68]">No events yet.</p>}
      {data.events.map((item) => (
        <article key={item.id} className="bg-white border border-[#E4D7EE] rounded-2xl p-4 space-y-2 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-xl text-[#3E1B4A]">{item.name}</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full ${item.status === 'published' ? 'bg-[#F4EEF8] text-[#3E1B4A]' : 'bg-amber-50 text-amber-900'}`}>{item.status === 'published' ? 'Published' : 'Draft'}</span>
          </div>
          <p className="text-[#5C4A68]">{day(item.date)}{item.endDate ? ` to ${day(item.endDate)}` : ''}{item.venue ? ` · ${item.venue}` : ''}{item.city ? `, ${item.city}` : ''}</p>
          {editing === item.id ? (
            <EventForm
              initial={item}
              busy={busy}
              onCancel={() => setEditing(null)}
              onSave={async (draft) => {
                const done = await run(() => adminApi.saveEvent(item.id, draft), `${draft.name} is saved.`);
                if (done) setEditing(null);
              }}
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => { setEditing(item.id); setAdding(false); }} className={OUTLINE}>Edit</button>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => adminApi.saveEvent(item.id, { ...item, status: item.status === 'published' ? 'draft' : 'published' }), item.status === 'published' ? `${item.name} is hidden.` : `${item.name} is on the Events page.`)}
                className={OUTLINE}
              >
                {item.status === 'published' ? 'Hide' : 'Publish'}
              </button>
              <ConfirmButton label="Delete" confirm="Delete for good" disabled={busy} onConfirm={() => run(() => adminApi.deleteEvent(item.id), `${item.name} is deleted.`)} />
            </div>
          )}
        </article>
      ))}
    </div>
  );
};
