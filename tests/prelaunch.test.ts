import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import test, { after } from 'node:test';
import express from 'express';
import { createApp } from '../server/createApp.ts';
import { inOrder } from '../server/postgres.ts';
import { solyntaflowNotifiers } from '../server/solyntaflow.ts';
import { driveStorage } from '../server/storage.ts';
import { createBoundStore, emptyDb } from '../server/store.ts';
import { normalisePhone, requiredSkills, type Notifiers } from '../server/workflow.ts';
import { youtubeRouter } from '../server/youtube.ts';

const PASSWORD = 'correct-horse';
let counter = 0;

// A failed assertion must not leave a server open, or the test run never ends.
const servers: { close(): unknown; closeAllConnections(): void }[] = [];
after(() => {
  for (const server of servers) {
    server.close();
    server.closeAllConnections();
  }
});

async function start(options: { notifiers?: Notifiers; webhookSecret?: string } = {}) {
  const app = await createApp({
    clubApproval: false,
    dbPath: `data/test-prelaunch-${Date.now()}-${Math.random()}.json`,
    webhookSecret: options.webhookSecret ?? 'test-secret',
    devMatch: false,
    notifiers: options.notifiers ?? {},
  });
  const server = app.listen(0);
  servers.push(server);
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  async function call(method: string, url: string, token?: string | null, body?: unknown, headers: Record<string, string> = {}) {
    const response = await fetch(base + url, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: response.status, body: json, text, headers: response.headers };
  }

  async function club(name = 'Alpha') {
    counter += 1;
    const result = await call('POST', '/api/auth/register-club', null, { clubName: name, city: 'Lagos', adminName: `Admin ${counter}`, email: `club${counter}@gym.test`, password: PASSWORD, phone: '08030000000' });
    assert.equal(result.status, 201, result.text);
    return result.body;
  }

  async function gymnast(selectedClubId: string | null = null) {
    counter += 1;
    const result = await call('POST', '/api/auth/signup-student', null, { name: `Gymnast ${counter}`, email: `gym${counter}@gym.test`, password: PASSWORD, phone: '08031234567', dateOfBirth: '2012-05-05', selectedClubId });
    assert.equal(result.status, 201, result.text);
    return result.body;
  }

  async function upload(token: string, scope = 'private') {
    const response = await fetch(`${base}/api/uploads?scope=${scope}&name=clip.mp4`, {
      method: 'POST',
      headers: { 'content-type': 'video/mp4', authorization: `Bearer ${token}` },
      body: Buffer.from('fake-mp4-bytes'),
    });
    assert.equal(response.status, 201);
    return (await response.json()) as { id: string; url: string };
  }

  return { server, base, call, club, gymnast, upload };
}

test('a student record cannot be read or changed without signing in', async () => {
  const app = await start();
  const club = await app.club();
  const student = await app.gymnast(club.user.clubId);
  const result = await app.call('POST', `/api/students/${student.user.id}/parent`, null, { parentEmail: 'x@x.test' });
  assert.equal(result.status, 404);
  assert.ok(!result.text.includes(student.user.email));
});

test('one bad request to the tutorial search cannot take the server down', async () => {
  const outer = express();
  outer.use('/api/youtube', youtubeRouter());
  const server = outer.listen(0);
  servers.push(server);
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (body: string) => fetch(`${base}/api/youtube/batch`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  assert.equal((await post('{"skills":[null]}')).status, 400);
  assert.equal((await post('{"skills":[1]}')).status, 400);
  assert.equal((await post('{"skills":[{"name":5}]}')).status, 400);
  const broken = await post('{bad');
  assert.equal(broken.status, 400);
  assert.match(broken.headers.get('content-type') ?? '', /json/);
  const good = await post('{"skills":["cartwheel"]}');
  assert.equal(good.status, 200);
  const search = await fetch(`${base}/api/youtube/search`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ skillName: 'x'.repeat(500) }) });
  assert.equal(search.status, 400);
});

test('an unknown API address and broken JSON answer in JSON, not the web page', async () => {
  const app = await start();
  const unknown = await app.call('GET', '/api/does-not-exist');
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.code, 'NOT_FOUND');
  const response = await fetch(`${app.base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { code: 'BAD_REQUEST' });
});

test('signing up refuses values that would break the account later', async () => {
  const app = await start();
  const student = (changes: Record<string, unknown>) => app.call('POST', '/api/auth/signup-student', null, { name: 'Ada', email: `bad${(counter += 1)}@gym.test`, password: PASSWORD, phone: '08031234567', dateOfBirth: '2012-05-05', ...changes });
  assert.equal((await student({ level: 999 })).body.code, 'LEVEL_INVALID');
  assert.equal((await student({ level: 'abc' })).body.code, 'LEVEL_INVALID');
  assert.equal((await student({ dateOfBirth: 'banana' })).body.code, 'DOB_INVALID');
  assert.equal((await student({ dateOfBirth: '2999-01-01' })).body.code, 'DOB_INVALID');
  assert.equal((await student({ password: 'short' })).body.code, 'PASSWORD_SHORT');
  assert.equal((await student({ email: 'not-an-email' })).body.code, 'EMAIL_INVALID');
  assert.equal((await student({ phone: '123' })).body.code, 'PHONE_INVALID');
  assert.equal((await student({ name: 5 })).body.code, 'NAME_REQUIRED');
  const fine = await student({ level: 3 });
  assert.equal(fine.status, 201);
  assert.equal(fine.body.user.level, 3);
  const club = await app.call('POST', '/api/auth/register-club', null, { clubName: 'C', city: 'Lagos', adminName: 'A', email: 'nope', password: PASSWORD });
  assert.equal(club.body.code, 'EMAIL_INVALID');
});

test('adding several gymnasts is all or nothing, so a retry works', async () => {
  const app = await start();
  const club = await app.club();
  const row = (email: string) => ({ name: 'New', email, password: PASSWORD, dateOfBirth: '2012-01-01', phone: '08031234567' });
  assert.equal((await app.call('POST', '/api/clubs/students', club.token, { students: [row('taken@gym.test')] })).status, 201);
  const mixed = await app.call('POST', '/api/clubs/students', club.token, { students: [row('fresh@gym.test'), row('taken@gym.test')] });
  assert.equal(mixed.status, 409);
  assert.equal((await app.call('POST', '/api/auth/login', null, { email: 'fresh@gym.test', password: PASSWORD })).status, 401);
  assert.equal((await app.call('POST', '/api/clubs/students', club.token, { students: [row('fresh@gym.test')] })).status, 201);
  const twice = await app.call('POST', '/api/clubs/students', club.token, { students: [row('dup@gym.test'), row('dup@gym.test')] });
  assert.equal(twice.status, 409);
  const incomplete = await app.call('POST', '/api/clubs/students', club.token, { students: [{ name: 'No Password', email: 'np@gym.test' }] });
  assert.equal(incomplete.status, 400);
  assert.equal(incomplete.body.code, 'PASSWORD_SHORT');
});

test('blocking someone hides saved videos, the video file and their comments', async () => {
  const app = await start();
  const author = await app.gymnast();
  const other = await app.gymnast();
  const third = await app.gymnast();
  const video = await app.upload(author.token, 'public');
  const post = (await app.call('POST', '/api/inspo', author.token, { videoUrl: video.url, skill: 'Bridge', category: 'Floor', visibility: 'everyone' })).body.post;
  await app.call('POST', `/api/inspo/${post.id}/save`, other.token);
  await app.call('POST', `/api/inspo/${post.id}/comments`, third.token, { text: 'Great' });
  await app.call('POST', '/api/blocks', author.token, { userId: other.user.id });
  assert.equal((await app.call('GET', '/api/inspo/saved', other.token)).body.posts.length, 0);
  assert.equal((await fetch(app.base + video.url, { headers: { authorization: `Bearer ${other.token}` } })).status, 403);
  assert.equal((await fetch(app.base + video.url, { headers: { authorization: `Bearer ${third.token}` } })).status, 200);

  // A blocked person's comment is not shown to the person who blocked them.
  await app.call('POST', '/api/blocks', author.token, { userId: third.user.id });
  const seen = (await app.call('GET', `/api/inspo/post/${post.id}`, author.token)).body.post;
  assert.equal(seen.comments.length, 0);
});

test('comments, reports and follows only work on what the person can see', async () => {
  const app = await start();
  const clubA = await app.club('A');
  const clubB = await app.club('B');
  const author = await app.gymnast(clubA.user.clubId);
  const stranger = await app.gymnast(clubB.user.clubId);
  const video = await app.upload(author.token);
  const clubPost = (await app.call('POST', '/api/inspo', author.token, { videoUrl: video.url, skill: 'Bridge', category: 'Floor', visibility: 'club', audienceClubId: clubA.user.clubId })).body.post;
  const withComment = (await app.call('POST', `/api/inspo/${clubPost.id}/comments`, clubA.token, { text: 'Nice work' })).body.post;
  const commentId = withComment.comments[0].id;
  assert.equal((await app.call('POST', `/api/comments/${commentId}/report`, stranger.token)).status, 404);
  assert.equal((await app.call('POST', `/api/comments/${commentId}/report`, clubA.token)).status, 200);

  const tooLong = await app.call('POST', `/api/inspo/${clubPost.id}/comments`, clubA.token, { text: 'x'.repeat(1001) });
  assert.equal(tooLong.status, 400);
  assert.equal(tooLong.body.code, 'TOO_LONG');

  const elsewhere = (await app.call('POST', '/api/inspo', author.token, { videoUrl: (await app.upload(author.token, 'public')).url, skill: 'Roll', category: 'Floor', visibility: 'everyone' })).body.post;
  const wrongParent = await app.call('POST', `/api/inspo/${elsewhere.id}/comments`, clubA.token, { text: 'Reply', parentCommentId: commentId });
  assert.equal(wrongParent.status, 400);

  assert.equal((await app.call('POST', '/api/follows', author.token, { userId: 'usr_nobody' })).status, 400);
  assert.equal((await app.call('POST', '/api/follows', author.token, { clubId: 'club_nobody' })).status, 400);
  assert.equal((await app.call('POST', '/api/follows', author.token, { userId: stranger.user.id })).status, 201);
});

test('a video waiting for review moves with the gymnast when they change club', async () => {
  const app = await start();
  const oldClub = await app.club('Old');
  const newClub = await app.club('New');
  const student = await app.gymnast(oldClub.user.clubId);
  const video = await app.upload(student.token);
  const skill = requiredSkills({ level: 1 })[0];
  const submitted = await app.call('POST', `/api/skills/${skill.id}/submit`, student.token, { videoUrl: video.url });
  assert.equal(submitted.status, 201);
  const moved = await app.call('PATCH', '/api/me', student.token, { selectedClubId: newClub.user.clubId });
  assert.equal(moved.status, 200);

  const asNew = (token: string) => fetch(app.base + video.url, { headers: { authorization: `Bearer ${token}` } });
  assert.equal((await asNew(newClub.token)).status, 200);
  assert.equal((await asNew(oldClub.token)).status, 403);
  const review = (token: string) => app.call('POST', `/api/club/submissions/${submitted.body.submission.id}/review`, token, { decision: 'APPROVED', comment: 'Good' });
  assert.equal((await review(oldClub.token)).status, 404);
  assert.equal((await review(newClub.token)).status, 200);
});

test('telephone numbers become the full international number', () => {
  const nigerian = '2348031234567';
  for (const raw of ['08031234567', '+2348031234567', '2348031234567', '8031234567', '+234 803 123 4567', '+234 0803 123 4567', '234-0803-123-4567', '0803 123 4567']) {
    assert.equal(normalisePhone(raw), nigerian, raw);
  }
  assert.equal(normalisePhone('+44 7700 900123'), '447700900123');
  assert.equal(normalisePhone(''), '');
});

test('a fee reminder is not sent twice by accident and fits the WhatsApp template', async () => {
  const sent: string[] = [];
  const app = await start({ notifiers: { whatsapp: async ({ to }) => { sent.push(to); return { status: 'sent', detail: 'ok' }; } } });
  const club = await app.club();
  const student = await app.gymnast(club.user.clubId);
  const remind = (message: string) => app.call('POST', '/api/club/fee-reminders', club.token, { gymnastId: student.user.id, message });
  assert.equal((await remind('October fee is due.')).status, 201);
  const again = await remind('October fee is due.');
  assert.equal(again.status, 409);
  assert.equal(again.body.code, 'ALREADY_SENT');
  assert.equal(sent.length, 1);
  assert.equal((await remind('A different message.')).status, 201);
  const long = await remind('x'.repeat(401));
  assert.equal(long.status, 400);
  assert.equal(long.body.code, 'TOO_LONG');
  assert.deepEqual(sent, ['2348031234567', '2348031234567']);
});

test('a link to a file carries a key that only opens files, and signing out ends both', async () => {
  const app = await start();
  const student = await app.gymnast();
  const video = await app.upload(student.token);
  assert.ok(student.mediaToken);
  assert.notEqual(student.mediaToken, student.token);
  assert.equal((await fetch(`${app.base}${video.url}?token=${student.token}`)).status, 401);
  const opened = await fetch(`${app.base}${video.url}?token=${student.mediaToken}`);
  assert.equal(opened.status, 200);
  assert.equal(opened.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await app.call('GET', '/api/me', student.mediaToken)).status, 401);
  assert.equal((await app.call('GET', '/api/me', student.token)).body.mediaToken, student.mediaToken);

  const signIn = await app.call('POST', '/api/auth/login', null, { email: student.user.email, password: PASSWORD });
  assert.ok(signIn.body.mediaToken);
  assert.equal((await app.call('POST', '/api/auth/logout', student.token)).status, 200);
  assert.equal((await app.call('GET', '/api/me', student.token)).status, 401);
  assert.equal((await fetch(`${app.base}${video.url}?token=${student.mediaToken}`)).status, 401);
  assert.equal((await app.call('GET', '/api/me', signIn.body.token)).status, 200);
});

test('repeated wrong passwords are slowed down, for that account only', async () => {
  const app = await start();
  const student = await app.gymnast();
  const other = await app.gymnast();
  const attempt = (email: string, password: string) => app.call('POST', '/api/auth/login', null, { email, password });
  for (let i = 0; i < 10; i += 1) assert.equal((await attempt(student.user.email, 'wrong-password')).status, 401);
  const blocked = await attempt(student.user.email, PASSWORD);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.code, 'TOO_MANY');
  assert.equal((await attempt(other.user.email, PASSWORD)).status, 200);
});

test('the contact limit counts each visitor, not everyone behind the host', async () => {
  const app = await start();
  const send = (ip: string) => app.call('POST', '/api/contact', null, { name: 'Ada', phone: '08031234567', message: 'Hello' }, { 'x-forwarded-for': ip });
  for (let i = 0; i < 5; i += 1) assert.equal((await send('203.0.113.1')).status, 201);
  assert.equal((await send('203.0.113.1')).status, 429);
  assert.equal((await send('203.0.113.2')).status, 201);
});

test('a payment webhook is refused when no secret is configured', async () => {
  const app = await start({ webhookSecret: '' });
  const noHeader = await app.call('POST', '/api/payments/webhook', null, { reference: 'GT-1', amount: 1000, transferId: 't' });
  assert.equal(noHeader.status, 401);
  const emptyHeader = await app.call('POST', '/api/payments/webhook', null, { reference: 'GT-1', amount: 1000, transferId: 't' }, { 'x-gymtrack-webhook-secret': '' });
  assert.equal(emptyHeader.status, 401);
});

test('SolyntaFlow: a reminder that may have gone out is never sent a second time', async () => {
  const env = { SOLYNTAFLOW_TOKEN: 'token', SOLYNTAFLOW_API_URL: 'http://soly.test' } as NodeJS.ProcessEnv;
  const input = { to: '2348031234567', gymnastName: 'Ada', clubName: 'Alpha', message: 'Fee due' };
  const plan = (template: () => Response) => {
    const urls: string[] = [];
    const fetcher = (async (url: string) => {
      urls.push(String(url));
      if (String(url).endsWith('tickets/')) return new Response(JSON.stringify({ id: 7, ticket_number: 'T-7' }), { status: 201 });
      if (String(url).endsWith('send-template/')) return template();
      return new Response(JSON.stringify({ delivery_status: 'sent' }), { status: 201 });
    }) as unknown as typeof fetch;
    return { urls, notifiers: solyntaflowNotifiers(env, fetcher)! };
  };

  const down = plan(() => { throw new TypeError('fetch failed'); });
  const unknown = await down.notifiers.whatsapp!(input);
  assert.equal(unknown.status, 'failed');
  assert.match(unknown.detail, /Not confirmed/);
  assert.ok(!down.urls.some((url) => url.endsWith('messages/')));

  const crashed = plan(() => new Response('{}', { status: 502 }));
  await crashed.notifiers.whatsapp!(input);
  assert.ok(!crashed.urls.some((url) => url.endsWith('messages/')));

  const refused = plan(() => new Response(JSON.stringify({ detail: 'There is no WhatsApp number on this ticket.' }), { status: 400 }));
  const fallback = await refused.notifiers.whatsapp!(input);
  assert.ok(refused.urls.some((url) => url.endsWith('messages/')));
  assert.equal(fallback.status, 'sent');
});

test('SolyntaFlow: a call that hangs gives up', async () => {
  const signals: (AbortSignal | undefined)[] = [];
  const fetcher = (async (_url: string, init?: RequestInit) => {
    signals.push(init?.signal ?? undefined);
    return new Response(JSON.stringify({ id: 1 }), { status: 201 });
  }) as unknown as typeof fetch;
  await solyntaflowNotifiers({ SOLYNTAFLOW_TOKEN: 'token' } as NodeJS.ProcessEnv, fetcher)!.enquiry!({ name: 'A', phone: '0803', message: 'm' });
  assert.ok(signals[0], 'every call carries a time limit');
});

test('an enquiry that could not be delivered is tried again later', async () => {
  let up = false;
  const filed: string[] = [];
  let clock = new Date('2026-11-03T10:00:00Z');
  const store = createBoundStore(emptyDb(), async () => {}, () => clock, {
    enquiry: async ({ name }) => {
      if (!up) throw new Error('down');
      filed.push(name);
    },
  });
  const result = await store.submitContact({ name: 'Ada', phone: '08031234567', message: 'Hello' });
  assert.equal(result.forwarded, false);
  up = true;
  assert.equal(await store.resendContacts(), 0, 'a message still being delivered is left alone');
  clock = new Date('2026-11-03T10:10:00Z');
  assert.equal(await store.resendContacts(), 1);
  assert.deepEqual(filed, ['Ada']);
  assert.equal(await store.resendContacts(), 0);
});

test('saves reach the database in the order they were made', async () => {
  const written: string[] = [];
  const delays: Record<string, number> = { first: 30, second: 1 };
  const save = inOrder(async (doc: string) => {
    await new Promise((resolve) => setTimeout(resolve, delays[doc] ?? 0));
    written.push(doc);
  });
  await Promise.all([save('first'), save('second')]);
  assert.deepEqual(written, ['first', 'second']);

  const failing = inOrder(async (doc: string) => {
    if (doc === 'bad') throw new Error('down');
    written.push(doc);
  });
  await assert.rejects(failing('bad'));
  await failing('after');
  assert.equal(written.at(-1), 'after');
});

test('the server program is not published with the web pages', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as { scripts: Record<string, string> };
  assert.doesNotMatch(pkg.scripts.build, /--outfile=dist\//);
  assert.doesNotMatch(pkg.scripts.start, /dist\//);
});

test('Drive dropping the connection part way through a video does not stop the server', async () => {
  const fetcher = (async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('part of a video'));
    },
    pull() {
      throw new Error('connection lost');
    },
  }), { status: 200 })) as unknown as typeof fetch;
  const storage = driveStorage('folder', async () => 'token', fetcher);
  const outer = express();
  outer.get('/file', (req, res, next) => {
    storage.send({ driveFileId: 'abc' } as never, req, res).catch(next);
  });
  const server = outer.listen(0);
  servers.push(server);
  await once(server, 'listening');
  const uncaught: unknown[] = [];
  const listener = (error: unknown) => uncaught.push(error);
  process.on('uncaughtException', listener);
  await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/file`).then((response) => response.text()).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 100));
  process.off('uncaughtException', listener);
  assert.deepEqual(uncaught, []);
});
