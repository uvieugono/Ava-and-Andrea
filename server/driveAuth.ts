import { GoogleAuth, UserRefreshClient } from 'google-auth-library';

/**
 * Full Drive scope.
 *
 * `https://www.googleapis.com/auth/drive.file` only covers files this app
 * created, or files the user opened with the Google Picker. The GymTrack
 * folder already exists in the owner's personal Drive and is named by
 * GYMTRACK_DRIVE_FOLDER_ID, so creating a file with that folder as its parent
 * is rejected under `drive.file`. The full `drive` scope is the narrowest
 * scope that can see a folder the app did not create.
 */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

export const OAUTH_ENV_VARS = ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REFRESH_TOKEN'] as const;

export const DRIVE_AUTH_MESSAGE = 'Google Drive sign-in was refused. The refresh token is invalid or has been revoked. Sign in again with npm run drive:auth and update GOOGLE_OAUTH_REFRESH_TOKEN.';

export class StorageError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
  }
}

export function incompleteOAuthMessage(missing: string[]): string {
  return `Google Drive sign-in is only partly configured. Missing ${missing.join(', ')}. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET and GOOGLE_OAUTH_REFRESH_TOKEN, or leave all three unset to use the service account.`;
}

export type DriveAuthSelection =
  | { mode: 'oauth'; clientId: string; clientSecret: string; refreshToken: string }
  | { mode: 'service-account' }
  | { mode: 'incomplete'; missing: string[] };

function envValue(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  return typeof value === 'string' ? value.trim() : '';
}

/** OAuth user credentials when all three are set; service account when none are. */
export function selectDriveAuth(env: NodeJS.ProcessEnv): DriveAuthSelection {
  const missing = OAUTH_ENV_VARS.filter((key) => !envValue(env, key));
  if (missing.length === OAUTH_ENV_VARS.length) return { mode: 'service-account' };
  if (missing.length > 0) return { mode: 'incomplete', missing: [...missing] };
  return {
    mode: 'oauth',
    clientId: envValue(env, 'GOOGLE_OAUTH_CLIENT_ID'),
    clientSecret: envValue(env, 'GOOGLE_OAUTH_CLIENT_SECRET'),
    refreshToken: envValue(env, 'GOOGLE_OAUTH_REFRESH_TOKEN'),
  };
}

/**
 * Plain-language message when Google refuses the refresh token.
 * Returns null for any other failure. Never includes the token itself.
 */
export function driveSignInProblem(error: unknown): string | null {
  const parts: string[] = [];
  if (error instanceof Error && error.message) parts.push(error.message);
  if (error && typeof error === 'object' && 'response' in error) {
    const data = (error as { response?: { data?: unknown } }).response?.data;
    if (typeof data === 'string') parts.push(data.slice(0, 500));
    else if (data && typeof data === 'object') {
      const body = data as { error?: unknown; error_description?: unknown };
      if (typeof body.error === 'string') parts.push(body.error);
      if (typeof body.error_description === 'string') parts.push(body.error_description);
      if (body.error && typeof body.error === 'object') {
        const nested = body.error as { message?: unknown; status?: unknown; errors?: { reason?: string }[] };
        if (typeof nested.message === 'string') parts.push(nested.message);
        if (typeof nested.status === 'string') parts.push(nested.status);
        for (const item of nested.errors ?? []) {
          if (item?.reason) parts.push(item.reason);
        }
      }
    }
  }
  if (/invalid_grant|invalid_rapt|expired or revoked|invalid_client|unauthorized_client/i.test(parts.join(' '))) {
    return DRIVE_AUTH_MESSAGE;
  }
  return null;
}

export interface TokenClient {
  getAccessToken(): Promise<{ token?: string | null } | string | null | undefined>;
}

export interface DriveAuthFactories {
  oauth(config: { clientId: string; clientSecret: string; refreshToken: string }): TokenClient;
  serviceAccount(env: NodeJS.ProcessEnv): TokenClient;
}

function oauthClient(config: { clientId: string; clientSecret: string; refreshToken: string }): TokenClient {
  const client = new UserRefreshClient({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    refreshToken: config.refreshToken,
  });
  return { getAccessToken: () => client.getAccessToken() };
}

function serviceAccountClient(env: NodeJS.ProcessEnv): TokenClient {
  const raw = envValue(env, 'GOOGLE_SERVICE_ACCOUNT_JSON');
  const credentials = raw ? JSON.parse(raw) as object : undefined;
  const auth = new GoogleAuth({ credentials, scopes: [DRIVE_SCOPE] });
  return { getAccessToken: () => auth.getAccessToken() };
}

const defaultFactories: DriveAuthFactories = {
  oauth: oauthClient,
  serviceAccount: serviceAccountClient,
};

export function createDriveTokenSource(env: NodeJS.ProcessEnv, factories: DriveAuthFactories = defaultFactories): () => Promise<string> {
  const choice = selectDriveAuth(env);
  if (choice.mode === 'incomplete') throw new StorageError('DRIVE_AUTH', incompleteOAuthMessage(choice.missing));
  const client = choice.mode === 'oauth' ? factories.oauth(choice) : factories.serviceAccount(env);
  return async () => {
    try {
      const result = await client.getAccessToken();
      const token = typeof result === 'string' ? result : result?.token;
      if (!token) throw new StorageError('STORAGE_FAILED', 'Could not sign in to Google Drive.');
      return token;
    } catch (error) {
      if (error instanceof StorageError) throw error;
      const problem = driveSignInProblem(error);
      if (problem) throw new StorageError('DRIVE_AUTH', problem);
      throw error;
    }
  };
}

/** Consent URL for the one-time loopback sign-in. `prompt=consent` is what makes Google return a refresh token. */
export function driveConsentUrl(input: { clientId: string; redirectUri: string; state: string; loginHint?: string }): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', DRIVE_SCOPE);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', input.state);
  if (input.loginHint) url.searchParams.set('login_hint', input.loginHint);
  return url.toString();
}
