import type { Change } from "../../../shared/types/change.js";
import type { StoryState } from "../../../shared/types/story.js";
import type { PlayerSlot } from "../../../shared/types/players.js";

export class ChangeService {
  applyChanges(state: StoryState, changes: Change[]): StoryState {
    // Sort changes to process newStoryElement before newFact
    const sortedChanges = [...changes].sort((a, b) => {
      if (a.type === "newStoryElement" && b.type === "newFact") return -1;
      if (a.type === "newFact" && b.type === "newStoryElement") return 1;
      return 0;
    });

    let updatedState = { ...state };

    for (const change of sortedChanges) {
      switch (change.type) {
        case "statChange":
          updatedState = this.applyStatChange(updatedState, change);
          break;
        case "newFact":
          updatedState = this.applyNewFact(updatedState, change);
          break;
        case "newMilestone":
          updatedState = this.applyNewMilestone(updatedState, change);
          break;
        case "newStoryElement":
          updatedState = this.applyNewStoryElement(updatedState, change);
          break;
        case "addKnownStoryElement":
          updatedState = this.applyAddKnownStoryElement(updatedState, change);
          break;
      }
    }

    return updatedState;
  }

  private applyAddKnownStoryElement(
    state: StoryState,
    change: Extract<Change, { type: "addKnownStoryElement" }>
  ): StoryState {
    console.log(
      `Adding known story element ${change.storyElementId} for player ${change.player}`
    );

    const player = state.players[change.player];

    if (!player) {
      console.log(`Player ${change.player} not found`);
      return state;
    }

    if (player.knownStoryElements.includes(change.storyElementId)) {
      console.log(
        `Story element ${change.storyElementId} is already known to player ${change.player}`
      );
      return state;
    }

    return {
      ...state,
      players: {
        ...state.players,
        [change.player]: {
          ...player,
          knownStoryElements: [
            ...player.knownStoryElements,
            change.storyElementId,
          ],
        },
      },
    };
  }

  private applyNewMilestone(
    state: StoryState,
    change: Extract<Change, { type: "newMilestone" }>
  ): StoryState {
    console.log(
      `Adding milestone to outcome ${change.outcome} for player ${change.player}: ${change.newMilestone}`
    );

    const updatedPlayers = { ...state.players };
    const player = updatedPlayers[change.player];

    if (!player) {
      console.log(`Player ${change.player} not found`);
      return state;
    }

    const updatedOutcomes = player.outcomes.map((outcome) => {
      if (outcome.id !== change.outcome) return outcome;

      const newMilestones = [
        ...(outcome.milestones || []),
        change.newMilestone,
      ];
      return {
        ...outcome,
        milestones: newMilestones,
      };
    });

    updatedPlayers[change.player] = {
      ...player,
      outcomes: updatedOutcomes,
    };

    return { ...state, players: updatedPlayers };
  }

  private applyStatChange(
    state: StoryState,
    change: Extract<Change, { type: "statChange" }>
  ): StoryState {
    if (change.group === "shared") {
      return this.updateStatsArray(
        state,
        state.sharedStats,
        change,
        (updatedStats) => ({ ...state, sharedStats: updatedStats })
      );
    }

    const playerSlot = change.group as PlayerSlot;
    const player = state.players[playerSlot];

    if (!player) {
      console.log(`Player ${playerSlot} not found`);
      return state;
    }

    return this.updateStatsArray(
      state,
      player.characterStats,
      change,
      (updatedStats) => ({
        ...state,
        players: {
          ...state.players,
          [playerSlot]: {
            ...player,
            characterStats: updatedStats,
          },
        },
      })
    );
  }

  private updateStatsArray(
    state: StoryState,
    stats: any[],
    change: Extract<Change, { type: "statChange" }>,
    updateState: (updatedStats: any[]) => StoryState
  ): StoryState {
    const statIndex = stats.findIndex((s) => s.id === change.stat);

    if (statIndex === -1) {
      console.log(`Stat ${change.stat} not found`);
      return state;
    }

    const stat = stats[statIndex];
    const updatedStat = this.updateStatValue(stat, change);

    if (!updatedStat) {
      console.log(`Stat ${stat.id} not updated`);
      return state;
    }

    console.log(
      `Updated stat ${stat.id} ${
        change.group === "shared" ? "(shared)" : `for player ${change.group}`
      } from ${stat.value} to ${updatedStat.value}`
    );

    const updatedStats = [...stats];
    updatedStats[statIndex] = updatedStat;

    return updateState(updatedStats);
  }

  private updateStatValue(
    stat: any,
    change: Extract<Change, { type: "statChange" }>
  ) {
    switch (change.change) {
      case "setBoolean":
        if (stat.type === "boolean") {
          return { ...stat, value: change.value as boolean };
        }
        break;
      case "setString":
        if (stat.type === "string") {
          return { ...stat, value: change.value as string };
        }
        break;
      case "addNumber":
      case "subtractNumber":
        if (stat.type === "number" || stat.type === "percentage") {
          const delta = change.change === "addNumber" ? 1 : -1;
          const newValue =
            (stat.value as number) + delta * (change.value as number);
          return { ...stat, value: newValue };
        }
        break;
      case "setNumber":
        if (stat.type === "number" || stat.type === "percentage") {
          console.log(`Setting number stat ${stat.id} to ${change.value}`);
          return { ...stat, value: change.value as number };
        }
        break;
      case "addElement":
        if (stat.type === "string[]") {
          const currentValue = stat.value as string[];
          if (!currentValue.includes(change.value as string)) {
            return {
              ...stat,
              value: [...currentValue, change.value as string],
            };
          }
          return stat;
        }
        break;
      case "removeElement":
        if (stat.type === "string[]") {
          return {
            ...stat,
            value: (stat.value as string[]).filter((v) => v !== change.value),
          };
        }
        break;
    }
    return null;
  }

  private applyNewFact(
    state: StoryState,
    change: Extract<Change, { type: "newFact" }>
  ): StoryState {
    console.log(`Adding new fact to ${change.storyElementId}: ${change.fact}`);

    if (change.storyElementId === "world") {
      return {
        ...state,
        worldFacts: [...state.worldFacts, change.fact],
      };
    }

    const updatedElements = state.storyElements.map((element) => {
      if (element.id === change.storyElementId) {
        return {
          ...element,
          facts: [...element.facts, change.fact],
        };
      }
      return element;
    });

    return {
      ...state,
      storyElements: updatedElements,
    };
  }

  private applyNewStoryElement(
    state: StoryState,
    change: Extract<Change, { type: "newStoryElement" }>
  ): StoryState {
    console.log(`Adding new story element: ${JSON.stringify(change.element)}`);

    // Check if element with this ID already exists
    if (
      state.storyElements.some((element) => element.id === change.element.id)
    ) {
      console.log(`Story element with ID ${change.element.id} already exists`);
      return state;
    }

    return {
      ...state,
      storyElements: [...state.storyElements, change.element],
    };
  }
}
