import React, { useEffect, useState, useRef } from 'react';
import { useGym } from '../context/GymContext';
import { USAGLevel } from '../types';
import { AVATAR_PRESETS } from '../data/gymData';
import { gymApi } from '../services/gymApi';
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
  X
} from 'lucide-react';

export const ProfileScreen: React.FC = () => {
  const { user, updateUserProfile, saveProfile, logoutUser, setCurrentTab, awardXp, userRole, isStaff, notices, competitions, progress } = useGym();
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
  }, []);

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
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 bg-[#1f1619] text-[#fffdf0] rounded-full text-xs font-bold shadow-xl animate-bounce flex items-center gap-2 border border-[#fef08a]/30">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Profile Header Card */}
      <section className="bg-white rounded-3xl p-6 sm:p-8 shadow-[0_8px_24px_-4px_rgba(244,114,182,0.12)] border border-[#fce7f3] relative overflow-hidden flex flex-col items-center text-center">
        <div className="absolute -top-12 -right-12 w-40 h-40 bg-[#fce7f3]/60 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-[#fef9c3]/60 rounded-full blur-2xl pointer-events-none" />

        {/* Circular Avatar with Camera Quick Action */}
        <div className="relative group">
          <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden ring-4 ring-[#ec4899]/30 border-4 border-white shadow-lg bg-[#fff0f5]">
            <img
              src={isEditing ? selectedAvatar : user.avatar}
              alt={user.fullName}
              className="w-full h-full object-cover transition-transform group-hover:scale-105"
            />
          </div>

          {/* USAG Level Badge */}
          <span className="absolute bottom-1 right-1 bg-gradient-to-r from-[#ec4899] to-[#db2777] text-white text-xs font-black px-3 py-1 rounded-full shadow-md border-2 border-white flex items-center gap-1">
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
            className="absolute -top-1 -right-1 p-2 bg-white text-[#db2777] rounded-full shadow-md border border-[#fce7f3] hover:bg-[#fff5f8] transition-transform active:scale-95"
            title="Change Gymnast Photo"
            aria-label="Change Gymnast Photo"
          >
            <Camera className="w-4 h-4" />
          </button>
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1f1619] mt-4 tracking-tight">
          {user.fullName}
        </h1>

        <div className="flex items-center gap-1.5 text-xs text-[#db2777] font-bold mt-1">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span>{user.clubName || 'No club selected'}</span>
          <span className="text-[#6b555c]">•</span>
          <span className="bg-[#fef9c3] text-[#854d0e] px-2 py-0.5 rounded-full border border-[#fef08a]">
            {isGymnast ? `USAG Level ${user.level} Gymnast` : userRole === 'COACH' ? 'Coach' : 'Club administrator'}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-[#6b555c] mt-2 font-medium">
          <span className="flex items-center gap-1">
            <Mail className="w-3.5 h-3.5 text-[#ec4899]" />
            <span>{user.email}</span>
          </span>
          <span className="flex items-center gap-1">
            <Phone className="w-3.5 h-3.5 text-[#ec4899]" />
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
                ? 'bg-[#fff0f5] border border-[#fce7f3] text-[#db2777] hover:bg-[#fce7f3]'
                : 'bg-gradient-to-r from-[#ec4899] to-[#db2777] hover:opacity-95 text-white shadow-pink-500/25 active:scale-98'
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
            className="w-full sm:flex-1 py-3 px-4 rounded-full bg-[#fef9c3] border border-[#fef08a] text-[#854d0e] text-xs font-extrabold hover:bg-[#fde047] transition-all flex items-center justify-center gap-2 shadow-xs active:scale-98"
          >
            <Award className="w-4 h-4 text-[#db2777]" />
            <span>View Progress Card</span>
          </button>
        </div>

        {/* Quick Links: Club Dashboard & Registered Clubs */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#fce7f3] w-full max-w-md justify-center">
          {isStaff && (
            <>
              <button
                id="btn-profile-gym-dashboard"
                onClick={() => setCurrentTab('dashboard')}
                className="text-xs font-bold text-[#db2777] hover:underline flex items-center gap-1"
              >
                <span>Club Dashboard</span>
              </button>
              <span className="text-gray-300">•</span>
            </>
          )}
          <button
            id="btn-profile-clubs"
            onClick={() => setCurrentTab('clubs')}
            className="text-xs font-bold text-[#854d0e] hover:underline flex items-center gap-1"
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
          className="bg-white rounded-3xl p-6 sm:p-7 shadow-[0_8px_30px_rgba(244,114,182,0.15)] border-2 border-[#f472b6] space-y-5 animate-in fade-in duration-300"
        >
          <div className="flex items-center justify-between border-b border-[#fce7f3] pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#fce7f3] text-[#db2777] flex items-center justify-center">
                <Edit3 className="w-4 h-4" />
              </div>
              <h2 className="text-base sm:text-lg font-black text-[#1f1619]">
                Edit Gymnast Profile
              </h2>
            </div>
            <span className="text-[11px] font-bold text-[#db2777] bg-[#fff0f5] px-2.5 py-0.5 rounded-full border border-pink-200">
              Customize Information
            </span>
          </div>

          {/* 1. CHOOSE GYMNAST AVATAR / PHOTO */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[#1f1619] flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-[#ec4899]" />
                <span>Gymnast Profile Photo</span>
              </label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-[11px] font-bold text-[#db2777] hover:underline flex items-center gap-1"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload From Device / Camera</span>
              </button>
            </div>

            <p className="text-[11px] text-[#6b555c]">
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
                        ? 'ring-3 ring-[#ec4899] bg-[#fff0f5] scale-105 shadow-sm'
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
                    <span className="text-[9px] font-bold text-[#1f1619] line-clamp-1 text-center">
                      {preset.name.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. LEVEL (read only: it moves up when the club approves every required skill) */}
          {isGymnast && (
            <div className="space-y-1 p-3.5 rounded-2xl bg-[#fffdf0] border border-[#fef08a]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#1f1619] flex items-center gap-1">
                  <Award className="w-4 h-4 text-[#db2777]" />
                  Current level: {user.level}
                </span>
              </div>
              <p className="text-[11px] text-[#6b555c]">Your level moves up by itself once your club has approved every required skill.</p>
            </div>
          )}

          {/* 3. ATHLETE TEXT DETAILS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="text-xs font-bold text-[#1f1619] block mb-1">
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
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[#fce7f3] text-xs font-semibold focus:ring-2 focus:ring-[#ec4899] focus:outline-none bg-white"
                />
                <UserIcon className="w-4 h-4 text-[#6b555c] absolute left-3 top-3" />
              </div>
            </div>

            {isGymnast && (
              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-[#1f1619] block mb-1" htmlFor="select-edit-club">Your club</label>
                {clubLocked ? (
                  <p className="text-xs text-[#6b555c] rounded-xl border border-[#fce7f3] px-3 py-2.5">{user.clubName}. Your club added you, so only your club can change this.</p>
                ) : (
                  <>
                    <select
                      id="select-edit-club"
                      value={editClubId}
                      onChange={(e) => setEditClubId(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-[#fce7f3] text-xs font-semibold focus:ring-2 focus:ring-[#ec4899] focus:outline-none bg-white"
                    >
                      <option value="">No club selected</option>
                      {clubs.map((club) => <option key={club.id} value={club.id}>{club.name} ({club.city})</option>)}
                    </select>
                    <p className="text-[11px] text-[#6b555c] mt-1">Your skill videos go to the club you choose here.</p>
                  </>
                )}
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-[#1f1619] block mb-1">
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
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[#fce7f3] text-xs font-semibold focus:ring-2 focus:ring-[#ec4899] focus:outline-none bg-white"
                />
                <Phone className="w-4 h-4 text-[#6b555c] absolute left-3 top-3" />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-[#1f1619] block mb-1">
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
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[#fce7f3] text-xs font-semibold focus:ring-2 focus:ring-[#ec4899] focus:outline-none bg-white"
                />
                <Mail className="w-4 h-4 text-[#6b555c] absolute left-3 top-3" />
              </div>
            </div>
          </div>

          {formError && <p className="text-sm text-red-600" role="alert">{formError}</p>}

          {/* SAVE BUTTON */}
          <div className="pt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="w-1/3 py-3 rounded-full bg-gray-100 hover:bg-gray-200 text-[#1f1619] text-xs font-bold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="btn-save-profile"
              disabled={saving}
              className="w-2/3 py-3 rounded-full bg-gradient-to-r from-[#ec4899] via-[#f472b6] to-[#f59e0b] hover:opacity-95 text-white text-xs font-black shadow-md shadow-pink-500/25 flex items-center justify-center gap-2 active:scale-98 transition-all"
            >
              <Check className="w-4 h-4" />
              <span>Save Profile Changes</span>
            </button>
          </div>
        </form>
      )}

      {/* LEVEL (read only) */}
      {!isEditing && isGymnast && (
        <div className="w-full p-4 rounded-3xl bg-white border border-[#fce7f3] shadow-xs text-left space-y-2.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-[#db2777]" />
              <span className="text-xs font-bold text-[#1f1619]">Active USAG Curriculum Level:</span>
            </div>
            <span className="text-[11px] font-extrabold text-[#db2777] bg-[#fff0f5] px-2.5 py-0.5 rounded-full border border-pink-200">
              Current: Level {user.level}
            </span>
          </div>
          <div className="flex flex-wrap gap-2 pt-1" aria-label="Your level">
            {([1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as USAGLevel[]).map((lvl) => (
              <span
                key={lvl}
                className={`w-9 h-9 rounded-full text-xs font-extrabold flex items-center justify-center ${
                  user.level === lvl
                    ? 'bg-[#ec4899] text-white shadow-md scale-105'
                    : lvl < user.level
                      ? 'bg-[#fef9c3] text-[#854d0e] border border-[#fef08a]'
                      : 'bg-[#fffdf0] text-[#854d0e]/50 border border-[#fef08a]'
                }`}
              >
                {lvl}
              </span>
            ))}
          </div>
          {progress && progress.hasRequirements ? (
            <p className="text-[11px] text-[#6b555c]">
              {progress.approved} of {progress.required} required skills approved
              {progress.pending > 0 ? `, ${progress.pending} waiting for your club` : ''}. You move up automatically when all are approved.
            </p>
          ) : (
            <p className="text-[11px] text-[#6b555c]">This level has no standard requirements.</p>
          )}
        </div>
      )}

      {/* CLUB NOTICEBOARD (what the club posts shows here) */}
      {!isEditing && notices.length > 0 && (
        <div className="w-full p-4 rounded-3xl bg-white border border-[#fce7f3] shadow-xs text-left space-y-2">
          <h2 className="text-sm font-black text-[#1f1619]">Club noticeboard</h2>
          {notices.slice(0, 5).map((item) => (
            <article key={item.id} className="border-t border-[#fce7f3] pt-2">
              <h3 className="text-xs font-bold text-[#1f1619]">{item.title}</h3>
              <p className="text-[11px] text-[#6b555c]">{item.body}</p>
              <p className="text-[10px] text-[#6b555c]/70 mt-0.5">{new Date(item.createdAt).toLocaleDateString()}</p>
            </article>
          ))}
        </div>
      )}

      {/* COMPETITION HISTORY (recorded by the club) */}
      {!isEditing && isGymnast && (
        <div className="w-full p-4 rounded-3xl bg-white border border-[#fce7f3] shadow-xs text-left space-y-2">
          <h2 className="text-sm font-black text-[#1f1619]">Competition history</h2>
          {competitions.length === 0 && <p className="text-[11px] text-[#6b555c]">No competitions recorded yet. Your club adds them after each event.</p>}
          {competitions.map((item) => (
            <article key={item.id} className="border-t border-[#fce7f3] pt-2 space-y-0.5">
              <h3 className="text-xs font-bold text-[#1f1619]">{item.name} · {item.date}</h3>
              {item.events.length > 0 && <p className="text-[11px] text-[#6b555c]">Events: {item.events.join(', ')}</p>}
              {item.result && <p className="text-[11px] text-[#1f1619]">Result: {item.result}</p>}
              {item.comments && <p className="text-[11px] text-[#6b555c]">{item.comments}</p>}
            </article>
          ))}
        </div>
      )}

      {/* Safety & Medical Disclaimer Requirement */}
      <div className="p-4 rounded-3xl bg-[#fffdf0] border border-[#fef08a] text-[#854d0e] space-y-1.5 shadow-2xs">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-[#db2777] shrink-0" />
          <h3 className="text-xs font-bold text-[#1f1619]">Important Coaching & Safety Notice</h3>
        </div>
        <p className="text-[11px] text-[#6b555c] leading-relaxed">
          GymTrack is a training and progress-tracking application. It does not replace a qualified gymnastics coach. Always perform drills and skills under certified coach supervision with proper safety mats, spotting, and safety equipment.
        </p>
      </div>

      {/* Account & Security Section */}
      <div className="bg-white rounded-3xl p-5 border border-[#fce7f3] space-y-3 shadow-2xs">
        <div className="flex items-center justify-between p-2 rounded-2xl hover:bg-[#fff5f8] text-xs text-[#1f1619] transition-colors">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-[#db2777]" />
            <span className="font-semibold">Gymnastics Federation SafeSport Account</span>
          </div>
          <span className="text-emerald-600 font-extrabold text-[11px] bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            Verified
          </span>
        </div>

        <div className="flex items-center justify-between p-2 rounded-2xl hover:bg-[#fff5f8] text-xs text-[#1f1619] transition-colors">
          <div className="flex items-center gap-2.5">
            <Bell className="w-4 h-4 text-[#d97706]" />
            <span className="font-semibold">Daily Training Reminders</span>
          </div>
          <span className="text-xs text-[#6b555c] font-medium">5:00 PM West Africa Time</span>
        </div>

        {/* Account type (set when the account was created) */}
        <div className="p-3 rounded-2xl bg-[#fffdf0] border border-[#fef08a]">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-[#854d0e]">Account type:</span>
            <span className="px-2.5 py-0.5 rounded-full bg-[#fef9c3] border border-[#fef08a] text-[#854d0e] font-extrabold text-[10px]">
              {userRole === 'GYMNAST' ? 'Student / Gymnast' : userRole === 'COACH' ? 'Coach' : 'Club administrator'}
            </span>
          </div>
        </div>

        <button
          id="btn-profile-logout"
          onClick={logoutUser}
          className="w-full py-3 rounded-2xl text-xs font-bold text-[#db2777] hover:bg-[#fff5f8] border border-[#fce7f3] transition-colors flex items-center justify-center gap-2 mt-2"
        >
          <LogOut className="w-4 h-4" />
          <span>Switch / Register New Gymnast</span>
        </button>
      </div>
    </div>
  );
};
