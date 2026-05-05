import React, { useState, useCallback } from 'react';
import { cn } from '../../lib/utils';

interface LogoProps {
  className?: string;
}

export function Logo({ className }: LogoProps) {
  const [intro, setIntro] = useState(true);

  const handleAnimationEnd = useCallback(() => {
    setIntro(false);
  }, []);

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      className={cn(
        "flex-shrink-0",
        intro && "animate-logo-intro",
        className
      )}
      aria-label="AI Corp"
      onAnimationEnd={handleAnimationEnd}
    >
      {/* Base solid line */}
      <polyline
        points="32,14 47.59,41 16.41,41 32,14"
        stroke="#6366F1"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Animated tracer dash */}
      <polyline
        points="32,14 47.59,41 16.41,41 32,14"
        stroke="#A5B4FC"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength="100"
        strokeDasharray="13 87"
        className="animate-logo-dash opacity-0"
      />
      <circle cx="32" cy="14" r="4.5" fill="#6366F1" />
      <circle cx="47.59" cy="41" r="4.5" fill="#6366F1" />
      <circle cx="16.41" cy="41" r="4.5" fill="#6366F1" />
    </svg>
  );
}
