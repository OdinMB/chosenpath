Title: Pregenerations (Design and Flows)

Overview

- Pregeneration computes hypothetical future story states off the main queue to keep the game responsive.
- Pregeneration never mutates the real story state, never triggers image generation, and stores results as files that can be adopted later.
- Adoption is safe: the queue replaces the current story with the pregen when a choice matches, and normal progression continues.

Key concepts

- Partial pregeneration (interlude state):
  - Applies a player choice and computes the beat resolution details for the current turn, but does not generate the next beat.
  - Stored immediately in Phase 1 of bulk pregeneration to enable interludes quickly.
- Complete pregeneration (next beat ready):
  - Advances through to the next beat (no DB updates), then stores the full hypothetical state.
  - Performed in Phase 2 of bulk pregeneration in the background for all remaining options.
- Tracking/in-progress:
  - `PregenerationService` tracks in-progress keys `${turn}_${playerSlot}_${optionIndex}` per story to avoid duplicated work.
  - Completion is marked even on failures to prevent stuck states.

File storage

- Files are stored per-story under deterministic names: `pregeneration_<turn>_<playerSlot>_<optionIndex>.json`.
- Utilities in `storageUtils.ts` provide helpers for listing, deleting by turn, and path construction.

Server flows

1. Trigger conditions

- `PregenerationService.shouldTriggerPregeneration(story)` returns true when:
  - Pregeneration is enabled.
  - Character selection is completed and the current beat type isn’t `ending`.
  - All but one player have made a choice (single-player → 0 yet to choose; multiplayer → 1 yet to choose).

2. Bulk pregeneration (GameQueueProcessor.handleBulkPregenerateStoryStates)

- Phase 1 (immediate, parallel): for each remaining option, store partial pregeneration (choice + beat resolution).
- Phase 2 (background): for each option, run full pregeneration; if all choices are submitted, progress to the next beat without DB updates, then store complete state.

3. Adoption on choice (ChoiceProcessingService.processChoice)

- If a matching complete pregenerated state exists:
  - Adopt it directly as `processedStory`, update DB for progression, broadcast, and set `requiresPregeneration=true` to start pregeneration for the new turn.
- If a partial state exists:
  - Adopt the partial state (interlude), update DB for choice, and queue progression if all choices are submitted.
- If no pregen exists:
  - Compute from scratch (choice + resolution), update DB for choice, queue progression if all choices are submitted.

4. Images

- Pregeneration never generates images.
- After adoption (either via moveStoryForward or immediate complete pregen), the unified image flow collects latest-beat requests and spawns background generation, attaching images when ready.

Safety and consistency

- DB updates:
  - Choice adoption updates pending status immediately.
  - Progression adoption (complete pregen) updates beat number and timestamps immediately to match the adopted state.
- Image library:
  - When storing pregens, the current actual story image library is merged into the stored pregen to avoid losing existing references.
- Idempotency:
  - Phase 1 checks for existing files and skips duplicates.
  - Phase 2 tracks in-progress to avoid multiple workers duplicating work.

Operational notes

- Logs are emitted for each phase and important state transitions (stored partial, stored complete, adoption).
- Errors during background Phase 2 mark pregeneration complete to avoid stuck states and are logged for follow-up.

Testing pointers

- Ensure partial states appear immediately after bulk Phase 1.
- Ensure complete states appear after background progression for each remaining option.
- Verify adoption chooses the complete pregen and skips moveStoryForward.
- Verify image generation is not triggered during pregeneration but is triggered after adoption.
