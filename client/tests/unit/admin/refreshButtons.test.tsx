import { StoriesOverview } from "../../../src/admin/stories/StoriesOverview";
import { UsersOverview } from "../../../src/admin/users/UsersOverview";
import { namesByRole, renderMarkup } from "../../helpers/staticMarkup";

// The real config reads import.meta.env, which Jest cannot parse
jest.mock("../../../src/config", () => jest.requireActual("../../__mocks__/client/config"));

let mockLoaderData: unknown = [];
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => jest.fn(),
  useLoaderData: () => mockLoaderData,
}));

/*
 * The admin lists of stories and users reload with an icon-only button beside
 * their heading: a screen reader names it for what it reloads. First paint,
 * with empty lists.
 */

describe("admin list refresh buttons", () => {
  it("names the stories list's refresh button", () => {
    mockLoaderData = [];
    const names = namesByRole(renderMarkup(<StoriesOverview />), "button");

    expect(names).toContain("Refresh stories");
    expect(names.filter((name) => name === "")).toEqual([]);
  });

  it("names the users list's refresh button", () => {
    mockLoaderData = { users: [] };
    const names = namesByRole(renderMarkup(<UsersOverview />), "button");

    expect(names).toContain("Refresh users");
    expect(names.filter((name) => name === "")).toEqual([]);
  });
});
