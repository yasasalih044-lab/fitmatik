"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const raw = useSearchParams().get("next") || "/upload";
  // Yalnızca site içi yollara dön — "//evil.com" gibi değerler dışarı yönlendirir.
  const next = /^\/(?!\/)/.test(raw) ? raw : "/upload";
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    setBusy(false);
    if (res.ok) {
      router.replace(next);
      router.refresh();
    } else {
      setError("PIN hatalı. Tekrar dene.");
      setPin("");
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-[320px] space-y-4">
      <div className="flex items-center gap-2">
        <span className="block h-4 w-1 rounded-sm bg-[var(--ink)]" />
        <span className="display text-[19px]">Fit-matik</span>
      </div>
      <p className="text-[13px] leading-snug text-[var(--muted)]">Günlüğüne girmek için PIN'i yaz.</p>
      <input
        type="password"
        inputMode="numeric"
        autoFocus
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        placeholder="••••"
        className="mono text-center text-[18px] tracking-[0.3em]"
      />
      {error && <p className="text-[13px] text-[var(--red)]">{error}</p>}
      <button type="submit" disabled={busy || !pin} className="btn btn-primary w-full">
        {busy ? "Kontrol ediliyor…" : "Gir"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
