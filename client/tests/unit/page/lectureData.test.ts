import { MAX_PLAYERS } from "core/config";
import { getLectureById } from "../../../src/page/data/lectureData";

describe("the Multiplayer lecture", () => {
  const lecture = getLectureById("multiplayer");

  it("is a full lecture, not a coming-soon stub", () => {
    expect(lecture).toBeDefined();
    expect(lecture?.summary).not.toMatch(/coming soon/i);
    expect(lecture?.content).not.toMatch(/coming soon/i);
    expect(lecture?.content.match(/<h3 /g)?.length ?? 0).toBeGreaterThanOrEqual(5);
  });

  it("keeps its image and has no video", () => {
    expect(lecture?.imagePath).toBe("/academy/multiplayer.jpeg");
    expect(lecture?.videoEmbedUrl).toBeUndefined();
  });

  it("names the player limit the game allows", () => {
    expect(lecture?.content).toContain(`1 to ${MAX_PLAYERS} players`);
  });
});
