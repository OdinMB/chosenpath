/*
 * What the app refuses whatever the story or the template: the owner's
 * safeguards against the AI Act's Art. 5 ban on non-consensual intimate
 * imagery and child sexual abuse material (applies from 2 Dec 2026). The text
 * filter screens premises and image requests for these rules, and every image
 * prompt carries them. Background: .context/content-safety.md.
 */

export const PROHIBITED_CONTENT_RULES: readonly string[] = [
  "Sexual or sexualised content involving minors: anyone under 18, or anyone described or shown as a child or teenager. This includes nudity, suggestive poses and romantic or sexual framing.",
  "Real, identifiable people (named or recognisable public figures, private individuals, or anyone shown in a reference photo) in sexual, intimate, nude or humiliating situations.",
  "Undressing, nudifying or stripping anyone, or removing or altering clothing to expose a body, including people shown in reference or uploaded images.",
];
