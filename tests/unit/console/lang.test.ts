/** Script-ratio language detection: heavy code-switching must still read as Egyptian Arabic. */
import { describe, expect, it } from "vitest";
import { arabicRatio, detectLocale, dirFor, splitBidiRuns } from "@/lib/client/lang";

describe("detectLocale", () => {
  it("treats plain English as en", () => {
    expect(detectLocale("What did you build at Cravit?")).toBe("en");
  });

  it("treats Masri as ar", () => {
    expect(detectLocale("إزيك، أنا عايز أعرف عملت إيه في كرافيت")).toBe("ar");
  });

  it("keeps a code-switched Masri sentence Arabic", () => {
    expect(detectLocale("أنا عملت deploy للـ backend بتاع كرافيت وظبطت الـ latency")).toBe("ar");
  });

  it("flips to en when the Latin content dominates", () => {
    expect(detectLocale("I rebuilt the whole ordering backend on NestJS and Postgres — يعني")).toBe("en");
  });

  it("ignores digits and punctuation when there are no letters", () => {
    expect(arabicRatio("2026 — 70% ...")).toBe(0);
    expect(detectLocale("2026")).toBe("en");
  });

  it("maps locale to direction", () => {
    expect(dirFor("ar")).toBe("rtl");
    expect(dirFor("en")).toBe("ltr");
  });
});

describe("splitBidiRuns", () => {
  it("isolates Latin runs inside an Arabic sentence", () => {
    const runs = splitBidiRuns("عملت deploy للـ backend");
    expect(runs.filter((r) => r.latin).map((r) => r.text)).toEqual(["deploy", "backend"]);
    expect(runs.map((r) => r.text).join("")).toBe("عملت deploy للـ backend");
  });

  it("returns one non-Latin run for pure Arabic", () => {
    expect(splitBidiRuns("إزيك")).toEqual([{ text: "إزيك", latin: false }]);
  });
});
