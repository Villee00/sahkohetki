import { describe, expect, it } from "vitest";
import {
  formatIntervalLabel,
  getHelsinkiDateBounds,
  getHelsinkiDateKey,
} from "./time";

describe("Europe/Helsinki time helpers", () => {
  it("formats UTC instants in Finnish local time", () => {
    expect(getHelsinkiDateKey(new Date("2026-08-22T21:30:00.000Z"))).toBe("2026-08-23");
    expect(formatIntervalLabel("2026-08-22T21:30:00.000Z", "2026-08-22T22:30:00.000Z")).toContain("00:30");
  });

  it("rejects timezone-less datetime strings", () => {
    expect(() => getHelsinkiDateKey("2026-08-22T12:00:00")).toThrow();
  });

  it("accepts explicit UTC datetime strings", () => {
    expect(getHelsinkiDateKey("2026-08-22T12:00:00.000Z")).toBe("2026-08-22");
    expect(
      formatIntervalLabel("2026-08-22T12:00:00.000Z", "2026-08-22T13:00:00.000Z"),
    ).toBe("15:00–16:00");
  });

  it("keeps the spring and autumn Finnish dates at 23 and 25 elapsed hours", () => {
    const spring = getHelsinkiDateBounds("2026-03-29");
    const autumn = getHelsinkiDateBounds("2026-10-25");
    expect(Date.parse(spring.endAt) - Date.parse(spring.startAt)).toBe(23 * 60 * 60 * 1000);
    expect(Date.parse(autumn.endAt) - Date.parse(autumn.startAt)).toBe(25 * 60 * 60 * 1000);
  });

  it("adds an offset suffix to repeated autumn clock hours", () => {
    expect(
      formatIntervalLabel("2026-10-25T00:00:00.000Z", "2026-10-25T01:00:00.000Z"),
    ).toContain("UTC+3");
    expect(
      formatIntervalLabel("2026-10-25T01:00:00.000Z", "2026-10-25T02:00:00.000Z"),
    ).toContain("UTC+2");
  });
});
