import React, { useEffect, useState } from 'react';
import { Ban, Bookmark, Copy, MessageCircle, Share2, ThumbsUp, Trash2, Upload, UserPlus, X } from 'lucide-react';
import { gymApi, InspoPost, MAX_VIDEO_MB, UploadError, mediaUrl, uploadFile } from '../services/gymApi';
import { useGym } from '../context/GymContext';

const CATEGORIES = ['All', 'Floor', 'Vault', 'Bars', 'Beam', 'Tumbling', 'Flexibility', 'Strength', 'Skills', 'Training', 'Competitions', 'Challenges', 'Progress'];

type View = 'feed' | 'following' | 'liked' | 'saved' | 'mine';

const EMPTY = {
  skill: 'Back handspring',
  category: 'Floor',
  clubTag: '',
  caption: '',
  hashtags: '',
  audience: 'all' as 'all' | 'club',
  audienceClubId: '',
  showAge: false,
  showLevel: false,
  previewUrl: '',
};

const PUBLISH_ERRORS: Record<string, string> = {
  PAYMENT_REQUIRED: 'Your free week has ended. Payment is needed before you can publish.',
  VIDEO_REQUIRED: 'Choose a video first.',
  VIDEO_INVALID: 'That video could not be used. Choose it again.',
  SKILL_REQUIRED: 'Say which skill the video shows.',
  CATEGORY: 'Choose a category.',
  CLUB_REQUIRED: 'Choose the club that can see this video.',
  UNAUTHORIZED: 'You are signed out. Sign in again to publish.',
};

const ICON_BUTTON = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-full border text-sm transition-colors min-h-10';
const OFF = 'border-[#E4D7EE] text-[#3E1B4A] hover:bg-[#F4EEF8]';
const ON = 'border-[#5C2A6E] bg-[#5C2A6E] text-white';

export const InspoScreen: React.FC = () => {
  const { skills, user } = useGym();
  const [category, setCategory] = useState('All');
  const [view, setView] = useState<View>('feed');
  const [posts, setPosts] = useState<InspoPost[]>([]);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [notes, setNotes] = useState<{ id: string; kind: string; postId: string | null }[]>([]);
  const [showNotes, setShowNotes] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [draft, setDraft] = useState(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [clubs, setClubs] = useState<{ id: string; name: string; city: string }[]>([]);
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [sharing, setSharing] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [sharedId, setSharedId] = useState(() => new URLSearchParams(window.location.search).get('video'));
  const [shared, setShared] = useState<InspoPost | null>(null);

  const load = async (next = category, nextView = view) => {
    if (nextView === 'saved') return setPosts((await gymApi.saved()).posts);
    if (nextView === 'liked') return setPosts((await gymApi.liked()).posts);
    if (nextView === 'mine') return setPosts((await gymApi.myVideos()).posts);
    setPosts((await gymApi.inspo(next, nextView === 'following')).posts);
  };

  useEffect(() => {
    load().catch(() => setPosts([]));
    gymApi.notifications().then((result) => setNotes(result.notifications)).catch(() => setNotes([]));
  }, [category, view]);

  useEffect(() => {
    gymApi.registeredClubs().then((result) => setClubs(result.clubs)).catch(() => setClubs([]));
  }, []);

  useEffect(() => {
    if (!sharedId) {
      setShared(null);
      return;
    }
    gymApi.post(sharedId).then((result) => setShared(result.post)).catch(() => {
      setShared(null);
      setNotice({ ok: false, text: 'That shared video is not available to you. It may have been deleted, or shared with one club only.' });
    });
  }, [sharedId]);

  const closeShared = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('video');
    window.history.replaceState(null, '', url.toString());
    setSharedId(null);
  };

  const say = (text: string, ok = true) => setNotice({ ok, text });

  const closeForm = () => {
    if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
    setOpen(false);
    setPreviewing(false);
    setDraft(EMPTY);
    setFile(null);
    setFormError(null);
    setProgress(null);
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

  const audienceClubName = clubs.find((item) => item.id === draft.audienceClubId)?.name ?? '';

  const upload = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!file) return setFormError('Choose a video first.');
    if (!draft.skill.trim()) return setFormError('Say which skill the video shows.');
    if (draft.audience === 'club' && !draft.audienceClubId) return setFormError('Choose the club that can see this video.');
    if (!previewing) {
      setPreviewing(true);
      return;
    }
    setPublishing(true);
    setProgress(0);
    try {
      // 1. Send the video to GymTrack. 2. Publish the post that points at it.
      const stored = await uploadFile(file, { scope: draft.audience === 'all' ? 'public' : 'private', onProgress: setProgress });
      await gymApi.createInspo({
        skill: draft.skill,
        category: draft.category,
        clubTag: draft.clubTag,
        caption: draft.caption,
        visibility: draft.audience === 'all' ? 'everyone' : 'club',
        audienceClubId: draft.audience === 'club' ? draft.audienceClubId : null,
        showAge: draft.showAge,
        showLevel: draft.showLevel,
        hashtags: draft.hashtags.split(/\s+/).filter(Boolean),
        videoUrl: stored.url,
      });
      const where = draft.audience === 'all' ? 'all clubs' : audienceClubName;
      closeForm();
      setCategory('All');
      setView('mine');
      await load('All', 'mine');
      say(`Your video is published and visible to ${where}.`);
    } catch (err) {
      if (err instanceof UploadError) {
        setFormError(err.message);
      } else {
        const code = (err as { body?: { code?: string } }).body?.code ?? '';
        setFormError(PUBLISH_ERRORS[code] ?? 'The video could not be published. Check your connection and try again.');
      }
    } finally {
      setPublishing(false);
      setProgress(null);
    }
  };

  /** The video's own address. Opening it signs in if needed, then shows this video on Connect. */
  const shareLink = (post: InspoPost) => `${window.location.origin}/?video=${encodeURIComponent(post.id)}`;
  const shareText = (post: InspoPost) => `${post.authorName}: ${post.skill} on GymTrack Connect`;

  const shareNative = async (post: InspoPost) => {
    if (!navigator.share) return;
    await navigator.share({ title: post.skill, text: shareText(post), url: shareLink(post) }).catch(() => undefined);
  };

  const copyLink = async (post: InspoPost) => {
    try {
      await navigator.clipboard.writeText(shareLink(post));
      say('Link copied. Paste it into any app or message.');
    } catch {
      say('Could not copy automatically. Select the link and copy it.', false);
    }
  };

  const remove = async (post: InspoPost) => {
    try {
      await gymApi.deleteInspo(post.id);
      setConfirmDelete(null);
      await load();
      say('Video deleted. It is removed from Connect and your profile.');
    } catch {
      say('The video could not be deleted. Try again.', false);
    }
  };

  const tab = (id: View, label: string) => (
    <button type="button" onClick={() => setView(id)} className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${view === id ? 'bg-[#5C2A6E] text-white' : 'bg-white border border-[#E4D7EE]'}`}>{label}</button>
  );

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-[#3E1B4A]">Connect</h1>
          <p className="text-sm text-[#5C4A68]">Gymnastics videos from gymnasts.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setShowNotes((value) => !value)} className="px-3 py-2 rounded-full border border-[#E4D7EE] text-sm">
            Notifications{notes.length ? ` (${notes.length})` : ''}
          </button>
          <button
            type="button"
            onClick={() => { setOpen(true); setPreviewing(false); setFormError(null); setDraft((prev) => ({ ...prev, clubTag: prev.clubTag || user.clubName })); }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#5C2A6E] text-white text-sm hover:bg-[#3E1B4A] shadow-sm"
          >
            <Upload className="w-4 h-4" />
            Upload Video
          </button>
        </div>
      </div>

      {showNotes && (
        <div className="bg-white border border-[#E4D7EE] rounded-2xl p-4 space-y-2">
          {notes.length === 0 && <p className="text-sm text-[#5C4A68]">No notifications yet.</p>}
          {notes.map((item) => (
            <button key={item.id} type="button" onClick={() => { setView('feed'); setCategory('All'); setShowNotes(false); }} className="block text-left text-sm w-full">
              {item.kind === 'like' && 'Someone liked your video.'}
              {item.kind === 'comment' && 'Someone commented on your video.'}
              {item.kind === 'reply' && 'Someone replied to your comment.'}
              {item.kind === 'follow' && 'Someone followed you.'}
              {item.kind === 'upload' && 'Someone you follow uploaded a video.'}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Which videos">
        {tab('feed', 'All videos')}
        {tab('following', 'Following')}
        {tab('liked', 'Liked')}
        {tab('saved', 'Saved')}
        {tab('mine', 'My videos')}
      </div>
      {(view === 'feed' || view === 'following') && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {CATEGORIES.map((item) => (
            <button key={item} type="button" onClick={() => setCategory(item)} className={`px-3 py-1 rounded-full text-sm whitespace-nowrap ${category === item ? 'bg-[#3E1B4A] text-white' : 'bg-white border border-[#E4D7EE]'}`}>
              {item}
            </button>
          ))}
        </div>
      )}
      {notice && <p className={`text-sm ${notice.ok ? 'text-[#3E1B4A]' : 'text-red-600'}`} role={notice.ok ? 'status' : 'alert'}>{notice.text}</p>}
      {posts.length === 0 && (
        <p className="text-sm text-[#5C4A68]">
          {view === 'liked' ? 'Videos you like show here.' : view === 'saved' ? 'Videos you save show here.' : view === 'mine' ? 'You have not published a video yet.' : 'No videos in this view yet.'}
        </p>
      )}

      {shared && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-[#3E1B4A]">Shared with you</p>
          <button type="button" onClick={closeShared} className="text-sm text-[#5C2A6E] underline">Close</button>
        </div>
      )}
      {(shared ? [shared, ...posts.filter((item) => item.id !== shared.id)] : posts).map((post) => (
        <article key={post.id} className="bg-white rounded-2xl border border-[#E4D7EE] overflow-hidden">
          {post.videoUrl?.startsWith('data:video') || post.videoUrl?.startsWith('blob:') || post.videoUrl?.startsWith('/api/uploads/') || /\.(mp4|webm)(\?|$)/i.test(post.videoUrl || '') ? (
            <video src={mediaUrl(post.videoUrl)} controls preload="metadata" className="w-full aspect-video bg-black" />
          ) : (
            <div className="aspect-video bg-[#241628] text-white flex items-center justify-center text-sm px-4 text-center">{post.skill}</div>
          )}
          <div className="p-4 space-y-3">
            <div>
              <p className="text-[#241628]">{post.authorName}</p>
              <p className="text-sm text-[#5C4A68]">
                {post.clubName || 'Club not shown'}
                {post.level ? ` · Level ${post.level}` : ''}
                {post.age ? ` · Age ${post.age}` : ''}
                {' · '}{post.visibility === 'club' ? `Only ${post.audienceClubName ?? 'one club'}` : post.visibility === 'followers' ? 'Followers' : 'All clubs'}
              </p>
            </div>
            {post.caption && <p className="text-sm">{post.caption}</p>}
            <p className="text-sm text-[#5C2A6E]">{post.skill}{post.hashtags.length ? ` · ${post.hashtags.join(' ')}` : ''}</p>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={post.liked}
                aria-label={post.liked ? 'Unlike' : 'Like'}
                onClick={() => gymApi.like(post.id).then(() => load()).catch(() => say('Sign in to like videos.', false))}
                className={`${ICON_BUTTON} ${post.liked ? ON : OFF}`}
              >
                <ThumbsUp className={`w-4 h-4 ${post.liked ? 'fill-current' : ''}`} />
                {post.likes}
              </button>
              <button
                type="button"
                aria-expanded={Boolean(openComments[post.id])}
                onClick={() => setOpenComments((prev) => ({ ...prev, [post.id]: !prev[post.id] }))}
                className={`${ICON_BUTTON} ${openComments[post.id] ? ON : OFF}`}
              >
                <MessageCircle className="w-4 h-4" />
                {post.comments.length}
                <span className="sr-only">comments</span>
              </button>
              <button type="button" aria-expanded={sharing === post.id} onClick={() => setSharing(sharing === post.id ? null : post.id)} className={`${ICON_BUTTON} ${sharing === post.id ? ON : OFF}`}>
                <Share2 className="w-4 h-4" />
                Share
              </button>
              <button
                type="button"
                aria-pressed={post.saved}
                onClick={() => gymApi.save(post.id).then((result) => { const saved = (result as { post?: InspoPost }).post?.saved; say(saved ? 'Saved. Find it under My Videos on your profile, or the Saved tab here.' : 'Removed from your saved videos.'); return load(); }).catch(() => say('Sign in to save videos.', false))}
                className={`${ICON_BUTTON} ${post.saved ? ON : OFF}`}
              >
                <Bookmark className={`w-4 h-4 ${post.saved ? 'fill-current' : ''}`} />
                {post.saved ? 'Saved' : 'Save'}
              </button>
              {!post.mine && (
                <>
                  <button type="button" onClick={() => gymApi.follow(post.authorId).then(() => { say(`You follow ${post.authorName}.`); return load(); }).catch(() => say('Sign in to follow.', false))} className={`${ICON_BUTTON} ${OFF}`}>
                    <UserPlus className="w-4 h-4" />
                    Follow
                  </button>
                  {post.clubId && (
                    <button type="button" onClick={() => gymApi.followClub(post.clubId as string).then(() => say(`You follow ${post.clubName ?? 'the club'}.`)).catch(() => say('Sign in to follow a club.', false))} className={`${ICON_BUTTON} ${OFF}`}>
                      Follow club
                    </button>
                  )}
                  <button type="button" onClick={() => gymApi.block(post.authorId).then(() => { say(`${post.authorName} is blocked.`); return load(); }).catch(() => say('Sign in to block.', false))} className={`${ICON_BUTTON} ${OFF}`}>
                    <Ban className="w-4 h-4" />
                    Block
                  </button>
                </>
              )}
              {post.mine && (
                confirmDelete === post.id ? (
                  <span className="inline-flex gap-2">
                    <button type="button" onClick={() => remove(post)} className={`${ICON_BUTTON} border-red-700 bg-red-700 text-white`}>Delete for good</button>
                    <button type="button" onClick={() => setConfirmDelete(null)} className={`${ICON_BUTTON} ${OFF}`}>Keep</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirmDelete(post.id)} className={`${ICON_BUTTON} ${OFF}`}>
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                )
              )}
            </div>

            {sharing === post.id && (
              <div className="space-y-2 border-t border-[#F4EEF8] pt-3 text-sm">
                <label className="block text-[#5C4A68]" htmlFor={`share-${post.id}`}>Link to this video</label>
                <div className="flex gap-2">
                  <input id={`share-${post.id}`} readOnly value={shareLink(post)} onFocus={(event) => event.currentTarget.select()} className="flex-1 min-w-0 rounded-full border border-[#E4D7EE] px-3 py-2 text-sm bg-[#F7F4FB]" />
                  <button type="button" onClick={() => copyLink(post)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#5C2A6E] text-white"><Copy className="w-4 h-4" />Copy</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {typeof navigator !== 'undefined' && 'share' in navigator && (
                    <button type="button" onClick={() => shareNative(post)} className={`${ICON_BUTTON} ${OFF}`}><Share2 className="w-4 h-4" />Share to an app</button>
                  )}
                  <a href={`https://wa.me/?text=${encodeURIComponent(`${shareText(post)} ${shareLink(post)}`)}`} target="_blank" rel="noreferrer" className={`${ICON_BUTTON} ${OFF}`}><MessageCircle className="w-4 h-4" />WhatsApp</a>
                  <button type="button" onClick={() => setSharing(null)} className={`${ICON_BUTTON} ${OFF}`}><X className="w-4 h-4" />Close</button>
                </div>
                {post.visibility === 'club' && <p className="text-xs text-[#5C4A68]">Only {post.audienceClubName ?? 'the chosen club'} can open this link.</p>}
              </div>
            )}

            {openComments[post.id] && (
              <div className="space-y-2 border-t border-[#F4EEF8] pt-3">
                {post.comments.length === 0 && <p className="text-sm text-[#5C4A68]">No comments yet.</p>}
                {post.comments.map((comment) => (
                  <div key={comment.id} className="text-sm flex justify-between gap-2">
                    <p><strong>{comment.authorName}: </strong>{comment.text}</p>
                    <span className="shrink-0 space-x-2">
                      <button type="button" className="text-[#5C2A6E]" onClick={() => setReplyTo(comment.id)}>Reply</button>
                      <button type="button" className="text-[#5C4A68]" onClick={() => gymApi.reportComment(comment.id).then(() => load()).catch(() => say('Sign in to report.', false))}>Report</button>
                    </span>
                  </div>
                ))}
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const text = String(new FormData(form).get('text') || '');
                    if (!text.trim()) return;
                    gymApi.comment(post.id, text, replyTo).then(() => { setReplyTo(null); form.reset(); return load(); }).catch((err) => {
                      const code = (err as { body?: { code?: string } }).body?.code;
                      say(code === 'HELD' ? 'That comment is held for review.' : 'Sign in to comment.', false);
                    });
                  }}
                  className="flex gap-2"
                >
                  <input name="text" placeholder={replyTo ? 'Write a reply' : 'Encourage them'} aria-label="Comment" className="flex-1 rounded-full border border-[#E4D7EE] px-3 py-2 text-sm" />
                  <button className="px-4 py-2 rounded-full bg-[#5C2A6E] text-white text-sm">Post</button>
                </form>
              </div>
            )}
          </div>
        </article>
      ))}

      {open && (
        <form onSubmit={upload} className="fixed inset-0 bg-[#241628]/40 flex items-end sm:items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-4 w-full max-w-md space-y-2 max-h-[90vh] overflow-y-auto">
            <h2 className="font-display text-2xl text-[#3E1B4A]">{previewing ? 'Check and publish' : 'Upload Video'}</h2>
            {draft.previewUrl && <video src={draft.previewUrl} controls className="w-full rounded-xl bg-black" />}
            {!previewing && (
              <>
                <label className="flex items-center justify-center gap-2 w-full py-3 rounded-full bg-[#5C2A6E] text-white text-sm cursor-pointer hover:bg-[#3E1B4A] focus-within:ring-2 focus-within:ring-[#5C2A6E] focus-within:ring-offset-2">
                  <Upload className="w-4 h-4" />
                  Upload your video (up to {MAX_VIDEO_MB}MB)
                  <input type="file" accept="video/*" onChange={(e) => onFile(e.target.files?.[0])} className="sr-only" />
                </label>
                {file && <p className="text-xs text-[#5C4A68]">{file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB</p>}
                <input list="connect-skills" value={draft.skill} onChange={(e) => setDraft({ ...draft, skill: e.target.value })} placeholder="Skill" aria-label="Skill" className="w-full rounded-xl border border-[#E4D7EE] px-3 py-2 text-sm" />
                <datalist id="connect-skills">
                  {Array.from(new Set(skills.filter((item) => item.level === user.level).map((item) => item.name))).map((name) => <option key={name} value={name} />)}
                </datalist>
                <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} aria-label="Category" className="w-full rounded-xl border border-[#E4D7EE] px-3 py-2 text-sm">
                  {CATEGORIES.filter((item) => item !== 'All').map((item) => <option key={item}>{item}</option>)}
                </select>
                <input value={draft.hashtags} onChange={(e) => setDraft({ ...draft, hashtags: e.target.value })} placeholder="#hashtags" aria-label="Hashtags" className="w-full rounded-xl border border-[#E4D7EE] px-3 py-2 text-sm" />
                <textarea value={draft.caption} onChange={(e) => setDraft({ ...draft, caption: e.target.value })} placeholder="Caption" aria-label="Caption" className="w-full rounded-xl border border-[#E4D7EE] px-3 py-2 text-sm" />
                <fieldset className="space-y-2 text-sm">
                  <legend className="text-[#5C4A68] mb-1">Who can see it</legend>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="audience" checked={draft.audience === 'all'} onChange={() => setDraft({ ...draft, audience: 'all' })} />
                    All Clubs: everyone on GymTrack
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="audience" checked={draft.audience === 'club'} onChange={() => setDraft({ ...draft, audience: 'club', audienceClubId: draft.audienceClubId || user.selectedClubId || user.clubId || '' })} />
                    Specific Club: only one club
                  </label>
                  {draft.audience === 'club' && (
                    <select value={draft.audienceClubId} onChange={(e) => setDraft({ ...draft, audienceClubId: e.target.value })} aria-label="Club that can see the video" className="w-full rounded-xl border border-[#E4D7EE] px-3 py-2 text-sm">
                      <option value="">Choose a club</option>
                      {clubs.map((club) => <option key={club.id} value={club.id}>{club.name} ({club.city})</option>)}
                    </select>
                  )}
                </fieldset>
                <label className="text-sm flex gap-2"><input type="checkbox" checked={draft.showLevel} onChange={(e) => setDraft({ ...draft, showLevel: e.target.checked })} /> Show level</label>
                <label className="text-sm flex gap-2"><input type="checkbox" checked={draft.showAge} onChange={(e) => setDraft({ ...draft, showAge: e.target.checked })} /> Show age</label>
              </>
            )}
            {previewing && (
              <div className="text-sm space-y-1">
                <p>{draft.skill} · {draft.category}</p>
                {draft.caption && <p>{draft.caption}</p>}
                <p>Who can see it: {draft.audience === 'all' ? 'All clubs' : audienceClubName}</p>
              </div>
            )}
            {progress !== null && (
              <div className="space-y-1" role="status">
                <div className="h-2 rounded-full bg-[#F4EEF8] overflow-hidden">
                  <div className="h-full bg-[#5C2A6E] transition-all" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-xs text-[#5C4A68]">{progress < 100 ? `Uploading… ${progress}%` : 'Upload complete. Publishing…'}</p>
              </div>
            )}
            {formError && <p className="text-sm text-red-600" role="alert">{formError}</p>}
            <div className="flex gap-2">
              <button type="button" disabled={publishing} onClick={() => { if (previewing) { setPreviewing(false); setFormError(null); } else closeForm(); }} className="flex-1 py-2 rounded-full border border-[#E4D7EE] text-sm">{previewing ? 'Back' : 'Close'}</button>
              <button disabled={publishing} className="flex-1 inline-flex items-center justify-center gap-2 py-2 rounded-full bg-[#5C2A6E] text-white text-sm disabled:opacity-60">
                <Upload className="w-4 h-4" />
                {publishing ? 'Publishing…' : previewing ? 'Publish' : 'Preview'}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
};
