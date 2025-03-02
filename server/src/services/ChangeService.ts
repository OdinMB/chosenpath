import type { Change } from "shared/types/change.js";
import type { StoryState } from "shared/types/story.js";
import type { PlayerSlot } from "shared/types/player.js";
import type { Stat } from "shared/types/stat.js";

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
          updatedState = this.applyStatChange(
            updatedState,
            change as Change & { type: "statChange" }
          );
          break;
        case "newFact":
          updatedState = this.applyNewFact(
            updatedState,
            change as Change & { type: "newFact" }
          );
          break;
        case "newMilestone":
          updatedState = this.applyNewMilestone(
            updatedState,
            change as Change & { type: "newMilestone" }
          );
          break;
        case "newStoryElement":
          updatedState = this.applyNewStoryElement(
            updatedState,
            change as Change & { type: "newStoryElement" }
          );
          break;
        case "addIntroductionOfStoryElement":
          updatedState = this.applyAddIntroductionOfStoryElement(
            updatedState,
            change as Change & { type: "addIntroductionOfStoryElement" }
          );
          break;
      }
    }

    return updatedState;
  }

  private applyAddIntroductionOfStoryElement(
    state: StoryState,
    change: Change & { type: "addIntroductionOfStoryElement" }
  ): StoryState {
    console.log(
      `Adding introduction of story element ${change.storyElementId} for player ${change.player}`
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
    change: Change & { type: "newMilestone" }
  ): StoryState {
    console.log(
      `Adding milestone to outcome ${change.outcome} (${change.outcomeGroup}): ${change.newMilestone}`
    );

    if (change.outcomeGroup === "shared") {
      const updatedOutcomes = state.sharedOutcomes.map((outcome) => {
        if (outcome.id !== change.outcome) return outcome;

        return {
          ...outcome,
          milestones: [...(outcome.milestones || []), change.newMilestone],
        };
      });

      return {
        ...state,
        sharedOutcomes: updatedOutcomes,
      };
    }

    const player = state.players[change.outcomeGroup];

    if (!player) {
      console.log(`Player ${change.outcomeGroup} not found`);
      return state;
    }

    const updatedOutcomes = player.outcomes.map((outcome) => {
      if (outcome.id !== change.outcome) return outcome;

      return {
        ...outcome,
        milestones: [...(outcome.milestones || []), change.newMilestone],
      };
    });

    return {
      ...state,
      players: {
        ...state.players,
        [change.outcomeGroup]: {
          ...player,
          outcomes: updatedOutcomes,
        },
      },
    };
  }

  private applyStatChange(
    state: StoryState,
    change: Change & { type: "statChange" }
  ): StoryState {
    if (change.group === "shared") {
      console.log(`Applying stat change to shared stat: ${change.stat}`);
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
      console.log(
        `Player ${playerSlot} not found for stat change: ${change.stat}`
      );
      return state;
    }

    console.log(
      `Applying stat change to player ${playerSlot}'s stat: ${change.stat}`
    );
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
    stats: Stat[],
    change: Change & { type: "statChange" },
    updateState: (updatedStats: Stat[]) => StoryState
  ): StoryState {
    const statIndex = stats.findIndex((s) => s.id === change.stat);

    if (statIndex === -1) {
      console.log(
        `Stat ${change.stat} not found in ${
          change.group === "shared"
            ? "shared stats"
            : `player ${change.group}'s stats`
        }`
      );
      return state;
    }

    const stat = stats[statIndex];
    const updatedStat = this.updateStatValue(stat, change);

    if (!updatedStat) {
      console.log(
        `Stat ${stat.id} not updated. Incompatible change type "${change.change}" for stat type "${stat.type}"`
      );
      return state;
    }

    console.log(
      `Updated stat ${stat.id} ${
        change.group === "shared" ? "(shared)" : `for player ${change.group}`
      } from ${JSON.stringify(stat.value)} to ${JSON.stringify(
        updatedStat.value
      )}`
    );

    const updatedStats = [...stats];
    updatedStats[statIndex] = updatedStat;

    return updateState(updatedStats);
  }

  private updateStatValue(
    stat: Stat,
    change: Change & { type: "statChange" }
  ): Stat | null {
    switch (change.change) {
      case "setBoolean":
        // Boolean type is commented out in the schema but might be used in the future
        // For now, we'll handle it but it won't match any current stat types
        if (stat.type === ("boolean" as any)) {
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
        if (
          stat.type === "number" ||
          stat.type === "percentage" ||
          stat.type === "opposites"
        ) {
          // Fix: directly use the change value with appropriate sign
          const valueToAdd =
            change.change === "addNumber"
              ? (change.value as number)
              : -(change.value as number);

          let newValue = (stat.value as number) + valueToAdd;

          // Clamp percentage and opposites values between 0 and 100
          if (stat.type === "percentage" || stat.type === "opposites") {
            newValue = Math.max(0, Math.min(100, newValue));
          }

          return { ...stat, value: newValue };
        }
        break;
      case "setNumber":
        if (
          stat.type === "number" ||
          stat.type === "percentage" ||
          stat.type === "opposites"
        ) {
          console.log(`Setting number stat ${stat.id} to ${change.value}`);
          let newValue = change.value as number;

          // Clamp percentage and opposites values between 0 and 100
          if (stat.type === "percentage" || stat.type === "opposites") {
            newValue = Math.max(0, Math.min(100, newValue));
          }

          return { ...stat, value: newValue };
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
    change: Change & { type: "newFact" }
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
    change: Change & { type: "newStoryElement" }
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
