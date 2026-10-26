import { GameModes, PublicationStatus } from "core/types";
import type { PlayerCount, TemplateMetadata } from "core/types";
import {
  filterTemplates,
  tagsInTemplates,
} from "../../../src/page/hooks/useLibraryBrowser";

function template(
  id: string,
  playerCountMin: PlayerCount,
  playerCountMax: PlayerCount,
  tags: string[]
): TemplateMetadata {
  return {
    id,
    title: id,
    teaser: "",
    gameMode: GameModes.Cooperative,
    tags,
    playerCountMin,
    playerCountMax,
    maxTurnsMin: 10,
    maxTurnsMax: 10,
    publicationStatus: PublicationStatus.Published,
    showOnWelcomeScreen: true,
    order: 0,
    containsImages: false,
    createdAt: "2026-10-26T00:00:00.000Z",
    updatedAt: "2026-10-26T00:00:00.000Z",
  };
}

const LIGHTHOUSE = template("lighthouse", 1, 2, ["Fantasy", "Cozy"]);
const STATION = template("station", 2, 3, ["Sci-Fi", "Tense"]);
const HEIST = template("heist", 3, 3, ["Fantasy", "Tense"]);
const TEMPLATES = [LIGHTHOUSE, STATION, HEIST];

const ids = (templates: TemplateMetadata[]) => templates.map((t) => t.id);

describe("filterTemplates", () => {
  it("returns every template, in order, when no filter is set", () => {
    expect(ids(filterTemplates(TEMPLATES, null, []))).toEqual([
      "lighthouse",
      "station",
      "heist",
    ]);
  });

  it.each([
    [1, ["lighthouse"]],
    [2, ["lighthouse", "station"]],
    [3, ["station", "heist"]],
    [4, []],
  ])("keeps the templates %i players can play, both ends included", (players, expected) => {
    expect(ids(filterTemplates(TEMPLATES, players, []))).toEqual(expected);
  });

  it("keeps only templates that carry every selected tag", () => {
    expect(ids(filterTemplates(TEMPLATES, null, ["Fantasy"]))).toEqual([
      "lighthouse",
      "heist",
    ]);
    expect(ids(filterTemplates(TEMPLATES, null, ["Fantasy", "Tense"]))).toEqual(["heist"]);
    expect(ids(filterTemplates(TEMPLATES, null, ["Cozy", "Sci-Fi"]))).toEqual([]);
  });

  it("combines the player count with the tags", () => {
    expect(ids(filterTemplates(TEMPLATES, 2, ["Tense"]))).toEqual(["station"]);
    expect(ids(filterTemplates(TEMPLATES, 1, ["Tense"]))).toEqual([]);
  });

  it("ignores selected tags that no template carries", () => {
    expect(ids(filterTemplates(TEMPLATES, null, ["Western"]))).toEqual([
      "lighthouse",
      "station",
      "heist",
    ]);
    expect(ids(filterTemplates(TEMPLATES, null, ["Western", "Cozy"]))).toEqual([
      "lighthouse",
    ]);
  });

  it("leaves the list it was given unchanged", () => {
    const templates = [...TEMPLATES];

    filterTemplates(templates, 2, ["Fantasy"]);

    expect(templates).toEqual(TEMPLATES);
  });
});

describe("tagsInTemplates", () => {
  it("collects each tag once, trimmed, and skips blank ones", () => {
    const tags = tagsInTemplates([
      ...TEMPLATES,
      template("blank", 1, 1, [" Cozy ", "", "  "]),
    ]);

    expect([...tags].sort()).toEqual(["Cozy", "Fantasy", "Sci-Fi", "Tense"]);
  });
});
