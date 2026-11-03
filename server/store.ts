import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { GYM_EVENTS } from '../src/data/gymData.ts';
import { INITIAL_REGISTERED_CLUBS } from '../src/data/gymManagementData.ts';
import { operatorEmails } from './operators.ts';
import {
  MAX_COMMENT,
  createWorkflow,
  clubIsApproved,
  normalisePhone,
  type AttendanceRecord,
  type CertificateRecord,
  type CompetitionRecord,
  type ContactRecord,
  type DocumentRecord,
  type DrillRecord,
  type FeeReminderRecord,
  type NoticeRecord,
  type Notifiers,
  type SubmissionRecord,
  type UploadRecord,
  type UploadSessionRecord,
} from './workflow.ts';

export const MONTHLY_FEE_NGN = 1000;
export const INSPO_CATEGORIES = [
  'All',
  'Floor',
  'Vault',
  'Bars',
  'Beam',
  'Tumbling',
  'Flexibility',
  'Strength',
  'Skills',
  'Training',
  'Competitions',
  'Challenges',
  'Progress',
] as const;

export type InspoCategory = (typeof INSPO_CATEGORIES)[number];
export type Visibility = 'everyone' | 'followers' | 'club';
export type Role = 'CLUB_ADMIN' | 'COACH' | 'GYMNAST' | 'PARENT';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  username: string;
  phone: string;
  role: Role;
  dateOfBirth: string | null;
  level: number | null;
  clubId: string | null;
  status: 'pending_payment' | 'trial' | 'active';
  parentAccepted: boolean;
  showAge: boolean;
  showLevel: boolean;
  periodEnd: string | null;
  /** The club a gymnast chose. Billing and membership only follow clubId. */
  selectedClubId?: string | null;
  offersBars?: boolean;
  offersBeam?: boolean;
  levelUpdatedAt?: string | null;
  /** A coach the club administrator removed: cannot sign in. */
  disabled?: boolean;
  /** When this person ticked the privacy policy at sign-up. */
  privacyAcceptedAt?: string | null;
}

export interface ClubRecord {
  id: string;
  name: string;
  city: string;
  country: string;
  adminUserId: string;
  trialEndsAt?: string | null;
  /** When the club's one seven-day trial began. */
  trialStartedAt?: string | null;
  /** Inferred from trialEndsAt for clubs created before the start date was recorded. */
  trialStartInferred?: boolean;
  /** Shown on certificates. */
  coachName?: string | null;
  /** GymTrack checks each new club before gymnasts can choose it. No value: from before this check, so approved. */
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
  logoUploadId?: string | null;
  signatureUploadId?: string | null;
}

export interface PaymentRecord {
  reference: string;
  amount: number;
  studentIds: string[];
  status: 'pending' | 'paid';
  transferId: string | null;
  clubId: string | null;
}

export interface InspoPost {
  id: string;
  authorId: string;
  videoUrl: string;
  caption: string;
  skill: string;
  category: Exclude<InspoCategory, 'All'>;
  clubTag: string;
  hashtags: string[];
  visibility: Visibility;
  /** For visibility 'club': the one club that can see the video. Older posts use the author's club. */
  audienceClubId?: string | null;
  showAge: boolean;
  showLevel: boolean;
  createdAt: string;
}

export interface CommentRecord {
  id: string;
  postId: string;
  authorId: string;
  text: string;
  parentCommentId: string | null;
  hidden: boolean;
  createdAt: string;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  kind: 'like' | 'comment' | 'follow' | 'reply' | 'upload';
  fromUserId: string;
  postId: string | null;
  read: boolean;
  createdAt: string;
}

export interface DatabaseShape {
  users: UserRecord[];
  clubs: ClubRecord[];
  payments: PaymentRecord[];
  tokens: { hash: string; userId: string }[];
  posts: InspoPost[];
  likes: { postId: string; userId: string }[];
  comments: CommentRecord[];
  saves: { postId: string; userId: string }[];
  follows: { followerId: string; targetUserId?: string; targetClubId?: string }[];
  notifications: NotificationRecord[];
  blocks: { blockerId: string; blockedId: string }[];
  commentReports: { id: string; commentId: string; reporterId: string; createdAt: string }[];
  submissions: SubmissionRecord[];
  notices: NoticeRecord[];
  competitions: CompetitionRecord[];
  documents: DocumentRecord[];
  attendance: AttendanceRecord[];
  feeReminders: FeeReminderRecord[];
  contacts: ContactRecord[];
  uploads: UploadRecord[];
  certificates: CertificateRecord[];
  drills: DrillRecord[];
  uploadSessions: UploadSessionRecord[];
  /** Club subscriptions switched on by an operator after checking the bank transfer. Never edited or removed. */
  clubSubscriptions: ClubSubscriptionRecord[];
  passwordResets: { hash: string; userId: string; expiresAt: string; createdBy: string }[];
}

export interface ClubSubscriptionRecord {
  id: string;
  clubId: string;
  startsAt: string;
  endsAt: string;
  months: number;
  amountNgn: number;
  /** What the operator checked: the transfer receipt or bank reference. */
  reference: string;
  note: string;
  activatedBy: string;
  activatedAt: string;
}

const CITY_COORDS: Record<string, [number, number]> = {
  lagos: [6.5244, 3.3792],
  abuja: [9.0765, 7.3986],
};

export function emptyDb(): DatabaseShape {
  return {
    users: [],
    clubs: [],
    payments: [],
    tokens: [],
    posts: [],
    likes: [],
    comments: [],
    saves: [],
    follows: [],
    notifications: [],
    blocks: [],
    commentReports: [],
    submissions: [],
    notices: [],
    competitions: [],
    documents: [],
    attendance: [],
    feeReminders: [],
    contacts: [],
    uploads: [],
    certificates: [],
    drills: [],
    uploadSessions: [],
    clubSubscriptions: [],
    passwordResets: [],
  };
}

function id(prefix: string) {
  return `${prefix}_${randomBytes(6).toString('hex')}`;
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 32);
  const prev = Buffer.from(hash, 'hex');
  if (prev.length !== next.length) return false;
  return timingSafeEqual(prev, next);
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

/** The key put in file links. It opens files only, so a shared link never hands over the account. */
function mediaTokenFor(hash: string) {
  return createHash('sha256').update(`media:${hash}`).digest('hex');
}

const MAX_SESSIONS_PER_USER = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD = 8;

function requireEmail(raw: unknown) {
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (email.length > 200 || !EMAIL_PATTERN.test(email)) throw new Error('EMAIL_INVALID');
  return email;
}

function requirePassword(raw: unknown) {
  if (typeof raw !== 'string' || raw.length < MIN_PASSWORD || raw.length > 200) throw new Error('PASSWORD_SHORT');
  return raw;
}

function requireText(raw: unknown, code: string) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text || text.length > 120) throw new Error(code);
  return text;
}

function requirePhone(raw: unknown) {
  const phone = typeof raw === 'string' ? raw.trim() : '';
  if (phone.length > 40 || normalisePhone(phone).length < 10) throw new Error('PHONE_INVALID');
  return phone;
}

function requireLevel(raw: unknown) {
  if (raw === undefined || raw === null || raw === '') return 1;
  const level = Number(raw);
  if (!Number.isInteger(level) || level < 1 || level > 10) throw new Error('LEVEL_INVALID');
  return level;
}

function requireBirthDate(raw: unknown, today: Date) {
  const text = typeof raw === 'string' ? raw : '';
  const born = new Date(text);
  if (!/^\d{4}-\d{2}-\d{2}/.test(text) || Number.isNaN(born.getTime()) || born.getTime() > today.getTime() || today.getFullYear() - born.getFullYear() > 100) {
    throw new Error('DOB_INVALID');
  }
  return text;
}

function ageYears(dateOfBirth: string | null) {
  if (!dateOfBirth) return null;
  const born = new Date(dateOfBirth);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const month = now.getMonth() - born.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < born.getDate())) age -= 1;
  return age;
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

const DAY_MS = 24 * 60 * 60 * 1000;
const RESET_LINK_MS = 60 * 60 * 1000;
const OPERATOR_RESET_LINK_MS = DAY_MS;
const MAX_COACHES = 50;
const MAX_STUDENTS_AT_ONCE = 200;
const TRIAL_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;

export interface StoreOptions {
  /** false: new clubs start approved. Only the older tests use this. */
  clubApproval?: boolean;
}

export function openStore(filePath: string, now: () => Date = () => new Date(), notifiers: Notifiers = {}, options: StoreOptions = {}) {
  const db: DatabaseShape = fs.existsSync(filePath)
    ? { ...emptyDb(), ...JSON.parse(fs.readFileSync(filePath, 'utf8')) }
    : emptyDb();
  return createBoundStore(db, async (snapshot) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(snapshot));
  }, now, notifiers, options);
}

export function createBoundStore(db: DatabaseShape, persist: (snapshot: DatabaseShape) => Promise<void>, now: () => Date = () => new Date(), notifiers: Notifiers = {}, options: StoreOptions = {}) {
  const empty = emptyDb();
  for (const key of Object.keys(empty) as (keyof DatabaseShape)[]) {
    if (!Array.isArray(db[key])) (db as unknown as Record<string, unknown>)[key] = empty[key];
  }
  async function save() {
    await persist(db);
  }
  const workflow = createWorkflow(db, save, now, notifiers);

  function publicUser(user: UserRecord) {
    const club = db.clubs.find((item) => item.id === user.clubId);
    const age = ageYears(user.dateOfBirth);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      username: user.username,
      phone: user.phone,
      role: user.role,
      level: user.level,
      clubId: user.clubId,
      clubName: club?.name ?? null,
      selectedClubId: user.clubId ? null : user.selectedClubId ?? null,
      selectedClubName: user.clubId ? null : db.clubs.find((item) => item.id === user.selectedClubId)?.name ?? null,
      offersBars: user.offersBars !== false,
      offersBeam: user.offersBeam !== false,
      progress: user.role === 'GYMNAST' ? workflow.progressFor(user) : null,
      status: user.status,
      periodEnd: user.role === 'GYMNAST' ? null : accessUntil(user),
      clubTrialEndsAt: clubTrialEnd(user),
      access: accessLabel(user),
      club: clubBilling(user),
      operator: isOperator(user),
      age: user.showAge ? age : null,
      showLevel: user.showLevel,
      under18: age !== null && age < 18,
      parentAccepted: user.parentAccepted,
    };
  }

  async function issueToken(userId: string) {
    const token = randomBytes(24).toString('hex');
    db.tokens.push({ hash: tokenHash(token), userId });
    // Keep only this person's newest sign-ins. Every save writes the whole list.
    const mine = db.tokens.filter((item) => item.userId === userId);
    if (mine.length > MAX_SESSIONS_PER_USER) {
      const dropped = new Set(mine.slice(0, mine.length - MAX_SESSIONS_PER_USER));
      db.tokens = db.tokens.filter((item) => !dropped.has(item));
    }
    await save();
    return token;
  }

  async function newResetToken(user: UserRecord, lifetimeMs: number, createdBy: string) {
    const token = randomBytes(24).toString('hex');
    // Only the newest link works, and links that ran out are forgotten.
    db.passwordResets = db.passwordResets.filter((item) => item.userId !== user.id && new Date(item.expiresAt).getTime() > now().getTime());
    db.passwordResets.push({ hash: tokenHash(token), userId: user.id, expiresAt: new Date(now().getTime() + lifetimeMs).toISOString(), createdBy });
    await save();
    return token;
  }

  function mediaTokenOf(token: string) {
    return mediaTokenFor(tokenHash(token));
  }

  function userByMediaToken(mediaToken: string | undefined) {
    if (!mediaToken) return null;
    const row = db.tokens.find((item) => mediaTokenFor(item.hash) === mediaToken);
    if (!row) return null;
    const user = db.users.find((item) => item.id === row.userId);
    return user && !user.disabled ? user : null;
  }

  function userByToken(token: string | undefined) {
    if (!token) return null;
    const hash = tokenHash(token);
    const row = db.tokens.find((item) => item.hash === hash);
    if (!row) return null;
    const user = db.users.find((item) => item.id === row.userId);
    return user && !user.disabled ? user : null;
  }

  function paymentView(payment: PaymentRecord) {
    return {
      reference: payment.reference,
      amount: payment.amount,
      status: payment.status,
      studentCount: payment.studentIds.length,
      accountName: 'GymTrack',
      accountNumber: process.env.GYMTRACK_NUBAN || '',
    };
  }

  function paymentFor(user: UserRecord) {
    // Gymnasts never pay. Clubs pay by bank transfer, checked by an operator (see clubBilling).
    if (user.role === 'GYMNAST' || clubFor(user)) return null;
    const payment = db.payments.find((item) => item.status === 'pending' && item.studentIds.includes(user.id));
    return payment ? paymentView(payment) : null;
  }

  function clubFor(user: UserRecord) {
    return user.clubId ? db.clubs.find((item) => item.id === user.clubId) ?? null : null;
  }

  function clubTrialEnd(user: UserRecord) {
    return clubFor(user)?.trialEndsAt ?? null;
  }

  /** The latest end date of the club's activated subscriptions, or null. */
  function clubPaidUntil(club: ClubRecord | null) {
    if (!club) return null;
    const ends = db.clubSubscriptions.filter((item) => item.clubId === club.id).map((item) => item.endsAt).sort();
    return ends.at(-1) ?? null;
  }

  /** Trial, subscription and price for a club account's payment prompt. */
  function clubBilling(user: UserRecord) {
    const club = clubFor(user);
    if (!club || user.role === 'GYMNAST') return null;
    const paidUntil = clubPaidUntil(club);
    return {
      id: club.id,
      name: club.name,
      approval: club.approvalStatus ?? 'approved',
      rejectionReason: club.rejectionReason ?? null,
      trialStartedAt: club.trialStartedAt ?? null,
      trialEndsAt: club.trialEndsAt ?? null,
      paidUntil,
      subscriptionActive: Boolean(paidUntil && new Date(paidUntil).getTime() > now().getTime()),
      monthlyFeeNgn: MONTHLY_FEE_NGN,
    };
  }

  function accessUntil(user: UserRecord) {
    // A coach's access is the club's. Only the administrator's own account carries a period.
    const times = [user.role === 'COACH' ? null : user.periodEnd, clubTrialEnd(user), clubPaidUntil(clubFor(user))]
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value).getTime())
      .filter((value) => !Number.isNaN(value));
    if (times.length === 0) return null;
    return new Date(Math.max(...times)).toISOString();
  }

  /** Operators check club bank transfers and switch subscriptions on (GYMTRACK_OPERATOR_EMAILS). */
  function isOperator(user: UserRecord) {
    return operatorEmails().includes(user.email.toLowerCase());
  }

  /** A club account whose club GymTrack has not approved. It sees no gymnasts' data. */
  function clubWaiting(user: UserRecord) {
    return user.role !== 'GYMNAST' && Boolean(user.clubId) && !clubIsApproved(clubFor(user));
  }

  /**
   * Gymnasts always use GymTrack free, with or without a club, and never expire.
   * Club accounts are open during the club's trial and while a subscription is active.
   */
  function accessOpen(user: UserRecord) {
    if (user.role === 'GYMNAST') return true;
    if (clubWaiting(user)) return false;
    const until = accessUntil(user);
    return Boolean(until && new Date(until).getTime() > now().getTime());
  }

  function accessLabel(user: UserRecord) {
    if (user.role === 'GYMNAST') return 'free';
    if (clubWaiting(user)) return clubFor(user)?.approvalStatus === 'rejected' ? 'rejected' : 'pending';
    if (!accessOpen(user)) return 'locked';
    const billing = clubBilling(user);
    if (billing?.subscriptionActive || user.status === 'active') return 'paid';
    return 'trial';
  }

  function startTrial(user: UserRecord) {
    user.status = 'trial';
    user.periodEnd = new Date(now().getTime() + TRIAL_MS).toISOString();
  }

  async function ensureClubTrial(user: UserRecord) {
    const club = clubFor(user);
    if (!club) return;
    let changed = false;
    if (!club.trialEndsAt) {
      const personalOpen = user.role === 'CLUB_ADMIN' && user.periodEnd && new Date(user.periodEnd).getTime() > now().getTime();
      club.trialEndsAt = personalOpen ? user.periodEnd : new Date(now().getTime() + TRIAL_MS).toISOString();
      changed = true;
    }
    if (!club.trialStartedAt) {
      // Clubs from before the start date was kept: their trial was seven days long, so it began a week before it ended.
      club.trialStartedAt = new Date(new Date(club.trialEndsAt).getTime() - TRIAL_MS).toISOString();
      club.trialStartInferred = true;
      changed = true;
    }
    if (user.role === 'CLUB_ADMIN' && user.status !== 'active') {
      const trialEnd = new Date(club.trialEndsAt).getTime();
      const personalEnd = user.periodEnd ? new Date(user.periodEnd).getTime() : 0;
      if (personalEnd < trialEnd) {
        user.status = 'trial';
        user.periodEnd = club.trialEndsAt;
        changed = true;
      }
    }
    if (changed) await save();
  }

  async function ensureTrial(user: UserRecord) {
    // Gymnasts are free: no trial, no payment.
    if (user.role === 'GYMNAST') return;
    // The free week starts when GymTrack approves the club.
    if (clubWaiting(user)) return;
    await ensureClubTrial(user);
    // Coaches use the club's trial and subscription, and never get a period of their own.
    if (user.role === 'COACH' || user.periodEnd) return;
    startTrial(user);
    const waiting = db.payments.some((item) => item.status === 'pending' && item.studentIds.includes(user.id));
    if (!waiting) {
      db.payments.push({
        reference: `GT-${randomBytes(3).toString('hex').toUpperCase()}`,
        amount: MONTHLY_FEE_NGN,
        studentIds: [user.id],
        status: 'pending',
        transferId: null,
        clubId: user.clubId,
      });
    }
    await save();
  }

  async function createPendingStudents(
    students: { name: string; email: string; password: string; phone?: string; level?: number; dateOfBirth?: string; selectedClubId?: string | null; acceptedPrivacy?: boolean }[],
    clubId: string | null,
  ) {
    if (!Array.isArray(students)) throw new Error('EMPTY');
    if (students.length > MAX_STUDENTS_AT_ONCE) throw new Error('TOO_MANY');
    // Check every row before creating any, so a refused list leaves nothing behind and can be sent again.
    const seen = new Set<string>();
    const checked = students.map((student) => {
      const email = requireEmail(student?.email);
      if (seen.has(email) || db.users.some((item) => item.email === email)) throw new Error(`EMAIL_TAKEN:${email}`);
      seen.add(email);
      return {
        student,
        email,
        name: requireText(student.name, 'NAME_REQUIRED'),
        password: requirePassword(student.password),
        phone: student.phone ? requirePhone(student.phone) : '',
        level: requireLevel(student.level),
        dateOfBirth: requireBirthDate(student.dateOfBirth, now()),
      };
    });
    const created: UserRecord[] = [];
    for (const { student, email, name, password, phone, level, dateOfBirth } of checked) {
      const user: UserRecord = {
        id: id('usr'),
        email,
        passwordHash: hashPassword(password),
        name,
        username: email.split('@')[0],
        phone,
        role: 'GYMNAST',
        dateOfBirth,
        level,
        clubId,
        status: 'trial',
        parentAccepted: false,
        showAge: false,
        showLevel: false,
        periodEnd: null,
        selectedClubId: !clubId && student.selectedClubId && clubIsApproved(db.clubs.find((item) => item.id === student.selectedClubId)) ? student.selectedClubId : null,
        privacyAcceptedAt: student.acceptedPrivacy === true ? now().toISOString() : null,
      };
      // Gymnasts use GymTrack free: no trial to run out and no payment to open.
      db.users.push(user);
      created.push(user);
    }
    await save();
    return { payment: null, students: created.map(publicUser) };
  }

  function notify(userId: string, kind: NotificationRecord['kind'], fromUserId: string, postId: string | null) {
    if (userId === fromUserId || isBlocked(userId, fromUserId)) return;
    db.notifications.push({
      id: id('ntf'),
      userId,
      kind,
      fromUserId,
      postId,
      read: false,
      createdAt: new Date().toISOString(),
    });
  }

  function isBlocked(a: string, b: string) {
    return db.blocks.some(
      (item) => (item.blockerId === a && item.blockedId === b) || (item.blockerId === b && item.blockedId === a),
    );
  }

  /**
   * "All Clubs" videos: every registered user. "Specific Club" videos: only that club's
   * members (its staff, and gymnasts who belong to or chose it) and the author.
   * Signed-out visitors see none.
   */
  function canSeePost(viewer: UserRecord | null, post: InspoPost) {
    if (!viewer || clubWaiting(viewer)) return false;
    if (viewer.id !== post.authorId && isBlocked(viewer.id, post.authorId)) return false;
    if (viewer.id === post.authorId) return true;
    if (post.visibility === 'everyone') return true;
    if (post.visibility === 'club') {
      const audience = post.audienceClubId ?? db.users.find((item) => item.id === post.authorId)?.clubId ?? null;
      const viewerClub = viewer.clubId ?? viewer.selectedClubId ?? null;
      return audience !== null && viewerClub === audience;
    }
    return db.follows.some((item) => item.followerId === viewer.id && item.targetUserId === post.authorId);
  }

  function presentPost(post: InspoPost, viewer: UserRecord | null) {
    const author = db.users.find((item) => item.id === post.authorId);
    const club = author?.clubId ? db.clubs.find((item) => item.id === author.clubId) : null;
    const age = ageYears(author?.dateOfBirth ?? null);
    return {
      ...post,
      authorName: author?.name ?? 'Gymnast',
      username: author?.username ?? 'gymnast',
      clubId: author?.clubId ?? null,
      clubName: post.clubTag || club?.name || null,
      audienceClubName: post.visibility === 'club' && post.audienceClubId ? db.clubs.find((item) => item.id === post.audienceClubId)?.name ?? null : null,
      mine: viewer?.id === post.authorId,
      age: post.showAge ? age : null,
      level: post.showLevel ? author?.level ?? null : null,
      likes: db.likes.filter((item) => item.postId === post.id).length,
      liked: viewer ? db.likes.some((item) => item.postId === post.id && item.userId === viewer.id) : false,
      saved: viewer ? db.saves.some((item) => item.postId === post.id && item.userId === viewer.id) : false,
      comments: db.comments.filter((item) => item.postId === post.id && !item.hidden && !(viewer && isBlocked(viewer.id, item.authorId))).map((item) => ({
        id: item.id,
        text: item.text,
        authorName: db.users.find((user) => user.id === item.authorId)?.name ?? 'Gymnast',
        parentCommentId: item.parentCommentId,
        createdAt: item.createdAt,
      })),
    };
  }

  return {
    ...workflow,

    /** A private Connect video can be opened by anyone the post is shown to, such as the chosen club. */
    canReadUpload(user: UserRecord | null, upload: UploadRecord) {
      if (!user) return false;
      if (clubWaiting(user)) return upload.ownerId === user.id;
      const url = `/api/uploads/${upload.id}`;
      const posts = db.posts.filter((post) => post.videoUrl === url);
      // Blocking someone also stops the video file opening for them.
      if (posts.some((post) => post.authorId !== user.id && isBlocked(user.id, post.authorId))) return false;
      if (workflow.canReadUpload(user, upload)) return true;
      return posts.some((post) => canSeePost(user, post));
    },

    async registerClub(input: { clubName: string; city: string; adminName: string; email: string; password: string; phone?: string; acceptedPrivacy?: boolean }) {
      const email = requireEmail(input.email);
      if (db.users.some((item) => item.email === email)) throw new Error('EMAIL_TAKEN');
      const password = requirePassword(input.password);
      const adminName = requireText(input.adminName, 'NAME_REQUIRED');
      const clubName = requireText(input.clubName, 'NAME_REQUIRED');
      const city = requireText(input.city, 'CITY_REQUIRED');
      const phone = input.phone ? requirePhone(input.phone) : '';
      const needsApproval = options.clubApproval !== false && !operatorEmails().includes(email);
      const club: ClubRecord = {
        id: id('club'),
        name: clubName,
        city,
        country: 'Nigeria',
        adminUserId: '',
        trialEndsAt: null,
        trialStartedAt: needsApproval ? null : now().toISOString(),
        approvalStatus: needsApproval ? 'pending' : 'approved',
      };
      const admin: UserRecord = {
        id: id('usr'),
        email,
        passwordHash: hashPassword(password),
        name: adminName,
        username: email.split('@')[0],
        phone,
        role: 'CLUB_ADMIN',
        dateOfBirth: null,
        level: null,
        clubId: club.id,
        status: 'trial',
        parentAccepted: true,
        showAge: false,
        showLevel: false,
        periodEnd: null,
        privacyAcceptedAt: input.acceptedPrivacy === true ? now().toISOString() : null,
      };
      if (!needsApproval) {
        startTrial(admin);
        club.trialEndsAt = admin.periodEnd;
      }
      club.adminUserId = admin.id;
      const payment: PaymentRecord = {
        reference: `GT-${randomBytes(3).toString('hex').toUpperCase()}`,
        amount: MONTHLY_FEE_NGN,
        studentIds: [admin.id],
        status: 'pending',
        transferId: null,
        clubId: club.id,
      };
      db.clubs.push(club);
      db.users.push(admin);
      db.payments.push(payment);
      await save();
      const token = await issueToken(admin.id);
      if (needsApproval && notifiers.enquiry) {
        // Puts it in front of the GymTrack team. Not waited for: the sign-up must not depend on it.
        notifiers.enquiry({ name: adminName, phone, message: `New club waiting for approval: ${clubName}, ${city}. Sign-in email: ${email}. Approve or decline it on the operator page.` })
          .catch((error) => console.error('New club notice could not be filed', error instanceof Error ? error.message : error));
      }
      return { token, mediaToken: mediaTokenOf(token), user: publicUser(admin), club, payment: paymentView(payment) };
    },

    async signupStudent(input: { name: string; email: string; password: string; phone?: string; level?: number; dateOfBirth?: string; selectedClubId?: string | null; acceptedPrivacy?: boolean }) {
      const created = await createPendingStudents([input], null);
      const record = db.users.find((item) => item.id === created.students[0]?.id);
      if (!record) throw new Error('ERROR');
      const token = await issueToken(record.id);
      return { ...created, token, mediaToken: mediaTokenOf(token), user: publicUser(record) };
    },

    async signupClubStudents(
      admin: UserRecord,
      students: { name: string; email: string; password: string; phone?: string; level?: number; dateOfBirth?: string }[],
    ) {
      if (admin.role !== 'CLUB_ADMIN' || !admin.clubId) throw new Error('FORBIDDEN');
      if (students.length === 0) throw new Error('EMPTY');
      return await createPendingStudents(students, admin.clubId);
    },

    async matchPayment(reference: string, amount: number, transferId: string) {
      const payment = db.payments.find((item) => item.reference === reference);
      if (!payment) throw new Error('NOT_FOUND');
      if (payment.status === 'paid') return { alreadyPaid: true, payment: paymentView(payment) };
      if (payment.amount !== amount) throw new Error('AMOUNT');
      if (db.payments.some((item) => item.transferId === transferId)) throw new Error('REPLAY');
      payment.status = 'paid';
      payment.transferId = transferId;
      for (const studentId of payment.studentIds) {
        const student = db.users.find((item) => item.id === studentId);
        if (!student) continue;
        const openUntil = student.periodEnd ? new Date(student.periodEnd).getTime() : 0;
        const start = Math.max(now().getTime(), openUntil);
        student.status = 'active';
        student.periodEnd = new Date(start + MONTH_MS).toISOString();
        if (payment.clubId) student.clubId = payment.clubId;
      }
      await save();
      return { alreadyPaid: false, payment: paymentView(payment) };
    },

    async login(email: string, password: string) {
      const address = typeof email === 'string' ? email.trim().toLowerCase() : '';
      const user = db.users.find((item) => item.email === address);
      if (!user || user.disabled || typeof password !== 'string' || !verifyPassword(password, user.passwordHash)) throw new Error('INVALID');
      await ensureTrial(user);
      const token = await issueToken(user.id);
      return {
        token,
        mediaToken: mediaTokenOf(token),
        user: publicUser(user),
        payment: paymentFor(user),
      };
    },

    clubWaiting,

    /** The account a forgotten-password request is for, with a one-hour link. Null when no such account. */
    async startPasswordReset(email: unknown) {
      const address = typeof email === 'string' ? email.trim().toLowerCase() : '';
      const user = db.users.find((item) => item.email === address && !item.disabled);
      if (!user) return null;
      return { user, token: await newResetToken(user, RESET_LINK_MS, 'self') };
    },

    /** Operators can hand someone a link when email is not available. */
    async operatorPasswordReset(operator: UserRecord, email: unknown) {
      if (!isOperator(operator)) throw new Error('FORBIDDEN');
      const address = typeof email === 'string' ? email.trim().toLowerCase() : '';
      const user = db.users.find((item) => item.email === address && !item.disabled);
      if (!user) throw new Error('NOT_FOUND');
      const token = await newResetToken(user, OPERATOR_RESET_LINK_MS, operator.email);
      console.log(`Password reset link made for ${user.id} by ${operator.email}`);
      return { token, name: user.name, email: user.email, phone: user.phone, expiresInHours: OPERATOR_RESET_LINK_MS / (60 * 60 * 1000) };
    },

    /** Sets a new password from a link. The link works once, and every other sign-in ends. */
    async finishPasswordReset(token: unknown, password: unknown) {
      const hash = typeof token === 'string' ? tokenHash(token) : '';
      const row = db.passwordResets.find((item) => item.hash === hash);
      const user = row && new Date(row.expiresAt).getTime() > now().getTime() ? db.users.find((item) => item.id === row.userId && !item.disabled) : null;
      if (!user) throw new Error('RESET_INVALID');
      const next = requirePassword(password);
      user.passwordHash = hashPassword(next);
      db.passwordResets = db.passwordResets.filter((item) => item.userId !== user.id);
      db.tokens = db.tokens.filter((item) => item.userId !== user.id);
      await save();
      return { ok: true };
    },

    /** Changing a password from the profile keeps this device signed in and ends the others. */
    async changePassword(user: UserRecord, currentToken: string, current: unknown, next: unknown) {
      if (typeof current !== 'string' || !verifyPassword(current, user.passwordHash)) throw new Error('WRONG_PASSWORD');
      const password = requirePassword(next);
      user.passwordHash = hashPassword(password);
      const keep = tokenHash(currentToken);
      db.tokens = db.tokens.filter((item) => item.userId !== user.id || item.hash === keep);
      db.passwordResets = db.passwordResets.filter((item) => item.userId !== user.id);
      await save();
      return { ok: true };
    },

    // ---- Coaches: their own sign-in, created by the club administrator ----
    async addCoach(admin: UserRecord, input: { name?: unknown; email?: unknown; phone?: unknown; password?: unknown }) {
      if (admin.role !== 'CLUB_ADMIN' || !admin.clubId) throw new Error('FORBIDDEN');
      const email = requireEmail(input.email);
      const name = requireText(input.name, 'NAME_REQUIRED');
      const password = requirePassword(input.password);
      const phone = input.phone ? requirePhone(input.phone) : '';
      const existing = db.users.find((item) => item.email === email);
      if (existing && !(existing.disabled && existing.role === 'COACH' && existing.clubId === admin.clubId)) throw new Error('EMAIL_TAKEN');
      const coaches = db.users.filter((item) => item.role === 'COACH' && item.clubId === admin.clubId && !item.disabled);
      if (coaches.length >= MAX_COACHES) throw new Error('TOO_MANY');
      const coach: UserRecord = existing ?? {
        id: id('usr'),
        email,
        passwordHash: '',
        name,
        username: email.split('@')[0],
        phone,
        role: 'COACH',
        dateOfBirth: null,
        level: null,
        clubId: admin.clubId,
        status: 'trial',
        parentAccepted: true,
        showAge: false,
        showLevel: false,
        periodEnd: null,
      };
      Object.assign(coach, { name, phone, passwordHash: hashPassword(password), disabled: false });
      if (!existing) db.users.push(coach);
      await save();
      return { id: coach.id, name: coach.name, email: coach.email, phone: coach.phone };
    },

    /** Ends a coach's access straight away. What they reviewed and published stays on record. */
    async removeCoach(admin: UserRecord, coachId: string) {
      if (admin.role !== 'CLUB_ADMIN' || !admin.clubId) throw new Error('FORBIDDEN');
      const coach = db.users.find((item) => item.id === coachId && item.role === 'COACH' && item.clubId === admin.clubId && !item.disabled);
      if (!coach) throw new Error('NOT_FOUND');
      coach.disabled = true;
      db.tokens = db.tokens.filter((item) => item.userId !== coach.id);
      db.passwordResets = db.passwordResets.filter((item) => item.userId !== coach.id);
      await save();
      return { ok: true };
    },

    // ---- Club approval ----
    /** Opens the club to gymnasts. Its seven free days start now, the first time it is approved. */
    async approveClub(operator: UserRecord, clubId: string) {
      if (!isOperator(operator)) throw new Error('FORBIDDEN');
      const club = db.clubs.find((item) => item.id === clubId);
      if (!club) throw new Error('NOT_FOUND');
      if (clubIsApproved(club)) throw new Error('ALREADY_REVIEWED');
      club.approvalStatus = 'approved';
      club.reviewedBy = operator.email;
      club.reviewedAt = now().toISOString();
      club.rejectionReason = null;
      if (!club.trialEndsAt) {
        club.trialStartedAt = now().toISOString();
        club.trialEndsAt = new Date(now().getTime() + TRIAL_MS).toISOString();
        const admin = db.users.find((item) => item.id === club.adminUserId);
        if (admin) {
          admin.status = 'trial';
          admin.periodEnd = club.trialEndsAt;
        }
      }
      await save();
      return { id: club.id, approval: club.approvalStatus, trialEndsAt: club.trialEndsAt };
    },

    async rejectClub(operator: UserRecord, clubId: string, reason: unknown) {
      if (!isOperator(operator)) throw new Error('FORBIDDEN');
      const club = db.clubs.find((item) => item.id === clubId);
      if (!club) throw new Error('NOT_FOUND');
      if (club.approvalStatus !== 'pending') throw new Error('ALREADY_REVIEWED');
      const text = typeof reason === 'string' ? reason.trim().slice(0, 500) : '';
      if (!text) throw new Error('REASON_REQUIRED');
      club.approvalStatus = 'rejected';
      club.reviewedBy = operator.email;
      club.reviewedAt = now().toISOString();
      club.rejectionReason = text;
      await save();
      return { id: club.id, approval: club.approvalStatus };
    },

    /**
     * Removes clubs and everything that only belongs to them: their staff accounts and
     * the club's records. Gymnasts keep their accounts and are simply left without a club.
     * Returns the stored files to delete.
     */
    async removeClubs(clubIds: string[]) {
      const ids = new Set(clubIds.filter((clubId) => db.clubs.some((club) => club.id === clubId)));
      if (ids.size === 0) return { clubs: 0, staff: 0, gymnastsKept: 0, files: [] as UploadRecord[] };
      const inClub = (item: { clubId?: string | null }) => Boolean(item.clubId && ids.has(item.clubId));
      const staffIds = new Set(db.users.filter((user) => user.role !== 'GYMNAST' && inClub(user)).map((user) => user.id));
      let gymnastsKept = 0;
      for (const user of db.users) {
        if (user.role !== 'GYMNAST') continue;
        const inside = inClub(user) || Boolean(user.selectedClubId && ids.has(user.selectedClubId));
        if (!inside) continue;
        gymnastsKept += 1;
        if (inClub(user)) user.clubId = null;
        if (user.selectedClubId && ids.has(user.selectedClubId)) user.selectedClubId = null;
      }

      // Their files: what the staff uploaded, and everything the club's records point at.
      const removedPosts = new Set(db.posts.filter((post) => staffIds.has(post.authorId)).map((post) => post.id));
      db.posts = db.posts.filter((post) => !removedPosts.has(post.id));
      db.likes = db.likes.filter((item) => !removedPosts.has(item.postId) && !staffIds.has(item.userId));
      db.saves = db.saves.filter((item) => !removedPosts.has(item.postId) && !staffIds.has(item.userId));
      const removedComments = new Set(db.comments.filter((item) => removedPosts.has(item.postId) || staffIds.has(item.authorId)).map((item) => item.id));
      db.comments = db.comments.filter((item) => !removedComments.has(item.id));
      db.commentReports = db.commentReports.filter((item) => !removedComments.has(item.commentId) && !staffIds.has(item.reporterId));
      db.notifications = db.notifications.filter((item) => !staffIds.has(item.userId) && !staffIds.has(item.fromUserId) && !(item.postId && removedPosts.has(item.postId)));
      db.follows = db.follows.filter((item) => !staffIds.has(item.followerId) && !(item.targetUserId && staffIds.has(item.targetUserId)) && !(item.targetClubId && ids.has(item.targetClubId)));
      db.blocks = db.blocks.filter((item) => !staffIds.has(item.blockerId) && !staffIds.has(item.blockedId));
      db.submissions = db.submissions.filter((item) => !inClub(item));
      db.notices = db.notices.filter((item) => !inClub(item));
      db.documents = db.documents.filter((item) => !inClub(item));
      db.certificates = db.certificates.filter((item) => !inClub(item));
      db.drills = db.drills.filter((item) => !inClub(item));
      db.competitions = db.competitions.filter((item) => !inClub(item));
      db.attendance = db.attendance.filter((item) => !inClub(item));
      db.feeReminders = db.feeReminders.filter((item) => !inClub(item));
      db.clubSubscriptions = db.clubSubscriptions.filter((item) => !inClub(item));
      db.payments = db.payments.filter((item) => !inClub(item) && !item.studentIds.some((studentId) => staffIds.has(studentId)));
      db.uploadSessions = db.uploadSessions.filter((item) => !inClub(item) && !staffIds.has(item.ownerId));
      db.tokens = db.tokens.filter((item) => !staffIds.has(item.userId));
      db.passwordResets = db.passwordResets.filter((item) => !staffIds.has(item.userId));

      // A gymnast's file stays only while something of theirs still uses it.
      const inUse = new Set<string>();
      for (const post of db.posts) inUse.add(post.videoUrl);
      for (const item of db.submissions) inUse.add(item.videoUrl);
      for (const item of db.documents) inUse.add(`/api/uploads/${item.uploadId}`);
      for (const item of db.certificates) inUse.add(`/api/uploads/${item.uploadId}`);
      for (const item of db.drills) if (item.attachmentUploadId) inUse.add(`/api/uploads/${item.attachmentUploadId}`);
      for (const club of db.clubs) {
        if (ids.has(club.id)) continue;
        if (club.logoUploadId) inUse.add(`/api/uploads/${club.logoUploadId}`);
        if (club.signatureUploadId) inUse.add(`/api/uploads/${club.signatureUploadId}`);
      }
      const files: UploadRecord[] = [];
      const kept: UploadRecord[] = [];
      for (const upload of db.uploads) {
        const belongs = staffIds.has(upload.ownerId) || inClub(upload);
        if (belongs && !inUse.has(`/api/uploads/${upload.id}`)) files.push(upload);
        else {
          if (inClub(upload)) upload.clubId = null;
          kept.push(upload);
        }
      }
      db.uploads = kept;

      db.users = db.users.filter((user) => !staffIds.has(user.id));
      db.clubs = db.clubs.filter((club) => !ids.has(club.id));
      await save();
      return { clubs: ids.size, staff: staffIds.size, gymnastsKept, files };
    },

    /**
     * Removes gymnast accounts and everything that is theirs. Nobody else's posts or records
     * change, and an id that is not a gymnast is ignored. Returns the stored files to delete.
     */
    async removeGymnasts(userIds: string[]) {
      const ids = new Set(db.users.filter((user) => user.role === 'GYMNAST' && userIds.includes(user.id)).map((user) => user.id));
      if (ids.size === 0) return { gymnasts: 0, posts: 0, files: [] as UploadRecord[] };
      const removedPosts = new Set(db.posts.filter((post) => ids.has(post.authorId)).map((post) => post.id));
      const removedVideos = new Set(db.posts.filter((post) => removedPosts.has(post.id)).map((post) => post.videoUrl));
      for (const item of db.submissions) if (ids.has(item.gymnastId)) removedVideos.add(item.videoUrl);
      db.posts = db.posts.filter((post) => !removedPosts.has(post.id));
      db.likes = db.likes.filter((item) => !removedPosts.has(item.postId) && !ids.has(item.userId));
      db.saves = db.saves.filter((item) => !removedPosts.has(item.postId) && !ids.has(item.userId));
      const removedComments = new Set(db.comments.filter((item) => removedPosts.has(item.postId) || ids.has(item.authorId)).map((item) => item.id));
      db.comments = db.comments.filter((item) => !removedComments.has(item.id));
      db.commentReports = db.commentReports.filter((item) => !removedComments.has(item.commentId) && !ids.has(item.reporterId));
      db.notifications = db.notifications.filter((item) => !ids.has(item.userId) && !ids.has(item.fromUserId) && !(item.postId && removedPosts.has(item.postId)));
      db.follows = db.follows.filter((item) => !ids.has(item.followerId) && !(item.targetUserId && ids.has(item.targetUserId)));
      db.blocks = db.blocks.filter((item) => !ids.has(item.blockerId) && !ids.has(item.blockedId));
      db.submissions = db.submissions.filter((item) => !ids.has(item.gymnastId));
      db.competitions = db.competitions.filter((item) => !ids.has(item.gymnastId));
      db.attendance = db.attendance.filter((item) => !ids.has(item.gymnastId));
      db.feeReminders = db.feeReminders.filter((item) => !ids.has(item.gymnastId));
      db.certificates = db.certificates.filter((item) => !item.gymnastId || !ids.has(item.gymnastId));
      for (const drill of db.drills) drill.gymnastIds = drill.gymnastIds.filter((gymnastId) => !ids.has(gymnastId));
      db.payments = db.payments.filter((item) => !item.studentIds.some((studentId) => ids.has(studentId)));
      db.uploadSessions = db.uploadSessions.filter((item) => !ids.has(item.ownerId));
      db.tokens = db.tokens.filter((item) => !ids.has(item.userId));
      db.passwordResets = db.passwordResets.filter((item) => !ids.has(item.userId));

      // Their own uploads go, unless something of someone else's still points at the file.
      const inUse = new Set<string>();
      for (const post of db.posts) inUse.add(post.videoUrl);
      for (const item of db.submissions) inUse.add(item.videoUrl);
      const files = db.uploads.filter((upload) => {
        const url = `/api/uploads/${upload.id}`;
        return (ids.has(upload.ownerId) || removedVideos.has(url)) && !inUse.has(url);
      });
      const gone = new Set(files);
      db.uploads = db.uploads.filter((upload) => !gone.has(upload));
      db.users = db.users.filter((user) => !ids.has(user.id));
      await save();
      return { gymnasts: ids.size, posts: removedPosts.size, files };
    },

    userByToken,
    userByMediaToken,
    mediaTokenOf,
    /** Ends one sign-in on the server, and the file links that came with it. */
    async revokeToken(token: string) {
      const hash = tokenHash(token);
      db.tokens = db.tokens.filter((item) => item.hash !== hash);
      await save();
    },
    publicUser,
    paymentFor,
    accessOpen,
    ensureTrial,

    events(query: string) {
      const q = query.trim().toLowerCase();
      const matches = (event: (typeof GYM_EVENTS)[number]) => {
        if (!q) return true;
        return [event.name, event.city, event.country, event.startDate, event.venue]
          .join(' ')
          .toLowerCase()
          .includes(q);
      };
      const featured = GYM_EVENTS.find((event) => event.id === 'ev_gymfest_3') ?? null;
      const rest = GYM_EVENTS.filter((event) => event.id !== featured?.id && matches(event));
      return {
        featured,
        nigeria: rest.filter((event) => event.country.toLowerCase() === 'nigeria'),
        watchOnline: rest.filter((event) => event.country.toLowerCase() !== 'nigeria'),
      };
    },

    clubs(query: { q?: string; lat?: number; lng?: number; accountsOnly?: boolean }) {
      const seeded = query.accountsOnly ? [] : INITIAL_REGISTERED_CLUBS.map((club) => ({
        id: club.id,
        name: club.name,
        city: club.city,
        country: club.country,
        address: club.address,
      }));
      const created = db.clubs.filter((club) => clubIsApproved(club)).map((club) => ({
        id: club.id,
        name: club.name,
        city: club.city,
        country: club.country,
        address: club.city,
      }));
      let rows = [...seeded, ...created];
      const q = query.q?.trim().toLowerCase();
      if (q) {
        rows = rows.filter((club) => `${club.name} ${club.city} ${club.country}`.toLowerCase().includes(q));
      }
      if (query.lat !== undefined && query.lng !== undefined) {
        rows = rows
          .map((club) => {
            const coords = CITY_COORDS[club.city.toLowerCase()];
            const km = coords ? haversine(query.lat!, query.lng!, coords[0], coords[1]) : 20000;
            return { ...club, km: Math.round(km) };
          })
          .sort((a, b) => a.km - b.km);
      }
      return rows;
    },

    async createPost(
      author: UserRecord,
      input: {
        videoUrl: string;
        caption: string;
        skill: string;
        category: Exclude<InspoCategory, 'All'>;
        clubTag?: string;
        hashtags?: string[];
        visibility: Visibility;
        audienceClubId?: string | null;
        showAge?: boolean;
        showLevel?: boolean;
      },
    ) {
      if (!accessOpen(author)) throw new Error('PAYMENT_REQUIRED');
      const category = String(input.category);
      if (!INSPO_CATEGORIES.includes(category as InspoCategory) || category === 'All') throw new Error('CATEGORY');
      if (!input.videoUrl || typeof input.videoUrl !== 'string') throw new Error('VIDEO_REQUIRED');
      const upload = db.uploads.find((item) => `/api/uploads/${item.id}` === input.videoUrl);
      if (!upload || upload.ownerId !== author.id || !upload.mime.startsWith('video/')) throw new Error('VIDEO_INVALID');
      if (!String(input.skill ?? '').trim()) throw new Error('SKILL_REQUIRED');
      const club = author.clubId ? db.clubs.find((item) => item.id === author.clubId) : null;
      const visibility = (['everyone', 'followers', 'club'] as const).includes(input.visibility) ? input.visibility : 'everyone';
      let audienceClubId: string | null = null;
      if (visibility === 'club') {
        audienceClubId = input.audienceClubId || author.clubId || author.selectedClubId || null;
        if (!audienceClubId || !clubIsApproved(db.clubs.find((item) => item.id === audienceClubId))) throw new Error('CLUB_REQUIRED');
      }
      const post: InspoPost = {
        id: id('post'),
        authorId: author.id,
        videoUrl: input.videoUrl,
        caption: String(input.caption ?? '').trim().slice(0, 2000),
        skill: String(input.skill).trim().slice(0, 200),
        category: category as Exclude<InspoCategory, 'All'>,
        clubTag: (typeof input.clubTag === 'string' ? input.clubTag.trim().slice(0, 120) : '') || club?.name || '',
        hashtags: (Array.isArray(input.hashtags) ? input.hashtags : []).map((item) => String(item).slice(0, 60)).slice(0, 20),
        visibility,
        audienceClubId,
        showAge: Boolean(input.showAge),
        showLevel: Boolean(input.showLevel),
        createdAt: new Date().toISOString(),
      };
      db.posts.unshift(post);
      const followers = db.follows.filter((item) => item.targetUserId === author.id);
      for (const follow of followers) notify(follow.followerId, 'upload', author.id, post.id);
      await save();
      return presentPost(post, author);
    },

    listPosts(viewer: UserRecord | null, category: string, options?: { following?: boolean }) {
      return db.posts
        // An old post saved with no video has nothing to show.
        .filter((post) => Boolean(post.videoUrl) && canSeePost(viewer, post))
        .filter((post) => category === 'All' || !category || post.category === category)
        .filter((post) => {
          if (!options?.following || !viewer) return !options?.following;
          const author = db.users.find((item) => item.id === post.authorId);
          return db.follows.some(
            (item) =>
              item.followerId === viewer.id &&
              (item.targetUserId === post.authorId || (item.targetClubId && item.targetClubId === author?.clubId)),
          );
        })
        .map((post) => presentPost(post, viewer));
    },

    /** Likes the post, or takes the like back if the user already liked it. */
    async like(user: UserRecord, postId: string) {
      const post = db.posts.find((item) => item.id === postId);
      if (!post || !canSeePost(user, post)) throw new Error('NOT_FOUND');
      const index = db.likes.findIndex((item) => item.postId === postId && item.userId === user.id);
      if (index >= 0) {
        db.likes.splice(index, 1);
      } else {
        db.likes.push({ postId, userId: user.id });
        notify(post.authorId, 'like', user.id, postId);
      }
      await save();
      return presentPost(post, user);
    },

    /** Every club with its trial, subscription history and admin contact. Operators only. */
    operatorClubs(operator: UserRecord) {
      if (!isOperator(operator)) throw new Error('FORBIDDEN');
      return db.clubs.map((club) => {
        const admin = db.users.find((item) => item.id === club.adminUserId);
        const paidUntil = clubPaidUntil(club);
        const legacyPaid = admin && admin.status === 'active' && admin.periodEnd && new Date(admin.periodEnd).getTime() > now().getTime() ? admin.periodEnd : null;
        const trialActive = Boolean(club.trialEndsAt && new Date(club.trialEndsAt).getTime() > now().getTime());
        const subscriptionActive = Boolean(paidUntil && new Date(paidUntil).getTime() > now().getTime());
        return {
          id: club.id,
          name: club.name,
          city: club.city,
          adminName: admin?.name ?? '',
          adminEmail: admin?.email ?? '',
          adminPhone: admin?.phone ?? '',
          trialStartedAt: club.trialStartedAt ?? null,
          trialStartInferred: Boolean(club.trialStartInferred),
          trialEndsAt: club.trialEndsAt ?? null,
          paidUntil: paidUntil ?? legacyPaid,
          status: subscriptionActive || legacyPaid ? 'paid' : trialActive ? 'trial' : 'expired',
          approval: club.approvalStatus ?? 'approved',
          rejectionReason: club.rejectionReason ?? null,
          members: db.users.filter((item) => item.role === 'GYMNAST' && (item.clubId === club.id || (!item.clubId && item.selectedClubId === club.id))).length,
          subscriptions: db.clubSubscriptions.filter((item) => item.clubId === club.id).sort((a, b) => b.activatedAt.localeCompare(a.activatedAt)),
        };
      });
    },

    /**
     * Switches a club's subscription on after the operator has checked the bank transfer.
     * Adds a record; earlier records and payments are never changed.
     */
    async activateClubSubscription(operator: UserRecord, clubId: string, input: { months?: number; reference?: string; note?: string }) {
      if (!isOperator(operator)) throw new Error('FORBIDDEN');
      const club = db.clubs.find((item) => item.id === clubId);
      if (!club) throw new Error('NOT_FOUND');
      const months = Number(input.months ?? 1);
      if (!Number.isInteger(months) || months < 1 || months > 12) throw new Error('MONTHS');
      const reference = String(input.reference ?? '').trim();
      if (!reference) throw new Error('REFERENCE_REQUIRED');
      // A renewal starts when the current period ends, so no paid days are lost.
      const current = clubPaidUntil(club);
      const start = Math.max(now().getTime(), current ? new Date(current).getTime() : 0);
      const record: ClubSubscriptionRecord = {
        id: id('sub'),
        clubId,
        startsAt: new Date(start).toISOString(),
        endsAt: new Date(start + months * MONTH_MS).toISOString(),
        months,
        amountNgn: MONTHLY_FEE_NGN * months,
        reference: reference.slice(0, 200),
        note: String(input.note ?? '').trim().slice(0, 1000),
        activatedBy: operator.email,
        activatedAt: now().toISOString(),
      };
      db.clubSubscriptions.push(record);
      await save();
      return record;
    },

    /** One video, for a shared link. Only if the viewer is allowed to see it. */
    postById(viewer: UserRecord | null, postId: string) {
      const post = db.posts.find((item) => item.id === postId);
      if (!post || !canSeePost(viewer, post)) return null;
      return presentPost(post, viewer);
    },

    likedPosts(user: UserRecord) {
      const ids = new Set(db.likes.filter((item) => item.userId === user.id).map((item) => item.postId));
      return db.posts.filter((post) => ids.has(post.id) && canSeePost(user, post)).map((post) => presentPost(post, user));
    },

    /** Videos the user published on Connect, newest first. */
    myPosts(user: UserRecord) {
      return db.posts.filter((post) => post.authorId === user.id).map((post) => presentPost(post, user));
    },

    /** Removes the user's own video from Connect, with its likes, saves, comments and notifications. Returns the upload so the stored file can be deleted too. */
    async deletePost(user: UserRecord, postId: string) {
      const post = db.posts.find((item) => item.id === postId);
      if (!post) throw new Error('NOT_FOUND');
      if (post.authorId !== user.id) throw new Error('FORBIDDEN');
      db.posts = db.posts.filter((item) => item.id !== postId);
      db.likes = db.likes.filter((item) => item.postId !== postId);
      db.saves = db.saves.filter((item) => item.postId !== postId);
      const commentIds = new Set(db.comments.filter((item) => item.postId === postId).map((item) => item.id));
      db.comments = db.comments.filter((item) => item.postId !== postId);
      db.commentReports = db.commentReports.filter((item) => !commentIds.has(item.commentId));
      db.notifications = db.notifications.filter((item) => item.postId !== postId);
      const stillUsed = db.posts.some((item) => item.videoUrl === post.videoUrl) || db.submissions.some((item) => item.videoUrl === post.videoUrl);
      const upload = stillUsed ? null : db.uploads.find((item) => `/api/uploads/${item.id}` === post.videoUrl) ?? null;
      if (upload) db.uploads = db.uploads.filter((item) => item.id !== upload.id);
      await save();
      return upload;
    },

    async comment(user: UserRecord, postId: string, text: string, parentCommentId: string | null) {
      const post = db.posts.find((item) => item.id === postId);
      if (!post || !canSeePost(user, post)) throw new Error('NOT_FOUND');
      if (text.trim().length > MAX_COMMENT) throw new Error('TOO_LONG');
      if (parentCommentId && !db.comments.some((item) => item.id === parentCommentId && item.postId === postId)) throw new Error('PARENT');
      const abusive = /\b(kill yourself|kys|idiot|stupid|hate you|shut up|ugly|dumb)\b/i.test(text);
      const comment: CommentRecord = {
        id: id('cmt'),
        postId,
        authorId: user.id,
        text: text.trim(),
        parentCommentId,
        hidden: abusive,
        createdAt: new Date().toISOString(),
      };
      if (abusive) {
        db.comments.push(comment);
        await save();
        throw new Error('HELD');
      }
      db.comments.push(comment);
      if (parentCommentId) {
        const parent = db.comments.find((item) => item.id === parentCommentId);
        if (parent) notify(parent.authorId, 'reply', user.id, postId);
      } else {
        notify(post.authorId, 'comment', user.id, postId);
      }
      await save();
      return presentPost(post, user);
    },

    async savePost(user: UserRecord, postId: string) {
      const post = db.posts.find((item) => item.id === postId);
      if (!post || !canSeePost(user, post)) throw new Error('NOT_FOUND');
      const index = db.saves.findIndex((item) => item.postId === postId && item.userId === user.id);
      if (index >= 0) db.saves.splice(index, 1);
      else db.saves.push({ postId, userId: user.id });
      await save();
      return presentPost(post, user);
    },

    savedPosts(user: UserRecord) {
      const ids = new Set(db.saves.filter((item) => item.userId === user.id).map((item) => item.postId));
      return db.posts.filter((post) => ids.has(post.id) && canSeePost(user, post)).map((post) => presentPost(post, user));
    },

    async follow(user: UserRecord, target: { userId?: string; clubId?: string }) {
      if (!target.userId && !target.clubId) throw new Error('EMPTY');
      if (target.userId && !db.users.some((item) => item.id === target.userId)) throw new Error('EMPTY');
      if (target.clubId && !db.clubs.some((item) => item.id === target.clubId)) throw new Error('EMPTY');
      const exists = db.follows.some(
        (item) =>
          item.followerId === user.id &&
          item.targetUserId === target.userId &&
          item.targetClubId === target.clubId,
      );
      if (!exists) {
        db.follows.push({ followerId: user.id, targetUserId: target.userId, targetClubId: target.clubId });
        if (target.userId) notify(target.userId, 'follow', user.id, null);
        await save();
      }
      return { ok: true };
    },

    notifications(user: UserRecord) {
      return db.notifications
        .filter((item) => item.userId === user.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async reportComment(user: UserRecord, commentId: string) {
      const comment = db.comments.find((item) => item.id === commentId);
      const post = comment && db.posts.find((item) => item.id === comment.postId);
      if (!comment || !post || !canSeePost(user, post)) throw new Error('NOT_FOUND');
      comment.hidden = true;
      db.commentReports.push({
        id: id('rpt'),
        commentId,
        reporterId: user.id,
        createdAt: new Date().toISOString(),
      });
      await save();
      return { ok: true };
    },

    async blockUser(user: UserRecord, blockedId: string) {
      if (!blockedId || blockedId === user.id) throw new Error('EMPTY');
      if (!db.blocks.some((item) => item.blockerId === user.id && item.blockedId === blockedId)) {
        db.blocks.push({ blockerId: user.id, blockedId });
        await save();
      }
      return { ok: true };
    },
  };
}

export type GymStore = ReturnType<typeof openStore>;
