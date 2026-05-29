'use client';

import { formatListenerLabel } from '@/lib/listener-presence';

type BadgeVariant = 'card' | 'compact' | 'pill';

interface StationListenerBadgeProps {
  count: number;
  variant?: BadgeVariant;
  /** Highlight when this station is the one currently playing. */
  isActive?: boolean;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  card: 'px-2 py-0.5 rounded-lg text-[10px] font-bold border gap-1',
  compact: 'text-[9px] font-semibold gap-0.5',
  pill: 'px-2 py-0.5 rounded-full text-[9px] font-bold border gap-1',
};

export default function StationListenerBadge({
  count,
  variant = 'card',
  isActive = false,
  className = '',
}: StationListenerBadgeProps) {
  const label = formatListenerLabel(count);
  if (!label) return null;

  const tone = isActive
    ? 'bg-cyan-500/15 border-cyan-400/35 text-cyan-300'
    : 'bg-white/5 border-white/10 text-white/55';

  return (
    <span
      className={`inline-flex items-center ${variantClasses[variant]} ${tone} ${className}`}
      title={`${count.toLocaleString()} people listening now`}
      aria-label={label}
    >
      <span
        className={`material-symbols-outlined text-[11px] ${isActive ? 'text-cyan-400' : 'text-cyan-400/80'}`}
        style={{ fontVariationSettings: "'FILL' 1" }}
        aria-hidden
      >
        group
      </span>
      <span className="tabular-nums tracking-tight">{label}</span>
      {isActive && (
        <span className="w-1 h-1 rounded-full bg-cyan-400 animate-pulse shrink-0" aria-hidden />
      )}
    </span>
  );
}
