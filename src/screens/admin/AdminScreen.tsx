import React, { useState } from 'react';
import { useGym } from '../../context/GymContext';
import { DashboardTab } from './DashboardTab';
import { UsersTab } from './UsersTab';
import { ClubsTab } from './ClubsTab';
import { ModerationTab } from './ModerationTab';
import { SkillsTab } from './SkillsTab';
import { EventsTab } from './EventsTab';
import { CommunicationTab } from './CommunicationTab';
import { ReportsTab } from './ReportsTab';
import { PaymentsTab } from './PaymentsTab';
import { SettingsTab } from './SettingsTab';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', view: DashboardTab },
  { id: 'users', label: 'Users', view: UsersTab },
  { id: 'clubs', label: 'Clubs', view: ClubsTab },
  { id: 'moderation', label: 'Moderation', view: ModerationTab },
  { id: 'skills', label: 'Skills', view: SkillsTab },
  { id: 'events', label: 'Events', view: EventsTab },
  { id: 'communication', label: 'Communication', view: CommunicationTab },
  { id: 'reports', label: 'Reports', view: ReportsTab },
  { id: 'payments', label: 'Payments', view: PaymentsTab },
  { id: 'settings', label: 'Settings', view: SettingsTab },
] as const;

/** Everything GymTrack's own administrators do. Each person sees the areas they were given. */
export const AdminScreen: React.FC = () => {
  const { adminPermissions, adminOwner } = useGym();
  const tabs = TABS.filter((tab) => tab.id === 'dashboard' || adminPermissions.includes(tab.id));
  const [current, setCurrent] = useState<string>('dashboard');
  const active = tabs.find((tab) => tab.id === current) ?? tabs[0];
  const View = active.view;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <header>
        <h1 className="font-display text-3xl text-[#3E1B4A]">GymTrack Admin</h1>
        {!adminOwner && <p className="text-sm text-[#5C4A68] mt-1">You see the areas you were given. An owner can change them.</p>}
      </header>
      <nav aria-label="Admin areas" className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-current={tab.id === active.id ? 'page' : undefined}
            onClick={() => setCurrent(tab.id)}
            className={`px-3 py-1.5 rounded-full text-sm border ${tab.id === active.id ? 'bg-[#5C2A6E] border-[#5C2A6E] text-white' : 'bg-white border-[#E4D7EE] text-[#3E1B4A]'}`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <View key={active.id} />
    </div>
  );
};
