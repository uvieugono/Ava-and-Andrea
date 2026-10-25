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

// Checks for "GymTrack Complete Development Instructions".

const PASSWORD = randomBytes(12).toString('hex');
const OPERATOR = 'operator@gym.test';
process.env.GYMTRACK_OPERATOR_EMAILS = OPERATOR;

async function start() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gymtrack-cd-'));
  let clock = Date.parse('2026-10-25T09:00:00Z');
  const app = await createApp({ dbPath: path.join(dir, 'db.json'), uploadDir: path.join(dir, 'uploads'), webhookSecret: 'test-secret', devMatch: false, notifiers: {}, now: () => new Date(clock) });
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
  async function upload(token: string, scope = 'private') {
    const response = await fetch(`${base}/api/uploads?scope=${scope}&name=clip.mp4`, {
      method: 'POST',
      headers: { 'content-type': 'video/mp4', authorization: `Bearer ${token}` },
      body: Buffer.from(`clip-${Math.random()}`),
    });
    return (await response.json()) as { id: string; url: string };
  }
  async function club(name: string, email: string) {
    const created = await call('POST', '/api/auth/register-club', undefined, { clubName: name, city: 'Lagos', adminName: `${name} admin`, email, password: PASSWORD, phone: '08030000000' });
    assert.equal(created.status, 201);
    return { token: created.body.token as string, clubId: created.body.club.id as string };
  }
  async function gymnast(email: string, selectedClubId: string | null) {
    const created = await call('POST', '/api/auth/signup-student', undefined, { name: email.split('@')[0], email, password: PASSWORD, phone: '08031234567', dateOfBirth: '2014-01-01', level: 1, selectedClubId });
    assert.equal(created.status, 201);
    return { token: created.body.token as string, id: created.body.user.id as string };
  }
  const advanceDays = (days: number) => { clock += days * 86400000; };
  return { server, base, call, upload, club, gymnast, advanceDays };
}

test('1. "All Clubs" videos reach every registered user; one-club videos only that club; files follow the same rule', async () => {
  const t = await start();
  try {
    const alpha = await t.club('Alpha', 'a1@club.test');
    const beta = await t.club('Beta', 'b1@club.test');
    const author = await t.gymnast('author1@gym.test', alpha.clubId);
    const betaGym = await t.gymnast('betagym1@gym.test', beta.clubId);
    const noClub = await t.gymnast('noclub1@gym.test', null);

    const allFile = await t.upload(author.token, 'public');
    const all = await t.call('POST', '/api/inspo', author.token, { skill: 'Cartwheel', category: 'Floor', visibility: 'everyone', videoUrl: allFile.url });
    const betaFile = await t.upload(author.token, 'private');
    const onlyBeta = await t.call('POST', '/api/inspo', author.token, { skill: 'Cartwheel', category: 'Floor', visibility: 'club', audienceClubId: beta.clubId, videoUrl: betaFile.url });

    const feed = async (token?: string) => (await t.call('GET', '/api/inspo?category=All', token)).body.posts.map((p: any) => p.id).sort();
    assert.deepEqual(await feed(noClub.token), [all.body.post.id]);
    assert.deepEqual(await feed(betaGym.token), [all.body.post.id, onlyBeta.body.post.id].sort());
    assert.deepEqual(await feed(beta.token), [all.body.post.id, onlyBeta.body.post.id].sort());
    assert.deepEqual(await feed(alpha.token), [all.body.post.id]);
    assert.deepEqual(await feed(), []);

    const get = (url: string, token?: string) => fetch(`${t.base}${url}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
    assert.equal((await get(allFile.url, noClub.token)).status, 200);
    assert.equal((await get(allFile.url)).status, 401);
    assert.equal((await get(betaFile.url, beta.token)).status, 200);
    assert.equal((await get(betaFile.url, noClub.token)).status, 403);
    // The shared-link lookup follows the same rule
    assert.equal((await t.call('GET', `/api/inspo/post/${onlyBeta.body.post.id}`, noClub.token)).status, 404);
    assert.equal((await t.call('GET', `/api/inspo/post/${onlyBeta.body.post.id}`, betaGym.token)).status, 200);
  } finally {
    t.server.close();
  }
});

test('2. a gymnast withdraws their own pending video; it leaves the queue and cannot be approved', async () => {
  const t = await start();
  try {
    const club = await t.club('Queue', 'q2@club.test');
    const ava = await t.gymnast('ava2@gym.test', club.clubId);
    const bola = await t.gymnast('bola2@gym.test', club.clubId);
    const [skill, second] = requiredSkills({ level: 1 });
    const file = await t.upload(ava.token);
    const sent = await t.call('POST', `/api/skills/${skill.id}/submit`, ava.token, { videoUrl: file.url, videoName: 'a.mp4' });
    const id = sent.body.submission.id;

    assert.equal((await t.call('DELETE', `/api/skills/submissions/${id}`, bola.token)).status, 404);
    assert.equal((await t.call('DELETE', `/api/skills/submissions/${id}`, club.token)).status, 404);
    const withdrawn = await t.call('DELETE', `/api/skills/submissions/${id}`, ava.token);
    assert.equal(withdrawn.status, 200);
    assert.equal(withdrawn.body.statuses[skill.id], undefined);
    const overview = await t.call('GET', '/api/club/overview', club.token);
    assert.equal(overview.body.gymnasts.find((g: any) => g.id === ava.id).submissions.length, 0);
    assert.equal((await t.call('POST', `/api/club/submissions/${id}/review`, club.token, { decision: 'APPROVED', comment: 'Good' })).status, 404);
    assert.equal((await fetch(`${t.base}${file.url}`, { headers: { authorization: `Bearer ${ava.token}` } })).status, 404);

    // An approved video cannot be withdrawn
    const file2 = await t.upload(ava.token);
    const sent2 = await t.call('POST', `/api/skills/${second.id}/submit`, ava.token, { videoUrl: file2.url });
    await t.call('POST', `/api/club/submissions/${sent2.body.submission.id}/review`, club.token, { decision: 'APPROVED', comment: 'Lovely' });
    const refused = await t.call('DELETE', `/api/skills/submissions/${sent2.body.submission.id}`, ava.token);
    assert.equal(refused.status, 409);
    assert.equal(refused.body.code, 'NOT_PENDING');
  } finally {
    t.server.close();
  }
});

test('3. a coach removes an approval: back to pending, video kept, history kept, can be decided again', async () => {
  const t = await start();
  try {
    const club = await t.club('Approve', 'p3@club.test');
    const other = await t.club('Other', 'o3@club.test');
    const ava = await t.gymnast('ava3@gym.test', club.clubId);
    const [skill] = requiredSkills({ level: 1 });
    const file = await t.upload(ava.token);
    const sent = await t.call('POST', `/api/skills/${skill.id}/submit`, ava.token, { videoUrl: file.url });
    const id = sent.body.submission.id;
    await t.call('POST', `/api/club/submissions/${id}/review`, club.token, { decision: 'APPROVED', comment: 'Great' });
    assert.equal((await t.call('GET', '/api/me/skills', ava.token)).body.statuses[skill.id].status, 'APPROVED');

    assert.equal((await t.call('POST', `/api/club/submissions/${id}/remove-approval`, ava.token)).status, 403);
    assert.equal((await t.call('POST', `/api/club/submissions/${id}/remove-approval`, other.token)).status, 404);
    const removed = await t.call('POST', `/api/club/submissions/${id}/remove-approval`, club.token);
    assert.equal(removed.status, 200);
    assert.equal(removed.body.submission.status, 'PENDING');
    assert.equal(removed.body.submission.approvalHistory[0].comment, 'Great');
    assert.equal((await t.call('POST', `/api/club/submissions/${id}/remove-approval`, club.token)).body.code, 'NOT_APPROVED');

    // Shown as pending to the gymnast and in the club queue; the video still plays
    assert.equal((await t.call('GET', '/api/me/skills', ava.token)).body.statuses[skill.id].status, 'PENDING');
    const queue = (await t.call('GET', '/api/club/overview', club.token)).body.gymnasts.find((g: any) => g.id === ava.id).submissions;
    assert.equal(queue[0].status, 'PENDING');
    assert.equal((await fetch(`${t.base}${file.url}`, { headers: { authorization: `Bearer ${club.token}` } })).status, 200);
    // And it can be decided again
    assert.equal((await t.call('POST', `/api/club/submissions/${id}/review`, club.token, { decision: 'REJECTED', comment: 'Bend the knees less' })).status, 200);
  } finally {
    t.server.close();
  }
});

test('5. gymnasts are free forever; a club gets one seven-day trial, then a payment prompt until an operator activates it', async () => {
  const t = await start();
  try {
    const club = await t.club('Trial Club', 't5@club.test');
    const solo = await t.gymnast('solo5@gym.test', null);
    const member = await t.gymnast('member5@gym.test', club.clubId);

    const first = (await t.call('GET', '/api/me', club.token)).body.user;
    assert.equal(first.access, 'trial');
    assert.equal(first.club.trialStartedAt, '2026-10-25T09:00:00.000Z');
    assert.equal(first.club.trialEndsAt, '2026-11-01T09:00:00.000Z');
    assert.equal(first.club.monthlyFeeNgn, 1000);

    // Signing in again does not restart or add a trial
    t.advanceDays(3);
    const login = await t.call('POST', '/api/auth/login', undefined, { email: 't5@club.test', password: PASSWORD });
    assert.equal(login.body.user.club.trialStartedAt, '2026-10-25T09:00:00.000Z');
    assert.equal(login.body.user.club.trialEndsAt, '2026-11-01T09:00:00.000Z');

    t.advanceDays(5); // past the seven days
    const locked = await t.call('GET', '/api/me', club.token);
    assert.equal(locked.body.user.access, 'locked');
    assert.equal((await t.call('GET', '/api/club/overview', club.token)).body.code, 'PAYMENT_REQUIRED');
    // Gymnasts, with or without a club, are unaffected
    for (const g of [solo, member]) {
      const me = (await t.call('GET', '/api/me', g.token)).body;
      assert.equal(me.user.access, 'free');
      assert.equal(me.payment, null);
      assert.equal((await t.call('GET', '/api/inspo/saved', g.token)).status, 200);
    }

    // Only an operator can activate, and only with the checked reference
    const clubs = (await t.call('GET', '/api/me', club.token)).body.user.club;
    assert.equal((await t.call('POST', `/api/operator/clubs/${clubs.id}/activate`, club.token, { months: 1, reference: 'receipt' })).status, 403);
    const operator = await t.gymnast(OPERATOR, null);
    assert.equal((await t.call('GET', '/api/me', operator.token)).body.user.operator, true);
    assert.equal((await t.call('POST', `/api/operator/clubs/${clubs.id}/activate`, operator.token, { months: 1 })).body.code, 'REFERENCE_REQUIRED');
    const list = (await t.call('GET', '/api/operator/clubs', operator.token)).body.clubs;
    assert.equal(list.find((c: any) => c.id === clubs.id).status, 'expired');

    const on = await t.call('POST', `/api/operator/clubs/${clubs.id}/activate`, operator.token, { months: 1, reference: '9PSB transfer 25 Oct, receipt on WhatsApp', note: 'Checked' });
    assert.equal(on.status, 201);
    const after = (await t.call('GET', '/api/me', club.token)).body.user;
    assert.equal(after.access, 'paid');
    assert.equal(after.club.subscriptionActive, true);
    assert.equal((await t.call('GET', '/api/club/overview', club.token)).status, 200);

    // A renewal adds a record and continues from the end of the current one
    const renew = await t.call('POST', `/api/operator/clubs/${clubs.id}/activate`, operator.token, { months: 2, reference: 'second transfer' });
    assert.equal(renew.body.subscription.startsAt, on.body.subscription.endsAt);
    const history = (await t.call('GET', '/api/operator/clubs', operator.token)).body.clubs.find((c: any) => c.id === clubs.id).subscriptions;
    assert.equal(history.length, 2);
  } finally {
    t.server.close();
  }
});
