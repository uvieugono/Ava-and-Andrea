import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createApp } from '../server/createApp.ts';
import { createBoundStore, emptyDb } from '../server/store.ts';

async function start() {
  let now = new Date('2026-10-10T12:00:00Z');
  const app = await createApp({
    dbPath: `data/test-${Date.now()}-${Math.random()}.json`,
    webhookSecret: 'test-secret',
    devMatch: false,
    now: () => now,
  });
  const server = app.listen(0);
  await once(server, 'listening');
  const port = (server.address() as AddressInfo).port;
  return {
    server,
    base: `http://127.0.0.1:${port}`,
    advance(days: number) {
      now = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    },
  };
}

async function uploadVideo(base: string, token: string, scope = 'public') {
  const response = await fetch(`${base}/api/uploads?scope=${scope}&name=clip.mp4`, {
    method: 'POST',
    headers: { 'content-type': 'video/mp4', authorization: `Bearer ${token}` },
    body: Buffer.from('fake-mp4-bytes'),
  });
  const body = (await response.json()) as { url: string };
  assert.equal(response.status, 201);
  return body.url;
}

async function json(response: Response) {
  return { status: response.status, body: await response.json() };
}

test('login opens an account that never received a trial week', async () => {
  const db = emptyDb();
  const store = createBoundStore(db, async () => {});
  await store.registerClub({
    clubName: 'Old Club',
    city: 'Lagos',
    adminName: 'Ada',
    email: 'ada-old@gym.test',
    password: 'correct-horse',
  });
  const saved = db.users[0];
  saved.periodEnd = null;
  saved.status = 'active';
  const session = await store.login('ada-old@gym.test', 'correct-horse');
  assert.equal(session.user.access, 'trial');
  const days = (Date.parse(session.user.periodEnd ?? '') - Date.now()) / (24 * 60 * 60 * 1000);
  assert.ok(days > 6 && days < 8);
});

test('a club trial keeps a member in the app after their own week is cleared', async () => {
  const db = emptyDb();
  const store = createBoundStore(db, async () => {});
  await store.registerClub({
    clubName: 'Trial Club',
    city: 'Lagos',
    adminName: 'Ada',
    email: 'ada-club@gym.test',
    password: 'correct-horse',
  });
  const admin = db.users[0];
  await store.signupClubStudents(admin, [{ name: 'Ava', email: 'ava-club@gym.test', password: 'ava-pass', dateOfBirth: '2014-04-01' }]);
  const student = db.users.find((item) => item.email === 'ava-club@gym.test');
  if (!student) throw new Error('missing student');
  student.periodEnd = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const session = await store.login('ava-club@gym.test', 'ava-pass');
  assert.equal(session.user.access, 'trial');
  const post = {
    videoUrl: 'a.mp4',
    caption: 'hi',
    skill: 'Cartwheel',
    category: 'Floor' as const,
    visibility: 'everyone' as const,
  };
  await assert.rejects(() => store.createPost(student, post), /PARENT_REQUIRED/);
  db.clubs[0].trialEndsAt = new Date(Date.now() - 1000).toISOString();
  await assert.rejects(() => store.createPost(student, post), /PAYMENT_REQUIRED/);
});

test('club signup allocates paid students and a direct signup has no club', async () => {
  const { server, base, advance } = await start();
  try {
    const club = await json(await fetch(`${base}/api/auth/register-club`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clubName: 'Solynta Gymnastics Club',
        city: 'Lagos',
        adminName: 'Coach Ada',
        email: 'ada@solynta.test',
        password: 'correct-horse',
      }),
    }));
    assert.equal(club.status, 201);
    assert.equal(club.body.user.access, 'trial');
    assert.equal(club.body.payment.amount, 1000);
    const clubTrialMs = Date.parse(club.body.club.trialEndsAt) - Date.parse('2026-10-10T12:00:00Z');
    assert.ok(clubTrialMs > 6 * 24 * 60 * 60 * 1000 && clubTrialMs < 8 * 24 * 60 * 60 * 1000);
    const trialMs = Date.parse(club.body.user.periodEnd) - Date.parse('2026-10-10T12:00:00Z');
    assert.ok(trialMs > 6 * 24 * 60 * 60 * 1000 && trialMs < 8 * 24 * 60 * 60 * 1000);
    const token = club.body.token as string;

    const batch = await json(await fetch(`${base}/api/clubs/students`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        students: [
          { name: 'Ava', email: 'ava@gym.test', password: 'ava-pass-1', dateOfBirth: '2014-04-01', level: 3 },
          { name: 'Andrea', email: 'andrea@gym.test', password: 'andrea-pass-1', dateOfBirth: '2016-08-02', level: 2 },
        ],
      }),
    }));
    assert.equal(batch.status, 201);
    assert.equal(batch.body.payment.amount, 2000);

    const tooSoon = await json(await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ava@gym.test', password: 'ava-pass-1' }),
    }));
    assert.equal(tooSoon.status, 200);
    assert.equal(tooSoon.body.user.access, 'trial');
    assert.equal(tooSoon.body.payment.amount, 2000);
    const duringTrial = await json(await fetch(`${base}/api/inspo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tooSoon.body.token}` },
      body: JSON.stringify({ videoUrl: 'clip.mp4', caption: 'Try', skill: 'Cartwheel', category: 'Floor', visibility: 'everyone' }),
    }));
    assert.equal(duringTrial.status, 403);
    assert.equal(duringTrial.body.code, 'PARENT_REQUIRED');
    advance(8);
    const locked = await json(await fetch(`${base}/api/inspo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tooSoon.body.token}` },
      body: JSON.stringify({ videoUrl: 'clip.mp4', caption: 'Try', skill: 'Cartwheel', category: 'Floor', visibility: 'everyone' }),
    }));
    assert.equal(locked.status, 403);
    assert.equal(locked.body.code, 'PAYMENT_REQUIRED');

    const paid = await json(await fetch(`${base}/api/payments/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-gymtrack-webhook-secret': 'test-secret' },
      body: JSON.stringify({ reference: batch.body.payment.reference, amount: 2000, transferId: 'soly-1' }),
    }));
    assert.equal(paid.status, 200);

    const replay = await json(await fetch(`${base}/api/payments/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-gymtrack-webhook-secret': 'test-secret' },
      body: JSON.stringify({ reference: batch.body.payment.reference, amount: 2000, transferId: 'soly-1' }),
    }));
    assert.equal(replay.body.alreadyPaid, true);

    const ava = await json(await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ava@gym.test', password: 'wrong-pass' }),
    }));
    assert.equal(ava.status, 401);

    const avaOk = await json(await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ava@gym.test', password: 'ava-pass-1' }),
    }));
    assert.equal(avaOk.body.user.clubName, 'Solynta Gymnastics Club');

    const solo = await json(await fetch(`${base}/api/auth/signup-student`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Kemi',
        phone: '08031234567',
        email: 'kemi@gym.test',
        password: 'kemi-pass-1',
        dateOfBirth: '2015-01-01',
        level: 4,
      }),
    }));
    assert.equal(solo.body.payment.amount, 1000);
    assert.equal(solo.body.user.access, 'trial');
    assert.ok(solo.body.token);
    const kemiEarly = await json(await fetch(`${base}/api/me`, {
      headers: { authorization: `Bearer ${solo.body.token}` },
    }));
    assert.equal(kemiEarly.status, 200);
    assert.equal(kemiEarly.body.user.clubId, null);
    assert.equal(kemiEarly.body.user.access, 'trial');
    advance(8);
    const kemiLocked = await json(await fetch(`${base}/api/inspo/missing/like`, {
      method: 'POST',
      headers: { authorization: `Bearer ${solo.body.token}` },
    }));
    assert.equal(kemiLocked.status, 403);
    assert.equal(kemiLocked.body.code, 'PAYMENT_REQUIRED');
    await fetch(`${base}/api/payments/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-gymtrack-webhook-secret': 'test-secret' },
      body: JSON.stringify({ reference: solo.body.payment.reference, amount: 1000, transferId: 'soly-2' }),
    });
    const kemi = await json(await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'kemi@gym.test', password: 'kemi-pass-1' }),
    }));
    assert.equal(kemi.body.user.clubId, null);
    assert.equal(kemi.body.user.access, 'paid');

    const events = await json(await fetch(`${base}/api/events?q=vault`));
    assert.equal(events.body.featured.id, 'ev_gymfest_3');
    const clubs = await json(await fetch(`${base}/api/clubs?lat=6.45&lng=3.4`));
    assert.equal(clubs.body.clubs[0].city, 'Lagos');
  } finally {
    server.close();
  }
});

test('inspo hides club videos and waits for a parent before a child publishes', async () => {
  const { server, base } = await start();
  try {
    const club = await json(await fetch(`${base}/api/auth/register-club`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clubName: 'Solynta Gymnastics Club',
        city: 'Lagos',
        adminName: 'Coach Ada',
        email: 'ada2@solynta.test',
        password: 'correct-horse',
      }),
    }));
    const other = await json(await fetch(`${base}/api/auth/register-club`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clubName: 'Abuja Bars',
        city: 'Abuja',
        adminName: 'Coach Tobi',
        email: 'tobi@abuja.test',
        password: 'correct-horse',
      }),
    }));
    const batch = await json(await fetch(`${base}/api/clubs/students`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${club.body.token}` },
      body: JSON.stringify({
        students: [{ name: 'Ava', email: 'ava2@gym.test', password: 'ava-pass-1', dateOfBirth: '2014-04-01', level: 3 }],
      }),
    }));
    await fetch(`${base}/api/payments/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-gymtrack-webhook-secret': 'test-secret' },
      body: JSON.stringify({ reference: batch.body.payment.reference, amount: 1000, transferId: 'soly-3' }),
    });
    const ava = await json(await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ava2@gym.test', password: 'ava-pass-1' }),
    }));
    const blocked = await json(await fetch(`${base}/api/inspo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${ava.body.token}` },
      body: JSON.stringify({
        videoUrl: 'clip.mp4',
        caption: 'Stuck the landing',
        skill: 'Back handspring',
        category: 'Floor',
        clubTag: 'Solynta Gymnastics Club',
        hashtags: ['#handspring'],
        visibility: 'club',
        showLevel: true,
      }),
    }));
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.code, 'PARENT_REQUIRED');

    await fetch(`${base}/api/students/${ava.body.user.id}/parent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ parentEmail: 'mum@gym.test' }),
    });
    const posted = await json(await fetch(`${base}/api/inspo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${ava.body.token}` },
      body: JSON.stringify({
        videoUrl: await uploadVideo(base, ava.body.token),
        caption: 'Stuck the landing',
        skill: 'Back handspring',
        category: 'Floor',
        clubTag: 'Solynta Gymnastics Club',
        hashtags: ['#handspring'],
        visibility: 'club',
        showLevel: true,
      }),
    }));
    assert.equal(posted.status, 201);
    assert.equal(posted.body.post.level, 3);

    const outsider = await json(await fetch(`${base}/api/inspo`, {
      headers: { authorization: `Bearer ${other.body.token}` },
    }));
    assert.equal(outsider.body.posts.length, 0);

    const mine = await json(await fetch(`${base}/api/inspo?category=Floor`, {
      headers: { authorization: `Bearer ${ava.body.token}` },
    }));
    assert.equal(mine.body.posts.length, 1);

    await fetch(`${base}/api/inspo/${posted.body.post.id}/save`, {
      method: 'POST',
      headers: { authorization: `Bearer ${ava.body.token}` },
    });
    const saved = await json(await fetch(`${base}/api/inspo/saved`, {
      headers: { authorization: `Bearer ${ava.body.token}` },
    }));
    assert.equal(saved.body.posts.length, 1);
  } finally {
    server.close();
  }
});
