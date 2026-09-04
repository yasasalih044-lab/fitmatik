"use client";

import type { TokenUsage } from "@/lib/types";

const n = (v: number) => v.toLocaleString("tr-TR");

/**
 * Son sorgunun token maliyeti. Sağ altta, soluk; okuması isteğe bağlı olsun diye
 * içeriğin akışına girmiyor. Dar ekranda gizli — telefonda yer kaplamasın.
 */
export default function TokenMeter({ last, session }: { last: TokenUsage | null; session: TokenUsage }) {
  if (!last && session.total === 0) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed bottom-3 right-4 z-20 hidden text-right sm:block"
    >
      {last && (
        <p className="mono text-[10px] leading-tight text-[var(--faint)]/70">
          bu sorgu {n(last.total)} token
          <span className="text-[var(--faint)]/50"> ({n(last.input)} giriş + {n(last.output)} çıkış)</span>
        </p>
      )}
      {session.total > 0 && (
        <p className="mono text-[10px] leading-tight text-[var(--faint)]/45">
          oturum toplamı {n(session.total)}
        </p>
      )}
    </div>
  );
}
