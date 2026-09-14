"use client";

import { useEffect, useRef } from "react";

const LEVELS = [
  { id: 0, label: "Sınırlı", note: "Günü kurtarır", accuracy: "%80 doğruluk oranı" },
  { id: 1, label: "Yüksek", note: "Profesyoneller için", accuracy: "%95 doğruluk oranı" },
  { id: 2, label: "Ultra", note: "Takıntılı olanlar için özel tasarlandı", accuracy: "%100 oranında tam kalori araştırması" },
] as const;

const DOT_GAP = 8;

function hash(x: number, y: number) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * "Zeka barı": Claude Code'un Effort kaydıracındaki nokta dokusu + katı
 * top'lu tasarımdan birebir esinlenir, renk aktif temanın accent'ine bağlanır.
 * Ultra'da doku accent rengine boyanır ve parıldar (Ultracode'daki mor gibi).
 * Şimdilik yalnızca görünüm — seçim hiçbir isteği etkilemiyor.
 */
export function IntelligenceBar({ level, onChange }: { level: 0 | 1 | 2; onChange: (level: 0 | 1 | 2) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const levelRef = useRef(level);

  useEffect(() => {
    levelRef.current = level;
  }, [level]);

  useEffect(() => {
    const track = trackRef.current;
    const canvas = canvasRef.current;
    if (!track || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      w = track.clientWidth;
      h = track.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    let last = performance.now();
    let phase = 0;

    const draw = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const lvl = levelRef.current;
      // Ultra'ya yaklaştıkça doku hem hızlanır hem canlanır.
      const vivid = lvl / (LEVELS.length - 1);
      phase += dt * (0.5 + vivid * 1.8);
      ctx.clearRect(0, 0, w, h);

      const neutral = getComputedStyle(track).getPropertyValue("--faint").trim() || "#888";
      const accent = getComputedStyle(track).getPropertyValue("--accent-strong").trim() || "#fff";
      const thumbFrac = LEVELS.length > 1 ? lvl / (LEVELS.length - 1) : 0;
      const thumbPx = thumbFrac * w;

      const cols = Math.ceil(w / DOT_GAP);
      const cy = h / 2;
      for (let cx = 0; cx < cols; cx++) {
        const px = cx * DOT_GAP + DOT_GAP / 2;
        const seed = hash(cx, 3.7);
        const ph = seed * Math.PI * 2;
        const twinkle = reduce ? 1 : 0.5 + 0.5 * Math.sin(phase * (1.2 + vivid * 1.6) + ph);
        // Baş tarafa (top'a) yakın noktalar biraz daha büyük/parlak — bir küme hissi verir.
        const closeness = Math.max(0, 1 - Math.abs(px - thumbPx) / (w * 0.55));
        const size = 1.1 + 0.9 * seed + closeness * 1.1 * (0.4 + vivid * 0.6);
        const alpha = Math.min(1, (0.18 + 0.35 * seed) * (0.5 + twinkle * 0.5) + closeness * vivid * 0.5);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = vivid > 0.6 ? accent : neutral;
        ctx.beginPath();
        ctx.arc(px, cy, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!reduce) raf = requestAnimationFrame(draw);
    };

    if (reduce) draw(performance.now());
    else raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const current = LEVELS[level];
  const thumbLeft = LEVELS.length > 1 ? (level / (LEVELS.length - 1)) * 100 : 0;

  return (
    <div className="intel-bar">
      <div className="intel-bar__head">
        <span className="eyebrow">Zeka</span>
        <span className="intel-bar__value" data-max={level === 2}>{current.label}</span>
      </div>

      <div ref={trackRef} className="intel-bar__track" data-level={level}>
        <canvas ref={canvasRef} className="intel-bar__canvas" />
        <span className="intel-bar__thumb" style={{ left: `${thumbLeft}%` }} />
        <input
          type="range"
          min={0}
          max={2}
          step={1}
          value={level}
          onChange={(e) => onChange(Number(e.target.value) as 0 | 1 | 2)}
          aria-label="Araştırma derinliği"
          className="intel-bar__range"
        />
      </div>

      <div className="intel-bar__ends">
        <button type="button" onClick={() => onChange(0)} className="intel-bar__end">Sınırlı</button>
        <button type="button" onClick={() => onChange(2)} className="intel-bar__end intel-bar__end--right">Ultra</button>
      </div>

      <p className="intel-bar__blurb">
        <strong>{current.note}</strong> — {current.accuracy}.
      </p>
    </div>
  );
}

export default IntelligenceBar;
