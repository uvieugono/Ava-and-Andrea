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
