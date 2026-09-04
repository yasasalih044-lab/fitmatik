"use client";

import { liquidMetalFragmentShader, ShaderMount } from "@paper-design/shaders";
import { Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type React from "react";
import { useReducedMotion } from "motion/react";

type Ripple = { x: number; y: number; id: number };

interface LiquidMetalButtonProps {
  label?: string;
  onClick?: () => void;
  viewMode?: "text" | "icon";
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  className?: string;
  fullWidth?: boolean;
  ariaLabel?: string;
}

/**
 * Verilen sıvı-metal düğmesinin tema belirteçlerine uyarlanmış sürümü.
 * WebGL kullanılamazsa katmanlı CSS yüzey aynı düğmeyi işlevsel bırakır.
 */
export function LiquidMetalButton({
  label = "Başla",
  onClick,
  viewMode = "text",
  type = "button",
  disabled = false,
  className = "",
  fullWidth = false,
  ariaLabel,
}: LiquidMetalButtonProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const shaderRef = useRef<HTMLDivElement>(null);
  const shaderMount = useRef<ShaderMount | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rippleId = useRef(0);
  const timers = useRef<number[]>([]);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced || !shaderRef.current) return;

    try {
      shaderMount.current = new ShaderMount(
        shaderRef.current,
        liquidMetalFragmentShader,
        {
          u_colorBack: [0.05, 0.05, 0.06, 1],
          u_colorTint: [0.78, 0.78, 0.8, 1],
          u_repetition: 4,
          u_softness: 0.5,
          u_shiftRed: 0.3,
          u_shiftBlue: 0.3,
          u_distortion: 0,
          u_contour: 0,
          u_angle: 45,
          u_scale: 8,
          u_shape: 1,
          u_offsetX: 0.1,
          u_offsetY: -0.1,
        },
        undefined,
        0.45,
        undefined,
        1,
        120_000,
      );
    } catch {
      // WebGL desteği olmayan cihazlarda CSS katmanı görünmeye devam eder.
      shaderMount.current = null;
    }

    // ShaderMount canvas'ı 300x150 varsayılanında bırakabiliyor; o zaman desen
    // düğmenin yalnızca bir kısmını kaplıyor. Tamponu kutuya göre eşitle.
    const host = shaderRef.current;
    const syncCanvas = () => {
      const canvas = host.querySelector("canvas");
      if (!canvas) return;
      const { width, height } = host.getBoundingClientRect();
      if (!width || !height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(width * dpr);
      const h = Math.round(height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    syncCanvas();
    const observer = new ResizeObserver(syncCanvas);
    observer.observe(host);

    return () => {
      observer.disconnect();
      shaderMount.current?.dispose();
      shaderMount.current = null;
    };
  }, [reduced]);

  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
    },
    [],
  );

  function schedule(callback: () => void, delay: number) {
    const id = window.setTimeout(() => {
      timers.current = timers.current.filter((timer) => timer !== id);
      callback();
    }, delay);
    timers.current.push(id);
  }

  function handleEnter() {
    if (disabled) return;
    setIsHovered(true);
    shaderMount.current?.setSpeed(1);
  }

  function handleLeave() {
    setIsHovered(false);
    setIsPressed(false);
    shaderMount.current?.setSpeed(0.45);
  }

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    if (disabled) return;
    shaderMount.current?.setSpeed(2.4);
    schedule(() => shaderMount.current?.setSpeed(isHovered ? 1 : 0.45), 300);

    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const ripple = { x: event.clientX - rect.left, y: event.clientY - rect.top, id: rippleId.current++ };
      setRipples((current) => [...current, ripple]);
      schedule(() => setRipples((current) => current.filter((item) => item.id !== ripple.id)), 600);
    }

    onClick?.();
  }

  return (
    <div
      className={`liquid-metal-button liquid-metal-button--${viewMode} ${fullWidth ? "liquid-metal-button--full" : ""} ${className}`}
      data-hovered={isHovered}
      data-pressed={isPressed}
      data-disabled={disabled}
    >
      <div className="liquid-metal-button__surface" aria-hidden>
        <div className="liquid-metal-button__shader" ref={shaderRef} />
      </div>
      <span className="liquid-metal-button__content" aria-hidden>
        {viewMode === "icon" ? <Sparkles size={16} strokeWidth={1.7} /> : label}
      </span>
      <button
        ref={buttonRef}
        type={type}
        onClick={handleClick}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onMouseDown={() => !disabled && setIsPressed(true)}
        onMouseUp={() => setIsPressed(false)}
        onBlur={() => setIsPressed(false)}
        disabled={disabled}
        className="liquid-metal-button__control"
        aria-label={ariaLabel ?? label}
      >
        {ripples.map((ripple) => (
          <span
            key={ripple.id}
            className="liquid-metal-button__ripple"
            style={{ left: `${ripple.x}px`, top: `${ripple.y}px` }}
            aria-hidden
          />
        ))}
      </button>
    </div>
  );
}
