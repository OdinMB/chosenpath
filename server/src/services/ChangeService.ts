import type { Change } from "../../../shared/types/change.js";
import type { StoryState } from "../../../shared/types/story.js";
import type { PlayerSlot } from "../../../shared/types/players.js";

export class ChangeService {
  applyChanges(state: StoryState, changes: Change[]): StoryState {
    let updatedState = { ...state };

    for (const change of changes) {
      switch (change.type) {
        case "statChange":
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
      const updatedStats = [...state.sharedStats];
      const statIndex = updatedStats.findIndex((s) => s.id === change.stat);

      if (statIndex === -1) {
        console.log(`Shared stat ${change.stat} not found`);
        return state;
      }

      const stat = updatedStats[statIndex];
      const updatedStat = this.updateStatValue(stat, change);
      if (!updatedStat) return state;

      updatedStats[statIndex] = updatedStat;
      return { ...state, sharedStats: updatedStats };
    }

    // Handle player stats
    const playerSlot = change.group as PlayerSlot;
    const player = state.players[playerSlot];

    if (!player) {
      console.log(`Player ${playerSlot} not found`);
      return state;
    }

    const updatedStats = [...player.characterStats];
    const statIndex = updatedStats.findIndex((s) => s.id === change.stat);

    if (statIndex === -1) {
      console.log(`Stat ${change.stat} not found for player ${playerSlot}`);
      return state;
    }

    const stat = updatedStats[statIndex];
    const updatedStat = this.updateStatValue(stat, change);
    if (!updatedStat) return state;
    console.log(
      `Updated stat for player ${playerSlot}: ${stat.id} to ${updatedStat.value}`
    );

    updatedStats[statIndex] = updatedStat;
    const updatedPlayer = {
      ...player,
      characterStats: updatedStats,
    };

    return {
      ...state,
      players: {
        ...state.players,
        [playerSlot]: updatedPlayer,
      },
    };
  }

  private updateStatValue(
    stat: any,
    change: Extract<Change, { type: "statChange" }>
  ) {
    switch (change.change) {
      case "setBoolean":
        if (stat.type === "boolean") {
          console.log(`Setting boolean stat ${stat.id} to ${change.value}`);
          return { ...stat, value: change.value as boolean };
        }
        break;
      case "setString":
        if (stat.type === "string") {
          console.log(`Setting string stat ${stat.id} to "${change.value}"`);
          return { ...stat, value: change.value as string };
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
          console.log(
            `Adding element "${change.value}" to array stat ${stat.id}`
          );
          return {
            ...stat,
            value: [...(stat.value as string[]), change.value as string],
          };
        }
        break;
      case "removeElement":
        if (stat.type === "string[]") {
          console.log(
            `Removing element "${change.value}" from array stat ${stat.id}`
          );
          return {
            ...stat,
            value: (stat.value as string[]).filter((v) => v !== change.value),
          };
        }
        break;
    }
    return null;
  }
}
