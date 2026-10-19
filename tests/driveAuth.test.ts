import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import type { Request, Response } from 'express';
import { createApp } from '../server/createApp.ts';
import { DRIVE_AUTH_MESSAGE, DRIVE_SCOPE, StorageError, createDriveTokenSource, driveConsentUrl, selectDriveAuth } from '../server/driveAuth.ts';
import { defaultStorage, driveStorage } from '../server/storage.ts';
import type { UploadRecord } from '../server/workflow.ts';
import { REFRESH_TOKEN_FILENAME, listenForDriveConsent, renderRefreshTokenFile, writeRefreshTokenFile } from '../scripts/drive-auth.ts';

const oauthEnv = {
  GOOGLE_OAUTH_CLIENT_ID: 'client-id',
  GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
  GOOGLE_OAUTH_REFRESH_TOKEN: 'refresh-token',
};

test('Drive auth prefers OAuth user credentials and otherwise uses the service account', () => {
  assert.equal(selectDriveAuth({}).mode, 'service-account');
  assert.equal(selectDriveAuth({ GOOGLE_OAUTH_CLIENT_ID: '  ', GOOGLE_OAUTH_CLIENT_SECRET: '', GOOGLE_OAUTH_REFRESH_TOKEN: '\n' }).mode, 'service-account');

  const chosen = selectDriveAuth({ ...oauthEnv, GOOGLE_OAUTH_CLIENT_ID: ' id ', GOOGLE_OAUTH_REFRESH_TOKEN: ' tok ', GOOGLE_SERVICE_ACCOUNT_JSON: '{"client_email":"sa@example.com"}' });
  assert.deepEqual(chosen, { mode: 'oauth', clientId: 'id', clientSecret: 'client-secret', refreshToken: 'tok' });

  const missingRefresh = selectDriveAuth({ GOOGLE_OAUTH_CLIENT_ID: 'id', GOOGLE_OAUTH_CLIENT_SECRET: 'secret' });
  assert.deepEqual(missingRefresh, { mode: 'incomplete', missing: ['GOOGLE_OAUTH_REFRESH_TOKEN'] });
  const missingBoth = selectDriveAuth({ GOOGLE_OAUTH_REFRESH_TOKEN: 'tok' });
  assert.deepEqual(missingBoth, { mode: 'incomplete', missing: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET'] });
});

test('the token source follows that choice and reports a revoked refresh token plainly', async () => {
  let used = '';
  const oauth = createDriveTokenSource({ ...oauthEnv, GOOGLE_SERVICE_ACCOUNT_JSON: '{not-json' }, {
    oauth: () => ({ async getAccessToken() { used = 'oauth'; return { token: 'user-token' }; } }),
    serviceAccount: () => { throw new Error('service account should not be used'); },
  });
  assert.equal(await oauth(), 'user-token');
  assert.equal(used, 'oauth');

  const serviceAccount = createDriveTokenSource({}, {
    oauth: () => { throw new Error('oauth should not be used'); },
    serviceAccount: () => ({ async getAccessToken() { used = 'service-account'; return 'sa-token'; } }),
  });
  assert.equal(await serviceAccount(), 'sa-token');
  assert.equal(used, 'service-account');

  assert.throws(() => createDriveTokenSource({ GOOGLE_OAUTH_CLIENT_ID: 'only-one' }), (error: unknown) => {
    assert.ok(error instanceof StorageError);
    assert.equal(error.code, 'DRIVE_AUTH');
    assert.match(error.message, /GOOGLE_OAUTH_CLIENT_SECRET/);
    assert.match(error.message, /GOOGLE_OAUTH_REFRESH_TOKEN/);
    return true;
  });

  const revoked = createDriveTokenSource(oauthEnv, {
    oauth: () => ({
      async getAccessToken() {
        throw Object.assign(new Error('Request failed with status code 400'), {
          response: { data: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } },
        });
      },
    }),
    serviceAccount: () => { throw new Error('service account should not be used'); },
  });
  await assert.rejects(() => revoked(), (error: unknown) => {
    assert.ok(error instanceof StorageError);
    assert.equal(error.code, 'DRIVE_AUTH');
    assert.equal(error.message, DRIVE_AUTH_MESSAGE);
    assert.equal(error.message.includes('refresh-token'), false);
    return true;
  });
});

test('Drive storage is selected only when a folder is set, and OAuth must be complete', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gymtrack-disk-'));
  assert.equal(defaultStorage(dir, {}).kind, 'disk');
  assert.equal(defaultStorage(dir, { GOOGLE_OAUTH_CLIENT_ID: 'only-one' }).kind, 'disk');
  assert.equal(defaultStorage(dir, { ...oauthEnv, GYMTRACK_DRIVE_FOLDER_ID: '  folder  ' }).kind, 'drive');
  assert.throws(() => defaultStorage(dir, { GYMTRACK_DRIVE_FOLDER_ID: 'folder', GOOGLE_OAUTH_CLIENT_ID: 'id' }), (error: unknown) => {
    assert.ok(error instanceof StorageError);
    assert.equal(error.code, 'DRIVE_AUTH');
    return true;
  });
});

test('uploads are not shared, and a refused or missing sign-in is reported plainly', async () => {
  const calls: string[] = [];
  const storage = driveStorage('FOLDER', async () => 'tok', (async (url: string, init: RequestInit = {}) => {
    calls.push(url);
    const body = typeof init.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : undefined;
    if (body) assert.deepEqual(Object.keys(body).sort(), ['mimeType', 'name', 'parents']);
    if (url.includes('uploadType=resumable')) return new Response('{}', { status: 200, headers: { location: 'https://upload.test/session' } });
    if (url === 'https://upload.test/session') return new Response(JSON.stringify({ id: 'file-1' }), { status: 200 });
    return new Response('{}', { status: 404 });
  }) as unknown as typeof fetch);
  const stored = await storage.put(Buffer.from('clip'), 'video/mp4', 'clip.mp4', 'clip.mp4');
  assert.deepEqual(stored, { driveFileId: 'file-1' });
  assert.equal(calls.some((url) => url.includes('/permissions')), false);

  const revoked = driveStorage('FOLDER', async () => {
    throw Object.assign(new Error('invalid_grant'), { response: { data: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } } });
  });
  await assert.rejects(() => revoked.put(Buffer.from('x'), 'video/mp4', 'x.mp4', 'x.mp4'), (error: unknown) => {
    assert.ok(error instanceof StorageError);
    assert.equal(error.code, 'DRIVE_AUTH');
    assert.match(error.message, /revoked/);
    return true;
  });

  const unauthorised = driveStorage('FOLDER', async () => 'tok', (async () => new Response(JSON.stringify({
    error: { message: 'Invalid Credentials', errors: [{ reason: 'authError' }] },
  }), { status: 401 })) as unknown as typeof fetch);
  await assert.rejects(() => unauthorised.put(Buffer.from('x'), 'video/mp4', 'x.mp4', 'x.mp4'), (error: unknown) => {
    assert.ok(error instanceof StorageError);
    assert.equal(error.code, 'DRIVE_AUTH');
    return true;
  });

  const missingFolder = driveStorage('FOLDER', async () => 'tok', (async () => new Response(JSON.stringify({
    error: { message: 'File not found', errors: [{ reason: 'notFound' }] },
  }), { status: 404 })) as unknown as typeof fetch);
  await assert.rejects(() => missingFolder.put(Buffer.from('x'), 'video/mp4', 'x.mp4', 'x.mp4'), /owns that folder/);
});

test('reading a file back reports DRIVE_AUTH when Google rejects the access token', async () => {
  const upload = { id: 'upl', ownerId: 'u', clubId: null, scope: 'private', mime: 'video/mp4', name: 'clip.mp4', size: 1, driveFileId: 'file-1', createdAt: '2026-10-19T00:00:00.000Z' } satisfies UploadRecord;
  const req = { header: () => undefined } as unknown as Request;
  const storage = driveStorage('FOLDER', async () => 'tok', (async () => new Response('no', { status: 401 })) as unknown as typeof fetch);
  const body: { code?: string } = {};
  const res = {
    headersSent: false,
    status() { return this; },
    json(payload: { code?: string }) { body.code = payload.code; },
    setHeader() {},
    end() {},
  } as unknown as Response;
  await storage.send(upload, req, res);
  assert.equal(body.code, 'DRIVE_AUTH');
});

test('an upload through the API returns DRIVE_AUTH when the refresh token is refused', async () => {
  const drive = driveStorage('FOLDER', async () => {
    throw new StorageError('DRIVE_AUTH', DRIVE_AUTH_MESSAGE);
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gymtrack-auth-'));
  const app = await createApp({ dbPath: path.join(dir, 'db.json'), storage: drive, devMatch: false, notifiers: {} });
  const server = app.listen(0);
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const call = async (url: string, body: unknown) => {
      const response = await fetch(`${base}${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      return { status: response.status, body: await response.json() as { token?: string; club?: { id: string } } };
    };
    const club = await call('/api/auth/register-club', { clubName: 'A', city: 'Lagos', adminName: 'Ad', email: 'auth@club.test', password: 'club-pass-1', phone: '0803000000' });
    const ava = await call('/api/auth/signup-student', { name: 'Ava', email: 'auth@gym.test', password: 'gym-pass-1', phone: '08031234567', dateOfBirth: '2014-01-01', selectedClubId: club.body.club?.id });
    const sent = await fetch(`${base}/api/uploads?name=clip.mp4`, { method: 'POST', headers: { 'content-type': 'video/mp4', authorization: `Bearer ${ava.body.token}` }, body: Buffer.from('clip') });
    assert.equal(sent.status, 502);
    assert.deepEqual(await sent.json(), { code: 'DRIVE_AUTH' });
  } finally {
    server.close();
  }
});

test('the one-time consent URL asks for offline access to the full Drive scope', () => {
  const url = new URL(driveConsentUrl({ clientId: 'client-id', redirectUri: 'http://127.0.0.1:9', state: 'state-1', loginHint: 'owner@example.com' }));
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('client_id'), 'client-id');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:9');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('scope'), DRIVE_SCOPE);
  assert.equal(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/drive');
  assert.notEqual(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/drive.file');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('prompt'), 'consent');
  assert.equal(url.searchParams.get('state'), 'state-1');
  assert.equal(url.searchParams.get('login_hint'), 'owner@example.com');
});

test('the loopback sign-in accepts the matching code and rejects anything else', async () => {
  const denied = await listenForDriveConsent({ timeoutMs: 2000, state: 'state-1' });
  try {
    const response = await fetch(`${denied.redirectUri}/?error=access_denied&state=state-1`);
    assert.equal(response.status, 400);
    await assert.rejects(denied.result, /access_denied/);
  } finally {
    await denied.close();
  }

  const mismatch = await listenForDriveConsent({ timeoutMs: 2000, state: 'state-1' });
  try {
    const response = await fetch(`${mismatch.redirectUri}/?code=secret-code&state=other`);
    assert.equal(response.status, 400);
    assert.equal((await response.text()).includes('secret-code'), false);
    await assert.rejects(mismatch.result, /did not match/);
  } finally {
    await mismatch.close();
  }

  const accepted = await listenForDriveConsent({ timeoutMs: 2000, state: 'state-1' });
  try {
    assert.equal((await fetch(`${accepted.redirectUri}/favicon.ico`)).status, 404);
    const response = await fetch(`${accepted.redirectUri}/callback?code=auth-code-1&state=state-1`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.equal(html.includes('auth-code-1'), false);
    assert.match(html, /sign-in is complete/);
    assert.equal(await accepted.result, 'auth-code-1');
  } finally {
    await accepted.close();
  }
});

test('the refresh token file carries a warning and is gitignored', () => {
  const rendered = JSON.parse(renderRefreshTokenFile('test-refresh-token')) as { _warning: string; GOOGLE_OAUTH_REFRESH_TOKEN: string };
  assert.equal(rendered.GOOGLE_OAUTH_REFRESH_TOKEN, 'test-refresh-token');
  assert.match(rendered._warning, /Do not commit/);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gymtrack-token-'));
  const file = writeRefreshTokenFile('test-refresh-token', path.join(dir, REFRESH_TOKEN_FILENAME));
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.match(fs.readFileSync(path.join(process.cwd(), '.gitignore'), 'utf8'), new RegExp(`^${REFRESH_TOKEN_FILENAME.replace('.', '\\.')}$`, 'm'));
});
