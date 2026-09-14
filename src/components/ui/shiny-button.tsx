"use client";

import type React from "react";

type ShinyButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
};

/** Tema aksanını kullanan, hareketli/metal efekt içermeyen ana işlem düğmesi. */
export function ShinyButton({
  children,
  onClick,
  className = "",
  type = "button",
  disabled = false,
}: ShinyButtonProps) {
  return (
    <button type={type} className={`btn btn-primary w-full min-h-14 ${className}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export default ShinyButton;
