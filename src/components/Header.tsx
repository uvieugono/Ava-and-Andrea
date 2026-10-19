import React, { useState } from 'react';
import { useGym } from '../context/GymContext';
import { Menu, X } from 'lucide-react';
import { NavigationTab } from '../types';
import { Logo } from './Logo';

const NAV: { id: NavigationTab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'skills', label: 'Skills' },
  { id: 'progress', label: 'My Progress' },
  { id: 'community', label: 'Connect' },
  { id: 'dashboard', label: 'Club Dashboard' },
  { id: 'events', label: 'Events' },
  { id: 'clubs', label: 'Find a Club' },
  { id: 'contact', label: 'Contact Us' },
];

function isActive(current: NavigationTab, id: NavigationTab) {
  if (current === id) return true;
  if (id === 'events' && current === 'competitions') return true;
  return false;
}

export const Header: React.FC = () => {
  const { user, currentTab, setCurrentTab, isStaff } = useGym();
  // The Club Dashboard is only for signed-in club accounts.
  const items = NAV.filter((item) => item.id !== 'dashboard' || isStaff);
  const [open, setOpen] = useState(false);

  const go = (tab: NavigationTab) => {
    setCurrentTab(tab);
    setOpen(false);
  };

  return (
    <header className="fixed top-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-b border-[#E4D7EE]">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-4">
        <button type="button" onClick={() => go('home')} className="shrink-0" aria-label="GymTrack home">
          <Logo />
        </button>
        <nav className="hidden lg:flex items-center gap-1 flex-1">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => go(item.id)}
              className={`px-3 py-1.5 rounded-full text-sm ${
                isActive(currentTab, item.id) ? 'bg-[#5C2A6E] text-white' : 'text-[#5C4A68] hover:bg-[#F4EEF8]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => go('profile')}
          className="ml-auto flex items-center gap-2 min-h-11"
          aria-label={`Profile for ${user.fullName}`}
        >
          <img src={user.avatar} alt="" className="w-9 h-9 rounded-full object-cover" />
          <span className="hidden sm:block text-sm text-[#241628] max-w-[8rem] truncate">{user.fullName}</span>
        </button>
        <button type="button" className="lg:hidden p-2" aria-label="Open menu" onClick={() => setOpen(true)}>
          <Menu className="w-6 h-6" />
        </button>
      </div>
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 bg-[#241628]/40" onClick={() => setOpen(false)}>
          <div className="bg-white h-full w-72 p-5 space-y-2" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <Logo />
              <button type="button" aria-label="Close menu" onClick={() => setOpen(false)}><X /></button>
            </div>
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.id)}
                className={`block w-full text-left px-3 py-3 rounded-xl text-sm ${
                  isActive(currentTab, item.id) ? 'bg-[#5C2A6E] text-white' : 'text-[#241628]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </header>
  );
};
