import { type StoryState } from "../../../../shared/types/story.js";
import { StoryStatePromptService } from "./StoryStatePromptService.js";

export class NextBeatPromptService {
  static createBeatPrompt(state: StoryState): string {
    return (
      StoryStatePromptService.createStoryStatePrompt(state) +
      this.createInstructionsSection()
    );
  }

  private static createInstructionsSection(): string {
    return `======= YOUR JOB: IDENTIFY CHANGES TO THE STORY STATE AND GENERATE THE NEXT SET OF STORY BEATS =======

1. Changes to the story state: statChanges based on players' decisions in the last beat

Guidelines
- Include changes to the shared stats and the character stats of each player.
- Consider the current value of stats to decide outcomes. For example, if a player character tries to be stealthy, but the character traits indicate more of a brute force approach, the character should fail.
- If this is the first set of beats, there should be no changes. Just return an empty list.

2. One story beat for each player

How beats work:
- Players have separate beat histories. No player can see the beats of other players.
- Each beat must flow naturally from the previous beat OF THAT PLAYER.
- If several players encounter something new, you must introduce the new information to all players separately.
- No player can see the decisions of other players. If a player made a decision in the previous beat that affects other players, you must introduce the information to the other players separately.
- Beats for one turn are presented to players at the same time.
- Make sure that the options you give a player in one beat does not contradict any of the options that you gave to other players in the same turn.

For each beat, lay out a detailed plan covering the following points:

a) Developments to narrate
- Create a bullet list of all players' decisions in the last beat and the statChanges you just applied as a result.
- For each item: mention how we should narrate the item to this player (if at all).
- If a player chose to perform an action in the last beat, mention what happened as a result of that action (even if you then switch scenes).
- There should always be clear narrative feedback for players' decisions.
- This step is irrelevant if this is the first beat of the story.

b) Which information from other beats in this turn do we need to consider for this beat?
- Create a bullet list of things that happened other beats in this turn that we should consider for this beat (or even repeat if the player is in the same scene).
- Create a bullet list of options that you included in the other beats of this turn so far that we mustn't contradict with the options for this beat?

c) How should we flesh out the game world to make it more immersive?
- Check if the player is going to encounter a story element that has not yet been introduced to the player.
--- If so, introduce the element properly in the beat text and add the element id to the player's list of known story elements.
- Check if you should add a new story element to the story state.
--- Do this whenever a new element is introduced that is likely to be used in later beats.
--- In most beats, you don't have to add a new story element.
--- While NPCs and locations are the most common elements to add, you can also add items, organizations, mysteries, conflicts, rumors, projects, etc.
- For existing story elements, use newFact to add new details about them.
--- Only mention NEW information that is not yet recorded in the story state.
--- Try to link new facts to story elements (using their id). Only use 'world' if the fact doesn't fit anywhere else.
--- Aim for adding 3 or more new facts per beat. These are the details that make the world come to life. By recording them, we ensure consistency in future beats.
--- Example categories for new facts: appearance (NPCs, items), history (NPCs, locations), quirks (NPCs), functionality (items), interactions (NPCs, locations), mood (locations), etc.
--- Don't add facts for new story elements that you just created.
- The players' decisions are tracked separately and don't have to be tracked.

d) How can we reinforce the story's key conflicts and focused types of decisions?

Beat text
- The first paragraph
--- Should continue exactly where the previous beat for this player ended
--- Describe the immediate consequences of the player's decision.
--- Be specific. Show, don't tell. If the player decided to talk to a character, open with the actual conversation. If the player punshes someone, describe the actual punch.
--- The goal is to create a natural flow from one beat to the next.
--- It often makes sense to include some reaction from the player's perspective, like a bodily sensation, a thought, or an emotion.
- Use direct speech
--- Both for the player characters and the NPCs.
--- Give characters a voice. Don't just say "you absorb the cryptic wisdom imparted by X" or "you talk to X".
--- Exception: you want to skip over a routine conversation that doesn't add to the story.
- Story elements
--- If a player encounters a story element that has not been introduced yet, you must introduce it properly.
--- If a player encounters a story element that has been introduced before, don't introduce it again. Just refer to it assuming that the player knows what it is.
- Never mention, refer, or even hint at the player's options.
--- The options will be added in a special options sections later.
--- Bad: "The path before you is fraught with choices ..."
--- Bad: "Will you seek X, or will you seek Y?"
--- Bad: "You must decide: ..."
--- Bad: "You weigh your options carefully"
--- Good: Just write a strong beat that pushes the story forward and then mention the options in the options section.

3. Options

- Offer 3 options.
--- 2 can be fine occassionally if you want to force a clear or quick 'left vs. right' kind of choice.
- Be specific and action-oriented.
--- Bad: 'Investigate the artifact'. Good: 'Search the library for clues about the artifact'
--- Bad: 'Confront X physically'. Good: 'Punsh X in the face'.
- Make sure that options allow the story to flow naturally.
--- If the beat ends in the middle of a scene, the player shouldn't be able to just vanish from that scene.
- Stay true to the story's key conflicts and types of decisions that we want players to make`;
  }
}
