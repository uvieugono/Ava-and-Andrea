import React, { useState } from 'react';

const EXTENSIONS = ['.jpeg', '.jpg', '.png', '.webp'];

/**
 * Shows a picture kept in /public. Give the path without an extension; the
 * first of .jpeg, .jpg, .png or .webp that exists is shown. If none exists,
 * `fallback` is shown so the page never has a broken image.
 */
export const PublicImage: React.FC<{
  base: string;
  alt: string;
  className?: string;
  fallback: React.ReactNode;
}> = ({ base, alt, className, fallback }) => {
  const [attempt, setAttempt] = useState(0);
  if (attempt >= EXTENSIONS.length) return <>{fallback}</>;
  return <img src={`${base}${EXTENSIONS[attempt]}`} alt={alt} className={className} onError={() => setAttempt((value) => value + 1)} />;
};
