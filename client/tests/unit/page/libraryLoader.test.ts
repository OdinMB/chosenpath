import { libraryLoader } from "../../../src/page/loaders/libraryLoader";
import { templateCache } from "../../../src/resources/templates/templateCache";
import { Logger } from "../../../src/shared/logger";
import { templateMetadata } from "../../helpers/templateFixtures";

jest.mock("../../../src/resources/templates/templateCache", () => ({
  templateCache: { getPublishedTemplates: jest.fn() },
}));
jest.mock("../../../src/shared/logger", () => ({
  Logger: { App: { log: jest.fn(), error: jest.fn() } },
}));

const getPublishedTemplates = jest.mocked(templateCache.getPublishedTemplates);

function loadLibrary(path: string) {
  const url = new URL(path, "http://localhost");
  return libraryLoader({
    request: new Request(url),
    url,
    pattern: "/library",
    params: {},
    context: undefined,
  });
}

describe("libraryLoader", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("marks the library as failed to load when the templates can't be fetched, and logs why", async () => {
    const error = new TypeError("Failed to fetch");
    getPublishedTemplates.mockRejectedValue(error);

    const data = await loadLibrary("/library?tags=Fantasy&players=2");

    expect(data.loadFailed).toBe(true);
    expect(data.templates).toEqual([]);
    expect(jest.mocked(Logger.App.error)).toHaveBeenCalledWith(
      "Failed to load template metadata",
      error
    );
  });

  it("loads the templates and the URL's filters that exist, not marked as failed", async () => {
    const templates = [
      templateMetadata("lighthouse", 1, 2, ["Fantasy", "Cozy"]),
      templateMetadata("station", 2, 3, ["Sci-Fi"]),
    ];
    getPublishedTemplates.mockResolvedValue(templates);

    const data = await loadLibrary("/library?tags=Fantasy,Western&players=2");

    expect(data.loadFailed).toBe(false);
    expect(data.templates).toEqual(templates);
    expect(data.initialTags).toEqual(["Fantasy"]);
    expect(data.initialPlayerCount).toBe(2);
  });

  it("does not mark an empty library that loaded as failed", async () => {
    getPublishedTemplates.mockResolvedValue([]);

    const data = await loadLibrary("/library");

    expect(data.loadFailed).toBe(false);
    expect(data.templates).toEqual([]);
  });
});
