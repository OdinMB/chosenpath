import type { BeatType, ImageRequest, PlayerSlot } from "core/types/index.js";
import { Story } from "core/models/Story.js";
import { AIStoryGenerator } from "./AIStoryGenerator.js";
import { AIImageGenerator } from "../../images/AIImageGenerator.js";
import { ChangeService } from "./ChangeService.js";
import { ThreadResolutionService } from "./ThreadResolutionService.js";
import { pregenerationService } from "./PregenerationService.js";
import { storyDbService } from "server/stories/StoryDbService.js";
import { Logger } from "shared/logger.js";

export interface ProgressionResult {
  finalStory: Story;
  requiresPregeneration: boolean;
  imageRequests: ImageRequest[];
}

export class StoryProgressionService {
  private static instance: StoryProgressionService;
  private aiStoryGenerator: AIStoryGenerator;
  private aiImageGenerator: AIImageGenerator;
  private changeService: ChangeService;

  private constructor() {
    this.aiStoryGenerator = new AIStoryGenerator();
    this.aiImageGenerator = new AIImageGenerator();
    this.changeService = new ChangeService();
  }

  public static getInstance(): StoryProgressionService {
    if (!StoryProgressionService.instance) {
      StoryProgressionService.instance = new StoryProgressionService();
    }
    return StoryProgressionService.instance;
  }

  /**
   * Main entry point for progressing a story to the next beat
   */
  public async handleProgression(
    gameId: string,
    story: Story,
    skipDatabaseUpdate: boolean = false
  ): Promise<ProgressionResult> {
    console.log(
      `[StoryProgressionService] Starting story progression for game: ${gameId}${
        skipDatabaseUpdate ? " (pregeneration mode)" : ""
      }`
    );

    if (!skipDatabaseUpdate) {
      // Cancel any ongoing pregeneration for the previous turn (only in real progression)
      const previousTurn = story.getCurrentTurn();
      await pregenerationService.cancelPregenerationForTurn(
        gameId,
        previousTurn
      );
    }

    let currentStory = story.clone();

    // Handle thread resolutions if needed
    if (this.checkNeedsThreadResolution(currentStory)) {
      // console.log(
      //   "[StoryProgressionService] Determining resolutions for previous set of beats"
      // );
      currentStory = await this.processThreadResolutions(currentStory);
    }

    // Determine next beat type and handle preparatory steps
    const nextBeatType = this.checkNextBeatType(currentStory);
    // console.log(
    //   `[StoryProgressionService] Next beat type to create: ${nextBeatType}`
    // );
    currentStory = await this.processPreparatorySteps(
      currentStory,
      nextBeatType
    );

    // Try to find a complete pregenerated state first (only in real progression)
    let finalStory: Story | undefined;
    let imageRequests: ImageRequest[] = [];

    if (!skipDatabaseUpdate) {
      const previousTurn = story.getCurrentTurn();
      const foundCompletePregen = await this.tryUseCompletePregeneration(
        gameId,
        currentStory,
        previousTurn
      );

      if (foundCompletePregen.found) {
        console.log(
          "[StoryProgressionService] Using complete pregenerated state"
        );
        finalStory = foundCompletePregen.story!;
      }
    }

    if (!finalStory) {
      // Generate beats if no complete pregenerated state found
      console.log(
        "[StoryProgressionService] No complete pregenerated state found, generating beats"
      );
      const result = await this.processBeatGeneration(currentStory);
      finalStory = result.story;
      imageRequests = result.imageRequests;
    }

    // Ensure finalStory is assigned
    if (!finalStory) {
      throw new Error("Failed to assign finalStory - this should never happen");
    }

    // If using a complete pregenerated state, collect image requests from newly added beats
    if (imageRequests.length === 0) {
      imageRequests = this.collectImageRequestsForNewBeats(story, finalStory);
    }
    // Fallback: if none were detected by simple length-diff comparison (e.g. edge cases where
    // counts don't increase but content changes), scan current beats for inline image requests
    if (imageRequests.length === 0) {
      imageRequests = this.collectImageRequestsFromCurrentBeats(finalStory);
    }

    // Update database for story progression (only in real progression)
    if (!skipDatabaseUpdate) {
      await this.updateDatabaseForProgression(gameId, finalStory);
    }

    return {
      finalStory,
      requiresPregeneration: !skipDatabaseUpdate, // Only trigger pregeneration after real progression
      imageRequests,
    };
  }

  /**
   * Check if thread resolution is needed
   */
  private checkNeedsThreadResolution(story: Story): boolean {
    return (
      story.getCurrentBeatType() === "thread" &&
      !story.isCurrentThreadResolved()
    );
  }

  /**
   * Determine the next beat type to create
   */
  private checkNextBeatType(story: Story): BeatType {
    return story.determineNextBeatType();
  }

  /**
   * Process thread resolutions for the story
   */
  private async processThreadResolutions(story: Story): Promise<Story> {
    // console.log(
    //   "[StoryProgressionService] Starting thread resolution determination"
    // );

    let updatedStory: Story = story.clone();
    const threadAnalysis = updatedStory.getCurrentThreadAnalysis();

    if (!threadAnalysis) {
      console.log(
        "[StoryProgressionService] ERROR: No thread analysis found, returning story unchanged"
      );
      return story;
    }

    // Process each thread to determine its next step's resolution
    for (const thread of threadAnalysis.threads) {
      const resolution = ThreadResolutionService.getThreadResolution(
        thread,
        updatedStory
      );
      // console.log(
      //   `[StoryProgressionService] Determined resolution for thread ${thread.id}: ${resolution}`
      // );
      updatedStory = updatedStory.updateThreadResolution(thread, resolution);
    }

    // If the threads are resolved, set the milestones
    if (updatedStory.isCurrentThreadResolved()) {
      // console.log(
      //   "[StoryProgressionService] Threads are resolved, setting milestones"
      // );

      const updatedThreadAnalysis = updatedStory.getCurrentThreadAnalysis();
      if (!updatedThreadAnalysis) {
        console.log(
          "[StoryProgressionService] ERROR: No thread analysis found after resolution"
        );
        return updatedStory;
      }

      for (const thread of updatedThreadAnalysis.threads) {
        if (!thread.resolution) {
          console.log(
            `[StoryProgressionService] ERROR: Thread ${thread.id} has no resolution, skipping milestone`
          );
          continue;
        }

        const milestone = ThreadResolutionService.getMilestone(
          thread,
          thread.resolution
        );
        // console.log(
        //   `[StoryProgressionService] Setting milestone for thread ${thread.id}: ${milestone}`
        // );

        if (milestone) {
          updatedStory = updatedStory.updateThreadMilestone(thread, milestone);
        } else {
          console.log(
            `[StoryProgressionService] ERROR: No milestone generated for thread ${thread.id}`
          );
        }
      }
    }

    return updatedStory;
  }

  /**
   * Handle preparatory steps before beat generation (switches/threads)
   */
  private async processPreparatorySteps(
    story: Story,
    nextBeatType: BeatType
  ): Promise<Story> {
    let updatedStory = story.clone();

    if (nextBeatType === "switch") {
      console.log("[StoryProgressionService] Generating switches");
      updatedStory = await this.aiStoryGenerator.generateSwitches(updatedStory);
    } else if (
      nextBeatType === "thread" &&
      updatedStory.getCurrentThreadBeatsCompleted() === 0
    ) {
      console.log("[StoryProgressionService] Generating threads");
      updatedStory = await this.aiStoryGenerator.generateThreads(updatedStory);
    }

    return updatedStory;
  }

  /**
   * Try to use complete pregenerated state if available
   */
  private async tryUseCompletePregeneration(
    gameId: string,
    story: Story,
    previousTurn: number
  ): Promise<{ found: boolean; story?: Story }> {
    const availablePlayerSlots = story.getPlayerSlots();

    for (const playerSlot of availablePlayerSlots) {
      const currentBeat = story.getCurrentBeat(playerSlot);
      if (currentBeat && currentBeat.choice !== -1) {
        const pregeneratedStory =
          await pregenerationService.getPregeneratedStory(
            gameId,
            previousTurn,
            playerSlot,
            currentBeat.choice
          );

        if (
          pregeneratedStory &&
          this.isCompletePregeneration(pregeneratedStory, story, playerSlot)
        ) {
          console.log(
            `[StoryProgressionService] Found complete pregenerated state for ${playerSlot}, using it`
          );
          return { found: true, story: pregeneratedStory };
        } else {
          console.log(
            `[StoryProgressionService] No complete pregenerated state found for ${playerSlot}, choice ${currentBeat.choice}`
          );
        }
      }
    }

    return { found: false };
  }

  /**
   * Check if a pregenerated story represents complete pregeneration
   * (has more beats than original story, indicating next beat was generated)
   */
  private isCompletePregeneration(
    pregeneratedStory: Story,
    originalStory: Story,
    playerSlot: PlayerSlot
  ): boolean {
    const pregeneratedPlayerState = pregeneratedStory.getPlayer(playerSlot);
    const originalPlayerState = originalStory.getPlayer(playerSlot);

    if (!pregeneratedPlayerState || !originalPlayerState) {
      return false;
    }

    return (
      pregeneratedPlayerState.beatHistory.length >
      originalPlayerState.beatHistory.length
    );
  }

  /**
   * Generate new beats for the story
   */
  private async processBeatGeneration(
    story: Story
  ): Promise<{ story: Story; imageRequests: ImageRequest[] }> {
    console.log("[StoryProgressionService] Generating beats");
    const [nextStory, changes, requests] =
      await this.aiStoryGenerator.generateBeats(story);
    const finalStory = this.changeService.applyChanges(nextStory, changes);
    return { story: finalStory, imageRequests: requests };
  }

  /**
   * Collect image requests for newly added beats by comparing the original story to the final story
   */
  private collectImageRequestsForNewBeats(
    originalStory: Story,
    finalStory: Story
  ): ImageRequest[] {
    const requests: ImageRequest[] = [];
    const playerSlots = finalStory.getPlayerSlots();
    for (const slot of playerSlots) {
      const originalPlayer = originalStory.getPlayer(slot);
      const finalPlayer = finalStory.getPlayer(slot);
      if (!finalPlayer) continue;
      const originalLen = originalPlayer
        ? originalPlayer.beatHistory.length
        : 0;
      const finalLen = finalPlayer.beatHistory.length;
      for (let i = originalLen; i < finalLen; i++) {
        const beat = finalPlayer.beatHistory[i];
        if (
          beat &&
          beat.imageRequest &&
          typeof beat.imageRequest === "object"
        ) {
          requests.push(beat.imageRequest as ImageRequest);
        }
      }
    }
    return requests;
  }

  /**
   * Fallback collector: scans the latest beats for each player and returns any embedded image requests.
   * Useful when adopting pregenerated states where beat counts might not strictly increase.
   */
  private collectImageRequestsFromCurrentBeats(
    finalStory: Story
  ): ImageRequest[] {
    const requests: ImageRequest[] = [];
    const playerSlots = finalStory.getPlayerSlots();
    for (const slot of playerSlots) {
      const player = finalStory.getPlayer(slot);
      const lastBeat = player?.beatHistory[player.beatHistory.length - 1];
      if (
        lastBeat &&
        lastBeat.imageRequest &&
        typeof lastBeat.imageRequest === "object"
      ) {
        requests.push(lastBeat.imageRequest as ImageRequest);
      }
    }
    return requests;
  }

  /**
   * Update database for story progression
   */
  private async updateDatabaseForProgression(
    gameId: string,
    story: Story
  ): Promise<void> {
    const playerSlots = story.getPlayerSlots();
    try {
      await storyDbService.updateStoryBeatAndTimestamp(
        gameId,
        story.getCurrentTurn()
      );
      await storyDbService.setAllPlayersPending(gameId, playerSlots);
    } catch (dbError) {
      Logger.Queue.error(
        `DB service error updating story progression for ${gameId}:`,
        dbError
      );
    }
  }
}

// Export singleton instance
export const storyProgressionService = StoryProgressionService.getInstance();
