import React from 'react';
import * as Popover from '@radix-ui/react-popover';
import * as Checkbox from '@radix-ui/react-checkbox';
import { Check, ChevronDown } from 'lucide-react';

export function MultiSelect({ options, value, onChange, placeholder }: any) {
  const selectedLabels = options
    .filter((opt: any) => value.includes(opt.value))
    .map((opt: any) => opt.label)
    .join(', ');

  return (
    <Popover.Root>
      <Popover.Trigger className="flex h-10 w-full items-center justify-between rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 shadow-inner focus:outline-none focus:ring-1 focus:ring-indigo-500">
        <span className="truncate">
          {value.length === 0 ? <span className="text-zinc-500">{placeholder}</span> : selectedLabels}
        </span>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={4} className="z-50 w-[var(--radix-popover-trigger-width)] rounded-md border border-zinc-800 bg-zinc-950 p-2 shadow-md animate-in fade-in-0 zoom-in-95">
          <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
            {options.map((opt: any) => (
              <label key={opt.value} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-zinc-800 cursor-pointer text-zinc-200">
                <Checkbox.Root
                  checked={value.includes(opt.value)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      onChange([...value, opt.value]);
                    } else {
                      onChange(value.filter((v: string) => v !== opt.value));
                    }
                  }}
                  className="flex h-4 w-4 items-center justify-center rounded border border-zinc-700 bg-zinc-900 data-[state=checked]:bg-indigo-500 data-[state=checked]:border-indigo-500"
                >
                  <Checkbox.Indicator>
                    <Check className="h-3 w-3 text-white" />
                  </Checkbox.Indicator>
                </Checkbox.Root>
                {opt.label}
              </label>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
