/*
 * "Start several stories at once" is for anyone running several stories at
 * once: a class, a workshop, a game night, or several players on their own.
 * The owner asked that the app's wording for it name no audience and no group
 * size (2026-10-26); the audience pages explain it in their own terms.
 */

/** Words the several-stories wording in the app must not use. */
export const AUDIENCE_WORDS = /\b(groups?|class(es|room|rooms)?|facilitators?|students?|teachers?)\b/i;
