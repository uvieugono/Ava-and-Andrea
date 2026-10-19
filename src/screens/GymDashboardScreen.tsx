import React, { useState } from 'react';
import { useGym } from '../context/GymContext';
import { ClubOffice } from '../components/ClubOffice';
import { RosterGymnast, CoachNote, PracticeFocusArea } from '../types';
import { 
  Building2, 
  Users, 
  Search, 
  Filter, 
  Plus, 
  Award, 
  Trophy, 
  CheckCircle2, 
  Clock, 
  TrendingUp, 
  Eye, 
  FileText, 
  AlertCircle, 
  Check, 
  X, 
  Edit3, 
  Play, 
  Calendar, 
  ChevronRight, 
  BarChart3, 
  Sparkles, 
  ShieldCheck, 
  Video,
  Target,
  Zap,
  ArrowUpRight
} from 'lucide-react';

const COMPETITION_EVENTS = ['Floor', 'Vault', 'Bars', 'Beam', 'Tumbling', 'Trampoline', 'Other'];

export const GymDashboardScreen: React.FC = () => {
  const {
    user,
    rosterGymnasts,
    addCompetition,
    addCoachNote,
    addPracticeFocus,
    updatePracticeFocusStatus,
    reviewEvidenceSubmission,
    userRole,
  } = useGym();

  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<number | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING_REVIEW' | 'NEEDING_PRACTICE'>('ALL');

  // Active Gymnast Profile Modal. Held by id so it always shows the latest decisions.
  const [activeGymnastId, setActiveGymnastId] = useState<string | null>(null);
  const activeGymnast = rosterGymnasts.find((item) => item.id === activeGymnastId) ?? null;
  const [activeGymnastTab, setActiveGymnastTab] = useState<'COMPETITIONS' | 'EVIDENCE' | 'PRACTICE' | 'NOTES'>('EVIDENCE');

  // Sub-modals inside Gymnast profile
  const [showAddCompetitionModal, setShowAddCompetitionModal] = useState(false);
  const [showAddNoteModal, setShowAddNoteModal] = useState(false);
  const [showAddPracticeModal, setShowAddPracticeModal] = useState(false);

  // New competition record
  const [compName, setCompName] = useState('');
  const [compDate, setCompDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [compEvents, setCompEvents] = useState<string[]>([]);
  const [compResult, setCompResult] = useState('');
  const [compComments, setCompComments] = useState('');
  const [compError, setCompError] = useState<string | null>(null);
  const [compBusy, setCompBusy] = useState(false);

  // New Note Form
  const [noteCategory, setNoteCategory] = useState<CoachNote['category']>('Form & Execution');
  const [noteText, setNoteText] = useState('');

  // New Practice Drill Form
  const [practiceApparatus, setPracticeApparatus] = useState<PracticeFocusArea['apparatus']>('VAULT');
  const [practiceTitle, setPracticeTitle] = useState('');
  const [practiceDescription, setPracticeDescription] = useState('');
  const [practicePriority, setPracticePriority] = useState<PracticeFocusArea['priority']>('HIGH');

  // Skill video reviews: a comment is kept per submission
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, string>>({});
  const [reviewBusyId, setReviewBusyId] = useState<string | null>(null);
  const [reviewFeedback, setReviewFeedback] = useState<{ id: string; ok: boolean; message: string } | null>(null);

  const currentClubName = user.clubName || 'Your club';

  // Filter roster
  const filteredRoster = rosterGymnasts.filter((gymnast) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const match = gymnast.name.toLowerCase().includes(q) || gymnast.clubName.toLowerCase().includes(q);
      if (!match) return false;
    }

    if (levelFilter !== 'ALL' && gymnast.level !== levelFilter) {
      return false;
    }

    if (statusFilter === 'PENDING_REVIEW') {
      const hasPending = gymnast.evidenceSubmissions.some((s) => s.status === 'AWAITING_REVIEW');
      if (!hasPending) return false;
    }

    if (statusFilter === 'NEEDING_PRACTICE') {
      const hasPractice = gymnast.practiceAreas.some((p) => p.status === 'IN_PROGRESS');
      if (!hasPractice) return false;
    }

    return true;
  });

  // Overview statistics
  const totalGymnasts = rosterGymnasts.length;
  const pendingSubmissionsCount = rosterGymnasts.reduce(
    (acc, g) => acc + g.evidenceSubmissions.filter((s) => s.status === 'AWAITING_REVIEW').length,
    0,
  );
  const activePracticeCount = rosterGymnasts.reduce(
    (acc, g) => acc + g.practiceAreas.filter((p) => p.status === 'IN_PROGRESS').length,
    0,
  );
  const competitionsCount = rosterGymnasts.reduce((acc, g) => acc + (g.competitions?.length ?? 0), 0);

  const toggleCompEvent = (name: string) => {
    setCompEvents((prev) => (prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]));
  };

  // Save a competition record to the gymnast's profile
  const handleSaveCompetition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGymnast) return;
    if (!compName.trim()) {
      setCompError('Enter the name of the competition or event.');
      return;
    }
    if (!compDate) {
      setCompError('Enter the date of the competition.');
      return;
    }
    setCompBusy(true);
    setCompError(null);
    const result = await addCompetition({
      gymnastId: activeGymnast.id,
      name: compName.trim(),
      date: compDate,
      events: compEvents,
      result: compResult.trim(),
      comments: compComments.trim(),
    });
    setCompBusy(false);
    if (!result.ok) {
      setCompError(result.message);
      return;
    }
    setShowAddCompetitionModal(false);
    setCompName('');
    setCompEvents([]);
    setCompResult('');
    setCompComments('');
  };

  // Handle Save Coach Note
  const handleSaveNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGymnast || !noteText.trim()) return;

    addCoachNote(activeGymnast.id, {
      coachName: user.fullName || 'Head Coach',
      category: noteCategory,
      text: noteText.trim(),
    });

    setShowAddNoteModal(false);
    setNoteText('');
  };

  // Handle Save Practice Focus
  const handleSavePractice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGymnast || !practiceTitle.trim()) return;

    addPracticeFocus(activeGymnast.id, {
      apparatus: practiceApparatus,
      title: practiceTitle.trim(),
      description: practiceDescription.trim() || 'Focus on routine precision and landing freeze.',
      priority: practicePriority,
      status: 'IN_PROGRESS',
    });

    setShowAddPracticeModal(false);
    setPracticeTitle('');
    setPracticeDescription('');
  };

  // Approve or reject a skill video. A comment is required for both.
  const handleReviewEvidence = async (submissionId: string, status: 'APPROVED' | 'NEEDS_WORK') => {
    if (!activeGymnast) return;
    const comment = (reviewDrafts[submissionId] ?? '').trim();
    if (!comment) {
      setReviewFeedback({ id: submissionId, ok: false, message: 'Add a comment explaining your decision before you approve or reject.' });
      return;
    }
    setReviewBusyId(submissionId);
    setReviewFeedback(null);
    const result = await reviewEvidenceSubmission(activeGymnast.id, submissionId, status, comment);
    setReviewBusyId(null);
    setReviewFeedback({ id: submissionId, ok: result.ok, message: result.message });
    if (result.ok) setReviewDrafts((prev) => ({ ...prev, [submissionId]: '' }));
  };

  const renderSubmission = (sub: RosterGymnast['evidenceSubmissions'][number]) => {
    const isAwaiting = sub.status === 'AWAITING_REVIEW';
    const isApproved = sub.status === 'APPROVED';
    const note = reviewFeedback && reviewFeedback.id === sub.id ? reviewFeedback : null;
    return (
      <div
        key={sub.id}
        className={`p-4 rounded-2xl border space-y-3 ${isAwaiting ? 'bg-amber-50/30 border-amber-200' : 'bg-white border-[#E4D7EE]'}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <h5 className="text-sm font-black text-[#241628]">{sub.skillName}</h5>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
              isApproved
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : isAwaiting
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
          >
            {isApproved ? 'Approved' : isAwaiting ? 'Pending approval' : 'Rejected'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#5C4A68]">
          <Video className="w-3.5 h-3.5 text-[#5C2A6E]" />
          <span className="font-mono text-[11px] truncate max-w-xs">{sub.videoName}</span>
          <span>· Submitted {sub.submittedDate}</span>
        </div>
        {sub.videoPreviewUrl && (
          <video src={sub.videoPreviewUrl} controls preload="metadata" className="w-full max-h-72 rounded-xl bg-black" />
        )}

        {isAwaiting ? (
          <div className="p-3.5 rounded-2xl bg-white border-2 border-[#5C2A6E] space-y-3">
            <label className="text-xs font-bold text-[#241628] block" htmlFor={`review-${sub.id}`}>
              Your comment (required). Say why, and what the gymnast can improve:
            </label>
            <textarea
              id={`review-${sub.id}`}
              rows={2}
              value={reviewDrafts[sub.id] ?? ''}
              onChange={(e) => setReviewDrafts((prev) => ({ ...prev, [sub.id]: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-[#E4D7EE] text-xs font-medium focus:ring-2 focus:ring-[#5C2A6E] focus:outline-none"
            />
            {note && <p className={`text-xs ${note.ok ? 'text-emerald-800' : 'text-red-600'}`} role={note.ok ? 'status' : 'alert'}>{note.message}</p>}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={reviewBusyId === sub.id}
                onClick={() => handleReviewEvidence(sub.id, 'NEEDS_WORK')}
                className="py-1.5 px-3.5 rounded-full bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold hover:bg-rose-100 disabled:opacity-60"
              >
                Reject
              </button>
              <button
                type="button"
                disabled={reviewBusyId === sub.id}
                onClick={() => handleReviewEvidence(sub.id, 'APPROVED')}
                className="py-1.5 px-4 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-xs flex items-center gap-1 disabled:opacity-60"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Approve</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="p-2.5 rounded-xl bg-[#F4EEF8] border border-[#E4D7EE] text-xs text-[#3E1B4A] space-y-0.5">
            <p><strong>{isApproved ? 'Approved' : 'Rejected'}{sub.reviewedBy ? ` by ${sub.reviewedBy}` : ''}:</strong> {sub.coachFeedback || 'No comment left.'}</p>
            {note && <p className={note.ok ? 'text-emerald-800' : 'text-red-600'}>{note.message}</p>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col w-full max-w-5xl mx-auto px-4 sm:px-6 space-y-6 pt-2 pb-16">
      <ClubOffice />
      {/* 1. CLUB & COACH DASHBOARD HEADER */}
      <section className="bg-white rounded-3xl p-6 sm:p-7 border border-[#E4D7EE] shadow-xs relative overflow-hidden space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#5C2A6E] to-[#3E1B4A] text-white flex items-center justify-center shadow-md shrink-0">
              <Building2 className="w-7 h-7" />
            </div>

            <div>
              <h1 className="text-xl sm:text-2xl font-black text-[#241628] tracking-tight">
                Club &amp; Gymnast Profile
              </h1>
              <p className="text-sm text-[#5C4A68]">{currentClubName}</p>
            </div>
          </div>

          {userRole === 'CLUB_ADMIN' && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                id="btn-open-add-gymnast"
                onClick={() => document.getElementById('add-student-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                className="py-2.5 px-4 rounded-full bg-gradient-to-r from-[#5C2A6E] to-[#3E1B4A] hover:opacity-95 text-white text-xs font-black shadow-md shadow-[#5C2A6E]/25 flex items-center gap-1.5 active:scale-98 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Add Gymnast</span>
              </button>
            </div>
          )}
        </div>

        {/* 4 Overview Statistics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-3.5 rounded-2xl bg-[#F4EEF8] border border-[#E4D7EE] flex flex-col justify-between">
            <span className="text-[10px] font-black uppercase text-[#3E1B4A] tracking-wider">
              Club Roster
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-black text-[#241628]">{totalGymnasts}</span>
              <span className="text-xs text-[#5C4A68]">Athletes</span>
            </div>
            <span className="text-[10px] text-[#5C4A68] mt-0.5">Added by you or chose your club</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#F4EEF8] border border-[#E4D7EE] flex flex-col justify-between">
            <span className="text-[10px] font-black uppercase text-[#3E1B4A] tracking-wider">
              Evidence Reviews
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-black text-[#3E1B4A]">{pendingSubmissionsCount}</span>
              <span className="text-xs text-[#3E1B4A]">Pending</span>
            </div>
            <span className="text-[10px] text-[#3E1B4A]">Videos to verify</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#f0fdf4] border border-emerald-200 flex flex-col justify-between">
            <span className="text-[10px] font-black uppercase text-emerald-800 tracking-wider">
              Practice Drills
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-black text-emerald-700">{activePracticeCount}</span>
              <span className="text-xs text-emerald-700">Active</span>
            </div>
            <span className="text-[10px] text-emerald-700">Areas under practice</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#F4EEF8] border border-[#E4D7EE] flex flex-col justify-between">
            <span className="text-[10px] font-black uppercase text-[#3E1B4A] tracking-wider">
              Competitions
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-black text-[#3E1B4A]">{competitionsCount}</span>
              <span className="text-xs text-[#5C4A68]">Recorded</span>
            </div>
            <span className="text-[10px] text-[#5C4A68]">Across your gymnasts</span>
          </div>
        </div>
      </section>

      {/* 2. ROSTER SEARCH & LEVEL FILTERS */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              id="input-roster-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search gymnast by name or level..."
              className="w-full pl-10 pr-9 py-2.5 rounded-2xl bg-white border border-[#E4D7EE] text-xs font-semibold focus:ring-2 focus:ring-[#5C2A6E] focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Quick Filter: Pending Reviews vs Needing Practice */}
          <div className="flex p-1 bg-[#F4EEF8] rounded-2xl border border-[#E4D7EE] text-xs font-bold shrink-0">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`py-2 px-3 rounded-xl transition-all ${
                statusFilter === 'ALL'
                  ? 'bg-white text-[#3E1B4A] shadow-xs font-black'
                  : 'text-[#5C4A68] hover:text-[#241628]'
              }`}
            >
              All Athletes ({rosterGymnasts.length})
            </button>
            <button
              onClick={() => setStatusFilter('PENDING_REVIEW')}
              className={`py-2 px-3 rounded-xl transition-all flex items-center gap-1 ${
                statusFilter === 'PENDING_REVIEW'
                  ? 'bg-white text-[#3E1B4A] shadow-xs font-black'
                  : 'text-[#5C4A68] hover:text-[#241628]'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              <span>Pending Reviews ({pendingSubmissionsCount})</span>
            </button>
          </div>
        </div>

        {/* Level Filter Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
          <span className="text-[11px] font-bold text-[#5C4A68] shrink-0 mr-1">USAG Level:</span>
          {(['ALL', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const).map((lvl) => (
            <button
              key={lvl}
              onClick={() => setLevelFilter(lvl)}
              className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all shrink-0 ${
                levelFilter === lvl
                  ? 'bg-[#5C2A6E] text-white shadow-xs font-extrabold'
                  : 'bg-white text-[#5C4A68] border border-[#E4D7EE] hover:bg-[#F4EEF8]'
              }`}
            >
              {lvl === 'ALL' ? 'All Levels' : `Level ${lvl}`}
            </button>
          ))}
        </div>
      </div>

      {/* 3. ROSTER GYMNAST CARDS GRID */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-[#241628] tracking-tight">
            Gymnast Roster & Athlete Profiles ({filteredRoster.length})
          </h2>
          <span className="text-xs text-[#5C4A68]">
            Tap any gymnast to review skill videos and competitions
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRoster.map((gymnast) => {
            const pendingForGymnast = gymnast.evidenceSubmissions.filter((s) => s.status === 'AWAITING_REVIEW').length;
            const completionPct = gymnast.totalSkillsCount > 0 ? Math.round((gymnast.completedSkillsCount / gymnast.totalSkillsCount) * 100) : 0;

            return (
              <article
                key={gymnast.id}
                id={`card-roster-gymnast-${gymnast.id}`}
                className="bg-white rounded-3xl border border-[#E4D7EE] shadow-xs p-5 hover:border-[#B58BD0] transition-all flex flex-col justify-between space-y-4 hover:shadow-md group"
              >
                <div>
                  {/* Gymnast Profile Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="relative shrink-0">
                        <img
                          src={gymnast.avatar}
                          alt={gymnast.name}
                          className="w-14 h-14 rounded-full object-cover ring-2 ring-[#5C2A6E]/30 border-2 border-white shadow-2xs"
                        />
                        <span className="absolute -bottom-1 -right-1 px-2 py-0.2 bg-[#5C2A6E] text-white text-[10px] font-black rounded-full border border-white">
                          L{gymnast.level}
                        </span>
                      </div>

                      <div>
                        <h3 className="text-base font-black text-[#241628] group-hover:text-[#3E1B4A] transition-colors">
                          {gymnast.name}
                        </h3>
                        <p className="text-xs text-[#5C4A68]">
                          {gymnast.age > 0 ? `Age ${gymnast.age} • ` : ''}USAG Level {gymnast.level}
                        </p>
                        <span className="text-[10px] text-[#3E1B4A] font-semibold block mt-0.5">
                          {gymnast.isMember === false ? 'Chose this club' : gymnast.eventsFocus.join(' • ')}
                        </span>
                      </div>
                    </div>

                    {pendingForGymnast > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-300 text-amber-800 text-[10px] font-black flex items-center gap-1 animate-pulse shrink-0">
                        <Clock className="w-3 h-3 text-amber-600" />
                        <span>{pendingForGymnast} Video</span>
                      </span>
                    )}
                  </div>

                  {/* Skills Completion Progress */}
                  <div className="mt-3.5 space-y-1">
                    <div className="flex justify-between text-[11px] font-bold">
                      <span className="text-[#5C4A68]">Curriculum Skills</span>
                      <span className="text-[#3E1B4A]">{gymnast.hasRequirements === false ? 'No standard requirements' : `${gymnast.completedSkillsCount} / ${gymnast.totalSkillsCount} (${completionPct}%)`}</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-[#F4EEF8] border border-[#E4D7EE] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#5C2A6E] to-[#7A4390] transition-all"
                        style={{ width: `${completionPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="mt-3 p-2.5 rounded-2xl bg-[#F4EEF8] border border-[#E4D7EE] grid grid-cols-3 gap-1 text-center text-[10px]">
                    <div>
                      <span className="text-[#3E1B4A] font-bold block">Level</span>
                      <span className="font-black text-[#241628]">{gymnast.level}</span>
                    </div>
                    <div>
                      <span className="text-[#3E1B4A] font-bold block">Pending</span>
                      <span className="font-black text-[#241628]">{pendingForGymnast}</span>
                    </div>
                    <div>
                      <span className="text-[#3E1B4A] font-bold block">Competitions</span>
                      <span className="font-black text-[#241628]">{gymnast.competitions?.length ?? 0}</span>
                    </div>
                  </div>
                </div>

                {/* Open Gymnast Details Action */}
                <button
                  id={`btn-manage-gymnast-${gymnast.id}`}
                  onClick={() => {
                    setActiveGymnastId(gymnast.id);
                    setActiveGymnastTab('EVIDENCE');
                  }}
                  className="w-full py-2.5 px-3 rounded-full bg-[#F4EEF8] hover:bg-[#E4D7EE] border border-[#E4D7EE] text-[#3E1B4A] text-xs font-black transition-all flex items-center justify-center gap-1.5 active:scale-98"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>View Profile &amp; Videos</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </article>
            );
          })}
        </div>
        {filteredRoster.length === 0 && (
          <p className="text-sm text-[#5C4A68] bg-white border border-[#E4D7EE] rounded-2xl p-5">
            {rosterGymnasts.length === 0
              ? 'No gymnasts yet. Add a student above, or gymnasts who choose your club in their profile will appear here.'
              : 'No gymnasts match these filters.'}
          </p>
        )}
      </section>

      {/* 4. GYMNAST DETAILED PROFILE & PERFORMANCE MODAL */}
      {activeGymnast && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#241628]/70 backdrop-blur-xs p-3 sm:p-4">
          <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-[#E4D7EE] max-h-[94vh] overflow-y-auto flex flex-col justify-between animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header: Gymnast summary */}
            <div className="p-5 sm:p-6 bg-gradient-to-r from-[#F4EEF8] via-[#F4EEF8] to-white border-b border-[#E4D7EE] rounded-t-3xl">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <img
                    src={activeGymnast.avatar}
                    alt={activeGymnast.name}
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover ring-4 ring-[#5C2A6E]/30 border-2 border-white shadow-md shrink-0"
                  />
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xl sm:text-2xl font-black text-[#241628]">
                        {activeGymnast.name}
                      </h3>
                      <span className="px-3 py-0.5 rounded-full bg-[#5C2A6E] text-white text-xs font-black">
                        USAG Level {activeGymnast.level}
                      </span>
                    </div>
                    <p className="text-xs text-[#5C4A68] mt-0.5">
                      {activeGymnast.clubName} • Age {activeGymnast.age} • Events: {activeGymnast.eventsFocus.join(', ')}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setActiveGymnastId(null)}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-white/80"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Summary banner */}
              <div className="mt-4 p-3 rounded-2xl bg-white border border-[#E4D7EE] shadow-2xs grid grid-cols-4 gap-2 text-center text-xs">
                <div className="p-1.5 rounded-xl bg-[#F4EEF8]">
                  <span className="text-[10px] font-black text-[#5C4A68] block">Level</span>
                  <span className="text-sm font-black text-[#241628]">{activeGymnast.level}</span>
                </div>
                <div className="p-1.5 rounded-xl bg-[#F4EEF8]">
                  <span className="text-[10px] font-black text-[#5C4A68] block">Skills approved</span>
                  <span className="text-sm font-black text-[#241628]">
                    {activeGymnast.hasRequirements === false ? 'n/a' : `${activeGymnast.completedSkillsCount} / ${activeGymnast.totalSkillsCount}`}
                  </span>
                </div>
                <div className="p-1.5 rounded-xl bg-[#F4EEF8] border border-[#E4D7EE]">
                  <span className="text-[10px] font-black text-[#3E1B4A] block">Pending</span>
                  <span className="text-sm font-black text-[#3E1B4A]">{activeGymnast.pendingCount ?? 0}</span>
                </div>
                <div className="p-1.5 rounded-xl bg-[#F4EEF8]">
                  <span className="text-[10px] font-black text-[#5C4A68] block">Telephone</span>
                  <span className="text-xs font-black text-[#241628] break-all">{activeGymnast.phone || 'None'}</span>
                </div>
              </div>

              {/* Tab Navigation inside modal */}
              <div className="flex p-1 bg-white/80 rounded-2xl border border-[#E4D7EE] mt-4 overflow-x-auto no-scrollbar gap-1 text-xs font-bold">
                <button
                  onClick={() => setActiveGymnastTab('EVIDENCE')}
                  className={`py-2 px-3 rounded-xl transition-all shrink-0 flex items-center gap-1 ${
                    activeGymnastTab === 'EVIDENCE' ? 'bg-[#5C2A6E] text-white shadow-xs font-black' : 'text-[#5C4A68] hover:text-[#241628]'
                  }`}
                >
                  <Video className="w-3.5 h-3.5" />
                  <span>Video Reviews ({activeGymnast.evidenceSubmissions.length})</span>
                </button>
                <button
                  onClick={() => setActiveGymnastTab('COMPETITIONS')}
                  className={`py-2 px-3 rounded-xl transition-all shrink-0 ${
                    activeGymnastTab === 'COMPETITIONS' ? 'bg-[#5C2A6E] text-white shadow-xs font-black' : 'text-[#5C4A68] hover:text-[#241628]'
                  }`}
                >
                  Competitions ({activeGymnast.competitions?.length ?? 0})
                </button>
                <button
                  onClick={() => setActiveGymnastTab('PRACTICE')}
                  className={`py-2 px-3 rounded-xl transition-all shrink-0 ${
                    activeGymnastTab === 'PRACTICE' ? 'bg-[#5C2A6E] text-white shadow-xs font-black' : 'text-[#5C4A68] hover:text-[#241628]'
                  }`}
                >
                  Areas for Practice ({activeGymnast.practiceAreas.length})
                </button>
                <button
                  onClick={() => setActiveGymnastTab('NOTES')}
                  className={`py-2 px-3 rounded-xl transition-all shrink-0 ${
                    activeGymnastTab === 'NOTES' ? 'bg-[#5C2A6E] text-white shadow-xs font-black' : 'text-[#5C4A68] hover:text-[#241628]'
                  }`}
                >
                  Coach Notes ({activeGymnast.coachNotes.length})
                </button>
              </div>
            </div>

            {/* Modal Body: Active Tab Content */}
            <div className="p-5 sm:p-6 space-y-4 flex-1">
              {/* COMPETITION RECORDS */}
              {activeGymnastTab === 'COMPETITIONS' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-base font-black text-[#241628]">Competition history</h4>
                      <p className="text-xs text-[#5C4A68]">Events {activeGymnast.name} has competed in. This also shows on their own profile.</p>
                    </div>
                    <button
                      id="btn-add-comp-score"
                      onClick={() => { setCompError(null); setShowAddCompetitionModal(true); }}
                      className="py-2 px-3.5 rounded-full bg-[#F4EEF8] hover:bg-[#E4D7EE] border border-[#E4D7EE] text-[#3E1B4A] text-xs font-black shadow-xs flex items-center gap-1.5 transition-all shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Record competition</span>
                    </button>
                  </div>

                  {(activeGymnast.competitions ?? []).length === 0 ? (
                    <div className="p-6 text-center bg-[#F4EEF8] rounded-2xl border border-[#E4D7EE] text-xs text-[#5C4A68]">
                      No competitions recorded yet. Tap "Record competition" to add one.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(activeGymnast.competitions ?? []).map((comp) => (
                        <div key={comp.id} className="p-4 rounded-2xl bg-white border border-[#E4D7EE] shadow-xs space-y-1.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h5 className="text-sm font-black text-[#241628]">{comp.name}</h5>
                            <span className="text-[11px] text-[#5C4A68]">{comp.date}</span>
                          </div>
                          {comp.events.length > 0 && <p className="text-xs text-[#5C4A68]">Events: {comp.events.join(', ')}</p>}
                          {comp.result && <p className="text-xs text-[#241628]"><strong>Result:</strong> {comp.result}</p>}
                          {comp.comments && <p className="text-[11px] text-[#5C4A68] italic">{comp.comments}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* SKILL VIDEO APPROVALS */}
              {activeGymnastTab === 'EVIDENCE' && (
                <div className="space-y-5">
                  <div>
                    <h4 className="text-base font-black text-[#241628]">Skill video approvals</h4>
                    <p className="text-xs text-[#5C4A68]">
                      Watch each video, then approve it or reject it. A comment is needed either way. When every required skill is approved the gymnast moves up a level on their own.
                    </p>
                  </div>

                  {activeGymnast.evidenceSubmissions.length === 0 && (
                    <div className="p-6 text-center bg-[#F4EEF8] rounded-2xl border border-[#E4D7EE] text-xs text-[#5C4A68]">
                      No skill videos have been submitted by this gymnast yet.
                    </div>
                  )}

                  {activeGymnast.evidenceSubmissions.some((item) => item.status === 'AWAITING_REVIEW') && (
                    <section className="space-y-3" aria-label="Pending skill approvals">
                      <h5 className="text-sm font-black text-amber-800 flex items-center gap-1.5">
                        <Clock className="w-4 h-4" />
                        Pending skill approvals ({activeGymnast.evidenceSubmissions.filter((item) => item.status === 'AWAITING_REVIEW').length})
                      </h5>
                      {activeGymnast.evidenceSubmissions.filter((item) => item.status === 'AWAITING_REVIEW').map(renderSubmission)}
                    </section>
                  )}

                  {activeGymnast.evidenceSubmissions.some((item) => item.status !== 'AWAITING_REVIEW') && (
                    <section className="space-y-3" aria-label="Reviewed skills">
                      <h5 className="text-sm font-black text-[#241628]">Reviewed</h5>
                      {activeGymnast.evidenceSubmissions.filter((item) => item.status !== 'AWAITING_REVIEW').map(renderSubmission)}
                    </section>
                  )}
                </div>
              )}

              {/* TAB 4: AREAS NEEDING PRACTICE & ASSIGNED DRILLS */}
              {activeGymnastTab === 'PRACTICE' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-base font-black text-[#241628]">
                        Identified Practice Areas & Custom Drills
                      </h4>
                      <p className="text-xs text-[#5C4A68]">
                        Assign apparatus drills to fix execution deductions before the next meet. Kept on this device.
                      </p>
                    </div>

                    <button
                      id="btn-assign-practice-drill"
                      onClick={() => setShowAddPracticeModal(true)}
                      className="py-2 px-3.5 rounded-full bg-[#F4EEF8] hover:bg-[#E4D7EE] border border-[#E4D7EE] text-[#3E1B4A] text-xs font-black shadow-xs flex items-center gap-1.5 transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Assign Practice Drill</span>
                    </button>
                  </div>

                  {activeGymnast.practiceAreas.length === 0 ? (
                    <div className="p-6 text-center bg-[#F4EEF8] rounded-2xl border border-[#E4D7EE] text-xs text-[#5C4A68]">
                      No active practice drills assigned. Tap above to assign a targeted drill.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {activeGymnast.practiceAreas.map((focus) => (
                        <div
                          key={focus.id}
                          className="p-3.5 rounded-2xl bg-white border border-[#E4D7EE] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.2 rounded-md bg-[#F4EEF8] text-[#3E1B4A] font-black text-[10px] uppercase">
                                {focus.apparatus}
                              </span>
                              <h5 className="text-xs font-black text-[#241628]">
                                {focus.title}
                              </h5>
                              <span
                                className={`px-2 py-0.2 rounded-full text-[9px] font-black uppercase ${
                                  focus.priority === 'HIGH'
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                                }`}
                              >
                                {focus.priority} Priority
                              </span>
                            </div>
                            <p className="text-xs text-[#5C4A68] leading-relaxed">
                              {focus.description}
                            </p>
                          </div>

                          {/* Status toggle buttons */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {(['IN_PROGRESS', 'IMPROVED', 'MASTERED'] as const).map((st) => (
                              <button
                                key={st}
                                onClick={() => updatePracticeFocusStatus(activeGymnast.id, focus.id, st)}
                                className={`py-1 px-2.5 rounded-lg text-[10px] font-bold transition-all border ${
                                  focus.status === st
                                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                                }`}
                              >
                                {st === 'IN_PROGRESS' ? 'In Progress' : st === 'IMPROVED' ? 'Improved' : 'Mastered ✓'}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: COACH COMMENTS & PERFORMANCE NOTES */}
              {activeGymnastTab === 'NOTES' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-base font-black text-[#241628]">
                        Coach Performance Critique & Notes
                      </h4>
                      <p className="text-xs text-[#5C4A68]">
                        Log private training notes on execution, artistry, and readiness. Kept on this device.
                      </p>
                    </div>

                    <button
                      id="btn-add-coach-note"
                      onClick={() => setShowAddNoteModal(true)}
                      className="py-2 px-3.5 rounded-full bg-[#F4EEF8] hover:bg-[#E4D7EE] border border-[#E4D7EE] text-[#3E1B4A] text-xs font-black shadow-xs flex items-center gap-1.5 transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Performance Note</span>
                    </button>
                  </div>

                  {activeGymnast.coachNotes.length === 0 ? (
                    <div className="p-6 text-center bg-[#F4EEF8] rounded-2xl border border-[#E4D7EE] text-xs text-[#5C4A68]">
                      No coach notes logged yet.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {activeGymnast.coachNotes.map((note) => (
                        <div
                          key={note.id}
                          className="p-3.5 rounded-2xl bg-[#F4EEF8] border border-[#E4D7EE] space-y-1.5 shadow-2xs"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-[#241628]">{note.coachName}</span>
                              <span className="px-2 py-0.2 rounded-md bg-white border border-[#E4D7EE] text-[10px] font-bold text-[#3E1B4A]">
                                {note.category}
                              </span>
                            </div>
                            <span className="text-[10px] text-[#5C4A68]">{note.date}</span>
                          </div>
                          <p className="text-xs text-[#241628] leading-relaxed">
                            "{note.text}"
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-[#E4D7EE] flex items-center justify-between bg-[#F4EEF8] rounded-b-3xl">
              <span className="text-xs text-[#5C4A68]">
                Roster Record ID: <strong className="font-mono">{activeGymnast.id}</strong>
              </span>

              <button
                onClick={() => setActiveGymnastId(null)}
                className="py-2 px-5 rounded-full bg-[#241628] text-white text-xs font-bold hover:bg-[#3E1B4A]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL: RECORD A COMPETITION */}
      {showAddCompetitionModal && activeGymnast && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-[#241628]/65 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-[#E4D7EE] space-y-4 animate-in fade-in max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#E4D7EE] pb-3">
              <div>
                <h4 className="text-base font-black text-[#241628]">Record competition</h4>
                <p className="text-xs text-[#5C4A68]">For {activeGymnast.name}</p>
              </div>
              <button onClick={() => setShowAddCompetitionModal(false)} className="text-gray-400 hover:text-gray-600" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCompetition} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-[#241628] block mb-1" htmlFor="comp-name">Competition or event name *</label>
                <input
                  id="comp-name"
                  type="text"
                  value={compName}
                  onChange={(e) => setCompName(e.target.value)}
                  placeholder="e.g. GymFest 3.0"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E4D7EE] text-xs font-semibold focus:ring-2 focus:ring-[#5C2A6E] focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#241628] block mb-1" htmlFor="comp-date">Date *</label>
                <input
                  id="comp-date"
                  type="date"
                  value={compDate}
                  onChange={(e) => setCompDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E4D7EE] text-xs font-semibold focus:ring-2 focus:ring-[#5C2A6E] focus:outline-none"
                />
              </div>
              <fieldset>
                <legend className="text-xs font-bold text-[#241628] mb-1">Events or disciplines entered</legend>
                <div className="flex flex-wrap gap-1.5">
                  {COMPETITION_EVENTS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      aria-pressed={compEvents.includes(item)}
                      onClick={() => toggleCompEvent(item)}
                      className={`py-1.5 px-3 rounded-full text-xs font-bold border ${compEvents.includes(item) ? 'bg-[#5C2A6E] text-white border-[#5C2A6E]' : 'bg-white text-[#5C4A68] border-[#E4D7EE]'}`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div>
                <label className="text-xs font-bold text-[#241628] block mb-1" htmlFor="comp-result">Result, ranking, award or score</label>
                <textarea
                  id="comp-result"
                  rows={2}
                  value={compResult}
                  onChange={(e) => setCompResult(e.target.value)}
                  placeholder="e.g. 2nd place all-around, silver on beam"
                  className="w-full px-3 py-2 rounded-xl border border-[#E4D7EE] text-xs font-medium focus:ring-2 focus:ring-[#5C2A6E] focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#241628] block mb-1" htmlFor="comp-comments">Comments</label>
                <textarea
                  id="comp-comments"
                  rows={2}
                  value={compComments}
                  onChange={(e) => setCompComments(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E4D7EE] text-xs font-medium focus:ring-2 focus:ring-[#5C2A6E] focus:outline-none"
                />
              </div>
              {compError && <p className="text-xs text-red-600" role="alert">{compError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowAddCompetitionModal(false)} className="py-2.5 px-4 rounded-full text-xs font-bold text-[#5C4A68]">Cancel</button>
                <button
                  type="submit"
                  disabled={compBusy}
                  className="py-2.5 px-5 rounded-full bg-[#5C2A6E] hover:bg-[#3E1B4A] text-white text-xs font-black shadow-md shadow-[#5C2A6E]/25 disabled:opacity-60"
                >
                  {compBusy ? 'Saving…' : 'Save competition'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. MODAL: ASSIGN PRACTICE DRILL */}
      {showAddPracticeModal && activeGymnast && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-[#241628]/65 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-[#E4D7EE] space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-[#E4D7EE] pb-3">
              <div>
                <h4 className="text-base font-black text-[#241628]">Assign Practice Drill</h4>
                <p className="text-xs text-[#5C4A68]">Targeted correction for {activeGymnast.name}</p>
              </div>
              <button onClick={() => setShowAddPracticeModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePractice} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-[#241628] block mb-1">Target Apparatus</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['VAULT', 'BARS', 'BEAM', 'FLOOR'] as const).map((app) => (
                    <button
                      key={app}
                      type="button"
                      onClick={() => setPracticeApparatus(app)}
                      className={`py-2 rounded-xl text-xs font-bold transition-all border ${
                        practiceApparatus === app
                          ? 'bg-[#5C2A6E] text-white border-[#5C2A6E] shadow-xs'
                          : 'bg-white text-[#5C4A68] border-[#E4D7EE]'
                      }`}
                    >
                      {app}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[#241628] block mb-1">Drill / Focus Title *</label>
                <input
                  type="text"
                  required
                  value={practiceTitle}
                  onChange={(e) => setPracticeTitle(e.target.value)}
                  placeholder="e.g. Uneven Bars Cast to Handstand"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E4D7EE] text-xs font-semibold focus:ring-2 focus:ring-[#5C2A6E] focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#241628] block mb-1">Correction Instructions & Notes</label>
                <textarea
                  rows={2}
                  value={practiceDescription}
                  onChange={(e) => setPracticeDescription(e.target.value)}
                  placeholder="Keep arms locked, push toes back, freeze 2 seconds at top vertical."
                  className="w-full px-3 py-2 rounded-xl border border-[#E4D7EE] text-xs font-medium focus:ring-2 focus:ring-[#5C2A6E] focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#241628] block mb-1">Priority Level</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['HIGH', 'MEDIUM', 'REFINEMENT'] as const).map((pr) => (
                    <button
                      key={pr}
                      type="button"
                      onClick={() => setPracticePriority(pr)}
                      className={`py-2 rounded-xl text-xs font-bold transition-all border ${
                        practicePriority === pr
                          ? 'bg-[#F4EEF8] text-[#3E1B4A] border-[#E4D7EE] ring-2 ring-amber-200'
                          : 'bg-white text-[#5C4A68] border-[#E4D7EE]'
                      }`}
                    >
                      {pr}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddPracticeModal(false)}
                  className="py-2 px-4 rounded-full text-xs font-bold text-[#5C4A68]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="py-2.5 px-5 rounded-full bg-[#5C2A6E] hover:bg-[#3E1B4A] text-white text-xs font-black shadow-md shadow-[#5C2A6E]/25"
                >
                  Assign Drill
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. MODAL: ADD COACH NOTE */}
      {showAddNoteModal && activeGymnast && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-[#241628]/65 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-[#E4D7EE] space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-[#E4D7EE] pb-3">
              <div>
                <h4 className="text-base font-black text-[#241628]">Add Coach Performance Note</h4>
                <p className="text-xs text-[#5C4A68]">Feedback for {activeGymnast.name}</p>
              </div>
              <button onClick={() => setShowAddNoteModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveNote} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-[#241628] block mb-1">Category</label>
                <select
                  value={noteCategory}
                  onChange={(e) => setNoteCategory(e.target.value as CoachNote['category'])}
                  className="w-full px-3 py-2.5 rounded-xl border border-[#E4D7EE] text-xs font-bold text-[#241628] focus:outline-none focus:ring-2 focus:ring-[#5C2A6E]"
                >
                  <option value="Form & Execution">Form & Execution</option>
                  <option value="Conditioning">Conditioning & Strength</option>
                  <option value="Artistry">Artistry & Choreography</option>
                  <option value="Competition Prep">Competition Prep</option>
                  <option value="Mental Focus">Mental Focus & Poise</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-[#241628] block mb-1">Observation / Performance Note *</label>
                <textarea
                  rows={3}
                  required
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Record constructive coach critique, routine feedback, or milestone praise..."
                  className="w-full px-3 py-2 rounded-xl border border-[#E4D7EE] text-xs font-medium focus:ring-2 focus:ring-[#5C2A6E] focus:outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddNoteModal(false)}
                  className="py-2 px-4 rounded-full text-xs font-bold text-[#5C4A68]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="py-2.5 px-5 rounded-full bg-[#5C2A6E] hover:bg-[#3E1B4A] text-white text-xs font-black shadow-md shadow-[#5C2A6E]/25"
                >
                  Save Note
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
