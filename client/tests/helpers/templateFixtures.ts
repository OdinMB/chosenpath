import { GameModes, PublicationStatus } from "core/types";
import type { PlayerCount, TemplateMetadata } from "core/types";

/** A published library entry with the fields the library filters on. */
export function templateMetadata(
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
