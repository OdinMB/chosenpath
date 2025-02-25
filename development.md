# Feature backlog

More structured threads

- Beat progression with typed schema.
- Add mechanism to enable players to fail at things.
- Give full context (text and options) for the current thread?

Improve generations

- Attach facts to players?
- More efficient prompts for switches/threads/beats?
- adjust scope of story setup based on the number of beats
- Multi-step flow for generating a stat schema?
- Track story elements that a player has NOT been introduced to yet?
- Titles for stories (show in resume story section in Welcome screen)

Big features

- Let player choose/adjust starting position (name, pronouns, stats)
- Images: generate one for each player and story element and only use iamges from that list?
- Multiplaer mode: shared perspective
  - majority vote
  - lottery
  - setting for % players who must have voted to continue)
- Select language
  - different ones for different players

User accounts

- Manage games
- Invite specific account to a player slot
- Game history

Open Source?

- Add setup and deployment instructions

------

See @ThreadPromptService.ts for context about threads, switches, and beats.

Right now, there are three problems:
- The dependencies between steps in the beat progression are not tracked and enforced 
- The stories never let players fail. (If you fail to find an in with NPC in beat 2, it should be hard to get them to do what you want, come at a cost, etc.)
- The threads are not always building up to a climax.

I'd like to build a system that
- tracks intermediate outcomes for each step of the beat progression
- has previous intermediate outcomes affect how the thread progresses
- drives threads toward a climax with increasing stakes (initial beats only increasing the chances of favorable results in later beats, and with the final beat deciding the actual milestone that will answer the thread's core question)
- has a thread progression that lays out the entire flow for the thread
- covers only the structure of the flow, with the actual content of the beats and options getting generated later

General structure:
- Each beat results in a favorable/mixed/unfavorable outcome.
- The outcome is determined at random based on a probability distribution.
- If the previous beat was mixed or if it's the first beat of a thread: distribution of outcomes is 33/33/33. If the previous beat was favorable, the distribution is 50/50/0. If it was unfavorable, it's 0/50/50.
- Each beat offers options that can award between +50 and -50 points. For example, if a player is very charismatic and wants to charm [npc] to establish a good first impression, that option might grant +40 points. If a player who is more of a brute tries the same option, they might get -30 points.
- The points shift the default distribution of outcomes for this beat. One point for each change from unfavorable to mixed and from mixed to favorable. For example, starting with a 33/33/33 distribution, with +10 points, the final distribution for that beat might be 33/43/23
- Each option is either normal, safe, or risky. Risky options skew the distribution toward extremes. An otherwise 33/33/33 distrubtion might become a 40/20/40 distribution. Safe options skew the distribution toward not getting an unfavorable result. The 33/33/33 distrubtion might turn into 20/60/20.
- For multiplayer threads with a contested outcome, we must track how two (or more) sides are performing relative to each other. The final outcome must then favor one side or be some sort of a draw.

Example
- Possible milestones that come out of the thread: "[player] convinces [NPC] to help them find the artifact." (favorable), "[player] convinces [NPC] to help them find the artifact in exchange for 500 gold" (mixed), "[NPC] refuses to help [player] find the artifact" (unfavorable).
- Beat 1: How does [player] introduce themselves?
Intermediate outcome: a first impression (favorable / mixed / unfavorable)
Beat generation logic will later decide what the options, probability distributions, and possible first impressions are based on the overall story context.
- Beat 2: How does [player] try to find an opening with [NPC]?
Intermediate outcome type: opening with [NPC] (favorable / mixed / unfavorable)
Beat generation logic will later decide what options, probability distributions, and actual openings are (based on the result of beat 1 and the overall story context).
- Beat 3: How does [player] convince [NPC] to help them find the artifact?
Possible outcomes are the same as for the thread overall.
Actual options and probability distributions are again generated with the beat generation logic later.

--

1. Intermediate outcomes must be stored in the story state. (We need the information for generating the next beat.)
For multiplayer threads, let's get to one overall intermediate result for each beat as well. The question is, how do we do that? Maybe generate individual results and then calculate a group average? (Favorable + Unfavorable = Mixed; Favorable + MIxed = 50/50 chance to get either.)

2. For extreme cases, we just go with 100/0/0 or 0/0/100 probability distributions. With 50/50/0 being the best starting position and a maximum of 50 points available as bonuses, the system has a natural max of 100/0/0 anyway, though.
For contested multiplayer threads, let's compare outcomes on a favorable/mixed/unfavorable level, and not the granular stuff below that.

3. Yes, beats (and especially initial beats in threads) should be able to have a flexible bonus/malus of up to 50 points. The beat generation logic will assign this depending on the story state and what the thread and initial beat are about.
Some threads might benefit from more granular outcomes than favorable/mixed/unfavorable, but that wouldn't work with the simple overall system. So let's not do that for now.
That said, not all threads will have outcomes that are clearly favorable-unfavorable. There might be threads that are purely exploratory, with all options equally desirable. In that case, the system should just use the beat progression without all the favorable/unfavorable mechanics.

4. None of the additional design suggestions for now. The last part, character traits and story conditions modifying base distributions and bonuses/maluses for options, is already part of the plan.