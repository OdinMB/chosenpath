import type { TemplateMetadata } from "core/types";
import { configurableTemplateLoader } from "../../../../src/resources/templates/loaders/templateLoader";
import { templateApi } from "../../../../src/resources/templates/templateApi";
import {
  describeTemplateError,
  InvalidTemplateError,
} from "../../../../src/resources/templates/loaders/templateLoadErrors";

// The real API client reads import.meta.env, which Jest cannot parse
jest.mock("../../../../src/resources/templates/templateApi", () => ({
  templateApi: { getTemplateMetadata: jest.fn() },
}));
jest.mock("../../../../src/shared/logger", () => ({
  Logger: { App: { log: jest.fn(), error: jest.fn() } },
}));

const getTemplateMetadata = templateApi.getTemplateMetadata as jest.Mock;

const NOT_AVAILABLE_TITLE = "This story template isn't available";
const REMOVED_OR_NOT_SHARED =
  "It may have been removed, or its creator isn't sharing it right now.";

/** The server's error body for GET /templates/:id, as the API client rejects with it. */
function serverError(errorMessage: string, httpStatus?: number) {
  return {
    status: "error",
    requestId: "request-1",
    timestamp: 0,
    errorMessage,
    operationType: "/templates/missing-id",
    ...(httpStatus === undefined ? {} : { httpStatus }),
  };
}

describe("describeTemplateError", () => {
  describe("a template that is gone or not shared", () => {
    it("says the template isn't available for the server's 404, without Retry", () => {
      expect(describeTemplateError(serverError("Template not found", 404))).toEqual({
        title: NOT_AVAILABLE_TITLE,
        message: REMOVED_OR_NOT_SHARED,
        canRetry: false,
      });
    });

    it("reads the server's not-found body even without its status", () => {
      expect(describeTemplateError(serverError("Template not found"))).toEqual({
        title: NOT_AVAILABLE_TITLE,
        message: REMOVED_OR_NOT_SHARED,
        canRetry: false,
      });
    });

    it("says the same for a router 404", () => {
      const routerResponse = {
        status: 404,
        statusText: "Not Found",
        internal: false,
        data: "",
      };
      expect(describeTemplateError(routerResponse).title).toBe(NOT_AVAILABLE_TITLE);
    });

    it("says the same for an axios 404 whose body isn't the server's", () => {
      const axiosError = {
        isAxiosError: true,
        message: "Request failed with status code 404",
        response: { status: 404, data: "<html>Not Found</html>" },
      };
      expect(describeTemplateError(axiosError).canRetry).toBe(false);
    });

    it("asks a signed-out visitor to sign in if the template is theirs (401)", () => {
      expect(describeTemplateError(serverError("Authentication required", 401))).toEqual({
        title: NOT_AVAILABLE_TITLE,
        message: `${REMOVED_OR_NOT_SHARED} If it's yours, sign in and open the link again.`,
        canRetry: false,
      });
    });

    it("says the template isn't available to a signed-in visitor without access (403)", () => {
      expect(describeTemplateError(serverError("Insufficient permissions", 403))).toEqual({
        title: NOT_AVAILABLE_TITLE,
        message: REMOVED_OR_NOT_SHARED,
        canRetry: false,
      });
    });
  });

  describe("a connection that failed", () => {
    it.each([
      ["axios's network error", { isAxiosError: true, code: "ERR_NETWORK", message: "Network Error" }],
      ["axios's timeout", { isAxiosError: true, code: "ECONNABORTED", message: "timeout of 0ms exceeded" }],
      ["fetch's network error", new TypeError("Failed to fetch")],
      ["Safari's network error", new TypeError("Load failed")],
    ])("says the connection failed and offers Retry for %s", (_, error) => {
      const description = describeTemplateError(error);

      expect(description.title).toBe("Connection failed");
      expect(description.message).toBe(
        "We couldn't reach the server to load this story template. Check your internet connection and try again."
      );
      expect(description.canRetry).toBe(true);
    });
  });

  describe("a template the server sends but can't be played", () => {
    it("says so for the loader's validation error, without Retry", async () => {
      getTemplateMetadata.mockResolvedValueOnce({ id: "template-1", title: "Half a template" });

      const thrown: unknown = await configurableTemplateLoader("template-1").catch(
        (error: unknown) => error
      );

      expect(thrown).toBeInstanceOf(InvalidTemplateError);
      expect(describeTemplateError(thrown)).toEqual({
        title: "This story template can't be played",
        message: "Something is wrong with how it's set up. Try another story from the library.",
        canRetry: false,
      });
    });

    it("passes the server's not-found error through the loader unchanged", async () => {
      const notFound = serverError("Template not found", 404);
      getTemplateMetadata.mockRejectedValueOnce(notFound);

      await expect(configurableTemplateLoader("missing-id")).rejects.toBe(notFound);
    });

    it("loads a complete template", async () => {
      const template = {
        id: "template-1",
        title: "The Lighthouse",
        playerCountMin: 1,
        playerCountMax: 2,
      } as TemplateMetadata;
      getTemplateMetadata.mockResolvedValueOnce(template);

      await expect(configurableTemplateLoader("template-1")).resolves.toEqual({ template });
    });
  });

  describe("anything else", () => {
    const UNKNOWN = {
      title: "Something went wrong",
      message: "We couldn't load this story template. Please try again in a moment.",
      canRetry: true,
    };

    it.each([
      ["a render crash", new Error("Cannot read properties of undefined (reading 'map')")],
      ["the server's 500", serverError("Failed to retrieve template", 500)],
      ["a thrown string", "boom"],
      ["nothing at all", undefined],
    ])("gives a plain message and offers Retry for %s", (_, error) => {
      expect(describeTemplateError(error)).toEqual(UNKNOWN);
    });
  });
});
