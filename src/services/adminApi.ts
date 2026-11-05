import { PlatformEventView, PublicSettings, request } from './gymApi';

export type AdminPermission = 'users' | 'clubs' | 'moderation' | 'skills' | 'events' | 'communication' | 'reports' | 'payments' | 'settings';

export const PERMISSION_LABELS: Record<AdminPermission, string> = {
  users: 'User management',
  clubs: 'Club management',
  moderation: 'Content moderation',
  skills: 'Skills management',
  events: 'Events management',
  communication: 'Communication centre',
  reports: 'Reports and analytics',
  payments: 'Payments management',
  settings: 'Platform settings',
};

export type AccountState = 'active' | 'suspended' | 'deactivated';

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  level: number | null;
  dateOfBirth: string | null;
  clubId: string | null;
  clubName: string | null;
  state: AccountState;
  suspendedReason: string | null;
  createdAt: string | null;
  lastLoginAt: string | null;
  isAdmin: boolean;
  isOwner: boolean;
}

export interface AdminLogRow {
  id: string;
  at: string;
  by: string;
  action: string;
  target: string;
}

export interface AdminDashboard {
  users: { total: number; gymnasts: number; clubAdmins: number; coaches: number; suspended: number; newLast7Days: number; newLast30Days: number; signedInLast7Days: number };
  clubs: { total: number; approved: number; waiting: number; declined: number };
  activity: { videos: number; comments: number; likes: number; skillVideosWaiting: number; skillVideosApproved: number; openReports: number };
  recentRegistrations: { name: string; role: string; createdAt: string; clubName: string | null }[];
  recentAdminActions: AdminLogRow[];
}

export interface ModerationPost {
  id: string;
  skill: string;
  caption: string;
  videoUrl: string;
  visibility: string;
  createdAt: string;
  authorId: string;
  authorName: string;
}

export interface ModerationQueue {
  reported: (ModerationPost & { reports: { reason: string; createdAt: string; reporterName: string }[] })[];
  comments: { id: string; text: string; postId: string; authorId: string; authorName: string; createdAt: string; why: string }[];
  recentPosts: ModerationPost[];
}

export interface AdminSkill {
  id: string;
  name: string;
  level: number;
  category: string;
  description: string;
  optional: boolean;
  videoId: string | null;
  custom: boolean;
}

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  audience: 'everyone' | 'gymnasts' | 'clubs' | 'club';
  clubId: string | null;
  clubName: string | null;
  createdAt: string;
  createdBy: string;
}

export interface AdminReports {
  weeks: { weekEnding: string; gymnasts: number; clubs: number; videos: number; skillVideos: number; comments: number }[];
  clubs: { id: string; name: string; approval: string; gymnasts: number; coaches: number; skillVideos30Days: number; decisions30Days: number; notices: number; attendance30Days: number; paidUntil: string | null }[];
  accountsFromBeforeTracking: number;
  activeLast30Days: number;
}

export interface AdminRow {
  userId: string;
  name: string;
  email: string;
  role: string;
  owner: boolean;
  permissions: AdminPermission[];
}

const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export const adminApi = {
  dashboard: () => request<AdminDashboard>('/api/admin/dashboard'),

  users: (query: { q?: string; role?: string; state?: string }) =>
    request<{ users: AdminUserRow[] }>(`/api/admin/users?${new URLSearchParams(query as Record<string, string>).toString()}`),
  updateUser: (id: string, input: { name?: string; email?: string; phone?: string; level?: number }) => request<AdminUserRow>(`/api/admin/users/${id}`, json('PATCH', input)),
  suspendUser: (id: string, reason: string) => request<AdminUserRow>(`/api/admin/users/${id}/suspend`, json('POST', { reason })),
  restoreUser: (id: string) => request<AdminUserRow>(`/api/admin/users/${id}/restore`, json('POST')),
  deleteUser: (id: string) => request<{ ok: boolean }>(`/api/admin/users/${id}`, json('DELETE')),

  clubMembers: (id: string) => request<{ members: { id: string; name: string; role: string; level: number | null; member: boolean; state: AccountState }[] }>(`/api/admin/clubs/${id}/members`),
  deleteClub: (id: string, confirmName: string) => request<{ ok: boolean; staff: number; gymnastsKept: number }>(`/api/admin/clubs/${id}`, json('DELETE', { confirmName })),

  moderation: () => request<ModerationQueue>('/api/admin/moderation'),
  removePost: (id: string, reason: string) => request(`/api/admin/posts/${id}/remove`, json('POST', { reason })),
  keepPost: (id: string) => request(`/api/admin/posts/${id}/keep`, json('POST')),
  restoreComment: (id: string) => request(`/api/admin/comments/${id}/restore`, json('POST')),
  removeComment: (id: string) => request(`/api/admin/comments/${id}/remove`, json('POST')),

  skills: () => request<{ skills: AdminSkill[]; removed: { id: string; name: string; level: number }[] }>('/api/admin/skills'),
  addSkill: (input: Record<string, unknown>) => request<AdminSkill>('/api/admin/skills', json('POST', input)),
  saveSkill: (id: string, input: Record<string, unknown>) => request<AdminSkill>(`/api/admin/skills/${id}`, json('PATCH', input)),
  removeSkill: (id: string) => request(`/api/admin/skills/${id}`, json('DELETE')),
  restoreSkill: (id: string) => request(`/api/admin/skills/${id}/restore`, json('POST')),
  orderSkills: (ids: string[]) => request('/api/admin/skills/order', json('POST', { ids })),

  events: () => request<{ events: PlatformEventView[] }>('/api/admin/events'),
  addEvent: (input: Partial<PlatformEventView>) => request<PlatformEventView>('/api/admin/events', json('POST', input)),
  saveEvent: (id: string, input: Partial<PlatformEventView>) => request<PlatformEventView>(`/api/admin/events/${id}`, json('PATCH', input)),
  deleteEvent: (id: string) => request(`/api/admin/events/${id}`, json('DELETE')),

  communication: () => request<{ clubs: { id: string; name: string }[]; announcements: AnnouncementRow[]; enquiries: { id: string; name: string; phone: string; message: string; createdAt: string }[] }>('/api/admin/communication'),
  publishAnnouncement: (input: { title: string; body: string; audience: string; clubId?: string }) => request('/api/admin/announcements', json('POST', input)),
  deleteAnnouncement: (id: string) => request(`/api/admin/announcements/${id}`, json('DELETE')),

  reports: () => request<AdminReports>('/api/admin/reports'),

  saveSettings: (input: Partial<PublicSettings>) => request<PublicSettings>('/api/admin/settings', json('PATCH', input)),
  admins: () => request<{ admins: AdminRow[]; activity: AdminLogRow[] }>('/api/admin/admins'),
  addAdmin: (input: { email: string; name: string; password: string; permissions: AdminPermission[] }) => request('/api/admin/admins', json('POST', input)),
  setAdminPermissions: (id: string, permissions: AdminPermission[]) => request(`/api/admin/admins/${id}`, json('PATCH', { permissions })),
  removeAdmin: (id: string) => request(`/api/admin/admins/${id}`, json('DELETE')),
};
