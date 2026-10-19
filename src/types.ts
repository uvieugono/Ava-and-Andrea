export type USAGLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type ApparatusCategory = 'FLOOR' | 'VAULT' | 'BARS' | 'BEAM';

export type XcelTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND';

export type SkillStatus = 'NOT_COMPLETED' | 'IN_PROGRESS' | 'AWAITING_VERIFICATION' | 'CHANGES_REQUIRED' | 'VERIFIED';

export interface YouTubeTutorial {
  videoId: string;
  title: string;
  thumbnail: string;
  channelName: string;
  youtubeUrl: string;
  embedUrl: string;
  searchQuery?: string;
  searchedAt?: string;
}

export interface WrittenTutorial {
  steps: string[];
  keyCoachingCues: string[];
  commonFaults: string[];
  prerequisites?: string[];
  equipmentNeeded?: string[];
}

export interface Skill {
  id: string;
  name: string;
  level: USAGLevel;
  xcelTier?: XcelTier;
  category: ApparatusCategory;
  description: string;
  image?: string;
  xpReward: number;
  status: SkillStatus;
  verifiedBy?: string;
  verifiedNote?: string;
  submittedVideoName?: string;
  videoPreviewUrl?: string;
  officialRef?: string;
  difficulty?: 'A' | 'B' | 'C' | 'D' | 'E';
  // Individual YouTube Tutorial Details
  tutorial?: YouTubeTutorial | null;
  tutorialStatus?: 'FOUND' | 'NOT_FOUND' | 'SEARCHING' | 'IDLE';
  writtenTutorial?: WrittenTutorial;
  curriculumSource?: 'GYMFEST_DOC' | 'USAG_GAP';
  gymfestTier?: 'SILVER' | 'GOLD' | 'PLATINUM';
}

export interface SkillsGapReviewItem {
  id: string;
  name: string;
  tier: 'SILVER' | 'GOLD' | 'PLATINUM';
  usagEquivalent: string;
  apparatus: ApparatusCategory;
  categoryName: string;
  elementCode: string;
  difficulty: 'A' | 'B' | 'C' | 'D';
  previousAppStatus: 'CAPTURED' | 'IDENTIFIED_GAP';
  currentResolution: 'COVERED' | 'EXPANDED_WITH_VIDEO_AND_TUTORIAL';
  shortDescription: string;
  writtenTutorial: WrittenTutorial;
  videoTutorial: YouTubeTutorial;
}

export interface Workout {
  id: string;
  title: string;
  category: 'STRENGTH' | 'FLEXIBILITY';
  categoryLabel: string;
  durationMin: number;
  intensity: string;
  xpReward: number;
  image: string;
  videoUrl: string;
  description: string;
  completedToday: boolean;
  exercises: string[];
  highlights?: string[];
}

export type GymnasticsDiscipline =
  | 'Artistic Gymnastics'
  | 'Rhythmic Gymnastics'
  | 'Trampoline & Tumbling'
  | 'Acrobatic Gymnastics'
  | 'All-Around / Multi-Discipline';

export interface EventItem {
  id: string;
  name: string;
  startDate: string; // ISO date format YYYY-MM-DD for reliable date sorting
  endDate: string;
  dateDisplay: string;
  month: string; // e.g. "October 2026"
  city: string;
  country: string;
  continent: 'Europe' | 'North America' | 'Asia' | 'Africa' | 'South America' | 'Oceania';
  venue: string;
  discipline: GymnasticsDiscipline;
  shortDescription: string;
  detailedDescription: string;
  organizer: string;
  eventLevel: 'World Championship' | 'Continental Championship' | 'World Cup' | 'National Championship' | 'Youth Games' | 'Festival & Showcase';
  image: string;
  isCompleted?: boolean;
  officialWebsite?: string;
  scheduleHighlights?: string[];
  broadcastInfo?: string;
  isAddedToCalendar: boolean;
  isFeatured?: boolean;
  regionScope?: 'LOCAL_NIGERIA' | 'AFRICA' | 'INTERNATIONAL';
}

export interface Product {
  id: string;
  name: string;
  category: 'leotards' | 'grips' | 'bags' | 'mats' | 'accessories';
  categoryTag: string;
  price: number;
  originalPrice: number;
  discountBadge?: string;
  topPickBadge?: string;
  rating: number;
  reviewCount: number;
  image: string;
  subtitle: string;
  description: string;
  sizes?: string[];
  colors?: string[];
}

export interface CartItem {
  product: Product;
  quantity: number;
  selectedSize?: string;
  selectedColor?: string;
}

export interface CommunityComment {
  id: string;
  author: string;
  avatar: string;
  level: number;
  text: string;
  timeAgo: string;
}

export interface CommunityPost {
  id: string;
  authorName: string;
  authorLevel: number;
  authorClub: string;
  authorAvatar: string;
  title: string;
  description: string;
  videoUrl: string;
  apparatus: ApparatusCategory;
  date: string;
  reactions: {
    heart: number;
    star: number;
    clap: number;
    fire: number;
  };
  userReactions: {
    heart?: boolean;
    star?: boolean;
    clap?: boolean;
    fire?: boolean;
  };
  comments: CommunityComment[];
}

export interface AchievementBadge {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedDate?: string;
  accentColor: string;
  xpReward: number;
}

export type UserRole = 'GYMNAST' | 'COACH' | 'CLUB_ADMIN';

export type NavigationTab = 
  | 'home' 
  | 'skills' 
  | 'competitions' 
  | 'events' 
  | 'clubs' 
  | 'progress' 
  | 'dashboard' 
  | 'contact'
  | 'profile' 
  | 'community' 
  | 'shop';

export interface UserProfile {
  id: string;
  fullName: string;
  phoneNumber: string;
  email: string;
  level: USAGLevel;
  clubName: string;
  avatar: string;
  xp: number;
  nextLevelXpGoal: number;
  dayStreak: number;
  skillsMasteredCount: number;
  isLoggedIn: boolean;
  role?: UserRole;
  offersBars?: boolean;
  offersBeam?: boolean;
  clubId?: string | null;
  selectedClubId?: string | null;
}

export interface GymClub {
  id: string;
  name: string;
  headCoach: string;
  coachTitle: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  distanceMiles: number;
  rating: number;
  reviewCount: number;
  facilities: string[];
  programs: string[];
  openHours: string;
  image: string;
  isVerified?: boolean;
}

export interface ClubDirectoryItem {
  id: string;
  name: string;
  location: string;
  country: string;
  region: 'Nigeria' | 'Africa' | 'International';
  isVerified?: boolean;
  gymnastCount?: string;
  logo?: string;
}

export interface CompetitionResult {
  id: string;
  meetName: string;
  date: string;
  level: USAGLevel;
  vaultScore: number;
  barsScore: number;
  beamScore: number;
  floorScore: number;
  allAroundScore: number;
  place?: string;
  notes?: string;
}

export interface PersonalBestScores {
  vault: { score: number; meet: string; date: string };
  bars: { score: number; meet: string; date: string };
  beam: { score: number; meet: string; date: string };
  floor: { score: number; meet: string; date: string };
  allAround: { score: number; meet: string; date: string };
}

export interface CoachNote {
  id: string;
  coachName: string;
  date: string;
  category: 'Form & Execution' | 'Conditioning' | 'Artistry' | 'Competition Prep' | 'Mental Focus';
  text: string;
}

export interface PracticeFocusArea {
  id: string;
  apparatus: 'VAULT' | 'BARS' | 'BEAM' | 'FLOOR' | 'ALL_AROUND';
  title: string;
  description: string;
  priority: 'HIGH' | 'MEDIUM' | 'REFINEMENT';
  assignedDate: string;
  status: 'IN_PROGRESS' | 'IMPROVED' | 'MASTERED';
}

export interface RosterEvidenceSubmission {
  id: string;
  skillId?: string;
  skillName: string;
  submittedDate: string;
  videoName: string;
  videoPreviewUrl?: string;
  status: 'AWAITING_REVIEW' | 'APPROVED' | 'NEEDS_WORK';
  coachFeedback?: string;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
}

export interface AttendanceMark {
  id: string;
  gymnastId: string;
  gymnastName: string;
  date: string;
  present: boolean;
}

export interface FeeReminder {
  id: string;
  gymnastName: string;
  message: string;
  sentAt: string;
}

export interface TrainingNotice {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
}

export interface ClubDocument {
  id: string;
  name: string;
  dataUrl: string;
  uploadedAt: string;
}

export interface AchievementCertificate {
  id: string;
  gymnastName: string;
  level: number;
  note: string;
  issuedAt: string;
}

export interface RosterGymnast {
  id: string;
  name: string;
  level: USAGLevel;
  avatar: string;
  age: number;
  clubName: string;
  eventsFocus: ('VAULT' | 'BARS' | 'BEAM' | 'FLOOR')[];
  completedSkillsCount: number;
  totalSkillsCount: number;
  personalBests: PersonalBestScores;
  competitionHistory: CompetitionResult[];
  coachNotes: CoachNote[];
  practiceAreas: PracticeFocusArea[];
  evidenceSubmissions: RosterEvidenceSubmission[];
  phone?: string;
  isMember?: boolean;
  competitions?: { id: string; name: string; date: string; events: string[]; result: string; comments: string }[];
  hasRequirements?: boolean;
  pendingCount?: number;
}

export interface RegisteredClub {
  id: string;
  name: string;
  location: string;
  address: string;
  city: string;
  state: string;
  country: string;
  ownerName: string;
  adminRole: string;
  email: string;
  phone: string;
  website?: string;
  gymnastCountTier: string;
  logo: string;
  description: string;
  facilities: string[];
  programs: string[];
  yearEstablished: number;
  registrationFee: number;
  currency: string;
  isVerified: boolean;
  verificationBadge: string;
  registeredDate: string;
  paymentReference: string;
}

