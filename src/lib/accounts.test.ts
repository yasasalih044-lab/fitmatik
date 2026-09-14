import { describe, expect, it } from "vitest";
import { normalizePhone, passwordError } from "./accounts";

describe("account credentials", () => {
  it("normalizes common Turkish phone formats to one E.164 identity", () => {
    expect(normalizePhone("0545 676 82 80")).toBe("+905456768280");
    expect(normalizePhone("+90 (545) 676-82-80")).toBe("+905456768280");
    expect(normalizePhone("00905456768280")).toBe("+905456768280");
  });

  it("rejects malformed phone numbers", () => {
    expect(normalizePhone("545 676 82")).toBeNull();
    expect(normalizePhone("+90 545 676 82 800")).toBeNull();
    expect(normalizePhone("not a phone")).toBeNull();
  });

  it("accepts only 8–128 ASCII letters and digits for passwords", () => {
    expect(passwordError("abc12345")).toBeNull();
    expect(passwordError("12345678")).toBeNull();
    expect(passwordError("short7")).not.toBeNull();
    expect(passwordError("sifre!123")).not.toBeNull();
    expect(passwordError("şifre123")).not.toBeNull();
    expect(passwordError("a".repeat(129))).not.toBeNull();
  });
});
