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
  // Levels 9 and 10: replaced by the skills in the 20 October 2026 brief
  'gap_dia_ub_01',
  'gap_dia_bb_01',
  'gap_dia_vt_01',
  'gap_dia_fx_01',
  'gap_l10_ub_01',
  'gap_l10_bb_01',
  'gap_l10_vt_01',
  'gap_l10_fx_01',
]);

// id -> new name, and the demonstration video for it.
// videoId null removes the demonstration, so the page says it is unavailable.
export const SKILL_UPDATES: Record<string, { name?: string; videoId?: string | null }> = {
  gf_pre_fl_04: { videoId: 'otoDVplyg9w' },
  gf_l1_slv_03: { videoId: 'zrdHn1ALJFk' },
  gf_l1_slv_04: { videoId: '1NSjxa9gLAA' },
  // 20 October 2026 brief: the two Level 1 skills that showed "demonstration unavailable"
  gap_l1_ub_01: { videoId: 'SBYwvNCRP0g' },
  gap_l1_bb_02: { videoId: 'zPDHpxPTuH4' },

  // Replaces video ids that do not exist on YouTube (checked with oEmbed, 23 October 2026).
  gap_l1_bb_01: { videoId: 'h9Eweq7N7U0' }, // front support mount (blue beam).mov
  gap_l1_ub_02: { videoId: 'Vg38GDOdt18' }, // INVERTED CANDLESTICK DRILL for bars! #gymnasticscoach #gymnast #gymnas
  gap_l1_vt_01: { videoId: 'XUPTTA1tY6M' }, // Gymnastics Handstand Flatback Vault Tutorial| Kyra SGG
  gap_l2_bb_01: { videoId: 'kSzkbty-zww' }, // Gymnastics Handstand On Beam Tutorial| Kyra SGG
  gap_l2_ub_01: { videoId: 'og1v6Ojaoz4' }, // HOW TO LEARN TO DO A PULL OVER ON BARS - PULLOVER TUTORIAL - Gymnastic
  gap_l2_ub_02: { videoId: '5oqw_fdqlKg' }, // How to do a Cast on Bars in Gymnastics
  gap_l2_ub_03: { videoId: '9SLhK3u5FUE' }, // Beginner Gymnastics Back Hip Circle Tutorial
  gap_slv_bb_02: { videoId: 'Tqa5MhkG0t4' }, // How to do a handstand on gymnastics beam
  gap_slv_bb_03: { videoId: 'PM3E566pB6E' }, // How to Do a Cartwheel on Beam (Beginner Tutorial)
  gap_slv_bb_04: { videoId: 'lAbbuBjkahc' }, // Banded Beam Split Jumps
  gap_slv_bb_05: { videoId: 'qDgMWxb_U_k' }, // Level 2/3 Gymnastics Half Turn & Snap Turn Tips With Coach Meggin!
  gap_slv_bb_06: { videoId: 'tl-XLz2FOS4' }, // Roundoff dismount drills for beam
  gap_slv_fx_04: { videoId: 'vwWu0Afs_Nk' }, // #GymnasticsHowTo: Perfect Your Split Leap
  gap_slv_ub_01: { videoId: 'RDjaQfAEdzU' }, // Teaching Glide Swings to Level 2 Gymnasts
  gap_slv_ub_03: { videoId: 'SBYwvNCRP0g' }, // Beginner Gymnastics Cast Tutorial on Bars
  gap_slv_ub_05: { videoId: '9nzSvIgbXMg' }, // STRADDLE & PIKE UNDERSHOOT TUTORIAL
  gap_gld_bb_01: { videoId: 'biO0PYd-jI8' }, // How to do a Back Walkover on Beam!
  gap_gld_bb_03: { videoId: 'vwWu0Afs_Nk' }, // #GymnasticsHowTo: Perfect Your Split Leap
  gap_gld_ub_01: { videoId: 'bSlBi9eAD9c' }, // How To Glide Kip On Bars With Coach Meggin
  gap_gld_ub_02: { videoId: 'YMJNXaevWT0' }, // Bars Circuit for Casts to Horizontal
  gap_gld_ub_03: { videoId: 'wn5-IVobqY0' }, // A Clear Hip Circle Tutorial
  gap_gld_ub_04: { videoId: 'awHi293w26g' }, // Jamie Squat on, Jump to High Bar
  gap_gld_vt_01: { videoId: 'QcDta7xyCx0' }, // Learning the Front Handspring Vault | (Drills and All you need to know
  gap_gld_bb_02: { videoId: 'dWDrHKs5rD4' }, // Back Handspring Step Out On Balance Beam Tutorial With Coach Meggin!
  gap_gld_bb_05: { videoId: 'CbutRDvUaxw' }, // Punch Front (Front Flip/Tuck) Dismount Off Beam With Coach Meggin!
  gap_gld_ub_05: { videoId: 'RzMnUVcFrvA' }, // Flyaway Dismount on Bars featuring Coach Mary Lee Tracy
  gf_l5_plt_02: { videoId: null }, // no real demonstration found yet
  gap_plt_bb_01: { videoId: 'dWDrHKs5rD4' }, // Back Handspring Step Out On Balance Beam Tutorial With Coach Meggin!
  gap_plt_bb_03: { videoId: null }, // no real demonstration found yet
  gap_plt_ub_03: { videoId: 'RzMnUVcFrvA' }, // Flyaway Dismount on Bars featuring Coach Mary Lee Tracy
  gf_l6_plt_02: { videoId: 'oN7L8sdVqgU' }, // Split, Switch & Side Leaps - Tour Jeté & Dance Connections
  gap_plt_bb_02: { videoId: 'qve9Hg4dOMM' }, // Artistic Gymnastics on Beam | How to do the Side Aerial | Overview of 
  gap_plt_fx_02: { videoId: 'eTMGAUcouDU' }, // LAYOUT HALF-TWIST TUTORIAL
  gap_plt_fx_04: { videoId: 'oN7L8sdVqgU' }, // Split, Switch & Side Leaps - Tour Jeté & Dance Connections
  gap_plt_ub_01: { videoId: 'NrVhnMiYg7w' }, // #GymnasticsHowTo: Cast-to-Handstand
  gap_plt_ub_02: { videoId: '1dP6MxwYPco' }, // #GymnasticsHowTo: The Giant Swing
  gap_plt_vt_02: { videoId: 'Lz-SfjPlr9I' }, // Tsukahara Vault Drills Progression

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
export const ADDED_SKILLS: {
  id: string;
  like: string;
  level: number;
  name: string;
  videoId: string;
  category?: Skill['category'];
  optional?: boolean;
}[] = [
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
  // 20 October 2026 brief: Levels 9 and 10
  { id: 'brief_l9_double_twist', like: 'gf_l7_plt_01', level: 9, name: 'Double twist', videoId: 'hpsgwGvBdW8', category: 'FLOOR' },
  { id: 'brief_l9_fhs_front_full', like: 'gf_l7_plt_01', level: 9, name: 'Front handspring front full', videoId: 'zF59uGgs54Y', category: 'FLOOR' },
  { id: 'brief_l9_tsukahara_pike', like: 'gf_l8_vt_01', level: 9, name: 'Tsukahara pike (vault)', videoId: 'Rv5xwDTPACc', category: 'VAULT', optional: true },
  { id: 'brief_l10_double_back', like: 'gf_l7_plt_01', level: 10, name: 'Double back', videoId: 'TxmbF-ULIoY', category: 'FLOOR' },
];

// Levels with no standard requirements: nothing is compulsory, so these levels
// never advance a gymnast automatically.
export const OPTIONAL_LEVELS = [8];
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
      tutorial: change?.videoId ? tutorialFor(name, change.videoId) : change?.videoId === null ? null : skill.tutorial,
      tutorialStatus: change?.videoId ? 'FOUND' : change?.videoId === null ? 'NOT_FOUND' : skill.tutorialStatus,
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
      category: add.category ?? like.category,
      optional: add.optional,
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
