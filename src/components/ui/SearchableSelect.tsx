import React, { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Input } from './Input';
import { cn } from '../../lib/utils';

export interface SearchableSelectProps {
  value: string;
  options: string[];
  placeholder: string;
  searchPlaceholder?: string;
  loading?: boolean;
  disabled?: boolean;
  onValueChange: (value: string) => void;
}

export function SearchableSelect({
  value,
  options,
  placeholder,
  searchPlaceholder = 'Search...',
  loading = false,
  disabled = false,
  onValueChange,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const filteredOptions = searchValue
    ? options.filter(option => option.toLowerCase().includes(searchValue.toLowerCase()))
    : options;

  return (
    <Popover.Root
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSearchValue('');
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-10 w-full items-center justify-between rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 shadow-inner focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50',
            !value && 'text-zinc-500'
          )}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 w-[var(--radix-popover-trigger-width)] rounded-md border border-zinc-800 bg-zinc-950 p-2 shadow-md animate-in fade-in-0 zoom-in-95"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <Input
                autoFocus
                value={searchValue}
                onChange={e => setSearchValue(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-8 border-zinc-800 bg-zinc-900 pl-8 text-xs"
              />
            </div>
            <div className="max-h-60 overflow-y-auto">
              {loading ? (
                <div className="px-2 py-2 text-xs text-zinc-500">Loading models...</div>
              ) : filteredOptions.length === 0 ? (
                <div className="px-2 py-2 text-xs text-zinc-500">No models found</div>
              ) : (
                filteredOptions.map(option => (
                  <button
                    key={option}
                    type="button"
                    className={cn(
                      'flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-800',
                      option === value ? 'bg-indigo-500/15 text-indigo-300' : 'text-zinc-200'
                    )}
                    onClick={() => {
                      onValueChange(option);
                      setOpen(false);
                      setSearchValue('');
                    }}
                  >
                    <span className="truncate">{option}</span>
                    {option === value && <Check className="ml-3 h-4 w-4 shrink-0" />}
                  </button>
                ))
              )}
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
