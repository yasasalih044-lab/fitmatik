"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { GOALS, type Goal, type TrainingMode } from "@/lib/goals";

const REFINE_LABEL: Partial<Record<Goal, string>> = { kilo_ver: "Definasyon", kilo_al: "Bulk" };
const REFINE_MODE: Partial<Record<Goal, Exclude<TrainingMode, null>>> = { kilo_ver: "definasyon", kilo_al: "bulk" };

function RulerTicks() {
  const marks = Array.from({ length: 29 }, (_, i) => i);
  return (
    <div className="goal-ruler__ticks" aria-hidden="true">
      {marks.map((i) => (
        <span key={i} className={i % 4 === 0 ? "is-major" : i === 14 ? "is-center" : undefined} />
      ))}
    </div>
  );
}

/**
 * 21st.dev "Ruler Carousel"den esinlenen hedef seçici: cetvel çizgileri +
 * ortalanan, yaylı hareketle büyüyen aktif seçenek. Üç sabit seçenek olduğu
 * için orijinaldeki sonsuz kaydırma yerine basit önceki/sonraki + tıklama var.
 */
export function GoalRuler({
  value,
  onChange,
  mode,
  onModeChange,
}: {
  value: Goal;
  onChange: (goal: Goal) => void;
  mode: TrainingMode;
  onModeChange: (mode: TrainingMode) => void;
}) {
  const index = GOALS.findIndex((g) => g.id === value);
  const active = GOALS[index] ?? GOALS[0];
  const refineLabel = REFINE_LABEL[active.id];
  const refineMode = REFINE_MODE[active.id];
  const advancedOn = refineMode !== undefined && mode === refineMode;

  function step(delta: number) {
    const next = (index + delta + GOALS.length) % GOALS.length;
    onChange(GOALS[next].id);
    onModeChange(null);
  }

  function pick(goal: Goal) {
    if (goal !== value) onModeChange(null);
    onChange(goal);
  }

  return (
    <div className="goal-ruler">
      <RulerTicks />
      <div className="goal-ruler__row">
        {GOALS.map((g) => {
          const isActive = g.id === value;
          return (
            <motion.button
              key={g.id}
              type="button"
              onClick={() => pick(g.id)}
              className="goal-ruler__item"
              data-active={isActive}
              animate={{ scale: isActive ? 1 : 0.86, opacity: isActive ? 1 : 0.45 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
              {g.label}
            </motion.button>
          );
        })}
      </div>
      <RulerTicks />

      <div className="goal-ruler__nav">
        <button type="button" onClick={() => step(-1)} aria-label="Önceki hedef" className="goal-ruler__nav-btn">
          <ChevronLeft size={16} aria-hidden />
        </button>
        <span className="mono text-[11px] text-[var(--faint)]">
          {index + 1} / {GOALS.length}
        </span>
        <button type="button" onClick={() => step(1)} aria-label="Sonraki hedef" className="goal-ruler__nav-btn">
          <ChevronRight size={16} aria-hidden />
        </button>
      </div>

      <p className="goal-ruler__blurb">{active.blurb} Seçimine göre kalori ve makro hedeflerini ayarlarız.</p>

      {refineLabel && refineMode && (
        <button
          type="button"
          onClick={() => onModeChange(advancedOn ? null : refineMode)}
          aria-pressed={advancedOn}
          className="goal-ruler__advanced"
          data-on={advancedOn}
        >
          <span>Gelişmiş: {refineLabel}</span>
          <span className="goal-ruler__advanced-dot" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export default GoalRuler;
