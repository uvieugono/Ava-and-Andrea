import React, { useEffect, useState } from 'react';
import { GymProvider, useGym } from './context/GymContext';
import { Header } from './components/Header';
import { XpToast } from './components/XpToast';
import { CelebrationModal } from './components/CelebrationModal';
import { Logo } from './components/Logo';
import { HomeScreen } from './screens/HomeScreen';
import { SkillsScreen } from './screens/SkillsScreen';
import { ProgressScreen } from './screens/ProgressScreen';
import { EventsScreen } from './screens/EventsScreen';
import { ShopScreen } from './screens/ShopScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { AuthScreen } from './screens/AuthScreen';
import { InspoScreen } from './screens/InspoScreen';
import { ContactScreen } from './screens/ContactScreen';
import { AddStudentsPanel } from './components/AddStudentsPanel';
import { PaymentRequired } from './components/PaymentRequired';
import { readAccess } from './services/gymApi';
import { ClubsScreen } from './screens/ClubsScreen';
import { GymDashboardScreen } from './screens/GymDashboardScreen';

const MainApp: React.FC = () => {
  const { user, ready, currentTab, userRole, isStaff, logoutUser } = useGym();
  const [paidOpen, setPaidOpen] = useState(false);

  useEffect(() => {
    setPaidOpen(false);
  }, [user.email, user.isLoggedIn]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#F7F4FB] flex flex-col items-center justify-center gap-3">
        <Logo size="lg" />
        <p className="text-sm text-[#5C4A68]">Loading…</p>
      </div>
    );
  }

  if (!user.isLoggedIn) return <AuthScreen />;

  const access = readAccess();
  const needsPayment = !paidOpen && (access.status === 'locked' || access.status === 'pending_payment');
  const clubTrialLabel = access.until
    ? new Date(access.until).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
    : null;

  return (
    <div className="min-h-screen bg-[#F7F4FB] text-[#241628] flex flex-col">
      {/* Top Floating App Bar */}
      <Header />

      {/* Main Content Area with Header and Bottom Nav Offset */}
      <main className="flex-1 pt-16 pb-10">
        {needsPayment && currentTab !== 'profile' ? (
          <PaymentRequired onUnlock={() => setPaidOpen(true)} onLogout={logoutUser} />
        ) : (
          <>
            {currentTab === 'home' && <HomeScreen />}
            {currentTab === 'skills' && <SkillsScreen />}
            {currentTab === 'progress' && <ProgressScreen />}
            {(currentTab === 'competitions' || currentTab === 'events') && <EventsScreen />}
            {currentTab === 'clubs' && <ClubsScreen />}
            {currentTab === 'contact' && <ContactScreen />}
            {currentTab === 'dashboard' && isStaff && (
              <>
                {userRole === 'CLUB_ADMIN' && access.status === 'trial' && clubTrialLabel && (
                  <p className="max-w-3xl mx-auto px-4 mb-3 text-sm text-[#6b555c]">Your club can use every part of GymTrack until {clubTrialLabel}. Payment starts after this free week.</p>
                )}
                {userRole === 'CLUB_ADMIN' && <AddStudentsPanel />}
                <GymDashboardScreen />
              </>
            )}
            {currentTab === 'community' && <InspoScreen />}
            {currentTab === 'shop' && <ShopScreen />}
            {currentTab === 'profile' && <ProfileScreen />}
          </>
        )}
      </main>

      {/* Floating XP Reward Notification Toast */}
      <XpToast />

      {/* Achievement Unlocked Celebratory Modal */}
      <CelebrationModal />
    </div>
  );
};

export default function App() {
  return (
    <GymProvider>
      <MainApp />
    </GymProvider>
  );
}
