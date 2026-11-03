import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomBytes } from 'crypto';
import { GymStore, INSPO_CATEGORIES, openStore } from './store.ts';
import { REMOVED_CLUB_IDS } from './dataCleanups.ts';
import { openPostgresStore } from './postgres.ts';
import { defaultNotifiers } from './notifiers.ts';
import { defaultStorage, StorageError, type Storage } from './storage.ts';
import type { Notifiers } from './workflow.ts';

interface AuthedRequest extends Request {
  gymUser?: ReturnType<GymStore['userByToken']>;
}

function bearer(req: Request) {
  const header = req.header('authorization') || '';
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : undefined;
}

function asyncRoute(handler: (req: AuthedRequest, res: Response) => Promise<void> | void) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req as AuthedRequest, res)).catch(next);
  };
}

const VIDEO_MIME = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp', 'video/x-m4v']);
const DOCUMENT_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
};
const VIDEO_EXT: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'video/3gpp': '.3gp',
  'video/x-m4v': '.m4v',
};
export const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
/** Each piece of a large upload; well under Cloud Run's 32 MB request limit, and a multiple of 256 KB as Drive requires. */
export const UPLOAD_PIECE_BYTES = 8 * 1024 * 1024;

const EXT_MIME: Record<string, string> = { mp4: 'video/mp4', m4v: 'video/x-m4v', mov: 'video/quicktime', webm: 'video/webm', '3gp': 'video/3gpp' };

/** The file type, falling back to the file name when the browser sends none or a generic one. */
function fileMime(raw: string, name: string) {
  const mime = raw.split(';')[0].trim().toLowerCase();
  if (mime && mime !== 'application/octet-stream') return mime;
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME[ext] ?? mime;
}

const STATUS_BY_CODE: Record<string, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  ALREADY_APPROVED: 409,
  ALREADY_PENDING: 409,
  ALREADY_REVIEWED: 409,
  NOT_PENDING: 409,
  NOT_APPROVED: 409,
  DUPLICATE: 409,
  ALREADY_SENT: 409,
  EMAIL_TAKEN: 409,
  CLUB_NOT_APPROVED: 403,
  WRONG_PASSWORD: 403,
};

/** Our own codes pass through. Anything else is an internal message and stays on the server. */
function safeCode(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  return /^[A-Z][A-Z_]+(:\S*)?$/.test(message) ? message : 'ERROR';
}

function fail(res: Response, error: unknown, fallback = 400) {
  const code = safeCode(error);
  res.status(STATUS_BY_CODE[code] ?? fallback).json({ code });
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'SAMEORIGIN');
  res.setHeader('referrer-policy', 'same-origin');
  next();
}

/** Counts events per key within a time window. Forgets everything if it ever grows very large. */
function counter(limit: number, windowMs: number, now: () => Date) {
  const hits = new Map<string, number[]>();
  const recent = (key: string) => (hits.get(key) ?? []).filter((time) => time > now().getTime() - windowMs);
  return {
    full: (key: string) => recent(key).length >= limit,
    add(key: string) {
      if (hits.size > 20000) hits.clear();
      hits.set(key, [...recent(key), now().getTime()]);
    },
    clear: (key: string) => hits.delete(key),
  };
}

export async function createApp(options?: { dbPath?: string; databaseUrl?: string; webhookSecret?: string; devMatch?: boolean; now?: () => Date; notifiers?: Notifiers; uploadDir?: string; storage?: Storage; clubApproval?: boolean; removeClubIds?: string[] }) {
  const dbPath = options?.dbPath || process.env.GYMTRACK_DB || path.join(process.cwd(), 'data', 'gymtrack.json');
  const databaseUrl = options?.databaseUrl ?? (options?.dbPath ? undefined : process.env.DATABASE_URL);
  const now = options?.now ?? (() => new Date());
  const notifiers = options?.notifiers ?? defaultNotifiers();
  const uploadDir = options?.uploadDir || process.env.GYMTRACK_UPLOADS || path.join(path.dirname(dbPath), 'uploads');
  const storage = options?.storage ?? defaultStorage(uploadDir);
  const storeOptions = { clubApproval: options?.clubApproval };
  const store = databaseUrl ? await openPostgresStore(databaseUrl, now, notifiers, storeOptions) : openStore(dbPath, now, notifiers, storeOptions);
  const removed = await store.removeClubs(options?.removeClubIds ?? REMOVED_CLUB_IDS);
  if (removed.clubs > 0) {
    console.log(`Removed ${removed.clubs} clubs, ${removed.staff} staff accounts and ${removed.files.length} files. ${removed.gymnastsKept} gymnasts kept their accounts.`);
    for (const file of removed.files) {
      storage.remove(file).catch((error) => console.error('Stored file could not be deleted', error instanceof Error ? error.message : error));
    }
  }
  const webhookSecret = options?.webhookSecret ?? process.env.GYMTRACK_WEBHOOK_SECRET ?? (process.env.NODE_ENV === 'production' ? '' : 'dev-webhook-secret');
  const devMatch = options?.devMatch ?? (process.env.GYMTRACK_DEV_MATCH !== '0' && process.env.NODE_ENV !== 'production');
  const app = express();
  app.disable('x-powered-by');
  // One proxy (Google's front end) sits in front of the app, and it adds the visitor's address.
  app.set('trust proxy', 1);
  app.use(securityHeaders);
  app.use(express.json({ limit: '8mb' }));

  const failedLogins = counter(10, 15 * 60 * 1000, now);
  const registrations = counter(60, 60 * 60 * 1000, now);
  const contactHits = counter(5, 10 * 60 * 1000, now);
  const resetByAddress = counter(10, 60 * 60 * 1000, now);
  const resetByAccount = counter(3, 60 * 60 * 1000, now);

  function refuseRegistration(req: Request, res: Response) {
    const key = req.ip || 'unknown';
    if (registrations.full(key)) {
      res.status(429).json({ code: 'TOO_MANY' });
      return true;
    }
    registrations.add(key);
    return false;
  }

  // An enquiry SolyntaFlow or the mailbox could not take stays saved, and is tried again until it goes.
  if (notifiers.enquiry || notifiers.mail) {
    setInterval(() => {
      store.resendContacts().catch((error) => console.error('Enquiries could not be sent again', error instanceof Error ? error.message : error));
    }, 10 * 60 * 1000).unref();
  }

  async function requireAccount(req: AuthedRequest, res: Response) {
    const user = await store.userByToken(bearer(req));
    if (!user) {
      res.status(401).json({ code: 'UNAUTHORIZED' });
      return null;
    }
    await store.ensureTrial(user);
    return user;
  }

  async function requirePaid(req: AuthedRequest, res: Response) {
    const user = await requireAccount(req, res);
    if (!user) return null;
    if (store.clubWaiting(user)) {
      res.status(403).json({ code: 'CLUB_NOT_APPROVED' });
      return null;
    }
    if (!store.accessOpen(user)) {
      res.status(403).json({ code: 'PAYMENT_REQUIRED', payment: store.paymentFor(user) });
      return null;
    }
    return user;
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, database: databaseUrl ? 'postgres' : 'file' });
  });

  app.post('/api/auth/register-club', asyncRoute(async (req, res) => {
    const { clubName, city, adminName, email, password, phone, acceptedPrivacy } = req.body ?? {};
    if (!clubName || !city || !adminName || !email || !password) {
      res.status(400).json({ code: 'MISSING' });
      return;
    }
    if (refuseRegistration(req, res)) return;
    try {
      res.status(201).json(await store.registerClub({ clubName, city, adminName, email, password, phone, acceptedPrivacy }));
    } catch (error) {
      const code = safeCode(error);
      res.status(code === 'EMAIL_TAKEN' ? 409 : 400).json({ code });
    }
  }));

  app.post('/api/auth/signup-student', asyncRoute(async (req, res) => {
    const { name, email, password, phone, level, dateOfBirth, selectedClubId, acceptedPrivacy } = req.body ?? {};
    if (!name || !email || !password || !dateOfBirth || !String(phone ?? '').trim()) {
      res.status(400).json({ code: 'MISSING' });
      return;
    }
    if (refuseRegistration(req, res)) return;
    try {
      const result = await store.signupStudent({ name, email, password, phone, level, dateOfBirth, selectedClubId, acceptedPrivacy });
      res.status(201).json({ ...result, devMatch });
    } catch (error) {
      const code = safeCode(error);
      res.status(code.startsWith('EMAIL_TAKEN') ? 409 : 400).json({ code });
    }
  }));

  app.post('/api/auth/login', asyncRoute(async (req, res) => {
    // Per address and account, so one person's mistakes never lock out their club's shared Wi-Fi.
    const key = `${req.ip}|${String(req.body?.email ?? '').trim().toLowerCase()}`;
    if (failedLogins.full(key)) {
      res.status(429).json({ code: 'TOO_MANY' });
      return;
    }
    try {
      const session = await store.login(req.body?.email ?? '', req.body?.password ?? '');
      failedLogins.clear(key);
      res.json(session);
    } catch (error) {
      const payment = (error as { payment?: unknown }).payment;
      const message = error instanceof Error ? error.message : '';
      if (message === 'PAYMENT_REQUIRED') {
        res.status(403).json({ code: 'PAYMENT_REQUIRED', payment });
        return;
      }
      failedLogins.add(key);
      res.status(401).json({ code: 'INVALID' });
    }
  }));

  // Same answer whether or not the account exists, and the sending is not waited for,
  // so this cannot be used to find out who has an account.
  app.post('/api/auth/forgot-password', asyncRoute(async (req, res) => {
    const emailOn = Boolean(notifiers.resetEmail);
    const address = String(req.body?.email ?? '').trim().toLowerCase();
    const ip = req.ip || 'unknown';
    if (!address || resetByAddress.full(ip)) {
      res.status(address ? 429 : 400).json({ code: address ? 'TOO_MANY' : 'MISSING' });
      return;
    }
    resetByAddress.add(ip);
    res.json({ ok: true, emailed: emailOn });
    if (resetByAccount.full(address)) return;
    resetByAccount.add(address);
    const started = await store.startPasswordReset(address);
    if (!started) return;
    const send = notifiers.resetEmail
      ? notifiers.resetEmail({ to: started.user.email, name: started.user.name, token: started.token })
      : notifiers.enquiry?.({ name: started.user.name, phone: started.user.phone, message: `Password reset requested for ${started.user.email}. Check it is really them, then make a link on the operator page.` });
    Promise.resolve(send).catch((error) => console.error('Password reset could not be sent', error instanceof Error ? error.message : error));
  }));

  app.post('/api/auth/reset-password', asyncRoute(async (req, res) => {
    try {
      res.json(await store.finishPasswordReset(req.body?.token, req.body?.password));
    } catch (error) {
      fail(res, error);
    }
  }));

  app.post('/api/me/password', asyncRoute(async (req, res) => {
    const user = await requireAccount(req, res);
    if (!user) return;
    try {
      res.json(await store.changePassword(user, bearer(req) as string, req.body?.current, req.body?.next));
    } catch (error) {
      fail(res, error);
    }
  }));

  app.post('/api/auth/logout', asyncRoute(async (req, res) => {
    const token = bearer(req);
    if (token && store.userByToken(token)) await store.revokeToken(token);
    res.json({ ok: true });
  }));

  app.get('/api/me', asyncRoute(async (req, res) => {
    const user = await requireAccount(req, res);
    if (!user) return;
    res.json({ user: store.publicUser(user), payment: store.paymentFor(user), mediaToken: store.mediaTokenOf(bearer(req) as string) });
  }));

  app.post('/api/clubs/students', asyncRoute(async (req, res) => {
    const admin = await requirePaid(req, res);
    if (!admin) return;
    try {
      const result = await store.signupClubStudents(admin, req.body?.students ?? []);
      res.status(201).json({ ...result, devMatch });
    } catch (error) {
      const code = safeCode(error);
      const status = code === 'FORBIDDEN' ? 403 : code.startsWith('EMAIL_TAKEN') ? 409 : 400;
      res.status(status).json({ code });
    }
  }));

  app.post('/api/payments/webhook', asyncRoute(async (req, res) => {
    if (!webhookSecret || req.header('x-gymtrack-webhook-secret') !== webhookSecret) {
      res.status(401).json({ code: 'UNAUTHORIZED' });
      return;
    }
    const { reference, amount, transferId } = req.body ?? {};
    try {
      res.json(await store.matchPayment(reference, Number(amount), transferId));
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      res.status(message === 'NOT_FOUND' ? 404 : 400).json({ code: message || 'ERROR' });
    }
  }));

  app.post('/api/payments/dev-match', asyncRoute(async (req, res) => {
    if (!devMatch) {
      res.status(404).json({ code: 'NOT_FOUND' });
      return;
    }
    const { reference, amount } = req.body ?? {};
    try {
      res.json(await store.matchPayment(reference, Number(amount), `dev-${reference}`));
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      res.status(400).json({ code: message || 'ERROR' });
    }
  }));

  app.get('/api/events', asyncRoute(async (req, res) => {
    res.json(await store.events(String(req.query.q ?? '')));
  }));

  app.get('/api/clubs', asyncRoute(async (req, res) => {
    const lat = req.query.lat === undefined ? undefined : Number(req.query.lat);
    const lng = req.query.lng === undefined ? undefined : Number(req.query.lng);
    res.json({
      clubs: await store.clubs({
        q: String(req.query.q ?? ''),
        accountsOnly: req.query.accounts === '1',
        lat: Number.isFinite(lat) ? lat : undefined,
        lng: Number.isFinite(lng) ? lng : undefined,
      }),
    });
  }));

  app.get('/api/inspo/categories', (_req, res) => {
    res.json({ categories: INSPO_CATEGORIES });
  });

  app.get('/api/inspo', asyncRoute(async (req, res) => {
    const viewer = await store.userByToken(bearer(req));
    res.json({
      posts: await store.listPosts(viewer, String(req.query.category ?? 'All'), { following: req.query.following === '1' }),
    });
  }));

  app.post('/api/inspo', asyncRoute(async (req, res) => {
    const user = await requirePaid(req, res);
    if (!user) return;
    try {
      res.status(201).json({ post: await store.createPost(user, req.body ?? {}) });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      res.status(message === 'PAYMENT_REQUIRED' ? 403 : 400).json({ code: message || 'ERROR' });
    }
  }));

  app.delete('/api/inspo/:id', asyncRoute(async (req, res) => {
    const user = await requireAccount(req, res);
    if (!user) return;
    let upload;
    try {
      upload = await store.deletePost(user, req.params.id);
    } catch (error) {
      fail(res, error);
      return;
    }
    if (upload) {
      await storage.remove(upload).catch((error) => console.error('Deleted video could not be removed from storage', error instanceof Error ? error.message : error));
    }
    res.json({ ok: true });
  }));

  app.get('/api/inspo/post/:id', asyncRoute(async (req, res) => {
    const viewer = await store.userByToken(bearer(req));
    const post = store.postById(viewer, req.params.id);
    if (!post) {
      res.status(404).json({ code: 'NOT_FOUND' });
      return;
    }
    res.json({ post });
  }));

  app.get('/api/inspo/liked', asyncRoute(async (req, res) => {
    const user = await requireAccount(req, res);
    if (!user) return;
    res.json({ posts: store.likedPosts(user) });
  }));

  app.get('/api/inspo/mine', asyncRoute(async (req, res) => {
    const user = await requireAccount(req, res);
    if (!user) return;
    res.json({ posts: store.myPosts(user) });
  }));

  app.post('/api/inspo/:id/like', asyncRoute(async (req, res) => {
    const user = await requirePaid(req, res);
    if (!user) return;
    try {
      res.json({ post: await store.like(user, req.params.id) });
    } catch {
      res.status(404).json({ code: 'NOT_FOUND' });
    }
  }));

  app.post('/api/inspo/:id/comments', asyncRoute(async (req, res) => {
    const user = await requirePaid(req, res);
    if (!user) return;
    if (!req.body?.text?.trim()) {
      res.status(400).json({ code: 'MISSING' });
      return;
    }
    try {
      res.status(201).json({ post: await store.comment(user, req.params.id, req.body.text, req.body.parentCommentId ?? null) });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message === 'HELD') {
        res.status(422).json({ code: 'HELD' });
        return;
      }
      if (message === 'TOO_LONG' || message === 'PARENT') {
        res.status(400).json({ code: message });
        return;
      }
      res.status(404).json({ code: 'NOT_FOUND' });
    }
  }));

  app.post('/api/inspo/:id/save', asyncRoute(async (req, res) => {
    const user = await requirePaid(req, res);
    if (!user) return;
    try {
      res.json({ post: await store.savePost(user, req.params.id) });
    } catch {
      res.status(404).json({ code: 'NOT_FOUND' });
    }
  }));

  app.get('/api/inspo/saved', asyncRoute(async (req, res) => {
    const user = await requirePaid(req, res);
    if (!user) return;
    res.json({ posts: await store.savedPosts(user) });
  }));

  app.post('/api/follows', asyncRoute(async (req, res) => {
    const user = await requirePaid(req, res);
    if (!user) return;
    try {
      res.status(201).json(await store.follow(user, { userId: req.body?.userId, clubId: req.body?.clubId }));
    } catch {
      res.status(400).json({ code: 'EMPTY' });
    }
  }));

  app.post('/api/comments/:id/report', asyncRoute(async (req, res) => {
    const user = await requirePaid(req, res);
    if (!user) return;
    try {
      res.json(await store.reportComment(user, req.params.id));
    } catch {
      res.status(404).json({ code: 'NOT_FOUND' });
    }
  }));

  app.post('/api/blocks', asyncRoute(async (req, res) => {
    const user = await requirePaid(req, res);
    if (!user) return;
    try {
      res.status(201).json(await store.blockUser(user, String(req.body?.userId ?? '')));
    } catch {
      res.status(400).json({ code: 'EMPTY' });
    }
  }));

  app.get('/api/notifications', asyncRoute(async (req, res) => {
    const user = await requirePaid(req, res);
    if (!user) return;
    res.json({ notifications: await store.notifications(user) });
  }));

  // ---- Profile ----
  app.patch('/api/me', asyncRoute(async (req, res) => {
    const user = await requireAccount(req, res);
    if (!user) return;
    try {
      await store.updateProfile(user, req.body ?? {});
      res.json({ user: store.publicUser(user), payment: store.paymentFor(user) });
    } catch (error) {
      fail(res, error);
    }
  }));

  // ---- Skills: submit, statuses ----
  app.get('/api/me/skills', asyncRoute(async (req, res) => {
    const user = await requireAccount(req, res);
    if (!user) return;
    res.json({
      level: user.level,
      statuses: store.statusesFor(user.id),
      progress: user.role === 'GYMNAST' ? store.progressFor(user) : null,
      submissions: store.mySubmissions(user),
    });
  }));

  app.post('/api/skills/:skillId/submit', asyncRoute(async (req, res) => {
    const user = await requirePaid(req, res);
    if (!user) return;
    try {
      const submission = await store.submitSkill(user, { skillId: req.params.skillId, videoUrl: String(req.body?.videoUrl ?? ''), videoName: req.body?.videoName });
      res.status(201).json({ submission, statuses: store.statusesFor(user.id), progress: store.progressFor(user) });
    } catch (error) {
      fail(res, error);
    }
  }));

  // ---- Club office (staff only) ----
  async function requireStaffAccount(req: AuthedRequest, res: Response) {
    const user = await requireAccount(req, res);
    if (!user) return null;
    if (!(user.role === 'CLUB_ADMIN' || user.role === 'COACH') || !user.clubId) {
      res.status(403).json({ code: 'FORBIDDEN' });
      return null;
    }
    if (store.clubWaiting(user)) {
      res.status(403).json({ code: 'CLUB_NOT_APPROVED' });
      return null;
    }
    // After the club's free week, club features need an active subscription.
    if (!store.accessOpen(user)) {
      res.status(403).json({ code: 'PAYMENT_REQUIRED' });
      return null;
    }
    return user;
  }

  async function requireOperator(req: AuthedRequest, res: Response) {
    const user = await requireAccount(req, res);
    if (!user) return null;
    if (!store.publicUser(user).operator) {
      res.status(403).json({ code: 'FORBIDDEN' });
      return null;
    }
    return user;
  }

  app.get('/api/operator/clubs', asyncRoute(async (req, res) => {
    const operator = await requireOperator(req, res);
    if (!operator) return;
    res.json({ clubs: store.operatorClubs(operator) });
  }));

  app.post('/api/operator/clubs/:id/activate', asyncRoute(async (req, res) => {
    const operator = await requireOperator(req, res);
    if (!operator) return;
    try {
      res.status(201).json({ subscription: await store.activateClubSubscription(operator, req.params.id, req.body ?? {}) });
    } catch (error) {
      fail(res, error);
    }
  }));

  app.post('/api/operator/clubs/:id/approve', asyncRoute(async (req, res) => {
    const operator = await requireOperator(req, res);
    if (!operator) return;
    try {
      res.json({ club: await store.approveClub(operator, req.params.id) });
    } catch (error) {
      fail(res, error);
    }
  }));

  app.post('/api/operator/clubs/:id/reject', asyncRoute(async (req, res) => {
    const operator = await requireOperator(req, res);
    if (!operator) return;
    try {
      res.json({ club: await store.rejectClub(operator, req.params.id, req.body?.reason) });
    } catch (error) {
      fail(res, error);
    }
  }));

  app.post('/api/operator/password-reset', asyncRoute(async (req, res) => {
    const operator = await requireOperator(req, res);
    if (!operator) return;
    try {
      res.status(201).json(await store.operatorPasswordReset(operator, req.body?.email));
    } catch (error) {
      fail(res, error);
    }
  }));

  app.delete('/api/skills/submissions/:id', asyncRoute(async (req, res) => {
    const user = await requireAccount(req, res);
    if (!user) return;
    let upload;
    try {
      upload = await store.withdrawSubmission(user, req.params.id);
    } catch (error) {
      fail(res, error);
      return;
    }
    if (upload) {
      await storage.remove(upload).catch((error) => console.error('Withdrawn skill video could not be deleted', error instanceof Error ? error.message : error));
    }
    res.json({ ok: true, statuses: store.statusesFor(user.id), progress: store.progressFor(user) });
  }));

  app.post('/api/club/submissions/:id/remove-approval', asyncRoute(async (req, res) => {
    const staff = await requireStaffAccount(req, res);
    if (!staff) return;
    try {
      res.json({ submission: await store.removeApproval(staff, req.params.id) });
    } catch (error) {
      fail(res, error);
    }
  }));

  app.get('/api/club/overview', asyncRoute(async (req, res) => {
    const staff = await requireStaffAccount(req, res);
    if (!staff) return;
    res.json(store.clubOverview(staff));
  }));

  app.post('/api/club/submissions/:id/review', asyncRoute(async (req, res) => {
    const staff = await requireStaffAccount(req, res);
    if (!staff) return;
    try {
      res.json(await store.reviewSubmission(staff, req.params.id, req.body?.decision, String(req.body?.comment ?? '')));
    } catch (error) {
      fail(res, error);
    }
  }));

  app.post('/api/club/coaches', asyncRoute(async (req, res) => {
    const staff = await requireStaffAccount(req, res);
    if (!staff) return;
    try {
      res.status(201).json({ coach: await store.addCoach(staff, req.body ?? {}) });
    } catch (error) {
      fail(res, error);
    }
  }));

  app.delete('/api/club/coaches/:id', asyncRoute(async (req, res) => {
    const staff = await requireStaffAccount(req, res);
    if (!staff) return;
    try {
      res.json(await store.removeCoach(staff, req.params.id));
    } catch (error) {
      fail(res, error);
    }
  }));

  app.post('/api/club/notices', asyncRoute(async (req, res) => {
    const staff = await requireStaffAccount(req, res);
    if (!staff) return;
    try {
      res.status(201).json({ notice: await store.publishNotice(staff, req.body ?? {}) });
    } catch (error) {
      fail(res, error);
    }
  }));

  app.delete('/api/club/notices/:id', asyncRoute(async (req, res) => {
    const staff = await requireStaffAccount(req, res);
    if (!staff) return;
    try {
      res.json(await store.deleteNotice(staff, req.params.id));
    } catch (error) {
      fail(res, error);
    }
  }));

  app.patch('/api/club/details', asyncRoute(async (req, res) => {
    const staff = await requireStaffAccount(req, res);
    if (!staff) return;
    try {
      res.json({ club: await store.updateClubDetails(staff, req.body ?? {}) });
    } catch (error) {
      fail(res, error);
    }
  }));

  app.post('/api/club/certificates', asyncRoute(async (req, res) => {
    const staff = await requireStaffAccount(req, res);
    if (!staff) return;
    try {
      res.status(201).json({ certificate: await store.addCertificate(staff, req.body ?? {}) });
    } catch (error) {
      fail(res, error);
    }
  }));

  app.get('/api/certificates', asyncRoute(async (req, res) => {
    const user = await requireAccount(req, res);
    if (!user) return;
    res.json({ certificates: store.certificatesFor(user) });
  }));

  app.post('/api/club/drills', asyncRoute(async (req, res) => {
    const staff = await requireStaffAccount(req, res);
    if (!staff) return;
    try {
      res.status(201).json({ drill: await store.addDrill(staff, req.body ?? {}) });
    } catch (error) {
      fail(res, error);
    }
  }));

  app.get('/api/drills', asyncRoute(async (req, res) => {
    const user = await requireAccount(req, res);
    if (!user) return;
    res.json({ drills: store.drillsFor(user) });
  }));

  app.post('/api/club/competition-events', asyncRoute(async (req, res) => {
    const staff = await requireStaffAccount(req, res);
    if (!staff) return;
    try {
      res.status(201).json({ competitions: await store.addCompetitionEvent(staff, req.body ?? {}) });
    } catch (error) {
      fail(res, error);
    }
  }));

  app.post('/api/club/competition-events/:id/results', asyncRoute(async (req, res) => {
    const staff = await requireStaffAccount(req, res);
    if (!staff) return;
    try {
      res.json({ competitions: await store.recordCompetitionResults(staff, req.params.id, Array.isArray(req.body?.results) ? req.body.results : []) });
    } catch (error) {
      fail(res, error);
    }
  }));

  app.get('/api/notices', asyncRoute(async (req, res) => {
    const user = await requireAccount(req, res);
    if (!user) return;
    res.json({ notices: store.noticesFor(user) });
  }));

  app.post('/api/club/competitions', asyncRoute(async (req, res) => {
    const staff = await requireStaffAccount(req, res);
    if (!staff) return;
    try {
      res.status(201).json({ competition: await store.addCompetition(staff, req.body ?? {}) });
    } catch (error) {
      fail(res, error);
    }
  }));

  app.get('/api/competitions', asyncRoute(async (req, res) => {
    const user = await requireAccount(req, res);
    if (!user) return;
    res.json({ competitions: store.competitionsFor(user, req.query.gymnastId ? String(req.query.gymnastId) : undefined) });
  }));

  app.post('/api/club/documents', asyncRoute(async (req, res) => {
    const staff = await requireStaffAccount(req, res);
    if (!staff) return;
    try {
      res.status(201).json({ document: await store.addDocument(staff, { name: String(req.body?.name ?? ''), uploadId: String(req.body?.uploadId ?? '') }) });
    } catch (error) {
      fail(res, error);
    }
  }));

  app.delete('/api/club/documents/:id', asyncRoute(async (req, res) => {
    const staff = await requireStaffAccount(req, res);
    if (!staff) return;
    let upload;
    try {
      upload = await store.deleteDocument(staff, req.params.id);
    } catch (error) {
      fail(res, error);
      return;
    }
    // The record is gone either way; a Drive hiccup only leaves an orphaned file behind.
    if (upload) {
      await storage.remove(upload).catch((error) => console.error('Stored document could not be deleted', error instanceof Error ? error.message : error));
    }
    res.json({ ok: true });
  }));

  app.post('/api/club/attendance', asyncRoute(async (req, res) => {
    const staff = await requireStaffAccount(req, res);
    if (!staff) return;
    try {
      res.json(await store.markAttendance(staff, String(req.body?.gymnastId ?? ''), String(req.body?.date ?? ''), Boolean(req.body?.present)));
    } catch (error) {
      fail(res, error);
    }
  }));

  app.post('/api/club/fee-reminders', asyncRoute(async (req, res) => {
    const staff = await requireStaffAccount(req, res);
    if (!staff) return;
    try {
      res.status(201).json({ reminder: await store.sendFeeReminder(staff, { gymnastId: String(req.body?.gymnastId ?? ''), message: String(req.body?.message ?? '') }) });
    } catch (error) {
      fail(res, error);
    }
  }));

  // ---- Contact form (public) ----
  app.post('/api/contact', asyncRoute(async (req, res) => {
    const key = req.ip || 'unknown';
    if (contactHits.full(key)) {
      res.status(429).json({ code: 'TOO_MANY' });
      return;
    }
    contactHits.add(key);
    try {
      const result = await store.submitContact(req.body ?? {});
      res.status(201).json({ ok: true, emailed: result.emailed, forwarded: result.forwarded });
    } catch (error) {
      fail(res, error);
    }
  }));

  // ---- Uploads ----
  /** Checks a file before it is stored. Sends the refusal and returns null when it is not allowed. */
  function checkUpload(user: NonNullable<Awaited<ReturnType<typeof requirePaid>>>, req: Request, res: Response, rawMime: string, size: number) {
    const displayName = String(req.query.name ?? 'upload').slice(0, 200);
    const mime = fileMime(rawMime, displayName);
    if (!size) {
      res.status(400).json({ code: 'EMPTY_FILE' });
      return null;
    }
    const isVideo = VIDEO_MIME.has(mime);
    const isDocument = mime in DOCUMENT_MIME;
    if (!isVideo && !isDocument) {
      res.status(415).json({ code: 'FILE_TYPE' });
      return null;
    }
    if (isDocument && !(user.role === 'CLUB_ADMIN' || user.role === 'COACH')) {
      res.status(403).json({ code: 'FORBIDDEN' });
      return null;
    }
    if (size > (isDocument ? MAX_DOCUMENT_BYTES : MAX_VIDEO_BYTES)) {
      res.status(413).json({ code: 'FILE_TOO_LARGE' });
      return null;
    }
    const scope: 'public' | 'private' = isVideo && req.query.scope === 'public' ? 'public' : 'private';
    const fileName = `${randomBytes(12).toString('hex')}${isVideo ? VIDEO_EXT[mime] : DOCUMENT_MIME[mime]}`;
    return { mime, scope, fileName, displayName };
  }

  // Cloud Run refuses any request over 32 MB, so a large video comes in pieces:
  // start a session, then send each piece in order. The session is kept in the
  // database so whichever server instance gets the next piece can carry on.
  app.post('/api/uploads/sessions', asyncRoute(async (req, res) => {
    const user = await requirePaid(req, res);
    if (!user) return;
    const size = Number(req.query.size);
    if (!Number.isInteger(size) || size < 0) {
      res.status(400).json({ code: 'SIZE' });
      return;
    }
    const checked = checkUpload(user, req, res, String(req.header('x-upload-content-type') || ''), size);
    if (!checked) return;
    let session: string;
    try {
      session = await storage.begin(checked.mime, checked.displayName, size, checked.fileName);
    } catch (error) {
      const code = error instanceof StorageError ? error.code : 'STORAGE_FAILED';
      console.error('Upload could not be started', error instanceof Error ? error.message : error);
      res.status(502).json({ code });
      return;
    }
    const record = await store.startUploadSession({
      ownerId: user.id,
      clubId: user.clubId ?? user.selectedClubId ?? null,
      scope: checked.scope,
      mime: checked.mime,
      name: checked.displayName,
      size,
      session,
    });
    res.status(201).json({ id: record.id, pieceSize: UPLOAD_PIECE_BYTES });
  }));

  app.put('/api/uploads/sessions/:id', express.raw({ type: () => true, limit: UPLOAD_PIECE_BYTES + 1024 }), asyncRoute(async (req, res) => {
    const user = await requireAccount(req, res);
    if (!user) return;
    const session = store.uploadSessionById(req.params.id);
    if (!session || session.ownerId !== user.id) {
      res.status(404).json({ code: 'NOT_FOUND' });
      return;
    }
    const piece = req.body as Buffer;
    const offset = Number(req.query.offset);
    // A repeated or out-of-order piece is refused with how much has arrived, so the page can carry on from there.
    if (offset !== session.received) {
      res.status(409).json({ code: 'OFFSET', received: session.received });
      return;
    }
    if (!Buffer.isBuffer(piece) || piece.length === 0 || offset + piece.length > session.size) {
      res.status(400).json({ code: 'PIECE' });
      return;
    }
    let stored;
    try {
      stored = await storage.append(session.session, piece, offset, session.size);
    } catch (error) {
      const code = error instanceof StorageError ? error.code : 'STORAGE_FAILED';
      console.error('Upload piece could not be stored', error instanceof Error ? error.message : error);
      res.status(502).json({ code });
      return;
    }
    if (!stored) {
      await store.recordUploadProgress(session, offset + piece.length);
      res.json({ received: session.received });
      return;
    }
    const record = await store.finishUploadSession(session, stored);
    res.status(201).json({ id: record.id, url: `/api/uploads/${record.id}`, size: record.size, mime: record.mime });
  }));

  app.post('/api/uploads', express.raw({ type: () => true, limit: MAX_VIDEO_BYTES }), asyncRoute(async (req, res) => {
    const user = await requirePaid(req, res);
    if (!user) return;
    const body = req.body as Buffer;
    const checked = checkUpload(user, req, res, String(req.header('content-type') || ''), Buffer.isBuffer(body) ? body.length : 0);
    if (!checked) return;
    const { mime, scope, fileName, displayName } = checked;
    let stored;
    try {
      stored = await storage.put(body, mime, displayName, fileName);
    } catch (error) {
      const code = error instanceof StorageError ? error.code : 'STORAGE_FAILED';
      console.error('Upload could not be stored', error instanceof Error ? error.message : error);
      res.status(502).json({ code });
      return;
    }
    const record = await store.saveUpload({
      ownerId: user.id,
      clubId: user.clubId ?? user.selectedClubId ?? null,
      scope,
      mime,
      name: displayName,
      size: body.length,
      ...stored,
    });
    res.status(201).json({ id: record.id, url: `/api/uploads/${record.id}`, size: record.size, mime: record.mime });
  }));

  app.get('/api/uploads/:id', asyncRoute(async (req, res) => {
    const upload = store.uploadById(req.params.id);
    if (!upload) {
      res.status(404).json({ code: 'NOT_FOUND' });
      return;
    }
    // A <video> or link cannot send a header, so it carries the files-only key instead.
    const viewer = bearer(req) ? store.userByToken(bearer(req)) : store.userByMediaToken(typeof req.query.token === 'string' ? req.query.token : undefined);
    if (!store.canReadUpload(viewer, upload)) {
      res.status(!viewer ? 401 : 403).json({ code: 'FORBIDDEN' });
      return;
    }
    res.setHeader('content-type', upload.mime);
    res.setHeader('cache-control', upload.scope === 'public' ? 'public, max-age=3600' : 'private, no-store');
    res.setHeader('content-disposition', `inline; filename="${upload.name.replace(/[^\w.\- ]/g, '_')}"`);
    await storage.send(upload, req, res);
  }));

  app.use('/api', (_req, res) => {
    res.status(404).json({ code: 'NOT_FOUND' });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = (error as { status?: number })?.status;
    if (status === 413) {
      res.status(413).json({ code: 'FILE_TOO_LARGE' });
      return;
    }
    if (status && status >= 400 && status < 500) {
      res.status(status).json({ code: 'BAD_REQUEST' });
      return;
    }
    console.error(error);
    res.status(500).json({ code: 'ERROR' });
  });

  return app;
}

export function tempDbPath(name: string) {
  return path.join(os.tmpdir(), `gymtrack-${name}-${Date.now()}.json`);
}
