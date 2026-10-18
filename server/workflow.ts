import { randomBytes } from 'crypto';
import { INITIAL_SKILLS } from '../src/data/gymData.ts';
import { levelHasRequirements } from '../src/data/curriculumUpdates.ts';
import type { DatabaseShape, UserRecord } from './store.ts';

export type SubmissionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface SubmissionRecord {
  id: string;
  gymnastId: string;
  clubId: string;
  skillId: string;
  skillName: string;
  level: number;
  videoUrl: string;
  videoName: string;
  status: SubmissionStatus;
  comment: string;
  reviewedBy: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface NoticeRecord {
  id: string;
  clubId: string;
  title: string;
  body: string;
  createdAt: string;
  authorName: string;
}

export interface CompetitionRecord {
  id: string;
  clubId: string;
  gymnastId: string;
  name: string;
  date: string;
  events: string[];
  result: string;
  comments: string;
  createdAt: string;
}

export interface DocumentRecord {
  id: string;
  clubId: string;
  name: string;
  uploadId: string;
  uploadedAt: string;
}

export interface AttendanceRecord {
  id: string;
  clubId: string;
  gymnastId: string;
  date: string;
  present: boolean;
}

export interface FeeReminderRecord {
  id: string;
  clubId: string;
  gymnastId: string;
  message: string;
  phone: string;
  status: 'sent' | 'failed' | 'not_configured' | 'no_phone';
  detail: string;
  sentAt: string;
}

export interface ContactRecord {
  id: string;
  name: string;
  phone: string;
  message: string;
  createdAt: string;
  emailedAt: string | null;
  forwardedAt?: string | null;
}

export interface UploadRecord {
  id: string;
  ownerId: string;
  clubId: string | null;
  scope: 'public' | 'private';
  mime: string;
  name: string;
  size: number;
  /** File name on this server's disk, when stored there. */
  file?: string;
  /** Google Drive file id, when stored in Drive. */
  driveFileId?: string;
  createdAt: string;
}

export interface Notifiers {
  mail?: (message: { name: string; phone: string; message: string }) => Promise<void>;
  /** Files the enquiry as a ticket on GymTrack's SolyntaFlow company. */
  enquiry?: (message: { name: string; phone: string; message: string }) => Promise<void>;
  whatsapp?: (input: { to: string; gymnastName: string; clubName: string; message: string }) => Promise<{ status: 'sent' | 'failed' | 'not_configured'; detail: string }>;
}

export const MAX_COMMENT = 1000;

function newId(prefix: string) {
  return `${prefix}_${randomBytes(6).toString('hex')}`;
}

export function clubOf(user: UserRecord) {
  return user.clubId ?? user.selectedClubId ?? null;
}

export function isStaff(user: UserRecord) {
  return (user.role === 'CLUB_ADMIN' || user.role === 'COACH') && Boolean(user.clubId);
}

/** Skills a gymnast has to finish before the level is complete. */
export function requiredSkills(user: Pick<UserRecord, 'level' | 'offersBars' | 'offersBeam'>) {
  const level = user.level ?? 1;
  if (!levelHasRequirements(level)) return [];
  return INITIAL_SKILLS.filter((skill) => {
    if (skill.level !== level) return false;
    if (skill.category === 'BARS' && user.offersBars === false) return false;
    if (skill.category === 'BEAM' && user.offersBeam === false) return false;
    return true;
  });
}

export function normalisePhone(raw: string) {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('234')) return digits;
  if (digits.startsWith('0')) return `234${digits.slice(1)}`;
  return digits;
}

export function createWorkflow(
  db: DatabaseShape,
  save: () => Promise<void>,
  now: () => Date,
  notifiers: Notifiers,
) {
  function latestFor(gymnastId: string, skillId: string) {
    return db.submissions
      .filter((item) => item.gymnastId === gymnastId && item.skillId === skillId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  }

  /** One source of truth for a gymnast's skill statuses: the latest submission per skill. */
  function statusesFor(gymnastId: string) {
    const out: Record<string, { status: SubmissionStatus; comment: string; submissionId: string; videoUrl: string; reviewedAt: string | null }> = {};
    const mine = db.submissions
      .filter((item) => item.gymnastId === gymnastId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const item of mine) {
      out[item.skillId] = {
        status: item.status,
        comment: item.comment,
        submissionId: item.id,
        videoUrl: item.videoUrl,
        reviewedAt: item.reviewedAt,
      };
    }
    // A skill that was approved once stays approved even if a later re-send is pending.
    for (const item of mine) {
      if (item.status === 'APPROVED') {
        out[item.skillId] = { status: 'APPROVED', comment: item.comment, submissionId: item.id, videoUrl: item.videoUrl, reviewedAt: item.reviewedAt };
      }
    }
    return out;
  }

  function progressFor(user: UserRecord) {
    const required = requiredSkills(user);
    const statuses = statusesFor(user.id);
    const approved = required.filter((skill) => statuses[skill.id]?.status === 'APPROVED').length;
    const pending = required.filter((skill) => statuses[skill.id]?.status === 'PENDING').length;
    return {
      level: user.level ?? 1,
      required: required.length,
      approved,
      pending,
      remaining: required.length - approved,
      hasRequirements: required.length > 0,
    };
  }

  /** Moves the gymnast up one level when every required skill is approved. Never more than one level per call. */
  function advanceIfComplete(user: UserRecord) {
    const level = user.level ?? 1;
    if (level >= 10) return false;
    const required = requiredSkills(user);
    if (required.length === 0) return false;
    const statuses = statusesFor(user.id);
    if (!required.every((skill) => statuses[skill.id]?.status === 'APPROVED')) return false;
    user.level = level + 1;
    user.levelUpdatedAt = now().toISOString();
    return true;
  }

  function memberView(user: UserRecord) {
    const club = db.clubs.find((item) => item.id === user.clubId);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      level: user.level ?? 1,
      dateOfBirth: user.dateOfBirth,
      member: user.clubId !== null,
      clubName: club?.name ?? null,
      progress: progressFor(user),
      statuses: statusesFor(user.id),
      offersBars: user.offersBars !== false,
      offersBeam: user.offersBeam !== false,
    };
  }

  function clubMembers(clubId: string) {
    return db.users.filter((item) => item.role === 'GYMNAST' && (item.clubId === clubId || (!item.clubId && item.selectedClubId === clubId)));
  }

  function requireStaff(user: UserRecord) {
    if (!isStaff(user)) throw new Error('FORBIDDEN');
    return user.clubId as string;
  }

  function requireMember(staff: UserRecord, gymnastId: string) {
    const clubId = requireStaff(staff);
    const gymnast = clubMembers(clubId).find((item) => item.id === gymnastId);
    if (!gymnast) throw new Error('NOT_FOUND');
    return { clubId, gymnast };
  }

  return {
    memberView,
    progressFor,
    statusesFor,

    async updateProfile(user: UserRecord, input: { name?: string; phone?: string; selectedClubId?: string | null; offersBars?: boolean; offersBeam?: boolean }) {
      if (input.name !== undefined) {
        const name = input.name.trim();
        if (!name) throw new Error('NAME_REQUIRED');
        user.name = name;
      }
      if (input.phone !== undefined) {
        const phone = input.phone.trim();
        if (phone && normalisePhone(phone).length < 10) throw new Error('PHONE_INVALID');
        user.phone = phone;
      }
      if (input.selectedClubId !== undefined) {
        if (user.role === 'GYMNAST') {
          if (user.clubId) throw new Error('CLUB_LOCKED');
          if (input.selectedClubId === null || input.selectedClubId === '') {
            user.selectedClubId = null;
          } else {
            if (!db.clubs.some((item) => item.id === input.selectedClubId)) throw new Error('CLUB_NOT_FOUND');
            user.selectedClubId = input.selectedClubId;
          }
        }
      }
      if (user.role === 'GYMNAST') {
        if (typeof input.offersBars === 'boolean') user.offersBars = input.offersBars;
        if (typeof input.offersBeam === 'boolean') user.offersBeam = input.offersBeam;
        // A changed requirement set can complete the level.
        advanceIfComplete(user);
      }
      await save();
      return user;
    },

    async submitSkill(user: UserRecord, input: { skillId: string; videoUrl: string; videoName?: string }) {
      if (user.role !== 'GYMNAST') throw new Error('FORBIDDEN');
      const skill = INITIAL_SKILLS.find((item) => item.id === input.skillId);
      if (!skill) throw new Error('SKILL_NOT_FOUND');
      if (skill.level !== (user.level ?? 1)) throw new Error('WRONG_LEVEL');
      const clubId = clubOf(user);
      if (!clubId) throw new Error('NO_CLUB');
      if (!input.videoUrl) throw new Error('VIDEO_REQUIRED');
      const upload = db.uploads.find((item) => `/api/uploads/${item.id}` === input.videoUrl);
      if (!upload || upload.ownerId !== user.id || !upload.mime.startsWith('video/')) throw new Error('VIDEO_INVALID');
      const existing = latestFor(user.id, skill.id);
      if (statusesFor(user.id)[skill.id]?.status === 'APPROVED') throw new Error('ALREADY_APPROVED');
      if (existing?.status === 'PENDING') throw new Error('ALREADY_PENDING');
      if (db.submissions.some((item) => item.videoUrl === input.videoUrl)) throw new Error('DUPLICATE');
      const record: SubmissionRecord = {
        id: newId('sub'),
        gymnastId: user.id,
        clubId,
        skillId: skill.id,
        skillName: skill.name,
        level: skill.level,
        videoUrl: input.videoUrl,
        videoName: (input.videoName || upload.name || '').slice(0, 200),
        status: 'PENDING',
        comment: '',
        reviewedBy: null,
        createdAt: now().toISOString(),
        reviewedAt: null,
      };
      db.submissions.push(record);
      await save();
      return record;
    },

    async reviewSubmission(staff: UserRecord, submissionId: string, decision: 'APPROVED' | 'REJECTED', comment: string) {
      const clubId = requireStaff(staff);
      const submission = db.submissions.find((item) => item.id === submissionId);
      if (!submission || submission.clubId !== clubId) throw new Error('NOT_FOUND');
      const text = (comment ?? '').trim();
      if (!text) throw new Error('COMMENT_REQUIRED');
      if (text.length > MAX_COMMENT) throw new Error('COMMENT_TOO_LONG');
      if (decision !== 'APPROVED' && decision !== 'REJECTED') throw new Error('DECISION');
      // Processing the same submission twice must not change anything.
      if (submission.status !== 'PENDING') throw new Error('ALREADY_REVIEWED');
      submission.status = decision;
      submission.comment = text;
      submission.reviewedBy = staff.name;
      submission.reviewedAt = now().toISOString();
      const gymnast = db.users.find((item) => item.id === submission.gymnastId);
      let advanced = false;
      if (gymnast && decision === 'APPROVED') advanced = advanceIfComplete(gymnast);
      await save();
      return { submission, advanced, level: gymnast?.level ?? null };
    },

    mySubmissions(user: UserRecord) {
      return db.submissions
        .filter((item) => item.gymnastId === user.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    clubOverview(staff: UserRecord) {
      const clubId = requireStaff(staff);
      const members = clubMembers(clubId);
      const ids = new Set(members.map((item) => item.id));
      const since = new Date(now().getTime() - 90 * 86400000).toISOString().slice(0, 10);
      return {
        gymnasts: members.map((item) => ({
          ...memberView(item),
          submissions: db.submissions
            .filter((sub) => sub.gymnastId === item.id)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
          competitions: db.competitions
            .filter((comp) => comp.gymnastId === item.id)
            .sort((a, b) => b.date.localeCompare(a.date)),
        })),
        notices: db.notices.filter((item) => item.clubId === clubId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        documents: db.documents.filter((item) => item.clubId === clubId).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),
        attendance: db.attendance.filter((item) => item.clubId === clubId && ids.has(item.gymnastId) && item.date >= since),
        feeReminders: db.feeReminders.filter((item) => item.clubId === clubId).sort((a, b) => b.sentAt.localeCompare(a.sentAt)).slice(0, 50),
      };
    },

    async publishNotice(staff: UserRecord, input: { title: string; body: string }) {
      const clubId = requireStaff(staff);
      const title = (input.title ?? '').trim();
      const body = (input.body ?? '').trim();
      if (!title || !body) throw new Error('MISSING');
      const record: NoticeRecord = { id: newId('ntc'), clubId, title: title.slice(0, 200), body: body.slice(0, 4000), createdAt: now().toISOString(), authorName: staff.name };
      db.notices.push(record);
      await save();
      return record;
    },

    /** Notices the viewer's club has posted. Staff see their club's; gymnasts see the club they belong to or chose. */
    noticesFor(user: UserRecord) {
      const clubId = isStaff(user) ? user.clubId : clubOf(user);
      if (!clubId) return [];
      return db.notices.filter((item) => item.clubId === clubId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async addCompetition(staff: UserRecord, input: { gymnastId: string; name: string; date: string; events?: string[]; result?: string; comments?: string }) {
      const { clubId, gymnast } = requireMember(staff, input.gymnastId);
      const name = (input.name ?? '').trim();
      if (!name) throw new Error('MISSING');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date ?? '') || Number.isNaN(new Date(input.date).getTime())) throw new Error('DATE');
      const record: CompetitionRecord = {
        id: newId('cmp'),
        clubId,
        gymnastId: gymnast.id,
        name: name.slice(0, 200),
        date: input.date,
        events: (input.events ?? []).map((item) => String(item).trim()).filter(Boolean).slice(0, 12),
        result: (input.result ?? '').trim().slice(0, 1000),
        comments: (input.comments ?? '').trim().slice(0, 2000),
        createdAt: now().toISOString(),
      };
      db.competitions.push(record);
      await save();
      return record;
    },

    competitionsFor(user: UserRecord, gymnastId?: string) {
      if (isStaff(user)) {
        const clubId = user.clubId as string;
        return db.competitions
          .filter((item) => item.clubId === clubId && (!gymnastId || item.gymnastId === gymnastId))
          .sort((a, b) => b.date.localeCompare(a.date));
      }
      return db.competitions.filter((item) => item.gymnastId === user.id).sort((a, b) => b.date.localeCompare(a.date));
    },

    async addDocument(staff: UserRecord, input: { name: string; uploadId: string }) {
      const clubId = requireStaff(staff);
      const upload = db.uploads.find((item) => item.id === input.uploadId);
      if (!upload || upload.ownerId !== staff.id) throw new Error('UPLOAD_INVALID');
      const record: DocumentRecord = { id: newId('doc'), clubId, name: (input.name || upload.name).slice(0, 200), uploadId: upload.id, uploadedAt: now().toISOString() };
      db.documents.push(record);
      await save();
      return record;
    },

    documentsFor(user: UserRecord) {
      if (!isStaff(user)) return [];
      return db.documents.filter((item) => item.clubId === user.clubId).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
    },

    async markAttendance(staff: UserRecord, gymnastId: string, date: string, present: boolean) {
      const { clubId, gymnast } = requireMember(staff, gymnastId);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('DATE');
      const idValue = `${gymnast.id}:${date}`;
      const existing = db.attendance.find((item) => item.id === idValue);
      if (existing) existing.present = present;
      else db.attendance.push({ id: idValue, clubId, gymnastId: gymnast.id, date, present });
      await save();
      return { ok: true };
    },

    async sendFeeReminder(staff: UserRecord, input: { gymnastId: string; message: string }) {
      const { clubId, gymnast } = requireMember(staff, input.gymnastId);
      const message = (input.message ?? '').trim();
      if (!message) throw new Error('MISSING');
      const club = db.clubs.find((item) => item.id === clubId);
      const to = normalisePhone(gymnast.phone);
      let status: FeeReminderRecord['status'];
      let detail: string;
      if (!to) {
        status = 'no_phone';
        detail = 'No telephone number is registered for this gymnast.';
      } else if (!notifiers.whatsapp) {
        status = 'not_configured';
        detail = 'WhatsApp is not configured.';
      } else {
        try {
          const result = await notifiers.whatsapp({ to, gymnastName: gymnast.name, clubName: club?.name ?? 'your club', message });
          status = result.status;
          detail = result.detail;
        } catch (error) {
          status = 'failed';
          detail = error instanceof Error ? error.message : 'Send failed';
        }
      }
      const record: FeeReminderRecord = {
        id: newId('fee'),
        clubId,
        gymnastId: gymnast.id,
        message: message.slice(0, 1000),
        phone: to,
        status,
        detail: detail.slice(0, 300),
        sentAt: now().toISOString(),
      };
      db.feeReminders.push(record);
      await save();
      return record;
    },

    async submitContact(input: { name?: string; phone?: string; message?: string }) {
      const name = (input.name ?? '').trim();
      const phone = (input.phone ?? '').trim();
      const message = (input.message ?? '').trim();
      if (!name || !phone || !message) throw new Error('MISSING');
      if (normalisePhone(phone).length < 7) throw new Error('PHONE_INVALID');
      if (name.length > 120 || message.length > 4000 || phone.length > 40) throw new Error('TOO_LONG');
      const record: ContactRecord = { id: newId('ctc'), name, phone, message, createdAt: now().toISOString(), emailedAt: null };
      db.contacts.push(record);
      await save();
      let emailed = false;
      let forwarded = false;
      if (notifiers.enquiry) {
        try {
          await notifiers.enquiry({ name, phone, message });
          record.forwardedAt = now().toISOString();
          forwarded = true;
          await save();
        } catch (error) {
          console.error('Contact enquiry could not be filed on SolyntaFlow', error instanceof Error ? error.message : error);
        }
      }
      if (notifiers.mail) {
        try {
          await notifiers.mail({ name, phone, message });
          record.emailedAt = now().toISOString();
          emailed = true;
          await save();
        } catch (error) {
          console.error('Contact email failed', error instanceof Error ? error.message : error);
        }
      }
      return { id: record.id, emailed, forwarded };
    },

    /** Tries again for enquiries that were saved but could not be emailed. */
    async resendContacts() {
      let sent = 0;
      for (const item of db.contacts) {
        try {
          if (notifiers.enquiry && !item.forwardedAt) {
            await notifiers.enquiry({ name: item.name, phone: item.phone, message: item.message });
            item.forwardedAt = now().toISOString();
            sent += 1;
          }
          if (notifiers.mail && !item.emailedAt) {
            await notifiers.mail({ name: item.name, phone: item.phone, message: item.message });
            item.emailedAt = now().toISOString();
            sent += 1;
          }
        } catch {
          break;
        }
      }
      if (sent) await save();
      return sent;
    },

    async saveUpload(input: Omit<UploadRecord, 'id' | 'createdAt'>) {
      const record: UploadRecord = { ...input, id: newId('upl'), createdAt: now().toISOString() };
      db.uploads.push(record);
      await save();
      return record;
    },

    uploadById(uploadId: string) {
      return db.uploads.find((item) => item.id === uploadId) ?? null;
    },

    canReadUpload(user: UserRecord | null, upload: UploadRecord) {
      if (upload.scope === 'public') return true;
      if (!user) return false;
      if (upload.ownerId === user.id) return true;
      if (isStaff(user) && upload.clubId && upload.clubId === user.clubId) return true;
      if (isStaff(user) && db.submissions.some((item) => item.videoUrl === `/api/uploads/${upload.id}` && item.clubId === user.clubId)) return true;
      return false;
    },
  };
}
