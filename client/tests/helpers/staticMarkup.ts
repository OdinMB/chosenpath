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

/** An attribute's value in an opening tag, entities decoded. */
export function attribute(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return match?.[1] === undefined ? undefined : decode(match[1]);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The opening tag of the first <tag> whose attribute `name` is `value` (as the
 * markup writes it), or "" when there is none.
 */
export function openingTag(
  html: string,
  tag: string,
  name: string,
  value: string
): string {
  const pattern = new RegExp(
    `<${tag}(?=\\s)[^>]*\\s${escapeRegExp(name)}="${escapeRegExp(value)}"[^>]*>`
  );
  return pattern.exec(html)?.[0] ?? "";
}

export type RoleQuery = "button" | "link" | "img";

export type RenderedRole = {
  /** Its accessible name: its aria-label, else the text inside it, else its title. */
  name: string;
  /** Its title: what a mouse pointer shows on hovering it. */
  title: string | undefined;
};

const IMPLICIT_ROLES: Record<string, RoleQuery> = { button: "button", a: "link" };
const VOID_TAGS = new Set(["img", "input", "br", "hr", "meta", "link", "source"]);

/** The markup inside the element whose opening tag ends at `from`. */
function innerMarkup(html: string, tag: string, from: number): string {
  if (VOID_TAGS.has(tag)) return "";
  const tags = new RegExp(`<(/?)${tag}(?=[\\s>/])[^>]*>`, "g");
  tags.lastIndex = from;
  let depth = 1;
  for (let match = tags.exec(html); match; match = tags.exec(html)) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) return html.slice(from, match.index);
  }
  return html.slice(from);
}

/**
 * Every element a screen reader announces with `role`, in document order, as
 * Testing Library's getAllByRole would find them: a <button>, an <a href>, or
 * any element whose role attribute says so.
 */
export function allByRole(html: string, role: RoleQuery): RenderedRole[] {
  const found: RenderedRole[] = [];
  for (const match of html.matchAll(/<(\w+)(\s[^>]*)?>/g)) {
    const [opening, tag = "", attributes = ""] = match;
    const explicit = attribute(attributes, "role");
    const implicit =
      IMPLICIT_ROLES[tag] === "link" && attribute(attributes, "href") === undefined
        ? undefined
        : IMPLICIT_ROLES[tag];
    if ((explicit ?? implicit) !== role) continue;
    const inner = innerMarkup(html, tag, (match.index ?? 0) + opening.length);
    const title = attribute(attributes, "title");
    found.push({
      name: attribute(attributes, "aria-label") ?? (accessibleText(inner) || title || ""),
      title,
    });
  }
  return found;
}

/** The accessible names of every element with `role`, in document order. */
export function namesByRole(html: string, role: RoleQuery): string[] {
  return allByRole(html, role).map((element) => element.name);
}

/** The element with `role` and accessible name `name`, as getByRole(role, { name }) finds it, or undefined. */
export function byRole(html: string, role: RoleQuery, name: string): RenderedRole | undefined {
  return allByRole(html, role).find((element) => element.name === name);
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
