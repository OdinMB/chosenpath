import { Privacy } from "../../../src/page/static/Privacy";
import { accessibleText, renderMarkup } from "../../helpers/staticMarkup";

// The real config reads import.meta.env, which Jest cannot parse
jest.mock("../../../src/config", () =>
  jest.requireActual("../../__mocks__/client/config")
);
// The footer navigates; no router is needed to render it once
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => jest.fn(),
}));

describe("Privacy", () => {
  it("names OpenAI, the transfer to the USA, and what is sent", () => {
    const html = renderMarkup(<Privacy />);

    expect(accessibleText(html)).toContain(
      "To write story text and create images, we send your story premise, your choices, and anything you write about yourself to OpenAI (USA). OpenAI processes this data on our behalf under a data processing agreement and doesn't use it for training."
    );
  });
});
