import React, { useEffect, useState } from 'react';
import { useGym } from '../context/GymContext';
import { CURRICULUM_TIERS, matchingTutorial, skillsForLevel, tierForLevel } from '../lib/curriculum';
import { USAGLevel } from '../types';
import { OPTIONAL_LEVEL_NOTE, levelHasRequirements } from '../data/curriculumUpdates';
import { SkillStatusBadge } from '../components/SkillStatusBadge';
import { SkillSubmit } from '../components/SkillSubmit';

export const SkillsScreen: React.FC = () => {
  const { user, skills, pendingSkillId, openSkill } = useGym();
  const starting = tierForLevel(user.level);
  const [tierId, setTierId] = useState(starting.id);
  const [level, setLevel] = useState<USAGLevel>(user.level || starting.levels[0]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingSkillId) return;
    const skill = skills.find((item) => item.id === pendingSkillId);
    if (!skill) return;
    const tier = tierForLevel(skill.level);
    setTierId(tier.id);
    setLevel(skill.level);
    setSelectedId(skill.id);
    openSkill('');
  }, [pendingSkillId]);

  const tier = CURRICULUM_TIERS.find((item) => item.id === tierId) ?? CURRICULUM_TIERS[0];
  const levelSkills = skillsForLevel(skills, level);
  const selected = levelSkills.find((skill) => skill.id === selectedId) ?? null;
  const tutorial = selected ? matchingTutorial(selected) : null;

  const chooseTier = (nextTier: string) => {
    const found = CURRICULUM_TIERS.find((item) => item.id === nextTier) ?? CURRICULUM_TIERS[0];
    setTierId(found.id);
    setLevel(found.levels[0]);
    setSelectedId(null);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-8">
      <section className="space-y-4">
        <h1 className="font-display text-3xl text-[#3E1B4A]">Select Curriculum Tier & Level</h1>
        <p className="text-sm text-[#5C4A68] max-w-xl">
          Choose a tier, then a level, then one skill. The page shows that skill and its demonstration.
        </p>
        {!levelHasRequirements(level) && (
          <p className="text-sm text-[#3E1B4A] bg-[#F4EEF8] rounded-xl px-3 py-2 max-w-xl">Level {level}: {OPTIONAL_LEVEL_NOTE}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {CURRICULUM_TIERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => chooseTier(item.id)}
              className={`px-4 py-2 rounded-full text-sm ${tierId === item.id ? 'bg-[#5C2A6E] text-white' : 'bg-white border border-[#E4D7EE] text-[#241628]'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {tier.levels.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => { setLevel(item); setSelectedId(null); }}
              className={`px-4 py-2 rounded-full text-sm ${level === item ? 'bg-[#3E1B4A] text-white' : 'bg-white border border-[#E4D7EE]'}`}
            >
              Level {item}
            </button>
          ))}
        </div>
      </section>

      <section className="grid sm:grid-cols-[220px_1fr] gap-4">
        <div className="space-y-1">
          {levelSkills.length === 0 && <p className="text-sm text-[#5C4A68]">No skills are listed for this level yet.</p>}
          {levelSkills.map((skill) => (
            <button
              key={skill.id}
              type="button"
              onClick={() => setSelectedId(skill.id)}
              className={`flex w-full items-center justify-between gap-2 text-left px-3 py-2 rounded-xl text-sm ${selectedId === skill.id ? 'bg-[#F4EEF8] text-[#3E1B4A]' : 'text-[#241628]'}`}
            >
              <span>{skill.name}</span>
              <SkillStatusBadge status={skill.status} compact />
            </button>
          ))}
        </div>
        <div className="bg-white border border-[#E4D7EE] rounded-2xl p-4 min-h-48">
          {!selected && <p className="text-sm text-[#5C4A68]">Select a skill to watch how it is performed.</p>}
          {selected && (
            <div className="space-y-3">
              <h2 className="font-display text-2xl text-[#3E1B4A]">{selected.name}</h2>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-[#5C4A68]">{selected.category} · Level {selected.level}</p>
                <SkillStatusBadge status={selected.status} />
              </div>
              <p className="text-sm text-[#241628]">{selected.description}</p>
              {tutorial ? (
                <iframe
                  title={tutorial.title}
                  src={`https://www.youtube.com/embed/${tutorial.videoId}`}
                  className="w-full aspect-video rounded-xl"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <p className="rounded-xl bg-[#F4EEF8] px-4 py-6 text-sm text-[#3E1B4A]">
                  Demonstration unavailable for this skill.
                </p>
              )}
              {tutorial && <p className="text-sm text-[#5C4A68]">{tutorial.title}</p>}
              <SkillSubmit skill={selected} />
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
