import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createApp } from '../server/createApp.ts';
import { requiredSkills } from '../server/workflow.ts';
import { INITIAL_SKILLS } from '../src/data/gymData.ts';
import type { Notifiers } from '../server/workflow.ts';

async function start(notifiers: Notifiers = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gymtrack-wf-'));
  const app = await createApp({
    dbPath: path.join(dir, 'db.json'),
    uploadDir: path.join(dir, 'uploads'),
    webhookSecret: 'test-secret',
    devMatch: false,
    notifiers,
  });
  const server = app.listen(0);
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  async function call(method: string, url: string, token?: string, body?: unknown) {
    const response = await fetch(`${base}${url}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json().catch(() => ({}))) as any };
  }

  async function upload(token: string, scope = 'private', mime = 'video/mp4', bytes = 'clip-bytes') {
    const response = await fetch(`${base}/api/uploads?scope=${scope}&name=clip.mp4`, {
      method: 'POST',
      headers: { 'content-type': mime, authorization: `Bearer ${token}` },
      body: Buffer.from(bytes),
    });
    return { status: response.status, body: (await response.json()) as any };
  }

  async function club(name: string, email: string) {
    const created = await call('POST', '/api/auth/register-club', undefined, {
      clubName: name, city: 'Lagos', adminName: `${name} admin`, email, password: 'club-pass-1', phone: '08030000000',
    });
    assert.equal(created.status, 201);
    return { token: created.body.token as string, clubId: created.body.club.id as string };
  }

  async function gymnast(email: string, selectedClubId: string | null, phone = '08031234567') {
    const created = await call('POST', '/api/auth/signup-student', undefined, {
      name: email.split('@')[0], email, password: 'gym-pass-1', phone, dateOfBirth: '2014-01-01', level: 1, selectedClubId,
    });
    assert.equal(created.status, 201);
    return { token: created.body.token as string, id: created.body.user.id as string, user: created.body.user };
  }

  return { server, base, call, upload, club, gymnast };
}

async function submit(t: Awaited<ReturnType<typeof start>>, token: string, skillId: string) {
  const file = await t.upload(token, 'private', 'video/mp4', `evidence-${skillId}-${Math.random()}`);
  assert.equal(file.status, 201);
  return t.call('POST', `/api/skills/${skillId}/submit`, token, { videoUrl: file.body.url, videoName: 'evidence.mp4' });
}

test('a skill moves pending -> rejected -> pending -> approved and the level advances once', async () => {
  const t = await start();
  try {
    const club = await t.club('Alpha Club', 'alpha@club.test');
    const ava = await t.gymnast('ava@gym.test', club.clubId);
    assert.equal(ava.user.selectedClubId, club.clubId);
    assert.equal(ava.user.phone, '08031234567');
    assert.equal(ava.user.progress.approved, 0);

    const required = requiredSkills({ level: 1, offersBars: true, offersBeam: true });
    assert.ok(required.length > 2);
    const [first, ...rest] = required;

    const sent = await submit(t, ava.token, first.id);
    assert.equal(sent.status, 201);
    assert.equal(sent.body.statuses[first.id].status, 'PENDING');
    // The same skill cannot be sent twice while it waits
    assert.equal((await submit(t, ava.token, first.id)).status, 409);
    // A skill from another level is refused
    const other = INITIAL_SKILLS.find((item) => item.level === 2)!;
    assert.equal((await submit(t, ava.token, other.id)).body.code, 'WRONG_LEVEL');

    const overview = await t.call('GET', '/api/club/overview', club.token);
    assert.equal(overview.status, 200);
    const row = overview.body.gymnasts.find((item: any) => item.id === ava.id);
    assert.equal(row.progress.pending, 1);
    const submissionId = row.submissions[0].id as string;

    // A decision needs a comment, and only club staff may make it
    assert.equal((await t.call('POST', `/api/club/submissions/${submissionId}/review`, club.token, { decision: 'REJECTED', comment: '  ' })).body.code, 'COMMENT_REQUIRED');
    assert.equal((await t.call('POST', `/api/club/submissions/${submissionId}/review`, ava.token, { decision: 'APPROVED', comment: 'self' })).status, 403);
    const stranger = await t.club('Beta Club', 'beta@club.test');
    assert.equal((await t.call('POST', `/api/club/submissions/${submissionId}/review`, stranger.token, { decision: 'APPROVED', comment: 'not mine' })).status, 404);

    const rejected = await t.call('POST', `/api/club/submissions/${submissionId}/review`, club.token, { decision: 'REJECTED', comment: 'Keep your legs straight.' });
    assert.equal(rejected.status, 200);
    let mine = await t.call('GET', '/api/me/skills', ava.token);
    assert.equal(mine.body.statuses[first.id].status, 'REJECTED');
    assert.equal(mine.body.statuses[first.id].comment, 'Keep your legs straight.');
    assert.equal(mine.body.progress.approved, 0);
    // Reviewing the same submission again changes nothing
    assert.equal((await t.call('POST', `/api/club/submissions/${submissionId}/review`, club.token, { decision: 'APPROVED', comment: 'again' })).status, 409);

    // Rejected skills can be sent again
    const again = await submit(t, ava.token, first.id);
    assert.equal(again.status, 201);
    const approveFirst = await t.call('POST', `/api/club/submissions/${again.body.submission.id}/review`, club.token, { decision: 'APPROVED', comment: 'Clean.' });
    assert.equal(approveFirst.body.advanced, false);

    // Approve all but the last: no advance. Approve the last: advance exactly one level.
    for (const skill of rest.slice(0, -1)) {
      const result = await submit(t, ava.token, skill.id);
      const decided = await t.call('POST', `/api/club/submissions/${result.body.submission.id}/review`, club.token, { decision: 'APPROVED', comment: 'Good.' });
      assert.equal(decided.body.advanced, false);
    }
    mine = await t.call('GET', '/api/me', ava.token);
    assert.equal(mine.body.user.level, 1);
    const last = rest[rest.length - 1];
    const lastSent = await submit(t, ava.token, last.id);
    // A pending last skill does not advance the gymnast
    assert.equal((await t.call('GET', '/api/me', ava.token)).body.user.level, 1);
    const final = await t.call('POST', `/api/club/submissions/${lastSent.body.submission.id}/review`, club.token, { decision: 'APPROVED', comment: 'Last one.' });
    assert.equal(final.body.advanced, true);
    assert.equal(final.body.level, 2);
    assert.equal((await t.call('POST', `/api/club/submissions/${lastSent.body.submission.id}/review`, club.token, { decision: 'APPROVED', comment: 'replay' })).status, 409);
    const after = await t.call('GET', '/api/me', ava.token);
    assert.equal(after.body.user.level, 2);
    assert.equal(after.body.user.progress.approved, 0);
    const clubView = await t.call('GET', '/api/club/overview', club.token);
    assert.equal(clubView.body.gymnasts.find((item: any) => item.id === ava.id).level, 2);
  } finally {
    t.server.close();
  }
});

test('gymnasts cannot use club-only features or read each other\'s evidence', async () => {
  const t = await start();
  try {
    const club = await t.club('Alpha Club', 'alpha2@club.test');
    const ava = await t.gymnast('ava2@gym.test', club.clubId);
    const bola = await t.gymnast('bola2@gym.test', club.clubId);
    for (const url of ['/api/club/overview']) {
      assert.equal((await t.call('GET', url, ava.token)).status, 403);
    }
    assert.equal((await t.call('POST', '/api/club/notices', ava.token, { title: 'x', body: 'y' })).status, 403);
    assert.equal((await t.call('POST', '/api/club/competitions', ava.token, { gymnastId: ava.id, name: 'x', date: '2026-10-10' })).status, 403);
    assert.equal((await t.call('GET', '/api/club/overview')).status, 401);

    const file = await t.upload(ava.token);
    assert.equal((await fetch(`${t.base}${file.body.url}?token=${ava.token}`)).status, 200);
    assert.equal((await fetch(`${t.base}${file.body.url}?token=${bola.token}`)).status, 403);
    assert.equal((await fetch(`${t.base}${file.body.url}`)).status, 401);
    // The gymnast's own club can open it; another club cannot
    const otherClub = await t.club('Other Club', 'other2@club.test');
    assert.equal((await fetch(`${t.base}${file.body.url}?token=${otherClub.token}`)).status, 403);
    const skill = requiredSkills({ level: 1 })[0];
    await t.call('POST', `/api/skills/${skill.id}/submit`, ava.token, { videoUrl: file.body.url });
    assert.equal((await fetch(`${t.base}${file.body.url}?token=${club.token}`)).status, 200);
    // Someone else's upload cannot be submitted
    assert.equal((await t.call('POST', `/api/skills/${skill.id}/submit`, bola.token, { videoUrl: file.body.url })).status, 400);
  } finally {
    t.server.close();
  }
});

test('notices, competitions and the profile follow the right club and gymnast', async () => {
  const t = await start();
  try {
    const alpha = await t.club('Alpha Club', 'alpha3@club.test');
    const beta = await t.club('Beta Club', 'beta3@club.test');
    const ava = await t.gymnast('ava3@gym.test', alpha.clubId);
    const bola = await t.gymnast('bola3@gym.test', beta.clubId);
    const loner = await t.gymnast('loner3@gym.test', null);
    assert.equal(loner.user.clubName, null);
    assert.equal(loner.user.selectedClubId, null);

    await t.call('POST', '/api/club/notices', alpha.token, { title: 'Saturday session', body: '9am, bring water' });
    assert.equal((await t.call('GET', '/api/notices', ava.token)).body.notices.length, 1);
    assert.equal((await t.call('GET', '/api/notices', bola.token)).body.notices.length, 0);
    assert.equal((await t.call('GET', '/api/notices', loner.token)).body.notices.length, 0);
    assert.equal((await t.call('GET', '/api/notices', alpha.token)).body.notices.length, 1);

    const comp = await t.call('POST', '/api/club/competitions', alpha.token, {
      gymnastId: ava.id, name: 'GymFest 3.0', date: '2026-11-07', events: ['Floor', 'Vault'], result: '2nd place', comments: 'Clean routines',
    });
    assert.equal(comp.status, 201);
    // A club cannot record a competition for another club's gymnast
    assert.equal((await t.call('POST', '/api/club/competitions', alpha.token, { gymnastId: bola.id, name: 'x', date: '2026-11-07' })).status, 404);
    assert.equal((await t.call('POST', '/api/club/competitions', alpha.token, { gymnastId: ava.id, name: 'x', date: 'soon' })).body.code, 'DATE');
    const avaComps = await t.call('GET', '/api/competitions', ava.token);
    assert.equal(avaComps.body.competitions.length, 1);
    assert.equal(avaComps.body.competitions[0].result, '2nd place');
    assert.equal((await t.call('GET', '/api/competitions', bola.token)).body.competitions.length, 0);

    // Profile: choose a club later, phone must be sensible, a club-added gymnast is locked
    const chose = await t.call('PATCH', '/api/me', loner.token, { selectedClubId: beta.clubId, phone: '0803 111 2222' });
    assert.equal(chose.body.user.selectedClubName, 'Beta Club');
    assert.equal(chose.body.user.phone, '0803 111 2222');
    assert.equal((await t.call('PATCH', '/api/me', loner.token, { phone: '12' })).body.code, 'PHONE_INVALID');
    assert.equal((await t.call('PATCH', '/api/me', loner.token, { selectedClubId: 'club_nope' })).body.code, 'CLUB_NOT_FOUND');
    assert.equal((await t.call('GET', '/api/clubs?accounts=1')).body.clubs.length, 2);
  } finally {
    t.server.close();
  }
});

test('contact form saves the enquiry and emails it only when email is configured', async () => {
  const sent: { name: string; phone: string; message: string }[] = [];
  const configured = await start({ mail: async (message) => { sent.push(message); } });
  const unconfigured = await start();
  try {
    assert.equal((await configured.call('POST', '/api/contact', undefined, { name: 'Ada', phone: '', message: 'hi' })).status, 400);
    assert.equal((await configured.call('POST', '/api/contact', undefined, { name: 'Ada', phone: '0803 123 4567', message: '' })).status, 400);
    const ok = await configured.call('POST', '/api/contact', undefined, { name: 'Ada', phone: '0803 123 4567', message: 'Do you run classes?' });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.emailed, true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].name, 'Ada');
    const saved = await unconfigured.call('POST', '/api/contact', undefined, { name: 'Ada', phone: '0803 123 4567', message: 'Hello' });
    assert.equal(saved.status, 201);
    assert.equal(saved.body.emailed, false);
  } finally {
    configured.server.close();
    unconfigured.server.close();
  }
});

test('fee reminders go to the gymnast\'s own number and report what really happened', async () => {
  const calls: { to: string; gymnastName: string }[] = [];
  const t = await start({
    whatsapp: async (input) => {
      calls.push(input);
      return { status: 'sent', detail: 'wamid.1' };
    },
  });
  const plain = await start();
  try {
    const club = await t.club('Alpha Club', 'alpha4@club.test');
    const ava = await t.gymnast('ava4@gym.test', club.clubId, '0803 123 4567');
    const sent = await t.call('POST', '/api/club/fee-reminders', club.token, { gymnastId: ava.id, message: 'October fee of N5,000 is due.' });
    assert.equal(sent.body.reminder.status, 'sent');
    assert.equal(calls[0].to, '2348031234567');
    assert.equal(calls[0].gymnastName, 'ava4');

    const other = await t.club('Beta Club', 'beta4@club.test');
    assert.equal((await t.call('POST', '/api/club/fee-reminders', other.token, { gymnastId: ava.id, message: 'x' })).status, 404);

    const club2 = await plain.club('Gamma Club', 'gamma4@club.test');
    const kemi = await plain.gymnast('kemi4@gym.test', club2.clubId);
    const unsent = await plain.call('POST', '/api/club/fee-reminders', club2.token, { gymnastId: kemi.id, message: 'Fee due' });
    assert.equal(unsent.body.reminder.status, 'not_configured');
  } finally {
    t.server.close();
    plain.server.close();
  }
});

test('uploads reject unknown file types and empty files', async () => {
  const t = await start();
  try {
    const club = await t.club('Alpha Club', 'alpha5@club.test');
    const ava = await t.gymnast('ava5@gym.test', club.clubId);
    assert.equal((await t.upload(ava.token, 'private', 'application/x-msdownload')).status, 415);
    assert.equal((await t.upload(ava.token, 'private', 'video/mp4', '')).status, 400);
    // Documents are for club staff
    assert.equal((await t.upload(ava.token, 'private', 'application/pdf')).status, 403);
    const doc = await t.upload(club.token, 'private', 'application/pdf', '%PDF-1.4');
    assert.equal(doc.status, 201);
    const saved = await t.call('POST', '/api/club/documents', club.token, { name: 'Handbook.pdf', uploadId: doc.body.id });
    assert.equal(saved.status, 201);
    assert.equal((await t.call('GET', '/api/club/overview', club.token)).body.documents.length, 1);
  } finally {
    t.server.close();
  }
});

test('connect: a child needs a parent first, then publishing keeps the video and links it to the gymnast', async () => {
  const t = await start();
  try {
    const club = await t.club('Alpha Club', 'alpha6@club.test');
    const ava = await t.gymnast('ava6@gym.test', club.clubId);
    const blocked = await t.upload(ava.token, 'public');
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.code, 'PARENT_REQUIRED');

    await t.call('POST', `/api/students/${ava.id}/parent`, undefined, { parentEmail: 'mum@gym.test' });
    const stored = await t.upload(ava.token, 'public', 'video/mp4', 'x'.repeat(2_000_000));
    assert.equal(stored.status, 201);

    // A post without a video, or pointing at someone else's file, is refused
    assert.equal((await t.call('POST', '/api/inspo', ava.token, { videoUrl: '', skill: 'Cartwheel', category: 'Floor', visibility: 'everyone' })).body.code, 'VIDEO_REQUIRED');
    assert.equal((await t.call('POST', '/api/inspo', ava.token, { videoUrl: 'https://example.com/a.mp4', skill: 'Cartwheel', category: 'Floor', visibility: 'everyone' })).body.code, 'VIDEO_INVALID');

    const posted = await t.call('POST', '/api/inspo', ava.token, { videoUrl: stored.body.url, caption: 'Cartwheel', skill: 'Cartwheel', category: 'Floor', visibility: 'everyone' });
    assert.equal(posted.status, 201);
    assert.equal(posted.body.post.authorId, ava.id);

    // Still there for everyone, signed in or not, and the file plays
    const feed = await t.call('GET', '/api/inspo?category=All');
    assert.equal(feed.body.posts[0].videoUrl, stored.body.url);
    const file = await fetch(`${t.base}${stored.body.url}`);
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('content-type'), 'video/mp4');
    assert.equal((await file.arrayBuffer()).byteLength, 2_000_000);
  } finally {
    t.server.close();
  }
});

test('SolyntaFlow: enquiries become tickets and fee reminders are sent as ticket replies', async () => {
  const { solyntaflowNotifiers } = await import('../server/solyntaflow.ts');
  const seen: { url: string; auth: string | null; body: any }[] = [];
  let ticketNo = 0;
  const fake = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    seen.push({ url, auth: (init.headers as Record<string, string>).authorization, body });
    if (url.endsWith('/tickets/')) {
      ticketNo += 1;
      return new Response(JSON.stringify({ id: ticketNo, ticket_number: `TKT-${ticketNo}` }), { status: 201 });
    }
    const text = String(body.body ?? body.params?.[2] ?? '');
    if (url.endsWith('/send-template/') && text.includes('PLAINONLY')) return new Response(JSON.stringify({ delivery_status: 'failed', delivery_error: 'Template not approved (132001)' }), { status: 201 });
    return new Response(JSON.stringify(text.includes('FAIL') ? { delivery_status: 'failed', delivery_error: 'Outside the 24 hour window' } : { delivery_status: 'sent' }), { status: 201 });
  }) as unknown as typeof fetch;

  assert.equal(solyntaflowNotifiers({} as NodeJS.ProcessEnv, fake), null);
  const soly = solyntaflowNotifiers({ SOLYNTAFLOW_TOKEN: 'tok', SOLYNTAFLOW_API_URL: 'https://soly.test/' } as unknown as NodeJS.ProcessEnv, fake)!;

  await soly.enquiry!({ name: 'Ada', phone: '0803 111 2222', message: 'Classes?' });
  assert.equal(seen[0].url, 'https://soly.test/api/customer-service/tickets/');
  assert.equal(seen[0].auth, 'Token tok');
  assert.equal(seen[0].body.customer_phone, '0803 111 2222');
  assert.equal(seen[0].body.description, 'Classes?');

  const ok = await soly.whatsapp!({ to: '2348031234567', gymnastName: 'Ava', clubName: 'Alpha', message: 'Fee due' });
  assert.equal(ok.status, 'sent');
  assert.equal(seen[1].body.customer_phone, '+2348031234567');
  // the approved template is tried first
  assert.equal(seen[2].url, 'https://soly.test/api/customer-service/tickets/2/send-template/');
  assert.deepEqual(seen[2].body, { template: 'gymtrack_fee_reminder_v1', params: ['Ava', 'Alpha', 'Fee due'] });

  // Template refused, plain message delivered (they wrote in the last 24 hours)
  const fallback = await soly.whatsapp!({ to: '2348031234567', gymnastName: 'Ava', clubName: 'Alpha', message: 'PLAINONLY' });
  assert.equal(fallback.status, 'sent');
  assert.equal(seen[seen.length - 1].url, 'https://soly.test/api/customer-service/messages/');

  // Both refused: the reason says what each one said
  const bad = await soly.whatsapp!({ to: '2348031234567', gymnastName: 'Ava', clubName: 'Alpha', message: 'PLAINONLY FAIL' });
  assert.equal(bad.status, 'failed');
  assert.match(bad.detail, /132001/);
  assert.match(bad.detail, /24 hour/);

  // The contact form uses it: the enquiry is saved and filed, with no email needed
  const filed: string[] = [];
  const t = await start({ enquiry: async (m) => { filed.push(m.name); } });
  try {
    const res = await t.call('POST', '/api/contact', undefined, { name: 'Ada', phone: '0803 111 2222', message: 'Hi' });
    assert.equal(res.body.forwarded, true);
    assert.deepEqual(filed, ['Ada']);
  } finally {
    t.server.close();
  }
});

test('Google Drive storage: files go to the one folder and are served back only through GymTrack', async () => {
  const { driveStorage } = await import('../server/storage.ts');
  const calls: { url: string; method: string; headers: Record<string, string>; body?: any }[] = [];
  const bytes = Buffer.from('0123456789');
  const fake = (async (url: string, init: RequestInit = {}) => {
    const headers = (init.headers ?? {}) as Record<string, string>;
    calls.push({ url, method: String(init.method ?? 'GET'), headers, body: init.body });
    if (url.includes('uploadType=resumable')) return new Response('{}', { status: 200, headers: { location: 'https://upload.test/session1' } });
    if (url === 'https://upload.test/session1') return new Response(JSON.stringify({ id: 'drive-1' }), { status: 200 });
    if (url.includes('/drive/v3/files/drive-1?alt=media')) {
      return headers.range
        ? new Response(bytes.subarray(2, 6), { status: 206, headers: { 'content-range': 'bytes 2-5/10', 'content-length': '4' } })
        : new Response(bytes, { status: 200, headers: { 'content-length': '10' } });
    }
    return new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;
  const drive = driveStorage('FOLDER', async () => 'tok', fake);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gymtrack-drive-'));
  const app = await createApp({ dbPath: path.join(dir, 'db.json'), storage: drive, devMatch: false, notifiers: {} });
  const server = app.listen(0);
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const call = async (method: string, url: string, token?: string, body?: unknown) => {
      const r = await fetch(`${base}${url}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: r.status, body: (await r.json().catch(() => ({}))) as any };
    };
    const club = await call('POST', '/api/auth/register-club', undefined, { clubName: 'A', city: 'Lagos', adminName: 'Ad', email: 'drive@club.test', password: 'club-pass-1', phone: '0803000000' });
    const ava = await call('POST', '/api/auth/signup-student', undefined, { name: 'Ava', email: 'drive@gym.test', password: 'gym-pass-1', phone: '08031234567', dateOfBirth: '2014-01-01', selectedClubId: club.body.club.id });
    const sent = await fetch(`${base}/api/uploads?name=clip.mp4`, { method: 'POST', headers: { 'content-type': 'video/mp4', authorization: `Bearer ${ava.body.token}` }, body: bytes });
    assert.equal(sent.status, 201);
    const { url } = (await sent.json()) as { url: string };
    const start = calls.find((c) => c.url.includes('uploadType=resumable'))!;
    assert.equal(start.headers.authorization, 'Bearer tok');
    assert.deepEqual(JSON.parse(start.body).parents, ['FOLDER']);

    // Served through GymTrack with its own access check, including video range requests
    assert.equal((await fetch(`${base}${url}`)).status, 401);
    const whole = await fetch(`${base}${url}?token=${ava.body.token}`);
    assert.equal(whole.status, 200);
    assert.equal(Buffer.from(await whole.arrayBuffer()).toString(), '0123456789');
    const part = await fetch(`${base}${url}?token=${ava.body.token}`, { headers: { range: 'bytes=2-5' } });
    assert.equal(part.status, 206);
    assert.equal(Buffer.from(await part.arrayBuffer()).toString(), '2345');
    const other = await call('POST', '/api/auth/register-club', undefined, { clubName: 'B', city: 'Lagos', adminName: 'Bd', email: 'drive2@club.test', password: 'club-pass-1', phone: '0803000001' });
    assert.equal((await fetch(`${base}${url}?token=${other.body.token}`)).status, 403);
  } finally {
    server.close();
  }

  // Drive refusing for lack of storage is reported plainly
  const quota = driveStorage('F', async () => 't', (async (u: string) => u.includes('resumable')
    ? new Response(JSON.stringify({ error: { message: 'quota', errors: [{ reason: 'storageQuotaExceeded' }] } }), { status: 403 })
    : new Response('{}')) as unknown as typeof fetch);
  await assert.rejects(() => quota.put(Buffer.from('x'), 'video/mp4', 'x.mp4', 'x'), /Shared Drive/);
});
