import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/*
 * Rendering helpers for the client tests, which run in Node without a DOM.
 * renderToStaticMarkup runs no effects, so what it returns is the first paint:
 * what someone sees before any interaction. The parsing below is only as good
 * as the markup these tests render (no nested elements of the same tag).
 */

// React warns once per layout effect that a static render skips it; that is
// the point here, so only that warning is dropped.
const LAYOUT_EFFECT_WARNING = "useLayoutEffect does nothing on the server";

export function renderMarkup(element: ReactElement): string {
  const consoleError = console.error;
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes(LAYOUT_EFFECT_WARNING)) {
      return;
    }
    consoleError(...args);
  };
  try {
    return renderToStaticMarkup(element);
  } finally {
    console.error = consoleError;
  }
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#x27;": "'",
  "&#39;": "'",
  "&nbsp;": " ",
};

function decode(html: string): string {
  return html.replace(/&(?:amp|lt|gt|quot|nbsp|#x27|#39);/g, (e) => ENTITIES[e]);
}

/** Text a screen reader reads: tags stripped, aria-hidden spans dropped. */
export function accessibleText(html: string): string {
  const withoutHidden = html.replace(
    /<span[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/span>/g,
    ""
  );
  return decode(withoutHidden.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function attribute(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return match?.[1] === undefined ? undefined : decode(match[1]);
}

export type RenderedNote = {
  /** The note's accessible name (aria-label). */
  name: string | undefined;
  lang: string | undefined;
  text: string;
  /** Where the note starts in the markup, to check what it sits above. */
  offset: number;
};

/** Every element with role="note", in document order. */
export function notesIn(html: string): RenderedNote[] {
  const notes: RenderedNote[] = [];
  const pattern = /<(\w+)(\s[^>]*role="note"[^>]*)>([\s\S]*?)<\/\1>/g;
  for (const match of html.matchAll(pattern)) {
    const [, , attributes = "", inner = ""] = match;
    notes.push({
      name: attribute(attributes, "aria-label"),
      lang: attribute(attributes, "lang"),
      text: accessibleText(inner),
      offset: match.index ?? 0,
    });
  }
  return notes;
}
