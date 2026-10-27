import { isValidElement, type ReactElement, type ReactNode } from "react";
import { ReflectionQuestionsField } from "../../../../src/shared/components/ReflectionQuestionsField";
import { PrimaryButton } from "../../../../src/shared/components/ui/PrimaryButton";
import { accessibleText, attribute, namesByRole, openingTag, renderMarkup } from "../../../helpers/staticMarkup";

/*
 * Reflection questions for one outcome, as people write them: in the World
 * editor, and on the several-stories start. Up to five, each up to 300
 * characters; the field is the only thing between the writer and the
 * server's limits, so it keeps to them itself.
 */

/** Every element in a tree that is not rendered yet, children and element props included. */
function elementsIn(node: ReactNode): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(elementsIn);
  if (!isValidElement(node)) return [];
  const props = node.props as Record<string, unknown>;
  return [node, ...Object.values(props).flatMap((value) => elementsIn(value as ReactNode))];
}

const TWO = ["Who paid for the storm wall?", "Would you have sailed home?"];

const render = (questions: string[], readOnly = false) =>
  renderMarkup(<ReflectionQuestionsField id="harbour" questions={questions} onChange={jest.fn()} readOnly={readOnly} />);

/** The props of the field's elements of a type, or with an aria-label, as React gets them. */
function propsOf(questions: string[], onChange: (questions: string[]) => void) {
  const tree = elementsIn(ReflectionQuestionsField({ id: "harbour", questions, onChange }));
  const labelled = (label: string) =>
    tree.find((element) => (element.props as { "aria-label"?: string })["aria-label"] === label)?.props as Record<
      string,
      (...args: unknown[]) => void
    >;
  const add = tree.find((element) => element.type === PrimaryButton)?.props as { onClick: () => void; disabled?: boolean };
  return { labelled, add };
}

describe("ReflectionQuestionsField", () => {
  it("is a group named 'Reflection questions', described by what they are for and their limits", () => {
    const html = render(TWO);
    /** The text of the element with this id. */
    const textOf = (id: string) => accessibleText(new RegExp(`<(\\w+)[^>]*\\sid="${id}"[^>]*>([\\s\\S]*?)</\\1>`).exec(html)?.[2] ?? "");

    const group = openingTag(html, "div", "role", "group");
    expect(textOf(attribute(group, "aria-labelledby") ?? "")).toBe("Reflection questions");
    expect(textOf(attribute(group, "aria-describedby") ?? "")).toBe(
      "Optional. Shown under this question on the end screen of every story. Up to 5, each up to 300 characters."
    );
  });

  it("takes another description where the questions are for other stories", () => {
    const html = renderMarkup(
      <ReflectionQuestionsField id="harbour" questions={[]} onChange={jest.fn()} hint="Shown under this question in these stories." />
    );

    expect(accessibleText(html)).toContain("Shown under this question in these stories. Up to 5, each up to 300 characters.");
  });

  it("shows each question in a text area of its own, named by its number and held to 300 characters", () => {
    const html = render(TWO);
    /** What the text area with this name holds. */
    const textOf = (label: string) =>
      new RegExp(`<textarea[^>]*aria-label="${label}"[^>]*>([\\s\\S]*?)</textarea>`).exec(html)?.[1];

    expect(textOf("Reflection question 1")).toBe(TWO[0]);
    expect(textOf("Reflection question 2")).toBe(TWO[1]);
    expect(html).not.toContain("<input");
    // React writes the attribute as maxLength; HTML reads attribute names in any case
    expect(attribute(openingTag(html, "textarea", "aria-label", "Reflection question 1"), "maxLength")).toBe("300");
  });

  it("is named and described by the page around it when told to be, with no heading or hint of its own", () => {
    const html = renderMarkup(
      <ReflectionQuestionsField id="harbour" questions={TWO} onChange={jest.fn()} labelledBy="harbour-heading" describedBy="panel-note" />
    );

    const group = openingTag(html, "div", "role", "group");
    expect(attribute(group, "aria-labelledby")).toBe("harbour-heading");
    expect(attribute(group, "aria-describedby")).toBe("panel-note");
    expect(accessibleText(html)).not.toContain("Reflection questions");
    expect(accessibleText(html)).not.toContain("Up to 5");
  });

  it("names each remove button for the question it removes, and the add button by its text", () => {
    expect(namesByRole(render(TWO), "button")).toEqual([
      "Remove reflection question 1",
      "Remove reflection question 2",
      "Add reflection question",
    ]);
  });

  it("adds an empty question, changes one as it is typed, and removes one, keeping the others in order", () => {
    const onChange = jest.fn();
    const { labelled, add } = propsOf(TWO, onChange);

    add.onClick();
    labelled("Reflection question 2").onChange?.({ target: { value: "Would you sail again?" } });
    labelled("Remove reflection question 1").onClick?.();

    expect(onChange.mock.calls).toEqual([[[...TWO, ""]], [[TWO[0], "Would you sail again?"]], [[TWO[1]]]]);
  });

  it("offers no sixth question: the add button is disabled at five, and says why", () => {
    const five = ["1?", "2?", "3?", "4?", "5?"];
    const { add } = propsOf(five, jest.fn());

    expect(add.disabled).toBe(true);
    expect(accessibleText(render(five))).toContain("That's the most an outcome takes.");
    expect(accessibleText(render(TWO))).not.toContain("That's the most");
  });

  it("shows a read-only field's questions without inputs to change them, or says there are none", () => {
    const html = render(TWO, true);

    expect(html).not.toMatch(/<(input|textarea)/);
    expect(namesByRole(html, "button")).toEqual([]);
    expect(accessibleText(html)).toContain(TWO.join(" "));
    expect(accessibleText(render([], true))).toContain("None");
  });

  it("starts with no fields, only the add button, where there are no questions yet", () => {
    const html = render([]);

    expect(html).not.toMatch(/<(input|textarea)/);
    expect(namesByRole(html, "button")).toEqual(["Add reflection question"]);
  });
});
