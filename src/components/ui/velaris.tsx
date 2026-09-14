"use client";

import { getShaderColorFromString, meshGradientFragmentShader, ShaderMount } from "@paper-design/shaders";
import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

type ShaderColor = [number, number, number, number];

function themeColors(): ShaderColor[] {
  const style = getComputedStyle(document.documentElement);
  return [
    "--velaris-base",
    "--velaris-color-1",
    "--velaris-color-2",
    "--velaris-color-3",
    "--velaris-color-4",
  ].map((name) => getShaderColorFromString(style.getPropertyValue(name).trim()) as ShaderColor);
}

/**
 * Theme-aware, deliberately restrained WebGL field used behind every page.
 * The CSS gradient below it is the complete fallback for unsupported WebGL and
 * reduced-motion users, so visual polish never becomes a dependency for use.
 */
export function Velaris({ className = "" }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const shaderRef = useRef<ShaderMount | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const host = hostRef.current;
    if (!host || reducedMotion) return;

    const syncColors = () => {
      shaderRef.current?.setUniforms({
        u_colors: themeColors(),
        u_colorsCount: 5,
      });
    };

    try {
      shaderRef.current = new ShaderMount(
        host,
        meshGradientFragmentShader,
        {
          u_colors: themeColors(),
          u_colorsCount: 5,
          u_distortion: 0.16,
          u_swirl: 0.1,
          // Doku/gren kullanmıyoruz; bu yalnızca yumuşak renk alanı.
          u_grainMixer: 0,
          u_grainOverlay: 0,
        },
        { alpha: true, antialias: false, powerPreference: "low-power" },
        0.12,
        undefined,
        1,
        320_000,
      );

      const observer = new MutationObserver(syncColors);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

      return () => {
        observer.disconnect();
        shaderRef.current?.dispose();
        shaderRef.current = null;
      };
    } catch {
      // Canvas oluşturulamazsa CSS zemini görünür ve uygulama tam işlevli kalır.
      shaderRef.current = null;
      return;
    }
  }, [reducedMotion]);

  return <div ref={hostRef} className={`velaris ${className}`} aria-hidden="true" />;
}

export default Velaris;
