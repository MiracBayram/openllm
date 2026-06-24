import { motion, AnimatePresence } from "framer-motion";
import React, { useState } from "react";

interface ShatterButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

interface Fragment {
  id: number;
  dx: number;
  dy: number;
  rot: number;
}

export default function ShatterButton({ children, onClick, ...props }: ShatterButtonProps) {
  const [shattered, setShattered] = useState(false);
  const [fragments, setFragments] = useState<Fragment[]>([]);

  const handleShatter = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (shattered) return;
    
    // Generate 12 random fragments
    const frags = Array.from({ length: 12 }).map((_, i) => ({
      id: i,
      dx: (Math.random() - 0.5) * 150,
      dy: (Math.random() - 0.5) * 150,
      rot: (Math.random() - 0.5) * 180,
    }));
    
    setFragments(frags);
    setShattered(true);

    if (onClick) onClick(e);

    // Reassemble after 1 second
    setTimeout(() => {
      setShattered(false);
    }, 1000);
  };

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <AnimatePresence>
        {!shattered && (
          <motion.button
            key="button"
            onClick={handleShatter}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            exit={{ opacity: 0, scale: 0.8 }}
            {...props}
            className={`bg-[#00d9ff]/20 border border-[#00d9ff]/50 text-[#00d9ff] px-6 py-2 rounded font-mono hover:bg-[#00d9ff]/30 transition-colors ${props.className || ""}`}
          >
            {children}
          </motion.button>
        )}
      </AnimatePresence>

      {shattered && (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {fragments.map((f) => (
            <motion.div
              key={f.id}
              initial={{ x: 0, y: 0, rotate: 0, opacity: 1, scale: 1 }}
              animate={{ x: f.dx, y: f.dy, rotate: f.rot, opacity: 0, scale: 0 }}
              transition={{ type: "spring", stiffness: 1200, damping: 8 }}
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: 10,
                height: 10,
                backgroundColor: "#00d9ff",
                marginLeft: -5,
                marginTop: -5,
                borderRadius: "2px"
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
