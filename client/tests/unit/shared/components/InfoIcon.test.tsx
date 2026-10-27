import { InfoIcon } from "../../../../src/shared/components/ui/InfoIcon";
import { Tooltip } from "../../../../src/shared/components/ui/Tooltip";
import { attribute, openingTag, renderMarkup } from "../../../helpers/staticMarkup";

/*
 * An info icon is a button that keyboard, touch and screen-reader users can
 * reach: it has a name, its tooltip's text is its description at all times,
 * and its tooltip opens when it gets keyboard focus (as every tooltip does)
 * and when it is tapped. Static markup can't focus or tap, so the opening is
 * checked on the handlers the tooltip puts on the element it wraps; the
 * browser journey checks that they open it.
 */

// The handlers each tooltip's wrapper (its floating-ui reference) gets, kept
// as the markup is built
type ReferenceProps = { onFocus?: unknown; onClick?: unknown; onMouseMove?: unknown };
const mockReferences: ReferenceProps[] = [];
jest.mock("react/jsx-runtime", () => {
  const runtime = jest.requireActual<typeof import("react/jsx-runtime")>("react/jsx-runtime");
  const keepingReferences =
    (create: typeof runtime.jsx): typeof runtime.jsx =>
    (type, props, key) => {
      const style = (props as { style?: { display?: string } }).style;
      if (type === "div" && style?.display === "inline-block") {
        mockReferences.push(props as ReferenceProps);
      }
      return create(type, props, key);
    };
  return { ...runtime, jsx: keepingReferences(runtime.jsx), jsxs: keepingReferences(runtime.jsxs) };
});

afterEach(() => {
  mockReferences.length = 0;
});

const UNIQUE_IMAGES =
  "The story always has default images. We will add additional ones for your unique story.";

describe("InfoIcon", () => {
  it("is a button named by its label", () => {
    const html = renderMarkup(<InfoIcon label="About unique images" tooltipText={UNIQUE_IMAGES} />);

    const button = openingTag(html, "button", "aria-label", "About unique images");
    expect(button).not.toBe("");
    expect(attribute(button, "type")).toBe("button");
    // A visible focus ring for keyboard users
    expect(attribute(button, "class")).toContain("focus-visible:ring-2");
  });

  it("is described by its tooltip's text before the tooltip opens", () => {
    const html = renderMarkup(<InfoIcon label="About unique images" tooltipText={UNIQUE_IMAGES} />);

    const button = openingTag(html, "button", "aria-label", "About unique images");
    const describedBy = attribute(button, "aria-describedby") ?? "";
    expect(describedBy).not.toBe("");
    const description = new RegExp(`<span id="${describedBy}" hidden="">([\\s\\S]*?)</span>`).exec(html)?.[1];
    expect(description).toBe(UNIQUE_IMAGES);
  });

  it("gives markup in its tooltip to its description too", () => {
    const html = renderMarkup(
      <InfoIcon
        label="About publication status"
        tooltipText={
          <div>
            <strong>Draft:</strong> nobody can see this World
          </div>
        }
      />
    );

    const describedBy = attribute(openingTag(html, "button", "aria-label", "About publication status"), "aria-describedby");
    expect(html).toContain(`<span id="${describedBy}" hidden=""><div><strong>Draft:</strong> nobody can see this World</div></span>`);
  });

  it("gives each icon a description of its own", () => {
    const html = renderMarkup(
      <div>
        <InfoIcon label="About unique images" tooltipText={UNIQUE_IMAGES} />
        <InfoIcon label="About reducing wait time" tooltipText="Creates story content in advance." />
      </div>
    );

    const first = attribute(openingTag(html, "button", "aria-label", "About unique images"), "aria-describedby");
    const second = attribute(openingTag(html, "button", "aria-label", "About reducing wait time"), "aria-describedby");
    expect(first).not.toBe(second);
  });

  it("opens its tooltip on focus and on a tap or click", () => {
    renderMarkup(<InfoIcon label="About unique images" tooltipText={UNIQUE_IMAGES} />);

    expect(mockReferences).toHaveLength(1);
    expect(typeof mockReferences[0]!.onFocus).toBe("function");
    expect(typeof mockReferences[0]!.onClick).toBe("function");
  });
});

describe("Tooltip", () => {
  it("opens on hover and focus, and not on a click, unless asked to", () => {
    renderMarkup(
      <Tooltip content="Share this World">
        <button type="button">Share</button>
      </Tooltip>
    );

    expect(mockReferences).toHaveLength(1);
    expect(typeof mockReferences[0]!.onFocus).toBe("function");
    expect(typeof mockReferences[0]!.onMouseMove).toBe("function");
    expect(mockReferences[0]!.onClick).toBeUndefined();
  });
});
