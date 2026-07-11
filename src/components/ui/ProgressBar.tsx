// 进度条组件
import { cn } from '@/lib/utils';

interface ProgressBarProps {
  value: number; // 0-1
  className?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md';
  color?: 'neon' | 'amber' | 'vermilion' | 'trans';
}

export function ProgressBar({ value, className, showLabel, size = 'md', color = 'neon' }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, value * 100));
  const colorMap = {
    neon: 'bg-gradient-to-r from-neon/60 to-neon',
    amber: 'bg-gradient-to-r from-amber/60 to-amber',
    vermilion: 'bg-gradient-to-r from-vermilion/60 to-vermilion',
    trans: 'bg-gradient-to-r from-trans/60 to-trans',
  };
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className={cn('relative flex-1 bg-ink-900/80 rounded-full overflow-hidden', size === 'sm' ? 'h-1' : 'h-1.5')}>
        <div
          className={cn('h-full rounded-full', colorMap[color])}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className="stat-num text-xs text-ink-300 w-10 text-right">{pct.toFixed(0)}%</span>
      )}
    </div>
  );
}
