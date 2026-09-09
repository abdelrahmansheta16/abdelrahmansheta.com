/** Unit tests for the corpus lints: normalisation, denylist, digits, allowlist, string collection. */
import { describe, expect, it } from "vitest";
import {
  ANY_DIGIT,
  collectStrings,
  findAllowlistViolations,
  findDenylistHits,
  findDigitHits,
  normaliseForMatch,
  parseListFile,
} from "@/lib/corpus/lint";

describe("normaliseForMatch", () => {
  it("folds Arabic-Indic digits to ASCII", () => {
    expect(normaliseForMatch("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
    expect(normaliseForMatch("۰۱۲۳")).toBe("0123");
  });

  it("strips tatweel and tashkeel and unifies letter variants", () => {
    expect(normaliseForMatch("مـــرحبا")).toBe("مرحبا");
    expect(normaliseForMatch("مُرَحَّب")).toBe("مرحب");
    expect(normaliseForMatch("أحمد")).toBe(normaliseForMatch("احمد"));
    expect(normaliseForMatch("مصرية")).toBe(normaliseForMatch("مصريه"));
  });

  it("lower-cases and collapses whitespace", () => {
    expect(normaliseForMatch("  Hello   WORLD \n")).toBe("hello world");
  });
});

describe("parseListFile", () => {
  it("drops comments and blank lines", () => {
    expect(parseListFile("# note\n\nalpha\n  beta  \n#tail\n")).toEqual(["alpha", "beta"]);
  });
});

describe("findDenylistHits", () => {
  const denylist = ["01000000000", "someone@example.com", "0100 000 0000"];

  it("finds an ASCII match regardless of case", () => {
    expect(findDenylistHits("write to SOMEONE@Example.com", denylist)).toEqual(["someone@example.com"]);
  });

  it("finds a number written in Arabic-Indic digits", () => {
    expect(findDenylistHits("رقمي ٠١٠٠٠٠٠٠٠٠٠ لو حبيت", denylist)).toContain("01000000000");
  });

  it("finds a spaced number after whitespace collapsing", () => {
    expect(findDenylistHits("call   0103   383   4714 now", denylist)).toContain("0100 000 0000");
  });

  it("returns nothing for clean text", () => {
    expect(findDenylistHits("nothing to see here", denylist)).toEqual([]);
  });
});

describe("findDigitHits", () => {
  it("flags ASCII and Arabic-Indic digits", () => {
    expect(findDigitHits("cut cost by 70%")).toEqual(["70"]);
    expect(findDigitHits("نزلت ٧٠ في المية")).toEqual(["٧٠"]);
  });

  it("passes text where numbers are words", () => {
    expect(findDigitHits("نزلت سبعين في المية")).toEqual([]);
  });
});

describe("findAllowlistViolations", () => {
  const allowlist = ["Fanous", "Puffer Protocol", "Postgres"];

  it("flags a capitalised token that is not allowlisted", () => {
    expect(findAllowlistViolations("I shipped it at Fanous on Kafka.", allowlist)).toEqual(["Kafka"]);
  });

  it("clears both words of a multi-word entry", () => {
    expect(findAllowlistViolations("The Puffer Protocol audit closed.", allowlist)).toEqual([]);
  });

  it("allows common words at the start of a sentence or line", () => {
    expect(findAllowlistViolations("The queue died.\nNo repeat incident.", allowlist)).toEqual([]);
  });

  it("still flags a proper noun at the start of a sentence", () => {
    expect(findAllowlistViolations("Kafka died overnight.", allowlist)).toEqual(["Kafka"]);
  });

  it("ignores single-letter tokens such as the pronoun I", () => {
    expect(findAllowlistViolations("I paused it and I fixed it.", allowlist)).toEqual([]);
  });
});

describe("collectStrings", () => {
  it("walks nested arrays and objects", () => {
    expect(collectStrings({ a: "one", b: [{ c: "two" }, 3, null], d: true })).toEqual(["one", "two"]);
  });
});

describe("ANY_DIGIT", () => {
  it("matches both digit families", () => {
    expect(ANY_DIGIT.test("7")).toBe(true);
    expect(ANY_DIGIT.test("٧")).toBe(true);
    expect(ANY_DIGIT.test("سبعة")).toBe(false);
  });
});
