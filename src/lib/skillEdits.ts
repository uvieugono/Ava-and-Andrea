import { ApparatusCategory, Skill, USAGLevel } from '../types';

/** What an administrator changed about the built-in skills. The app and the server both apply it. */
export interface SkillPatch {
  name?: string;
  level?: number;
  category?: string;
  description?: string;
  optional?: boolean;
  /** YouTube video id. null means no demonstration. */
  videoId?: string | null;
  position?: number;
}

export interface SkillEdits {
  added: (SkillPatch & { id: string; name: string; level: number; category: string })[];
  changed: Record<string, SkillPatch>;
  removed: string[];
}

export function emptySkillEdits(): SkillEdits {
  return { added: [], changed: {}, removed: [] };
}

export function youtubeVideoId(link: string) {
  const match = link.trim().match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/))([\w-]{11})/);
  return match?.[1] ?? null;
}

function withPatch(skill: Skill, patch: SkillPatch): Skill {
  const next: Skill = { ...skill };
  if (patch.name !== undefined) next.name = patch.name;
  if (patch.level !== undefined) next.level = patch.level as USAGLevel;
  if (patch.category !== undefined) next.category = patch.category as ApparatusCategory;
  if (patch.description !== undefined) next.description = patch.description;
  if (patch.optional !== undefined) next.optional = patch.optional;
  if (patch.videoId !== undefined) {
    next.videoChosen = true;
    next.tutorial = patch.videoId
      ? {
          videoId: patch.videoId,
          title: next.name,
          thumbnail: `https://i.ytimg.com/vi/${patch.videoId}/hqdefault.jpg`,
          channelName: '',
          youtubeUrl: `https://www.youtube.com/watch?v=${patch.videoId}`,
          embedUrl: `https://www.youtube.com/embed/${patch.videoId}`,
        }
      : null;
    next.tutorialStatus = patch.videoId ? 'FOUND' : 'NOT_FOUND';
  }
  return next;
}

export function applySkillEdits(base: Skill[], edits: SkillEdits | null | undefined): Skill[] {
  if (!edits) return base;
  const removed = new Set(edits.removed);
  const positions = new Map<string, number>();
  const kept = base.filter((skill) => !removed.has(skill.id)).map((skill) => {
    const patch = edits.changed[skill.id];
    if (patch?.position !== undefined) positions.set(skill.id, patch.position);
    return patch ? withPatch(skill, patch) : skill;
  });
  const added = edits.added.filter((skill) => !removed.has(skill.id)).map((skill) => {
    if (skill.position !== undefined) positions.set(skill.id, skill.position);
    return withPatch({
      id: skill.id,
      name: skill.name,
      level: skill.level as USAGLevel,
      category: skill.category as ApparatusCategory,
      description: skill.description ?? '',
      xpReward: 0,
      status: 'NOT_COMPLETED',
    }, skill);
  });
  const all = [...kept, ...added];
  if (positions.size === 0) return all;
  // A level that has been put in order keeps that order. A skill added since goes last.
  const order = (skill: Skill) => positions.get(skill.id) ?? Number.MAX_SAFE_INTEGER;
  return all.map((skill, index) => ({ skill, index })).sort((a, b) => order(a.skill) - order(b.skill) || a.index - b.index).map((item) => item.skill);
}
