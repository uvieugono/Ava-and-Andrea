/**
 * One-time Google sign-in for GymTrack's Drive folder.
 *
 * Run from the repo root: npm run drive:auth
 * Reads GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET from the
 * environment or .env, opens a loopback page on 127.0.0.1, and writes the
 * refresh token to .drive-oauth.json. That file is gitignored. Nothing here
 * is served by the web app.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { OAuth2Client } from 'google-auth-library';
import { driveConsentUrl } from '../server/driveAuth.ts';

export const REFRESH_TOKEN_FILENAME = '.drive-oauth.json';

export const REFRESH_TOKEN_WARNING = 'SECRET. This refresh token lets GymTrack upload and read files in the Google account that signed in. Do not commit this file, paste the token into chat, or email it. Copy GOOGLE_OAUTH_REFRESH_TOKEN into Cloud Run, then delete this file.';

export function renderRefreshTokenFile(refreshToken: string): string {
  return `${JSON.stringify({ _warning: REFRESH_TOKEN_WARNING, GOOGLE_OAUTH_REFRESH_TOKEN: refreshToken }, null, 2)}\n`;
}

export function writeRefreshTokenFile(refreshToken: string, filePath = path.resolve(process.cwd(), REFRESH_TOKEN_FILENAME)): string {
  fs.writeFileSync(filePath, renderRefreshTokenFile(refreshToken), { encoding: 'utf8', mode: 0o600 });
  return filePath;
}

function page(message: string): string {
  const safe = message.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char] ?? char);
  return `<!DOCTYPE html><html lang="en-GB"><meta charset="utf-8"><title>GymTrack Drive sign-in</title><body><p>${safe}</p></body></html>`;
}

export interface DriveConsentLoopback {
  redirectUri: string;
  state: string;
  result: Promise<string>;
  close: () => Promise<void>;
}

/** Listens on 127.0.0.1 for Google's redirect and resolves with the authorisation code. */
export function listenForDriveConsent(options?: { timeoutMs?: number; state?: string }): Promise<DriveConsentLoopback> {
  const timeoutMs = options?.timeoutMs ?? 5 * 60 * 1000;
  const state = options?.state ?? randomBytes(24).toString('hex');
  const server = http.createServer();
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const result = new Promise<string>((resolve, reject) => {
    const settle = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      outcome();
    };
    timer = setTimeout(() => {
      settle(() => reject(new Error('Timed out waiting for Google to redirect back. Run npm run drive:auth again.')));
    }, timeoutMs);

    server.on('request', (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/favicon.ico') {
        res.writeHead(404).end();
        return;
      }
      const send = (status: number, message: string, outcome: () => void) => {
        res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(page(message));
        settle(outcome);
      };
      if (url.searchParams.get('state') !== state) {
        send(400, 'This sign-in did not match the one just started. Close this window and run npm run drive:auth again.', () => {
          reject(new Error('The sign-in response did not match this session.'));
        });
        return;
      }
      const error = url.searchParams.get('error');
      if (error) {
        send(400, 'Google did not grant access. Close this window and try again if you still want GymTrack to use Drive.', () => {
          reject(new Error(`Google refused the sign-in (${error}).`));
        });
        return;
      }
      const code = url.searchParams.get('code');
      if (!code) {
        send(400, 'Google did not return a sign-in code. Close this window and run npm run drive:auth again.', () => {
          reject(new Error('Google did not return a sign-in code.'));
        });
        return;
      }
      send(200, 'GymTrack Drive sign-in is complete. You can close this window and return to the terminal.', () => resolve(code));
    });
  });
  result.catch(() => undefined);

  const close = async () => {
    clearTimeout(timer);
    if (!server.listening) return;
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  };

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo | null;
      if (!address) {
        clearTimeout(timer);
        reject(new Error('Could not start the local sign-in page.'));
        return;
      }
      resolve({ redirectUri: `http://127.0.0.1:${address.port}`, state, result, close });
    });
  });
}

export function openConsentPage(url: string): void {
  const child = process.platform === 'win32'
    ? spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true })
    : spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' });
  child.on('error', () => undefined);
  child.unref();
}

export async function exchangeAuthCode(input: { clientId: string; clientSecret: string; redirectUri: string; code: string }): Promise<string> {
  const client = new OAuth2Client({
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    redirectUri: input.redirectUri,
  });
  const { tokens } = await client.getToken(input.code);
  const refreshToken = tokens.refresh_token;
  if (!refreshToken) {
    throw new Error('Google did not return a refresh token. Open https://myaccount.google.com/permissions, remove GymTrack\'s access, then run npm run drive:auth again.');
  }
  return refreshToken;
}

async function main() {
  dotenv.config({ quiet: true });
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() ?? '';
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ?? '';
  if (!clientId || !clientSecret) {
    throw new Error('Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in .env (see README.md). Do not commit those values.');
  }
  const loop = await listenForDriveConsent();
  try {
    const url = driveConsentUrl({
      clientId,
      redirectUri: loop.redirectUri,
      state: loop.state,
      loginHint: process.env.GOOGLE_OAUTH_LOGIN_HINT?.trim() || undefined,
    });
    console.log('Open this address and sign in as the Google account that owns the GymTrack Drive folder:\n');
    console.log(url);
    console.log('\nWaiting for Google to redirect back to this computer...');
    openConsentPage(url);
    const code = await loop.result;
    const refreshToken = await exchangeAuthCode({ clientId, clientSecret, redirectUri: loop.redirectUri, code });
    const file = writeRefreshTokenFile(refreshToken);
    console.log(`\nWrote ${file}`);
    console.log(`\nWARNING: ${REFRESH_TOKEN_WARNING}`);
    console.log(`
Cloud Run service gymtrack (project solyntaflow, region us-central1) needs:
  GYMTRACK_DRIVE_FOLDER_ID
  GOOGLE_OAUTH_CLIENT_ID
  GOOGLE_OAUTH_CLIENT_SECRET
  GOOGLE_OAUTH_REFRESH_TOKEN
`);
  } finally {
    await loop.close();
  }
}

function invokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

if (invokedDirectly()) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
