import React, { useRef, ReactNode } from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";

export type SplitDirection = "horizontal" | "vertical";
export type PanelId = string;

export interface DockNode {
  id: PanelId;
  direction?: SplitDirection;
  ratio?: number;
  children?: [DockNode, DockNode];
  tabs?: PanelId[];
  activeTab?: PanelId;
  kind: "split" | "tabs" | "panel";
}

export interface DockPanel {
  id: PanelId;
  title: string;
  render: () => ReactNode;
  icon?: string;
}

interface SplitPaneProps {
  direction: SplitDirection;
  ratio: number;
  left: ReactNode;
  right: ReactNode;
  onRatioChange?: (newRatio: number) => void;
}

export function SplitPane({ direction, ratio, left, right, onRatioChange }: SplitPaneProps) {
  const dragMotion = useMotionValue(ratio);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isHorizontal = direction === "horizontal";
  
  const leftSize = useTransform(dragMotion, (v) => `${v * 100}%`);
  const rightSize = useTransform(dragMotion, (v) => `${(1 - v) * 100}%`);

  return (
    <div 
      ref={containerRef} 
      className="flex w-full h-full relative"
      style={{ flexDirection: isHorizontal ? "row" : "column" }}
    >
      <motion.div 
        className="flex overflow-hidden"
        style={isHorizontal ? { width: leftSize, height: "100%" } : { height: leftSize, width: "100%" }}
      >
        {left}
      </motion.div>
      
      <div 
        className={`flex-none bg-[#00d9ff]/20 hover:bg-[#00d9ff]/80 transition-colors z-10 ${isHorizontal ? "w-1 cursor-col-resize h-full" : "h-1 cursor-row-resize w-full"}`}
        onPointerDown={(e) => {
          const target = e.target as HTMLElement;
          target.setPointerCapture(e.pointerId);
          
          const move = (ev: PointerEvent) => {
            const rect = containerRef.current?.getBoundingClientRect();
            if (!rect) return;
            let newRatio = isHorizontal
              ? (ev.clientX - rect.left) / rect.width
              : (ev.clientY - rect.top) / rect.height;
            
            // Clamp ratio
            newRatio = Math.max(0.05, Math.min(0.95, newRatio));
            dragMotion.set(newRatio);
            if (onRatioChange) onRatioChange(newRatio);
          };
          
          const up = (ev: PointerEvent) => {
            target.releasePointerCapture(e.pointerId);
            target.removeEventListener("pointermove", move);
            target.removeEventListener("pointerup", up);
          };
          
          target.addEventListener("pointermove", move);
          target.addEventListener("pointerup", up);
        }}
      />
      
      <motion.div 
        className="flex overflow-hidden"
        style={isHorizontal ? { width: rightSize, height: "100%" } : { height: rightSize, width: "100%" }}
      >
        {right}
      </motion.div>
    </div>
  );
}
