import { motion } from "framer-motion";
import React from "react";

interface BreathingInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  isPulsing?: boolean;
}

export default function BreathingInput({ isPulsing = true, className = "", ...props }: BreathingInputProps) {
  return (
    <motion.div
      animate={isPulsing ? {
        boxShadow: [
          "0 0 0 0 rgba(0, 217, 255, 0.0)",
          "0 0 24px 4px rgba(0, 217, 255, 0.35)",
          "0 0 24px 4px rgba(0, 217, 255, 0.35)",
          "0 0 0 0 rgba(0, 217, 255, 0.0)",
          "0 0 0 0 rgba(0, 217, 255, 0.0)",
        ],
      } : {}}
      transition={isPulsing ? {
        duration: 4,
        times: [0, 0.375, 0.5, 0.875, 1],
        repeat: Infinity,
        ease: "easeInOut",
      } : {}}
      style={{ borderRadius: "8px" }}
      className={`relative ${className}`}
    >
      <input
        {...props}
        className="w-full bg-black/50 border border-[#00d9ff]/30 text-white px-4 py-3 rounded-lg focus:outline-none focus:border-[#00d9ff]/80 transition-colors"
      />
    </motion.div>
  );
}
