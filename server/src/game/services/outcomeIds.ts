/** An id-like word, as the rating page reads directions: it holds an underscore ("player1_trust"), so "(optional)" is not one */
const ID_WORD = /^[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+$/;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The story's outcome ids a direction names anywhere, and the id-like words in
 * its brackets that the story doesn't hold (the plan check, the planners' pick
 * and the eval's direction checks read directions this way).
 */
export function outcomeIdsNamed(direction: string, known: string[]): { known: string[]; unknown: string[] } {
  const mentioned = known.filter((id) => new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(id)}(?![A-Za-z0-9_])`).test(direction));
  const bracketed = [...direction.matchAll(/\(([^()]*)\)/g)]
    .flatMap((match) => match[1].split(/[\s,;]+/))
    .filter((word) => ID_WORD.test(word) && !known.includes(word));
  return { known: mentioned, unknown: [...new Set(bracketed)] };
}
