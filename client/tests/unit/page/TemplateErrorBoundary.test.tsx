import { TemplateErrorBoundary } from "../../../src/page/TemplateErrorBoundary";
import { accessibleText, renderMarkup } from "../../helpers/staticMarkup";

// What the template route's loader or render threw
let mockRouteError: unknown;
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useRouteError: () => mockRouteError,
}));

function buttonsIn(html: string): string[] {
  return Array.from(html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g), (match) =>
    accessibleText(match[1] ?? "")
  );
}

function headingIn(html: string): string {
  return accessibleText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "");
}

describe("TemplateErrorBoundary", () => {
  it("tells someone on a link to a missing template that it isn't available, without Retry", () => {
    // The server's 404 body, as the API client rejects with it
    mockRouteError = {
      status: "error",
      errorMessage: "Template not found",
      httpStatus: 404,
    };

    const html = renderMarkup(<TemplateErrorBoundary />);

    expect(headingIn(html)).toBe("This story template isn't available");
    expect(accessibleText(html)).toContain(
      "It may have been removed, or its creator isn't sharing it right now."
    );
    expect(buttonsIn(html)).toEqual(["Browse Library", "Go Home"]);
  });

  it("says the connection failed and offers Retry, never the raw network error", () => {
    mockRouteError = new TypeError("Failed to fetch");

    const html = renderMarkup(<TemplateErrorBoundary />);

    expect(headingIn(html)).toBe("Connection failed");
    expect(accessibleText(html)).not.toContain("Failed to fetch");
    expect(buttonsIn(html)).toEqual(["Browse Library", "Retry", "Go Home"]);
  });

  it("shows a plain message instead of an unknown error's text", () => {
    mockRouteError = new Error("Cannot read properties of undefined (reading 'map')");

    const html = renderMarkup(<TemplateErrorBoundary />);

    expect(headingIn(html)).toBe("Something went wrong");
    expect(accessibleText(html)).not.toContain("Cannot read properties");
    expect(buttonsIn(html)).toEqual(["Browse Library", "Retry", "Go Home"]);
  });
});
