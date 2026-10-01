import {
  KidAges,
  StoryCategory,
  categoryFromTemplateTags,
  kidAgesText,
} from "core/types";
import { readKidAgesField } from "shared/utils/kidAgesField";

/*
 * The read-with-kids setting of a template tagged Kids, in the template
 * editor (the owner's decision of 2026-10-01: "this should depend on the age
 * range that should be part of kids stories settings"). The form keeps the
 * Children's ages field's text itself (useTemplateForm's kidAgesInput) and
 * drops it whenever it takes a whole template (loaded, changes discarded, a
 * save reverted, a draft), so the field never shows ages the template doesn't
 * hold.
 */

/** What the Children's ages field shows: the text typed since the form last took a template, else the template's ages. */
export function kidAgesFieldText(
  input: string | undefined,
  kidAges: KidAges | null | undefined
): string {
  if (input !== undefined) return input;
  return kidAges ? kidAgesText(kidAges) : "";
}

/**
 * The hint where a template tagged Kids holds typed ages the field can't read,
 * which keeps Save from saving (as the setup form keeps Create Story
 * disabled): saving would remove the template's ages while the field shows a
 * value. Undefined where the ages read, are empty, weren't typed, or the
 * template isn't tagged Kids (the field isn't shown).
 */
export function unreadableTemplateKidAges(
  tags: string[] | undefined,
  input: string | undefined
): string | undefined {
  if (input === undefined || categoryFromTemplateTags(tags) !== "read-with-kids") return undefined;
  return readKidAgesField(input).error;
}

/**
 * What a Draft World gives the template on the read-with-kids category: the
 * Kids tag (once), which makes its stories read-with-kids, and the ages the
 * form read, which replace the template's (where the optional field was
 * empty, the template keeps its own). Any other category changes neither.
 */
export function draftedKidsSetting(
  template: { tags?: string[]; kidAges?: KidAges | null },
  draft: { category?: StoryCategory; kidAges?: KidAges }
): { tags?: string[]; kidAges?: KidAges } {
  if (draft.category !== "read-with-kids") return {};
  const tags = template.tags ?? [];
  return {
    tags: categoryFromTemplateTags(tags) === "read-with-kids" ? tags : [...tags, "Kids"],
    ...(draft.kidAges ? { kidAges: draft.kidAges } : {}),
  };
}
