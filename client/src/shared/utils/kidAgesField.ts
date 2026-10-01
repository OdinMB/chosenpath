import { KID_AGES_HINT, KidAges, parseKidAges } from "core/types";

/**
 * The read-with-kids setting's field, on the setup form and in the template
 * editor: one age ("5") or a range ("8-10"). An empty field is unset; a value
 * it can't read gets the hint.
 */
export function readKidAgesField(text: string): { ages?: KidAges; error?: string } {
  if (text.trim() === "") return {};
  const ages = parseKidAges(text);
  return ages ? { ages } : { error: KID_AGES_HINT };
}

/** The field's placeholder: both forms it takes. */
export const KID_AGES_PLACEHOLDER = "5 or 8-10";
