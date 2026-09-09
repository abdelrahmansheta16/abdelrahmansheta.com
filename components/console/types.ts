/** The slice of the compiled corpus the console and its cards actually need. Nothing secret in here. */
import type { Links, Logistics, ProofPoint } from "@/lib/corpus/schema";

export interface ConsoleProjectMetric {
  text: string;
  verified: boolean;
  public: boolean;
}

export interface ConsoleProject {
  slug: string;
  name: string;
  employer: string;
  period: string;
  metrics: ConsoleProjectMetric[];
}

export interface ConsoleCorpus {
  links: Links;
  logistics: Logistics;
  proofPoints: ProofPoint[];
  projects: ConsoleProject[];
}
