import { ContentModerationNotification } from "../../../src/shared/notifications/ContentModerationNotification";
import { accessibleText, renderMarkup } from "../../helpers/staticMarkup";

describe("ContentModerationNotification", () => {
  it("says the moderation that flagged the content is automated and uses AI", () => {
    const html = renderMarkup(
      <ContentModerationNotification
        contentModeration={{
          reason: "Sexual content involving minors",
          prompt: "a story premise",
        }}
      />
    );

    expect(accessibleText(html)).toContain(
      "Our automated moderation, which uses AI, flagged your content, so we couldn't process it. Reason: Sexual content involving minors"
    );
  });
});
