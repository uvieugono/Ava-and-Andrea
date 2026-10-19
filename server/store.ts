import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { GYM_EVENTS } from '../src/data/gymData.ts';
import { INITIAL_REGISTERED_CLUBS } from '../src/data/gymManagementData.ts';
import {
  createWorkflow,
  type AttendanceRecord,
  type CompetitionRecord,
  type ContactRecord,
  type DocumentRecord,
  type FeeReminderRecord,
  type NoticeRecord,
  type Notifiers,
  type SubmissionRecord,
  type UploadRecord,
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
}

export interface ClubRecord {
  id: string;
  name: string;
  city: string;
  country: string;
  adminUserId: string;
  trialEndsAt?: string | null;
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
const TRIAL_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;

export function openStore(filePath: string, now: () => Date = () => new Date(), notifiers: Notifiers = {}) {
  const db: DatabaseShape = fs.existsSync(filePath)
    ? { ...emptyDb(), ...JSON.parse(fs.readFileSync(filePath, 'utf8')) }
    : emptyDb();
  return createBoundStore(db, async (snapshot) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(snapshot));
  }, now, notifiers);
}

export function createBoundStore(db: DatabaseShape, persist: (snapshot: DatabaseShape) => Promise<void>, now: () => Date = () => new Date(), notifiers: Notifiers = {}) {
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
      periodEnd: accessUntil(user),
      clubTrialEndsAt: clubTrialEnd(user),
      access: accessOpen(user) ? (user.status === 'active' ? 'paid' : 'trial') : 'locked',
      age: user.showAge ? age : null,
      showLevel: user.showLevel,
      under18: age !== null && age < 18,
      parentAccepted: user.parentAccepted,
    };
  }

  async function issueToken(userId: string) {
    const token = randomBytes(24).toString('hex');
    db.tokens.push({ hash: tokenHash(token), userId });
    await save();
    return token;
  }

  function userByToken(token: string | undefined) {
    if (!token) return null;
    const hash = tokenHash(token);
    const row = db.tokens.find((item) => item.hash === hash);
    if (!row) return null;
    return db.users.find((item) => item.id === row.userId) ?? null;
  }

  function paymentView(payment: PaymentRecord) {
    return {
      reference: payment.reference,
      amount: payment.amount,
      status: payment.status,
      studentCount: payment.studentIds.length,
      accountName: 'GymTrack',
      accountNumber: process.env.GYMTRACK_NUBAN || 'Set GYMTRACK_NUBAN to the Spend Management account',
    };
  }

  function paymentFor(user: UserRecord) {
    const payment = db.payments.find((item) => item.status === 'pending' && item.studentIds.includes(user.id));
    return payment ? paymentView(payment) : null;
  }

  function clubFor(user: UserRecord) {
    return user.clubId ? db.clubs.find((item) => item.id === user.clubId) ?? null : null;
  }

  function clubTrialEnd(user: UserRecord) {
    return clubFor(user)?.trialEndsAt ?? null;
  }

  function accessUntil(user: UserRecord) {
    const times = [user.periodEnd, clubTrialEnd(user)]
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value).getTime())
      .filter((value) => !Number.isNaN(value));
    if (times.length === 0) return null;
    return new Date(Math.max(...times)).toISOString();
  }

  function accessOpen(user: UserRecord) {
    const until = accessUntil(user);
    return Boolean(until && new Date(until).getTime() > now().getTime());
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
    await ensureClubTrial(user);
    if (user.periodEnd) return;
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
    students: { name: string; email: string; password: string; phone?: string; level?: number; dateOfBirth?: string; selectedClubId?: string | null }[],
    clubId: string | null,
  ) {
    const created: UserRecord[] = [];
    for (const student of students) {
      const email = student.email.trim().toLowerCase();
      if (db.users.some((item) => item.email === email)) {
        throw new Error(`EMAIL_TAKEN:${email}`);
      }
      const user: UserRecord = {
        id: id('usr'),
        email,
        passwordHash: hashPassword(student.password),
        name: student.name.trim(),
        username: email.split('@')[0],
        phone: student.phone?.trim() || '',
        role: 'GYMNAST',
        dateOfBirth: student.dateOfBirth || null,
        level: student.level ?? 1,
        clubId,
        status: 'trial',
        parentAccepted: false,
        showAge: false,
        showLevel: false,
        periodEnd: null,
        selectedClubId: !clubId && student.selectedClubId && db.clubs.some((item) => item.id === student.selectedClubId) ? student.selectedClubId : null,
      };
      startTrial(user);
      db.users.push(user);
      created.push(user);
    }
    const payment: PaymentRecord = {
      reference: `GT-${randomBytes(3).toString('hex').toUpperCase()}`,
      amount: MONTHLY_FEE_NGN * created.length,
      studentIds: created.map((item) => item.id),
      status: 'pending',
      transferId: null,
      clubId,
    };
    db.payments.push(payment);
    await save();
    return { payment: paymentView(payment), students: created.map(publicUser) };
  }

  function notify(userId: string, kind: NotificationRecord['kind'], fromUserId: string, postId: string | null) {
    if (userId === fromUserId) return;
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

  function canSeePost(viewer: UserRecord | null, post: InspoPost) {
    if (viewer && viewer.id !== post.authorId && isBlocked(viewer.id, post.authorId)) return false;
    if (post.visibility === 'everyone') return true;
    if (!viewer) return false;
    if (viewer.id === post.authorId) return true;
    if (post.visibility === 'club') return viewer.clubId !== null && viewer.clubId === db.users.find((item) => item.id === post.authorId)?.clubId;
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
      age: post.showAge ? age : null,
      level: post.showLevel ? author?.level ?? null : null,
      likes: db.likes.filter((item) => item.postId === post.id).length,
      liked: viewer ? db.likes.some((item) => item.postId === post.id && item.userId === viewer.id) : false,
      saved: viewer ? db.saves.some((item) => item.postId === post.id && item.userId === viewer.id) : false,
      comments: db.comments.filter((item) => item.postId === post.id && !item.hidden).map((item) => ({
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

    async registerClub(input: { clubName: string; city: string; adminName: string; email: string; password: string; phone?: string }) {
      const email = input.email.trim().toLowerCase();
      if (db.users.some((item) => item.email === email)) throw new Error('EMAIL_TAKEN');
      const club: ClubRecord = {
        id: id('club'),
        name: input.clubName.trim(),
        city: input.city.trim(),
        country: 'Nigeria',
        adminUserId: '',
        trialEndsAt: null,
      };
      const admin: UserRecord = {
        id: id('usr'),
        email,
        passwordHash: hashPassword(input.password),
        name: input.adminName.trim(),
        username: email.split('@')[0],
        phone: input.phone?.trim() || '',
        role: 'CLUB_ADMIN',
        dateOfBirth: null,
        level: null,
        clubId: club.id,
        status: 'trial',
        parentAccepted: true,
        showAge: false,
        showLevel: false,
        periodEnd: null,
      };
      startTrial(admin);
      club.adminUserId = admin.id;
      club.trialEndsAt = admin.periodEnd;
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
      return { token: await issueToken(admin.id), user: publicUser(admin), club, payment: paymentView(payment) };
    },

    async signupStudent(input: { name: string; email: string; password: string; phone?: string; level?: number; dateOfBirth?: string; selectedClubId?: string | null }) {
      const created = await createPendingStudents([input], null);
      const record = db.users.find((item) => item.id === created.students[0]?.id);
      if (!record) throw new Error('ERROR');
      return { ...created, token: await issueToken(record.id), user: publicUser(record) };
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

    async allocatePaidStudent(admin: UserRecord, studentId: string) {
      if (admin.role !== 'CLUB_ADMIN' || !admin.clubId) throw new Error('FORBIDDEN');
      const student = db.users.find((item) => item.id === studentId);
      if (!student || student.status !== 'active') throw new Error('NOT_ACTIVE');
      student.clubId = admin.clubId;
      await save();
      return publicUser(student);
    },

    async login(email: string, password: string) {
      const user = db.users.find((item) => item.email === email.trim().toLowerCase());
      if (!user || !verifyPassword(password, user.passwordHash)) throw new Error('INVALID');
      await ensureTrial(user);
      return {
        token: await issueToken(user.id),
        user: publicUser(user),
        payment: paymentFor(user),
      };
    },

    userByToken,
    publicUser,
    paymentFor,
    accessOpen,
    ensureTrial,

    async acceptParent(studentId: string, parentEmail: string) {
      const student = db.users.find((item) => item.id === studentId);
      if (!student) throw new Error('NOT_FOUND');
      student.parentAccepted = true;
      await save();
      return { parentEmail, student: publicUser(student) };
    },

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
      const created = db.clubs.map((club) => ({
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
        showAge?: boolean;
        showLevel?: boolean;
      },
    ) {
      if (!accessOpen(author)) throw new Error('PAYMENT_REQUIRED');
      const age = ageYears(author.dateOfBirth);
      if (age !== null && age < 18 && !author.parentAccepted) throw new Error('PARENT_REQUIRED');
      const category = String(input.category);
      if (!INSPO_CATEGORIES.includes(category as InspoCategory) || category === 'All') throw new Error('CATEGORY');
      if (!input.videoUrl || typeof input.videoUrl !== 'string') throw new Error('VIDEO_REQUIRED');
      const upload = db.uploads.find((item) => `/api/uploads/${item.id}` === input.videoUrl);
      if (!upload || upload.ownerId !== author.id || !upload.mime.startsWith('video/')) throw new Error('VIDEO_INVALID');
      if (!String(input.skill ?? '').trim()) throw new Error('SKILL_REQUIRED');
      const club = author.clubId ? db.clubs.find((item) => item.id === author.clubId) : null;
      const post: InspoPost = {
        id: id('post'),
        authorId: author.id,
        videoUrl: input.videoUrl,
        caption: String(input.caption ?? '').trim(),
        skill: String(input.skill).trim(),
        category: category as Exclude<InspoCategory, 'All'>,
        clubTag: input.clubTag?.trim() || club?.name || '',
        hashtags: input.hashtags ?? [],
        visibility: (['everyone', 'followers', 'club'] as const).includes(input.visibility) ? input.visibility : 'everyone',
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
        .filter((post) => canSeePost(viewer, post))
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

    async like(user: UserRecord, postId: string) {
      const post = db.posts.find((item) => item.id === postId);
      if (!post || !canSeePost(user, post)) throw new Error('NOT_FOUND');
      if (!db.likes.some((item) => item.postId === postId && item.userId === user.id)) {
        db.likes.push({ postId, userId: user.id });
        notify(post.authorId, 'like', user.id, postId);
        await save();
      }
      return presentPost(post, user);
    },

    async comment(user: UserRecord, postId: string, text: string, parentCommentId: string | null) {
      const post = db.posts.find((item) => item.id === postId);
      if (!post || !canSeePost(user, post)) throw new Error('NOT_FOUND');
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
      if (!db.saves.some((item) => item.postId === postId && item.userId === user.id)) {
        db.saves.push({ postId, userId: user.id });
        await save();
      }
      return presentPost(post, user);
    },

    savedPosts(user: UserRecord) {
      const ids = new Set(db.saves.filter((item) => item.userId === user.id).map((item) => item.postId));
      return db.posts.filter((post) => ids.has(post.id)).map((post) => presentPost(post, user));
    },

    async follow(user: UserRecord, target: { userId?: string; clubId?: string }) {
      if (!target.userId && !target.clubId) throw new Error('EMPTY');
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
      if (!comment) throw new Error('NOT_FOUND');
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
