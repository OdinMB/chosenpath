import type { HandVerdict } from "./judgedChecks.js";

/*
 * The contest-settled stage's blind hand reading (decision A's seal fix,
 * 2026-10-01/02): each chapter plan's thread on the contest it decides, read in
 * contest-settled-blind.md under its code before the key
 * (keys/contest-settled-blind.json) was opened. yes: each of its three possible
 * milestones decides the contest's question in its own direction (a side's win
 * is that side's resolution, the mixed one a settled compromise), whatever its
 * wording; no: at least one puts the decision off (to a later discussion, vote,
 * review or agreement), settles only who may shape it, or is about something
 * else (the note quotes it); partial: a reader could go either way (left out
 * of the counts). contestSettledPrep.ts unblinds them through the key for
 * contest-settled.md.
 */

export type ContestSettledHandEntry = { hand: HandVerdict; note: string };

const yes = (note: string): ContestSettledHandEntry => ({ hand: true, note });
const no = (note: string): ContestSettledHandEntry => ({ hand: false, note });

export const CONTEST_SETTLED_HAND: Record<string, ContestSettledHandEntry> = {
  // --- Read 2026-10-02 before the key was opened ---
  // The All-District Vending License (round 1, Luz's pick alone, her challenge)
  "3C3A4": yes("Luz earns the license / the city splits it / Jo earns it"),
  "41BE3": yes("Luz awarded / the city splits it into rotating terms / Jo awarded"),
  "5931D": no("unfavorable: 'Jo's inventive-comfort-food approach earns the Hush Basin tasting's decisive favor, putting her ahead in the license contest' (ahead, no award)"),
  EBB6C: yes("The setup's resolutions, the favorable one Luz's side's"),
  // The Black Star Commission (round 1, three players in two camps)
  "3D5B1": yes("The Crown awards it to Ari's camp / joint contractors / the other camp"),
  A9750: yes("Awarded to Ari's camp / joint contractors / Juno and Mika's camp"),
  B385A: yes("Awarded to Ari's camp / joint contractors / Juno and Mika's camp"),
  CA982: yes("Awarded to Ari's camp / joint contractors / the other camp"),
  // Mara's signed offer for Vesper House (round 2, Nia's pick alone, her challenge)
  "5F44F": yes("Nia secures the signed offer / a conditional offer through a solicitor (the setup's mixed) / Rory secures it"),
  A4BA9: yes("Mara signs through Nia / neither, conditional offer / through Rory"),
  AF3B7: yes("Mara signs through Nia / conditional offer / through Rory"),
  CEDC4: yes("Nia secures it / conditional offer / Rory secures it"),
  // The Grand Circuit contract (round 2, both owners)
  "1EDDE": yes("The judges award it to Suri / a shared pilot route (the setup's mixed) / to Jo"),
  "4A551": yes("The adaptive-menu owner wins / the shared pilot route / the neighborhood-rooted owner wins"),
  B82FA: yes("The setup's resolutions word for word"),
  EF59A: yes("Suri awarded / shared pilot route / Jo awarded"),
  // The captain's claim to the Gloam Cache (round 2, Pip's pick alone, her challenge)
  "27A4B": yes("The hearing records Pip's crew plan in place of the captain's claim / a compromise / upholds the captain's claim"),
  "47575": yes("Crew plan in place of the claim / compromise dividing it / the captain's claim stands"),
  "69B2F": yes("The setup's resolutions, the favorable one Pip's side's"),
  AFEB9: yes("The setup's resolutions, the favorable one Pip's side's"),
  // The Gloam House commission (round 3, both agents)
  "14C85": yes("The setup's resolutions word for word"),
  "55015": yes("Rory closes the sale / conditional offer crediting both (the setup's mixed) / Tamsin's signed, funded offer"),
  "64B83": yes("Signed and funded through Rory / conditional offer, no exclusive commission (the setup's mixed) / through Tamsin"),
  DC2BA: yes("Signed and funded through Rory / conditional offer / through Tamsin"),
  // The Festival Circuit contract (round 3, Omar's pick alone, his challenge)
  "3B241": yes("The judges award Omar's truck the route / divide it / award Amara's truck"),
  "48245": no("favorable: 'The crossing inspection strengthens Omar's case for the yearlong circuit'; mixed: 'leaves the contract decision open'; unfavorable: 'weakens Omar's case'"),
  "767C2": no("all three about a crossing procedure 'for the final contract contest' ('a credible service-limit demonstration for the final contract contest'); the contract never decided"),
  "9D01B": yes("The setup's resolutions, the favorable one Omar's side's"),
  // The command seal (round 3, every player after the grouped flavor switch)
  "198F0": no("'The crew entrusts the Route-Reader's Claim with shaping the command-seal discussion ...; custody remains unassigned' (each side's and the mixed one)"),
  "7EAA7": yes("The Route-Reader's Claim takes custody / Ves's custody under a shared-use pact / the Salvagers' Claim takes custody"),
  D81D9: no("'The crew gives the Route-Reader's Claim confidence to shape the next custody discussion, with reviewable terms and no custody assigned' (all three)"),
  DE707: yes("Takes custody / Ves's custody under the pact / the Salvagers' Claim takes custody"),
};
