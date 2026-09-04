"use client";

import { motion, useReducedMotion } from "motion/react";

type ShiningTextProps = {
  text: string;
  className?: string;
};

/** Yükleme durumlarında kullanılan, hareket tercihine saygılı parıltı metni. */
export function ShiningText({ text, className = "" }: ShiningTextProps) {
  const reduced = useReducedMotion();

  return (
    <motion.span
      className={`shining-text ${className}`}
      initial={{ backgroundPosition: "200% 0" }}
      animate={{ backgroundPosition: reduced ? "0% 0" : "-200% 0" }}
      transition={reduced ? { duration: 0 } : { repeat: Infinity, duration: 2, ease: "linear" }}
    >
      {text}
    </motion.span>
  );
}
