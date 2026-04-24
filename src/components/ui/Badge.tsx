import React from 'react';
import { cn } from '../../lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';
  className?: string;
  children?: React.ReactNode;
  key?: React.Key;
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        {
          'border-transparent bg-indigo-600 text-white': variant === 'default',
          'border-transparent bg-zinc-800 text-white': variant === 'secondary',
          'border-transparent bg-red-500/10 text-red-400': variant === 'destructive',
          'border-transparent bg-emerald-500/10 text-emerald-400': variant === 'success',
          'border-transparent bg-amber-500/10 text-amber-400': variant === 'warning',
          'text-zinc-500 border-zinc-800': variant === 'outline',
        },
        className
      )}
      {...props}
    />
  )
}
