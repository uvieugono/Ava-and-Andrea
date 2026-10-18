import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import type { Request, Response } from 'express';
import { GoogleAuth } from 'google-auth-library';
import type { UploadRecord } from './workflow.ts';

/**
 * Where uploaded videos and documents live.
 *
 * Google Drive when GYMTRACK_DRIVE_FOLDER_ID is set: every file goes into that one
 * folder, which is NOT shared publicly. GymTrack serves each file back itself, after
 * checking who is asking, so a private skill video can only be opened by its owner
 * and their club. Without it, files are kept on this server's disk (fine for
 * development; lost on a host that wipes its disk).
 *
 * Drive sign-in: GOOGLE_SERVICE_ACCOUNT_JSON (the key file's contents), or, on Cloud
 * Run, the service account the service runs as. That account needs Editor access on
 * the folder.
 */
export interface Stored {
  driveFileId?: string;
  file?: string;
}

export interface Storage {
  kind: 'drive' | 'disk';
  put(data: Buffer, mime: string, name: string, diskName: string): Promise<Stored>;
  send(upload: UploadRecord, req: Request, res: Response): Promise<void>;
}

export class StorageError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function diskStorage(dir: string): Storage {
  fs.mkdirSync(dir, { recursive: true });
  return {
    kind: 'disk',
    async put(data, _mime, _name, diskName) {
      await fs.promises.writeFile(path.join(dir, diskName), data);
      return { file: diskName };
    },
    async send(upload, _req, res) {
      const filePath = path.join(dir, upload.file ?? '');
      if (!upload.file || !fs.existsSync(filePath)) {
        res.status(404).json({ code: 'NOT_FOUND' });
        return;
      }
      res.sendFile(path.resolve(filePath));
    },
  };
}

type TokenSource = () => Promise<string>;

export function driveStorage(folderId: string, token: TokenSource, fetcher: typeof fetch = fetch): Storage {
  const API = 'https://www.googleapis.com';

  async function failure(response: globalThis.Response, doing: string): Promise<never> {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string; errors?: { reason?: string }[] } };
    const reason = body.error?.errors?.[0]?.reason ?? '';
    if (reason === 'storageQuotaExceeded') {
      throw new StorageError('DRIVE_QUOTA', 'Google Drive refused the file: the service account has no storage of its own. Use a Shared Drive folder.');
    }
    throw new StorageError('STORAGE_FAILED', `Google Drive ${doing} failed (${response.status}): ${body.error?.message ?? 'no detail'}`);
  }

  return {
    kind: 'drive',
    async put(data, mime, name) {
      const auth = { authorization: `Bearer ${await token()}` };
      const start = await fetcher(`${API}/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id`, {
        method: 'POST',
        headers: {
          ...auth,
          'content-type': 'application/json; charset=UTF-8',
          'x-upload-content-type': mime,
          'x-upload-content-length': String(data.length),
        },
        body: JSON.stringify({ name, parents: [folderId], mimeType: mime }),
      });
      if (!start.ok) await failure(start, 'upload');
      const session = start.headers.get('location');
      if (!session) throw new StorageError('STORAGE_FAILED', 'Google Drive did not start the upload.');
      const done = await fetcher(session, {
        method: 'PUT',
        headers: { 'content-type': mime, 'content-length': String(data.length) },
        body: data,
      });
      if (!done.ok) await failure(done, 'upload');
      const created = (await done.json()) as { id?: string };
      if (!created.id) throw new StorageError('STORAGE_FAILED', 'Google Drive did not return the file.');
      return { driveFileId: created.id };
    },
    async send(upload, req, res) {
      if (!upload.driveFileId) {
        res.status(404).json({ code: 'NOT_FOUND' });
        return;
      }
      const headers: Record<string, string> = { authorization: `Bearer ${await token()}` };
      const range = req.header('range');
      if (range) headers.range = range;
      const upstream = await fetcher(`${API}/drive/v3/files/${encodeURIComponent(upload.driveFileId)}?alt=media&supportsAllDrives=true`, { headers });
      if (upstream.status === 404) {
        res.status(404).json({ code: 'NOT_FOUND' });
        return;
      }
      if (!upstream.ok && upstream.status !== 206) {
        res.status(502).json({ code: 'STORAGE_FAILED' });
        return;
      }
      res.status(upstream.status);
      for (const name of ['content-length', 'content-range', 'accept-ranges']) {
        const value = upstream.headers.get(name);
        if (value) res.setHeader(name, value);
      }
      if (!upstream.body) {
        res.end();
        return;
      }
      Readable.fromWeb(upstream.body as never).pipe(res);
    },
  };
}

export function defaultStorage(uploadDir: string, env: NodeJS.ProcessEnv = process.env): Storage {
  const folderId = env.GYMTRACK_DRIVE_FOLDER_ID;
  if (!folderId) return diskStorage(uploadDir);
  const credentials = env.GOOGLE_SERVICE_ACCOUNT_JSON ? JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON) : undefined;
  const auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/drive'] });
  return driveStorage(folderId, async () => {
    const value = await auth.getAccessToken();
    if (!value) throw new StorageError('STORAGE_FAILED', 'Could not sign in to Google Drive.');
    return value;
  });
}
