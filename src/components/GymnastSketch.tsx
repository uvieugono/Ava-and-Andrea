import React from 'react';

// Line drawings of gymnasts, one pose per page, all drawn the same way:
// a deep purple outline, round ends, no fill.
type Pose =
  | 'leap'
  | 'handstand'
  | 'arabesque'
  | 'cartwheel'
  | 'bridge'
  | 'straddle'
  | 'beam'
  | 'tuck'
  | 'pike'
  | 'starJump'
  | 'ribbon';

const POSES: Record<Pose, { head: [number, number]; lines: string[]; label: string }> = {
  leap: {
    label: 'Gymnast in a split leap',
    head: [100, 58],
    lines: ['M100 72 Q101 100 104 124', 'M104 124 Q150 116 190 110', 'M104 124 Q60 130 14 122', 'M101 86 Q78 66 58 40', 'M101 86 Q126 68 148 46'],
  },
  handstand: {
    label: 'Gymnast in a handstand',
    head: [100, 196],
    lines: ['M100 182 L100 118', 'M100 118 Q96 80 93 36', 'M100 118 Q104 80 107 36', 'M100 178 L86 232', 'M100 178 L114 232', 'M56 240 L144 240'],
  },
  arabesque: {
    label: 'Gymnast in an arabesque',
    head: [46, 98],
    lines: ['M100 150 L100 240', 'M100 150 Q145 132 188 116', 'M100 150 Q80 128 58 110', 'M62 114 Q40 128 18 142', 'M62 114 Q46 92 30 74', 'M84 244 L116 244'],
  },
  cartwheel: {
    label: 'Gymnast in a cartwheel',
    head: [100, 184],
    lines: ['M100 170 L100 110', 'M100 110 Q78 70 56 30', 'M100 110 Q122 70 144 30', 'M100 166 L62 234', 'M100 166 L138 234'],
  },
  bridge: {
    label: 'Gymnast in a bridge',
    head: [58, 196],
    lines: ['M42 232 Q48 126 102 112 Q154 124 164 232', 'M70 178 L42 232', 'M150 176 L164 232', 'M24 238 L182 238'],
  },
  straddle: {
    label: 'Gymnast in a straddle jump',
    head: [100, 66],
    lines: ['M100 80 L100 138', 'M100 138 Q64 118 28 94', 'M100 138 Q136 118 172 94', 'M100 94 Q66 88 34 80', 'M100 94 Q134 88 166 80'],
  },
  beam: {
    label: 'Gymnast balancing on a beam',
    head: [100, 78],
    lines: ['M100 92 L100 150', 'M100 150 L100 230', 'M100 150 Q130 168 128 180 Q114 194 102 194', 'M100 104 Q90 74 80 44', 'M100 104 Q110 74 120 44', 'M26 234 L174 234', 'M60 234 L60 250', 'M140 234 L140 250'],
  },
  tuck: {
    label: 'Gymnast in a tucked somersault',
    head: [84, 84],
    lines: ['M92 96 Q108 108 116 130', 'M116 130 Q96 146 80 140 Q70 128 76 114', 'M96 102 Q86 116 78 126', 'M40 200 Q20 120 70 60 Q110 30 150 60', 'M144 52 L150 60 L140 64'],
  },
  pike: {
    label: 'Gymnast in a pike sit',
    head: [56, 104],
    lines: ['M92 200 Q76 158 62 118', 'M92 200 Q132 160 172 122', 'M66 134 Q108 124 150 112', 'M40 210 L180 210'],
  },
  starJump: {
    label: 'Gymnast in a star jump',
    head: [100, 62],
    lines: ['M100 76 L100 136', 'M100 136 Q82 180 62 226', 'M100 136 Q118 180 138 226', 'M100 92 Q74 70 48 44', 'M100 92 Q126 70 152 44'],
  },
  ribbon: {
    label: 'Gymnast with a ribbon',
    head: [96, 74],
    lines: ['M96 88 L98 150', 'M98 150 L94 234', 'M98 150 Q112 190 124 222', 'M96 100 Q112 74 130 48', 'M96 100 Q80 118 64 130', 'M130 48 Q170 30 160 80 Q150 130 186 120 Q206 112 196 156'],
  },
};

export const PAGE_POSES: Record<string, Pose> = {
  home: 'leap',
  skills: 'handstand',
  progress: 'arabesque',
  community: 'cartwheel',
  dashboard: 'bridge',
  events: 'straddle',
  competitions: 'straddle',
  clubs: 'beam',
  contact: 'tuck',
  profile: 'pike',
  shop: 'starJump',
  auth: 'ribbon',
};

export const GymnastSketch: React.FC<{ pose: Pose; className?: string }> = ({ pose, className = '' }) => {
  const drawing = POSES[pose];
  return (
    <svg viewBox="0 0 200 260" className={className} role="img" aria-label={drawing.label} fill="none" stroke="#3E1B4A" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx={drawing.head[0]} cy={drawing.head[1]} r={12} />
      {drawing.lines.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
};

/** The page's sketch: in the empty side border on wide screens, and below the page on narrow ones. */
export const PageSketch: React.FC<{ page: string }> = ({ page }) => {
  const pose = PAGE_POSES[page] ?? 'leap';
  return (
    <>
      <div aria-hidden="true" className="hidden xl:block fixed left-4 bottom-8 w-28 pointer-events-none opacity-90">
        <GymnastSketch pose={pose} className="w-full h-auto" />
      </div>
      <div aria-hidden="true" className="xl:hidden flex justify-center pt-6 pb-2 pointer-events-none">
        <GymnastSketch pose={pose} className="w-24 h-auto opacity-90" />
      </div>
    </>
  );
};
