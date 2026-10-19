import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  UserProfile,
  Skill,
  Workout,
  EventItem,
  Product,
  CartItem,
  CommunityPost,
  AchievementBadge,
  USAGLevel,
  ApparatusCategory,
  YouTubeTutorial,
  UserRole,
  NavigationTab,
  RegisteredClub,
  RosterGymnast,
  CoachNote,
  PracticeFocusArea,
  AchievementCertificate,
  RosterEvidenceSubmission,
  SkillStatus,
} from '../types';
import { INITIAL_SKILLS, WORKOUTS, GYM_EVENTS, PRODUCTS, BADGES, COMMUNITY_POSTS } from '../data/gymData';
import { INITIAL_REGISTERED_CLUBS } from '../data/gymManagementData';
import {
  ApiUser,
  ClubGymnastView,
  ClubOverview,
  CompetitionView,
  NoticeView,
  Progress,
  SkillState,
  clearAccess,
  getToken,
  gymApi,
  mediaUrl,
  uploadFile,
  UploadError,
} from '../services/gymApi';

interface XpToast {
  id: string;
  amount: number;
  message: string;
}

export interface ActionResult {
  ok: boolean;
  message: string;
  advanced?: boolean;
}

interface GymContextType {
  user: UserProfile;
  /** False until a saved sign-in has been checked with the server. */
  ready: boolean;
  skills: Skill[];
  progress: Progress | null;
  workouts: Workout[];
  events: EventItem[];
  products: Product[];
  cart: CartItem[];
  badges: AchievementBadge[];
  communityPosts: CommunityPost[];
  currentTab: NavigationTab;
  setCurrentTab: (tab: NavigationTab) => void;
  userRole: UserRole;
  isStaff: boolean;
  activeXpToast: XpToast | null;
  celebrationBadge: AchievementBadge | null;
  dismissCelebration: () => void;

  // Account
  loginFromServer: (user: ApiUser) => void;
  logoutUser: () => void;
  refreshAccount: () => Promise<void>;
  updateUserProfile: (updates: Partial<UserProfile>) => void;
  saveProfile: (input: { name?: string; phone?: string; selectedClubId?: string | null; offersBars?: boolean; offersBeam?: boolean }) => Promise<ActionResult>;

  // Club office (staff). Everything below comes from the server.
  registeredClubs: RegisteredClub[];
  clubOverview: ClubOverview | null;
  rosterGymnasts: RosterGymnast[];
  refreshOverview: () => Promise<void>;
  addCoachNote: (gymnastId: string, note: Omit<CoachNote, 'id' | 'date'>) => void;
  addPracticeFocus: (gymnastId: string, focus: Omit<PracticeFocusArea, 'id' | 'assignedDate'>) => void;
  updatePracticeFocusStatus: (gymnastId: string, focusId: string, status: PracticeFocusArea['status']) => void;
  reviewEvidenceSubmission: (gymnastId: string, submissionId: string, status: 'APPROVED' | 'NEEDS_WORK', comment: string) => Promise<ActionResult>;
  addCompetition: (input: { gymnastId: string; name: string; date: string; events: string[]; result: string; comments: string }) => Promise<ActionResult>;
  markAttendance: (gymnastId: string, date: string, present: boolean) => Promise<ActionResult>;
  sendFeeReminder: (gymnastId: string, message: string) => Promise<ActionResult>;
  publishNotice: (title: string, body: string) => Promise<ActionResult>;
  addDocument: (file: File) => Promise<ActionResult>;
  notices: NoticeView[];
  competitions: CompetitionView[];
  certificates: AchievementCertificate[];
  issueCertificate: (gymnastName: string, level: number, note: string) => void;
  pendingSkillId: string | null;
  openSkill: (skillId: string) => void;

  // Skills
  submitSkillVideo: (skillId: string, file: File) => Promise<ActionResult>;
  updateSkillTutorial: (skillId: string, tutorial: YouTubeTutorial) => void;

  // Workouts
  completeWorkout: (workoutId: string) => void;

  // Events
  toggleEventCalendar: (eventId: string) => void;
  downloadEventIcs: (event: EventItem) => void;

  // Shop
  addToCart: (product: Product, quantity?: number, selectedSize?: string, selectedColor?: string) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;

  // Community
  addCommunityPost: (title: string, description: string, apparatus: ApparatusCategory, videoFileName?: string) => void;
  reactToPost: (postId: string, reactionType: 'heart' | 'star' | 'clap' | 'fire') => void;
  addCommentToPost: (postId: string, commentText: string) => void;

  awardXp: (amount: number, reason: string) => void;
}

const GymContext = createContext<GymContextType | undefined>(undefined);

const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80';

const SIGNED_OUT: UserProfile = {
  id: '',
  fullName: '',
  phoneNumber: '',
  email: '',
  level: 1,
  clubName: '',
  avatar: DEFAULT_AVATAR,
  xp: 0,
  nextLevelXpGoal: 1000,
  dayStreak: 0,
  skillsMasteredCount: 0,
  isLoggedIn: false,
  role: 'GYMNAST',
  offersBars: true,
  offersBeam: true,
  clubId: null,
  selectedClubId: null,
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
    return saved ? (JSON.parse(saved) as T) : fallback;
  } catch {
    return fallback;
  }
}

function avatarKey(id: string) {
  return `gymtrack_avatar_${id}`;
}

function toProfile(api: ApiUser): UserProfile {
  const role: UserRole = api.role === 'CLUB_ADMIN' || api.role === 'COACH' ? api.role : 'GYMNAST';
  const stored = typeof window !== 'undefined' ? localStorage.getItem(avatarKey(api.id)) : null;
  return {
    id: api.id,
    fullName: api.name,
    phoneNumber: api.phone ?? '',
    email: api.email,
    level: ((api.level ?? 1) as USAGLevel),
    // Only the club this person really belongs to or chose. Never a default club.
    clubName: api.clubName ?? api.selectedClubName ?? '',
    avatar: stored || DEFAULT_AVATAR,
    xp: 0,
    nextLevelXpGoal: 1000,
    dayStreak: 0,
    skillsMasteredCount: api.progress?.approved ?? 0,
    isLoggedIn: true,
    role,
    offersBars: api.offersBars !== false,
    offersBeam: api.offersBeam !== false,
    clubId: api.clubId,
    selectedClubId: api.selectedClubId ?? null,
  };
}

const SERVER_TO_SKILL: Record<SkillState['status'], SkillStatus> = {
  PENDING: 'AWAITING_VERIFICATION',
  APPROVED: 'VERIFIED',
  REJECTED: 'CHANGES_REQUIRED',
};

function ageYears(dateOfBirth: string | null) {
  if (!dateOfBirth) return 0;
  const born = new Date(dateOfBirth);
  if (Number.isNaN(born.getTime())) return 0;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  if (now.getMonth() < born.getMonth() || (now.getMonth() === born.getMonth() && now.getDate() < born.getDate())) age -= 1;
  return age;
}

const SUBMIT_MESSAGES: Record<string, string> = {
  NO_CLUB: 'Choose your club in My Profile first, so the right club can review this skill.',
  ALREADY_PENDING: 'This skill is already waiting for your club to review it.',
  ALREADY_APPROVED: 'This skill is already approved.',
  WRONG_LEVEL: 'This skill is not part of your current level.',
  PAYMENT_REQUIRED: 'Your free week has ended. Payment is needed before you can submit skills.',
  VIDEO_INVALID: 'That video could not be used. Upload it again.',
  DUPLICATE: 'That video has already been submitted.',
};

const REVIEW_MESSAGES: Record<string, string> = {
  COMMENT_REQUIRED: 'Add a comment explaining your decision.',
  COMMENT_TOO_LONG: 'That comment is too long. Keep it under 1,000 characters.',
  ALREADY_REVIEWED: 'This submission has already been reviewed.',
  NOT_FOUND: 'That submission could not be found for your club.',
  FORBIDDEN: 'Only club staff can review submissions.',
};

function errorCode(error: unknown) {
  return (error as { body?: { code?: string } })?.body?.code ?? (error as UploadError)?.code ?? 'ERROR';
}

export const GymProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile>(SIGNED_OUT);
  const [ready, setReady] = useState(() => !getToken());
  const [skillStates, setSkillStates] = useState<Record<string, SkillState>>({});
  const [progress, setProgress] = useState<Progress | null>(null);
  const [skillBase, setSkillBase] = useState<Skill[]>(INITIAL_SKILLS);
  const [workouts, setWorkouts] = useState<Workout[]>(WORKOUTS);
  const [events, setEvents] = useState<EventItem[]>(() => readJson('gymtrack_events_v2', GYM_EVENTS));
  const [products] = useState<Product[]>(PRODUCTS);
  const [cart, setCart] = useState<CartItem[]>(() => readJson('gymtrack_cart', []));
  const [badges] = useState<AchievementBadge[]>(() => readJson('gymtrack_badges', BADGES));
  const [communityPosts, setCommunityPosts] = useState<CommunityPost[]>(() => readJson('gymtrack_community', COMMUNITY_POSTS));
  const [registeredClubs] = useState<RegisteredClub[]>(INITIAL_REGISTERED_CLUBS);
  const [overview, setOverview] = useState<ClubOverview | null>(null);
  const [notices, setNotices] = useState<NoticeView[]>([]);
  const [competitions, setCompetitions] = useState<CompetitionView[]>([]);
  const [extras, setExtras] = useState<Record<string, { coachNotes: CoachNote[]; practiceAreas: PracticeFocusArea[] }>>(() =>
    readJson('gymtrack_roster_extras_v1', {}),
  );
  const [certificates, setCertificates] = useState<AchievementCertificate[]>(() => readJson('gymtrack_certificates_v1', []));
  const [currentTab, setTab] = useState<NavigationTab>('home');
  const [pendingSkillId, setPendingSkillId] = useState<string | null>(null);
  const [activeXpToast, setActiveXpToast] = useState<XpToast | null>(null);
  const [celebrationBadge, setCelebrationBadge] = useState<AchievementBadge | null>(null);
  const levelRef = useRef<number | null>(null);

  const isStaff = user.isLoggedIn && (user.role === 'CLUB_ADMIN' || user.role === 'COACH') && Boolean(user.clubId);
  const userRole: UserRole = user.role ?? 'GYMNAST';

  useEffect(() => { localStorage.setItem('gymtrack_events_v2', JSON.stringify(events)); }, [events]);
  useEffect(() => { localStorage.setItem('gymtrack_cart', JSON.stringify(cart)); }, [cart]);
  useEffect(() => { localStorage.setItem('gymtrack_community', JSON.stringify(communityPosts)); }, [communityPosts]);
  useEffect(() => { localStorage.setItem('gymtrack_roster_extras_v1', JSON.stringify(extras)); }, [extras]);
  useEffect(() => { localStorage.setItem('gymtrack_certificates_v1', JSON.stringify(certificates)); }, [certificates]);

  // ---- Skills: one source of truth. The statuses come from the club's decisions on the server. ----
  const skills = useMemo<Skill[]>(
    () =>
      skillBase.map((skill) => {
        const state = skillStates[skill.id];
        if (!state) {
          return { ...skill, status: 'NOT_COMPLETED' as SkillStatus, verifiedNote: undefined, verifiedBy: undefined, videoPreviewUrl: undefined };
        }
        return {
          ...skill,
          status: SERVER_TO_SKILL[state.status],
          verifiedNote: state.comment || undefined,
          verifiedBy: state.status === 'APPROVED' ? 'Your club' : undefined,
          videoPreviewUrl: state.videoUrl ? mediaUrl(state.videoUrl) : undefined,
        };
      }),
    [skillBase, skillStates],
  );

  const awardXp = useCallback((amount: number, reason: string) => {
    setUser((prev) => ({ ...prev, xp: prev.xp + amount }));
    const toastId = Math.random().toString();
    setActiveXpToast({ id: toastId, amount, message: reason });
    setTimeout(() => setActiveXpToast((current) => (current?.id === toastId ? null : current)), 3500);
  }, []);

  const dismissCelebration = () => setCelebrationBadge(null);

  // ---- Account ----
  const applyServerUser = useCallback((api: ApiUser) => {
    setUser((prev) => ({ ...toProfile(api), xp: prev.id === api.id ? prev.xp : 0 }));
  }, []);

  const refreshAccount = useCallback(async () => {
    if (!getToken()) return;
    const me = await gymApi.me();
    const next = me.user;
    if (next.role === 'GYMNAST') {
      const skillsResult = await gymApi.mySkills();
      setSkillStates(skillsResult.statuses);
      setProgress(skillsResult.progress);
      const previous = levelRef.current;
      if (previous !== null && next.level && next.level > previous) {
        awardXp(100, `Level ${next.level} unlocked. Every required skill was approved.`);
      }
      levelRef.current = next.level ?? null;
      gymApi.myCompetitions().then((result) => setCompetitions(result.competitions)).catch(() => undefined);
    } else {
      setSkillStates({});
      setProgress(null);
    }
    applyServerUser(next);
    gymApi.notices().then((result) => setNotices(result.notices)).catch(() => undefined);
  }, [applyServerUser, awardXp]);

  const refreshOverview = useCallback(async () => {
    if (!getToken()) return;
    try {
      setOverview(await gymApi.clubOverview());
    } catch {
      setOverview(null);
    }
  }, []);

  const loginFromServer = useCallback((api: ApiUser) => {
    levelRef.current = api.level ?? null;
    setSkillStates({});
    setProgress(api.progress ?? null);
    setOverview(null);
    setNotices([]);
    setCompetitions([]);
    setUser({ ...toProfile(api), xp: 0 });
    setTab(api.role === 'CLUB_ADMIN' || api.role === 'COACH' ? 'dashboard' : 'home');
    setReady(true);
  }, []);

  const logoutUser = useCallback(() => {
    clearAccess();
    levelRef.current = null;
    setUser(SIGNED_OUT);
    setSkillStates({});
    setProgress(null);
    setOverview(null);
    setNotices([]);
    setCompetitions([]);
    setTab('home');
  }, []);

  // Pick up a saved sign-in when the page opens.
  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    gymApi
      .me()
      .then((result) => {
        if (cancelled) return;
        loginFromServer(result.user);
        levelRef.current = result.user.level ?? null;
      })
      .catch(() => {
        if (cancelled) return;
        clearAccess();
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [loginFromServer]);

  // Keep the account, skill decisions, notices and the club's queue up to date.
  useEffect(() => {
    if (!user.isLoggedIn) return;
    const tick = () => {
      if (document.visibilityState === 'hidden') return;
      refreshAccount().catch(() => undefined);
      if (isStaff) refreshOverview().catch(() => undefined);
    };
    tick();
    const timer = window.setInterval(tick, 20000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [user.isLoggedIn, user.id, isStaff, refreshAccount, refreshOverview]);

  const setCurrentTab = useCallback(
    (tab: NavigationTab) => {
      // The Club Dashboard is only for signed-in club accounts.
      if (tab === 'dashboard' && !isStaff) {
        setTab('home');
        return;
      }
      setTab(tab);
      if (user.isLoggedIn) {
        refreshAccount().catch(() => undefined);
        if (isStaff) refreshOverview().catch(() => undefined);
      }
    },
    [isStaff, user.isLoggedIn, refreshAccount, refreshOverview],
  );

  const updateUserProfile = (updates: Partial<UserProfile>) => {
    setUser((prev) => {
      if (updates.avatar && prev.id) {
        try {
          localStorage.setItem(avatarKey(prev.id), updates.avatar);
        } catch {
          // storage full: the photo only lasts for this visit
        }
      }
      return { ...prev, ...updates };
    });
  };

  const saveProfile: GymContextType['saveProfile'] = async (input) => {
    try {
      const result = await gymApi.updateProfile(input);
      applyServerUser(result.user);
      if (result.user.progress) setProgress(result.user.progress);
      return { ok: true, message: 'Profile saved.' };
    } catch (error) {
      const code = errorCode(error);
      const messages: Record<string, string> = {
        PHONE_INVALID: 'Enter a valid telephone number.',
        NAME_REQUIRED: 'Your name cannot be empty.',
        CLUB_LOCKED: 'Your club added you, so only your club can change this.',
        CLUB_NOT_FOUND: 'That club is not registered on GymTrack.',
        UNAUTHORIZED: 'You are signed out. Sign in again.',
      };
      return { ok: false, message: messages[code] ?? 'Your profile could not be saved. Try again.' };
    }
  };

  // ---- Skill submission ----
  const submitSkillVideo: GymContextType['submitSkillVideo'] = async (skillId, file) => {
    try {
      const stored = await uploadFile(file, { scope: 'private' });
      const result = await gymApi.submitSkill(skillId, stored.url, file.name);
      setSkillStates(result.statuses);
      setProgress(result.progress);
      awardXp(50, 'Skill sent to your club for approval');
      return { ok: true, message: 'Sent. Your club will review it and leave feedback here.' };
    } catch (error) {
      if (error instanceof UploadError) return { ok: false, message: error.message };
      const code = errorCode(error);
      return { ok: false, message: SUBMIT_MESSAGES[code] ?? 'The skill could not be submitted. Try again.' };
    }
  };

  const reviewEvidenceSubmission: GymContextType['reviewEvidenceSubmission'] = async (_gymnastId, submissionId, status, comment) => {
    try {
      const result = await gymApi.reviewSubmission(submissionId, status === 'APPROVED' ? 'APPROVED' : 'REJECTED', comment);
      await refreshOverview();
      return {
        ok: true,
        advanced: result.advanced,
        message:
          status === 'APPROVED'
            ? result.advanced
              ? `Approved. Every required skill is now approved, so the gymnast moves up to Level ${result.level}.`
              : 'Approved. The gymnast can see your comment.'
            : 'Sent back. The gymnast can see your feedback and send a new video.',
      };
    } catch (error) {
      const code = errorCode(error);
      return { ok: false, message: REVIEW_MESSAGES[code] ?? 'The decision could not be saved. Try again.' };
    }
  };

  const addCompetition: GymContextType['addCompetition'] = async (input) => {
    try {
      await gymApi.addCompetition(input);
      await refreshOverview();
      return { ok: true, message: 'Competition saved to the gymnast\'s profile.' };
    } catch (error) {
      const code = errorCode(error);
      const messages: Record<string, string> = {
        MISSING: 'Enter the competition name.',
        DATE: 'Enter the date of the competition.',
        NOT_FOUND: 'That gymnast is not in your club.',
      };
      return { ok: false, message: messages[code] ?? 'The record could not be saved. Try again.' };
    }
  };

  const markAttendance: GymContextType['markAttendance'] = async (gymnastId, date, present) => {
    try {
      await gymApi.markAttendance(gymnastId, date, present);
      await refreshOverview();
      return { ok: true, message: 'Attendance saved.' };
    } catch {
      return { ok: false, message: 'Attendance could not be saved. Try again.' };
    }
  };

  const sendFeeReminder: GymContextType['sendFeeReminder'] = async (gymnastId, message) => {
    try {
      const result = await gymApi.sendFeeReminder(gymnastId, message);
      await refreshOverview();
      const { status, detail } = result.reminder;
      if (status === 'sent') return { ok: true, message: 'WhatsApp reminder sent to the number registered for this gymnast.' };
      if (status === 'no_phone') return { ok: false, message: 'This gymnast has no telephone number on file. Nothing was sent.' };
      if (status === 'not_configured') return { ok: false, message: 'WhatsApp is not set up yet, so nothing was sent. The reminder was recorded.' };
      return { ok: false, message: `WhatsApp did not send it: ${detail}` };
    } catch {
      return { ok: false, message: 'The reminder could not be sent. Try again.' };
    }
  };

  const publishNotice: GymContextType['publishNotice'] = async (title, body) => {
    try {
      await gymApi.publishNotice(title, body);
      await Promise.all([refreshOverview(), gymApi.notices().then((r) => setNotices(r.notices))]);
      return { ok: true, message: 'Notice published. Your gymnasts can see it on their profile and home page.' };
    } catch {
      return { ok: false, message: 'The notice could not be published. Fill in both fields and try again.' };
    }
  };

  const addDocument: GymContextType['addDocument'] = async (file) => {
    try {
      const stored = await uploadFile(file, { scope: 'private' });
      await gymApi.addDocument(file.name, stored.id);
      await refreshOverview();
      return { ok: true, message: `${file.name} is stored for the club.` };
    } catch (error) {
      if (error instanceof UploadError) return { ok: false, message: error.message };
      return { ok: false, message: 'The document could not be saved. Try again.' };
    }
  };

  // ---- Roster: the club's real gymnasts, from the server ----
  const rosterGymnasts = useMemo<RosterGymnast[]>(() => {
    if (!overview) return [];
    return overview.gymnasts.map((member: ClubGymnastView) => {
      const extra = extras[member.id];
      const submissions: RosterEvidenceSubmission[] = member.submissions.map((item) => ({
        id: item.id,
        skillId: item.skillId,
        skillName: item.skillName,
        submittedDate: new Date(item.createdAt).toLocaleDateString(),
        videoName: item.videoName,
        videoPreviewUrl: mediaUrl(item.videoUrl),
        status: item.status === 'PENDING' ? 'AWAITING_REVIEW' : item.status === 'APPROVED' ? 'APPROVED' : 'NEEDS_WORK',
        coachFeedback: item.comment,
        reviewedBy: item.reviewedBy,
        reviewedAt: item.reviewedAt,
      }));
      const focus: RosterGymnast['eventsFocus'] = ['VAULT', 'FLOOR'];
      if (member.offersBars) focus.push('BARS');
      if (member.offersBeam) focus.push('BEAM');
      const zero = { score: 0, meet: '', date: '' };
      return {
        id: member.id,
        name: member.name,
        level: member.level as USAGLevel,
        avatar: localStorage.getItem(avatarKey(member.id)) || DEFAULT_AVATAR,
        age: ageYears(member.dateOfBirth),
        clubName: member.clubName ?? user.clubName,
        eventsFocus: focus,
        completedSkillsCount: member.progress.approved,
        totalSkillsCount: member.progress.required,
        personalBests: { vault: zero, bars: zero, beam: zero, floor: zero, allAround: zero },
        competitionHistory: [],
        coachNotes: extra?.coachNotes ?? [],
        practiceAreas: extra?.practiceAreas ?? [],
        evidenceSubmissions: submissions,
        phone: member.phone,
        isMember: member.member,
        competitions: member.competitions,
        hasRequirements: member.progress.hasRequirements,
        pendingCount: member.progress.pending,
      };
    });
  }, [overview, extras, user.clubName]);

  const addCoachNote = (gymnastId: string, note: Omit<CoachNote, 'id' | 'date'>) => {
    const full: CoachNote = {
      ...note,
      id: 'note_' + Date.now(),
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    };
    setExtras((prev) => {
      const current = prev[gymnastId] ?? { coachNotes: [], practiceAreas: [] };
      return { ...prev, [gymnastId]: { ...current, coachNotes: [full, ...current.coachNotes] } };
    });
  };

  const addPracticeFocus = (gymnastId: string, focus: Omit<PracticeFocusArea, 'id' | 'assignedDate'>) => {
    const full: PracticeFocusArea = { ...focus, id: 'focus_' + Date.now(), assignedDate: 'Today' };
    setExtras((prev) => {
      const current = prev[gymnastId] ?? { coachNotes: [], practiceAreas: [] };
      return { ...prev, [gymnastId]: { ...current, practiceAreas: [full, ...current.practiceAreas] } };
    });
  };

  const updatePracticeFocusStatus = (gymnastId: string, focusId: string, status: PracticeFocusArea['status']) => {
    setExtras((prev) => {
      const current = prev[gymnastId];
      if (!current) return prev;
      return {
        ...prev,
        [gymnastId]: { ...current, practiceAreas: current.practiceAreas.map((item) => (item.id === focusId ? { ...item, status } : item)) },
      };
    });
  };

  const issueCertificate = (gymnastName: string, level: number, note: string) => {
    setCertificates((prev) => [{ id: 'cert_' + Date.now(), gymnastName, level, note, issuedAt: new Date().toISOString() }, ...prev]);
  };

  const openSkill = (skillId: string) => {
    setPendingSkillId(skillId || null);
    if (skillId) setTab('skills');
  };

  const updateSkillTutorial = (skillId: string, tutorial: YouTubeTutorial) => {
    setSkillBase((prev) => prev.map((skill) => (skill.id === skillId ? { ...skill, tutorial, tutorialStatus: 'FOUND' } : skill)));
  };

  // ---- Workouts ----
  const completeWorkout = (workoutId: string) => {
    const workout = workouts.find((item) => item.id === workoutId);
    if (!workout) return;
    setWorkouts((prev) => prev.map((item) => (item.id === workoutId ? { ...item, completedToday: true } : item)));
    awardXp(workout.xpReward, `Completed ${workout.title}!`);
  };

  // ---- Events ----
  const toggleEventCalendar = (eventId: string) => {
    setEvents((prev) =>
      prev.map((event) => {
        if (event.id !== eventId) return event;
        const next = !event.isAddedToCalendar;
        if (next) awardXp(20, `Added ${event.name} to your competition calendar!`);
        return { ...event, isAddedToCalendar: next };
      }),
    );
  };

  const downloadEventIcs = (event: EventItem) => {
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//GymTrack//Gymnastics Events//EN',
      'BEGIN:VEVENT',
      `SUMMARY:${event.name}`,
      `DESCRIPTION:${event.shortDescription}\\nVenue: ${event.venue}\\nDiscipline: ${event.discipline}`,
      `LOCATION:${event.venue}, ${event.city}, ${event.country}`,
      `DTSTART;VALUE=DATE:${event.startDate.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${event.endDate.replace(/-/g, '')}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `${event.name.replace(/[^a-zA-Z0-9]/g, '_')}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    awardXp(15, `Downloaded calendar invite for ${event.name}!`);
  };

  // ---- Shop ----
  const addToCart = (product: Product, quantity = 1, selectedSize?: string, selectedColor?: string) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id && item.selectedSize === selectedSize && item.selectedColor === selectedColor);
      if (existing) return prev.map((item) => (item === existing ? { ...item, quantity: item.quantity + quantity } : item));
      return [...prev, { product, quantity, selectedSize, selectedColor }];
    });
    awardXp(10, `Added ${product.name} to Pro Shop bag!`);
  };
  const removeFromCart = (productId: string) => setCart((prev) => prev.filter((item) => item.product.id !== productId));
  const updateCartQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart((prev) => prev.map((item) => (item.product.id === productId ? { ...item, quantity } : item)));
  };
  const clearCart = () => setCart([]);

  // ---- Community (the older local feed) ----
  const addCommunityPost = (title: string, description: string, apparatus: ApparatusCategory, videoFileName?: string) => {
    const post: CommunityPost = {
      id: 'post_' + Date.now(),
      authorName: user.fullName,
      authorLevel: user.level,
      authorClub: user.clubName,
      authorAvatar: user.avatar,
      title,
      description,
      apparatus,
      videoUrl: videoFileName
        ? 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
        : 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=800&q=80',
      date: 'Just now',
      reactions: { heart: 1, star: 0, clap: 1, fire: 0 },
      userReactions: { heart: true },
      comments: [],
    };
    setCommunityPosts((prev) => [post, ...prev]);
    awardXp(75, 'Shared routine update with GymTrack community!');
  };

  const reactToPost = (postId: string, reactionType: 'heart' | 'star' | 'clap' | 'fire') => {
    setCommunityPosts((prev) =>
      prev.map((post) => {
        if (post.id !== postId) return post;
        const hasReacted = post.userReactions[reactionType];
        return {
          ...post,
          reactions: { ...post.reactions, [reactionType]: Math.max(0, post.reactions[reactionType] + (hasReacted ? -1 : 1)) },
          userReactions: { ...post.userReactions, [reactionType]: !hasReacted },
        };
      }),
    );
  };

  const addCommentToPost = (postId: string, commentText: string) => {
    if (!commentText.trim()) return;
    setCommunityPosts((prev) =>
      prev.map((post) =>
        post.id === postId
          ? {
              ...post,
              comments: [
                ...post.comments,
                { id: 'cmt_' + Date.now(), author: user.fullName, avatar: user.avatar, level: user.level, text: commentText.trim(), timeAgo: 'Just now' },
              ],
            }
          : post,
      ),
    );
    awardXp(15, 'Commented on fellow gymnast routine!');
  };

  return (
    <GymContext.Provider
      value={{
        user,
        ready,
        skills,
        progress,
        workouts,
        events,
        products,
        cart,
        badges,
        communityPosts,
        currentTab,
        setCurrentTab,
        userRole,
        isStaff,
        activeXpToast,
        celebrationBadge,
        dismissCelebration,
        loginFromServer,
        logoutUser,
        refreshAccount,
        updateUserProfile,
        saveProfile,
        registeredClubs,
        clubOverview: overview,
        rosterGymnasts,
        refreshOverview,
        addCoachNote,
        addPracticeFocus,
        updatePracticeFocusStatus,
        reviewEvidenceSubmission,
        addCompetition,
        markAttendance,
        sendFeeReminder,
        publishNotice,
        addDocument,
        notices,
        competitions,
        certificates,
        issueCertificate,
        pendingSkillId,
        openSkill,
        submitSkillVideo,
        updateSkillTutorial,
        completeWorkout,
        toggleEventCalendar,
        downloadEventIcs,
        addToCart,
        removeFromCart,
        updateCartQuantity,
        clearCart,
        addCommunityPost,
        reactToPost,
        addCommentToPost,
        awardXp,
      }}
    >
      {children}
    </GymContext.Provider>
  );
};

export const useGym = () => {
  const context = useContext(GymContext);
  if (!context) throw new Error('useGym must be used within a GymProvider');
  return context;
};
