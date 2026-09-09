/** Unit tests for speech normalisation: EN and Masri number words, years, percent, currency, counted nouns. */
import { describe, expect, it } from "vitest";
import { normaliseForSpeech, numberToWords } from "@/lib/brain/normalise";
import type { Locale } from "@/lib/tools/schema";

interface Case {
  input: string;
  locale: Locale;
  expected: string;
}

/* ------------------------------------------------------------------ *
 * numberToWords
 * ------------------------------------------------------------------ */

const EN_CARDINALS: ReadonlyArray<readonly [number, string]> = [
  [0, "zero"],
  [1, "one"],
  [7, "seven"],
  [11, "eleven"],
  [19, "nineteen"],
  [20, "twenty"],
  [23, "twenty-three"],
  [45, "forty-five"],
  [70, "seventy"],
  [99, "ninety-nine"],
  [100, "one hundred"],
  [101, "one hundred one"],
  [250, "two hundred fifty"],
  [999, "nine hundred ninety-nine"],
  [1000, "one thousand"],
  [2100, "two thousand one hundred"],
  [7500, "seven thousand five hundred"],
  [22000, "twenty-two thousand"],
  [38000, "thirty-eight thousand"],
  [45000, "forty-five thousand"],
  [1000000, "one million"],
  [1200000000, "one billion two hundred million"],
];

const AR_CARDINALS: ReadonlyArray<readonly [number, string]> = [
  [0, "صفر"],
  [1, "واحد"],
  [2, "اتنين"],
  [3, "تلاتة"],
  [4, "أربعة"],
  [5, "خمسة"],
  [6, "ستة"],
  [7, "سبعة"],
  [8, "تمانية"],
  [9, "تسعة"],
  [10, "عشرة"],
  [11, "حداشر"],
  [12, "اتناشر"],
  [13, "تلتاشر"],
  [14, "أربعتاشر"],
  [15, "خمستاشر"],
  [16, "ستاشر"],
  [17, "سبعتاشر"],
  [18, "تمنتاشر"],
  [19, "تسعتاشر"],
  [20, "عشرين"],
  [23, "تلاتة وعشرين"],
  [30, "تلاتين"],
  [38, "تمنية وتلاتين"],
  [40, "أربعين"],
  [45, "خمسة وأربعين"],
  [50, "خمسين"],
  [60, "ستين"],
  [70, "سبعين"],
  [80, "تمانين"],
  [90, "تسعين"],
  [100, "مية"],
  [200, "ميتين"],
  [300, "تلتمية"],
  [400, "ربعمية"],
  [500, "خمسمية"],
  [600, "ستمية"],
  [700, "سبعمية"],
  [800, "تمنمية"],
  [900, "تسعمية"],
  [1000, "ألف"],
  [2000, "ألفين"],
  [2100, "ألفين ومية"],
  [3000, "تلاتالاف"],
  [7500, "سبع آلاف وخمسمية"],
  [22000, "اتنين وعشرين ألف"],
  [38000, "تمنية وتلاتين ألف"],
  [45000, "خمسة وأربعين ألف"],
  [1000000, "مليون"],
];

describe("numberToWords", () => {
  it.each(EN_CARDINALS)("en cardinal %i", (n, expected) => {
    expect(numberToWords(n, "en")).toBe(expected);
  });

  it.each(AR_CARDINALS)("ar cardinal %i", (n, expected) => {
    expect(numberToWords(n, "ar")).toBe(expected);
  });

  it.each([
    [2023, "twenty twenty-three"],
    [2006, "two thousand six"],
    [2000, "two thousand"],
    [2019, "twenty nineteen"],
    [1995, "nineteen ninety-five"],
    [1905, "nineteen oh five"],
    [1900, "nineteen hundred"],
  ])("en year %i", (n, expected) => {
    expect(numberToWords(n, "en", "year")).toBe(expected);
  });

  it.each([
    [2023, "ألفين وتلاتة وعشرين"],
    [2006, "ألفين وستة"],
    [2000, "ألفين"],
    [2016, "ألفين وستاشر"],
    [1995, "ألف وتسعمية وخمسة وتسعين"],
  ])("ar year %i", (n, expected) => {
    expect(numberToWords(n, "ar", "year")).toBe(expected);
  });

  it("renders percentages", () => {
    expect(numberToWords(70, "en", "percent")).toBe("seventy percent");
    expect(numberToWords(70, "ar", "percent")).toBe("سبعين في المية");
  });

  it("rejects a non-finite number", () => {
    expect(() => numberToWords(Number.NaN, "en")).toThrow(RangeError);
  });
});

/* ------------------------------------------------------------------ *
 * normaliseForSpeech
 * ------------------------------------------------------------------ */

const EN_CASES: readonly Case[] = [
  { input: "70%", locale: "en", expected: "seventy percent" },
  { input: "99.95%", locale: "en", expected: "ninety-nine point nine five percent" },
  { input: "2,100", locale: "en", expected: "two thousand one hundred" },
  { input: "22,000", locale: "en", expected: "twenty-two thousand" },
  { input: "38,000", locale: "en", expected: "thirty-eight thousand" },
  { input: "45,000", locale: "en", expected: "forty-five thousand" },
  { input: "7,500", locale: "en", expected: "seven thousand five hundred" },
  { input: "1,000", locale: "en", expected: "one thousand" },
  { input: "$1.2B", locale: "en", expected: "one point two billion dollars" },
  { input: "$5,000", locale: "en", expected: "five thousand dollars" },
  { input: "€300", locale: "en", expected: "three hundred euros" },
  { input: "£250", locale: "en", expected: "two hundred fifty pounds" },
  { input: "80k", locale: "en", expected: "eighty thousand" },
  { input: "2023", locale: "en", expected: "twenty twenty-three" },
  { input: "2006", locale: "en", expected: "two thousand six" },
  { input: "He joined in 2019 and shipped 2,100 endpoints.", locale: "en", expected: "He joined in twenty nineteen and shipped two thousand one hundred endpoints." },
  { input: "Uptime held at 99.95% for 14 months.", locale: "en", expected: "Uptime held at ninety-nine point nine five percent for fourteen months." },
  { input: "The protocol holds $1.2B TVL.", locale: "en", expected: "The protocol holds one point two billion dollars TVL." },
  { input: "Cost fell 70% in 3 weeks.", locale: "en", expected: "Cost fell seventy percent in three weeks." },
  { input: "There are 14 restaurants.", locale: "en", expected: "There are fourteen restaurants." },
  { input: "Latency went from 900 ms to 300 ms.", locale: "en", expected: "Latency went from nine hundred ms to three hundred ms." },
  { input: "6000 USD", locale: "en", expected: "six thousand dollars" },
  { input: "1.8 seconds", locale: "en", expected: "one point eight seconds" },
  { input: "Version 2 of the API.", locale: "en", expected: "Version two of the API." },
  { input: "No numbers here at all.", locale: "en", expected: "No numbers here at all." },
  { input: "0", locale: "en", expected: "zero" },
  { input: "11 weeks", locale: "en", expected: "eleven weeks" },
  { input: "12 services", locale: "en", expected: "twelve services" },
  { input: "40% to 85%", locale: "en", expected: "forty percent to eighty-five percent" },
  { input: "1,200,000 rows", locale: "en", expected: "one million two hundred thousand rows" },
];

const AR_CASES: readonly Case[] = [
  { input: "70%", locale: "ar", expected: "سبعين في المية" },
  { input: "99.95%", locale: "ar", expected: "تسعة وتسعين فاصلة خمسة وتسعين في المية" },
  { input: "2,100", locale: "ar", expected: "ألفين ومية" },
  { input: "22,000", locale: "ar", expected: "اتنين وعشرين ألف" },
  { input: "38,000", locale: "ar", expected: "تمنية وتلاتين ألف" },
  { input: "45,000", locale: "ar", expected: "خمسة وأربعين ألف" },
  { input: "7,500", locale: "ar", expected: "سبع آلاف وخمسمية" },
  { input: "1,000", locale: "ar", expected: "ألف" },
  { input: "$1.2B", locale: "ar", expected: "واحد فاصلة اتنين مليار دولار" },
  { input: "$5,000", locale: "ar", expected: "خمس آلاف دولار" },
  { input: "€300", locale: "ar", expected: "تلتمية يورو" },
  { input: "2023", locale: "ar", expected: "ألفين وتلاتة وعشرين" },
  { input: "2016", locale: "ar", expected: "ألفين وستاشر" },
  { input: "3 سنين", locale: "ar", expected: "تلات سنين" },
  { input: "5 مشاريع", locale: "ar", expected: "خمس مشاريع" },
  { input: "8 أسابيع", locale: "ar", expected: "تمن أسابيع" },
  { input: "3", locale: "ar", expected: "تلاتة" },
  { input: "8", locale: "ar", expected: "تمانية" },
  { input: "3 endpoints", locale: "ar", expected: "تلاتة endpoints" },
  { input: "٧٠٪", locale: "ar", expected: "سبعين في المية" },
  { input: "٢٠٢٣", locale: "ar", expected: "ألفين وتلاتة وعشرين" },
  { input: "۱۲", locale: "ar", expected: "اتناشر" },
  { input: "قلل التكلفة 70% في 3 أسابيع.", locale: "ar", expected: "قلل التكلفة سبعين في المية في تلات أسابيع." },
  { input: "وصلنا 2,100 endpoint.", locale: "ar", expected: "وصلنا ألفين ومية endpoint." },
  { input: "فيه 14 مطعم.", locale: "ar", expected: "فيه أربعتاشر مطعم." },
  { input: "مفيش أرقام هنا.", locale: "ar", expected: "مفيش أرقام هنا." },
  { input: "11 أسبوع", locale: "ar", expected: "حداشر أسبوع" },
  { input: "20 pull request", locale: "ar", expected: "عشرين pull request" },
  { input: "1.8 ثانية", locale: "ar", expected: "واحد فاصلة تمانية ثانية" },
  { input: "240 ثانية", locale: "ar", expected: "ميتين وأربعين ثانية" },
];

describe.each([...EN_CASES, ...AR_CASES])("normaliseForSpeech %#", (testCase) => {
  it(`${testCase.locale}: ${testCase.input}`, () => {
    expect(normaliseForSpeech(testCase.input, { locale: testCase.locale })).toBe(testCase.expected);
  });
});

describe("normaliseForSpeech options", () => {
  it("has at least 60 fixtures across EN and AR", () => {
    expect(EN_CASES.length + AR_CASES.length).toBeGreaterThanOrEqual(60);
    expect(EN_CASES.length).toBeGreaterThan(0);
    expect(AR_CASES.length).toBeGreaterThan(0);
  });

  it("leaves keepLatin terms untouched, digits and all", () => {
    const out = normaliseForSpeech("شغالين على Flash v2.5 و S3 من 3 شهور.", {
      locale: "ar",
      keepLatin: ["Flash v2.5", "S3"],
    });
    expect(out).toBe("شغالين على Flash v2.5 و S3 من تلات شهور.");
  });

  it("keeps Latin tech terms in English sentences", () => {
    const out = normaliseForSpeech("We run FastAPI on Next.js 16 today.", {
      locale: "en",
      keepLatin: ["Next.js 16", "FastAPI"],
    });
    expect(out).toBe("We run FastAPI on Next.js 16 today.");
  });

  it("applies the tashkeel map on whole words only", () => {
    const out = normaliseForSpeech("عملنا الـ deploy على السيرفر.", {
      locale: "ar",
      tashkeel: { عملنا: "عَمَلْنا", السيرفر: "السِيرفَر" },
    });
    expect(out).toContain("عَمَلْنا");
    expect(out).toContain("السِيرفَر");
  });

  it("does not partially match a tashkeel key inside a longer word", () => {
    const out = normaliseForSpeech("بنعمل حاجات كتير.", { locale: "ar", tashkeel: { عمل: "عَمَل" } });
    expect(out).toBe("بنعمل حاجات كتير.");
  });

  it("returns an empty string for empty input", () => {
    expect(normaliseForSpeech("", { locale: "en" })).toBe("");
  });
});
