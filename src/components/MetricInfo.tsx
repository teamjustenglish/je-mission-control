import React from 'react';
import { Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface MetricInfoProps {
  what: string;
  calculated: string;
}

const MetricInfo: React.FC<MetricInfoProps> = ({ what, calculated }) => (
  <TooltipProvider delayDuration={250}>
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`About this metric: ${what}`}
          className="inline-flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full opacity-35 transition-opacity hover:opacity-65 focus-visible:opacity-65 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20"
        >
          <Info size={12} aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        className="max-w-[280px] rounded-[10px] border-white/[0.08] bg-[#1e1e1e] p-3 text-[12px] leading-[1.55] shadow-xl"
      >
        <p className="font-medium text-[#f0f0f0]">{what}</p>
        <p className="mt-[5px] text-[#9b9b9b]">{calculated}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

export default MetricInfo;
