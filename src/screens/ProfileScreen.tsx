import React, { useEffect, useState, useRef } from 'react';
import { useGym } from '../context/GymContext';
import { USAGLevel } from '../types';
import { AVATAR_PRESETS } from '../data/gymData';
import { gymApi, InspoPost, mediaUrl } from '../services/gymApi';
import { medalLabel } from '../components/ClubPrograms';
import { 
  Camera, 
  Edit3, 
  Check, 
  ShieldCheck, 
  Bell, 
  LogOut, 
  Award, 
  Upload, 
  CheckCircle2, 
  Sparkles,
  MapPin,
  Phone,
  Mail,
  User as UserIcon,
  X,
  Trash2,
} from 'lucide-react';

export const ProfileScreen: React.FC = () => {
  const { user, updateUserProfile, saveProfile, logoutUser, setCurrentTab, awardXp, userRole, isStaff, notices, competitions, progress, drills, certificates } = useGym();
  const [videos, setVideos] = useState<InspoPost[]>([]);
  const [videoNote, setVideoNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmVideo, setConfirmVideo] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(user.fullName);
  const [editClubId, setEditClubId] = useState(user.selectedClubId ?? '');
  const [clubs, setClubs] = useState<{ id: string; name: string; city: string }[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editPhone, setEditPhone] = useState(user.phoneNumber);
  const [editEmail, setEditEmail] = useState(user.email);
  const [selectedAvatar, setSelectedAvatar] = useState(user.avatar);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const clubLocked = Boolean(user.clubId);
  const isGymnast = userRole === 'GYMNAST';

  useEffect(() => {
    gymApi.registeredClubs().then((result) => setClubs(result.clubs)).catch(() => setClubs([]));
    gymApi.myVideos().then((result) => setVideos(result.posts)).catch(() => setVideos([]));
  }, []);

  // "Edit Profile" in the menu under the profile photo opens the form.
  useEffect(() => {
    const open = () => handleStartEdit();
    window.addEventListener('gymtrack:edit-profile', open);
    return () => window.removeEventListener('gymtrack:edit-profile', open);
  });

  const deleteVideo = async (post: InspoPost) => {
    try {
      await gymApi.deleteInspo(post.id);
      setVideos((prev) => prev.filter((item) => item.id !== post.id));
      setConfirmVideo(null);
      setVideoNote({ ok: true, text: 'Video deleted from your profile and from Connect.' });
    } catch {
      setVideoNote({ ok: false, text: 'The video could not be deleted. Try again.' });
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleCustomPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setSelectedAvatar(reader.result);
          showToast('New photo uploaded! Remember to save changes.');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleStartEdit = () => {
    setEditName(user.fullName);
    setEditClubId(user.selectedClubId ?? '');
    setEditPhone(user.phoneNumber);
    setEditEmail(user.email);
    setSelectedAvatar(user.avatar);
    setFormError(null);
    setIsEditing(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!editPhone.trim()) {
      setFormError('Enter your telephone number.');
      return;
    }
    setSaving(true);
    const result = await saveProfile({
      name: editName.trim() || user.fullName,
      phone: editPhone.trim(),
      ...(isGymnast && !clubLocked ? { selectedClubId: editClubId || null } : {}),
    });
    setSaving(false);
    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    updateUserProfile({ avatar: selectedAvatar });
    setIsEditing(false);
    awardXp(25, 'Profile updated successfully!');
    showToast('Profile successfully saved!');
  };

  return (
    <div className="flex flex-col w-full max-w-2xl mx-auto px-4 sm:px-6 space-y-6 pt-2 pb-16">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 bg-[#241628] text-[#F7F4FB] rounded-full text-xs font-bold shadow-xl animate-bounce flex items-center gap-2 border border-[#E4D7EE]/30">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Profile Header Card */}
      <section className="bg-white rounded-3xl p-6 sm:p-8 shadow-[0_8px_24px_-4px_rgba(92,42,110,0.10)] border border-[#E4D7EE] relative overflow-hidden flex flex-col items-center text-center">
        <div className="absolute -top-12 -right-12 w-40 h-40 bg-[#E4D7EE]/60 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-[#F4EEF8]/60 rounded-full blur-2xl pointer-events-none" />

        {/* Circular Avatar with Camera Quick Action */}
        <div className="relative group">
          <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden ring-4 ring-[#5C2A6E]/30 border-4 border-white shadow-lg bg-[#F4EEF8]">
            <img
              src={isEditing ? selectedAvatar : user.avatar}
              alt={user.fullName}
              className="w-full h-full object-cover transition-transform group-hover:scale-105"
            />
          </div>

          {/* USAG Level Badge */}
          <span className="absolute bottom-1 right-1 bg-gradient-to-r from-[#5C2A6E] to-[#3E1B4A] text-white text-xs font-black px-3 py-1 rounded-full shadow-md border-2 border-white flex items-center gap-1">
            <Award className="w-3.5 h-3.5 fill-current" />
            <span>Lvl {user.level}</span>
          </span>

          {/* Quick Edit Photo Trigger Button */}
          <button
            type="button"
            onClick={() => {
              if (!isEditing) handleStartEdit();
              fileInputRef.current?.click();
            }}
            className="absolute -top-1 -right-1 p-2 bg-white text-[#5C2A6E] rounded-full shadow-md border border-[#E4D7EE] hover:bg-[#F4EEF8] transition-transform active:scale-95"
            title="Change Gymnast Photo"
            aria-label="Change Gymnast Photo"
          >
            <Camera className="w-4 h-4" />
          </button>
        </div>

        <h1 className="font-display text-3xl sm:text-4xl text-[#3E1B4A] mt-4">
          {user.fullName}
        </h1>

        <div className="flex items-center gap-1.5 text-xs text-[#5C2A6E] font-bold mt-1">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span>{user.clubName || 'No club selected'}</span>
          <span className="text-[#5C4A68]">•</span>
          <span className="bg-[#F4EEF8] text-[#3E1B4A] px-2 py-0.5 rounded-full border border-[#E4D7EE]">
            {isGymnast ? `USAG Level ${user.level} Gymnast` : userRole === 'COACH' ? 'Coach' : 'Club administrator'}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-[#5C4A68] mt-2 font-medium">
          <span className="flex items-center gap-1">
            <Mail className="w-3.5 h-3.5 text-[#5C2A6E]" />
            <span>{user.email}</span>
          </span>
          <span className="flex items-center gap-1">
            <Phone className="w-3.5 h-3.5 text-[#5C2A6E]" />
            <span>{user.phoneNumber || 'No telephone number on file'}</span>
          </span>
        </div>

        {/* PRIMARY ACTIONS: Prominent EDIT PROFILE and VIEW PROGRESS */}
        <div className="flex flex-col sm:flex-row items-center gap-3 mt-6 w-full max-w-md">
          <button
            id="btn-profile-toggle-edit"
            onClick={() => (isEditing ? setIsEditing(false) : handleStartEdit())}
            className={`w-full sm:flex-1 py-3 px-4 rounded-full text-xs font-extrabold transition-all flex items-center justify-center gap-2 shadow-sm ${
              isEditing
                ? 'bg-[#F4EEF8] border border-[#E4D7EE] text-[#5C2A6E] hover:bg-[#E4D7EE]'
                : 'bg-gradient-to-r from-[#5C2A6E] to-[#3E1B4A] hover:opacity-95 text-white shadow-[#5C2A6E]/25 active:scale-98'
            }`}
          >
            {isEditing ? (
              <>
                <X className="w-4 h-4" />
                <span>Cancel Editing</span>
              </>
            ) : (
              <>
                <Edit3 className="w-4 h-4" />
                <span>Edit Profile</span>
              </>
            )}
          </button>

          <button
            id="btn-profile-view-progress"
            onClick={() => setCurrentTab('progress')}
            className="w-full sm:flex-1 py-3 px-4 rounded-full bg-[#F4EEF8] border border-[#E4D7EE] text-[#3E1B4A] text-xs font-extrabold hover:bg-[#E4D7EE] transition-all flex items-center justify-center gap-2 shadow-xs active:scale-98"
          >
            <Award className="w-4 h-4 text-[#5C2A6E]" />
            <span>View Progress Card</span>
          </button>
        </div>

        {/* Quick Links: Club Dashboard & Registered Clubs */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#E4D7EE] w-full max-w-md justify-center">
          {isStaff && (
            <>
              <button
                id="btn-profile-gym-dashboard"
                onClick={() => setCurrentTab('dashboard')}
                className="text-xs font-bold text-[#5C2A6E] hover:underline flex items-center gap-1"
              >
                <span>Club Dashboard</span>
              </button>
              <span className="text-gray-300">•</span>
            </>
          )}
          <button
            id="btn-profile-clubs"
            onClick={() => setCurrentTab('clubs')}
            className="text-xs font-bold text-[#3E1B4A] hover:underline flex items-center gap-1"
          >
            <span>Find a Club</span>
          </button>
        </div>
      </section>

      {/* Hidden File Input for Custom Avatar Upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleCustomPhotoUpload}
      />

      {/* EDIT PROFILE MODAL / FORM SECTION */}
      {isEditing && (
        <form
          onSubmit={handleSaveProfile}
          className="bg-white rounded-3xl p-6 sm:p-7 shadow-[0_8px_30px_rgba(92,42,110,0.12)] border-2 border-[#5C2A6E] space-y-5 animate-in fade-in duration-300"
        >
          <div className="flex items-center justify-between border-b border-[#E4D7EE] pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#E4D7EE] text-[#5C2A6E] flex items-center justify-center">
                <Edit3 className="w-4 h-4" />
              </div>
              <h2 className="font-display text-xl text-[#3E1B4A]">
                Edit Profile
              </h2>
            </div>
            <span className="text-[11px] font-bold text-[#5C2A6E] bg-[#F4EEF8] px-2.5 py-0.5 rounded-full border border-[#E4D7EE]">
              Customize Information
            </span>
          </div>

          {/* 1. CHOOSE GYMNAST AVATAR / PHOTO */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[#241628] flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-[#5C2A6E]" />
                <span>Gymnast Profile Photo</span>
              </label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-[11px] font-bold text-[#5C2A6E] hover:underline flex items-center gap-1"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload From Device / Camera</span>
              </button>
            </div>

            <p className="text-[11px] text-[#5C4A68]">
              Select from inspiring African & international gymnast avatars or tap to upload your own picture:
            </p>

            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2.5 pt-1">
              {AVATAR_PRESETS.map((preset) => {
                const isSelected = selectedAvatar === preset.url;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSelectedAvatar(preset.url)}
                    className={`flex flex-col items-center gap-1 p-1 rounded-2xl transition-all ${
                      isSelected
                        ? 'ring-3 ring-[#5C2A6E] bg-[#F4EEF8] scale-105 shadow-sm'
                        : 'hover:bg-gray-50 opacity-80 hover:opacity-100'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white shadow-xs">
                      <img
                        src={preset.url}
                        alt={preset.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <span className="text-[9px] font-bold text-[#241628] line-clamp-1 text-center">
                      {preset.name.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. LEVEL (read only: it moves up when the club approves every required skill) */}
          {isGymnast && (
            <div className="space-y-1 p-3.5 rounded-2xl bg-[#F7F4FB] border border-[#E4D7EE]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#241628] flex items-center gap-1">
                  <Award className="w-4 h-4 text-[#5C2A6E]" />
                  Current level: {user.level}
                </span>
              </div>
              <p className="text-[11px] text-[#5C4A68]">Your level moves up by itself once your club has approved every required skill.</p>
            </div>
          )}

          {/* 3. ATHLETE TEXT DETAILS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="text-xs font-bold text-[#241628] block mb-1">
                Full Name
              </label>
              <div className="relative">
                <input
                  type="text"
                  id="input-edit-fullname"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. Amara Okafor"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[#E4D7EE] text-xs font-semibold focus:ring-2 focus:ring-[#5C2A6E] focus:outline-none bg-white"
                />
                <UserIcon className="w-4 h-4 text-[#5C4A68] absolute left-3 top-3" />
              </div>
            </div>

            {isGymnast && (
              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-[#241628] block mb-1" htmlFor="select-edit-club">Your club</label>
                {clubLocked ? (
                  <p className="text-xs text-[#5C4A68] rounded-xl border border-[#E4D7EE] px-3 py-2.5">{user.clubName}. Your club added you, so only your club can change this.</p>
                ) : (
                  <>
                    <select
                      id="select-edit-club"
                      value={editClubId}
                      onChange={(e) => setEditClubId(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-[#E4D7EE] text-xs font-semibold focus:ring-2 focus:ring-[#5C2A6E] focus:outline-none bg-white"
                    >
                      <option value="">No club selected</option>
                      {clubs.map((club) => <option key={club.id} value={club.id}>{club.name} ({club.city})</option>)}
                    </select>
                    <p className="text-[11px] text-[#5C4A68] mt-1">Your skill videos go to the club you choose here.</p>
                  </>
                )}
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-[#241628] block mb-1">
                Phone Number
              </label>
              <div className="relative">
                <input
                  type="tel"
                  id="input-edit-phone"
                  required
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="+234 803 456 7890"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[#E4D7EE] text-xs font-semibold focus:ring-2 focus:ring-[#5C2A6E] focus:outline-none bg-white"
                />
                <Phone className="w-4 h-4 text-[#5C4A68] absolute left-3 top-3" />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-[#241628] block mb-1">
                Email Address
              </label>
              <div className="relative">
                <input
                  type="email"
                  id="input-edit-email"
                  readOnly
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="amara@gymtrack.ng"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[#E4D7EE] text-xs font-semibold focus:ring-2 focus:ring-[#5C2A6E] focus:outline-none bg-white"
                />
                <Mail className="w-4 h-4 text-[#5C4A68] absolute left-3 top-3" />
              </div>
            </div>
          </div>

          {formError && <p className="text-sm text-red-600" role="alert">{formError}</p>}

          {/* SAVE BUTTON */}
          <div className="pt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="w-1/3 py-3 rounded-full bg-gray-100 hover:bg-gray-200 text-[#241628] text-xs font-bold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="btn-save-profile"
              disabled={saving}
              className="w-2/3 py-3 rounded-full bg-gradient-to-r from-[#5C2A6E] to-[#3E1B4A] hover:opacity-95 text-white text-xs font-black shadow-md shadow-[#5C2A6E]/25 flex items-center justify-center gap-2 active:scale-98 transition-all"
            >
              <Check className="w-4 h-4" />
              <span>Save Profile Changes</span>
            </button>
          </div>
        </form>
      )}

      {/* LEVEL (read only) */}
      {!isEditing && isGymnast && (
        <div className="w-full p-4 rounded-3xl bg-white border border-[#E4D7EE] shadow-xs text-left space-y-2.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-[#5C2A6E]" />
              <span className="text-xs font-bold text-[#241628]">Active USAG Curriculum Level:</span>
            </div>
            <span className="text-[11px] font-extrabold text-[#5C2A6E] bg-[#F4EEF8] px-2.5 py-0.5 rounded-full border border-[#E4D7EE]">
              Current: Level {user.level}
            </span>
          </div>
          <div className="flex flex-wrap gap-2 pt-1" aria-label="Your level">
            {([1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as USAGLevel[]).map((lvl) => (
              <span
                key={lvl}
                className={`w-9 h-9 rounded-full text-xs font-extrabold flex items-center justify-center ${
                  user.level === lvl
                    ? 'bg-[#5C2A6E] text-white shadow-md scale-105'
                    : lvl < user.level
                      ? 'bg-[#F4EEF8] text-[#3E1B4A] border border-[#E4D7EE]'
                      : 'bg-[#F7F4FB] text-[#3E1B4A]/50 border border-[#E4D7EE]'
                }`}
              >
                {lvl}
              </span>
            ))}
          </div>
          {progress && progress.hasRequirements ? (
            <p className="text-[11px] text-[#5C4A68]">
              {progress.approved} of {progress.required} required skills approved
              {progress.pending > 0 ? `, ${progress.pending} waiting for your club` : ''}. You move up automatically when all are approved.
            </p>
          ) : (
            <p className="text-[11px] text-[#5C4A68]">This level has no standard requirements.</p>
          )}
        </div>
      )}

      {/* MY VIDEOS: everything this user published on Connect */}
      {!isEditing && (
        <div id="profile-videos" className="w-full p-4 rounded-3xl bg-white border border-[#E4D7EE] shadow-xs text-left space-y-3 scroll-mt-20">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl text-[#3E1B4A]">My videos on Connect</h2>
            <button type="button" onClick={() => setCurrentTab('community')} className="text-sm text-[#5C2A6E] underline">Open Connect</button>
          </div>
          {videoNote && <p className={`text-sm ${videoNote.ok ? 'text-[#3E1B4A]' : 'text-red-600'}`} role={videoNote.ok ? 'status' : 'alert'}>{videoNote.text}</p>}
          {videos.length === 0 && <p className="text-sm text-[#5C4A68]">Videos you upload to Connect show here.</p>}
          <div className="grid sm:grid-cols-2 gap-3">
            {videos.map((post) => (
              <article key={post.id} className="rounded-2xl border border-[#E4D7EE] overflow-hidden">
                <video src={mediaUrl(post.videoUrl)} controls preload="metadata" className="w-full aspect-video bg-black" />
                <div className="p-3 space-y-2">
                  <p className="text-sm text-[#241628]">{post.skill}</p>
                  <p className="text-xs text-[#5C4A68]">{post.visibility === 'club' ? `Only ${post.audienceClubName ?? 'one club'}` : 'All clubs'} · {post.likes} likes</p>
                  {confirmVideo === post.id ? (
                    <span className="flex gap-2">
                      <button type="button" onClick={() => deleteVideo(post)} className="px-3 py-2 rounded-full bg-red-700 text-white text-sm">Delete for good</button>
                      <button type="button" onClick={() => setConfirmVideo(null)} className="px-3 py-2 rounded-full border border-[#E4D7EE] text-sm">Keep</button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirmVideo(post.id)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-[#E4D7EE] text-sm text-[#3E1B4A]">
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {/* DRILLS AND CERTIFICATES FROM THE CLUB */}
      {!isEditing && isGymnast && (
        <div id="profile-drills" className="w-full p-4 rounded-3xl bg-white border border-[#E4D7EE] shadow-xs text-left space-y-2 scroll-mt-20">
          <h2 className="font-display text-xl text-[#3E1B4A]">Practice drills from my club</h2>
          {drills.length === 0 && <p className="text-[11px] text-[#5C4A68]">No drills assigned yet. Your club's drills show here.</p>}
          {drills.map((drill) => (
            <article key={drill.id} className="border-t border-[#E4D7EE] pt-2 space-y-0.5">
              <h3 className="text-sm text-[#241628]">{drill.title}</h3>
              {drill.description && <p className="text-xs text-[#5C4A68]">{drill.description}</p>}
              {drill.instructions && <p className="text-xs text-[#241628] whitespace-pre-line">{drill.instructions}</p>}
              {drill.attachmentUploadId && (
                <a href={mediaUrl(`/api/uploads/${drill.attachmentUploadId}`)} target="_blank" rel="noreferrer" className="text-xs text-[#5C2A6E] underline">Open attachment</a>
              )}
              <p className="text-[10px] text-[#5C4A68]">{new Date(drill.createdAt).toLocaleDateString()} · {drill.createdBy}</p>
            </article>
          ))}
          <h2 className="font-display text-xl text-[#3E1B4A] pt-3">My certificates</h2>
          {certificates.length === 0 && <p className="text-[11px] text-[#5C4A68]">Certificates from your club show here.</p>}
          {certificates.map((item) => (
            <p key={item.id} className="text-xs flex justify-between gap-2 border-t border-[#E4D7EE] pt-2">
              <span>{item.title} · {new Date(`${item.awardDate}T12:00:00`).toLocaleDateString()}</span>
              <a href={mediaUrl(`/api/uploads/${item.uploadId}`)} target="_blank" rel="noreferrer" className="text-[#5C2A6E] underline">Open</a>
            </p>
          ))}
        </div>
      )}

      {/* CLUB NOTICEBOARD (what the club posts shows here) */}
      {!isEditing && (
        <div id="profile-notices" className="w-full p-4 rounded-3xl bg-white border border-[#E4D7EE] shadow-xs text-left space-y-2 scroll-mt-20">
          <h2 className="font-display text-xl text-[#3E1B4A]">Club noticeboard</h2>
          {notices.length === 0 && <p className="text-[11px] text-[#5C4A68]">No notices from your club yet.</p>}
          {notices.map((item) => (
            <article key={item.id} className="border-t border-[#E4D7EE] pt-2">
              <h3 className="text-xs font-bold text-[#241628]">{item.title}</h3>
              <p className="text-[11px] text-[#5C4A68]">{item.body}</p>
              <p className="text-[10px] text-[#5C4A68]/70 mt-0.5">{new Date(item.createdAt).toLocaleDateString()}</p>
            </article>
          ))}
        </div>
      )}

      {/* COMPETITION HISTORY (recorded by the club) */}
      {!isEditing && isGymnast && (
        <div id="profile-competitions" className="w-full p-4 rounded-3xl bg-white border border-[#E4D7EE] shadow-xs text-left space-y-2 scroll-mt-20">
          <h2 className="font-display text-xl text-[#3E1B4A]">Competition history</h2>
          {competitions.length === 0 && <p className="text-[11px] text-[#5C4A68]">No competitions recorded yet. Your club adds them after each event.</p>}
          {competitions.map((item) => (
            <article key={item.id} className="border-t border-[#E4D7EE] pt-2 space-y-0.5">
              <h3 className="text-xs font-bold text-[#241628]">{item.name} · {item.date}</h3>
              {(item.venue || item.time) && <p className="text-[11px] text-[#5C4A68]">{[item.time, item.venue].filter(Boolean).join(' · ')}</p>}
              {item.level && <p className="text-[11px] text-[#5C4A68]">Competed at {item.level}</p>}
              {item.medal && <p className="text-[11px] text-[#241628]">Medal: {medalLabel(item.medal)}</p>}
              {item.events.length > 0 && <p className="text-[11px] text-[#5C4A68]">Events: {item.events.join(', ')}</p>}
              {item.result && <p className="text-[11px] text-[#241628]">Result: {item.result}</p>}
              {item.comments && <p className="text-[11px] text-[#5C4A68]">{item.comments}</p>}
            </article>
          ))}
        </div>
      )}

      {/* Safety & Medical Disclaimer Requirement */}
      <div className="p-4 rounded-3xl bg-[#F7F4FB] border border-[#E4D7EE] text-[#3E1B4A] space-y-1.5 shadow-2xs">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-[#5C2A6E] shrink-0" />
          <h3 className="font-display text-lg text-[#3E1B4A]">Important Coaching & Safety Notice</h3>
        </div>
        <p className="text-[11px] text-[#5C4A68] leading-relaxed">
          GymTrack is a training and progress-tracking application. It does not replace a qualified gymnastics coach. Always perform drills and skills under certified coach supervision with proper safety mats, spotting, and safety equipment.
        </p>
      </div>

      {/* Account & Security Section */}
      <div className="bg-white rounded-3xl p-5 border border-[#E4D7EE] space-y-3 shadow-2xs">
        <div className="flex items-center justify-between p-2 rounded-2xl hover:bg-[#F4EEF8] text-xs text-[#241628] transition-colors">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-[#5C2A6E]" />
            <span className="font-semibold">Gymnastics Federation SafeSport Account</span>
          </div>
          <span className="text-emerald-600 font-extrabold text-[11px] bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            Verified
          </span>
        </div>

        <div className="flex items-center justify-between p-2 rounded-2xl hover:bg-[#F4EEF8] text-xs text-[#241628] transition-colors">
          <div className="flex items-center gap-2.5">
            <Bell className="w-4 h-4 text-[#5C2A6E]" />
            <span className="font-semibold">Daily Training Reminders</span>
          </div>
          <span className="text-xs text-[#5C4A68] font-medium">5:00 PM West Africa Time</span>
        </div>

        {/* Account type (set when the account was created) */}
        <div className="p-3 rounded-2xl bg-[#F7F4FB] border border-[#E4D7EE]">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-[#3E1B4A]">Account type:</span>
            <span className="px-2.5 py-0.5 rounded-full bg-[#F4EEF8] border border-[#E4D7EE] text-[#3E1B4A] font-extrabold text-[10px]">
              {userRole === 'GYMNAST' ? 'Student / Gymnast' : userRole === 'COACH' ? 'Coach' : 'Club administrator'}
            </span>
          </div>
        </div>

        <button
          id="btn-profile-logout"
          onClick={logoutUser}
          className="w-full py-3 rounded-2xl text-xs font-bold text-[#5C2A6E] hover:bg-[#F4EEF8] border border-[#E4D7EE] transition-colors flex items-center justify-center gap-2 mt-2"
        >
          <LogOut className="w-4 h-4" />
          <span>Log Out</span>
        </button>
      </div>
    </div>
  );
};
