import type {
  Change,
  PlayerSlot,
  Stat,
  StatValueEntry,
  StoryState,
} from "shared/types/index.js";
import { Story } from "./Story.js";

export class ChangeService {
  applyChanges(story: Story, changes: Change[]): Story {
    // Sort changes to process newStoryElement before newFact
    const sortedChanges = [...changes].sort((a, b) => {
      if (a.type === "newStoryElement" && b.type === "newFact") return -1;
      if (a.type === "newFact" && b.type === "newStoryElement") return 1;
      return 0;
    });

    let updatedStory = story;

    for (const change of sortedChanges) {
      switch (change.type) {
        case "statChange":
          updatedStory = this.applyStatChange(
            updatedStory,
            change as Change & { type: "statChange" }
          );
          break;
        case "newFact":
          updatedStory = this.applyNewFact(
            updatedStory,
            change as Change & { type: "newFact" }
          );
          break;
        case "newMilestone":
          updatedStory = this.applyNewMilestone(
            updatedStory,
            change as Change & { type: "newMilestone" }
          );
          break;
        case "newStoryElement":
          updatedStory = this.applyNewStoryElement(
            updatedStory,
            change as Change & { type: "newStoryElement" }
          );
          break;
        case "addIntroductionOfStoryElement":
          updatedStory = this.applyAddIntroductionOfStoryElement(
            updatedStory,
            change as Change & { type: "addIntroductionOfStoryElement" }
          );
          break;
      }
    }

    return updatedStory;
  }

  private applyAddIntroductionOfStoryElement(
    story: Story,
    change: Change & { type: "addIntroductionOfStoryElement" }
  ): Story {
    console.log(
      `Adding introduction of story element ${change.storyElementId} for player ${change.player}`
    );

    const state = story.getState();
    const player = state.players[change.player];

    if (!player) {
      console.log(`Player ${change.player} not found`);
      return story;
    }

    if (player.knownStoryElements.includes(change.storyElementId)) {
      console.log(
        `Story element ${change.storyElementId} is already known to player ${change.player}`
      );
      return story;
    }

    const updatedState = {
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

    return story.applyChanges(updatedState);
  }

  private applyNewMilestone(
    story: Story,
    change: Change & { type: "newMilestone" }
  ): Story {
    console.log(
      `Adding milestone to outcome ${change.outcome} (${change.outcomeGroup}): ${change.newMilestone}`
    );

    const state = story.getState();

    if (change.outcomeGroup === "shared") {
      const updatedOutcomes = state.sharedOutcomes.map((outcome) => {
        if (outcome.id !== change.outcome) return outcome;

        return {
          ...outcome,
          milestones: [...(outcome.milestones || []), change.newMilestone],
        };
      });

      return story.applyChanges({
        sharedOutcomes: updatedOutcomes,
      });
    }

    const player = state.players[change.outcomeGroup];

    if (!player) {
      console.log(`Player ${change.outcomeGroup} not found`);
      return story;
    }

    const updatedOutcomes = player.outcomes.map((outcome) => {
      if (outcome.id !== change.outcome) return outcome;

      return {
        ...outcome,
        milestones: [...(outcome.milestones || []), change.newMilestone],
      };
    });

    return story.applyChanges({
      players: {
        ...state.players,
        [change.outcomeGroup]: {
          ...player,
          outcomes: updatedOutcomes,
        },
      },
    });
  }

  private applyStatChange(
    story: Story,
    change: Change & { type: "statChange" }
  ): Story {
    const state = story.getState();

    if (change.group === "shared") {
      console.log(`Applying stat change to shared stat: ${change.stat}`);
      return this.updateStatValues(
        story,
        state.sharedStatValues,
        state.sharedStats,
        change,
        (updatedStatValues) => ({ sharedStatValues: updatedStatValues })
      );
    }

    const playerSlot = change.group as PlayerSlot;
    const player = state.players[playerSlot];

    if (!player) {
      console.log(
        `Player ${playerSlot} not found for stat change: ${change.stat}`
      );
      return story;
    }

    console.log(
      `Applying stat change to player ${playerSlot}'s stat: ${change.stat}`
    );
    return this.updateStatValues(
      story,
      player.statValues,
      state.playerStats,
      change,
      (updatedStatValues) => ({
        players: {
          ...state.players,
          [playerSlot]: {
            ...player,
            statValues: updatedStatValues,
          },
        },
      })
    );
  }

  private updateStatValues(
    story: Story,
    statValues: StatValueEntry[],
    stats: Stat[],
    change: Change & { type: "statChange" },
    updateState: (updatedStatValues: StatValueEntry[]) => Partial<StoryState>
  ): Story {
    const statDef = stats.find((s) => s.id === change.stat);
    if (!statDef) {
      console.log(`Stat definition for ${change.stat} not found`);
      return story;
    }

    const statValueIndex = statValues.findIndex(
      (sv) => sv.statId === change.stat
    );
    if (statValueIndex === -1) {
      console.log(`Stat value for ${change.stat} not found`);
      return story;
    }

    const statValue = statValues[statValueIndex];
    const updatedStatValue = this.updateStatValue(statDef, statValue, change);

    if (!updatedStatValue) {
      console.log(
        `Stat ${statDef.id} not updated. Incompatible change type "${change.change}" for stat type "${statDef.type}"`
      );
      return story;
    }

    console.log(
      `Updated stat ${statDef.id} ${
        change.group === "shared" ? "(shared)" : `for player ${change.group}`
      } from ${JSON.stringify(statValue.value)} to ${JSON.stringify(
        updatedStatValue.value
      )}`
    );

    const updatedStatValues = [...statValues];
    updatedStatValues[statValueIndex] = updatedStatValue;

    return story.applyChanges(updateState(updatedStatValues));
  }

  private updateStatValue(
    statDef: Stat,
    statValue: StatValueEntry,
    change: Change & { type: "statChange" }
  ): StatValueEntry | null {
    switch (change.change) {
      case "setString":
        if (statDef.type === "string") {
          return { ...statValue, value: change.value as string };
        }
        break;
      case "addNumber":
      case "subtractNumber":
        if (
          statDef.type === "number" ||
          statDef.type === "percentage" ||
          statDef.type === "opposites"
        ) {
          // Fix: directly use the change value with appropriate sign
          const valueToAdd =
            change.change === "addNumber"
              ? (change.value as number)
              : -(change.value as number);

          let newValue = (statValue.value as number) + valueToAdd;

          // Clamp percentage and opposites values between 0 and 100
          if (statDef.type === "percentage" || statDef.type === "opposites") {
            newValue = Math.max(0, Math.min(100, newValue));
          }

          return { ...statValue, value: newValue };
        }
        break;
      case "setNumber":
        if (
          statDef.type === "number" ||
          statDef.type === "percentage" ||
          statDef.type === "opposites"
        ) {
          console.log(`Setting number stat ${statDef.id} to ${change.value}`);
          let newValue = change.value as number;

          // Clamp percentage and opposites values between 0 and 100
          if (statDef.type === "percentage" || statDef.type === "opposites") {
            newValue = Math.max(0, Math.min(100, newValue));
          }

          return { ...statValue, value: newValue };
        }
        break;
      case "addElement":
        if (statDef.type === "string[]") {
          const currentValue = statValue.value as string[];
          if (!currentValue.includes(change.value as string)) {
            return {
              ...statValue,
              value: [...currentValue, change.value as string],
            };
          }
          return statValue;
        }
        break;
      case "removeElement":
        if (statDef.type === "string[]") {
          return {
            ...statValue,
            value: (statValue.value as string[]).filter(
              (v) => v !== change.value
            ),
          };
        }
        break;
    }
    return null;
  }

  private applyNewFact(
    story: Story,
    change: Change & { type: "newFact" }
  ): Story {
    console.log(`Adding new fact to ${change.storyElementId}: ${change.fact}`);

    const state = story.getState();

    if (change.storyElementId === "world") {
      // Check if the fact already exists in worldFacts
      if (state.worldFacts.includes(change.fact)) {
        console.log(`Fact already exists in worldFacts: ${change.fact}`);
        return story;
      }

      return story.applyChanges({
        worldFacts: [...state.worldFacts, change.fact],
      });
    }

    const updatedElements = state.storyElements.map((element) => {
      if (element.id === change.storyElementId) {
        // Check if the fact already exists for this story element
        if (element.facts.includes(change.fact)) {
          console.log(
            `Fact already exists for story element ${element.id}: ${change.fact}`
          );
          return element;
        }

        return {
          ...element,
          facts: [...element.facts, change.fact],
        };
      }
      return element;
    });

    return story.applyChanges({
      storyElements: updatedElements,
    });
  }

  private applyNewStoryElement(
    story: Story,
    change: Change & { type: "newStoryElement" }
  ): Story {
    console.log(`Adding new story element: ${JSON.stringify(change.element)}`);

    const state = story.getState();

    // Check if element with this ID already exists
    if (
      state.storyElements.some((element) => element.id === change.element.id)
    ) {
      console.log(`Story element with ID ${change.element.id} already exists`);
      return story;
    }

    return story.applyChanges({
      storyElements: [...state.storyElements, change.element],
    });
  }
}
