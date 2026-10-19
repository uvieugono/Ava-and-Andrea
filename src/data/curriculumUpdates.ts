import { Skill } from '../types';

// Changes from the 17 October 2026 requirements brief, applied on top of the
// base curriculum. Only the skills named here change.

// Skills that are not part of their level, or repeat another skill.
export const REMOVED_SKILL_IDS = new Set([
  // Level 2: run and hurdle to flatback repeats the handstand flatback vault
  'gap_l2_vt_01',
  // Level 3: not Level 3 skills, or repeated text
  'gf_l3_vt_01', // front handspring vault
  'gap_slv_vt_02', // run and hurdle onto springboard
  'gap_slv_vt_01', // handstand flatback, repeated from Level 2
  // Level 4: repeated skills
  'gf_l4_plt_03', // round off backhandspring backhandspring (second copy)
  'gf_l4_plt_02', // straddle jump (second copy)
  'gf_l4_vt_01', // front handspring vault (second copy)
  'gap_gld_fx_01', // round off backhandspring back tuck (kept at Level 5)
  // Level 5
  'gf_l5_gld_05', // switch kick, repeats switch leap
  'gap_gld_vt_02', // half on vault entry is not a Level 5 skill
  // Level 6: repeats
  'gap_plt_fx_01', // back layout (second copy)
  'gap_plt_vt_01', // front handspring half off (second copy)
  // Level 8: not Level 8 skills
  'gap_l8_ub_01',
  'gap_l8_bb_01',
  'gap_l8_vt_01',
]);

// id -> new name, and the demonstration video for it.
export const SKILL_UPDATES: Record<string, { name?: string; videoId?: string }> = {
  gf_pre_fl_04: { videoId: 'otoDVplyg9w' },
  gf_l1_slv_03: { videoId: 'zrdHn1ALJFk' },
  gf_l1_slv_04: { videoId: '1NSjxa9gLAA' },

  gf_l2_slv_04: { name: 'Bridge with one leg raised up', videoId: 'WCk6YQDIzWU' },
  gf_l2_gld_01: { name: 'Handstand bridge stand up', videoId: 'hx-X_bgNpTc' },
  gf_l2_vt_01: { name: 'Handstand flatback vault', videoId: 'XUPTTA1tY6M' },

  gf_l3_slv_01: { videoId: 'NNk7dmywR2M' },
  gf_l3_slv_02: { name: 'Split jump', videoId: '-lbTZ5PaVA8' },
  gf_l3_slv_04: { name: 'Side split', videoId: 'rvpPFTjNwfw' },
  gf_l3_slv_06: { name: 'Roundoff', videoId: '4yN-RMSFDo0' },
  gf_l3_slv_03: { name: 'Bridge kickover', videoId: 'CG70TJR-qPE' },
  gf_l3_gld_01: { videoId: 'ZWUNWRfL6C8' },
  gf_l3_gld_02: { name: 'Back limber', videoId: 'YuQ9fDAAS30' },
  gf_l3_slv_07: { videoId: 'SVkdVng0Lhc' },

  gf_l4_slv_01: { videoId: 'dLbDyBambPc' },
  gf_l4_slv_05: { name: 'Split leap', videoId: 'ng0TU-tUEw0' },
  gf_l4_slv_07: { name: 'Sidesplit', videoId: 'vt_-vhofqJE' },
  gf_l4_slv_08: { videoId: 'MLE1tuwWzug' },
  gf_l4_gld_01: { name: 'Round off backhandspring backhandspring', videoId: 'SvpAii30qyQ' },
  gf_l4_slv_06: { videoId: 'kWyyAs3cwgY' },

  gf_l5_gld_01: { name: 'Aerial', videoId: 'LUF8tQR_Plo' },
  gf_l5_gld_04: { name: 'Full twist turn', videoId: 'MLE1tuwWzug' },
  gap_gld_fx_03: { name: 'Switch leap', videoId: 'Qd2-Rk5cSA4' },
  gf_l5_gld_08: { name: 'Roundoff backtuck', videoId: 'qRdCTQtZyrw' },
  gap_gld_fx_02: { name: 'Front tuck', videoId: 'D5_oF8PEZoo' },
  gf_l5_plt_01: { name: 'Front aerial', videoId: 'eVT6zOWptPg' },
  gf_l5_plt_03: { name: 'Round off backhandspring back tuck', videoId: 'qyHEKIXb7vM' },

  gf_l6_plt_01: { name: 'Back layout', videoId: 'Mm6eU9DSrqc' },
  gf_l6_plt_05: { name: 'Front handspring front tuck', videoId: 'hutxyLEJ9lg' },
  gf_l6_vt_01: { name: 'Front handspring half turn', videoId: 'i8a2uYEZ4Vo' },

  gf_l7_plt_01: { name: 'Front handspring front layout', videoId: 'LvCdgdb8I-E' },
  gf_l7_vt_01: { name: 'Front handspring full turn on vault', videoId: 'XS1K1OIRvpU' },
  gap_plt_fx_05: { name: 'Double turn on one foot', videoId: 'tGhvvLzRL8k' },

  gf_l8_vt_01: { name: 'Tsukahara', videoId: 'TzfWu23xjuQ' },
};

// Skills the brief lists that the base curriculum did not have as separate
// entries. `like` is a skill whose fields are copied.
export const ADDED_SKILLS: { id: string; like: string; level: number; name: string; videoId: string }[] = [
  { id: 'brief_l3_straight_jump', like: 'gf_l3_slv_02', level: 3, name: 'Straight jump', videoId: '1NSjxa9gLAA' },
  { id: 'brief_l3_back_handspring', like: 'gf_l3_gld_02', level: 3, name: 'Back handspring', videoId: '8cj3aL631m8' },
  { id: 'brief_l5_sidesplit', like: 'gf_l5_gld_06', level: 5, name: 'Sidesplit', videoId: 'vt_-vhofqJE' },
  { id: 'brief_l6_switch_leap', like: 'gf_l6_plt_03', level: 6, name: 'Switch leap', videoId: 'Qd2-Rk5cSA4' },
  { id: 'brief_l6_straddle_jump', like: 'gf_l6_plt_03', level: 6, name: 'Straddle jump', videoId: 'kWyyAs3cwgY' },
  { id: 'brief_l6_roundoff_vault', like: 'gf_l6_vt_01', level: 6, name: 'Roundoff on vault', videoId: 'Vz8EErzNd70' },
  { id: 'brief_l7_roundoff_vault', like: 'gf_l7_vt_01', level: 7, name: 'Roundoff vault', videoId: 'Vz8EErzNd70' },
  { id: 'brief_l7_half_twist', like: 'gf_l7_plt_01', level: 7, name: 'Half twist', videoId: 'dvp0qZGRdtQ' },
  { id: 'brief_l7_switch_leap', like: 'gf_l7_plt_01', level: 7, name: 'Switch leap', videoId: 'Qd2-Rk5cSA4' },
  { id: 'brief_l8_yurchenko', like: 'gf_l8_vt_01', level: 8, name: 'Yurchenko', videoId: 'HFoYgPUoZG4' },
];

// Levels with no standard requirements: nothing is compulsory, so these levels
// never advance a gymnast automatically.
export const OPTIONAL_LEVELS = [8, 9, 10];
export const OPTIONAL_LEVEL_NOTE = 'The routine is optional. There are no standard requirements.';

function tutorialFor(name: string, videoId: string) {
  return {
    videoId,
    title: `${name} demonstration`,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    channelName: 'GymTrack',
    youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
    embedUrl: `https://www.youtube.com/embed/${videoId}`,
  };
}

export function applyCurriculumUpdates(base: Skill[]): Skill[] {
  const kept = base.filter((skill) => !REMOVED_SKILL_IDS.has(skill.id));
  const byId = new Map(kept.map((skill) => [skill.id, skill]));
  const updated: Skill[] = kept.map((skill) => {
    const change = SKILL_UPDATES[skill.id];
    const name = change?.name ?? skill.name;
    return {
      ...skill,
      name,
      tutorial: change?.videoId ? tutorialFor(name, change.videoId) : skill.tutorial,
      tutorialStatus: change?.videoId ? 'FOUND' : skill.tutorialStatus,
      // No one starts with approved skills. Status comes from the club's approvals.
      status: 'NOT_COMPLETED',
      verifiedBy: undefined,
      verifiedNote: undefined,
      submittedVideoName: undefined,
      videoPreviewUrl: undefined,
    };
  });
  for (const add of ADDED_SKILLS) {
    const like = byId.get(add.like);
    if (!like) continue;
    updated.push({
      ...like,
      id: add.id,
      name: add.name,
      level: add.level as Skill['level'],
      description: `Level ${add.level}: ${add.name}.`,
      writtenTutorial: undefined,
      officialRef: undefined,
      tutorial: tutorialFor(add.name, add.videoId),
      tutorialStatus: 'FOUND',
      status: 'NOT_COMPLETED',
      verifiedBy: undefined,
      verifiedNote: undefined,
      submittedVideoName: undefined,
      videoPreviewUrl: undefined,
    });
  }
  return updated;
}

// A skill is compulsory unless its level has no standard requirements.
export function levelHasRequirements(level: number) {
  return !OPTIONAL_LEVELS.includes(level);
}
