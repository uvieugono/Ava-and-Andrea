import React, { useState } from 'react';
import { useGym } from '../context/GymContext';
import { RegisteredClub, ClubDirectoryItem } from '../types';
import { AVAILABLE_GYMNASTICS_CLUBS } from '../data/gymData';
import { VERIFIED_CLUBS } from '../data/verifiedClubs';
import { PublicImage } from '../components/PublicImage';
import { 
  Building2, 
  Search, 
  MapPin, 
  ShieldCheck, 
  Award, 
  Plus, 
  Check, 
  ChevronRight, 
  ExternalLink, 
  Users, 
  Phone, 
  Mail, 
  Globe, 
  Sparkles, 
  CreditCard, 
  CheckCircle2, 
  X,
  SlidersHorizontal,
  ArrowRight,
  Shield,
  FileCheck,
  Star
} from 'lucide-react';

export const ClubsScreen: React.FC = () => {
  const { registeredClubs, user, setCurrentTab } = useGym();
  const [searchQuery, setSearchQuery] = useState('');
  const [cityFilter, setCityFilter] = useState<'All' | 'Lagos' | 'Abuja'>('All');
  const [nearCity, setNearCity] = useState<string | null>(null);
  const [regionFilter, setRegionFilter] = useState<'ALL' | 'NIGERIA' | 'AFRICA' | 'INTERNATIONAL'>('ALL');
  const [selectedClubForModal, setSelectedClubForModal] = useState<RegisteredClub | null>(null);

  // Club Registration Modal state
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [regStep, setRegStep] = useState<'DETAILS' | 'PAYMENT' | 'CONFIRMATION'>('DETAILS');

  // Registration Form State
  const [clubName, setClubName] = useState('');
  const [locationAddress, setLocationAddress] = useState('');
  const [city, setCity] = useState('Lagos');
  const [state, setState] = useState('Lagos State');
  const [country, setCountry] = useState('Nigeria');
  const [ownerName, setOwnerName] = useState(user.fullName || 'Coach');
  const [adminRole, setAdminRole] = useState('Head Coach & Founder');
  const [contactEmail, setContactEmail] = useState(user.email || '');
  const [contactPhone, setContactPhone] = useState(user.phoneNumber || '+234 ');
  const [website, setWebsite] = useState('');
  const [gymnastCountTier, setGymnastCountTier] = useState('26–50 Gymnasts');
  const [facilities, setFacilities] = useState('Olympic Spring Floor (40x40), Vault Runway & Table, Resi-Pits');
  const [programs, setPrograms] = useState('USAG Development Program Levels 1–10, Gymfest 3.0 Prep');
  const [description, setDescription] = useState('');
  const [yearEstablished, setYearEstablished] = useState<number>(2022);
  const [logoUrl, setLogoUrl] = useState('https://images.unsplash.com/photo-1574680096145-d05b474e2155?auto=format&fit=crop&w=400&q=80');

  // Payment method state
  const [paymentMethod, setPaymentMethod] = useState<'CARD' | 'TRANSFER' | 'USSD'>('CARD');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [completedClubRegistration, setCompletedClubRegistration] = useState<RegisteredClub | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const registrationFeeAmount = 75000; // NGN (or ~$99 USD)

  // Filter clubs from registered clubs and available directory
  const filteredRegisteredClubs = registeredClubs.filter((club) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = 
      !q ||
      club.name.toLowerCase().includes(q) ||
      club.city.toLowerCase().includes(q) ||
      club.state.toLowerCase().includes(q) ||
      club.country.toLowerCase().includes(q) ||
      club.ownerName.toLowerCase().includes(q);

    if (!matchesSearch) return false;

    if (regionFilter === 'NIGERIA') return club.country.toLowerCase() === 'nigeria';
    if (regionFilter === 'AFRICA') return club.country.toLowerCase() !== 'nigeria' && ['South Africa', 'Egypt', 'Kenya', 'Ghana'].includes(club.country);
    if (regionFilter === 'INTERNATIONAL') return !['Nigeria', 'South Africa', 'Egypt', 'Kenya', 'Ghana'].includes(club.country);

    return true;
  }).slice().sort((a, b) => {
    if (!nearCity) return 0;
    if (a.city.toLowerCase() === nearCity && b.city.toLowerCase() !== nearCity) return -1;
    if (b.city.toLowerCase() === nearCity && a.city.toLowerCase() !== nearCity) return 1;
    return 0;
  });

  const handleStartRegistration = () => {
    setRegStep('DETAILS');
    setFormError(null);
    setShowRegisterModal(true);
  };

  const handleProceedToPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clubName.trim()) {
      setFormError('Please enter your gymnastics club name.');
      return;
    }
    if (!locationAddress.trim() || !city.trim()) {
      setFormError('Please enter your club address and city.');
      return;
    }
    if (!ownerName.trim()) {
      setFormError('Please enter the club administrator / owner name.');
      return;
    }
    if (!contactEmail.trim() || !contactPhone.trim()) {
      setFormError('Please provide contact email and phone number.');
      return;
    }

    setFormError(null);
    setRegStep('PAYMENT');
  };

  const handleProcessPayment = () => {
    setFormError('Student places are created from signup. Each student pays ₦1,000 before the account is active.');
    setIsProcessingPayment(false);
    setRegStep('DETAILS');
  };

  const handleGoToDashboard = () => {
    setShowRegisterModal(false);
    setCurrentTab('dashboard');
  };

  return (
    <div className="flex flex-col w-full max-w-4xl mx-auto px-4 sm:px-6 space-y-6 pt-2 pb-16">
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl text-[#3E1B4A]">Find a Club</h1>
            <p className="text-sm text-[#5C4A68] mt-1">Gymnastics clubs in Lagos and Abuja. Blank fields are not filled in.</p>
          </div>
          <button type="button" onClick={handleStartRegistration} className="px-4 py-2 rounded-full bg-[#5C2A6E] text-white text-sm">Register your club</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {(['All', 'Lagos', 'Abuja'] as const).map((city) => (
            <button key={city} type="button" onClick={() => setCityFilter(city)} className={`px-3 py-1 rounded-full text-sm ${cityFilter === city ? 'bg-[#5C2A6E] text-white' : 'bg-white border border-[#E4D7EE]'}`}>{city}</button>
          ))}
        </div>
        <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search by name or city" className="w-full rounded-xl border border-[#E4D7EE] px-3 py-2 text-sm" />
        <div className="space-y-3">
          {VERIFIED_CLUBS.filter((club) => cityFilter === 'All' || club.city === cityFilter).filter((club) => {
            const q = searchQuery.trim().toLowerCase();
            return !q || `${club.name} ${club.city} ${club.areas ?? ''} ${club.address ?? ''} ${club.coach ?? ''}`.toLowerCase().includes(q);
          }).map((club) => (
            <article key={club.id} className="bg-white border border-[#E4D7EE] rounded-2xl overflow-hidden">
              {club.image && (
                <PublicImage base={club.image} alt={`${club.name}`} className="w-full h-48 object-cover" fallback={null} />
              )}
              <div className="p-4 space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-xl bg-[#F4EEF8] flex items-center justify-center text-[10px] text-[#5C4A68] text-center px-1 leading-tight">
                  {club.logo ? <img src={club.logo} alt="" className="w-full h-full object-cover rounded-xl" /> : 'Logo not on file'}
                </div>
                <div>
                  <h2 className="font-display text-xl text-[#3E1B4A]">{club.name}</h2>
                  <p className="text-sm text-[#5C4A68]">{club.city}</p>
                </div>
              </div>
              {club.areas && <p className="text-sm">Areas: {club.areas}</p>}
              <p className="text-sm">{club.address ?? (club.areas ? 'Street address not on file' : 'Address not on file')}</p>
              <p className="text-sm">{club.phone ? <a href={`tel:${club.phone.split(',')[0].trim()}`}>{club.phone}</a> : 'Telephone not on file'}</p>
              <p className="text-sm">{club.coach ? `Coach: ${club.coach}` : 'Coach name not on file'}</p>
              <div className="flex flex-wrap gap-3 text-sm">
                {club.instagram && <a className="text-[#5C2A6E]" href={club.instagram} target="_blank" rel="noreferrer">Instagram</a>}
                {club.facebook && <a className="text-[#5C2A6E]" href={club.facebook} target="_blank" rel="noreferrer">Facebook</a>}
                {club.tiktok && <a className="text-[#5C2A6E]" href={club.tiktok} target="_blank" rel="noreferrer">TikTok</a>}
                {club.youtube && <a className="text-[#5C2A6E]" href={club.youtube} target="_blank" rel="noreferrer">YouTube</a>}
              </div>
              {club.missing.length > 0 && <p className="text-xs text-[#5C4A68]">Still to add: {club.missing.join(', ')}</p>}
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* 4. CLUB REGISTRATION & PAYMENT MODAL */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1f1619]/65 backdrop-blur-xs p-4">
          <div className="w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-[#fce7f3] max-h-[92vh] overflow-y-auto flex flex-col justify-between">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-[#fce7f3] flex items-center justify-between bg-gradient-to-r from-[#fff5f8] to-white rounded-t-3xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#ec4899] text-white flex items-center justify-center shadow-md">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-[#1f1619]">
                    {regStep === 'DETAILS' && 'Gymnast Club Official Registration'}
                    {regStep === 'PAYMENT' && 'Complete Registration Fee Payment'}
                    {regStep === 'CONFIRMATION' && 'Club Officially Registered & Verified!'}
                  </h3>
                  <p className="text-xs text-[#6b555c]">
                    {regStep === 'DETAILS' && 'Step 1 of 2: Enter club details & administrative information'}
                    {regStep === 'PAYMENT' && 'Step 2 of 2: Review registration fee and verify club status'}
                    {regStep === 'CONFIRMATION' && 'Official accreditation issued for the 2026 gymnastics season'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowRegisterModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: STEP 1 - DETAILS */}
            {regStep === 'DETAILS' && (
              <form onSubmit={handleProceedToPayment} className="p-5 sm:p-6 space-y-4">
                {formError && (
                  <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold animate-in fade-in">
                    {formError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-bold text-[#1f1619] block mb-1">
                      Gymnastics Club Name <span className="text-[#db2777] font-black">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={clubName}
                      onChange={(e) => setClubName(e.target.value)}
                      placeholder="e.g. Apex Gymnastics Academy"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#fce7f3] text-xs font-semibold focus:ring-2 focus:ring-[#ec4899] focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-xs font-bold text-[#1f1619] block mb-1">
                      Facility Street Address <span className="text-[#db2777] font-black">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={locationAddress}
                      onChange={(e) => setLocationAddress(e.target.value)}
                      placeholder="e.g. 14 Sports Arena Way, Surulere"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#fce7f3] text-xs font-semibold focus:ring-2 focus:ring-[#ec4899] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[#1f1619] block mb-1">City <span className="text-[#db2777]">*</span></label>
                    <input
                      type="text"
                      required
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Lagos"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#fce7f3] text-xs font-semibold focus:ring-2 focus:ring-[#ec4899] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[#1f1619] block mb-1">State / Province</label>
                    <input
                      type="text"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      placeholder="Lagos State"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#fce7f3] text-xs font-semibold focus:ring-2 focus:ring-[#ec4899] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[#1f1619] block mb-1">Country</label>
                    <input
                      type="text"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      placeholder="Nigeria"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#fce7f3] text-xs font-semibold focus:ring-2 focus:ring-[#ec4899] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[#1f1619] block mb-1">Year Established</label>
                    <input
                      type="number"
                      value={yearEstablished}
                      onChange={(e) => setYearEstablished(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#fce7f3] text-xs font-semibold focus:ring-2 focus:ring-[#ec4899] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[#1f1619] block mb-1">
                      Club Owner / Administrator Name <span className="text-[#db2777] font-black">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      placeholder="Coach Anthony Okafor"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#fce7f3] text-xs font-semibold focus:ring-2 focus:ring-[#ec4899] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[#1f1619] block mb-1">Administrator Role</label>
                    <input
                      type="text"
                      value={adminRole}
                      onChange={(e) => setAdminRole(e.target.value)}
                      placeholder="Head Coach & Technical Director"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#fce7f3] text-xs font-semibold focus:ring-2 focus:ring-[#ec4899] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[#1f1619] block mb-1">Contact Email <span className="text-[#db2777]">*</span></label>
                    <input
                      type="email"
                      required
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="admin@apexgym.ng"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#fce7f3] text-xs font-semibold focus:ring-2 focus:ring-[#ec4899] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[#1f1619] block mb-1">Contact Phone <span className="text-[#db2777]">*</span></label>
                    <input
                      type="tel"
                      required
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      placeholder="+234 802 000 1122"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#fce7f3] text-xs font-semibold focus:ring-2 focus:ring-[#ec4899] focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-xs font-bold text-[#1f1619] block mb-1">
                      Estimated Active Gymnasts Count
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {['10–25 Gymnasts', '26–50 Gymnasts', '51–100 Gymnasts', '100+ Elite Roster'].map((tier) => (
                        <button
                          key={tier}
                          type="button"
                          onClick={() => setGymnastCountTier(tier)}
                          className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all border ${
                            gymnastCountTier === tier
                              ? 'bg-[#ec4899] text-white border-[#ec4899] shadow-xs'
                              : 'bg-white text-[#6b555c] border-[#fce7f3] hover:bg-[#fff5f8]'
                          }`}
                        >
                          {tier}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-xs font-bold text-[#1f1619] block mb-1">
                      Key Facilities & Equipment Available
                    </label>
                    <input
                      type="text"
                      value={facilities}
                      onChange={(e) => setFacilities(e.target.value)}
                      placeholder="e.g. Olympic Spring Floor, Dual Vault Tables, Resi-Pit, Uneven Bars"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#fce7f3] text-xs font-semibold focus:ring-2 focus:ring-[#ec4899] focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-xs font-bold text-[#1f1619] block mb-1">
                      Club Description / Training Philosophy
                    </label>
                    <textarea
                      rows={2}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe your gymnastics programs, competition team, and coaching focus..."
                      className="w-full px-3.5 py-2 rounded-xl border border-[#fce7f3] text-xs font-medium focus:ring-2 focus:ring-[#ec4899] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-[#fce7f3] flex items-center justify-between">
                  <div className="text-xs text-[#854d0e] font-bold bg-[#fef9c3] px-3 py-1 rounded-full border border-[#fef08a]">
                    Registration Fee: ₦75,000 / year
                  </div>
                  <button
                    type="submit"
                    id="btn-proceed-to-payment"
                    className="py-3 px-6 rounded-full bg-gradient-to-r from-[#ec4899] to-[#db2777] hover:opacity-95 text-white font-black text-xs shadow-md shadow-pink-500/25 flex items-center gap-1.5"
                  >
                    <span>Continue to Payment</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            )}

            {/* Modal Body: STEP 2 - PAYMENT & REGISTRATION FEE */}
            {regStep === 'PAYMENT' && (
              <div className="p-5 sm:p-6 space-y-5">
                {/* Fee Breakdown Card */}
                <div className="rounded-2xl bg-gradient-to-br from-[#fffdf0] to-[#fef9c3] p-5 border border-[#fef08a] space-y-3">
                  <div className="flex items-center justify-between border-b border-amber-200/80 pb-2">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-[#854d0e]">
                        Official Gymtrack Accreditation
                      </span>
                      <h4 className="text-base font-black text-[#1f1619]">{clubName}</h4>
                    </div>
                    <div className="text-right">
                      <span className="text-xl font-black text-[#db2777]">₦75,000</span>
                      <span className="text-[10px] text-[#6b555c] block">Annual Affiliation Fee</span>
                    </div>
                  </div>

                  <p className="text-xs text-[#854d0e] font-semibold">
                    What is included in your official club registration:
                  </p>

                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#1f1619]">
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Official <strong>Verified Club Badge</strong> & Directory Listing</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Dedicated <strong>Gym / Coach Dashboard</strong> Access</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Unlimited Gymnast Roster & Score Tracking</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Video Evidence Evaluation & Stamp Portal</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>FIG / GFN Competition & Gymfest 3.0 Alignment</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>SafeSport Compliance Accreditation</span>
                    </li>
                  </ul>
                </div>

                {/* Payment Method Selector */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-[#1f1619] block">
                    Select Payment Method
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('CARD')}
                      className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                        paymentMethod === 'CARD'
                          ? 'border-[#ec4899] bg-[#fff0f5] text-[#db2777] ring-2 ring-pink-200 shadow-xs'
                          : 'border-[#fce7f3] bg-white text-[#6b555c]'
                      }`}
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>Debit / Credit Card</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod('TRANSFER')}
                      className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                        paymentMethod === 'TRANSFER'
                          ? 'border-[#ec4899] bg-[#fff0f5] text-[#db2777] ring-2 ring-pink-200 shadow-xs'
                          : 'border-[#fce7f3] bg-white text-[#6b555c]'
                      }`}
                    >
                      <Building2 className="w-4 h-4" />
                      <span>Direct Bank Transfer</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod('USSD')}
                      className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                        paymentMethod === 'USSD'
                          ? 'border-[#ec4899] bg-[#fff0f5] text-[#db2777] ring-2 ring-pink-200 shadow-xs'
                          : 'border-[#fce7f3] bg-white text-[#6b555c]'
                      }`}
                    >
                      <Phone className="w-4 h-4" />
                      <span>USSD / QR Code</span>
                    </button>
                  </div>
                </div>

                {/* Simulated Checkout Box */}
                <div className="p-4 rounded-2xl bg-[#fff9fb] border border-[#fce7f3] space-y-3 text-xs">
                  <div className="flex items-center justify-between text-[#6b555c]">
                    <span>Affiliation Period</span>
                    <strong className="text-[#1f1619]">12 Months (2026–2027 Season)</strong>
                  </div>
                  <div className="flex items-center justify-between text-[#6b555c]">
                    <span>Accreditation Type</span>
                    <strong className="text-[#1f1619]">Full Competitive Club Roster</strong>
                  </div>
                  <div className="flex items-center justify-between text-[#6b555c] pt-2 border-t border-[#fce7f3]">
                    <span className="font-bold text-[#1f1619]">Total Registration Fee</span>
                    <strong className="text-base text-[#db2777] font-black">₦75,000 NGN</strong>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setRegStep('DETAILS')}
                    className="py-2.5 px-4 rounded-full text-xs font-bold text-[#6b555c] hover:bg-gray-100"
                  >
                    Back to Details
                  </button>

                  <button
                    type="button"
                    id="btn-confirm-pay-fee"
                    onClick={handleProcessPayment}
                    disabled={isProcessingPayment}
                    className="py-3 px-6 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 text-white font-black text-xs sm:text-sm shadow-md shadow-emerald-600/25 flex items-center gap-2 active:scale-98 transition-all disabled:opacity-50"
                  >
                    {isProcessingPayment ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Securing Payment & Accreditation...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Pay ₦75,000 & Register Club</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Modal Body: STEP 3 - CONFIRMATION */}
            {regStep === 'CONFIRMATION' && completedClubRegistration && (
              <div className="p-6 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center ring-8 ring-emerald-50 animate-bounce">
                  <CheckCircle2 className="w-10 h-10" />
                </div>

                <div className="space-y-1">
                  <span className="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-black uppercase">
                    Status: Registered & Verified ✓
                  </span>
                  <h3 className="text-xl sm:text-2xl font-black text-[#1f1619] pt-2">
                    {completedClubRegistration.name}
                  </h3>
                  <p className="text-xs text-[#6b555c]">
                    Your registration fee of <strong>₦75,000</strong> has been processed successfully.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-[#fffdf0] border border-[#fef08a] text-left text-xs space-y-2">
                  <div className="flex items-center justify-between text-[#854d0e]">
                    <span>Accreditation Ref:</span>
                    <strong className="font-mono text-[#1f1619]">{completedClubRegistration.paymentReference}</strong>
                  </div>
                  <div className="flex items-center justify-between text-[#854d0e]">
                    <span>Official Badge:</span>
                    <span className="font-bold text-emerald-700">{completedClubRegistration.verificationBadge}</span>
                  </div>
                  <div className="flex items-center justify-between text-[#854d0e]">
                    <span>Director / Administrator:</span>
                    <strong className="text-[#1f1619]">{completedClubRegistration.ownerName}</strong>
                  </div>
                </div>

                <p className="text-xs text-[#6b555c]">
                  You have been upgraded to <strong>Club Administrator</strong>. You can now open Club Dashboard to review videos, attendance, fees, notices and documents.
                </p>

                <div className="pt-2 flex flex-col sm:flex-row items-center gap-2">
                  <button
                    id="btn-goto-gym-dashboard"
                    onClick={handleGoToDashboard}
                    className="w-full sm:flex-1 py-3.5 px-4 rounded-full bg-gradient-to-r from-[#ec4899] to-[#db2777] text-white font-black text-xs sm:text-sm shadow-md shadow-pink-500/25 flex items-center justify-center gap-2"
                  >
                    <span>Open Gym / Coach Dashboard</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => setShowRegisterModal(false)}
                    className="w-full sm:w-auto py-3.5 px-4 rounded-full text-xs font-bold text-[#6b555c] hover:bg-gray-100"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. CLUB DETAILS PREVIEW MODAL */}
      {selectedClubForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1f1619]/65 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-[#fce7f3] max-h-[90vh] overflow-y-auto p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl overflow-hidden bg-[#fff0f5] border border-[#fce7f3] shrink-0">
                  <img
                    src={selectedClubForModal.logo}
                    alt={selectedClubForModal.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <h3 className="text-lg font-black text-[#1f1619]">{selectedClubForModal.name}</h3>
                  <div className="flex items-center gap-1 text-xs text-[#db2777] font-semibold">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{selectedClubForModal.location}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedClubForModal(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#6b555c] leading-relaxed">
              {selectedClubForModal.description}
            </p>

            <div className="space-y-2 text-xs">
              <div className="p-3 rounded-2xl bg-[#fffdf0] border border-[#fef08a] space-y-1">
                <span className="text-[10px] font-black uppercase text-[#854d0e]">Leadership & Contact</span>
                <p className="font-bold text-[#1f1619]">{selectedClubForModal.ownerName} ({selectedClubForModal.adminRole})</p>
                <p className="text-[#6b555c]">Phone: {selectedClubForModal.phone} • Email: {selectedClubForModal.email}</p>
                {selectedClubForModal.address && (
                  <p className="text-[#6b555c]">Facility: {selectedClubForModal.address}</p>
                )}
              </div>

              {selectedClubForModal.facilities && selectedClubForModal.facilities.length > 0 && (
                <div>
                  <span className="font-bold text-[#1f1619] block mb-1">Equipment & Facilities:</span>
                  <div className="flex flex-wrap gap-1">
                    {selectedClubForModal.facilities.map((fac, idx) => (
                      <span key={idx} className="px-2.5 py-0.5 rounded-full bg-[#fff5f8] text-[#db2777] border border-[#fce7f3] text-[11px] font-medium">
                        ✓ {fac}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedClubForModal.programs && selectedClubForModal.programs.length > 0 && (
                <div>
                  <span className="font-bold text-[#1f1619] block mb-1">Training Programs:</span>
                  <div className="flex flex-wrap gap-1">
                    {selectedClubForModal.programs.map((prog, idx) => (
                      <span key={idx} className="px-2.5 py-0.5 rounded-full bg-[#fef9c3] text-[#854d0e] border border-[#fef08a] text-[11px] font-bold">
                        ★ {prog}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-[#fce7f3] flex items-center justify-between">
              <span className="text-[11px] font-mono text-[#6b555c]">
                Ref: {selectedClubForModal.paymentReference}
              </span>

              <button
                onClick={() => setSelectedClubForModal(null)}
                className="py-2 px-4 rounded-full bg-[#1f1619] text-white text-xs font-bold hover:bg-[#33222a]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
