import { Skill, SkillStatus, USAGLevel } from '../types';
import { WORKOUTS } from '../data/gymData';
import { levelHasRequirements } from '../data/curriculumUpdates';

export const CURRICULUM_TIERS: { id: string; label: string; levels: USAGLevel[] }[] = [
  { id: 'BRONZE', label: 'Bronze', levels: [1, 2] },
  { id: 'SILVER', label: 'Silver', levels: [3] },
  { id: 'GOLD', label: 'Gold', levels: [4, 5] },
  { id: 'PLATINUM', label: 'Platinum', levels: [6, 7] },
  { id: 'DIAMOND', label: 'Diamond', levels: [8, 9, 10] },
];

const STOP_WORDS = new Set([
  'with', 'from', 'into', 'onto', 'your', 'this', 'that', 'then', 'hold', 'spot',
  'level', 'seconds', 'skill', 'gymnastics', 'tutorial', 'routine', 'onto',
]);

export function tierForLevel(level: number) {
  return CURRICULUM_TIERS.find((tier) => tier.levels.includes(level as USAGLevel)) ?? CURRICULUM_TIERS[0];
}

export function skillsForLevel(skills: Skill[], level: number) {
  return skills.filter((skill) => skill.level === level);
}

export function skillIsRequired(skill: Skill, offersBars: boolean, offersBeam: boolean) {
  if (skill.category === 'BARS' && !offersBars) return false;
  if (skill.category === 'BEAM' && !offersBeam) return false;
  return true;
}

/** The skills a gymnast has to finish at a level. Levels with no standard requirements have none. */
export function requiredSkillsFor(skills: Skill[], level: number, offersBars: boolean, offersBeam: boolean) {
  if (!levelHasRequirements(level)) return [];
  return skills.filter((skill) => skill.level === level && skillIsRequired(skill, offersBars, offersBeam));
}

export function matchingTutorial(skill: Skill) {
  const tutorial = skill.tutorial;
  if (!tutorial?.videoId || !tutorial.title) return null;
  const title = tutorial.title.toLowerCase();
  const words = skill.name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word));
  if (words.length === 0) return null;
  const hits = words.filter((word) => title.includes(word));
  const needed = words.length === 1 ? 1 : Math.min(2, words.length);
  return hits.length >= needed ? tutorial : null;
}

export function submissionLabel(status: SkillStatus) {
  if (status === 'VERIFIED') return 'Approved';
  if (status === 'AWAITING_VERIFICATION') return 'Awaiting approval';
  if (status === 'CHANGES_REQUIRED') return 'Changes required';
  return 'Not submitted';
}

export function isoWeek(date: Date) {
  const copy = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
  return Math.ceil(((copy.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function youtubeId(url: string) {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/);
  return match?.[1] ?? '';
}

export function weeklyDrills(date = new Date()) {
  const week = isoWeek(date);
  const sets = [
    [WORKOUTS[0], WORKOUTS[1]],
    [WORKOUTS[2], WORKOUTS[3]],
  ];
  return {
    week,
    drills: sets[week % sets.length].filter((drill) => drill && youtubeId(drill.videoUrl)),
  };
}
