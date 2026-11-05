import { randomBytes } from 'crypto';
import { INITIAL_SKILLS } from '../src/data/gymData.ts';
import { applySkillEdits, youtubeVideoId, type SkillPatch } from '../src/lib/skillEdits.ts';
import type { DatabaseShape, Role, UserRecord } from './store.ts';
import { clubIsApproved, normalisePhone, type UploadRecord } from './workflow.ts';

/** What an administrator can be allowed to do. Owners (GYMTRACK_OPERATOR_EMAILS) can do all of it. */
export const ADMIN_PERMISSIONS = ['users', 'clubs', 'moderation', 'skills', 'events', 'communication', 'reports', 'payments', 'settings'] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export interface AdminRecord {
  userId: string;
  permissions: AdminPermission[];
  addedBy: string;
  addedAt: string;
}

export interface AdminLogEntry {
  id: string;
  at: string;
  by: string;
  action: string;
  target: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: 'everyone' | 'gymnasts' | 'clubs' | 'club';
  clubId: string | null;
  createdAt: string;
  createdBy: string;
}

export interface PostReport {
  id: string;
  postId: string;
  reporterId: string;
  reason: string;
  createdAt: string;
}

export interface PlatformEvent {
  id: string;
  name: string;
  date: string;
  endDate: string;
  time: string;
  venue: string;
  city: string;
  description: string;
  organiser: string;
  entryInfo: string;
  website: string;
  imageUrl: string;
  status: 'draft' | 'published';
  createdAt: string;
  updatedAt: string;
}

export interface PlatformSettings {
  clubSignupsOpen: boolean;
  gymnastSignupsOpen: boolean;
  connectUploadsOpen: boolean;
  monthlyFeeNgn: number;
  trialDays: number;
  defaultVideoAudience: 'all' | 'club';
  eventsSeeded?: boolean;
}

export const DEFAULT_SETTINGS: PlatformSettings = {
  clubSignupsOpen: true,
  gymnastSignupsOpen: true,
  connectUploadsOpen: true,
  monthlyFeeNgn: 1000,
  trialDays: 7,
  defaultVideoAudience: 'all',
};

/** The one event that used to be written into the Events page. */
export const GYMFEST_EVENT: Omit<PlatformEvent, 'createdAt' | 'updatedAt'> = {
  id: 'evt_gymfest_3',
  name: 'GymFest 3.0',
  date: '2026-11-07',
  endDate: '',
  time: '',
  venue: 'The Dome, Freedom Way, Lekki Phase 1',
  city: 'Lagos',
  description: '',
  organiser: 'Convened by Tee Tumblers Gymnastics Club and the Society for the Performing Arts in Nigeria.',
  entryInfo: 'Published gymnast entry is ₦20,000. Spectator entry is ₦5,000.',
  website: 'https://www.gymfestchampionship.com/',
  imageUrl: '/events/gymfest-flyer.jpg',
  status: 'published',
};

const LOG_LIMIT = 2000;
const DAY_MS = 24 * 60 * 60 * 1000;

function text(raw: unknown, max: number) {
  return typeof raw === 'string' ? raw.trim().slice(0, max) : '';
}

function newId(prefix: string) {
  return `${prefix}_${randomBytes(6).toString('hex')}`;
}

function safeLink(raw: unknown) {
  const link = text(raw, 500);
  if (!link) return '';
  // Links open in people's browsers, so only ordinary web addresses and our own files.
  if (!/^(https?:\/\/|\/api\/uploads\/|\/events\/)/i.test(link)) throw new Error('LINK_INVALID');
  return link;
}

export function createAdmin(
  db: DatabaseShape,
  save: () => Promise<void>,
  now: () => Date,
  deps: {
    isOwner: (user: UserRecord) => boolean;
    isAdmin: (user: UserRecord) => boolean;
    hashPassword: (password: string) => string;
    requireEmail: (raw: unknown) => string;
    requirePassword: (raw: unknown) => string;
    requireText: (raw: unknown, code: string) => string;
    requireLevel: (raw: unknown) => number;
    notify: (userId: string, kind: 'moderation', fromUserId: string, postId: string | null) => void;
    removeAccounts: (ids: string[], roles: Role[]) => Promise<{ files: UploadRecord[] }>;
    removeClubs: (ids: string[]) => Promise<{ files: UploadRecord[]; staff: number; gymnastsKept: number }>;
    clubStatus: (clubId: string) => { paidUntil: string | null };
  },
) {
  const stamp = () => now().toISOString();

  function log(actor: UserRecord, action: string, target: string) {
    db.adminLog.unshift({ id: newId('log'), at: stamp(), by: actor.email, action, target: target.slice(0, 200) });
    if (db.adminLog.length > LOG_LIMIT) db.adminLog.length = LOG_LIMIT;
  }

  function findUser(id: string) {
    const user = db.users.find((item) => item.id === id);
    if (!user) throw new Error('NOT_FOUND');
    return user;
  }

  /** Only an owner can touch another administrator, so nobody can use this page to take over an admin. */
  function guardTarget(actor: UserRecord, target: UserRecord) {
    if (deps.isOwner(target) && actor.id !== target.id) throw new Error('FORBIDDEN');
    if (deps.isAdmin(target) && !deps.isOwner(actor) && actor.id !== target.id) throw new Error('FORBIDDEN');
  }

  const clubName = (id: string | null | undefined) => db.clubs.find((club) => club.id === id)?.name ?? null;
  const within = (iso: string | null | undefined, days: number) => Boolean(iso) && now().getTime() - new Date(iso as string).getTime() <= days * DAY_MS;

  function userRow(user: UserRecord) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      level: user.level,
      dateOfBirth: user.dateOfBirth,
      clubId: user.clubId ?? user.selectedClubId ?? null,
      clubName: clubName(user.clubId ?? user.selectedClubId),
      state: user.suspended ? 'suspended' : user.disabled ? 'deactivated' : 'active',
      suspendedReason: user.suspendedReason ?? null,
      createdAt: user.createdAt ?? null,
      lastLoginAt: user.lastLoginAt ?? null,
      isAdmin: deps.isAdmin(user),
      isOwner: deps.isOwner(user),
    };
  }

  function skillRow(skill: ReturnType<typeof applySkillEdits>[number]) {
    return {
      id: skill.id,
      name: skill.name,
      level: skill.level as number,
      category: skill.category as string,
      description: skill.description,
      optional: Boolean(skill.optional),
      videoId: skill.tutorial?.videoId ?? null,
      custom: db.skillEdits.added.some((item) => item.id === skill.id),
    };
  }

  const currentSkills = () => applySkillEdits(INITIAL_SKILLS, db.skillEdits);

  return {
    logAdmin: log,

    // ---- Dashboard ----
    adminDashboard() {
      const users = db.users.filter((user) => !user.disabled);
      const recent = [...db.users]
        .filter((user) => user.createdAt)
        .sort((a, b) => (b.createdAt as string).localeCompare(a.createdAt as string))
        .slice(0, 8)
        .map((user) => ({ name: user.name, role: user.role, createdAt: user.createdAt, clubName: clubName(user.clubId ?? user.selectedClubId) }));
      return {
        users: {
          total: users.length,
          gymnasts: users.filter((user) => user.role === 'GYMNAST').length,
          clubAdmins: users.filter((user) => user.role === 'CLUB_ADMIN').length,
          coaches: users.filter((user) => user.role === 'COACH').length,
          suspended: db.users.filter((user) => user.suspended).length,
          newLast7Days: users.filter((user) => within(user.createdAt, 7)).length,
          newLast30Days: users.filter((user) => within(user.createdAt, 30)).length,
          signedInLast7Days: users.filter((user) => within(user.lastLoginAt, 7)).length,
        },
        clubs: {
          total: db.clubs.length,
          approved: db.clubs.filter((club) => clubIsApproved(club)).length,
          waiting: db.clubs.filter((club) => club.approvalStatus === 'pending').length,
          declined: db.clubs.filter((club) => club.approvalStatus === 'rejected').length,
        },
        activity: {
          videos: db.posts.length,
          comments: db.comments.length,
          likes: db.likes.length,
          skillVideosWaiting: db.submissions.filter((item) => item.status === 'PENDING').length,
          skillVideosApproved: db.submissions.filter((item) => item.status === 'APPROVED').length,
          openReports: new Set(db.postReports.map((item) => item.postId)).size + db.comments.filter((item) => item.hidden).length,
        },
        recentRegistrations: recent,
        recentAdminActions: db.adminLog.slice(0, 8),
      };
    },

    // ---- User management ----
    adminUsers(query: { q?: string; role?: string; state?: string }) {
      const q = text(query.q, 100).toLowerCase();
      return db.users
        .map(userRow)
        .filter((row) => !query.role || row.role === query.role)
        .filter((row) => !query.state || row.state === query.state)
        .filter((row) => !q || `${row.name} ${row.email} ${row.phone} ${row.clubName ?? ''}`.toLowerCase().includes(q))
        .sort((a, b) => a.name.localeCompare(b.name));
    },

    async adminUpdateUser(actor: UserRecord, id: string, input: { name?: unknown; email?: unknown; phone?: unknown; level?: unknown }) {
      const user = findUser(id);
      guardTarget(actor, user);
      const name = input.name !== undefined ? deps.requireText(input.name, 'NAME_REQUIRED') : user.name;
      const email = input.email !== undefined ? deps.requireEmail(input.email) : user.email;
      if (email !== user.email && db.users.some((item) => item.email === email)) throw new Error('EMAIL_TAKEN');
      // The owner list is by email, so changing an owner's email would change who is an owner.
      if (email !== user.email && deps.isOwner(user)) throw new Error('FORBIDDEN');
      const phone = input.phone !== undefined ? text(input.phone, 40) : user.phone;
      if (phone && normalisePhone(phone).length < 10) throw new Error('PHONE_INVALID');
      if (user.role === 'GYMNAST' && !phone) throw new Error('PHONE_INVALID');
      const level = input.level !== undefined && user.role === 'GYMNAST' ? deps.requireLevel(input.level) : user.level;
      const changed = [name !== user.name && 'name', email !== user.email && 'email', phone !== user.phone && 'telephone', level !== user.level && 'level'].filter(Boolean);
      if (level !== user.level) user.levelUpdatedAt = stamp();
      Object.assign(user, { name, email, phone, level });
      if (changed.length) log(actor, `Edited ${changed.join(', ')}`, user.email);
      await save();
      return userRow(user);
    },

    async adminSuspendUser(actor: UserRecord, id: string, reason: unknown) {
      const user = findUser(id);
      if (user.id === actor.id) throw new Error('SELF');
      guardTarget(actor, user);
      const why = text(reason, 500);
      if (!why) throw new Error('REASON_REQUIRED');
      user.disabled = true;
      user.suspended = true;
      user.suspendedReason = why;
      db.tokens = db.tokens.filter((item) => item.userId !== user.id);
      db.passwordResets = db.passwordResets.filter((item) => item.userId !== user.id);
      log(actor, `Suspended: ${why}`, user.email);
      await save();
      return userRow(user);
    },

    async adminRestoreUser(actor: UserRecord, id: string) {
      const user = findUser(id);
      guardTarget(actor, user);
      if (!user.disabled) throw new Error('NOT_SUSPENDED');
      user.disabled = false;
      user.suspended = false;
      user.suspendedReason = null;
      log(actor, 'Restored account', user.email);
      await save();
      return userRow(user);
    },

    /** A club administrator goes with the club, on the Clubs page. Returns the stored files to delete. */
    async adminDeleteUser(actor: UserRecord, id: string) {
      const user = findUser(id);
      if (user.id === actor.id) throw new Error('SELF');
      guardTarget(actor, user);
      if (user.role === 'CLUB_ADMIN') throw new Error('IS_CLUB_ADMIN');
      const email = user.email;
      const { files } = await deps.removeAccounts([user.id], [user.role]);
      log(actor, 'Deleted account', email);
      await save();
      return files;
    },

    async adminDeleteClub(actor: UserRecord, id: string, confirmName: unknown) {
      const club = db.clubs.find((item) => item.id === id);
      if (!club) throw new Error('NOT_FOUND');
      if (text(confirmName, 200) !== club.name) throw new Error('CONFIRM_NAME');
      const name = club.name;
      const removed = await deps.removeClubs([id]);
      log(actor, `Deleted club, ${removed.staff} staff accounts removed, ${removed.gymnastsKept} gymnasts kept`, name);
      await save();
      return removed;
    },

    /** Who is in each club, for the Clubs page. */
    adminClubMembers(clubId: string) {
      if (!db.clubs.some((club) => club.id === clubId)) throw new Error('NOT_FOUND');
      const rows = db.users.filter((user) => user.clubId === clubId || (!user.clubId && user.selectedClubId === clubId));
      return rows.map((user) => ({ id: user.id, name: user.name, role: user.role, level: user.level, member: user.clubId === clubId, state: user.suspended ? 'suspended' : user.disabled ? 'deactivated' : 'active' }));
    },

    // ---- Content moderation ----
    adminModeration() {
      const author = (id: string) => db.users.find((user) => user.id === id);
      const postRow = (post: DatabaseShape['posts'][number]) => ({
        id: post.id,
        skill: post.skill,
        caption: post.caption,
        videoUrl: post.videoUrl,
        visibility: post.visibility,
        createdAt: post.createdAt,
        authorId: post.authorId,
        authorName: author(post.authorId)?.name ?? 'Gone',
      });
      const reported = db.posts.filter((post) => db.postReports.some((item) => item.postId === post.id)).map((post) => {
        const reports = db.postReports.filter((item) => item.postId === post.id);
        return { ...postRow(post), reports: reports.map((item) => ({ reason: item.reason, createdAt: item.createdAt, reporterName: author(item.reporterId)?.name ?? 'Gone' })) };
      });
      const comments = db.comments.filter((item) => item.hidden).map((item) => {
        const reports = db.commentReports.filter((report) => report.commentId === item.id);
        return {
          id: item.id,
          text: item.text,
          postId: item.postId,
          authorId: item.authorId,
          authorName: author(item.authorId)?.name ?? 'Gone',
          createdAt: item.createdAt,
          why: reports.length > 0 ? `Reported by ${reports.map((report) => author(report.reporterId)?.name ?? 'someone').join(', ')}` : 'Held automatically for its wording',
        };
      });
      const recentPosts = db.posts.filter((post) => post.videoUrl).slice(0, 30).map(postRow);
      return { reported, comments, recentPosts };
    },

    async adminRemovePost(actor: UserRecord, postId: string, reason: unknown) {
      const post = db.posts.find((item) => item.id === postId);
      if (!post) throw new Error('NOT_FOUND');
      const why = text(reason, 500);
      if (!why) throw new Error('REASON_REQUIRED');
      db.posts = db.posts.filter((item) => item.id !== postId);
      db.likes = db.likes.filter((item) => item.postId !== postId);
      db.saves = db.saves.filter((item) => item.postId !== postId);
      db.postReports = db.postReports.filter((item) => item.postId !== postId);
      const commentIds = new Set(db.comments.filter((item) => item.postId === postId).map((item) => item.id));
      db.comments = db.comments.filter((item) => item.postId !== postId);
      db.commentReports = db.commentReports.filter((item) => !commentIds.has(item.commentId));
      db.notifications = db.notifications.filter((item) => item.postId !== postId);
      deps.notify(post.authorId, 'moderation', actor.id, null);
      const stillUsed = db.posts.some((item) => item.videoUrl === post.videoUrl) || db.submissions.some((item) => item.videoUrl === post.videoUrl);
      const upload = stillUsed ? null : db.uploads.find((item) => `/api/uploads/${item.id}` === post.videoUrl) ?? null;
      if (upload) db.uploads = db.uploads.filter((item) => item.id !== upload.id);
      log(actor, `Removed video "${post.skill}": ${why}`, db.users.find((user) => user.id === post.authorId)?.email ?? post.authorId);
      await save();
      return upload;
    },

    async adminDismissPostReports(actor: UserRecord, postId: string) {
      if (!db.postReports.some((item) => item.postId === postId)) throw new Error('NOT_FOUND');
      db.postReports = db.postReports.filter((item) => item.postId !== postId);
      log(actor, 'Kept a reported video', postId);
      await save();
      return { ok: true };
    },

    async adminRestoreComment(actor: UserRecord, commentId: string) {
      const comment = db.comments.find((item) => item.id === commentId);
      if (!comment) throw new Error('NOT_FOUND');
      comment.hidden = false;
      db.commentReports = db.commentReports.filter((item) => item.commentId !== commentId);
      log(actor, `Restored comment: ${comment.text.slice(0, 80)}`, commentId);
      await save();
      return { ok: true };
    },

    async adminRemoveComment(actor: UserRecord, commentId: string) {
      const comment = db.comments.find((item) => item.id === commentId);
      if (!comment) throw new Error('NOT_FOUND');
      db.comments = db.comments.filter((item) => item.id !== commentId);
      db.commentReports = db.commentReports.filter((item) => item.commentId !== commentId);
      log(actor, `Removed comment: ${comment.text.slice(0, 80)}`, commentId);
      await save();
      return { ok: true };
    },

    // ---- Skills ----
    adminSkills() {
      const removedRows = db.skillEdits.removed
        .map((id) => INITIAL_SKILLS.find((skill) => skill.id === id) ?? db.skillEdits.added.find((skill) => skill.id === id))
        .filter((skill): skill is NonNullable<typeof skill> => Boolean(skill))
        .map((skill) => ({ id: skill.id, name: skill.name, level: skill.level as number }));
      return { skills: currentSkills().map(skillRow), removed: removedRows };
    },

    async adminSaveSkill(actor: UserRecord, id: string | null, input: { name?: unknown; level?: unknown; category?: unknown; description?: unknown; optional?: unknown; video?: unknown }) {
      const patch: SkillPatch = {};
      if (input.name !== undefined || !id) patch.name = deps.requireText(input.name, 'NAME_REQUIRED');
      if (input.level !== undefined || !id) patch.level = deps.requireLevel(input.level);
      if (input.category !== undefined || !id) {
        const category = text(input.category, 30).toUpperCase();
        if (!category) throw new Error('CATEGORY');
        patch.category = category;
      }
      if (input.description !== undefined) patch.description = text(input.description, 2000);
      if (input.optional !== undefined) patch.optional = Boolean(input.optional);
      if (input.video !== undefined) {
        const link = text(input.video, 300);
        const videoId = link ? youtubeVideoId(link) : null;
        if (link && !videoId) throw new Error('VIDEO_LINK');
        patch.videoId = videoId;
      }
      let skillId = id;
      if (!id) {
        skillId = newId('skl');
        db.skillEdits.added.push({ ...patch, id: skillId, name: patch.name as string, level: patch.level as number, category: patch.category as string });
      } else {
        const added = db.skillEdits.added.find((item) => item.id === id);
        if (added) Object.assign(added, patch);
        else if (!INITIAL_SKILLS.some((skill) => skill.id === id)) throw new Error('NOT_FOUND');
        else db.skillEdits.changed[id] = { ...db.skillEdits.changed[id], ...patch };
      }
      log(actor, id ? 'Edited skill' : 'Added skill', patch.name ?? (skillId as string));
      await save();
      const saved = currentSkills().find((skill) => skill.id === skillId);
      return saved ? skillRow(saved) : null;
    },

    /** Takes a skill off the app. Past videos and levels are not changed, and it can be put back. */
    async adminRemoveSkill(actor: UserRecord, id: string) {
      const skill = currentSkills().find((item) => item.id === id);
      if (!skill) throw new Error('NOT_FOUND');
      db.skillEdits.removed.push(id);
      log(actor, 'Removed skill', skill.name);
      await save();
      return { ok: true };
    },

    async adminRestoreSkill(actor: UserRecord, id: string) {
      if (!db.skillEdits.removed.includes(id)) throw new Error('NOT_FOUND');
      db.skillEdits.removed = db.skillEdits.removed.filter((item) => item !== id);
      log(actor, 'Put skill back', id);
      await save();
      return { ok: true };
    },

    async adminOrderSkills(actor: UserRecord, ids: unknown) {
      if (!Array.isArray(ids) || ids.length === 0) throw new Error('EMPTY');
      const known = new Set(currentSkills().map((skill) => skill.id));
      if (ids.some((id) => typeof id !== 'string' || !known.has(id))) throw new Error('NOT_FOUND');
      ids.forEach((id: string, index) => {
        const added = db.skillEdits.added.find((item) => item.id === id);
        if (added) added.position = index;
        else db.skillEdits.changed[id] = { ...db.skillEdits.changed[id], position: index };
      });
      log(actor, 'Changed the order of skills', `${ids.length} skills`);
      await save();
      return { ok: true };
    },

    // ---- Events ----
    /** Published events, soonest upcoming first, then past ones, most recent first. */
    publishedEvents() {
      const today = now().toISOString().slice(0, 10);
      const live = db.platformEvents.filter((item) => item.status === 'published');
      const ends = (item: PlatformEvent) => item.endDate || item.date;
      return [
        ...live.filter((item) => ends(item) >= today).sort((a, b) => a.date.localeCompare(b.date)),
        ...live.filter((item) => ends(item) < today).sort((a, b) => b.date.localeCompare(a.date)),
      ];
    },

    adminEvents() {
      return [...db.platformEvents].sort((a, b) => b.date.localeCompare(a.date));
    },

    async adminSaveEvent(actor: UserRecord, id: string | null, input: Record<string, unknown>) {
      const name = deps.requireText(input.name, 'NAME_REQUIRED');
      const date = text(input.date, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(date).getTime())) throw new Error('DATE');
      const endDate = text(input.endDate, 10);
      if (endDate && (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < date)) throw new Error('END_DATE');
      const status = input.status === 'published' ? 'published' : 'draft';
      const fields = {
        name,
        date,
        endDate,
        status,
        time: text(input.time, 40),
        venue: text(input.venue, 300),
        city: text(input.city, 100),
        description: text(input.description, 4000),
        organiser: text(input.organiser, 300),
        entryInfo: text(input.entryInfo, 500),
        website: safeLink(input.website),
        imageUrl: safeLink(input.imageUrl),
        updatedAt: stamp(),
      } as const;
      let event = id ? db.platformEvents.find((item) => item.id === id) : undefined;
      if (id && !event) throw new Error('NOT_FOUND');
      if (event) Object.assign(event, fields);
      else {
        event = { id: newId('evt'), createdAt: stamp(), ...fields };
        db.platformEvents.push(event);
      }
      log(actor, `${id ? 'Edited' : 'Created'} ${status === 'published' ? 'published' : 'draft'} event`, name);
      await save();
      return event;
    },

    async adminDeleteEvent(actor: UserRecord, id: string) {
      const event = db.platformEvents.find((item) => item.id === id);
      if (!event) throw new Error('NOT_FOUND');
      db.platformEvents = db.platformEvents.filter((item) => item.id !== id);
      log(actor, 'Deleted event', event.name);
      await save();
      return { ok: true };
    },

    // ---- Communication ----
    adminCommunication() {
      return {
        clubs: db.clubs.filter((club) => clubIsApproved(club)).map((club) => ({ id: club.id, name: club.name })),
        announcements: [...db.announcements].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((item) => ({ ...item, clubName: clubName(item.clubId) })),
        enquiries: [...db.contacts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100).map((item) => ({ id: item.id, name: item.name, phone: item.phone, message: item.message, createdAt: item.createdAt })),
      };
    },

    async adminPublishAnnouncement(actor: UserRecord, input: { title?: unknown; body?: unknown; audience?: unknown; clubId?: unknown }) {
      const title = text(input.title, 200);
      const body = text(input.body, 4000);
      if (!title || !body) throw new Error('MISSING');
      const audience = ['everyone', 'gymnasts', 'clubs', 'club'].includes(input.audience as string) ? (input.audience as Announcement['audience']) : null;
      if (!audience) throw new Error('AUDIENCE');
      const clubId = audience === 'club' ? text(input.clubId, 60) : null;
      if (audience === 'club' && !db.clubs.some((club) => club.id === clubId)) throw new Error('CLUB_REQUIRED');
      const record: Announcement = { id: newId('ann'), title, body, audience, clubId, createdAt: stamp(), createdBy: actor.name };
      db.announcements.push(record);
      log(actor, `Sent announcement to ${audience === 'club' ? clubName(clubId) : audience}`, title);
      await save();
      return record;
    },

    async adminDeleteAnnouncement(actor: UserRecord, id: string) {
      const record = db.announcements.find((item) => item.id === id);
      if (!record) throw new Error('NOT_FOUND');
      db.announcements = db.announcements.filter((item) => item.id !== id);
      log(actor, 'Deleted announcement', record.title);
      await save();
      return { ok: true };
    },

    // ---- Reports ----
    adminReports() {
      const today = now();
      const startOfWeek = (weeksAgo: number) => today.getTime() - (weeksAgo + 1) * 7 * DAY_MS;
      const inWeek = (iso: string | null | undefined, weeksAgo: number) => {
        if (!iso) return false;
        const time = new Date(iso).getTime();
        return time > startOfWeek(weeksAgo) && time <= startOfWeek(weeksAgo) + 7 * DAY_MS;
      };
      const weeks = Array.from({ length: 8 }, (_, index) => 7 - index).map((weeksAgo) => ({
        weekEnding: new Date(startOfWeek(weeksAgo) + 7 * DAY_MS).toISOString().slice(0, 10),
        gymnasts: db.users.filter((user) => user.role === 'GYMNAST' && inWeek(user.createdAt, weeksAgo)).length,
        clubs: db.clubs.filter((club) => inWeek(club.requestedAt ?? club.trialStartedAt, weeksAgo)).length,
        videos: db.posts.filter((post) => inWeek(post.createdAt, weeksAgo)).length,
        skillVideos: db.submissions.filter((item) => inWeek(item.createdAt, weeksAgo)).length,
        comments: db.comments.filter((item) => inWeek(item.createdAt, weeksAgo)).length,
      }));
      const clubs = db.clubs.map((club) => {
        const inClub = <T extends { clubId?: string | null }>(rows: T[]) => rows.filter((row) => row.clubId === club.id);
        const submissions = inClub(db.submissions);
        return {
          id: club.id,
          name: club.name,
          approval: club.approvalStatus ?? 'approved',
          gymnasts: db.users.filter((user) => user.role === 'GYMNAST' && (user.clubId === club.id || (!user.clubId && user.selectedClubId === club.id))).length,
          coaches: db.users.filter((user) => user.role === 'COACH' && user.clubId === club.id && !user.disabled).length,
          skillVideos30Days: submissions.filter((item) => within(item.createdAt, 30)).length,
          decisions30Days: submissions.filter((item) => within(item.reviewedAt, 30)).length,
          notices: inClub(db.notices).length,
          attendance30Days: inClub(db.attendance).filter((item) => within(item.date, 30)).length,
          paidUntil: deps.clubStatus(club.id).paidUntil,
        };
      });
      const noDate = db.users.filter((user) => !user.createdAt && !user.disabled).length;
      return {
        weeks,
        clubs,
        accountsFromBeforeTracking: noDate,
        activeLast30Days: db.users.filter((user) => within(user.lastLoginAt, 30) && !user.disabled).length,
      };
    },

    // ---- Settings and administrators ----
    publicSettings() {
      const { clubSignupsOpen, gymnastSignupsOpen, connectUploadsOpen, monthlyFeeNgn, trialDays, defaultVideoAudience } = db.settings;
      return { clubSignupsOpen, gymnastSignupsOpen, connectUploadsOpen, monthlyFeeNgn, trialDays, defaultVideoAudience };
    },

    async adminUpdateSettings(actor: UserRecord, input: Record<string, unknown>) {
      const next = { ...db.settings };
      for (const key of ['clubSignupsOpen', 'gymnastSignupsOpen', 'connectUploadsOpen'] as const) {
        if (typeof input[key] === 'boolean') next[key] = input[key] as boolean;
      }
      if (input.monthlyFeeNgn !== undefined) {
        const fee = Number(input.monthlyFeeNgn);
        if (!Number.isInteger(fee) || fee < 0 || fee > 10000000) throw new Error('FEE');
        next.monthlyFeeNgn = fee;
      }
      if (input.trialDays !== undefined) {
        const days = Number(input.trialDays);
        if (!Number.isInteger(days) || days < 0 || days > 365) throw new Error('TRIAL_DAYS');
        next.trialDays = days;
      }
      if (input.defaultVideoAudience === 'all' || input.defaultVideoAudience === 'club') next.defaultVideoAudience = input.defaultVideoAudience;
      const changes = (Object.keys(next) as (keyof PlatformSettings)[]).filter((key) => next[key] !== db.settings[key]);
      db.settings = next;
      if (changes.length) log(actor, 'Changed settings', changes.map((key) => `${key}: ${next[key]}`).join(', '));
      await save();
      return this.publicSettings();
    },

    adminList() {
      const row = (user: UserRecord, permissions: readonly AdminPermission[]) => ({ userId: user.id, name: user.name, email: user.email, role: user.role, owner: deps.isOwner(user), permissions });
      const owners = db.users.filter((user) => deps.isOwner(user)).map((user) => row(user, ADMIN_PERMISSIONS));
      const others = db.admins.map((item) => {
        const user = db.users.find((candidate) => candidate.id === item.userId);
        return user && !deps.isOwner(user) ? row(user, item.permissions) : null;
      }).filter((item): item is NonNullable<typeof item> => Boolean(item));
      return [...owners, ...others];
    },

    adminActivity() {
      return db.adminLog.slice(0, 200);
    },

    /** Owners only. An email with no account gets a new admin account, with the temporary password given. */
    async adminAddAdmin(actor: UserRecord, input: { email?: unknown; name?: unknown; password?: unknown; permissions?: unknown }) {
      if (!deps.isOwner(actor)) throw new Error('FORBIDDEN');
      const email = deps.requireEmail(input.email);
      const permissions = checkPermissions(input.permissions);
      let user = db.users.find((item) => item.email === email);
      if (user && (deps.isAdmin(user) || user.disabled)) throw new Error('ALREADY_ADMIN');
      if (!user) {
        user = {
          id: newId('usr'),
          email,
          passwordHash: deps.hashPassword(deps.requirePassword(input.password)),
          name: deps.requireText(input.name, 'NAME_REQUIRED'),
          username: email.split('@')[0],
          phone: '',
          role: 'ADMIN',
          dateOfBirth: null,
          level: null,
          clubId: null,
          status: 'active',
          parentAccepted: true,
          showAge: false,
          showLevel: false,
          periodEnd: null,
          createdAt: stamp(),
        };
        db.users.push(user);
      }
      db.admins.push({ userId: user.id, permissions, addedBy: actor.email, addedAt: stamp() });
      log(actor, `Added administrator: ${permissions.join(', ')}`, email);
      await save();
      return { userId: user.id, email: user.email };
    },

    async adminSetPermissions(actor: UserRecord, userId: string, permissions: unknown) {
      if (!deps.isOwner(actor)) throw new Error('FORBIDDEN');
      const record = db.admins.find((item) => item.userId === userId);
      if (!record) throw new Error('NOT_FOUND');
      record.permissions = checkPermissions(permissions);
      log(actor, `Changed administrator access: ${record.permissions.join(', ')}`, db.users.find((user) => user.id === userId)?.email ?? userId);
      await save();
      return { ok: true };
    },

    /** Takes admin access away. An admin-only account is deleted; a gymnast or coach keeps their account. */
    async adminRemoveAdmin(actor: UserRecord, userId: string) {
      if (!deps.isOwner(actor)) throw new Error('FORBIDDEN');
      if (!db.admins.some((item) => item.userId === userId)) throw new Error('NOT_FOUND');
      const user = db.users.find((item) => item.id === userId);
      db.admins = db.admins.filter((item) => item.userId !== userId);
      if (user?.role === 'ADMIN') await deps.removeAccounts([user.id], ['ADMIN']);
      log(actor, 'Removed administrator', user?.email ?? userId);
      await save();
      return { ok: true };
    },
  };

  function checkPermissions(raw: unknown) {
    const list = Array.isArray(raw) ? raw : [];
    const clean = ADMIN_PERMISSIONS.filter((item) => list.includes(item));
    if (clean.length === 0) throw new Error('PERMISSIONS');
    return [...clean];
  }
}
