import React from 'react';
import { Play } from 'lucide-react';
import { useGym } from '../context/GymContext';
import { matchingTutorial, requiredSkillsFor, submissionLabel } from '../lib/curriculum';
import { OPTIONAL_LEVEL_NOTE, levelHasRequirements } from '../data/curriculumUpdates';
import { ContactForm } from '../components/ContactForm';

// Today's conditioning exercises, from the 20 October 2026 brief.
const CONDITIONING = [
  { id: 'UwZ3IlK43PA', title: 'Strength' },
  { id: 'nJ_uNf7Nkes', title: 'Flexibility' },
];

export const HomeScreen: React.FC = () => {
  const { user, skills, setCurrentTab, notices } = useGym();
  const required = requiredSkillsFor(skills, user.level, user.offersBars !== false, user.offersBeam !== false);
  const noRequirements = !levelHasRequirements(user.level);
  const mastered = required.filter((skill) => skill.status === 'VERIFIED');
  const learning = required.filter((skill) => skill.status !== 'VERIFIED').slice(0, 4);

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
        <h2 className="font-display text-2xl text-[#3E1B4A]">Today&apos;s conditioning exercises</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {CONDITIONING.map((item) => (
            <a
              key={item.id}
              href={`https://www.youtube.com/watch?v=${item.id}`}
              target="_blank"
              rel="noreferrer"
              className="block bg-white border border-[#E4D7EE] rounded-2xl overflow-hidden"
              aria-label={`Play the ${item.title} exercise on YouTube`}
            >
              <span className="relative block">
                <img src={`https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`} alt="" className="w-full aspect-video object-cover" />
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="w-14 h-14 rounded-full bg-[#5C2A6E]/90 text-white flex items-center justify-center">
                    <Play className="w-6 h-6 fill-current" />
                  </span>
                </span>
              </span>
              <span className="block p-4 text-[#241628]">{item.title}</span>
            </a>
          ))}
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

    </div>
  );
};
