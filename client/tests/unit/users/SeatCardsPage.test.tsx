import { SeatCardsPage } from "../../../src/users/stories/SeatCardsPage";
import { accessibleText, renderMarkup } from "../../helpers/staticMarkup";
import { AUDIENCE_WORDS } from "../../helpers/genericWording";

/*
 * The seat-card page serves anyone who started several stories at once: its
 * wording names no audience or group (the stories load in an effect, which a
 * static render doesn't run, so this is the page's first paint).
 */

// The real config reads import.meta.env, which Jest cannot parse
jest.mock("../../../src/config", () =>
  jest.requireActual("../../__mocks__/client/config")
);
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => jest.fn(),
  useSearchParams: () => [new URLSearchParams("stories=a,b")],
}));

describe("SeatCardsPage wording", () => {
  it("describes the cards without naming an audience or group", () => {
    const text = accessibleText(renderMarkup(<SeatCardsPage />));

    expect(text).toContain("Seat cards");
    expect(text).not.toMatch(AUDIENCE_WORDS);
  });
});
