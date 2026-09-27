/*
 * The small HTML pieces a rating page is built from. Every string passes
 * through escapeHtml here, so nothing narrative reaches the page as markup.
 */

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const e = escapeHtml;

export function paragraphs(lines: string[]): string {
  return lines
    .map((line) => {
      const parts = line.split(/(\[picture[^\]]*\])/g).map((part) =>
        /^\[picture/.test(part) ? `<span class="picture">${e(part)}</span>` : e(part)
      );
      return `<p>${parts.join("")}</p>`;
    })
    .join("");
}

export function listOf(items: string[]): string {
  return items.length ? `<ul>${items.map((i) => `<li>${e(i)}</li>`).join("")}</ul>` : "";
}

/** One labelled row; nothing without a body. */
export function row(label: string, body: string): string {
  return body ? `<dt>${e(label)}</dt><dd>${body}</dd>` : "";
}

export const textRow = (label: string, value: string) => row(label, value ? e(value) : "");

export function fields(...rows: string[]): string {
  const inner = rows.join("");
  return inner ? `<dl class="fields">${inner}</dl>` : "";
}

/** Short labelled values on one line: "Type: string · Group: City". */
export function meta(pairs: [string, string][]): string {
  const shown = pairs.filter(([, value]) => value);
  return shown.length
    ? `<p class="meta">${shown.map(([label, value]) => `<span class="k">${e(label)}:</span> ${e(value)}`).join(" · ")}</p>`
    : "";
}
