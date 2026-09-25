import type { ReactElement } from "react";
import { aiGeneratedImageAlt } from "../../../src/shared/utils/aiImageAlt";
import { processStoryText } from "../../../src/game/utils/storyTextProcessor";
import { CoverCard } from "../../../src/shared/components/CoverCard";
import { PlayerInterlude } from "../../../src/game/components/PlayerInterlude";
import { renderMarkup } from "../../helpers/staticMarkup";
import { clientStoryState, player } from "../../helpers/storyFixtures";

// ImageCard loads its source in an effect; the marker shows the alt text it gets
jest.mock("../../../src/shared/components/ImageCard", () => ({
  ImageCard: ({ alt, title }: { alt?: string; title: string }) =>
    `[image alt: ${alt ?? title}]`,
}));

describe("aiGeneratedImageAlt", () => {
  it("prefixes the description, and stands alone when there is none", () => {
    expect(aiGeneratedImageAlt("The harbour at dawn")).toBe(
      "AI-generated image: The harbour at dawn"
    );
    expect(aiGeneratedImageAlt("  ")).toBe("AI-generated image");
    expect(aiGeneratedImageAlt(undefined)).toBe("AI-generated image");
  });
});

describe("AI-generated image alt text", () => {
  it("labels beat images in the alt text and keeps the caption as it was", () => {
    const text =
      'The harbour wakes up. [image id=harbour source=story desc="The harbour at dawn"]\n\nBoats leave.';

    const images = processStoryText(
      text,
      clientStoryState({ generateImages: true })
    )
      .filter((segment) => segment.type === "image")
      .map((segment) => segment.content as ReactElement<{
        alt: string;
        caption: string;
      }>);

    expect(images).toHaveLength(1);
    expect(images[0]?.props.alt).toBe("AI-generated image: The harbour at dawn");
    expect(images[0]?.props.caption).toBe("The harbour at dawn");
  });

  it("labels covers", () => {
    const html = renderMarkup(
      <CoverCard sourceId="template-1" title="The Night Market">
        <p>card body</p>
      </CoverCard>
    );

    expect(html).toContain("[image alt: AI-generated image: The Night Market]");
  });

  it("labels the player's portrait while the story is set up", () => {
    const html = renderMarkup(
      <PlayerInterlude
        storyState={clientStoryState({
          generateImages: true,
          players: { player1: player([], 1) },
        })}
      />
    );

    expect(html).toContain("[image alt: AI-generated image: Suzie]");
  });
});
