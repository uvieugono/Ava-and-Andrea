import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import type { Request, Response } from 'express';
import { DRIVE_AUTH_MESSAGE, StorageError, createDriveTokenSource, driveSignInProblem } from './driveAuth.ts';
import type { UploadRecord } from './workflow.ts';

export { StorageError };

/**
 * Where uploaded videos and documents live.
 *
 * Google Drive when GYMTRACK_DRIVE_FOLDER_ID is set: every file goes into that one
 * folder, which is NOT shared publicly. GymTrack serves each file back itself, after
 * checking who is asking, so a private skill video can only be opened by its owner
 * and their club. A public Connect video is public only through that check. Drive
 * files are never given a public sharing permission. Without the folder, files are
 * kept on this server's disk (fine for development; lost on a host that wipes its disk).
 *
 * Drive sign-in prefers OAuth user credentials (GOOGLE_OAUTH_CLIENT_ID,
 * GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN) so uploads count against
 * the owner's own Drive quota. Obtain the refresh token once with `npm run drive:auth`.
 * When all three are unset, fall back to GOOGLE_SERVICE_ACCOUNT_JSON or, on Cloud
 * Run, the service account the service runs as. A service account has no storage
 * of its own, so that path only works with a Shared Drive.
 */
export interface Stored {
  driveFileId?: string;
  file?: string;
}

export interface Storage {
  kind: 'drive' | 'disk';
  put(data: Buffer, mime: string, name: string, diskName: string): Promise<Stored>;
  /** Starts a file that arrives in pieces. Returns where the pieces go. */
  begin(mime: string, name: string, size: number, diskName: string): Promise<string>;
  /** Adds the next piece. Returns the stored file once the last piece is in, otherwise null. */
  append(session: string, piece: Buffer, offset: number, size: number): Promise<Stored | null>;
  remove(upload: UploadRecord): Promise<void>;
  send(upload: UploadRecord, req: Request, res: Response): Promise<void>;
}

export function diskStorage(dir: string): Storage {
  fs.mkdirSync(dir, { recursive: true });
  return {
    kind: 'disk',
    async put(data, _mime, _name, diskName) {
      await fs.promises.writeFile(path.join(dir, diskName), data);
      return { file: diskName };
    },
    async begin(_mime, _name, _size, diskName) {
      await fs.promises.writeFile(path.join(dir, diskName), Buffer.alloc(0));
      return diskName;
    },
    async append(session, piece, offset, size) {
      await fs.promises.appendFile(path.join(dir, session), piece);
      return offset + piece.length >= size ? { file: session } : null;
    },
    async remove(upload) {
      if (upload.file) await fs.promises.rm(path.join(dir, upload.file), { force: true });
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
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string; status?: string; errors?: { reason?: string }[] } };
    const reason = body.error?.errors?.[0]?.reason ?? '';
    if (reason === 'storageQuotaExceeded') {
      throw new StorageError('DRIVE_QUOTA', 'Google Drive refused the file because this account has no storage left. A service account has none of its own (sign in with OAuth, or use a Shared Drive). A personal account needs free space in My Drive.');
    }
    if (response.status === 401 || reason === 'authError' || reason === 'invalidCredentials' || driveSignInProblem({ response: { data: body } })) {
      throw new StorageError('DRIVE_AUTH', DRIVE_AUTH_MESSAGE);
    }
    if (response.status === 404 && doing === 'upload') {
      throw new StorageError('STORAGE_FAILED', 'Google Drive could not find the folder in GYMTRACK_DRIVE_FOLDER_ID. Sign in as the Google account that owns that folder.');
    }
    throw new StorageError('STORAGE_FAILED', `Google Drive ${doing} failed (${response.status}): ${body.error?.message ?? 'no detail'}`);
  }

  async function bearer(): Promise<Record<string, string>> {
    try {
      return { authorization: `Bearer ${await token()}` };
    } catch (error) {
      if (error instanceof StorageError) throw error;
      const problem = driveSignInProblem(error);
      if (problem) throw new StorageError('DRIVE_AUTH', problem);
      throw error;
    }
  }

  async function startSession(mime: string, name: string, size: number) {
    const auth = await bearer();
    const start = await fetcher(`${API}/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id`, {
      method: 'POST',
      headers: {
        ...auth,
        'content-type': 'application/json; charset=UTF-8',
        'x-upload-content-type': mime,
        'x-upload-content-length': String(size),
      },
      body: JSON.stringify({ name, parents: [folderId], mimeType: mime }),
    });
    if (!start.ok) await failure(start, 'upload');
    const session = start.headers.get('location');
    if (!session) throw new StorageError('STORAGE_FAILED', 'Google Drive did not start the upload.');
    return session;
  }

  return {
    kind: 'drive',
    begin(mime, name, size) {
      return startSession(mime, name, size);
    },
    async append(session, piece, offset, size) {
      // Drive's resumable upload: each piece says where it sits in the whole file.
      const end = offset + piece.length - 1;
      const response = await fetcher(session, {
        method: 'PUT',
        headers: { 'content-length': String(piece.length), 'content-range': `bytes ${offset}-${end}/${size}` },
        body: piece,
      });
      if (response.status === 308) return null;
      if (!response.ok) await failure(response, 'upload');
      const created = (await response.json()) as { id?: string };
      if (!created.id) throw new StorageError('STORAGE_FAILED', 'Google Drive did not return the file.');
      return { driveFileId: created.id };
    },
    async remove(upload) {
      if (!upload.driveFileId) return;
      const response = await fetcher(`${API}/drive/v3/files/${encodeURIComponent(upload.driveFileId)}?supportsAllDrives=true`, {
        method: 'DELETE',
        headers: await bearer(),
      });
      if (!response.ok && response.status !== 404) await failure(response, 'delete');
    },
    async put(data, mime, name) {
      // The file stays private on the signed-in account. No sharing permission is added.
      const session = await startSession(mime, name, data.length);
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
      let headers: Record<string, string>;
      try {
        headers = await bearer();
      } catch (error) {
        const code = error instanceof StorageError ? error.code : 'STORAGE_FAILED';
        console.error('Could not read the stored file', error instanceof Error ? error.message : error);
        if (!res.headersSent) res.status(502).json({ code });
        return;
      }
      const range = req.header('range');
      if (range) headers.range = range;
      const upstream = await fetcher(`${API}/drive/v3/files/${encodeURIComponent(upload.driveFileId)}?alt=media&supportsAllDrives=true`, { headers });
      if (upstream.status === 404) {
        res.status(404).json({ code: 'NOT_FOUND' });
        return;
      }
      if (!upstream.ok && upstream.status !== 206) {
        res.status(502).json({ code: upstream.status === 401 ? 'DRIVE_AUTH' : 'STORAGE_FAILED' });
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
  const folderId = env.GYMTRACK_DRIVE_FOLDER_ID?.trim();
  if (!folderId) return diskStorage(uploadDir);
  return driveStorage(folderId, createDriveTokenSource(env));
}
