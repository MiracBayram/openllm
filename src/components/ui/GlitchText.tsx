import { motion } from "framer-motion";
import React from "react";

interface GlitchTextProps {
  text: string;
  glitching: boolean;
  severity?: number; // 0.0 to 1.0 from AnomalyDetector
  className?: string;
}

export default function GlitchText({ text, glitching, severity = 1.0, className = "" }: GlitchTextProps) {
  // severity 0 = no glitch, 1 = full glitch
  const shakeX = severity * 2;
  const shakeY = severity * 1;

  return (
    <div style={{ position: "relative", display: "inline-block" }} className={className}>
      {/* Base Text */}
      <motion.span
        animate={glitching ? { x: [0, -shakeX, shakeX, -shakeX/2, shakeX/2, 0], y: [0, shakeY, -shakeY, 0] } : { x: 0, y: 0 }}
        transition={{
          type: "spring",
          stiffness: 200,
          damping: 8,
          times: [0, 0.2, 0.4, 0.6, 0.8, 1],
          duration: 0.6,
          repeat: glitching ? Infinity : 0,
        }}
        style={{ display: "inline-block", position: "relative", zIndex: 2 }}
      >
        {text}
      </motion.span>

      {/* Red Glitch Layer */}
      {glitching && (
        <motion.span
          initial={{ opacity: 0, x: 0 }}
          animate={{ opacity: [0, 0.8 * severity, 0], x: [-3 * severity, 3 * severity, 0] }}
          transition={{ type: "spring", stiffness: 800, damping: 12, repeat: Infinity, duration: 0.25 }}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            color: "red",
            mixBlendMode: "screen",
            zIndex: 1,
            pointerEvents: "none"
          }}
          aria-hidden="true"
        >
          {text}
        </motion.span>
      )}

      {/* Cyan Glitch Layer */}
      {glitching && (
        <motion.span
          initial={{ opacity: 0, x: 0 }}
          animate={{ opacity: [0, 0.8 * severity, 0], x: [3 * severity, -3 * severity, 0] }}
          transition={{ type: "spring", stiffness: 800, damping: 12, repeat: Infinity, duration: 0.25, delay: 0.05 }}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            color: "cyan",
            mixBlendMode: "screen",
            zIndex: 1,
            pointerEvents: "none"
          }}
          aria-hidden="true"
        >
          {text}
        </motion.span>
      )}
    </div>
  );
}
