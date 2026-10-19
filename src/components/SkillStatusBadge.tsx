import React from 'react';
import { CheckCircle2, Clock, RotateCcw, Circle } from 'lucide-react';
import { SkillStatus } from '../types';

const LOOK: Record<SkillStatus, { label: string; className: string; icon: React.ReactNode }> = {
  VERIFIED: { label: 'Approved', className: 'bg-emerald-50 text-emerald-800 border-emerald-200', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  AWAITING_VERIFICATION: { label: 'Pending approval', className: 'bg-amber-50 text-amber-800 border-amber-200', icon: <Clock className="w-3.5 h-3.5" /> },
  CHANGES_REQUIRED: { label: 'Needs work', className: 'bg-rose-50 text-rose-800 border-rose-200', icon: <RotateCcw className="w-3.5 h-3.5" /> },
  IN_PROGRESS: { label: 'Not submitted', className: 'bg-[#F4EEF8] text-[#5C4A68] border-[#E4D7EE]', icon: <Circle className="w-3.5 h-3.5" /> },
  NOT_COMPLETED: { label: 'Not submitted', className: 'bg-[#F4EEF8] text-[#5C4A68] border-[#E4D7EE]', icon: <Circle className="w-3.5 h-3.5" /> },
};

export const SkillStatusBadge: React.FC<{ status: SkillStatus; compact?: boolean }> = ({ status, compact = false }) => {
  const look = LOOK[status];
  return (
    <span className={`inline-flex items-center gap-1 shrink-0 rounded-full border px-2 py-0.5 text-xs ${look.className}`} title={look.label}>
      {look.icon}
      {!compact && look.label}
    </span>
  );
};
