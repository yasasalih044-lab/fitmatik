"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Lock } from "lucide-react";
import Wordmark from "@/components/Wordmark";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }).catch(() => null);
    if (res?.ok) {
      router.replace("/");
      return;
    }
    const data = (await res?.json().catch(() => null)) as { error?: string } | null;
    setError(data?.error || "Bağlantı kurulamadı.");
    setBusy(false);
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-line bg-panel p-6">
        <Wordmark />
        <h1 className="mt-8 font-display text-2xl font-bold tracking-tight">Stüdyoya giriş</h1>
        <p className="mt-1 text-sm text-muted">Üretim API anahtarını koruduğumuz için şifre istiyoruz.</p>
        <label className="mt-6 block text-sm font-medium" htmlFor="password">Şifre</label>
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-line bg-field px-3 focus-within:border-accent">
          <Lock className="size-4 text-faint" aria-hidden />
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 w-full bg-transparent outline-none"
            required
          />
        </div>
        {error && <p className="mt-3 text-sm text-bad" role="alert">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent font-semibold text-on-accent transition hover:bg-accent-strong disabled:opacity-50"
        >
          {busy ? "Kontrol ediliyor…" : "Giriş yap"} <ArrowRight className="size-4" aria-hidden />
        </button>
      </form>
    </main>
  );
}
