"use client";

import { ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type FlameCalcButtonProps = {
  text: string;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
};

/**
 * Ana CTA. 21st.dev "Flame Button" etkileşimini (imleci izleyen sıcak parıltı)
 * kullanır ama renkleri sabit alev tonları yerine aktif temanın --accent /
 * --accent-strong belirteçlerinden alır, böylece dört temada da uyumlu kalır.
 */
export function FlameCalcButton({ text, disabled = false, onClick, type = "button" }: FlameCalcButtonProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [mouseX, setMouseX] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [glow, setGlow] = useState(0);
  const targetGlow = useRef(0);

  useEffect(() => {
    const measure = () => {
      if (wrapRef.current) setWidth(wrapRef.current.getBoundingClientRect().width);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  function handleMouseMove(e: React.MouseEvent) {
    if (!wrapRef.current) return;
    setMouseX(e.clientX - wrapRef.current.getBoundingClientRect().left);
  }

  const safeX = mouseX ?? width / 2;
  const norm = width ? safeX / width : 0.5;
  const edgeProximity = Math.pow(Math.min(1, Math.abs(norm - 0.5) * 2), 1.6);

  useEffect(() => {
    targetGlow.current = disabled ? 0 : hovering ? edgeProximity : 0;
  }, [hovering, edgeProximity, disabled]);

  useEffect(() => {
    let raf: number;
    const tick = () => {
      setGlow((prev) => {
        const diff = targetGlow.current - prev;
        if (Math.abs(diff) < 0.002) return targetGlow.current;
        return prev + diff * 0.15;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const edgePercent = norm >= 0.5 ? 88 : 12;

  return (
    <div
      ref={wrapRef}
      className="flame-btn"
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div
        className="flame-btn__halo"
        style={{
          background: `radial-gradient(ellipse 46% 90% at ${edgePercent}% 50%,
            color-mix(in srgb, var(--accent-strong) 95%, transparent) 0%,
            color-mix(in srgb, var(--accent) 85%, transparent) 30%,
            color-mix(in srgb, var(--accent) 40%, transparent) 52%,
            transparent 78%)`,
          opacity: glow,
        }}
      />
      <button type={type} className="btn btn-primary flame-btn__el" onClick={onClick} disabled={disabled}>
        <span
          className="flame-btn__spark"
          style={{
            opacity: hovering && !disabled ? 1 : 0,
            left: safeX,
          }}
        />
        <span>{text}</span>
        <ArrowRight size={17} strokeWidth={2.2} aria-hidden />
      </button>
    </div>
  );
}

export default FlameCalcButton;
