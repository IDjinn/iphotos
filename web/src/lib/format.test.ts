import { describe, expect, it } from "vitest";
import { formatBytes, formatDate } from "./format";

describe("formatBytes", () => {
  it("formats bytes without decimals", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
  });

  it("scales up to KB/MB/GB with sensible precision", () => {
    expect(formatBytes(1024)).toBe("1.00 KB");
    expect(formatBytes(1536)).toBe("1.50 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.00 MB");
    expect(formatBytes(3.5 * 1024 * 1024 * 1024)).toBe("3.50 GB");
  });

  it("reaches TB and handles invalid input", () => {
    expect(formatBytes(2 * 1024 ** 4)).toBe("2.00 TB");
    expect(formatBytes(-1)).toBe("—");
  });
});

describe("formatDate", () => {
  it("returns a dash for absent or invalid dates", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("not-a-date")).toBe("—");
  });

  it("formats an ISO date", () => {
    expect(formatDate("2025-12-25T10:30:00+00:00")).toMatch(/Dec 25, 2025|25 de dez/);
  });
});
