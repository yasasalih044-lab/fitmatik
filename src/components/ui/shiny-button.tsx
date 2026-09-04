"use client";

import type React from "react";

type ShinyButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
};

/**
 * Dönen konik gradyanlı vurgu düğmesi. Vurgu rengi sabit değil, temadan gelir
 * (`--shiny-highlight`): siyahta yeşil, pembede neon pembe, kırmızıda kırmızı.
 * Stiller globals.css'te — @property tanımları katman dışında olmalı.
 */
export function ShinyButton({
  children,
  onClick,
  className = "",
  type = "button",
  disabled = false,
}: ShinyButtonProps) {
  return (
    <button type={type} className={`shiny-cta ${className}`} onClick={onClick} disabled={disabled}>
      <span>{children}</span>
    </button>
  );
}

export default ShinyButton;
