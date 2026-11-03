import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test, { after } from 'node:test';
import { createApp } from '../server/createApp.ts';
import { REMOVED_CLUB_IDS, REMOVED_GYMNAST_IDS } from '../server/dataCleanups.ts';
import type { Notifiers } from '../server/workflow.ts';

const PASSWORD = 'correct-horse';
const OPERATOR = 'operator@gym.test';
process.env.GYMTRACK_OPERATOR_EMAILS = OPERATOR;

const servers: { close(): unknown; closeAllConnections(): void }[] = [];
after(() => {
  for (const server of servers) {
    server.close();
    server.closeAllConnections();
  }
});

let counter = 0;

async function start(options: { notifiers?: Notifiers; dbPath?: string; removeClubIds?: string[]; removeGymnastIds?: string[]; now?: () => Date } = {}) {
  const app = await createApp({
    dbPath: options.dbPath ?? `data/test-launch-${Date.now()}-${Math.random()}.json`,
    webhookSecret: 'test-secret',
    devMatch: false,
    notifiers: options.notifiers ?? {},
    removeClubIds: options.removeClubIds,
    removeGymnastIds: options.removeGymnastIds,
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
  const operator = async () => {
    const signedIn = await call('POST', '/api/auth/login', null, { email: OPERATOR, password: PASSWORD });
    if (signedIn.status === 200) return signedIn.body.token as string;
    const made = await call('POST', '/api/auth/signup-student', null, { name: 'Operator', email: OPERATOR, password: PASSWORD, phone: '08030000009', dateOfBirth: '1990-01-01' });
    assert.equal(made.status, 201);
    return made.body.token as string;
  };
  const club = async (name = 'New Club') => {
    const email = nextEmail('club');
    const made = await call('POST', '/api/auth/register-club', null, { clubName: name, city: 'Lagos', adminName: 'Ada Admin', email, password: PASSWORD, phone: '08030000000', acceptedPrivacy: true });
    assert.equal(made.status, 201);
    return { ...made.body, email } as any;
  };
  const approved = async (name = 'Good Club') => {
    const made = await club(name);
    assert.equal((await call('POST', `/api/operator/clubs/${made.user.clubId}/approve`, await operator())).status, 200);
    return made;
  };
  const gymnast = async (selectedClubId: string | null = null) => {
    const email = nextEmail('gym');
    const made = await call('POST', '/api/auth/signup-student', null, { name: 'Zainab', email, password: PASSWORD, phone: '08031234567', dateOfBirth: '2012-05-05', selectedClubId, acceptedPrivacy: true });
    assert.equal(made.status, 201);
    return { ...made.body, email } as any;
  };
  return { base, call, operator, club, approved, gymnast, nextEmail };
}

test('a new club waits for approval and cannot reach any gymnast until then', async () => {
  const filed: string[] = [];
  const app = await start({ notifiers: { enquiry: async ({ message }) => { filed.push(message); } } });
  const club = await app.club('Unchecked Gym');
  assert.equal(club.user.access, 'pending');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.match(filed.join(), /waiting for approval: Unchecked Gym/);

  // Not offered to gymnasts, and cannot be chosen by id.
  assert.ok(!(await app.call('GET', '/api/clubs?accounts=1')).body.clubs.some((item: { id: string }) => item.id === club.user.clubId));
  const child = await app.gymnast(club.user.clubId);
  assert.equal(child.user.selectedClubId, null);
  assert.equal((await app.call('PATCH', '/api/me', child.token, { selectedClubId: club.user.clubId })).body.code, 'CLUB_NOT_FOUND');

  // Sees nothing and can do nothing with children's data.
  const video = await fetch(`${app.base}/api/uploads?scope=public&name=clip.mp4`, { method: 'POST', headers: { 'content-type': 'video/mp4', authorization: `Bearer ${child.token}` }, body: Buffer.from('x') }).then((r) => r.json()) as { url: string };
  await app.call('POST', '/api/inspo', child.token, { videoUrl: video.url, skill: 'Bridge', category: 'Floor', visibility: 'everyone' });
  assert.equal((await app.call('GET', '/api/inspo', club.token)).body.posts.length, 0);
  assert.equal((await fetch(app.base + video.url, { headers: { authorization: `Bearer ${club.token}` } })).status, 403);
  assert.equal((await app.call('GET', '/api/club/overview', club.token)).body.code, 'CLUB_NOT_APPROVED');
  assert.equal((await app.call('POST', '/api/clubs/students', club.token, { students: [{ name: 'A', email: 'a@gym.test', password: PASSWORD, dateOfBirth: '2012-01-01' }] })).body.code, 'CLUB_NOT_APPROVED');
});

test('approving opens the club and starts its seven free days then, not at sign-up', async () => {
  let clock = new Date('2026-11-01T10:00:00Z');
  const app = await start({ now: () => clock });
  const club = await app.club('Slow Check Gym');
  const operator = await app.operator();
  clock = new Date('2026-11-20T10:00:00Z');
  assert.equal((await app.call('GET', '/api/operator/clubs', operator)).body.clubs.find((item: { id: string }) => item.id === club.user.clubId).approval, 'pending');

  assert.equal((await app.call('POST', `/api/operator/clubs/${club.user.clubId}/approve`, club.token)).status, 403);
  const done = await app.call('POST', `/api/operator/clubs/${club.user.clubId}/approve`, operator);
  assert.equal(done.status, 200);
  assert.equal(done.body.club.trialEndsAt, '2026-11-27T10:00:00.000Z');
  assert.equal((await app.call('POST', `/api/operator/clubs/${club.user.clubId}/approve`, operator)).status, 409);

  const me = await app.call('GET', '/api/me', club.token);
  assert.equal(me.body.user.access, 'trial');
  assert.ok((await app.call('GET', '/api/clubs?accounts=1')).body.clubs.some((item: { id: string }) => item.id === club.user.clubId));
  const child = await app.gymnast(club.user.clubId);
  assert.equal(child.user.selectedClubName, 'Slow Check Gym');
  assert.equal((await app.call('GET', '/api/club/overview', club.token)).body.gymnasts.length, 1);
});

test('declining needs a reason, which the club can read, and it can still be approved later', async () => {
  const app = await start();
  const club = await app.club('Doubtful Gym');
  const operator = await app.operator();
  assert.equal((await app.call('POST', `/api/operator/clubs/${club.user.clubId}/reject`, operator, { reason: ' ' })).body.code, 'REASON_REQUIRED');
  assert.equal((await app.call('POST', `/api/operator/clubs/${club.user.clubId}/reject`, operator, { reason: 'Could not find this club.' })).status, 200);
  const me = await app.call('GET', '/api/me', club.token);
  assert.equal(me.body.user.access, 'rejected');
  assert.equal(me.body.user.club.rejectionReason, 'Could not find this club.');
  assert.equal((await app.call('POST', `/api/operator/clubs/${club.user.clubId}/approve`, operator)).status, 200);
  assert.equal((await app.call('GET', '/api/me', club.token)).body.user.access, 'trial');
});

test('existing clubs need no new approval', async () => {
  const dbPath = `data/test-launch-old-${Date.now()}.json`;
  const first = await start({ dbPath });
  const club = await first.approved('Old Club');
  const fs = await import('node:fs');
  const saved = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  delete saved.clubs.find((item: { id: string }) => item.id === club.user.clubId).approvalStatus;
  fs.writeFileSync(dbPath, JSON.stringify(saved));
  const second = await start({ dbPath });
  assert.ok((await second.call('GET', '/api/clubs?accounts=1')).body.clubs.some((item: { id: string }) => item.id === club.user.clubId));
  assert.equal((await second.call('GET', '/api/me', club.token)).body.user.access, 'trial');
});

test('the made-up clubs are removed on start, gymnasts keep their accounts, and nothing else is touched', async () => {
  assert.equal(REMOVED_CLUB_IDS.length, 3);
  const dbPath = `data/test-launch-clean-${Date.now()}.json`;
  const first = await start({ dbPath });
  const fake = await first.approved('Made Up Gym');
  const real = await first.approved('Real Gym');
  const member = await first.gymnast(fake.user.clubId);
  const realMember = await first.gymnast(real.user.clubId);
  const upload = async (token: string, scope: string) => fetch(`${first.base}/api/uploads?scope=${scope}&name=clip.mp4`, { method: 'POST', headers: { 'content-type': 'video/mp4', authorization: `Bearer ${token}` }, body: Buffer.from('x') }).then((r) => r.json()) as Promise<{ id: string; url: string }>;
  const keptVideo = await upload(member.token, 'public');
  const keptPost = (await first.call('POST', '/api/inspo', member.token, { videoUrl: keptVideo.url, skill: 'Bridge', category: 'Floor', visibility: 'everyone' })).body.post;
  const clubVideo = await upload(member.token, 'private');
  const skillVideo = await upload(realMember.token, 'private');
  await first.call('POST', '/api/club/notices', fake.token, { title: 'x', body: 'y' });
  await first.call('POST', '/api/club/notices', real.token, { title: 'stays', body: 'y' });

  const second = await start({ dbPath, removeClubIds: [fake.user.clubId, 'club_that_is_not_there'] });
  assert.equal((await second.call('GET', '/api/me', fake.token)).status, 401);
  assert.equal((await second.call('POST', '/api/auth/login', null, { email: fake.email, password: PASSWORD })).status, 401);
  const clubs = (await second.call('GET', '/api/clubs?accounts=1')).body.clubs.map((item: { name: string }) => item.name);
  assert.ok(!clubs.includes('Made Up Gym'));
  assert.ok(clubs.includes('Real Gym'));

  // The gymnast is still here with no club, and their published video still opens.
  const kept = await second.call('GET', '/api/me', member.token);
  assert.equal(kept.status, 200);
  assert.equal(kept.body.user.clubId, null);
  assert.equal(kept.body.user.selectedClubId, null);
  assert.equal((await second.call('GET', `/api/inspo/post/${keptPost.id}`, member.token)).status, 200);
  assert.equal((await fetch(second.base + keptVideo.url, { headers: { authorization: `Bearer ${member.token}` } })).status, 200);
  // A file nothing uses any more is gone; the other club and its records are untouched.
  assert.equal((await fetch(second.base + clubVideo.url, { headers: { authorization: `Bearer ${member.token}` } })).status, 404);
  assert.equal((await fetch(second.base + skillVideo.url, { headers: { authorization: `Bearer ${realMember.token}` } })).status, 200);
  assert.deepEqual((await second.call('GET', '/api/notices', real.token)).body.notices.map((item: { title: string }) => item.title), ['stays']);

  // Starting again changes nothing.
  const third = await start({ dbPath, removeClubIds: [fake.user.clubId] });
  assert.equal((await third.call('GET', '/api/me', member.token)).status, 200);
});

test('a club administrator gives a coach their own sign-in and can take it away', async () => {
  const app = await start();
  const club = await app.approved('Coach Gym');
  const other = await app.approved('Other Gym');
  const child = await app.gymnast(club.user.clubId);
  const details = { name: 'Coach Bola', email: 'bola@gym.test', phone: '08030000003', password: PASSWORD };

  assert.equal((await app.call('POST', '/api/club/coaches', child.token, details)).status, 403);
  assert.equal((await app.call('POST', '/api/club/coaches', club.token, { ...details, password: 'short' })).body.code, 'PASSWORD_SHORT');
  const made = await app.call('POST', '/api/club/coaches', club.token, details);
  assert.equal(made.status, 201);
  assert.equal((await app.call('POST', '/api/club/coaches', other.token, details)).status, 409);
  assert.deepEqual((await app.call('GET', '/api/club/overview', club.token)).body.coaches.map((item: { name: string }) => item.name), ['Coach Bola']);

  const signedIn = await app.call('POST', '/api/auth/login', null, { email: details.email, password: PASSWORD });
  assert.equal(signedIn.status, 200);
  assert.equal(signedIn.body.user.role, 'COACH');
  assert.equal(signedIn.body.user.clubId, club.user.clubId);
  const coach = signedIn.body.token;

  // Reviews the club's gymnasts, and is not the administrator.
  const overview = await app.call('GET', '/api/club/overview', coach);
  assert.equal(overview.body.gymnasts[0].id, child.user.id);
  assert.deepEqual(overview.body.coaches, []);
  assert.equal((await app.call('POST', '/api/club/attendance', coach, { gymnastId: child.user.id, date: '2026-11-03', present: true })).status, 200);
  assert.equal((await app.call('POST', '/api/club/coaches', coach, { ...details, email: 'x@gym.test' })).status, 403);
  assert.equal((await app.call('POST', '/api/clubs/students', coach, { students: [] })).status, 403);
  assert.equal((await app.call('POST', '/api/club/attendance', coach, { gymnastId: (await app.gymnast(other.user.clubId)).user.id, date: '2026-11-03', present: true })).status, 404);

  // Only their own club's administrator can remove them, and it takes effect at once.
  assert.equal((await app.call('DELETE', `/api/club/coaches/${made.body.coach.id}`, other.token)).status, 404);
  assert.equal((await app.call('DELETE', `/api/club/coaches/${made.body.coach.id}`, club.token)).status, 200);
  assert.equal((await app.call('GET', '/api/me', coach)).status, 401);
  assert.equal((await app.call('POST', '/api/auth/login', null, { email: details.email, password: PASSWORD })).status, 401);
  assert.deepEqual((await app.call('GET', '/api/club/overview', club.token)).body.coaches, []);

  // Added back by the same club, with a new password.
  assert.equal((await app.call('POST', '/api/club/coaches', club.token, { ...details, password: 'new-password-1' })).status, 201);
  assert.equal((await app.call('POST', '/api/auth/login', null, { email: details.email, password: 'new-password-1' })).status, 200);
  assert.equal((await app.call('POST', '/api/auth/login', null, { email: details.email, password: PASSWORD })).status, 401);
});

test('a new coach does not stretch the club past the end of its free week', async () => {
  let clock = new Date('2026-11-01T10:00:00Z');
  const app = await start({ now: () => clock });
  const club = await app.approved('Trial Gym');
  await app.call('POST', '/api/club/coaches', club.token, { name: 'Coach', email: 'trial-coach@gym.test', password: PASSWORD });
  const coach = (await app.call('POST', '/api/auth/login', null, { email: 'trial-coach@gym.test', password: PASSWORD })).body;
  assert.equal(coach.user.access, 'trial');
  clock = new Date('2026-11-09T10:00:00Z');
  const later = await app.call('POST', '/api/auth/login', null, { email: 'trial-coach@gym.test', password: PASSWORD });
  assert.equal(later.body.user.access, 'locked');
  assert.equal((await app.call('GET', '/api/club/overview', later.body.token)).body.code, 'PAYMENT_REQUIRED');
});

test('a forgotten password: the link works once, ends other sign-ins and reveals nothing', async () => {
  const sent: { to: string; token: string }[] = [];
  const app = await start({ notifiers: { resetEmail: async ({ to, token }) => { sent.push({ to, token }); } } });
  const child = await app.gymnast();
  const unknown = await app.call('POST', '/api/auth/forgot-password', null, { email: 'nobody@gym.test' });
  const known = await app.call('POST', '/api/auth/forgot-password', null, { email: child.email.toUpperCase() });
  assert.deepEqual(unknown.body, known.body);
  assert.equal(known.status, 200);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, child.email);

  assert.equal((await app.call('POST', '/api/auth/reset-password', null, { token: 'made-up', password: 'new-password-1' })).body.code, 'RESET_INVALID');
  assert.equal((await app.call('POST', '/api/auth/reset-password', null, { token: sent[0].token, password: 'short' })).body.code, 'PASSWORD_SHORT');
  assert.equal((await app.call('POST', '/api/auth/reset-password', null, { token: sent[0].token, password: 'new-password-1' })).status, 200);
  assert.equal((await app.call('GET', '/api/me', child.token)).status, 401);
  assert.equal((await app.call('POST', '/api/auth/login', null, { email: child.email, password: PASSWORD })).status, 401);
  assert.equal((await app.call('POST', '/api/auth/login', null, { email: child.email, password: 'new-password-1' })).status, 200);
  assert.equal((await app.call('POST', '/api/auth/reset-password', null, { token: sent[0].token, password: 'another-password' })).body.code, 'RESET_INVALID');
});

test('a reset link runs out after an hour, and requests are limited', async () => {
  let clock = new Date('2026-11-01T10:00:00Z');
  const sent: string[] = [];
  const app = await start({ now: () => clock, notifiers: { resetEmail: async ({ token }) => { sent.push(token); } } });
  const child = await app.gymnast();
  await app.call('POST', '/api/auth/forgot-password', null, { email: child.email });
  await new Promise((resolve) => setTimeout(resolve, 20));
  clock = new Date('2026-11-01T11:01:00Z');
  assert.equal((await app.call('POST', '/api/auth/reset-password', null, { token: sent[0], password: 'new-password-1' })).body.code, 'RESET_INVALID');
  for (let i = 0; i < 5; i += 1) await app.call('POST', '/api/auth/forgot-password', null, { email: child.email });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(sent.length, 4, 'the first, which is now over an hour old, and three more: three an hour for one account');
});

test('without email, a request reaches the team and an operator makes the link', async () => {
  const filed: { phone: string; message: string }[] = [];
  const app = await start({ notifiers: { enquiry: async ({ phone, message }) => { filed.push({ phone, message }); } } });
  const child = await app.gymnast();
  const asked = await app.call('POST', '/api/auth/forgot-password', null, { email: child.email });
  assert.equal(asked.body.emailed, false);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.match(filed.at(-1)?.message ?? '', /Password reset requested/);
  assert.equal(filed.at(-1)?.phone, '08031234567');

  assert.equal((await app.call('POST', '/api/operator/password-reset', child.token, { email: child.email })).status, 403);
  const operator = await app.operator();
  assert.equal((await app.call('POST', '/api/operator/password-reset', operator, { email: 'nobody@gym.test' })).status, 404);
  const link = await app.call('POST', '/api/operator/password-reset', operator, { email: child.email });
  assert.equal(link.status, 201);
  assert.equal(link.body.phone, '08031234567');
  assert.equal((await app.call('POST', '/api/auth/reset-password', null, { token: link.body.token, password: 'new-password-1' })).status, 200);
  assert.equal((await app.call('POST', '/api/auth/login', null, { email: child.email, password: 'new-password-1' })).status, 200);
});

test('changing a password from the profile needs the current one and signs out other devices', async () => {
  const app = await start();
  const child = await app.gymnast();
  const otherDevice = (await app.call('POST', '/api/auth/login', null, { email: child.email, password: PASSWORD })).body.token;
  assert.equal((await app.call('POST', '/api/me/password', child.token, { current: 'wrong-password', next: 'new-password-1' })).body.code, 'WRONG_PASSWORD');
  assert.equal((await app.call('POST', '/api/me/password', child.token, { current: PASSWORD, next: 'short' })).body.code, 'PASSWORD_SHORT');
  assert.equal((await app.call('POST', '/api/me/password', child.token, { current: PASSWORD, next: 'new-password-1' })).status, 200);
  assert.equal((await app.call('GET', '/api/me', child.token)).status, 200);
  assert.equal((await app.call('GET', '/api/me', otherDevice)).status, 401);
  assert.equal((await app.call('POST', '/api/auth/login', null, { email: child.email, password: 'new-password-1' })).status, 200);
});

test('deleting a Connect video removes the file too', async () => {
  const app = await start();
  const child = await app.gymnast();
  const video = await fetch(`${app.base}/api/uploads?scope=public&name=clip.mp4`, { method: 'POST', headers: { 'content-type': 'video/mp4', authorization: `Bearer ${child.token}` }, body: Buffer.from('x') }).then((r) => r.json()) as { url: string };
  const post = (await app.call('POST', '/api/inspo', child.token, { videoUrl: video.url, skill: 'Bridge', category: 'Floor', visibility: 'everyone' })).body.post;
  assert.equal((await fetch(app.base + video.url, { headers: { authorization: `Bearer ${child.token}` } })).status, 200);
  assert.equal((await app.call('DELETE', `/api/inspo/${post.id}`, child.token)).status, 200);
  assert.equal((await fetch(app.base + video.url, { headers: { authorization: `Bearer ${child.token}` } })).status, 404);
});

test('removing a made-up gymnast takes everything of theirs and nobody else\'s', async () => {
  assert.equal(REMOVED_GYMNAST_IDS.length, 4);
  const dbPath = `data/test-launch-gym-${Date.now()}.json`;
  const first = await start({ dbPath });
  const club = await first.approved('Stays Gym');
  const fake = await first.gymnast(club.user.clubId);
  const real = await first.gymnast(club.user.clubId);
  const upload = (token: string) => fetch(`${first.base}/api/uploads?scope=public&name=clip.mp4`, { method: 'POST', headers: { 'content-type': 'video/mp4', authorization: `Bearer ${token}` }, body: Buffer.from('x') }).then((r) => r.json()) as Promise<{ url: string }>;
  const fakeVideo = await upload(fake.token);
  const realVideo = await upload(real.token);
  const fakePost = (await first.call('POST', '/api/inspo', fake.token, { videoUrl: fakeVideo.url, skill: 'Bridge', category: 'Floor', visibility: 'everyone' })).body.post;
  const realPost = (await first.call('POST', '/api/inspo', real.token, { videoUrl: realVideo.url, skill: 'Roll', category: 'Floor', visibility: 'everyone' })).body.post;
  await first.call('POST', `/api/inspo/${realPost.id}/comments`, fake.token, { text: 'From the fake one' });
  await first.call('POST', `/api/inspo/${realPost.id}/comments`, club.token, { text: 'From the club' });
  await first.call('POST', `/api/inspo/${realPost.id}/like`, fake.token);
  await first.call('POST', `/api/inspo/${fakePost.id}/save`, real.token);
  await first.call('POST', '/api/follows', fake.token, { userId: real.user.id });
  await first.call('POST', '/api/club/attendance', club.token, { gymnastId: fake.user.id, date: '2026-11-03', present: true });
  await first.call('POST', '/api/club/attendance', club.token, { gymnastId: real.user.id, date: '2026-11-03', present: true });

  // A club's id and a staff id in the list are ignored: only gymnasts can be removed this way.
  const second = await start({ dbPath, removeGymnastIds: [fake.user.id, club.user.id, 'usr_not_there'] });
  assert.equal((await second.call('GET', '/api/me', fake.token)).status, 401);
  assert.equal((await second.call('POST', '/api/auth/login', null, { email: fake.email, password: PASSWORD })).status, 401);
  assert.equal((await fetch(second.base + fakeVideo.url, { headers: { authorization: `Bearer ${real.token}` } })).status, 404);
  assert.equal((await second.call('GET', `/api/inspo/post/${fakePost.id}`, real.token)).status, 404);
  assert.equal((await second.call('GET', '/api/inspo/saved', real.token)).body.posts.length, 0);

  const kept = (await second.call('GET', `/api/inspo/post/${realPost.id}`, real.token)).body.post;
  assert.deepEqual(kept.comments.map((item: { text: string }) => item.text), ['From the club']);
  assert.equal(kept.likes, 0);
  assert.equal((await fetch(second.base + realVideo.url, { headers: { authorization: `Bearer ${real.token}` } })).status, 200);
  const overview = (await second.call('GET', '/api/club/overview', club.token)).body;
  assert.deepEqual(overview.gymnasts.map((item: { id: string }) => item.id), [real.user.id]);
  assert.deepEqual(overview.attendance.map((item: { gymnastId: string }) => item.gymnastId), [real.user.id]);
  assert.equal((await second.call('GET', '/api/me', club.token)).status, 200);
});
