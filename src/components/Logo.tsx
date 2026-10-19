import React, { useState } from 'react';

// The logo file lives at public/gymtrack-logo.png. If it is missing the name is
// shown as text, so every page always carries the GymTrack mark.
export const LOGO_SRC = '/gymtrack-logo.png';

export const Logo: React.FC<{ className?: string; size?: 'sm' | 'lg' }> = ({ className = '', size = 'sm' }) => {
  const [failed, setFailed] = useState(false);
  const height = size === 'lg' ? 'h-28' : 'h-12';
  if (failed) {
    return (
      <span className={`font-display ${size === 'lg' ? 'text-4xl' : 'text-xl'} text-[#3E1B4A] ${className}`}>
        Gym<span className="text-[#B05AD8]">Track</span>
      </span>
    );
  }
  return <img src={LOGO_SRC} alt="GymTrack" className={`${height} w-auto object-contain ${className}`} onError={() => setFailed(true)} />;
};
