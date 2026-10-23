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
  if (status !== 'paid' && status !== 'active' && payment) sessionStorage.setItem(DUE_KEY, JSON.stringify(payment));
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
  access?: 'trial' | 'paid' | 'locked';
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
  const token = getToken();
  const name = options.name ?? (file instanceof File ? file.name : 'upload');
  // XMLHttpRequest, not fetch, so the page can show how much has been sent.
  const { status, body } = await new Promise<{ status: number; body: { id?: string; url?: string; code?: string } }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/uploads?scope=${options.scope ?? 'private'}&name=${encodeURIComponent(name)}`);
    xhr.setRequestHeader('content-type', file.type || 'application/octet-stream');
    if (token) xhr.setRequestHeader('authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      let parsed = {};
      try {
        parsed = JSON.parse(xhr.responseText || '{}');
      } catch {
        parsed = {};
      }
      resolve({ status: xhr.status, body: parsed });
    };
    xhr.onerror = () => reject(new UploadError('NETWORK', 'Could not reach GymTrack. Check your connection and try again.'));
    xhr.send(file);
  });
  if (status < 200 || status >= 300 || !body.url || !body.id) {
    const code = body.code || (status === 413 ? 'FILE_TOO_LARGE' : 'ERROR');
    throw new UploadError(code, UPLOAD_MESSAGES[code] ?? 'The upload failed. Try again.');
  }
  return { id: body.id, url: body.url };
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
