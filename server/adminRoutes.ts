import type { Express, NextFunction, Request, Response } from 'express';
import type { AdminPermission } from './admin.ts';
import type { GymStore, UserRecord } from './store.ts';
import type { Storage } from './storage.ts';
import type { UploadRecord } from './workflow.ts';

type Handler = (req: Request, res: Response) => Promise<void> | void;

/** The Admin area's API. Every route names the permission it needs. */
export function registerAdminRoutes(
  app: Express,
  deps: {
    store: GymStore;
    storage: Storage;
    asyncRoute: (handler: Handler) => (req: Request, res: Response, next: NextFunction) => void;
    fail: (res: Response, error: unknown) => void;
    requireAdmin: (req: Request, res: Response, ...permissions: AdminPermission[]) => Promise<UserRecord | null>;
  },
) {
  const { store, storage, asyncRoute, fail, requireAdmin } = deps;

  function removeFiles(files: (UploadRecord | null | undefined)[]) {
    for (const file of files) {
      if (file) storage.remove(file).catch((error) => console.error('Stored file could not be deleted', error instanceof Error ? error.message : error));
    }
  }

  /** A route that needs a permission, sends what the action returns, and turns refusals into codes. */
  const route = (permissions: AdminPermission | AdminPermission[], action: (actor: UserRecord, req: Request) => unknown, status = 200) =>
    asyncRoute(async (req, res) => {
      const actor = await requireAdmin(req, res, ...(Array.isArray(permissions) ? permissions : [permissions]));
      if (!actor) return;
      try {
        res.status(status).json(await action(actor, req));
      } catch (error) {
        fail(res, error);
      }
    });

  const param = (req: Request, name: string) => String(req.params[name]);

  app.get('/api/admin/dashboard', route([], () => store.adminDashboard()));

  // Users
  app.get('/api/admin/users', route('users', (_actor, req) => ({
    users: store.adminUsers({ q: String(req.query.q ?? ''), role: String(req.query.role ?? ''), state: String(req.query.state ?? '') }),
  })));
  app.patch('/api/admin/users/:id', route('users', (actor, req) => store.adminUpdateUser(actor, param(req, 'id'), req.body ?? {})));
  app.post('/api/admin/users/:id/suspend', route('users', (actor, req) => store.adminSuspendUser(actor, param(req, 'id'), req.body?.reason)));
  app.post('/api/admin/users/:id/restore', route('users', (actor, req) => store.adminRestoreUser(actor, param(req, 'id'))));
  app.delete('/api/admin/users/:id', route('users', async (actor, req) => {
    removeFiles(await store.adminDeleteUser(actor, param(req, 'id')));
    return { ok: true };
  }));

  // Clubs
  app.get('/api/admin/clubs/:id/members', route('clubs', (_actor, req) => ({ members: store.adminClubMembers(param(req, 'id')) })));
  app.delete('/api/admin/clubs/:id', route('clubs', async (actor, req) => {
    const removed = await store.adminDeleteClub(actor, param(req, 'id'), req.body?.confirmName);
    removeFiles(removed.files);
    return { ok: true, staff: removed.staff, gymnastsKept: removed.gymnastsKept };
  }));

  // Moderation
  app.get('/api/admin/moderation', route('moderation', () => store.adminModeration()));
  app.post('/api/admin/posts/:id/remove', route('moderation', async (actor, req) => {
    removeFiles([await store.adminRemovePost(actor, param(req, 'id'), req.body?.reason)]);
    return { ok: true };
  }));
  app.post('/api/admin/posts/:id/keep', route('moderation', (actor, req) => store.adminDismissPostReports(actor, param(req, 'id'))));
  app.post('/api/admin/comments/:id/restore', route('moderation', (actor, req) => store.adminRestoreComment(actor, param(req, 'id'))));
  app.post('/api/admin/comments/:id/remove', route('moderation', (actor, req) => store.adminRemoveComment(actor, param(req, 'id'))));

  // Skills
  app.get('/api/admin/skills', route('skills', () => store.adminSkills()));
  app.post('/api/admin/skills', route('skills', (actor, req) => store.adminSaveSkill(actor, null, req.body ?? {}), 201));
  app.post('/api/admin/skills/order', route('skills', (actor, req) => store.adminOrderSkills(actor, req.body?.ids)));
  app.patch('/api/admin/skills/:id', route('skills', (actor, req) => store.adminSaveSkill(actor, param(req, 'id'), req.body ?? {})));
  app.delete('/api/admin/skills/:id', route('skills', (actor, req) => store.adminRemoveSkill(actor, param(req, 'id'))));
  app.post('/api/admin/skills/:id/restore', route('skills', (actor, req) => store.adminRestoreSkill(actor, param(req, 'id'))));

  // Events
  app.get('/api/admin/events', route('events', () => ({ events: store.adminEvents() })));
  app.post('/api/admin/events', route('events', (actor, req) => store.adminSaveEvent(actor, null, req.body ?? {}), 201));
  app.patch('/api/admin/events/:id', route('events', (actor, req) => store.adminSaveEvent(actor, param(req, 'id'), req.body ?? {})));
  app.delete('/api/admin/events/:id', route('events', (actor, req) => store.adminDeleteEvent(actor, param(req, 'id'))));

  // Communication
  app.get('/api/admin/communication', route('communication', () => store.adminCommunication()));
  app.post('/api/admin/announcements', route('communication', (actor, req) => store.adminPublishAnnouncement(actor, req.body ?? {}), 201));
  app.delete('/api/admin/announcements/:id', route('communication', (actor, req) => store.adminDeleteAnnouncement(actor, param(req, 'id'))));

  // Reports
  app.get('/api/admin/reports', route('reports', () => store.adminReports()));

  // Settings and administrators
  app.patch('/api/admin/settings', route('settings', (actor, req) => store.adminUpdateSettings(actor, req.body ?? {})));
  app.get('/api/admin/admins', route('settings', () => ({ admins: store.adminList(), activity: store.adminActivity() })));
  app.post('/api/admin/admins', route('settings', (actor, req) => store.adminAddAdmin(actor, req.body ?? {}), 201));
  app.patch('/api/admin/admins/:id', route('settings', (actor, req) => store.adminSetPermissions(actor, param(req, 'id'), req.body?.permissions)));
  app.delete('/api/admin/admins/:id', route('settings', (actor, req) => store.adminRemoveAdmin(actor, param(req, 'id'))));
}
