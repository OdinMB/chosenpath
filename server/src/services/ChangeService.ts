import type { Change } from "../../../shared/types/change.js";
import type { StoryState } from "../../../shared/types/story.js";

export class ChangeService {
  applyChanges(state: StoryState, changes: Change[]): StoryState {
    let updatedState = { ...state };

    for (const change of changes) {
      switch (change.type) {
        case "stat":
          updatedState = this.applyStatChange(updatedState, change);
          break;
        case "newFact":
          console.log(`Adding new fact: ${change.fact}`);
          updatedState.establishedFacts.push(change.fact);
          break;
        case "newMilestone":
          updatedState = this.applyNewMilestone(updatedState, change);
          break;
      }
    }

    return updatedState;
  }

  private applyNewMilestone(
    state: StoryState,
    change: Extract<Change, { type: "newMilestone" }>
  ): StoryState {
    console.log(
      `Adding milestone to outcome ${change.outcome}: ${change.newMilestone}`
    );

    const updatedOutcomes = state.outcomes.map((outcome) => {
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

    return { ...state, outcomes: updatedOutcomes };
  }

  private applyStatChange(
    state: StoryState,
    change: Extract<Change, { type: "stat" }>
  ): StoryState {
    const updatedStats = [...state.stats];
    const statIndex = updatedStats.findIndex((s) => s.id === change.stat);

    if (statIndex === -1) {
      console.log(`Stat ${change.stat} not found`);
      return state;
    }

    const stat = updatedStats[statIndex];

    switch (change.change) {
      case "setBoolean":
        if (stat.type === "boolean") {
          console.log(`Setting boolean stat ${stat.id} to ${change.value}`);
          stat.value = change.value as boolean;
        }
        break;
      case "setString":
        if (stat.type === "string") {
          console.log(`Setting string stat ${stat.id} to "${change.value}"`);
          stat.value = change.value as string;
        }
        break;
      case "addNumber":
      case "subtractNumber":
        if (stat.type === "number" || stat.type === "percentage") {
          const delta = change.change === "addNumber" ? 1 : -1;
          const newValue =
            (stat.value as number) + delta * (change.value as number);
          console.log(
            `${
              change.change === "addNumber" ? "Adding to" : "Subtracting from"
            } number stat ${stat.id}: ${stat.value} -> ${newValue}`
          );
          stat.value = newValue;
        }
        break;
      case "setNumber":
        if (stat.type === "number" || stat.type === "percentage") {
          console.log(`Setting number stat ${stat.id} to ${change.value}`);
          stat.value = change.value as number;
        }
        break;
      case "addElement":
        if (stat.type === "string[]") {
          console.log(
            `Adding element "${change.value}" to array stat ${stat.id}`
          );
          (stat.value as string[]).push(change.value as string);
        }
        break;
      case "removeElement":
        if (stat.type === "string[]") {
          console.log(
            `Removing element "${change.value}" from array stat ${stat.id}`
          );
          stat.value = (stat.value as string[]).filter(
            (v) => v !== change.value
          );
        }
        break;
    }

    return { ...state, stats: updatedStats };
  }
}
