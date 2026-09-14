"use client";

import { useEffect, useRef, useState } from "react";

const LINE_1 = ["Tek", "sayı", "yalan", "söyler."];
const LINE_2 = ["Aralığı", "gör,"];
const LINE_3 = ["gerçek", "tahmini", "öğren."];
const OUTRO = ["Yaz.", "Çek.", "Bil."];

/**
 * Her açılışta (sert/PWA yüklemede) bir kez görünen marka animasyonu.
 * 21st.dev "Digital Serenity" düzeninden esinlenir: kelime kelime beliren
 * başlık + izleyen degrade + köşe süsleri; renkler --paper/--ink/--accent
 * belirteçlerinden gelir. `prefers-reduced-motion` açıksa hiç render olmaz;
 * dokunma/tıklama anında kapatır.
 */
export default function IntroSplash() {
  const [visible, setVisible] = useState(true);
  const [closing, setClosing] = useState(false);
  const [gradient, setGradient] = useState({ x: "50%", y: "50%", opacity: 0 });
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const skip = setTimeout(() => setVisible(false), 0);
      return () => clearTimeout(skip);
    }
    const fadeStart = setTimeout(() => setClosing(true), 2600);
    const unmount = setTimeout(() => setVisible(false), 2980);
    return () => {
      clearTimeout(fadeStart);
      clearTimeout(unmount);
    };
  }, []);

  function close() {
    setClosing(true);
    setTimeout(() => setVisible(false), 380);
  }

  function handleMove(e: React.MouseEvent) {
    if (!rootRef.current) return;
    const r = rootRef.current.getBoundingClientRect();
    setGradient({ x: `${e.clientX - r.left}px`, y: `${e.clientY - r.top}px`, opacity: 1 });
  }

  if (!visible) return null;

  return (
    <div
      ref={rootRef}
      className={`intro-splash${closing ? " intro-splash--closing" : ""}`}
      onMouseMove={handleMove}
      onMouseLeave={() => setGradient((g) => ({ ...g, opacity: 0 }))}
      onClick={close}
      role="presentation"
      aria-hidden="true"
    >
      <div className="intro-splash__gradient" style={{ left: gradient.x, top: gradient.y, opacity: gradient.opacity }} />
      <svg className="intro-splash__grid">
        <line x1="0" y1="22%" x2="100%" y2="22%" />
        <line x1="0" y1="78%" x2="100%" y2="78%" />
        <line x1="18%" y1="0" x2="18%" y2="100%" />
        <line x1="82%" y1="0" x2="82%" y2="100%" />
      </svg>
      {(["tl", "tr", "bl", "br"] as const).map((corner) => (
        <span key={corner} className={`intro-splash__corner intro-splash__corner--${corner}`} />
      ))}
      <div className="intro-splash__copy">
        <p className="intro-splash__eyebrow">
          {LINE_1.map((w, i) => (
            <Word key={`l1-${i}`} word={w} delay={80 + i * 110} />
          ))}
        </p>
        <h1 className="intro-splash__headline">
          <span>
            {LINE_2.map((w, i) => (
              <Word key={`l2-${i}`} word={w} delay={520 + i * 140} />
            ))}
          </span>
          <span className="intro-splash__headline-sub">
            {LINE_3.map((w, i) => (
              <Word key={`l3-${i}`} word={w} delay={900 + i * 140} />
            ))}
          </span>
        </h1>
        <p className="intro-splash__eyebrow intro-splash__eyebrow--outro">
          {OUTRO.map((w, i) => (
            <Word key={`l4-${i}`} word={w} delay={1500 + i * 130} />
          ))}
        </p>
      </div>
    </div>
  );
}

function Word({ word, delay }: { word: string; delay: number }) {
  return (
    <span className="intro-splash__word" style={{ animationDelay: `${delay}ms` }}>
      {word}
    </span>
  );
}
