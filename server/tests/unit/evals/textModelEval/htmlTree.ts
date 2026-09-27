/*
 * A small HTML tree for checking the rating page's structure in tests: no
 * DOM library is installed, and the page's markup is generated, closed and
 * escaped, so a tag walker is enough. Script and style bodies are raw text.
 */

export type HtmlNode = {
  tag: string;
  attrs: Record<string, string>;
  children: HtmlNode[];
  /** Text directly inside this element, in order */
  text: string[];
  parent?: HtmlNode;
};

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const RAW = new Set(["script", "style"]);
const TOKEN = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/([a-zA-Z][a-zA-Z0-9]*)\s*>|<([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/gi;
const ATTR = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

export function unescapeHtml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of source.matchAll(ATTR)) attrs[match[1].toLowerCase()] = unescapeHtml(match[2] ?? match[3] ?? match[4] ?? "");
  return attrs;
}

export function parseHtml(html: string): HtmlNode {
  const root: HtmlNode = { tag: "#root", attrs: {}, children: [], text: [] };
  let current = root;
  let at = 0;
  TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN.exec(html))) {
    const between = html.slice(at, match.index);
    if (between.trim()) current.text.push(unescapeHtml(between));
    at = TOKEN.lastIndex;
    const [whole, closing, opening, attrSource = ""] = match;
    if (closing) {
      const tag = closing.toLowerCase();
      let node: HtmlNode | undefined = current;
      while (node && node.tag !== tag) node = node.parent;
      if (node?.parent) current = node.parent;
      continue;
    }
    if (!opening) continue;
    const tag = opening.toLowerCase();
    const node: HtmlNode = { tag, attrs: parseAttrs(attrSource), children: [], text: [], parent: current };
    current.children.push(node);
    if (RAW.has(tag)) {
      const end = html.toLowerCase().indexOf(`</${tag}`, at);
      node.text.push(html.slice(at, end));
      TOKEN.lastIndex = at = html.indexOf(">", end) + 1;
      continue;
    }
    if (!VOID.has(tag) && !whole.endsWith("/>")) current = node;
  }
  return root;
}

export function all(node: HtmlNode, test: (n: HtmlNode) => boolean): HtmlNode[] {
  const found: HtmlNode[] = [];
  const walk = (n: HtmlNode) => {
    for (const child of n.children) {
      if (test(child)) found.push(child);
      walk(child);
    }
  };
  walk(node);
  return found;
}

export function hasClass(node: HtmlNode, name: string): boolean {
  return (node.attrs.class ?? "").split(/\s+/).includes(name);
}

/** Elements matching a tag and/or class, e.g. "details.sec", ".cell", "input". */
export function select(node: HtmlNode, selector: string): HtmlNode[] {
  const [tag, ...classes] = selector.split(".");
  return all(node, (n) => (!tag || n.tag === tag) && classes.every((c) => hasClass(n, c)));
}

export function kids(node: HtmlNode, selector: string): HtmlNode[] {
  const [tag, ...classes] = selector.split(".");
  return node.children.filter((n) => (!tag || n.tag === tag) && classes.every((c) => hasClass(n, c)));
}

export function textOf(node: HtmlNode): string {
  const parts: string[] = [];
  const walk = (n: HtmlNode) => {
    if (RAW.has(n.tag)) return;
    parts.push(...n.text);
    n.children.forEach(walk);
  };
  walk(node);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** The nearest ancestor matching the selector. */
export function closest(node: HtmlNode, selector: string): HtmlNode | undefined {
  const [tag, ...classes] = selector.split(".");
  let n = node.parent;
  while (n && !((!tag || n.tag === tag) && classes.every((c) => hasClass(n as HtmlNode, c)))) n = n.parent;
  return n;
}
