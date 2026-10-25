import React from 'react';

const URL_PATTERN = /((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?)\]'"])/gi;

/** Text where web addresses (YouTube or any other link) can be clicked. Opens in a new tab. */
export const LinkedText: React.FC<{ text: string; className?: string }> = ({ text, className }) => {
  const parts = text.split(URL_PATTERN);
  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (index % 2 === 0) return <React.Fragment key={index}>{part}</React.Fragment>;
        const href = part.startsWith('http') ? part : `https://${part}`;
        return (
          <a key={index} href={href} target="_blank" rel="noopener noreferrer" className="text-[#5C2A6E] underline break-all">
            {part}
          </a>
        );
      })}
    </span>
  );
};
