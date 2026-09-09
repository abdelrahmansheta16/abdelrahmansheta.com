/** Spine i18n guards: the two message catalogues stay in lockstep and locale paths stay stable. */
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import ar from "@/messages/ar.json";
import { dirFor, pathFor, routing } from "@/i18n/routing";

type Json = { [key: string]: string | Json };

function flatten(obj: Json, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    typeof value === "object" && value !== null
      ? flatten(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe("message catalogues", () => {
  it("have identical key sets", () => {
    const enKeys = flatten(en as unknown as Json).sort();
    const arKeys = flatten(ar as unknown as Json).sort();
    expect(arKeys).toEqual(enKeys);
  });

  it("have no empty strings", () => {
    for (const [name, cat] of [
      ["en", en],
      ["ar", ar],
    ] as const) {
      const empty = JSON.stringify(cat).includes('""');
      expect(empty, `${name} has an empty message`).toBe(false);
    }
  });

  it("keeps the Arabic catalogue in Masri, not fusha", () => {
    // Tokenise on Arabic letter runs so that Latin loanwords and substrings never false-positive.
    const words = new Set(JSON.stringify(ar).split(/[^\u0600-\u06FF]+/).filter(Boolean));
    const fusha = [
      "ماذا",
      "لماذا",
      "كيف",
      "لست",
      "ليس",
      "سوف",
      "هذا",
      "هذه",
      "ذلك",
      "الذي",
      "التي",
      "يمكنك",
    ];
    const found = fusha.filter((w) => words.has(w));
    expect(found, `fusha words found: ${found.join(", ")}`).toEqual([]);
  });
});

describe("routing", () => {
  it("puts English at the root and Arabic under /ar", () => {
    expect(pathFor("en", "/")).toBe("/");
    expect(pathFor("en", "/cv")).toBe("/cv");
    expect(pathFor("ar", "/")).toBe("/ar");
    expect(pathFor("ar", "/cv")).toBe("/ar/cv");
  });

  it("marks only Arabic as RTL", () => {
    expect(dirFor("ar")).toBe("rtl");
    expect(dirFor("en")).toBe("ltr");
  });

  it("ships exactly the two planned locales", () => {
    expect([...routing.locales]).toEqual(["en", "ar"]);
    expect(routing.defaultLocale).toBe("en");
  });
});
