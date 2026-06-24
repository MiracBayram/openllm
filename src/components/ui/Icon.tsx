import { createElement } from 'react';

interface IconProps {
  icon: any; // Using any because IconNode typedef in vanilla is strict
  size?: number;
  className?: string;
  strokeWidth?: number;
  fill?: string;
}

export function Icon({ icon, size = 24, className, strokeWidth = 2, fill = "none" }: IconProps) {
  if (!icon) return null;

  // Vanilla lucide arrays
  if (Array.isArray(icon)) {
    return (
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        width={size} 
        height={size} 
        viewBox="0 0 24 24" 
        fill={fill}
        stroke="currentColor" 
        strokeWidth={strokeWidth} 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        className={className}
      >
        <>{icon.map(([tag, attrs], i) => createElement(tag, { ...attrs, key: i }))}</>
      </svg>
    );
  }

  // Preact/React component (lucide-react exports forwardRef objects)
  const Component = icon as any;
  return <Component size={size} className={className} strokeWidth={strokeWidth} fill={fill} />;
}
