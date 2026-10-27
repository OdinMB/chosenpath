import type { ReactNode } from "react";
import { GameModes } from "core/types";
import { AiDraftTab } from "../../../../src/resources/templates/components/AiDraftTab";
import { accessibleText, renderMarkup } from "../../../helpers/staticMarkup";

/*
 * AI Draft replaces every outcome of the World: the warning before it runs
 * says which reflection questions go with them, and says nothing of them when
 * none would.
 */

// The real config reads import.meta.env, which Jest cannot parse
jest.mock("../../../../src/config", () =>
  jest.requireActual("../../../__mocks__/client/config")
);
// The setup form as a stand-in that keeps the props it is given
const mockInitializerProps: Array<{ isSparse?: boolean; overrideNotice?: ReactNode }> = [];
jest.mock("../../../../src/page/components/StoryInitializer", () => ({
  StoryInitializer: (props: { isSparse?: boolean; overrideNotice?: ReactNode }) => {
    mockInitializerProps.push(props);
    return null;
  },
}));

type Props = Parameters<typeof AiDraftTab>[0];
const props = (overrides: Partial<Props> = {}): Props => ({
  isSparse: true,
  isLoading: false,
  formData: { playerCountMax: 1, maxTurnsMin: 10, gameMode: GameModes.SinglePlayer },
  aiDraftPrompt: "",
  aiDraftPlayerCount: undefined,
  handleAIDraftSetup: jest.fn(),
  handleAiDraftPromptChange: jest.fn(),
  handleAiDraftPlayerCountChange: jest.fn(),
  onBack: jest.fn(),
  ...overrides,
});

/** The props the setup form got on the last render. */
function initializerProps(overrides: Partial<Props> = {}) {
  mockInitializerProps.length = 0;
  renderMarkup(<AiDraftTab {...props(overrides)} />);
  return mockInitializerProps.at(-1);
}

describe("AiDraftTab", () => {
  it("hands the setup form a notice of the reflection questions a draft removes, by outcome", () => {
    const passed = initializerProps({
      lostReflectionQuestions: [
        { outcomeId: "shared_bell", question: "Does the bell ring again?", count: 2 },
        { outcomeId: "player1_name", question: "Does the keeper clear the name?", count: 1 },
      ],
    });

    expect(accessibleText(renderMarkup(<>{passed?.overrideNotice}</>))).toBe(
      "AI Draft writes new outcomes, and removes 3 reflection questions with the ones it replaces: 2 on “Does the bell ring again?” 1 on “Does the keeper clear the name?”"
    );
  });

  it("hands it no notice when the World has no reflection questions to lose", () => {
    expect(initializerProps({ lostReflectionQuestions: [] })?.overrideNotice).toBeUndefined();
    expect(initializerProps()?.overrideNotice).toBeUndefined();
  });
});
