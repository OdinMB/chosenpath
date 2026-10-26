import { readFileSync } from "fs";
import { join } from "path";
import type { RouteObject } from "react-router-dom";
import { pageRoutes } from "../../../src/page/pageRoutes";
import { lectures } from "../../../src/page/data/lectureData";

// The routes import every page component. The real config reads
// import.meta.env, which Jest cannot parse
jest.mock("../../../src/config", () =>
  jest.requireActual("../../__mocks__/client/config")
);
// Jest's mapper resolves this ".js" import to core's ESM build; use the source
jest.mock("core/utils/difficultyUtils.js", () =>
  jest.requireActual("../../../../core/utils/difficultyUtils")
);
// The welcome page and the layout import aliased modules with a ".js" suffix,
// which Jest's mapper can't resolve; only their routes matter here
jest.mock("../../../src/page/Page", () => ({ Page: () => null }));
jest.mock("../../../src/page/PageLayout", () => ({ PageLayout: () => null }));

const SITE = "https://chosenpath.ai";

function readPublicFile(name: string): string {
  return readFileSync(join(__dirname, "../../../public", name), "utf8");
}

// Every path the routes declare, children included; pathless layout routes add none
function routePaths(routes: RouteObject[], parent = ""): string[] {
  return routes.flatMap((route) => {
    if (route.path === undefined) {
      return routePaths(route.children ?? [], parent);
    }
    const path = route.path.startsWith("/")
      ? route.path
      : `${parent.replace(/\/$/, "")}/${route.path}`;
    return [path, ...routePaths(route.children ?? [], path)];
  });
}

function escapeRegExp(text: string): string {
  return text.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

// robots.txt rules match path prefixes, with * standing for any characters
function disallowedByRobots(robots: string): (path: string) => boolean {
  const rules = [...robots.matchAll(/^Disallow:\s*(\S+)/gm)].map(
    ([, rule]) => new RegExp(`^${rule.split("*").map(escapeRegExp).join(".*")}`)
  );
  return (path) => rules.some((rule) => rule.test(path));
}

const locs = [
  ...readPublicFile("sitemap.xml").matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g),
].map(([, loc]) => loc);
const listedPaths = locs.map((loc) => loc.slice(SITE.length) || "/");

const isDisallowed = disallowedByRobots(readPublicFile("robots.txt"));
// Pages with a fixed address that search engines may crawl
const indexablePagePaths = routePaths(pageRoutes).filter(
  (path) => !path.includes(":") && !path.includes("*") && !isDisallowed(path)
);
const lecturePaths = lectures.map((lecture) => `/academy/${lecture.id}`);

describe("sitemap.xml", () => {
  it("lists every public page with a fixed address that robots.txt allows", () => {
    const missing = indexablePagePaths.filter(
      (path) => !listedPaths.includes(path)
    );

    expect(missing).toEqual([]);
  });

  it("lists every academy lecture", () => {
    const missing = lecturePaths.filter((path) => !listedPaths.includes(path));

    expect(missing).toEqual([]);
  });

  it("lists only chosenpath.ai pages that exist and robots.txt allows", () => {
    const offSite = locs.filter((loc) => !loc.startsWith(`${SITE}/`));
    const unknown = listedPaths.filter(
      (path) =>
        !indexablePagePaths.includes(path) && !lecturePaths.includes(path)
    );

    expect(offSite).toEqual([]);
    expect(unknown).toEqual([]);
  });
});
