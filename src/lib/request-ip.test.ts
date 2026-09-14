import { describe, expect, it } from "vitest";
import { requestIp } from "./request-ip";

describe("requestIp", () => {
  it("uses the proxy-appended final forwarded address", () => {
    const req = new Request("https://fitmatik.example", {
      headers: { "x-forwarded-for": "203.0.113.99, 198.51.100.24", "x-real-ip": "203.0.113.98" },
    });
    expect(requestIp(req)).toBe("198.51.100.24");
  });

  it("falls back to a canonical proxy header and then unknown", () => {
    expect(requestIp(new Request("https://fitmatik.example", { headers: { "cf-connecting-ip": "192.0.2.7" } }))).toBe("192.0.2.7");
    expect(requestIp(new Request("https://fitmatik.example"))).toBe("unknown");
  });
});
