import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomBytes } from 'crypto';
import { GymStore, INSPO_CATEGORIES, openStore } from './store.ts';
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

const STATUS_BY_CODE: Record<string, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  ALREADY_APPROVED: 409,
  ALREADY_PENDING: 409,
  ALREADY_REVIEWED: 409,
  DUPLICATE: 409,
};

function fail(res: Response, error: unknown, fallback = 400) {
  const code = error instanceof Error ? error.message : 'ERROR';
  res.status(STATUS_BY_CODE[code] ?? fallback).json({ code });
}

export async function createApp(options?: { dbPath?: string; databaseUrl?: string; webhookSecret?: string; devMatch?: boolean; now?: () => Date; notifiers?: Notifiers; uploadDir?: string; storage?: Storage }) {
  const dbPath = options?.dbPath || process.env.GYMTRACK_DB || path.join(process.cwd(), 'data', 'gymtrack.json');
  const databaseUrl = options?.databaseUrl ?? (options?.dbPath ? undefined : process.env.DATABASE_URL);
  const now = options?.now ?? (() => new Date());
  const notifiers = options?.notifiers ?? defaultNotifiers();
  const uploadDir = options?.uploadDir || process.env.GYMTRACK_UPLOADS || path.join(path.dirname(dbPath), 'uploads');
  const storage = options?.storage ?? defaultStorage(uploadDir);
  const store = databaseUrl ? await openPostgresStore(databaseUrl, now, notifiers) : openStore(dbPath, now, notifiers);
  const webhookSecret = options?.webhookSecret ?? process.env.GYMTRACK_WEBHOOK_SECRET ?? 'dev-webhook-secret';
  const devMatch = options?.devMatch ?? (process.env.GYMTRACK_DEV_MATCH !== '0' && process.env.NODE_ENV !== 'production');
  const app = express();
  app.use(express.json({ limit: '8mb' }));

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
    const { clubName, city, adminName, email, password, phone } = req.body ?? {};
    if (!clubName || !city || !adminName || !email || !password) {
      res.status(400).json({ code: 'MISSING' });
      return;
    }
    try {
      res.status(201).json(await store.registerClub({ clubName, city, adminName, email, password, phone }));
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      res.status(message === 'EMAIL_TAKEN' ? 409 : 400).json({ code: message || 'ERROR' });
    }
  }));

  app.post('/api/auth/signup-student', asyncRoute(async (req, res) => {
    const { name, email, password, phone, level, dateOfBirth, selectedClubId } = req.body ?? {};
    if (!name || !email || !password || !dateOfBirth || !String(phone ?? '').trim()) {
      res.status(400).json({ code: 'MISSING' });
      return;
    }
    try {
      const result = await store.signupStudent({ name, email, password, phone, level, dateOfBirth, selectedClubId });
      res.status(201).json({ ...result, devMatch });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      res.status(message.startsWith('EMAIL_TAKEN') ? 409 : 400).json({ code: message || 'ERROR' });
    }
  }));

  app.post('/api/auth/login', asyncRoute(async (req, res) => {
    try {
      res.json(await store.login(req.body?.email ?? '', req.body?.password ?? ''));
    } catch (error) {
      const payment = (error as { payment?: unknown }).payment;
      const message = error instanceof Error ? error.message : '';
      if (message === 'PAYMENT_REQUIRED') {
        res.status(403).json({ code: 'PAYMENT_REQUIRED', payment });
        return;
      }
      res.status(401).json({ code: 'INVALID' });
    }
  }));

  app.get('/api/me', asyncRoute(async (req, res) => {
    const user = await requireAccount(req, res);
    if (!user) return;
    res.json({ user: store.publicUser(user), payment: store.paymentFor(user) });
  }));

  app.post('/api/clubs/students', asyncRoute(async (req, res) => {
    const admin = await requirePaid(req, res);
    if (!admin) return;
    try {
      const result = await store.signupClubStudents(admin, req.body?.students ?? []);
      res.status(201).json({ ...result, devMatch });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const status = message === 'FORBIDDEN' ? 403 : message.startsWith('EMAIL_TAKEN') ? 409 : 400;
      res.status(status).json({ code: message || 'ERROR' });
    }
  }));

  app.post('/api/clubs/allocate', asyncRoute(async (req, res) => {
    const admin = await requirePaid(req, res);
    if (!admin) return;
    try {
      res.json({ student: await store.allocatePaidStudent(admin, req.body?.studentId) });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      res.status(message === 'FORBIDDEN' ? 403 : 400).json({ code: message || 'ERROR' });
    }
  }));

  app.post('/api/payments/webhook', asyncRoute(async (req, res) => {
    if (req.header('x-gymtrack-webhook-secret') !== webhookSecret) {
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

  app.post('/api/students/:id/parent', asyncRoute(async (req, res) => {
    try {
      res.json(await store.acceptParent(req.params.id, req.body?.parentEmail ?? ''));
    } catch {
      res.status(404).json({ code: 'NOT_FOUND' });
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
      res.status(message === 'PARENT_REQUIRED' || message === 'PAYMENT_REQUIRED' ? 403 : 400).json({ code: message || 'ERROR' });
    }
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
    return user;
  }

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

  app.post('/api/club/notices', asyncRoute(async (req, res) => {
    const staff = await requireStaffAccount(req, res);
    if (!staff) return;
    try {
      res.status(201).json({ notice: await store.publishNotice(staff, req.body ?? {}) });
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
  const contactHits = new Map<string, number[]>();
  app.post('/api/contact', asyncRoute(async (req, res) => {
    const key = req.ip || 'unknown';
    const cutoff = now().getTime() - 10 * 60 * 1000;
    const recent = (contactHits.get(key) ?? []).filter((time) => time > cutoff);
    if (recent.length >= 5) {
      res.status(429).json({ code: 'TOO_MANY' });
      return;
    }
    recent.push(now().getTime());
    contactHits.set(key, recent);
    try {
      const result = await store.submitContact(req.body ?? {});
      res.status(201).json({ ok: true, emailed: result.emailed, forwarded: result.forwarded });
    } catch (error) {
      fail(res, error);
    }
  }));

  // ---- Uploads ----
  app.post('/api/uploads', express.raw({ type: () => true, limit: MAX_VIDEO_BYTES }), asyncRoute(async (req, res) => {
    const user = await requirePaid(req, res);
    if (!user) return;
    const mime = String(req.header('content-type') || '').split(';')[0].trim().toLowerCase();
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ code: 'EMPTY_FILE' });
      return;
    }
    const isVideo = VIDEO_MIME.has(mime);
    const isDocument = mime in DOCUMENT_MIME;
    if (!isVideo && !isDocument) {
      res.status(415).json({ code: 'FILE_TYPE' });
      return;
    }
    if (isDocument && !(user.role === 'CLUB_ADMIN' || user.role === 'COACH')) {
      res.status(403).json({ code: 'FORBIDDEN' });
      return;
    }
    if (isDocument && body.length > MAX_DOCUMENT_BYTES) {
      res.status(413).json({ code: 'FILE_TOO_LARGE' });
      return;
    }
    const scope = isVideo && req.query.scope === 'public' ? 'public' : 'private';
    // A child's public video needs a parent's OK first. Stop before storing anything.
    if (scope === 'public') {
      const view = store.publicUser(user);
      if (view.under18 && !view.parentAccepted) {
        res.status(403).json({ code: 'PARENT_REQUIRED' });
        return;
      }
    }
    const fileName = `${randomBytes(12).toString('hex')}${isVideo ? VIDEO_EXT[mime] : DOCUMENT_MIME[mime]}`;
    const displayName = String(req.query.name ?? 'upload').slice(0, 200);
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
    const token = bearer(req) || (typeof req.query.token === 'string' ? req.query.token : undefined);
    const viewer = await store.userByToken(token);
    if (!store.canReadUpload(viewer, upload)) {
      res.status(upload.scope === 'private' && !viewer ? 401 : 403).json({ code: 'FORBIDDEN' });
      return;
    }
    res.setHeader('content-type', upload.mime);
    res.setHeader('cache-control', upload.scope === 'public' ? 'public, max-age=3600' : 'private, no-store');
    res.setHeader('content-disposition', `inline; filename="${upload.name.replace(/[^\w.\- ]/g, '_')}"`);
    await storage.send(upload, req, res);
  }));

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if ((error as { status?: number })?.status === 413) {
      res.status(413).json({ code: 'FILE_TOO_LARGE' });
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
