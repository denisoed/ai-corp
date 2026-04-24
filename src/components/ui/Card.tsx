import React from 'react';
import { cn } from '../../lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  children?: React.ReactNode;
  key?: React.Key;
  draggable?: boolean | "true" | "false";
  onDragStart?: (e: React.DragEvent<any>) => void;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export function Card({ className, ...props }: CardProps) {
  return (
    <div className={cn("rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300 shadow-sm", className)} {...props} />
  )
}

export function CardHeader({ className, ...props }: CardProps) {
  return <div className={cn("flex flex-col space-y-1.5 p-4", className)} {...props} />
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-sm font-medium text-white", className)} {...props} />
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-xs text-zinc-500", className)} {...props} />
}

export function CardContent({ className, ...props }: CardProps) {
  return <div className={cn("p-4 pt-0", className)} {...props} />
}

export function CardFooter({ className, ...props }: CardProps) {
  return <div className={cn("flex items-center p-4 pt-0", className)} {...props} />
}
