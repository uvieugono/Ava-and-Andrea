import React, { useState } from 'react';
import { whatsappLink } from '../../lib/support';
import { adminApi, AnnouncementRow } from '../../services/adminApi';
import { Card, ConfirmButton, dayTime, FIELD, Flash, Loading, PRIMARY, useAction, useLoad } from './adminUi';

const AUDIENCE: Record<string, string> = { everyone: 'Everyone', gymnasts: 'All gymnasts', clubs: 'All club staff', club: 'One club' };

const audienceText = (item: AnnouncementRow) => (item.audience === 'club' ? item.clubName ?? 'A club that is gone' : AUDIENCE[item.audience]);

export const CommunicationTab: React.FC = () => {
  const { data, error, reload } = useLoad(adminApi.communication);
  const { note, busy, run } = useAction(reload);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState('everyone');
  const [clubId, setClubId] = useState('');
  if (!data) return <Loading error={error} />;

  return (
    <div className="space-y-5">
      <Card title="Send an announcement">
        <p className="text-[#5C4A68]">It appears on the noticeboard of each person it is for, the next time they open GymTrack. It does not send an email or a WhatsApp message.</p>
        <form
          className="space-y-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const done = await run(() => adminApi.publishAnnouncement({ title: title.trim(), body: body.trim(), audience, ...(audience === 'club' ? { clubId } : {}) }), 'The announcement is sent.');
            if (done) {
              setTitle('');
              setBody('');
            }
          }}
        >
          <label className="block">Title<input required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className={FIELD} /></label>
          <label className="block">Message<textarea required rows={4} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} className={FIELD} /></label>
          <label className="block">Who is it for?
            <select value={audience} onChange={(e) => setAudience(e.target.value)} className={FIELD}>
              {Object.entries(AUDIENCE).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          {audience === 'club' && (
            <label className="block">Which club?
              <select required value={clubId} onChange={(e) => setClubId(e.target.value)} className={FIELD}>
                <option value="">Choose a club</option>
                {data.clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
              </select>
            </label>
          )}
          <Flash note={note} />
          <button disabled={busy} className={PRIMARY}>{busy ? 'Sending…' : 'Send announcement'}</button>
        </form>
      </Card>
      <Card title="Sent announcements">
        {data.announcements.length === 0 && <p className="text-[#5C4A68]">Nothing sent yet.</p>}
        {data.announcements.map((item) => (
          <article key={item.id} className="border-t border-[#F4EEF8] pt-2 space-y-1">
            <p className="font-semibold text-[#3E1B4A]">{item.title}</p>
            <p className="whitespace-pre-wrap">{item.body}</p>
            <p className="text-xs text-[#5C4A68]">To {audienceText(item)} · {dayTime(item.createdAt)} · {item.createdBy}</p>
            <ConfirmButton label="Delete" confirm="Delete for everyone" disabled={busy} onConfirm={() => run(() => adminApi.deleteAnnouncement(item.id), 'The announcement is deleted.')} />
          </article>
        ))}
      </Card>
      <Card title="Messages from the Contact Us page">
        {data.enquiries.length === 0 && <p className="text-[#5C4A68]">No messages yet.</p>}
        {data.enquiries.map((item) => (
          <article key={item.id} className="border-t border-[#F4EEF8] pt-2 space-y-1">
            <p className="font-semibold text-[#3E1B4A]">{item.name}</p>
            <p className="whitespace-pre-wrap">{item.message}</p>
            <p className="text-xs text-[#5C4A68]">{dayTime(item.createdAt)}{item.phone ? ' · ' : ''}{item.phone && <a className="underline" href={whatsappLink(item.phone, `Hello ${item.name}, this is GymTrack replying to your message.`)} target="_blank" rel="noopener noreferrer">Reply on WhatsApp to {item.phone}</a>}</p>
          </article>
        ))}
      </Card>
    </div>
  );
};
