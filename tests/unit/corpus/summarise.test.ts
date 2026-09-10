/**
 * The project cards render derived text. Derivation that silently changes what a card says is a
 * content bug on a public page, so the rules are pinned here — most importantly that a redacted
 * body derives to nothing rather than leaking through a side door.
 */
import { describe, expect, it } from "vitest";
import { firstSentence, summariseBody } from "@/lib/corpus/summarise";

const BODY = `
The speech half of Rafeeq: a coaching companion you talk to instead of typing at. Audio goes up a
WebSocket and comes back down the same socket.

## Why it streams

A request-and-response loop measures its latency once, at the end. In voice, the wait *is* the
product failing.

## The hard part

Code-switching. Nobody here speaks clean Arabic or clean English.

## What I will not discuss

Client identities and anything under NDA.
`;

describe("firstSentence", () => {
  it("stops at the first full stop followed by a space", () => {
    expect(firstSentence("One thing. Then another.")).toBe("One thing.");
  });

  it("does not split a decimal — the trap that once turned 99.95% into 99.", () => {
    expect(firstSentence("It held 99.95% uptime through the migration. Then more.")).toBe(
      "It held 99.95% uptime through the migration.",
    );
  });

  it("handles ? and !", () => {
    expect(firstSentence("Why does it stream? Because latency.")).toBe("Why does it stream?");
  });

  it("returns the whole string when there is no terminator", () => {
    expect(firstSentence("no terminator here")).toBe("no terminator here");
  });

  it("strips markdown emphasis, code and link syntax", () => {
    expect(firstSentence("The wait **is** the `product` [failing](http://x). More.")).toBe(
      "The wait is the product failing.",
    );
  });
});

describe("summariseBody", () => {
  const summary = summariseBody(BODY);

  it("takes the lead from the paragraph before the first heading", () => {
    expect(summary.lead).toContain("The speech half of Rafeeq");
    expect(summary.lead).not.toContain("Why it streams");
  });

  it("makes one bullet per section, labelled with the author's own heading", () => {
    expect(summary.highlights.map((h) => h.label)).toEqual(["Why it streams", "The hard part"]);
  });

  it("omits sections describing what is deliberately absent", () => {
    expect(summary.highlights.map((h) => h.label)).not.toContain("What I will not discuss");
    expect(JSON.stringify(summary)).not.toContain("NDA");
  });

  it("pulls a second sentence when the first is a bare fragment", () => {
    // "Code-switching." alone reads as a riddle on a card.
    const hard = summary.highlights.find((h) => h.label === "The hard part");
    expect(hard?.text).toContain("Code-switching.");
    expect(hard?.text).toContain("clean Arabic");
  });

  it("carries no markdown into the output", () => {
    expect(JSON.stringify(summary)).not.toMatch(/[*`#]/);
  });

  /**
   * The confidentiality path. summary_only bodies are emptied by the compiler before this runs, so
   * the derivation must produce nothing — otherwise it would be a second route onto the page for
   * content the employer did not want published.
   */
  it("derives nothing from an empty body", () => {
    expect(summariseBody("")).toEqual({ lead: "", highlights: [] });
    expect(summariseBody("   \n  \n")).toEqual({ lead: "", highlights: [] });
  });

  it("caps the number of bullets", () => {
    const many = Array.from({ length: 9 }, (_, i) => `## Section ${String(i)}\n\nSentence ${String(i)} here and it runs on.\n`).join("\n");
    expect(summariseBody(many).highlights).toHaveLength(4);
    expect(summariseBody(many, 2).highlights).toHaveLength(2);
  });

  it("keeps every bullet short enough for a card", () => {
    for (const h of summary.highlights) expect(h.text.length).toBeLessThanOrEqual(210);
  });
});

describe("summariseBody — against the real compiled corpus", () => {
  it("gives every public project bullets, and the redacted one none", async () => {
    const { CORPUS } = await import("@/lib/corpus/corpus.generated");
    const projects = CORPUS.projects;
    expect(projects.length).toBeGreaterThan(0);
    for (const project of projects) {
      if (project.public_level === "summary_only") {
        expect(project.summary.highlights, `${project.slug} must derive nothing`).toEqual([]);
        expect(project.summary.lead).toBe("");
      } else {
        expect(project.summary.highlights.length, `${project.slug} needs bullets`).toBeGreaterThan(0);
      }
    }
  });
});
