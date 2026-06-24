import { useMemo, useEffect, useState, useRef } from 'react';

interface TelemetryChartProps {
  currentValue: number;
  color?: string;
  height?: number;
  className?: string;
  maxValue?: number;
  dataPoints?: number;
}

export function TelemetryChart({ 
  currentValue, 
  color = '#6366f1',
  height = 40,
  className = '',
  maxValue = 100,
  dataPoints = 30
}: TelemetryChartProps) {
  const [data, setData] = useState<number[]>(Array(dataPoints).fill(0));
  const latestValueRef = useRef(currentValue);

  useEffect(() => {
    latestValueRef.current = currentValue;
  }, [currentValue]);

  useEffect(() => {
    const interval = setInterval(() => {
      setData(prev => {
        const newData = [...prev, latestValueRef.current];
        if (newData.length > dataPoints) {
          newData.shift();
        }
        return newData;
      });
    }, 500); // 2 updates per second, smooth transitions handle the rest
    return () => clearInterval(interval);
  }, [dataPoints]);
  const points = useMemo(() => {
    if (!data || data.length === 0) return '';
    
    const width = 100; // SVG viewBox width percentage (0-100)
    const step = width / Math.max(data.length - 1, 1);
    
    return data.map((val, index) => {
      // Normalize value between 0 and 1
      const normalized = Math.min(Math.max(val / maxValue, 0), 1);
      // Invert Y axis since SVG 0,0 is top-left
      const y = height - (normalized * height);
      const x = index * step;
      return `${x},${y}`;
    }).join(' ');
  }, [data, height, maxValue]);

  if (!data || data.length < 2) {
    return <div className={`w-full opacity-20 bg-forge-surface rounded ${className}`} style={{ height }} />;
  }

  // To create a fill under the line, we close the path at the bottom corners
  const polygonPoints = `0,${height} ${points} 100,${height}`;

  return (
    <div className={`w-full relative overflow-hidden rounded ${className}`} style={{ height }}>
      <svg 
        viewBox={`0 0 100 ${height}`} 
        preserveAspectRatio="none" 
        className="absolute inset-0 w-full h-full"
      >
        <defs>
          <linearGradient id={`gradient-${color.replace('#', '')}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        
        {/* Fill Area */}
        <polygon 
          points={polygonPoints} 
          fill={`url(#gradient-${color.replace('#', '')})`} 
          className="transition-all duration-500 ease-linear"
        />
        
        {/* Line */}
        <polyline 
          points={points} 
          fill="none" 
          stroke={color} 
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-all duration-500 ease-linear drop-shadow-[0_0_3px_rgba(99,102,241,0.5)]"
        />
      </svg>
    </div>
  );
}
