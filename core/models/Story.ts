import {
  StoryState,
  ClientStoryState,
  GameMode,
  Guidelines,
  StoryPhase,
  PlayerCount,
  PlayerSlot,
  StoryElement,
  Outcome,
  Stat,
  BeatType,
  SwitchAnalysis,
  ThreadAnalysis,
  Thread,
  Resolution,
} from "@core/types/index.js";
import { PlayerManager } from "./PlayerManager.js";
import { ThreadManager } from "./ThreadManager.js";
import { ImageManager } from "./ImageManager.js";
import { ClientStateManager } from "./ClientStateManager.js";

/**
 * Comprehensive manager for story state
 * Encapsulates all story state management logic and provides a clean interface
 * using a domain-driven design approach with specialized managers
 */
export class Story {
  private state: StoryState;
  private playerManager: PlayerManager;
  private threadManager: ThreadManager;
  private imageManager: ImageManager;
  private clientStateManager: ClientStateManager;

  constructor(state: StoryState) {
    this.state = state;
    this.playerManager = new PlayerManager(state);
    this.threadManager = new ThreadManager(state);
    this.imageManager = new ImageManager(state);
    this.clientStateManager = new ClientStateManager();
  }

  static create(state: StoryState): Story {
    return new Story(state);
  }

  clone(updatedState: Partial<StoryState> = {}): Story {
    return new Story({
      ...this.state,
      ...updatedState,
    });
  }

  // Story metadata getters
  getState(): StoryState {
    return this.state;
  }

  getTitle(): string {
    return this.state.title;
  }

  getGameMode(): GameMode {
    return this.state.gameMode;
  }

  getGuidelines(): Guidelines {
    return this.state.guidelines;
  }

  getStoryElements(): StoryElement[] {
    return this.state.storyElements;
  }

  getWorldFacts(): string[] {
    return this.state.worldFacts;
  }

  getSharedOutcomes(): Outcome[] {
    return this.state.sharedOutcomes;
  }

  /**
   * Get an outcome by its ID from both shared outcomes and player outcomes
   * @param outcomeId The ID of the outcome to retrieve
   * @returns The outcome with the specified ID, or null if not found
   */
  getOutcomeById(outcomeId: string): Outcome | null {
    // First check shared outcomes
    const sharedOutcome = this.state.sharedOutcomes.find(
      (outcome) => outcome.id === outcomeId
    );
    if (sharedOutcome) {
      return sharedOutcome;
    }

    // Then check player outcomes
    for (const playerSlot of Object.keys(this.state.players) as PlayerSlot[]) {
      const player = this.state.players[playerSlot];
      if (player.outcomes) {
        const playerOutcome = player.outcomes.find(
          (outcome) => outcome.id === outcomeId
        );
        if (playerOutcome) {
          return playerOutcome;
        }
      }
    }

    return null;
  }

  getStatById(statId: string): Stat | null {
    return (
      this.state.playerStats.find((stat) => stat.id === statId) ||
      this.state.sharedStats.find((stat) => stat.id === statId) ||
      null
    );
  }

  getSharedStats(): Stat[] {
    return this.state.sharedStats;
  }

  includesImages(): boolean {
    return this.state.generateImages;
  }

  isFirstBeat(): boolean {
    return this.getCurrentTurn() === 0;
  }

  isStoryComplete(): boolean {
    return this.getCurrentTurn() > this.state.maxTurns;
  }

  isMultiplayer(): boolean {
    return this.getNumberOfPlayers() > 1;
  }

  // Story phases
  getCurrentPhase(): StoryPhase | null {
    if (this.state.storyPhases.length === 0) {
      return null;
    }
    return this.state.storyPhases[this.state.storyPhases.length - 1];
  }

  getPreviousPhase(): StoryPhase | null {
    if (this.state.storyPhases.length < 2) {
      return null;
    }
    return this.state.storyPhases[this.state.storyPhases.length - 2];
  }

  isSwitchAnalysis(phase: StoryPhase | null): phase is SwitchAnalysis {
    if (!phase) return false;
    return "switches" in phase;
  }

  isThreadAnalysis(phase: StoryPhase | null): phase is ThreadAnalysis {
    if (!phase) return false;
    return "threads" in phase;
  }

  getCurrentSwitchAnalysis(): SwitchAnalysis | null {
    const currentPhase = this.getCurrentPhase();
    return this.isSwitchAnalysis(currentPhase) ? currentPhase : null;
  }

  getCurrentThreadAnalysis(): ThreadAnalysis | null {
    const currentPhase = this.getCurrentPhase();
    return this.isThreadAnalysis(currentPhase) ? currentPhase : null;
  }

  getPreviousThreadAnalysis(): ThreadAnalysis | null {
    // Look through phases in reverse order to find the most recent ThreadAnalysis
    // that isn't the current phase
    const currentPhase = this.getCurrentPhase();

    for (let i = this.state.storyPhases.length - 2; i >= 0; i--) {
      const phase = this.state.storyPhases[i];
      if (this.isThreadAnalysis(phase) && phase !== currentPhase) {
        return phase;
      }
    }

    return null;
  }

  // Beat types and turn management
  getCurrentBeatType(): BeatType {
    return this.threadManager.getCurrentBeatType(this.state);
  }

  determineNextBeatType(): BeatType {
    return this.threadManager.determineNextBeatType(this.state);
  }

  getCurrentTurn(): number {
    return this.playerManager.getCurrentTurn(this.state);
  }

  getMaxTurns(): number {
    return this.state.maxTurns;
  }

  // State update methods
  addPhase(phase: StoryPhase): Story {
    const updatedState = {
      ...this.state,
      storyPhases: [...this.state.storyPhases, phase],
    };
    return new Story(updatedState);
  }

  updateThreadResolution(thread: Thread, resolution: Resolution): Story {
    const updatedState = this.threadManager.updateThreadResolution(
      this.state,
      thread,
      resolution
    );
    return new Story(updatedState);
  }

  updateThreadMilestone(thread: Thread, milestone: string): Story {
    const updatedState = this.threadManager.updateThreadMilestone(
      this.state,
      thread,
      milestone
    );
    return new Story(updatedState);
  }

  applyChanges(updatedState: Partial<StoryState>): Story {
    return new Story({
      ...this.state,
      ...updatedState,
    });
  }

  updatePlayers(players: Record<PlayerSlot, any>): Story {
    return new Story({
      ...this.state,
      players,
    });
  }

  // Player delegation
  getNumberOfPlayers(): PlayerCount {
    return this.playerManager.getNumberOfPlayers(this.state);
  }

  getPlayerSlots(): PlayerSlot[] {
    return this.playerManager.getPlayerSlots(this.state);
  }

  getPlayerCodes(): Record<PlayerSlot, string> {
    return this.state.playerCodes;
  }

  getPlayerSlotByCode(code: string): PlayerSlot | null {
    return this.playerManager.getPlayerSlotByCode(this.state, code);
  }

  getPendingPlayers(): PlayerSlot[] {
    return this.playerManager.getPendingPlayers(this.state);
  }

  getPendingCharacterSelections(): PlayerSlot[] {
    return this.playerManager.getPendingCharacterSelections(this.state);
  }

  areAllChoicesSubmitted(): boolean {
    return this.getPendingPlayers().length === 0;
  }

  areAllCharactersSelected(): boolean {
    return this.playerManager.areAllCharactersSelected(this.state);
  }

  completeCharacterSelection(): Story {
    return this.clone({
      characterSelectionCompleted: true,
    });
  }

  // Player forwarding methods
  getPlayers() {
    return this.playerManager.getPlayers(this.state);
  }

  getPlayer(playerSlot: PlayerSlot) {
    return this.playerManager.getPlayer(this.state, playerSlot);
  }

  updatePlayerPreviousThreadTypes(threads: Thread[]): Story {
    const updatedState = this.playerManager.updatePreviousThreadTypes(
      this.state,
      threads
    );
    return new Story(updatedState);
  }

  getCurrentBeat(playerSlot: PlayerSlot) {
    return this.playerManager.getCurrentBeat(this.state, playerSlot);
  }

  getPreviousBeat(playerSlot: PlayerSlot) {
    return this.playerManager.getPreviousBeat(this.state, playerSlot);
  }

  addBeatToPlayer(playerSlot: PlayerSlot, beat: any) {
    const updatedState = this.playerManager.addBeatToPlayer(
      this.state,
      playerSlot,
      beat
    );
    return new Story(updatedState);
  }

  updateChoice(playerSlot: PlayerSlot, optionIndex: number) {
    const updatedState = this.playerManager.updateChoice(
      this.state,
      playerSlot,
      optionIndex
    );
    return new Story(updatedState);
  }

  updateBeatResolution(playerSlot: PlayerSlot, resolution: Resolution) {
    const updatedState = this.playerManager.updateBeatResolution(
      this.state,
      playerSlot,
      resolution
    );
    return new Story(updatedState);
  }

  updateBeatResolutionDetails(playerSlot: PlayerSlot, resolutionDetails: any) {
    const updatedState = this.playerManager.updateBeatResolutionDetails(
      this.state,
      playerSlot,
      resolutionDetails
    );
    return new Story(updatedState);
  }

  updatePlayerCharacter(
    playerSlot: PlayerSlot,
    identity: any,
    background: any
  ) {
    const updatedState = this.playerManager.updatePlayerCharacter(
      this.state,
      playerSlot,
      identity,
      background
    );
    return new Story(updatedState);
  }

  // Thread forwarding methods
  getCurrentThreadDuration() {
    return this.threadManager.getCurrentThreadDuration(this.state);
  }

  getCurrentThreadBeatsCompleted() {
    return this.threadManager.getCurrentThreadBeatsCompleted(this.state);
  }

  getCurrentThreadLastStepResolution(playerSlot: PlayerSlot) {
    return this.threadManager.getCurrentThreadLastStepResolution(
      this.state,
      playerSlot
    );
  }

  isCurrentThreadResolved() {
    return this.threadManager.isCurrentThreadResolved(this.state);
  }

  getThreadBeatTexts(thread: Thread) {
    return this.threadManager.getThreadBeatTexts(this.state, thread);
  }

  getThreadLastBeatTexts(thread: Thread) {
    return this.threadManager.getThreadLastBeatTexts(this.state, thread);
  }

  // Image forwarding methods
  getImages() {
    return this.imageManager.getImages(this.state);
  }

  addImage(image: any) {
    const updatedState = this.imageManager.addImage(this.state, image);
    return new Story(updatedState);
  }

  updateImage(imageId: string, updates: any) {
    const updatedState = this.imageManager.updateImage(
      this.state,
      imageId,
      updates
    );
    return new Story(updatedState);
  }

  setCurrentBeatImage(playerSlot: PlayerSlot, imageId: string) {
    const updatedState = this.imageManager.setCurrentBeatImage(
      this.state,
      playerSlot,
      imageId
    );
    return new Story(updatedState);
  }

  // Client state forwarding
  filterStateForPlayer(playerSlot: PlayerSlot): ClientStoryState {
    return this.clientStateManager.filterStateForPlayer(
      this.state,
      playerSlot,
      this.getCurrentBeatType(),
      this.getPendingPlayers(),
      this.getPendingCharacterSelections()
    );
  }
}
