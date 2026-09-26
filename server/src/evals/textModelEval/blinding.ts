import type { RatingKey, RatingSet } from "./ratingSets.js";

/*
 * Proves that a rating page reveals no arm. Every non-narrative string must
 * pass the word pattern; the final HTML must not contain any arm key, model
 * id, effort in key form or variant id from the answer key, nor the key's
 * file name. Narrative (story text, premises, option texts) is exempt from
 * the word pattern, since "Sol" and "Luna" are common names in fiction, but
 * not from the literal scan.
 */

export const LEAK_PATTERN =
  /gpt[-_ ]?\d|chatgpt|openai|\bsol\b|\bluna\b|effort|reasoning|baseline|\b(none|minimal|low|medium|high)\b/i;

export const ITEM_ID = /^(setup|turn)-\d{2}$/;
export const LABEL = /^[A-D]$/;

/** Rater-visible strings that are not narrative, with what they are. */
function metadataStrings(set: RatingSet): { where: string; value: string }[] {
  const strings: { where: string; value: string }[] = [
    { where: "title", value: set.title },
    ...set.instructions.map((value) => ({ where: "instructions", value })),
    ...set.fieldLabels.map((value) => ({ where: "field label", value })),
  ];
  for (const item of set.items) {
    strings.push(...item.context.map((section) => ({ where: `${item.id} context heading`, value: section.heading })));
  }
  return strings;
}

export function metadataLeaks(set: RatingSet): string[] {
  const leaks: string[] = [];
  for (const item of set.items) {
    if (!ITEM_ID.test(item.id)) leaks.push(`item id "${item.id}"`);
    for (const option of item.options) {
      if (!LABEL.test(option.label)) leaks.push(`label "${option.label}" in ${item.id}`);
    }
  }
  for (const { where, value } of metadataStrings(set)) {
    if (LEAK_PATTERN.test(value)) leaks.push(`${where}: "${value}"`);
  }
  return leaks;
}

/** Literal tokens from the key that must never appear in the page. */
export function keyTokens(key: RatingKey): string[] {
  const tokens = new Set<string>([key.keyFile]);
  for (const item of Object.values(key.items)) {
    for (const ref of Object.values(item.labels)) {
      const armKey = ref.armKey;
      tokens.add(armKey);
      const [model, rest = ""] = armKey.split("@");
      tokens.add(model);
      const [setting, variant = ""] = rest.split("/");
      tokens.add(`@${setting.split("+")[0]}`);
      if (variant) tokens.add(`/${variant}`);
    }
  }
  return [...tokens].filter((t) => t.length > 1);
}

export function htmlLeaks(html: string, key: RatingKey): string[] {
  return keyTokens(key).filter((token) => html.includes(token));
}
