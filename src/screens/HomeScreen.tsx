import React, { useState } from 'react';
import { useGym } from '../context/GymContext';
import { WorkoutModal } from '../components/WorkoutModal';
import { Workout } from '../types';
import { matchingTutorial, requiredSkillsFor, submissionLabel, weeklyDrills, youtubeId } from '../lib/curriculum';
import { OPTIONAL_LEVEL_NOTE, levelHasRequirements } from '../data/curriculumUpdates';
import { ContactForm } from '../components/ContactForm';

export const HomeScreen: React.FC = () => {
  const { user, skills, setCurrentTab, notices } = useGym();
  const [activeWorkout, setActiveWorkout] = useState<Workout | null>(null);
  const required = requiredSkillsFor(skills, user.level, user.offersBars !== false, user.offersBeam !== false);
  const noRequirements = !levelHasRequirements(user.level);
  const mastered = required.filter((skill) => skill.status === 'VERIFIED');
  const learning = required.filter((skill) => skill.status !== 'VERIFIED').slice(0, 4);
  const { week, drills } = weeklyDrills();

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-10">
      <section className="flex items-center gap-4">
        <img src={user.avatar} alt="" className="w-16 h-16 rounded-full object-cover" />
        <div>
          <h1 className="font-display text-3xl text-[#3E1B4A]">{user.fullName}</h1>
          <p className="text-[#5C4A68]">{user.clubName || 'No club selected yet'}</p>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-display text-2xl text-[#3E1B4A]">My Progress</h2>
          <button type="button" onClick={() => setCurrentTab('progress')} className="text-sm text-[#5C2A6E]">Open My Progress</button>
        </div>
        {noRequirements && <p className="text-sm text-[#5C4A68]">Level {user.level}: {OPTIONAL_LEVEL_NOTE}</p>}
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setCurrentTab('progress')} className="text-left bg-white border border-[#E4D7EE] rounded-2xl p-4">
            <p className="text-sm text-[#5C4A68]">Mastered this level</p>
            <p className="font-display text-3xl text-[#3E1B4A]">{mastered.length}</p>
          </button>
          <button type="button" onClick={() => setCurrentTab('progress')} className="text-left bg-white border border-[#E4D7EE] rounded-2xl p-4">
            <p className="text-sm text-[#5C4A68]">Still to finish</p>
            <p className="font-display text-3xl text-[#3E1B4A]">{required.length - mastered.length}</p>
          </button>
        </div>
      </section>

      <section
        role="link"
        tabIndex={0}
        aria-label="Continue Learning. Open My Progress"
        onClick={() => setCurrentTab('progress')}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setCurrentTab('progress'); } }}
        className="space-y-3 cursor-pointer rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#5C2A6E]"
      >
        <h2 className="font-display text-2xl text-[#3E1B4A]">Continue Learning</h2>
        {learning.length === 0 ? (
          <p className="text-sm text-[#5C4A68]">{noRequirements ? OPTIONAL_LEVEL_NOTE : 'Every required skill at this level is approved.'}</p>
        ) : (
          <div className="space-y-2">
            {learning.map((skill) => {
              const tutorial = matchingTutorial(skill);
              return (
                <div
                  key={skill.id}
                  className="w-full text-left bg-white border border-[#E4D7EE] rounded-2xl p-4 flex items-center justify-between gap-3"
                >
                  <span>
                    <span className="block text-[#241628]">{skill.name}</span>
                    <span className="text-sm text-[#5C4A68]">{tutorial ? 'Watch the demonstration' : 'Demonstration unavailable'} · {submissionLabel(skill.status)}</span>
                  </span>
                  <span className="text-sm text-[#5C2A6E] shrink-0">My Progress</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-display text-2xl text-[#3E1B4A]">Today&apos;s Conditioning & Drills</h2>
          <p className="text-sm text-[#5C4A68]">Week {week}. These clips change with the week.</p>
        </div>
        <div className="space-y-4">
          {drills.map((drill) => {
            const id = youtubeId(drill.videoUrl);
            return (
              <article key={drill.id} className="bg-white border border-[#E4D7EE] rounded-2xl overflow-hidden">
                {id ? (
                  <iframe
                    title={drill.title}
                    src={`https://www.youtube.com/embed/${id}`}
                    className="w-full aspect-video"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <p className="p-4 text-sm">Demonstration unavailable.</p>
                )}
                <div className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-[#241628]">{drill.title}</h3>
                    <p className="text-sm text-[#5C4A68]">{drill.durationMin} min</p>
                  </div>
                  <button type="button" onClick={() => setActiveWorkout(drill)} className="px-4 py-2 rounded-full bg-[#5C2A6E] text-white text-sm">
                    Start
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {notices.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display text-2xl text-[#3E1B4A]">Training notice board</h2>
          {notices.slice(0, 3).map((notice) => (
            <article key={notice.id} className="bg-white border border-[#E4D7EE] rounded-2xl p-4">
              <h3 className="text-[#241628]">{notice.title}</h3>
              <p className="text-sm text-[#5C4A68] mt-1">{notice.body}</p>
            </article>
          ))}
        </section>
      )}

      <section className="space-y-3" id="contact-us">
        <div>
          <h2 className="font-display text-2xl text-[#3E1B4A]">Contact Us</h2>
          <p className="text-sm text-[#5C4A68]">Send us a message and we will reply.</p>
        </div>
        <ContactForm />
      </section>

      {activeWorkout && <WorkoutModal workout={activeWorkout} onClose={() => setActiveWorkout(null)} />}
    </div>
  );
};
