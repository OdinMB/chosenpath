import { useEffect } from "react";

/** Sets the title and returns what puts the previous one back. */
export function swapDocumentTitle(
  doc: { title: string },
  title: string
): () => void {
  const previous = doc.title;
  doc.title = title;
  return () => {
    doc.title = previous;
  };
}

/**
 * Names the browser tab (and a PDF saved from the page) while the component is
 * mounted; the page's previous title comes back when it unmounts.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => swapDocumentTitle(document, title), [title]);
}
