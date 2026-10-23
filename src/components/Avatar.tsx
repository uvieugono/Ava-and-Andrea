import React from 'react';

/** The person's own photo, or their initials when they have not uploaded one. No stock photos. */
export const Avatar: React.FC<{ src?: string | null; name: string; className?: string }> = ({ src, name, className = '' }) => {
  if (src) return <img src={src} alt="" className={`${className} object-cover`} />;
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  return (
    <span aria-hidden="true" className={`${className} inline-flex items-center justify-center bg-[#F4EEF8] text-[#5C2A6E] font-semibold select-none`}>
      {initials || '?'}
    </span>
  );
};
