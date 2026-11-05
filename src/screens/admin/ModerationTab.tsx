import React, { useState } from 'react';
import { adminApi, ModerationPost } from '../../services/adminApi';
import { mediaUrl } from '../../services/gymApi';
import { Card, ConfirmButton, day, DANGER, FIELD, Flash, Loading, OUTLINE, PRIMARY, useAction, useLoad } from './adminUi';

const RemoveVideo: React.FC<{ post: ModerationPost; busy: boolean; onRemove: (reason: string) => void }> = ({ post, busy, onRemove }) => {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={OUTLINE}>Remove video</button>;
  return (
    <form className="flex flex-wrap gap-2 w-full" onSubmit={(event) => { event.preventDefault(); setOpen(false); onRemove(reason.trim()); }}>
      <input required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={`Why is “${post.skill}” being removed?`} aria-label="Why is this video being removed?" className={`${FIELD} flex-1 min-w-48`} />
      <button disabled={busy} className={DANGER}>Remove for good</button>
      <button type="button" onClick={() => setOpen(false)} className={OUTLINE}>Keep</button>
    </form>
  );
};

const VideoCard: React.FC<{ post: ModerationPost; children: React.ReactNode }> = ({ post, children }) => (
  <article className="border-t border-[#F4EEF8] pt-3 space-y-2">
    <p className="font-semibold text-[#3E1B4A]">{post.skill} · {post.authorName}</p>
    {post.caption && <p>{post.caption}</p>}
    <p className="text-xs text-[#5C4A68]">Posted {day(post.createdAt)} · {post.visibility === 'club' ? 'One club only' : 'All clubs'}</p>
    {post.videoUrl && <video controls preload="metadata" src={mediaUrl(post.videoUrl)} className="w-full max-w-sm rounded-xl bg-black" />}
    {children}
  </article>
);

export const ModerationTab: React.FC = () => {
  const { data, error, reload } = useLoad(adminApi.moderation);
  const { note, busy, run } = useAction(reload);
  if (!data) return <Loading error={error} />;

  const remove = (post: ModerationPost, reason: string) => run(() => adminApi.removePost(post.id, reason), `The video is removed and ${post.authorName} has been told.`);

  return (
    <div className="space-y-5">
      <Flash note={note} />
      <Card title={`Reported videos (${data.reported.length})`}>
        {data.reported.length === 0 && <p className="text-[#5C4A68]">Nothing has been reported.</p>}
        {data.reported.map((post) => (
          <VideoCard key={post.id} post={post}>
            <ul className="space-y-1">
              {post.reports.map((report, index) => <li key={index}>“{report.reason}” · {report.reporterName} · {day(report.createdAt)}</li>)}
            </ul>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => run(() => adminApi.keepPost(post.id), 'The video stays up and the reports are cleared.')} className={PRIMARY}>Nothing wrong: keep it</button>
              <RemoveVideo post={post} busy={busy} onRemove={(reason) => remove(post, reason)} />
            </div>
          </VideoCard>
        ))}
      </Card>
      <Card title={`Comments held back (${data.comments.length})`}>
        <p className="text-[#5C4A68]">A comment is hidden as soon as someone reports it, or when its wording is flagged, until you decide.</p>
        {data.comments.length === 0 && <p className="text-[#5C4A68]">No comments are held back.</p>}
        {data.comments.map((comment) => (
          <article key={comment.id} className="border-t border-[#F4EEF8] pt-3 space-y-2">
            <p>“{comment.text}”</p>
            <p className="text-xs text-[#5C4A68]">{comment.authorName} · {day(comment.createdAt)} · {comment.why}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => run(() => adminApi.restoreComment(comment.id), 'The comment is back.')} className={PRIMARY}>Put it back</button>
              <ConfirmButton label="Remove" confirm="Remove for good" disabled={busy} onConfirm={() => run(() => adminApi.removeComment(comment.id), 'The comment is removed.')} />
            </div>
          </article>
        ))}
      </Card>
      <Card title="Latest videos">
        <p className="text-[#5C4A68]">The newest Connect videos, in case something needs removing before anyone reports it.</p>
        {data.recentPosts.length === 0 && <p className="text-[#5C4A68]">No videos yet.</p>}
        {data.recentPosts.map((post) => (
          <VideoCard key={post.id} post={post}>
            <RemoveVideo post={post} busy={busy} onRemove={(reason) => remove(post, reason)} />
          </VideoCard>
        ))}
      </Card>
    </div>
  );
};
