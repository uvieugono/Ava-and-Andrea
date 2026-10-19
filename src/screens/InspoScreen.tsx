import React, { useEffect, useState } from 'react';
import { gymApi, InspoPost, MAX_VIDEO_MB, UploadError, uploadFile } from '../services/gymApi';
import { useGym } from '../context/GymContext';

const CATEGORIES = ['All', 'Floor', 'Vault', 'Bars', 'Beam', 'Tumbling', 'Flexibility', 'Strength', 'Skills', 'Training', 'Competitions', 'Challenges', 'Progress'];

const EMPTY = {
  skill: 'Back handspring',
  category: 'Floor',
  clubTag: '',
  caption: '',
  hashtags: '',
  visibility: 'everyone',
  showAge: false,
  showLevel: false,
  videoUrl: '',
  previewUrl: '',
};

const PUBLISH_ERRORS: Record<string, string> = {
  PARENT_REQUIRED: 'A parent must accept before this video can be published.',
  PAYMENT_REQUIRED: 'Your free week has ended. Payment is needed before you can publish.',
  VIDEO_REQUIRED: 'Choose a video first.',
  VIDEO_INVALID: 'That video could not be used. Choose it again.',
  SKILL_REQUIRED: 'Say which skill the video shows.',
  CATEGORY: 'Choose a category.',
  UNAUTHORIZED: 'You are signed out. Sign in again to publish.',
};

export const InspoScreen: React.FC = () => {
  const { skills, user } = useGym();
  const [category, setCategory] = useState('All');
  const [followingOnly, setFollowingOnly] = useState(false);
  const [posts, setPosts] = useState<InspoPost[]>([]);
  const [savedOnly, setSavedOnly] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [notes, setNotes] = useState<{ id: string; kind: string; postId: string | null }[]>([]);
  const [showNotes, setShowNotes] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [draft, setDraft] = useState(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = async (next = category, saved = savedOnly, following = followingOnly) => {
    if (saved) {
      setPosts((await gymApi.saved()).posts);
      return;
    }
    setPosts((await gymApi.inspo(next, following)).posts);
  };

  useEffect(() => {
    load().catch(() => setPosts([]));
    gymApi.notifications().then((result) => setNotes(result.notifications)).catch(() => setNotes([]));
  }, [category, savedOnly, followingOnly]);

  const closeForm = () => {
    if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
    setOpen(false);
    setPreviewing(false);
    setDraft(EMPTY);
    setFile(null);
    setFormError(null);
  };

  const onFile = (picked: File | undefined) => {
    if (!picked) return;
    setFormError(null);
    if (!picked.type.startsWith('video/')) {
      setFormError('That is not a video. Choose an MP4, MOV or WebM file.');
      return;
    }
    if (picked.size > MAX_VIDEO_MB * 1024 * 1024) {
      setFormError(`That clip is over ${MAX_VIDEO_MB} MB. Use a shorter clip.`);
      return;
    }
    if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
    setFile(picked);
    setDraft((prev) => ({ ...prev, previewUrl: URL.createObjectURL(picked) }));
  };

  const upload = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!previewing) {
      if (!file) {
        setFormError('Choose a video first.');
        return;
      }
      if (!draft.skill.trim()) {
        setFormError('Say which skill the video shows.');
        return;
      }
      setPreviewing(true);
      return;
    }
    if (!file) {
      setFormError('Choose a video first.');
      return;
    }
    setPublishing(true);
    try {
      // 1. Send the video to GymTrack. 2. Publish the post that points at it.
      const stored = await uploadFile(file, { scope: 'public' });
      await gymApi.createInspo({
        skill: draft.skill,
        category: draft.category,
        clubTag: draft.clubTag,
        caption: draft.caption,
        visibility: draft.visibility,
        showAge: draft.showAge,
        showLevel: draft.showLevel,
        hashtags: draft.hashtags.split(/\s+/).filter(Boolean),
        videoUrl: stored.url,
      });
      closeForm();
      setCategory('All');
      setSavedOnly(false);
      setFollowingOnly(false);
      await load('All', false, false);
      setNotice('Your video is published.');
    } catch (err) {
      if (err instanceof UploadError) {
        setFormError(err.message);
      } else {
        const code = (err as { body?: { code?: string } }).body?.code ?? '';
        setFormError(PUBLISH_ERRORS[code] ?? 'The video could not be published. Check your connection and try again.');
      }
    } finally {
      setPublishing(false);
    }
  };

  const share = async (post: InspoPost) => {
    const text = post.visibility === 'everyone'
      ? `${post.skill} on GymTrack Connect`
      : `This video is only for ${post.visibility === 'club' ? 'the club' : 'followers'}.`;
    if (post.visibility !== 'everyone') {
      setNotice(text);
      return;
    }
    if (navigator.share) {
      await navigator.share({ title: post.skill, text }).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(text);
    setNotice('Share text copied.');
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-[#3E1B4A]">Connect</h1>
          <p className="text-sm text-[#5C4A68]">Gymnastics videos from gymnasts.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setShowNotes((value) => !value)} className="px-3 py-2 rounded-full border border-[#E4D7EE] text-sm">
            Notifications{notes.length ? ` (${notes.length})` : ''}
          </button>
          <button type="button" onClick={() => { setOpen(true); setPreviewing(false); setFormError(null); setDraft((prev) => ({ ...prev, clubTag: prev.clubTag || user.clubName })); }} className="px-4 py-2 rounded-full bg-[#5C2A6E] text-white text-sm">
            + Upload Video
          </button>
        </div>
      </div>

      {showNotes && (
        <div className="bg-white border border-[#E4D7EE] rounded-2xl p-4 space-y-2">
          {notes.length === 0 && <p className="text-sm text-[#5C4A68]">No notifications yet.</p>}
          {notes.map((item) => (
            <button key={item.id} type="button" onClick={() => { setSavedOnly(false); setFollowingOnly(false); setCategory('All'); setShowNotes(false); }} className="block text-left text-sm w-full">
              {item.kind === 'like' && 'Someone liked your video.'}
              {item.kind === 'comment' && 'Someone commented on your video.'}
              {item.kind === 'reply' && 'Someone replied to your comment.'}
              {item.kind === 'follow' && 'Someone followed you.'}
              {item.kind === 'upload' && 'Someone you follow uploaded a video.'}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map((item) => (
          <button key={item} type="button" onClick={() => { setSavedOnly(false); setFollowingOnly(false); setCategory(item); }} className={`px-3 py-1 rounded-full text-sm whitespace-nowrap ${category === item && !savedOnly && !followingOnly ? 'bg-[#5C2A6E] text-white' : 'bg-white border border-[#E4D7EE]'}`}>
            {item}
          </button>
        ))}
        <button type="button" onClick={() => { setSavedOnly(false); setFollowingOnly(true); }} className={`px-3 py-1 rounded-full text-sm ${followingOnly ? 'bg-[#5C2A6E] text-white' : 'bg-white border border-[#E4D7EE]'}`}>Following</button>
        <button type="button" onClick={() => { setFollowingOnly(false); setSavedOnly(true); }} className={`px-3 py-1 rounded-full text-sm ${savedOnly ? 'bg-[#5C2A6E] text-white' : 'bg-white border border-[#E4D7EE]'}`}>Saved Inspo</button>
      </div>
      {notice && <p className="text-sm text-[#3E1B4A]">{notice}</p>}
      {posts.length === 0 && <p className="text-sm text-[#5C4A68]">No videos in this view yet.</p>}

      {posts.map((post) => (
        <article key={post.id} className="bg-white rounded-2xl border border-[#E4D7EE] overflow-hidden">
          {post.videoUrl?.startsWith('data:video') || post.videoUrl?.startsWith('blob:') || post.videoUrl?.startsWith('/api/uploads/') || /\.(mp4|webm)(\?|$)/i.test(post.videoUrl || '') ? (
            <video src={post.videoUrl} controls preload="metadata" className="w-full aspect-video bg-black" />
          ) : (
            <div className="aspect-video bg-[#241628] text-white flex items-center justify-center text-sm px-4 text-center">{post.skill}</div>
          )}
          <div className="p-4 space-y-2">
            <p className="text-[#241628]">{post.authorName}</p>
            <p className="text-sm text-[#5C4A68]">
              {post.clubName || 'Club not shown'}
              {post.level ? ` · Level ${post.level}` : ''}
              {post.age ? ` · Age ${post.age}` : ''}
            </p>
            <p className="text-sm">{post.caption}</p>
            <p className="text-sm text-[#5C2A6E]">{post.skill} · {post.hashtags.join(' ')}</p>
            <div className="flex flex-wrap gap-3 text-sm">
              <button type="button" onClick={() => gymApi.like(post.id).then(() => load())}>Like {post.likes}</button>
              <button type="button" onClick={() => gymApi.save(post.id).then(() => load())}>{post.saved ? 'Saved' : 'Save'}</button>
              <button type="button" onClick={() => share(post)}>Share</button>
              <button type="button" onClick={() => gymApi.follow(post.authorId).then(() => load()).catch(() => setNotice('Sign in to follow.'))}>Follow</button>
              {post.clubId && (
                <button type="button" onClick={() => gymApi.followClub(post.clubId as string).catch(() => setNotice('Sign in to follow a club.'))}>Follow club</button>
              )}
              <button type="button" onClick={() => gymApi.block(post.authorId).then(() => load()).catch(() => setNotice('Sign in to block.'))}>Block</button>
            </div>
            {post.comments.map((comment) => (
              <div key={comment.id} className="text-sm flex justify-between gap-2">
                <p><strong>{comment.authorName}: </strong>{comment.text}</p>
                <span className="shrink-0 space-x-2">
                  <button type="button" onClick={() => setReplyTo(comment.id)}>Reply</button>
                  <button type="button" onClick={() => gymApi.reportComment(comment.id).then(() => load()).catch(() => setNotice('Sign in to report.'))}>Report</button>
                </span>
              </div>
            ))}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const text = String(new FormData(event.currentTarget).get('text') || '');
                gymApi.comment(post.id, text, replyTo).then(() => { setReplyTo(null); return load(); }).catch((err) => {
                  const code = (err as { body?: { code?: string } }).body?.code;
                  setNotice(code === 'HELD' ? 'That comment is held for review.' : 'Sign in to comment.');
                });
                event.currentTarget.reset();
              }}
              className="flex gap-2"
            >
              <input name="text" placeholder={replyTo ? 'Write a reply' : 'Encourage them'} className="flex-1 rounded-full border border-[#E4D7EE] px-3 py-2 text-sm" />
              <button className="text-sm text-[#5C2A6E]">Comment</button>
            </form>
          </div>
        </article>
      ))}

      {open && (
        <form onSubmit={upload} className="fixed inset-0 bg-[#241628]/40 flex items-end sm:items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-4 w-full max-w-md space-y-2 max-h-[90vh] overflow-y-auto">
            <h2 className="font-display text-2xl text-[#3E1B4A]">{previewing ? 'Preview' : 'Upload Video'}</h2>
            {draft.previewUrl && <video src={draft.previewUrl} controls className="w-full rounded-xl bg-black" />}
            {!previewing && (
              <>
                <input list="connect-skills" value={draft.skill} onChange={(e) => setDraft({ ...draft, skill: e.target.value })} placeholder="Skill" className="w-full rounded-xl border border-[#E4D7EE] px-3 py-2 text-sm" />
                <datalist id="connect-skills">
                  {Array.from(new Set(skills.filter((item) => item.level === user.level).map((item) => item.name))).map((name) => <option key={name} value={name} />)}
                </datalist>
                <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className="w-full rounded-xl border border-[#E4D7EE] px-3 py-2 text-sm">
                  {CATEGORIES.filter((item) => item !== 'All').map((item) => <option key={item}>{item}</option>)}
                </select>
                <input value={draft.clubTag} onChange={(e) => setDraft({ ...draft, clubTag: e.target.value })} placeholder="Club" className="w-full rounded-xl border border-[#E4D7EE] px-3 py-2 text-sm" />
                <input value={draft.hashtags} onChange={(e) => setDraft({ ...draft, hashtags: e.target.value })} placeholder="#hashtags" className="w-full rounded-xl border border-[#E4D7EE] px-3 py-2 text-sm" />
                <textarea value={draft.caption} onChange={(e) => setDraft({ ...draft, caption: e.target.value })} placeholder="Caption" className="w-full rounded-xl border border-[#E4D7EE] px-3 py-2 text-sm" />
                <select value={draft.visibility} onChange={(e) => setDraft({ ...draft, visibility: e.target.value })} className="w-full rounded-xl border border-[#E4D7EE] px-3 py-2 text-sm">
                  <option value="everyone">Everyone</option>
                  <option value="followers">Followers</option>
                  <option value="club">My club</option>
                </select>
                <label className="text-sm flex gap-2"><input type="checkbox" checked={draft.showLevel} onChange={(e) => setDraft({ ...draft, showLevel: e.target.checked })} /> Show level</label>
                <label className="text-sm flex gap-2"><input type="checkbox" checked={draft.showAge} onChange={(e) => setDraft({ ...draft, showAge: e.target.checked })} /> Show age</label>
                <input type="file" accept="video/*" onChange={(e) => onFile(e.target.files?.[0])} className="text-sm" />
                {file && <p className="text-xs text-[#5C4A68]">{file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB</p>}
              </>
            )}
            {previewing && (
              <div className="text-sm space-y-1">
                <p>{draft.skill} · {draft.category}</p>
                <p>{draft.clubTag}</p>
                <p>{draft.caption}</p>
                <p>Who can view: {draft.visibility}</p>
              </div>
            )}
            {formError && <p className="text-sm text-red-600" role="alert">{formError}</p>}
            <div className="flex gap-2">
              <button type="button" disabled={publishing} onClick={() => { if (previewing) { setPreviewing(false); setFormError(null); } else closeForm(); }} className="flex-1 py-2 rounded-full border border-[#E4D7EE] text-sm">{previewing ? 'Back' : 'Close'}</button>
              <button disabled={publishing} className="flex-1 py-2 rounded-full bg-[#5C2A6E] text-white text-sm disabled:opacity-60">{publishing ? 'Publishing…' : previewing ? 'Publish' : 'Preview'}</button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
};
