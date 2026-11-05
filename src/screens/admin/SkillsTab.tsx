import React, { useState } from 'react';
import { adminApi, AdminSkill } from '../../services/adminApi';
import { youtubeVideoId } from '../../lib/skillEdits';
import { Card, ConfirmButton, FIELD, Flash, Loading, OUTLINE, PRIMARY, useAction, useLoad } from './adminUi';

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'FLOOR', label: 'Floor' },
  { value: 'VAULT', label: 'Vault' },
  { value: 'BARS', label: 'Bars' },
  { value: 'BEAM', label: 'Beam' },
];
const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const label = (value: string) => CATEGORIES.find((item) => item.value === value)?.label ?? value;
const videoLink = (id: string | null) => (id ? `https://www.youtube.com/watch?v=${id}` : '');

interface Draft {
  name: string;
  level: number;
  category: string;
  description: string;
  optional: boolean;
  video: string;
}

const SkillForm: React.FC<{ initial: Draft; busy: boolean; submit: string; onSave: (draft: Draft) => void; onCancel: () => void }> = ({ initial, busy, submit, onSave, onCancel }) => {
  const [draft, setDraft] = useState(initial);
  const linkLooksWrong = draft.video.trim() !== '' && !youtubeVideoId(draft.video);
  return (
    <form className="grid sm:grid-cols-2 gap-2 border-t border-[#F4EEF8] pt-2" onSubmit={(event) => { event.preventDefault(); onSave(draft); }}>
      <label>Name<input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={FIELD} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label>Level
          <select value={draft.level} onChange={(e) => setDraft({ ...draft, level: Number(e.target.value) })} className={FIELD}>
            {LEVELS.map((n) => <option key={n} value={n}>Level {n}</option>)}
          </select>
        </label>
        <label>Apparatus
          <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className={FIELD}>
            {CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
      </div>
      <label className="sm:col-span-2">Instructions<textarea rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className={FIELD} /></label>
      <label className="sm:col-span-2">Instructional video: a YouTube link. Leave it empty for no video.
        <input value={draft.video} onChange={(e) => setDraft({ ...draft, video: e.target.value })} placeholder="https://www.youtube.com/watch?v=…" className={FIELD} />
        {linkLooksWrong && <span className="block text-red-600">That is not a YouTube link.</span>}
      </label>
      <label className="sm:col-span-2 flex items-center gap-2"><input type="checkbox" checked={draft.optional} onChange={(e) => setDraft({ ...draft, optional: e.target.checked })} /> Optional: a gymnast can move up a level without it</label>
      <div className="sm:col-span-2 flex gap-2">
        <button disabled={busy || linkLooksWrong} className={PRIMARY}>{submit}</button>
        <button type="button" onClick={onCancel} className={OUTLINE}>Cancel</button>
      </div>
    </form>
  );
};

export const SkillsTab: React.FC = () => {
  const { data, error, reload } = useLoad(adminApi.skills);
  const { note, busy, run } = useAction(reload);
  const [level, setLevel] = useState(1);
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  if (!data) return <Loading error={error} />;

  const inLevel = data.skills.filter((skill) => skill.level === level);
  const shown = inLevel.filter((skill) => !category || skill.category === category);

  const move = (skill: AdminSkill, step: -1 | 1) => {
    const ids = inLevel.map((item) => item.id);
    const from = ids.indexOf(skill.id);
    // Moves past the next skill on this list, even when the list is showing one apparatus.
    const neighbour = shown[shown.findIndex((item) => item.id === skill.id) + step];
    if (!neighbour) return;
    const to = ids.indexOf(neighbour.id);
    ids.splice(from, 1);
    ids.splice(to, 0, skill.id);
    void run(() => adminApi.orderSkills(ids), `${skill.name} moved.`);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#5C4A68]">Changes reach gymnasts the next time they open the app. A new skill that is not optional counts towards moving up that level. Removing a skill leaves past videos and levels as they are, and it can be put back.</p>
      <div className="flex flex-wrap gap-2 items-center">
        <select value={level} onChange={(e) => { setLevel(Number(e.target.value)); setEditing(null); }} aria-label="Level" className="rounded-xl border border-[#E4D7EE] px-3 py-2 text-sm">
          {LEVELS.map((n) => <option key={n} value={n}>Level {n}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Apparatus" className="rounded-xl border border-[#E4D7EE] px-3 py-2 text-sm">
          <option value="">All apparatus</option>
          {CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <button type="button" onClick={() => { setAdding(true); setEditing(null); }} className={PRIMARY}>Add a skill</button>
      </div>
      <Flash note={note} />
      {adding && (
        <Card title="New skill">
          <SkillForm
            initial={{ name: '', level, category: category || 'FLOOR', description: '', optional: false, video: '' }}
            busy={busy}
            submit="Add skill"
            onCancel={() => setAdding(false)}
            onSave={async (draft) => {
              const done = await run(() => adminApi.addSkill({ ...draft, video: draft.video.trim() }), `${draft.name} is added to level ${draft.level}.`);
              if (done) {
                setAdding(false);
                setLevel(draft.level);
              }
            }}
          />
        </Card>
      )}
      <p className="text-sm text-[#5C4A68]">{shown.length} {shown.length === 1 ? 'skill' : 'skills'}</p>
      {shown.map((skill, index) => (
        <article key={skill.id} className="bg-white border border-[#E4D7EE] rounded-2xl p-4 space-y-2 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-[#3E1B4A]">{skill.name}</h2>
              <p className="text-xs text-[#5C4A68]">{label(skill.category)}{skill.optional ? ' · Optional' : ''} · {skill.videoId ? 'Has a video' : 'No video'}{skill.custom ? ' · Added by you' : ''}</p>
            </div>
            <div className="flex gap-1">
              <button type="button" aria-label={`Move ${skill.name} up`} disabled={busy || index === 0} onClick={() => move(skill, -1)} className={OUTLINE}>↑</button>
              <button type="button" aria-label={`Move ${skill.name} down`} disabled={busy || index === shown.length - 1} onClick={() => move(skill, 1)} className={OUTLINE}>↓</button>
            </div>
          </div>
          {skill.description && <p>{skill.description}</p>}
          {editing === skill.id ? (
            <SkillForm
              initial={{ name: skill.name, level: skill.level, category: skill.category, description: skill.description, optional: skill.optional, video: videoLink(skill.videoId) }}
              busy={busy}
              submit="Save"
              onCancel={() => setEditing(null)}
              onSave={async (draft) => {
                const { video, ...rest } = draft;
                // Only a changed link counts as choosing a video, so built-in videos stay as they are otherwise.
                const changedVideo = video.trim() !== videoLink(skill.videoId) ? { video: video.trim() } : {};
                const done = await run(() => adminApi.saveSkill(skill.id, { ...rest, ...changedVideo }), `${draft.name} is saved.`);
                if (done) setEditing(null);
              }}
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => { setEditing(skill.id); setAdding(false); }} className={OUTLINE}>Edit</button>
              {skill.videoId && <a href={videoLink(skill.videoId)} target="_blank" rel="noopener noreferrer" className={OUTLINE}>Watch video</a>}
              <ConfirmButton label="Remove" confirm="Remove from the app" disabled={busy} onConfirm={() => run(() => adminApi.removeSkill(skill.id), `${skill.name} is removed. It is listed below if you want it back.`)} />
            </div>
          )}
        </article>
      ))}
      {data.removed.length > 0 && (
        <Card title="Removed skills">
          {data.removed.map((skill) => (
            <div key={skill.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-[#F4EEF8] pt-2">
              <span>{skill.name} · Level {skill.level}</span>
              <button type="button" disabled={busy} onClick={() => run(() => adminApi.restoreSkill(skill.id), `${skill.name} is back.`)} className={OUTLINE}>Put it back</button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
};
