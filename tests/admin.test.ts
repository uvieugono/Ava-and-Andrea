import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test, { after } from 'node:test';
import { createApp } from '../server/createApp.ts';

const PASSWORD = 'correct-horse';
const OWNER = 'owner@gym.test';
process.env.GYMTRACK_OPERATOR_EMAILS = OWNER;

const servers: { close(): unknown; closeAllConnections(): void }[] = [];
after(() => {
  for (const server of servers) {
    server.close();
    server.closeAllConnections();
  }
});

let counter = 0;

async function start(options: { dbPath?: string; now?: () => Date } = {}) {
  const app = await createApp({
    dbPath: options.dbPath ?? `data/test-admin-${Date.now()}-${Math.random()}.json`,
    webhookSecret: 'test-secret',
    devMatch: false,
    notifiers: {},
    now: options.now,
  });
  const server = app.listen(0);
  servers.push(server);
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  async function call(method: string, url: string, token?: string | null, body?: unknown) {
    const response = await fetch(base + url, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: response.status, body: json };
  }

  const nextEmail = (prefix: string) => `${prefix}${(counter += 1)}@gym.test`;
  const login = async (email: string, password = PASSWORD) => call('POST', '/api/auth/login', null, { email, password });
  const owner = async () => {
    const signedIn = await login(OWNER);
    if (signedIn.status === 200) return signedIn.body.token as string;
    const made = await call('POST', '/api/auth/signup-student', null, { name: 'Owner', email: OWNER, password: PASSWORD, phone: '08030000009', dateOfBirth: '1990-01-01', acceptedPrivacy: true });
    assert.equal(made.status, 201);
    return made.body.token as string;
  };
  const club = async (name = 'Good Club') => {
    const email = nextEmail('club');
    const made = await call('POST', '/api/auth/register-club', null, { clubName: name, city: 'Lagos', adminName: 'Ada Admin', email, password: PASSWORD, phone: '08030000000', acceptedPrivacy: true });
    assert.equal(made.status, 201);
    assert.equal((await call('POST', `/api/operator/clubs/${made.body.user.clubId}/approve`, await owner())).status, 200);
    return { ...made.body, email } as any;
  };
  const gymnast = async (selectedClubId: string | null = null) => {
    const email = nextEmail('gym');
    const made = await call('POST', '/api/auth/signup-student', null, { name: 'Zainab', email, password: PASSWORD, phone: '08031234567', dateOfBirth: '2012-05-05', selectedClubId, acceptedPrivacy: true });
    assert.equal(made.status, 201);
    return { ...made.body, email } as any;
  };
  /** A limited administrator with their own login. */
  const admin = async (permissions: string[]) => {
    const email = nextEmail('admin');
    const made = await call('POST', '/api/admin/admins', await owner(), { email, name: 'Helper', password: PASSWORD, permissions });
    assert.equal(made.status, 201);
    const signedIn = await login(email);
    assert.equal(signedIn.status, 200);
    return { email, id: made.body.userId as string, token: signedIn.body.token as string };
  };
  const post = async (token: string) => {
    const video = await fetch(`${base}/api/uploads?scope=public&name=clip.mp4`, { method: 'POST', headers: { 'content-type': 'video/mp4', authorization: `Bearer ${token}` }, body: Buffer.from('x') }).then((r) => r.json()) as { url: string };
    const made = await call('POST', '/api/inspo', token, { videoUrl: video.url, skill: 'Bridge', category: 'Floor', visibility: 'everyone' });
    assert.equal(made.status, 201);
    return made.body.post as { id: string };
  };
  return { base, call, login, owner, club, gymnast, admin, post };
}

const ADMIN_READS = ['/api/admin/dashboard', '/api/admin/users', '/api/admin/moderation', '/api/admin/skills', '/api/admin/events', '/api/admin/communication', '/api/admin/reports', '/api/admin/admins', '/api/operator/clubs'];

test('admin pages refuse anyone who is not an administrator', async () => {
  const app = await start();
  const child = await app.gymnast();
  const staff = await app.club();
  for (const path of ADMIN_READS) {
    assert.equal((await app.call('GET', path, null)).status, 401, path);
    assert.equal((await app.call('GET', path, child.token)).status, 403, path);
    assert.equal((await app.call('GET', path, staff.token)).status, 403, path);
  }
  assert.equal((await app.call('PATCH', '/api/admin/settings', child.token, { monthlyFeeNgn: 1 })).status, 403);
  // Nothing in a person's own account lets them become an administrator.
  assert.equal((await app.call('PATCH', '/api/me', child.token, { role: 'ADMIN', operator: true })).body.user?.operator ?? false, false);
});

test('the owner opens every page, and sees the real totals on the dashboard', async () => {
  const app = await start();
  const owner = await app.owner();
  const staff = await app.club();
  await app.gymnast(staff.user.clubId);
  const pending = await app.call('POST', '/api/auth/register-club', null, { clubName: 'Waiting', city: 'Lagos', adminName: 'Bo', email: 'wait@gym.test', password: PASSWORD, phone: '08030000000', acceptedPrivacy: true });
  assert.equal(pending.status, 201);
  for (const path of ADMIN_READS) assert.equal((await app.call('GET', path, owner)).status, 200, path);
  const dashboard = (await app.call('GET', '/api/admin/dashboard', owner)).body;
  assert.equal(dashboard.clubs.total, 2);
  assert.equal(dashboard.clubs.waiting, 1);
  assert.equal(dashboard.clubs.approved, 1);
  assert.equal(dashboard.users.gymnasts, 2, 'the owner signed up as a gymnast, plus one child');
  assert.equal(dashboard.users.clubAdmins, 2);
  assert.ok(dashboard.recentRegistrations.length >= 3);
});

test('an administrator can do only what they were given', async () => {
  const app = await start();
  const helper = await app.admin(['users']);
  const me = (await app.call('GET', '/api/me', helper.token)).body.user;
  assert.equal(me.role, 'ADMIN');
  assert.equal(me.operator, true);
  assert.equal(me.adminOwner, false);
  assert.deepEqual(me.adminPermissions, ['users']);

  assert.equal((await app.call('GET', '/api/admin/dashboard', helper.token)).status, 200);
  assert.equal((await app.call('GET', '/api/admin/users', helper.token)).status, 200);
  for (const path of ['/api/admin/reports', '/api/admin/moderation', '/api/admin/admins', '/api/operator/clubs']) {
    assert.equal((await app.call('GET', path, helper.token)).status, 403, path);
  }
  // Giving more access is for owners, even with the settings permission.
  const settings = await app.admin(['settings']);
  assert.equal((await app.call('GET', '/api/admin/admins', settings.token)).status, 200);
  assert.equal((await app.call('POST', '/api/admin/admins', settings.token, { email: 'x@gym.test', name: 'X', password: PASSWORD, permissions: ['users'] })).status, 403);
  assert.equal((await app.call('PATCH', `/api/admin/admins/${settings.id}`, settings.token, { permissions: ['users', 'settings'] })).status, 403);

  const owner = await app.owner();
  assert.equal((await app.call('PATCH', `/api/admin/admins/${helper.id}`, owner, { permissions: ['reports'] })).status, 200);
  assert.equal((await app.call('GET', '/api/admin/users', helper.token)).status, 403);
  assert.equal((await app.call('GET', '/api/admin/reports', helper.token)).status, 200);

  // Removing an admin-only account ends it.
  assert.equal((await app.call('DELETE', `/api/admin/admins/${helper.id}`, owner)).status, 200);
  assert.equal((await app.call('GET', '/api/admin/reports', helper.token)).status, 401);
  assert.equal((await app.login(helper.email)).status, 401);
});

test('granting a gymnast admin access keeps their account when it is taken away', async () => {
  const app = await start();
  const owner = await app.owner();
  const child = await app.gymnast();
  assert.equal((await app.call('POST', '/api/admin/admins', owner, { email: child.email, permissions: ['reports'] })).status, 201);
  assert.equal((await app.call('GET', '/api/admin/reports', child.token)).status, 200);
  assert.equal((await app.call('DELETE', `/api/admin/admins/${child.user.id}`, owner)).status, 200);
  assert.equal((await app.call('GET', '/api/admin/reports', child.token)).status, 403);
  assert.equal((await app.login(child.email)).status, 200);
});

test('a limited administrator cannot touch an owner or another administrator', async () => {
  const app = await start();
  const owner = await app.owner();
  const ownerId = (await app.call('GET', '/api/me', owner)).body.user.id;
  const helper = await app.admin(['users']);
  const other = await app.admin(['reports']);
  for (const target of [ownerId, other.id]) {
    assert.equal((await app.call('POST', `/api/admin/users/${target}/suspend`, helper.token, { reason: 'no' })).status, 403);
    assert.equal((await app.call('DELETE', `/api/admin/users/${target}`, helper.token)).status, 403);
    assert.equal((await app.call('PATCH', `/api/admin/users/${target}`, helper.token, { name: 'Taken' })).status, 403);
  }
  assert.equal((await app.call('POST', '/api/operator/password-reset', helper.token, { email: OWNER })).status, 403);
  // Changing an owner's email would change who is an owner.
  assert.equal((await app.call('PATCH', `/api/admin/users/${ownerId}`, owner, { email: 'someone@gym.test' })).status, 403);
  assert.equal((await app.call('POST', `/api/admin/users/${ownerId}/suspend`, owner, { reason: 'self' })).body.code, 'SELF');
});

test('suspending ends the sign-in and says why it is refused; restoring brings it back', async () => {
  const app = await start();
  const owner = await app.owner();
  const child = await app.gymnast();
  assert.equal((await app.call('POST', `/api/admin/users/${child.user.id}/suspend`, owner, {})).body.code, 'REASON_REQUIRED');
  const suspended = await app.call('POST', `/api/admin/users/${child.user.id}/suspend`, owner, { reason: 'Rude comments' });
  assert.equal(suspended.status, 200);
  assert.equal(suspended.body.state, 'suspended');
  assert.equal((await app.call('GET', '/api/me', child.token)).status, 401);
  const refused = await app.login(child.email);
  assert.equal(refused.status, 403);
  assert.equal(refused.body.code, 'SUSPENDED');
  assert.equal((await app.call('POST', '/api/auth/forgot-password', null, { email: child.email })).status, 200, 'the answer does not reveal the account');

  assert.equal((await app.call('POST', `/api/admin/users/${child.user.id}/restore`, owner)).body.state, 'active');
  assert.equal((await app.login(child.email)).status, 200);
  assert.equal((await app.call('POST', `/api/admin/users/${child.user.id}/restore`, owner)).body.code, 'NOT_SUSPENDED');
});

test('editing an account checks what it is given, and the list can be searched', async () => {
  const app = await start();
  const owner = await app.owner();
  const child = await app.gymnast();
  const other = await app.gymnast();
  const edited = await app.call('PATCH', `/api/admin/users/${child.user.id}`, owner, { name: 'Zainab Bello', level: 3, phone: '08035550000' });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.name, 'Zainab Bello');
  assert.equal(edited.body.level, 3);
  assert.equal((await app.call('PATCH', `/api/admin/users/${child.user.id}`, owner, { email: other.email })).body.code, 'EMAIL_TAKEN');
  assert.equal((await app.call('PATCH', `/api/admin/users/${child.user.id}`, owner, { phone: '12' })).body.code, 'PHONE_INVALID');
  const found = (await app.call('GET', '/api/admin/users?q=bello', owner)).body.users;
  assert.deepEqual(found.map((row: { id: string }) => row.id), [child.user.id]);
  assert.equal((await app.call('GET', '/api/admin/users?role=COACH', owner)).body.users.length, 0);
});

test('deleting a gymnast removes them; a club administrator goes only with the club', async () => {
  const app = await start();
  const owner = await app.owner();
  const staff = await app.club('Closing Gym');
  const child = await app.gymnast(staff.user.clubId);
  assert.equal((await app.call('DELETE', `/api/admin/users/${staff.user.id}`, owner)).body.code, 'IS_CLUB_ADMIN');

  // The club's name has to be typed exactly.
  assert.equal((await app.call('DELETE', `/api/admin/clubs/${staff.user.clubId}`, owner, { confirmName: 'closing gym' })).body.code, 'CONFIRM_NAME');
  const members = (await app.call('GET', `/api/admin/clubs/${staff.user.clubId}/members`, owner)).body.members;
  assert.ok(members.some((row: { id: string }) => row.id === child.user.id));
  const removed = await app.call('DELETE', `/api/admin/clubs/${staff.user.clubId}`, owner, { confirmName: 'Closing Gym' });
  assert.equal(removed.status, 200);
  assert.equal(removed.body.staff, 1);
  assert.equal((await app.login(staff.email)).status, 401);
  assert.equal((await app.login(child.email)).status, 200, 'gymnasts keep their accounts');

  assert.equal((await app.call('DELETE', `/api/admin/users/${child.user.id}`, owner)).status, 200);
  assert.equal((await app.login(child.email)).status, 401);
});

test('a reported video reaches moderation, and removing it tells the author', async () => {
  const app = await start();
  const owner = await app.owner();
  const author = await app.gymnast();
  const reader = await app.gymnast();
  const video = await app.post(author.token);
  assert.equal((await app.call('POST', `/api/inspo/${video.id}/report`, reader.token, { reason: 'Not gymnastics' })).status, 200);
  assert.equal((await app.call('POST', `/api/inspo/${video.id}/report`, reader.token, { reason: 'Again' })).status, 200);
  let queue = (await app.call('GET', '/api/admin/moderation', owner)).body;
  assert.equal(queue.reported.length, 1);
  assert.equal(queue.reported[0].reports.length, 1, 'one report per person');
  assert.equal(queue.reported[0].reports[0].reason, 'Not gymnastics');

  // Someone with moderation access can open the reported video to judge it.
  const moderator = await app.admin(['moderation']);
  assert.equal((await fetch(app.base + queue.reported[0].videoUrl, { headers: { authorization: `Bearer ${moderator.token}` } })).status, 200);

  assert.equal((await app.call('POST', `/api/admin/posts/${video.id}/keep`, moderator.token)).status, 200);
  queue = (await app.call('GET', '/api/admin/moderation', owner)).body;
  assert.equal(queue.reported.length, 0);

  assert.equal((await app.call('POST', `/api/admin/posts/${video.id}/remove`, moderator.token, {})).body.code, 'REASON_REQUIRED');
  assert.equal((await app.call('POST', `/api/admin/posts/${video.id}/remove`, moderator.token, { reason: 'Unsafe' })).status, 200);
  assert.equal((await app.call('GET', `/api/inspo/post/${video.id}`, reader.token)).status, 404);
  const notes = (await app.call('GET', '/api/notifications', author.token)).body.notifications;
  assert.ok(notes.some((item: { kind: string }) => item.kind === 'moderation'));
});

test('reported comments are held for a decision and can be put back or removed', async () => {
  const app = await start();
  const owner = await app.owner();
  const author = await app.gymnast();
  const reader = await app.gymnast();
  const video = await app.post(author.token);
  const made = (await app.call('POST', `/api/inspo/${video.id}/comments`, reader.token, { text: 'Good one' })).body.post;
  const commentId = made.comments[0].id;
  assert.equal((await app.call('POST', `/api/comments/${commentId}/report`, author.token)).status, 200);
  const queue = (await app.call('GET', '/api/admin/moderation', owner)).body;
  assert.equal(queue.comments.length, 1);
  assert.equal((await app.call('POST', `/api/admin/comments/${commentId}/restore`, owner)).status, 200);
  assert.equal((await app.call('GET', '/api/admin/moderation', owner)).body.comments.length, 0);
  assert.equal((await app.call('POST', `/api/admin/comments/${commentId}/remove`, owner)).status, 200);
  assert.equal((await app.call('POST', `/api/admin/comments/${commentId}/remove`, owner)).status, 404);
});

test('skills can be added, changed, reordered, removed and put back, and gymnasts follow the list', async () => {
  const app = await start();
  const owner = await app.owner();
  const child = await app.gymnast();
  assert.equal(child.user.level, 1);
  const before = (await app.call('GET', '/api/me/skills', child.token)).body.progress;

  const bad = await app.call('POST', '/api/admin/skills', owner, { name: 'Bad link', level: 1, category: 'FLOOR', video: 'https://example.com/clip' });
  assert.equal(bad.body.code, 'VIDEO_LINK');
  const added = await app.call('POST', '/api/admin/skills', owner, { name: 'Shoulder roll', level: 1, category: 'FLOOR', video: 'https://youtu.be/dQw4w9WgXcQ', description: 'Roll over one shoulder.' });
  assert.equal(added.status, 201);
  assert.equal(added.body.videoId, 'dQw4w9WgXcQ');
  assert.equal(added.body.custom, true);

  // The new skill now counts towards the level, and a gymnast can send a video of it.
  const after1 = (await app.call('GET', '/api/me/skills', child.token)).body.progress;
  assert.equal(after1.required, before.required + 1);
  const edits = (await app.call('GET', '/api/skills/catalogue', child.token)).body.edits;
  assert.equal(edits.added[0].name, 'Shoulder roll');

  // A built-in skill can be renamed and have its video removed.
  const skills = (await app.call('GET', '/api/admin/skills', owner)).body.skills;
  const builtIn = skills.find((row: { custom: boolean; level: number }) => !row.custom && row.level === 1);
  const renamed = await app.call('PATCH', `/api/admin/skills/${builtIn.id}`, owner, { name: 'New name', video: '' });
  assert.equal(renamed.body.name, 'New name');
  assert.equal(renamed.body.videoId, null);

  const ids = skills.filter((row: { level: number }) => row.level === 1).map((row: { id: string }) => row.id).reverse();
  assert.equal((await app.call('POST', '/api/admin/skills/order', owner, { ids })).status, 200);
  const ordered = (await app.call('GET', '/api/admin/skills', owner)).body.skills.filter((row: { level: number }) => row.level === 1).map((row: { id: string }) => row.id);
  assert.deepEqual(ordered, ids);
  assert.equal((await app.call('POST', '/api/admin/skills/order', owner, { ids: ['not-a-skill'] })).status, 404);

  assert.equal((await app.call('DELETE', `/api/admin/skills/${added.body.id}`, owner)).status, 200);
  assert.equal((await app.call('GET', '/api/me/skills', child.token)).body.progress.required, before.required);
  const removed = (await app.call('GET', '/api/admin/skills', owner)).body.removed;
  assert.deepEqual(removed.map((row: { id: string }) => row.id), [added.body.id]);
  assert.equal((await app.call('POST', `/api/admin/skills/${added.body.id}/restore`, owner)).status, 200);
  assert.equal((await app.call('GET', '/api/me/skills', child.token)).body.progress.required, before.required + 1);
});

test('events: a draft stays private until published, and GymFest is there from the start', async () => {
  const clock = new Date('2026-11-05T10:00:00Z');
  const app = await start({ now: () => clock });
  const owner = await app.owner();
  const first = (await app.call('GET', '/api/platform-events')).body.events;
  assert.deepEqual(first.map((item: { name: string }) => item.name), ['GymFest 3.0']);

  const draft = await app.call('POST', '/api/admin/events', owner, { name: 'Lagos Open', date: '2026-12-12', venue: 'Teslim Balogun', status: 'draft' });
  assert.equal(draft.status, 201);
  assert.equal((await app.call('GET', '/api/platform-events')).body.events.length, 1);
  const published = await app.call('PATCH', `/api/admin/events/${draft.body.id}`, owner, { ...draft.body, status: 'published' });
  assert.equal(published.status, 200);
  assert.deepEqual((await app.call('GET', '/api/platform-events')).body.events.map((item: { name: string }) => item.name), ['GymFest 3.0', 'Lagos Open']);

  assert.equal((await app.call('POST', '/api/admin/events', owner, { name: 'No date' })).body.code, 'DATE');
  assert.equal((await app.call('POST', '/api/admin/events', owner, { name: 'Bad link', date: '2026-12-12', website: 'javascript:alert(1)' })).body.code, 'LINK_INVALID');
  assert.equal((await app.call('POST', '/api/admin/events', owner, { name: 'Backwards', date: '2026-12-12', endDate: '2026-12-01' })).body.code, 'END_DATE');
  assert.equal((await app.call('DELETE', `/api/admin/events/${draft.body.id}`, owner)).status, 200);
  assert.equal((await app.call('GET', '/api/platform-events')).body.events.length, 1);
});

test('announcements reach only the people they are addressed to', async () => {
  const app = await start();
  const owner = await app.owner();
  const staffA = await app.club('Club A');
  const staffB = await app.club('Club B');
  const inA = await app.gymnast(staffA.user.clubId);
  const free = await app.gymnast();
  const titles = async (token: string) => (await app.call('GET', '/api/notices', token)).body.notices.map((item: { title: string }) => item.title);

  await app.call('POST', '/api/admin/announcements', owner, { title: 'All', body: 'x', audience: 'everyone' });
  await app.call('POST', '/api/admin/announcements', owner, { title: 'Gymnasts', body: 'x', audience: 'gymnasts' });
  await app.call('POST', '/api/admin/announcements', owner, { title: 'Clubs', body: 'x', audience: 'clubs' });
  await app.call('POST', '/api/admin/announcements', owner, { title: 'Only A', body: 'x', audience: 'club', clubId: staffA.user.clubId });
  assert.equal((await app.call('POST', '/api/admin/announcements', owner, { title: 'Nowhere', body: 'x', audience: 'club' })).body.code, 'CLUB_REQUIRED');
  assert.equal((await app.call('POST', '/api/admin/announcements', owner, { title: '', body: 'x', audience: 'everyone' })).body.code, 'MISSING');

  assert.deepEqual((await titles(free.token)).sort(), ['All', 'Gymnasts']);
  assert.deepEqual((await titles(inA.token)).sort(), ['All', 'Gymnasts', 'Only A']);
  assert.deepEqual((await titles(staffA.token)).sort(), ['All', 'Clubs', 'Only A']);
  assert.deepEqual((await titles(staffB.token)).sort(), ['All', 'Clubs']);

  // A club cannot delete something GymTrack sent.
  const sent = (await app.call('GET', '/api/admin/communication', owner)).body.announcements;
  const all = sent.find((item: { title: string }) => item.title === 'All');
  assert.equal((await app.call('DELETE', `/api/club/notices/${all.id}`, staffA.token)).status, 404);
  assert.equal((await app.call('DELETE', `/api/admin/announcements/${all.id}`, owner)).status, 200);
  assert.deepEqual((await titles(free.token)).sort(), ['Gymnasts']);
});

test('settings really change what the site does', async () => {
  const app = await start();
  const owner = await app.owner();
  assert.equal((await app.call('GET', '/api/settings/public')).body.monthlyFeeNgn, 1000);

  await app.call('PATCH', '/api/admin/settings', owner, { gymnastSignupsOpen: false, clubSignupsOpen: false, connectUploadsOpen: false });
  const gymnastRefused = await app.call('POST', '/api/auth/signup-student', null, { name: 'New', email: 'new@gym.test', password: PASSWORD, phone: '08031234567', dateOfBirth: '2012-05-05', acceptedPrivacy: true });
  assert.equal(gymnastRefused.body.code, 'SIGNUPS_CLOSED');
  const clubRefused = await app.call('POST', '/api/auth/register-club', null, { clubName: 'Late', city: 'Lagos', adminName: 'Bo', email: 'late@gym.test', password: PASSWORD, phone: '08030000000', acceptedPrivacy: true });
  assert.equal(clubRefused.body.code, 'SIGNUPS_CLOSED');
  assert.equal((await app.call('POST', '/api/inspo', owner, { videoUrl: '/api/uploads/none', skill: 'Bridge', category: 'Floor', visibility: 'everyone' })).body.code, 'CONNECT_CLOSED');

  await app.call('PATCH', '/api/admin/settings', owner, { gymnastSignupsOpen: true, clubSignupsOpen: true, connectUploadsOpen: true, monthlyFeeNgn: 2500, trialDays: 14 });
  const staff = await app.club('Dear Club');
  const row = (await app.call('GET', '/api/operator/clubs', owner)).body.clubs.find((item: { id: string }) => item.id === staff.user.clubId);
  assert.equal(Math.round((new Date(row.trialEndsAt).getTime() - new Date(row.trialStartedAt).getTime()) / 86400000), 14);
  const paid = await app.call('POST', `/api/operator/clubs/${staff.user.clubId}/activate`, owner, { months: 2, reference: 'TRF1' });
  assert.equal(paid.body.subscription.amountNgn, 5000);

  assert.equal((await app.call('PATCH', '/api/admin/settings', owner, { monthlyFeeNgn: -1 })).body.code, 'FEE');
  assert.equal((await app.call('PATCH', '/api/admin/settings', owner, { trialDays: 400 })).body.code, 'TRIAL_DAYS');
});

test('every administrator action is written down, and reports add up', async () => {
  const app = await start();
  const owner = await app.owner();
  const child = await app.gymnast();
  await app.call('PATCH', `/api/admin/users/${child.user.id}`, owner, { name: 'Renamed' });
  await app.post(child.token);
  const log = (await app.call('GET', '/api/admin/admins', owner)).body.activity;
  assert.equal(log[0].by, OWNER);
  assert.match(log[0].action, /Edited name/);
  assert.equal(log[0].target, child.email);

  // The club and password actions are in the same log.
  const staff = await app.club('Logged Club');
  await app.call('POST', `/api/operator/clubs/${staff.user.clubId}/activate`, owner, { months: 1, reference: 'TRF9' });
  await app.call('POST', '/api/operator/password-reset', owner, { email: child.email });
  const actions = (await app.call('GET', '/api/admin/admins', owner)).body.activity.map((row: { action: string }) => row.action);
  assert.ok(actions.includes('Approved club'));
  assert.ok(actions.some((action: string) => /Recorded payment: 1 month, ₦1,000, TRF9/.test(action)));
  assert.ok(actions.includes('Made a password reset link'));

  const reports = (await app.call('GET', '/api/admin/reports', owner)).body;
  assert.equal(reports.weeks.length, 8);
  const thisWeek = reports.weeks[reports.weeks.length - 1];
  assert.equal(thisWeek.gymnasts, 2);
  assert.equal(thisWeek.videos, 1);
  assert.equal(reports.accountsFromBeforeTracking, 0);
});

test('accounts saved before this change still load, and only new sign-ins get dates', async () => {
  const dbPath = `data/test-admin-old-${Date.now()}.json`;
  const first = await start({ dbPath });
  const owner = await first.owner();
  const child = await first.gymnast();
  const fs = await import('node:fs/promises');
  // Wait for the last write, then strip what this change added, as the live row is today.
  await new Promise((resolve) => setTimeout(resolve, 100));
  const saved = JSON.parse(await fs.readFile(dbPath, 'utf8'));
  for (const key of ['admins', 'adminLog', 'announcements', 'postReports', 'platformEvents', 'skillEdits', 'settings']) delete saved[key];
  for (const user of saved.users) {
    delete user.createdAt;
    delete user.lastLoginAt;
  }
  await fs.writeFile(dbPath, JSON.stringify(saved));

  const second = await start({ dbPath });
  assert.equal(owner.length > 0, true);
  const again = await second.login(child.email);
  assert.equal(again.status, 200);
  const ownerToken = await second.owner();
  const dashboard = await second.call('GET', '/api/admin/dashboard', ownerToken);
  assert.equal(dashboard.status, 200);
  assert.deepEqual((await second.call('GET', '/api/platform-events')).body.events.map((item: { name: string }) => item.name), ['GymFest 3.0']);
  assert.equal((await second.call('GET', '/api/settings/public')).body.monthlyFeeNgn, 1000);
  await fs.rm(dbPath, { force: true });
});
