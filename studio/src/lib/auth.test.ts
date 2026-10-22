import { afterEach, describe, expect, it, vi } from "vitest";
import { allowAttempt, authMode, checkPassword, createSession, verifySession } from "./auth";

afterEach(() => vi.unstubAllEnvs());

describe("auth", () => {
  it("üretimde şifre/gizli anahtar yoksa kilitli kalır", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STUDIO_PASSWORD", "");
    vi.stubEnv("STUDIO_SECRET", "");
    expect(authMode()).toBe("misconfigured");
    vi.stubEnv("STUDIO_PASSWORD", "sifre");
    vi.stubEnv("STUDIO_SECRET", "kisa");
    expect(authMode()).toBe("misconfigured");
    vi.stubEnv("STUDIO_SECRET", "x".repeat(32));
    expect(authMode()).toBe("locked");
  });

  it("oturum imzasını ve süresini doğrular", () => {
    vi.stubEnv("STUDIO_SECRET", "a".repeat(32));
    const now = Date.now();
    const token = createSession(now);
    expect(verifySession(token, now)).toBe(true);
    expect(verifySession(token, now + 15 * 24 * 3600 * 1000)).toBe(false);
    expect(verifySession(token.replace(/.$/, (c) => (c === "A" ? "B" : "A")), now)).toBe(false);
    expect(verifySession(`9999999999.${token.split(".")[1]}`, now)).toBe(false);
    vi.stubEnv("STUDIO_SECRET", "b".repeat(32));
    expect(verifySession(token, now)).toBe(false);
  });

  it("şifreyi karşılaştırır ve denemeleri sınırlar", () => {
    vi.stubEnv("STUDIO_PASSWORD", "dogru-sifre");
    expect(checkPassword("dogru-sifre")).toBe(true);
    expect(checkPassword("yanlis")).toBe(false);
    const ip = `test-${Math.random()}`;
    const results = Array.from({ length: 11 }, () => allowAttempt(ip, 1000));
    expect(results.slice(0, 10).every(Boolean)).toBe(true);
    expect(results[10]).toBe(false);
    expect(allowAttempt(ip, 1000 + 11 * 60_000)).toBe(true);
  });
});
