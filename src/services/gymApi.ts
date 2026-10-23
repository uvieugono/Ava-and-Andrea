const TOKEN_KEY = 'gymtrack_api_token';

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

const STATUS_KEY = 'gymtrack_account_status';
const DUE_KEY = 'gymtrack_payment_due';
const DEV_KEY = 'gymtrack_dev_match';
const UNTIL_KEY = 'gymtrack_access_until';

export function setToken(token: string | null) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export function setAccess(status: string, payment: PaymentInstructions | null, devMatch = false, periodEnd: string | null = null) {
  sessionStorage.setItem(STATUS_KEY, status);
  if (status !== 'paid' && status !== 'active' && status !== 'club' && payment) sessionStorage.setItem(DUE_KEY, JSON.stringify(payment));
  else sessionStorage.removeItem(DUE_KEY);
  sessionStorage.setItem(DEV_KEY, devMatch ? '1' : '0');
  if (periodEnd) sessionStorage.setItem(UNTIL_KEY, periodEnd);
  else sessionStorage.removeItem(UNTIL_KEY);
}

export function readAccess(): { status: string | null; payment: PaymentInstructions | null; devMatch: boolean; until: string | null } {
  const raw = sessionStorage.getItem(DUE_KEY);
  let payment: PaymentInstructions | null = null;
  try {
    payment = raw ? JSON.parse(raw) as PaymentInstructions : null;
  } catch {
    payment = null;
  }
  const until = sessionStorage.getItem(UNTIL_KEY);
  const expired = Boolean(until) && Date.parse(until) <= Date.now();
  return {
    status: expired ? 'locked' : sessionStorage.getItem(STATUS_KEY),
    payment,
    devMatch: sessionStorage.getItem(DEV_KEY) === '1',
    until,
  };
}

export function clearAccess() {
  sessionStorage.removeItem(STATUS_KEY);
  sessionStorage.removeItem(DUE_KEY);
  sessionStorage.removeItem(DEV_KEY);
  sessionStorage.removeItem(UNTIL_KEY);
  setToken(null);
}

export interface PaymentInstructions {
  reference: string;
  amount: number;
  status: string;
  studentCount: number;
  accountName: string;
  accountNumber: string;
}

export interface Progress {
  level: number;
  required: number;
  approved: number;
  pending: number;
  remaining: number;
  hasRequirements: boolean;
}

export type ServerSkillStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface SkillState {
  status: ServerSkillStatus;
  comment: string;
  submissionId: string;
  videoUrl: string;
  reviewedAt: string | null;
}

export interface SubmissionView {
  id: string;
  gymnastId: string;
  skillId: string;
  skillName: string;
  level: number;
  videoUrl: string;
  videoName: string;
  status: ServerSkillStatus;
  comment: string;
  reviewedBy: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface CompetitionView {
  id: string;
  gymnastId: string;
  name: string;
  date: string;
  events: string[];
  result: string;
  comments: string;
  eventId?: string;
  time?: string;
  venue?: string;
  level?: string;
  medal?: '' | 'gold' | 'silver' | 'bronze';
}

export interface ClubDetails {
  name: string;
  coachName: string;
  logoUrl: string | null;
  signatureUrl: string | null;
}

export interface CertificateView {
  id: string;
  gymnastId: string | null;
  gymnastName: string;
  title: string;
  awardDate: string;
  template: string;
  uploadId: string;
  issuedBy: string;
  createdAt: string;
}

export interface DrillView {
  id: string;
  gymnastIds: string[];
  title: string;
  description: string;
  instructions: string;
  attachmentUploadId: string | null;
  createdBy: string;
  createdAt: string;
}

export interface NoticeView {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  authorName: string;
}

export interface ClubGymnastView {
  id: string;
  name: string;
  email: string;
  phone: string;
  level: number;
  dateOfBirth: string | null;
  member: boolean;
  clubName: string | null;
  progress: Progress;
  statuses: Record<string, SkillState>;
  offersBars: boolean;
  offersBeam: boolean;
  submissions: SubmissionView[];
  competitions: CompetitionView[];
}

export interface ClubOverview {
  gymnasts: ClubGymnastView[];
  club: ClubDetails;
  certificates: CertificateView[];
  drills: DrillView[];
  notices: NoticeView[];
  documents: { id: string; name: string; uploadId: string; uploadedAt: string }[];
  attendance: { id: string; gymnastId: string; date: string; present: boolean }[];
  feeReminders: { id: string; gymnastId: string; message: string; status: string; detail: string; sentAt: string }[];
}

export interface ApiUser {
  id: string;
  email: string;
  name: string;
  phone?: string;
  selectedClubId?: string | null;
  selectedClubName?: string | null;
  offersBars?: boolean;
  offersBeam?: boolean;
  progress?: Progress | null;
  username: string;
  role: 'CLUB_ADMIN' | 'COACH' | 'GYMNAST' | 'PARENT';
  level: number | null;
  clubId: string | null;
  clubName: string | null;
  status: string;
  /** 'club': the gymnast belongs to or chose a club, so they never pay themselves. */
  access?: 'trial' | 'paid' | 'locked' | 'club';
  periodEnd?: string | null;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(path, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(body.code || 'ERROR'), { status: response.status, body });
  }
  return body as T;
}

export const gymApi = {
  registerClub: (input: { clubName: string; city: string; adminName: string; email: string; password: string; phone?: string }) =>
    request<{ token: string; user: ApiUser; payment: PaymentInstructions }>('/api/auth/register-club', { method: 'POST', body: JSON.stringify(input) }),
  signupStudent: (input: { name: string; email: string; password: string; phone?: string; level?: number; dateOfBirth: string; selectedClubId?: string | null }) =>
    request<{ token: string; user: ApiUser; payment: PaymentInstructions; devMatch: boolean }>('/api/auth/signup-student', { method: 'POST', body: JSON.stringify(input) }),
  login: (email: string, password: string) =>
    request<{ token: string; user: ApiUser; payment: PaymentInstructions | null }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request<{ user: ApiUser; payment: PaymentInstructions | null }>('/api/me'),
  addStudents: (students: { name: string; email: string; password: string; dateOfBirth: string; level?: number; phone?: string }[]) =>
    request<{ payment: PaymentInstructions; devMatch: boolean }>('/api/clubs/students', { method: 'POST', body: JSON.stringify({ students }) }),
  devMatch: (reference: string, amount: number) =>
    request('/api/payments/dev-match', { method: 'POST', body: JSON.stringify({ reference, amount }) }),
  acceptParent: (studentId: string, parentEmail: string) =>
    request(`/api/students/${studentId}/parent`, { method: 'POST', body: JSON.stringify({ parentEmail }) }),
  events: (q: string) => request<{ featured: { id: string; name: string } | null }>(`/api/events?q=${encodeURIComponent(q)}`),
  clubs: (lat?: number, lng?: number) =>
    request<{ clubs: { id: string; name: string; city: string; km?: number }[] }>(
      `/api/clubs${lat !== undefined && lng !== undefined ? `?lat=${lat}&lng=${lng}` : ''}`,
    ),
  inspo: (category: string, following = false) =>
    request<{ posts: InspoPost[] }>(`/api/inspo?category=${encodeURIComponent(category)}${following ? '&following=1' : ''}`),
  createInspo: (input: Record<string, unknown>) => request<{ post: InspoPost }>('/api/inspo', { method: 'POST', body: JSON.stringify(input) }),
  like: (id: string) => request(`/api/inspo/${id}/like`, { method: 'POST' }),
  comment: (id: string, text: string, parentCommentId?: string | null) =>
    request(`/api/inspo/${id}/comments`, { method: 'POST', body: JSON.stringify({ text, parentCommentId }) }),
  save: (id: string) => request(`/api/inspo/${id}/save`, { method: 'POST' }),
  saved: () => request<{ posts: InspoPost[] }>('/api/inspo/saved'),
  liked: () => request<{ posts: InspoPost[] }>('/api/inspo/liked'),
  post: (id: string) => request<{ post: InspoPost }>(`/api/inspo/post/${encodeURIComponent(id)}`),
  myVideos: () => request<{ posts: InspoPost[] }>('/api/inspo/mine'),
  deleteInspo: (id: string) => request<{ ok: boolean }>(`/api/inspo/${id}`, { method: 'DELETE' }),
  follow: (userId: string) => request('/api/follows', { method: 'POST', body: JSON.stringify({ userId }) }),
  followClub: (clubId: string) => request('/api/follows', { method: 'POST', body: JSON.stringify({ clubId }) }),
  reportComment: (id: string) => request(`/api/comments/${id}/report`, { method: 'POST' }),
  block: (userId: string) => request('/api/blocks', { method: 'POST', body: JSON.stringify({ userId }) }),
  notifications: () => request<{ notifications: { id: string; kind: string; postId: string | null }[] }>('/api/notifications'),

  updateProfile: (input: { name?: string; phone?: string; selectedClubId?: string | null; offersBars?: boolean; offersBeam?: boolean }) =>
    request<{ user: ApiUser }>('/api/me', { method: 'PATCH', body: JSON.stringify(input) }),
  registeredClubs: () => request<{ clubs: { id: string; name: string; city: string }[] }>('/api/clubs?accounts=1'),
  mySkills: () =>
    request<{ level: number | null; statuses: Record<string, SkillState>; progress: Progress | null; submissions: SubmissionView[] }>('/api/me/skills'),
  submitSkill: (skillId: string, videoUrl: string, videoName: string) =>
    request<{ submission: SubmissionView; statuses: Record<string, SkillState>; progress: Progress }>(`/api/skills/${skillId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ videoUrl, videoName }),
    }),
  clubOverview: () => request<ClubOverview>('/api/club/overview'),
  reviewSubmission: (id: string, decision: 'APPROVED' | 'REJECTED', comment: string) =>
    request<{ submission: SubmissionView; advanced: boolean; level: number | null }>(`/api/club/submissions/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision, comment }),
    }),
  notices: () => request<{ notices: NoticeView[] }>('/api/notices'),
  publishNotice: (title: string, body: string) =>
    request<{ notice: NoticeView }>('/api/club/notices', { method: 'POST', body: JSON.stringify({ title, body }) }),
  addCompetition: (input: { gymnastId: string; name: string; date: string; events: string[]; result: string; comments: string }) =>
    request<{ competition: CompetitionView }>('/api/club/competitions', { method: 'POST', body: JSON.stringify(input) }),
  myCompetitions: () => request<{ competitions: CompetitionView[] }>('/api/competitions'),
  addDocument: (name: string, uploadId: string) =>
    request<{ document: { id: string; name: string } }>('/api/club/documents', { method: 'POST', body: JSON.stringify({ name, uploadId }) }),
  markAttendance: (gymnastId: string, date: string, present: boolean) =>
    request('/api/club/attendance', { method: 'POST', body: JSON.stringify({ gymnastId, date, present }) }),
  sendFeeReminder: (gymnastId: string, message: string) =>
    request<{ reminder: { status: 'sent' | 'failed' | 'not_configured' | 'no_phone'; detail: string } }>('/api/club/fee-reminders', {
      method: 'POST',
      body: JSON.stringify({ gymnastId, message }),
    }),
  deleteDocument: (id: string) => request<{ ok: boolean }>(`/api/club/documents/${id}`, { method: 'DELETE' }),
  deleteNotice: (id: string) => request<{ ok: boolean }>(`/api/club/notices/${id}`, { method: 'DELETE' }),
  updateClubDetails: (input: { coachName?: string; logoUploadId?: string | null; signatureUploadId?: string | null }) =>
    request<{ club: ClubDetails }>('/api/club/details', { method: 'PATCH', body: JSON.stringify(input) }),
  addCertificate: (input: { gymnastId: string | null; gymnastName: string; title: string; awardDate: string; template: string; uploadId: string }) =>
    request<{ certificate: CertificateView }>('/api/club/certificates', { method: 'POST', body: JSON.stringify(input) }),
  myCertificates: () => request<{ certificates: CertificateView[] }>('/api/certificates'),
  addDrill: (input: { gymnastIds: string[]; title: string; description: string; instructions: string; attachmentUploadId: string | null }) =>
    request<{ drill: DrillView }>('/api/club/drills', { method: 'POST', body: JSON.stringify(input) }),
  myDrills: () => request<{ drills: DrillView[] }>('/api/drills'),
  addCompetitionEvent: (input: { name: string; date: string; time: string; venue: string; participants: { gymnastId: string; level: string; result: string; medal: string }[] }) =>
    request<{ competitions: CompetitionView[] }>('/api/club/competition-events', { method: 'POST', body: JSON.stringify(input) }),
  recordCompetitionResults: (eventId: string, results: { gymnastId: string; result: string; medal: string }[]) =>
    request<{ competitions: CompetitionView[] }>(`/api/club/competition-events/${eventId}/results`, { method: 'POST', body: JSON.stringify({ results }) }),
  contact: (input: { name: string; phone: string; message: string }) =>
    request<{ ok: boolean }>('/api/contact', { method: 'POST', body: JSON.stringify(input) }),
};

/** A link a <video> or <a> can use: private files need the sign-in token in the address. */
export function mediaUrl(url: string) {
  if (!url.startsWith('/api/uploads/')) return url;
  const token = getToken();
  return token ? `${url}?token=${encodeURIComponent(token)}` : url;
}

export class UploadError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export const MAX_VIDEO_MB = 80;

const UPLOAD_MESSAGES: Record<string, string> = {
  FILE_TOO_LARGE: `That file is too large. Videos can be up to ${MAX_VIDEO_MB} MB.`,
  FILE_TYPE: 'That file type is not supported. Use an MP4, MOV, WebM or 3GP video.',
  EMPTY_FILE: 'That file is empty.',
  PAYMENT_REQUIRED: 'Your free week has ended. Payment is needed before you can upload.',
  UNAUTHORIZED: 'You are signed out. Sign in again to upload.',
  FORBIDDEN: 'Your account is not allowed to upload that.',
  PARENT_REQUIRED: 'A parent must accept before this video can be published.',
  STORAGE_FAILED: 'The file could not be saved to storage. Try again in a moment.',
  DRIVE_QUOTA: 'The file could not be saved to storage. Please tell the GymTrack team.',
  DRIVE_AUTH: 'Google Drive sign-in needs to be renewed before files can be saved. Please tell the GymTrack team.',
};

/** Sends a file to the server. Resolves with its stored address only once the server has saved it. */
export async function uploadFile(
  file: File | Blob,
  options: { scope?: 'public' | 'private'; name?: string; onProgress?: (percent: number) => void } = {},
): Promise<{ id: string; url: string }> {
  if (file.size === 0) throw new UploadError('EMPTY_FILE', UPLOAD_MESSAGES.EMPTY_FILE);
  if (file.size > MAX_VIDEO_MB * 1024 * 1024) throw new UploadError('FILE_TOO_LARGE', UPLOAD_MESSAGES.FILE_TOO_LARGE);
  const name = options.name ?? (file instanceof File ? file.name : 'upload');
  const type = file.type || 'application/octet-stream';
  const fail = (status: number, body: { code?: string }) => {
    const code = body.code || (status === 413 ? 'FILE_TOO_LARGE' : 'ERROR');
    return new UploadError(code, UPLOAD_MESSAGES[code] ?? 'The upload failed. Try again.');
  };

  if (file.size <= UPLOAD_PIECE_BYTES) {
    const { status, body } = await send('POST', `/api/uploads?scope=${options.scope ?? 'private'}&name=${encodeURIComponent(name)}`, file, type, (sent) => {
      options.onProgress?.(Math.round((sent / file.size) * 100));
    });
    if (status < 200 || status >= 300 || !body.url || !body.id) throw fail(status, body);
    return { id: body.id, url: body.url };
  }

  // The live server refuses any single request over 32 MB, so a large file goes up in pieces.
  const started = await send(
    'POST',
    `/api/uploads/sessions?scope=${options.scope ?? 'private'}&name=${encodeURIComponent(name)}&size=${file.size}`,
    null,
    'application/json',
    () => undefined,
    { 'x-upload-content-type': type },
  );
  if (started.status !== 201 || !started.body.id) throw fail(started.status, started.body);
  const sessionId = started.body.id;
  const pieceSize = Number(started.body.pieceSize) || UPLOAD_PIECE_BYTES;
  let offset = 0;
  let retries = 0;
  for (;;) {
    const piece = file.slice(offset, Math.min(offset + pieceSize, file.size));
    let result: { status: number; body: UploadReply };
    try {
      result = await send('PUT', `/api/uploads/sessions/${sessionId}?offset=${offset}`, piece, 'application/octet-stream', (sent) => {
        options.onProgress?.(Math.min(99, Math.round(((offset + sent) / file.size) * 100)));
      });
    } catch (error) {
      // A dropped connection: try the same piece again a few times before giving up.
      if (retries >= 3) throw error;
      retries += 1;
      continue;
    }
    if (result.status === 201 && result.body.url && result.body.id) {
      options.onProgress?.(100);
      return { id: result.body.id, url: result.body.url };
    }
    if (result.status === 200 || (result.status === 409 && typeof result.body.received === 'number')) {
      offset = Number(result.body.received);
      retries = 0;
      continue;
    }
    if (result.status >= 500 && retries < 3) {
      retries += 1;
      continue;
    }
    throw fail(result.status, result.body);
  }
}

/** Each piece of a large upload. The server answers with the size it uses. */
const UPLOAD_PIECE_BYTES = 8 * 1024 * 1024;

type UploadReply = { id?: string; url?: string; code?: string; received?: number; pieceSize?: number };

/** One request with upload progress. XMLHttpRequest, not fetch, so the page can show how much has been sent. */
function send(
  method: string,
  url: string,
  body: Blob | null,
  contentType: string,
  onSent: (bytes: number) => void,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: UploadReply }> {
  const token = getToken();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.setRequestHeader('content-type', contentType);
    if (token) xhr.setRequestHeader('authorization', `Bearer ${token}`);
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onSent(event.loaded);
    };
    xhr.onload = () => {
      let parsed: UploadReply = {};
      try {
        parsed = JSON.parse(xhr.responseText || '{}');
      } catch {
        parsed = {};
      }
      resolve({ status: xhr.status, body: parsed });
    };
    xhr.onerror = () => reject(new UploadError('NETWORK', 'Could not reach GymTrack. Check your connection and try again.'));
    xhr.send(body);
  });
}

export interface InspoPost {
  id: string;
  authorId: string;
  videoUrl: string;
  caption: string;
  skill: string;
  category: string;
  clubId?: string | null;
  clubName: string | null;
  authorName: string;
  username: string;
  age: number | null;
  level: number | null;
  likes: number;
  liked: boolean;
  saved: boolean;
  hashtags: string[];
  visibility: string;
  audienceClubName?: string | null;
  mine?: boolean;
  createdAt?: string;
  comments: { id: string; text: string; authorName: string }[];
}
