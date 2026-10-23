import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createApp } from '../server/createApp.ts';
import { requiredSkills } from '../server/workflow.ts';
import { INITIAL_SKILLS } from '../src/data/gymData.ts';
import { VERIFIED_CLUBS } from '../src/data/verifiedClubs.ts';
import { driveStorage } from '../server/storage.ts';

// Checks for the 20 October 2026 requirements brief.

// A fresh throwaway password per run, so no fixed password sits in the repo.
const PASSWORD = randomBytes(12).toString('hex');

async function start() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gymtrack-b20-'));
  const app = await createApp({ dbPath: path.join(dir, 'db.json'), uploadDir: path.join(dir, 'uploads'), webhookSecret: 'test-secret', devMatch: false, notifiers: {} });
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

  async function upload(token: string, scope = 'private', mime = 'video/mp4', bytes = `bytes-${Math.random()}`) {
    const response = await fetch(`${base}/api/uploads?scope=${scope}&name=file`, {
      method: 'POST',
      headers: { 'content-type': mime, authorization: `Bearer ${token}` },
      body: Buffer.from(bytes),
    });
    return { status: response.status, body: (await response.json()) as any };
  }

  async function club(name: string, email: string) {
    const created = await call('POST', '/api/auth/register-club', undefined, {
      clubName: name, city: 'Lagos', adminName: `${name} admin`, email, password: PASSWORD, phone: '08030000000',
    });
    assert.equal(created.status, 201);
    return { token: created.body.token as string, clubId: created.body.club.id as string };
  }

  async function gymnast(email: string, selectedClubId: string | null) {
    const created = await call('POST', '/api/auth/signup-student', undefined, {
      name: email.split('@')[0], email, password: PASSWORD, phone: '08031234567', dateOfBirth: '2014-01-01', level: 1, selectedClubId,
    });
    assert.equal(created.status, 201);
    return { token: created.body.token as string, id: created.body.user.id as string };
  }

  async function post(token: string, body: Record<string, unknown>) {
    const file = await upload(token, 'public');
    assert.equal(file.status, 201);
    return call('POST', '/api/inspo', token, { skill: 'Cartwheel', category: 'Floor', caption: '', ...body, videoUrl: file.body.url });
  }

  return { server, base, call, upload, club, gymnast, post };
}

test('levels 9 and 10 hold only the skills in the brief, with the right ones required', () => {
  const nine = INITIAL_SKILLS.filter((skill) => skill.level === 9);
  const ten = INITIAL_SKILLS.filter((skill) => skill.level === 10);
  assert.deepEqual(nine.map((skill) => [skill.name, skill.tutorial?.videoId, Boolean(skill.optional)]), [
    ['Double twist', 'hpsgwGvBdW8', false],
    ['Front handspring front full', 'zF59uGgs54Y', false],
    ['Tsukahara pike (vault)', 'Rv5xwDTPACc', true],
  ]);
  assert.deepEqual(ten.map((skill) => [skill.name, skill.tutorial?.videoId, Boolean(skill.optional)]), [['Double back', 'TxmbF-ULIoY', false]]);
  assert.deepEqual(requiredSkills({ level: 9 }).map((skill) => skill.name), ['Double twist', 'Front handspring front full']);
  assert.deepEqual(requiredSkills({ level: 10 }).map((skill) => skill.name), ['Double back']);
  // Other levels are unchanged: Level 8 still has no standard requirements.
  assert.equal(requiredSkills({ level: 8 }).length, 0);
});

test('Find a Club drops Abuja and Lagos State, and Kofunjo is coached by Korede Nejo', () => {
  assert.ok(VERIFIED_CLUBS.every((club) => club.city !== ('Abuja' as string)));
  assert.ok(!VERIFIED_CLUBS.some((club) => club.name === 'Lagos State Gymnastics Club'));
  assert.equal(VERIFIED_CLUBS.find((club) => club.id === 'kofunjo-gymnastics-club')?.coach, 'Korede Nejo');
  assert.ok(VERIFIED_CLUBS.some((club) => club.id === 'tee-tumblers-surulere'));
});

test('connect: a specific-club video is seen only by that club; likes and saves toggle; only the author deletes', async () => {
  const t = await start();
  try {
    const alpha = await t.club('Alpha Club', 'alpha@club.test');
    const beta = await t.club('Beta Club', 'beta@club.test');
    const ava = await t.gymnast('ava@gym.test', alpha.clubId);
    const bola = await t.gymnast('bola@gym.test', beta.clubId);
    const chi = await t.gymnast('chi@gym.test', alpha.clubId);

    const forBeta = await t.post(ava.token, { visibility: 'club', audienceClubId: beta.clubId });
    assert.equal(forBeta.status, 201);
    const forAll = await t.post(ava.token, { visibility: 'everyone' });
    assert.equal(forAll.status, 201);
    assert.equal((await t.post(ava.token, { visibility: 'club', audienceClubId: 'club_missing' })).body.code, 'CLUB_REQUIRED');

    const seenBy = async (token?: string) => (await t.call('GET', '/api/inspo?category=All', token)).body.posts.map((p: any) => p.id).sort();
    assert.deepEqual(await seenBy(bola.token), [forBeta.body.post.id, forAll.body.post.id].sort());
    assert.deepEqual(await seenBy(chi.token), [forAll.body.post.id]);
    assert.deepEqual(await seenBy(), [forAll.body.post.id]);

    // Like, then unlike
    assert.equal((await t.call('POST', `/api/inspo/${forAll.body.post.id}/like`, chi.token)).body.post.liked, true);
    assert.equal((await t.call('GET', '/api/inspo/liked', chi.token)).body.posts.length, 1);
    const unliked = await t.call('POST', `/api/inspo/${forAll.body.post.id}/like`, chi.token);
    assert.equal(unliked.body.post.liked, false);
    assert.equal(unliked.body.post.likes, 0);
    // Save, then unsave
    assert.equal((await t.call('POST', `/api/inspo/${forAll.body.post.id}/save`, chi.token)).body.post.saved, true);
    assert.equal((await t.call('GET', '/api/inspo/saved', chi.token)).body.posts.length, 1);

    // The author's own list shows both; only the author can delete
    assert.equal((await t.call('GET', '/api/inspo/mine', ava.token)).body.posts.length, 2);
    assert.equal((await t.call('DELETE', `/api/inspo/${forAll.body.post.id}`, chi.token)).status, 403);
    assert.equal((await t.call('DELETE', `/api/inspo/${forAll.body.post.id}`, ava.token)).status, 200);
    assert.deepEqual(await seenBy(chi.token), []);
    assert.equal((await t.call('GET', '/api/inspo/saved', chi.token)).body.posts.length, 0);
    assert.deepEqual((await t.call('GET', '/api/inspo/mine', ava.token)).body.posts.map((p: any) => p.id), [forBeta.body.post.id]);
  } finally {
    t.server.close();
  }
});

test('notices: only the club administrator deletes, and only their own club notices', async () => {
  const t = await start();
  try {
    const alpha = await t.club('Alpha Club', 'alpha2@club.test');
    const beta = await t.club('Beta Club', 'beta2@club.test');
    const ava = await t.gymnast('ava2@gym.test', alpha.clubId);
    const notice = await t.call('POST', '/api/club/notices', alpha.token, { title: 'Saturday', body: 'Bring water' });
    assert.equal(notice.status, 201);
    const id = notice.body.notice.id;
    assert.equal((await t.call('DELETE', `/api/club/notices/${id}`, ava.token)).status, 403);
    assert.equal((await t.call('DELETE', `/api/club/notices/${id}`, beta.token)).status, 404);
    assert.equal((await t.call('GET', '/api/notices', ava.token)).body.notices.length, 1);
    assert.equal((await t.call('DELETE', `/api/club/notices/${id}`, alpha.token)).status, 200);
    assert.equal((await t.call('GET', '/api/notices', ava.token)).body.notices.length, 0);
  } finally {
    t.server.close();
  }
});

test('certificates and drills are stored on the server and reach the right gymnast', async () => {
  const t = await start();
  try {
    const alpha = await t.club('Alpha Club', 'alpha3@club.test');
    const beta = await t.club('Beta Club', 'beta3@club.test');
    const ava = await t.gymnast('ava3@gym.test', alpha.clubId);
    const bola = await t.gymnast('bola3@gym.test', alpha.clubId);

    const logo = await t.upload(alpha.token, 'private', 'image/png', 'png-logo');
    const details = await t.call('PATCH', '/api/club/details', alpha.token, { coachName: 'Coach Ada', logoUploadId: logo.body.id });
    assert.equal(details.status, 200);
    assert.equal(details.body.club.coachName, 'Coach Ada');
    assert.equal((await t.call('GET', '/api/club/overview', alpha.token)).body.club.logoUrl, `/api/uploads/${logo.body.id}`);
    // Another club cannot use Alpha's upload
    assert.equal((await t.call('PATCH', '/api/club/details', beta.token, { logoUploadId: logo.body.id })).status, 400);

    const image = await t.upload(alpha.token, 'private', 'image/png', 'png-certificate');
    const missing = await t.call('POST', '/api/club/certificates', alpha.token, { gymnastId: ava.id, title: '', awardDate: '2026-10-20', uploadId: image.body.id });
    assert.equal(missing.body.code, 'MISSING');
    const cert = await t.call('POST', '/api/club/certificates', alpha.token, { gymnastId: ava.id, title: 'Level 1 complete', awardDate: '2026-10-20', template: 'classic', uploadId: image.body.id });
    assert.equal(cert.status, 201);
    assert.equal((await t.call('GET', '/api/certificates', ava.token)).body.certificates.length, 1);
    assert.equal((await t.call('GET', '/api/certificates', bola.token)).body.certificates.length, 0);
    const file = await fetch(`${t.base}/api/uploads/${image.body.id}`, { headers: { authorization: `Bearer ${ava.token}` } });
    assert.equal(file.status, 200);
    assert.equal(await file.text(), 'png-certificate');

    const drill = await t.call('POST', '/api/club/drills', alpha.token, { gymnastIds: [ava.id], title: 'Hollow holds', instructions: '3 x 30 seconds' });
    assert.equal(drill.status, 201);
    assert.equal((await t.call('POST', '/api/club/drills', alpha.token, { gymnastIds: [], title: 'Nobody' })).body.code, 'NO_GYMNASTS');
    await t.call('POST', '/api/club/drills', alpha.token, { gymnastIds: [ava.id, bola.id], title: 'Bridges' });
    assert.deepEqual((await t.call('GET', '/api/drills', ava.token)).body.drills.map((d: any) => d.title), ['Bridges', 'Hollow holds']);
    assert.deepEqual((await t.call('GET', '/api/drills', bola.token)).body.drills.map((d: any) => d.title), ['Bridges']);
    assert.equal((await t.call('GET', '/api/club/overview', alpha.token)).body.drills.length, 2);
  } finally {
    t.server.close();
  }
});

test('a competition is published for several gymnasts with levels, then results and medals are logged', async () => {
  const t = await start();
  try {
    const alpha = await t.club('Alpha Club', 'alpha4@club.test');
    const beta = await t.club('Beta Club', 'beta4@club.test');
    const ava = await t.gymnast('ava4@gym.test', alpha.clubId);
    const bola = await t.gymnast('bola4@gym.test', alpha.clubId);
    const outsider = await t.gymnast('ola4@gym.test', beta.clubId);

    const refused = await t.call('POST', '/api/club/competition-events', alpha.token, { name: 'GymFest', date: '2026-11-07', participants: [{ gymnastId: outsider.id }] });
    assert.equal(refused.status, 404);
    const created = await t.call('POST', '/api/club/competition-events', alpha.token, {
      name: 'GymFest 3.0', date: '2026-11-07', time: '09:00', venue: 'The Dome, Lekki',
      participants: [{ gymnastId: ava.id, level: 'Level 3' }, { gymnastId: bola.id, level: 'Level 4' }],
    });
    assert.equal(created.status, 201);
    const eventId = created.body.competitions[0].eventId;
    const logged = await t.call('POST', `/api/club/competition-events/${eventId}/results`, alpha.token, {
      results: [{ gymnastId: ava.id, result: '1st all-around', medal: 'gold' }, { gymnastId: bola.id, result: '3rd on floor', medal: 'bronze' }],
    });
    assert.equal(logged.status, 200);
    assert.equal((await t.call('POST', `/api/club/competition-events/${eventId}/results`, alpha.token, { results: [{ gymnastId: ava.id, medal: 'platinum' }] })).body.code, 'MEDAL');
    assert.equal((await t.call('POST', `/api/club/competition-events/${eventId}/results`, beta.token, { results: [] })).status, 404);

    const avaView = (await t.call('GET', '/api/competitions', ava.token)).body.competitions;
    assert.equal(avaView.length, 1);
    assert.equal(avaView[0].level, 'Level 3');
    assert.equal(avaView[0].medal, 'gold');
    assert.equal(avaView[0].venue, 'The Dome, Lekki');
    const bolaView = (await t.call('GET', '/api/competitions', bola.token)).body.competitions;
    assert.equal(bolaView[0].medal, 'bronze');
    assert.equal(bolaView[0].level, 'Level 4');
  } finally {
    t.server.close();
  }
});

test('a specific-club video file plays for that club and nobody else', async () => {
  const t = await start();
  try {
    const alpha = await t.club('Alpha Club', 'alpha5@club.test');
    const beta = await t.club('Beta Club', 'beta5@club.test');
    const ava = await t.gymnast('ava5@gym.test', alpha.clubId);
    const bola = await t.gymnast('bola5@gym.test', beta.clubId);
    const chi = await t.gymnast('chi5@gym.test', alpha.clubId);
    const file = await t.upload(ava.token, 'private', 'video/mp4', 'club-only-clip');
    const posted = await t.call('POST', '/api/inspo', ava.token, { skill: 'Cartwheel', category: 'Floor', visibility: 'club', audienceClubId: beta.clubId, videoUrl: file.body.url });
    assert.equal(posted.status, 201);
    const fetchAs = (token?: string) => fetch(`${t.base}${file.body.url}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
    assert.equal((await fetchAs(bola.token)).status, 200);
    assert.equal((await fetchAs(ava.token)).status, 200);
    assert.equal((await fetchAs(chi.token)).status, 403);
    assert.equal((await fetchAs()).status, 401);
  } finally {
    t.server.close();
  }
});

test('a large video arrives in pieces, out-of-order pieces are refused, and the file plays back whole', async () => {
  const t = await start();
  try {
    const club = await t.club('Piece Club', 'piece@club.test');
    const ava = await t.gymnast('piece-ava@gym.test', club.clubId);
    const piece = 8 * 1024 * 1024;
    const whole = Buffer.alloc(piece * 2 + 1234, 7);
    whole[0] = 1;
    whole[whole.length - 1] = 9;
    const begin = await fetch(`${t.base}/api/uploads/sessions?scope=public&name=long.MOV&size=${whole.length}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${ava.token}`, 'x-upload-content-type': '' },
    });
    // No type from the browser: the .MOV name is enough.
    assert.equal(begin.status, 201);
    const { id, pieceSize } = (await begin.json()) as { id: string; pieceSize: number };
    assert.equal(pieceSize, piece);
    const put = (offset: number, body: Buffer, token = ava.token) =>
      fetch(`${t.base}/api/uploads/sessions/${id}?offset=${offset}`, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' }, body });

    assert.equal((await put(piece, whole.subarray(piece, piece * 2))).status, 409);
    const first = await put(0, whole.subarray(0, piece));
    assert.equal(first.status, 200);
    assert.equal(((await first.json()) as { received: number }).received, piece);
    // Someone else cannot add to it
    const other = await t.gymnast('piece-bola@gym.test', club.clubId);
    assert.equal((await put(piece, whole.subarray(piece, piece * 2), other.token)).status, 404);
    assert.equal((await put(piece, whole.subarray(piece, piece * 2))).status, 200);
    const last = await put(piece * 2, whole.subarray(piece * 2));
    assert.equal(last.status, 201);
    const done = (await last.json()) as { url: string; mime: string; size: number };
    assert.equal(done.mime, 'video/quicktime');
    assert.equal(done.size, whole.length);
    const file = Buffer.from(await (await fetch(`${t.base}${done.url}`)).arrayBuffer());
    assert.ok(file.equals(whole));
    // Too big is refused before anything is stored
    const tooBig = await fetch(`${t.base}/api/uploads/sessions?scope=public&name=x.mp4&size=${81 * 1024 * 1024}`, { method: 'POST', headers: { authorization: `Bearer ${ava.token}`, 'x-upload-content-type': 'video/mp4' } });
    assert.equal(tooBig.status, 413);
  } finally {
    t.server.close();
  }
});

test('Google Drive: a file in pieces uses one resumable session with the right byte ranges, and delete removes the Drive file', async () => {
  const calls: { url: string; method: string; headers: Record<string, string>; size: number }[] = [];
  const fake = (async (url: string, init: RequestInit = {}) => {
    const headers = (init.headers ?? {}) as Record<string, string>;
    const size = init.body instanceof Uint8Array ? init.body.length : 0;
    calls.push({ url, method: String(init.method ?? 'GET'), headers, size });
    if (url.includes('uploadType=resumable')) return new Response('{}', { status: 200, headers: { location: 'https://upload.test/s1' } });
    if (url === 'https://upload.test/s1') {
      return headers['content-range'].endsWith('-19/20') ? new Response(JSON.stringify({ id: 'drive-9' }), { status: 200 }) : new Response(null, { status: 308 });
    }
    if (url.includes('/drive/v3/files/drive-9') && init.method === 'DELETE') return new Response(null, { status: 204 });
    return new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;
  const drive = driveStorage('FOLDER', async () => 'tok', fake);
  const session = await drive.begin('video/mp4', 'clip.mp4', 20, 'unused.mp4');
  assert.equal(session, 'https://upload.test/s1');
  assert.equal(calls[0].headers['x-upload-content-length'], '20');
  assert.equal(await drive.append(session, Buffer.alloc(8), 0, 20), null);
  assert.equal(await drive.append(session, Buffer.alloc(8), 8, 20), null);
  assert.deepEqual(await drive.append(session, Buffer.alloc(4), 16, 20), { driveFileId: 'drive-9' });
  assert.deepEqual(calls.slice(1).map((c) => c.headers['content-range']), ['bytes 0-7/20', 'bytes 8-15/20', 'bytes 16-19/20']);
  await drive.remove({ id: 'u', ownerId: 'o', clubId: null, scope: 'private', mime: 'video/mp4', name: 'clip.mp4', size: 20, driveFileId: 'drive-9', createdAt: '' });
  assert.equal(calls.at(-1)?.method, 'DELETE');
});

test('a gymnast with a club never has to pay; one without a club does once the free week ends', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gymtrack-pay-'));
  let clock = Date.parse('2026-10-24T09:00:00Z');
  const app = await createApp({ dbPath: path.join(dir, 'db.json'), uploadDir: path.join(dir, 'uploads'), webhookSecret: 'test-secret', devMatch: false, notifiers: {}, now: () => new Date(clock) });
  const server = app.listen(0);
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (method: string, url: string, token?: string, body?: unknown) => {
    const r = await fetch(`${base}${url}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: (await r.json().catch(() => ({}))) as any };
  };
  try {
    const club = await call('POST', '/api/auth/register-club', undefined, { clubName: 'Pay Club', city: 'Lagos', adminName: 'Admin', email: 'pay@club.test', password: PASSWORD, phone: '08030000000' });
    const signup = (email: string, selectedClubId: string | null) =>
      call('POST', '/api/auth/signup-student', undefined, { name: 'Gymnast', email, password: PASSWORD, phone: '08031234567', dateOfBirth: '2014-01-01', level: 1, selectedClubId });
    const withClub = await signup('with-club@gym.test', club.body.club.id);
    const noClub = await signup('no-club@gym.test', null);
    assert.equal(withClub.body.user.access, 'club');
    assert.equal(withClub.body.payment, null);
    assert.equal(noClub.body.user.access, 'trial');

    clock += 30 * 86400000; // a month later
    const meWith = await call('GET', '/api/me', withClub.body.token);
    const meWithout = await call('GET', '/api/me', noClub.body.token);
    assert.equal(meWith.body.user.access, 'club');
    assert.equal(meWith.body.user.periodEnd, null);
    assert.equal(meWithout.body.user.access, 'locked');
    assert.ok(meWithout.body.payment);
    // Paid-only actions: the club gymnast is let through, the other is asked to pay
    assert.equal((await call('GET', '/api/inspo/saved', withClub.body.token)).status, 200);
    assert.equal((await call('GET', '/api/inspo/saved', noClub.body.token)).body.code, 'PAYMENT_REQUIRED');
    // Choosing a club later also ends the need to pay
    await call('PATCH', '/api/me', noClub.body.token, { selectedClubId: club.body.club.id });
    assert.equal((await call('GET', '/api/me', noClub.body.token)).body.user.access, 'club');
  } finally {
    server.close();
  }
});

test('a club deletes a stored document, and another club cannot', async () => {
  const t = await start();
  try {
    const alpha = await t.club('Doc Club', 'doc-a@club.test');
    const beta = await t.club('Other Club', 'doc-b@club.test');
    const file = await t.upload(alpha.token, 'private', 'application/pdf', '%PDF-1.4 handbook');
    const doc = await t.call('POST', '/api/club/documents', alpha.token, { name: 'Handbook.pdf', uploadId: file.body.id });
    assert.equal((await t.call('DELETE', `/api/club/documents/${doc.body.document.id}`, beta.token)).status, 404);
    assert.equal((await t.call('DELETE', `/api/club/documents/${doc.body.document.id}`, alpha.token)).status, 200);
    assert.equal((await t.call('GET', '/api/club/overview', alpha.token)).body.documents.length, 0);
    const gone = await fetch(`${t.base}${file.body.url}`, { headers: { authorization: `Bearer ${alpha.token}` } });
    assert.equal(gone.status, 404);
  } finally {
    t.server.close();
  }
});
