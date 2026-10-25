import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGym } from '../context/GymContext';
import { ChevronDown, LogOut, Menu, X } from 'lucide-react';
import { NavigationTab } from '../types';
import { Logo } from './Logo';
import { Avatar } from './Avatar';

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

const GYMNAST_ONLY: NavigationTab[] = ['home', 'skills', 'progress'];

function isActive(current: NavigationTab, id: NavigationTab) {
  if (current === id) return true;
  if (id === 'events' && current === 'competitions') return true;
  return false;
}

export const Header: React.FC = () => {
  const { user, currentTab, setCurrentTab, isStaff, isOperator, logoutUser } = useGym();
  // The Club Dashboard is only for signed-in club accounts. Clubs do not see the gymnast pages.
  const items = NAV.filter((item) => (isStaff ? !GYMNAST_ONLY.includes(item.id) : item.id !== 'dashboard'));
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // The menu under the profile photo closes on a click elsewhere or Escape.
  useEffect(() => {
    if (!profileOpen) return;
    const onClick = (event: MouseEvent) => {
      if (!profileRef.current?.contains(event.target as Node)) setProfileOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [profileOpen]);

  const go = (tab: NavigationTab) => {
    setCurrentTab(tab);
    setOpen(false);
    setProfileOpen(false);
  };

  // Everything reachable from the profile page, plus the main pages for this account.
  const profileMenu: { id: NavigationTab; label: string; anchor?: string; edit?: boolean }[] = [
    { id: 'profile', label: 'My Profile' },
    { id: 'profile', label: 'Edit Profile', edit: true },
    ...(isStaff
      ? [{ id: 'dashboard' as NavigationTab, label: 'Club Dashboard' }]
      : [
          { id: 'profile' as NavigationTab, label: 'My Videos', anchor: 'profile-videos' },
          { id: 'profile' as NavigationTab, label: 'My Drills', anchor: 'profile-drills' },
          { id: 'profile' as NavigationTab, label: 'My Certificates', anchor: 'profile-certificates' },
          { id: 'profile' as NavigationTab, label: 'Competition History', anchor: 'profile-competitions' },
          { id: 'progress' as NavigationTab, label: 'My Progress' },
        ]),
    { id: 'profile', label: 'Club Noticeboard', anchor: 'profile-notices' },
    { id: 'clubs', label: 'Find a Club' },
    ...(isOperator ? [{ id: 'operator' as NavigationTab, label: 'Club subscriptions' }] : []),
  ];

  const openItem = (item: (typeof profileMenu)[number]) => {
    go(item.id);
    // Wait for the page to draw, then jump to the section or open the edit form.
    window.setTimeout(() => {
      if (item.edit) window.dispatchEvent(new Event('gymtrack:edit-profile'));
      if (item.anchor) document.getElementById(item.anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      else window.scrollTo({ top: 0 });
    }, 120);
  };

  const logOut = () => {
    setProfileOpen(false);
    setOpen(false);
    // Ends the session; the sign in / register page shows next.
    logoutUser();
  };

  return (
    <header className="fixed top-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-b border-[#E4D7EE]">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-4">
        <button type="button" onClick={() => go(isStaff ? 'dashboard' : 'home')} className="shrink-0" aria-label="GymTrack home">
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
        <div ref={profileRef} className="ml-auto relative">
          <button
            type="button"
            onClick={() => setProfileOpen((value) => !value)}
            className="flex items-center gap-2 min-h-11"
            aria-label={`Profile menu for ${user.fullName}`}
            aria-haspopup="menu"
            aria-expanded={profileOpen}
          >
            <Avatar src={user.avatar} name={user.fullName} className="w-9 h-9 rounded-full text-xs" />
            <span className="hidden sm:block text-sm text-[#241628] max-w-[8rem] truncate">{user.fullName}</span>
            <ChevronDown className={`w-4 h-4 text-[#5C4A68] transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
          </button>
          {profileOpen && (
            <div role="menu" aria-label="Profile" className="absolute right-0 top-full mt-2 w-60 bg-white border border-[#E4D7EE] rounded-2xl shadow-lg p-2 z-50">
              {profileMenu.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={() => openItem(item)}
                  className="block w-full text-left px-3 py-2.5 rounded-xl text-sm text-[#241628] hover:bg-[#F4EEF8]"
                >
                  {item.label}
                </button>
              ))}
              <button
                type="button"
                role="menuitem"
                onClick={logOut}
                className="mt-1 flex w-full items-center gap-2 px-3 py-3 rounded-xl text-sm font-semibold text-white bg-[#5C2A6E] hover:bg-[#3E1B4A]"
              >
                <LogOut className="w-4 h-4" />
                Log Out
              </button>
            </div>
          )}
        </div>
        <button type="button" className="lg:hidden p-2" aria-label="Open menu" onClick={() => setOpen(true)}>
          <Menu className="w-6 h-6" />
        </button>
      </div>
      {/* Rendered on <body>: inside the blurred header a fixed panel is only as tall as the header. */}
      {open && createPortal(
        <div className="lg:hidden fixed inset-0 z-50 bg-[#241628]/40" onClick={() => setOpen(false)}>
          <div className="bg-white h-full w-72 p-5 space-y-2 overflow-y-auto" onClick={(event) => event.stopPropagation()}>
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
      , document.body)}
    </header>
  );
};
