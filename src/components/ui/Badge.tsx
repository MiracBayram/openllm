import { clsx } from 'clsx';

type BadgeColor = 'blue' | 'purple' | 'emerald' | 'amber' | 'red' | 'zinc';

const dotColors: Record<BadgeColor, string> = {
  blue: 'bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.5)]',
  purple: 'bg-purple-400 shadow-[0_0_6px_rgba(192,132,252,0.5)]',
  emerald: 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]',
  amber: 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]',
  red: 'bg-red-400',
  zinc: 'bg-zinc-400',
};

export function Badge({ color, children, uppercase = false }: { 
  color: BadgeColor; 
  children: React.ReactNode; 
  uppercase?: boolean 
}) {
  return (
    <div className={clsx(
      "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold shadow-sm border",
      "bg-forge-surface-3/50 border-forge-border-subtle text-forge-text-secondary backdrop-blur-sm",
      uppercase && "uppercase tracking-wider"
    )}>
      <div className={clsx("w-1.5 h-1.5 rounded-full", dotColors[color])} />
      {children}
    </div>
  );
}
