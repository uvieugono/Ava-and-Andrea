import React, { useEffect, useState } from 'react';
import { useGym } from '../context/GymContext';
import { gymApi } from '../services/gymApi';
import { VERIFIED_CLUBS } from '../data/verifiedClubs';
import { PublicImage } from '../components/PublicImage';

type ClubCard = {
  id: string;
  name: string;
  city: string;
  logo?: string | null;
  image?: string | null;
  areas?: string | null;
  address?: string | null;
  phone?: string | null;
  coach?: string | null;
  links: { label: string; url: string }[];
};

const sameClub = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/gymnastics|club/g, '');
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((word) => word[0]?.toUpperCase() ?? '').join('');

const LISTED: ClubCard[] = VERIFIED_CLUBS.map((club) => ({
  ...club,
  links: [
    { label: 'Instagram', url: club.instagram },
    { label: 'Facebook', url: club.facebook },
    { label: 'TikTok', url: club.tiktok },
    { label: 'YouTube', url: club.youtube },
  ].filter((link): link is { label: string; url: string } => Boolean(link.url)),
}));

export const ClubsScreen: React.FC = () => {
  const { isStaff, logoutUser } = useGym();
  const [searchQuery, setSearchQuery] = useState('');
  const [cityFilter, setCityFilter] = useState('All');
  const [approved, setApproved] = useState<ClubCard[]>([]);
  const [askingToRegister, setAskingToRegister] = useState(false);

  // Clubs GymTrack has approved show here too, unless the page already lists them in full.
  useEffect(() => {
    gymApi
      .registeredClubs()
      .then((result) => setApproved(result.clubs
        .filter((club) => !LISTED.some((item) => sameClub(item.name) === sameClub(club.name)))
        .map((club) => ({ id: club.id, name: club.name, city: club.city, links: [] }))))
      .catch(() => setApproved([]));
  }, []);

  const clubs = [...LISTED, ...approved];
  const cities = ['All', ...Array.from(new Set(clubs.map((club) => club.city)))];
  const q = searchQuery.trim().toLowerCase();
  const shown = clubs
    .filter((club) => cityFilter === 'All' || club.city === cityFilter)
    .filter((club) => !q || `${club.name} ${club.city} ${club.areas ?? ''} ${club.address ?? ''} ${club.coach ?? ''}`.toLowerCase().includes(q));

  return (
    <div className="flex flex-col w-full max-w-4xl mx-auto px-4 sm:px-6 space-y-6 pt-2 pb-16">
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl text-[#3E1B4A]">Find a Club</h1>
            <p className="text-sm text-[#5C4A68] mt-1">Gymnastics clubs near you.</p>
          </div>
          {!isStaff && (
            <button type="button" onClick={() => setAskingToRegister((value) => !value)} className="px-4 py-2 rounded-full bg-[#5C2A6E] text-white text-sm">Register your club</button>
          )}
        </div>
        {askingToRegister && (
          <div className="bg-white border border-[#E4D7EE] rounded-2xl p-4 space-y-2 text-sm">
            <p>A club has its own account. Log out, then choose <strong>Register a club</strong>. GymTrack checks each new club before gymnasts can choose it, and your seven free days start when it is approved.</p>
            <button type="button" onClick={logoutUser} className="px-4 py-2 rounded-full border border-[#5C2A6E] text-[#5C2A6E]">Log out and register a club</button>
          </div>
        )}
        {cities.length > 2 && (
          <div className="flex flex-wrap gap-2">
            {cities.map((city) => (
              <button key={city} type="button" onClick={() => setCityFilter(city)} className={`px-3 py-1 rounded-full text-sm ${cityFilter === city ? 'bg-[#5C2A6E] text-white' : 'bg-white border border-[#E4D7EE]'}`}>{city}</button>
            ))}
          </div>
        )}
        <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search by name, area or city" aria-label="Search clubs" className="w-full rounded-xl border border-[#E4D7EE] px-3 py-2 text-sm" />
        {shown.length === 0 && <p className="text-sm text-[#5C4A68] bg-white border border-[#E4D7EE] rounded-2xl p-4">No clubs match that search.</p>}
        <div className="space-y-3">
          {shown.map((club) => (
            <article key={club.id} className="bg-white border border-[#E4D7EE] rounded-2xl overflow-hidden">
              {club.image && (
                <PublicImage base={club.image} alt={club.name} className="w-full h-48 object-cover" fallback={null} />
              )}
              <div className="p-4 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 shrink-0 rounded-xl bg-[#F4EEF8] flex items-center justify-center font-display text-lg text-[#5C2A6E]" aria-hidden="true">
                    {club.logo ? <img src={club.logo} alt="" className="w-full h-full object-cover rounded-xl" /> : initials(club.name)}
                  </div>
                  <div>
                    <h2 className="font-display text-xl text-[#3E1B4A]">{club.name}</h2>
                    <p className="text-sm text-[#5C4A68]">{club.city}</p>
                  </div>
                </div>
                {club.areas && <p className="text-sm">Areas: {club.areas}</p>}
                {club.address && <p className="text-sm">{club.address}</p>}
                {club.phone && (
                  <p className="text-sm">
                    {club.phone.split(',').map((number, index) => (
                      <React.Fragment key={number}>
                        {index > 0 && ', '}
                        <a className="text-[#5C2A6E]" href={`tel:${number.replace(/\s/g, '')}`}>{number.trim()}</a>
                      </React.Fragment>
                    ))}
                  </p>
                )}
                {club.coach && <p className="text-sm">Coach: {club.coach}</p>}
                {club.links.length > 0 && (
                  <div className="flex flex-wrap gap-3 text-sm">
                    {club.links.map((link) => <a key={link.label} className="text-[#5C2A6E]" href={link.url} target="_blank" rel="noreferrer">{link.label}</a>)}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};
