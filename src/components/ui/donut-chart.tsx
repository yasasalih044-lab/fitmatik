"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export interface DonutChartSegment {
  value: number;
  /** Geçerli bir CSS rengi — tema belirteci de olabilir. */
  color: string;
  label: string;
}

interface DonutChartProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onSelect"> {
  data: DonutChartSegment[];
  totalValue?: number;
  size?: number;
  strokeWidth?: number;
  animationDuration?: number;
  animationDelayPerSegment?: number;
  highlightOnHover?: boolean;
  centerContent?: React.ReactNode;
  /** Bir dilimin üzerine gelindiğinde çağrılır. */
  onSegmentHover?: (segment: DonutChartSegment | null) => void;
}

/**
 * Halka grafik. Dilimler tek tek çizilir, üzerine gelince öne çıkar.
 * `motion` paketi framer-motion'ın güncel adı; ayrıca framer-motion kurmuyoruz.
 */
const DonutChart = React.forwardRef<HTMLDivElement, DonutChartProps>(function DonutChart(
  {
    data,
    totalValue: propTotalValue,
    size = 200,
    strokeWidth = 20,
    animationDuration = 1,
    animationDelayPerSegment = 0.05,
    highlightOnHover = true,
    centerContent,
    onSegmentHover,
    className,
    ...props
  },
  ref,
) {
  const [hovered, setHovered] = React.useState<DonutChartSegment | null>(null);
  const reduced = useReducedMotion();

  const total = React.useMemo(
    () => propTotalValue ?? data.reduce((sum, s) => sum + s.value, 0),
    [data, propTotalValue],
  );

  const radius = size / 2 - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;

  React.useEffect(() => {
    onSegmentHover?.(hovered);
  }, [hovered, onSegmentHover]);

  let cumulative = 0;

  return (
    <div
      ref={ref}
      className={cn("relative flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      onMouseLeave={() => setHovered(null)}
      {...props}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 overflow-visible">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="var(--sunk)"
          strokeWidth={strokeWidth}
        />

        <AnimatePresence>
          {data.map((segment, index) => {
            if (segment.value <= 0) return null;

            const percentage = total === 0 ? 0 : (segment.value / total) * 100;
            const dash = `${(percentage / 100) * circumference} ${circumference}`;
            const offset = (cumulative / 100) * circumference;
            const isActive = hovered?.label === segment.label;
            cumulative += percentage;

            return (
              <motion.circle
                key={segment.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="transparent"
                stroke={segment.color}
                strokeWidth={strokeWidth}
                strokeDasharray={dash}
                strokeLinecap="butt"
                initial={reduced ? false : { opacity: 0, strokeDashoffset: circumference }}
                animate={{ opacity: 1, strokeDashoffset: -offset }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : {
                        opacity: { duration: 0.3, delay: index * animationDelayPerSegment },
                        strokeDashoffset: {
                          duration: animationDuration,
                          delay: index * animationDelayPerSegment,
                          ease: "easeOut",
                        },
                      }
                }
                className={cn("origin-center", highlightOnHover && "cursor-pointer")}
                style={{
                  filter: isActive ? `drop-shadow(0 0 6px ${segment.color})` : "none",
                  transform: isActive ? "scale(1.03)" : "scale(1)",
                  transition: "filter .2s ease-out, transform .2s ease-out",
                }}
                onMouseEnter={() => highlightOnHover && setHovered(segment)}
              />
            );
          })}
        </AnimatePresence>
      </svg>

      {centerContent && (
        <div
          className="pointer-events-none absolute flex flex-col items-center justify-center text-center"
          style={{ width: size - strokeWidth * 2.5, height: size - strokeWidth * 2.5 }}
        >
          {centerContent}
        </div>
      )}
    </div>
  );
});

export { DonutChart };
