import { describe, expect, it } from "@jest/globals";
import type { Stat } from "core/types/index.js";
import { leverDirection, type Lever } from "../../../../src/game/services/leverPayments.js";
import { stat } from "../../../helpers/textFixtures.js";

/*
 * Which way a lever moves its stat (1 up, -1 down). Since the lever-direction
 * adoption (2026-10-01) a sacrifice on a stat where more is worse is a rise, so
 * the game reads the direction from words: the chosen option's, else the
 * stat's lever rule's, else a sacrifice down and a reward up. Only words that
 * speak of the stat count. An option describes an action, so "more delegates",
 * "gain their attention" or "a +30 bonus" say nothing about the stat; read as
 * if they did, an ordinary stat's correct payment went unrecorded (Beat.paidLever)
 * and the eval read it as paid the other way. The texts are the stored eval
 * outputs' and setups' own (DOCS/2026-09-26_gpt6-text-eval).
 */

const AGENCY = stat("player_personal_agency", { name: "Personal Agency", optionsToSacrifice: "Can spend 10% agency for a one-time major advantage in a beat." });
const CREDITS = stat("shared_resource_credits", { type: "number", name: "Resource Credits", optionsToSacrifice: "Can spend 20 credits for a one-time bonus in a beat." });
const MEDIA = stat("player_media_savvy", { name: "Media Savvy", optionsToGainAsReward: "Can regain 10% by focusing on learning or mentorship instead of immediate gains." });
const STABILITY = stat("shared_timeline_stability", { name: "Timeline Stability", optionsToSacrifice: "Can sacrifice 10% stability for a +30 bonus in a critical challenge." });
const HARMONY = stat("shared_kingdom_harmony", { name: "Kingdom Harmony", optionsToSacrifice: "Can sacrifice 10% harmony to gain a temporary magical boost in a critical challenge." });
const EUROS = stat("shared_euros_available", { type: "number", name: "Euros Available", optionsToGainAsReward: "Can accept a 25-euro paid errand during a beat instead of focusing fully on the immediate objective." });
const STRESS = stat("player_stress_level", {
  name: "Stress Level",
  optionsToSacrifice: "Can choose to increase Stress by 20% to do something particularly strenuous, difficult, or otherwise stressful.",
  optionsToGainAsReward: "Can reduce Stress by 20% by taking time to relax or confide in a friend instead of advancing the main plot.",
});
const HUNGER = stat("player_hunger", { name: "Hunger", optionsToSacrifice: "Can let Hunger rise by to gain a momentary bonus in a physical challenge." });
const PRESSURE = stat("shared_family_pressure", { name: "Family Pressure", optionsToSacrifice: "Can accept a temporary spike (+20%) in Family Pressure for a major romantic or career move." });
const SUSPICION = stat("player_suspicion", { name: "Suspicion", optionsToSacrifice: "Let Suspicion rise 10% to slip past the guards in plain sight." });
const PANIC = stat("shared_rising_panic", { name: "Rising Panic", optionsToGainAsReward: "Lower the Rising Panic 10% by calming the crowd." });

type Case = [label: string, on: Stat, kind: Lever, option: string, direction: 1 | -1];

describe("leverDirection", () => {
  it.each<Case>([
    ["an option's words about the action, not the stat ('greatly increasing disruption')", AGENCY, "sacrifice", "Expend an additional 10% of your Personal Agency to intensify the blackout, risking exhaustion but greatly increasing disruption.", -1],
    ["an option's 'could gain their attention'", AGENCY, "sacrifice", "Sacrifice some of your personal agency to make a bold, direct appeal that risks alienating cautious council members but could gain their attention.", -1],
    ["an option's 'so more delegates can stay'", CREDITS, "sacrifice", "Put 20 resource credits toward transit and childcare stipends so more delegates can stay for the meeting.", -1],
    ["a reward option's 'a lower chance of success'", MEDIA, "reward", "Accept a lower chance of success to focus on building media savvy by engaging with the audience in a genuine, unpolished way.", 1],
    ["a rule's '+30 bonus', the game's bonus and not the stat's", STABILITY, "sacrifice", "Sacrifice 10% timeline stability to execute a powerful temporal maneuver that could unsettle your rival.", -1],
    ["a rule's purpose, 'to gain a temporary magical boost'", HARMONY, "sacrifice", "Draw on the kingdom's harmony to shield the bridge.", -1],
    ["a reward rule's 'a 25-euro paid errand'", EUROS, "reward", "Run an errand across town for the café owner.", 1],
  ])("keeps an ordinary stat's lever its kind's way where only other words say otherwise: %s", (_label, on, kind, option, direction) => {
    expect(leverDirection(on, kind, option)).toBe(direction);
  });

  it.each<Case>([
    ["'increasing your Stress Level by 20%', whatever 'a more profound connection' says", STRESS, "sacrifice", "Push your magical senses beyond their limits, increasing your Stress Level by 20%, to attempt a more profound connection with the runes.", 1],
    ["'reduce your Stress Level by 20%'", STRESS, "reward", "Take a moment to relax and reduce your Stress Level by 20%, allowing for a clearer but less intense analysis of the runes.", -1],
    ["'Let your Hunger rise by 10%'", HUNGER, "sacrifice", "Let your Hunger rise by 10% and activate Auspex to read Mara's emotions when Liam brings you together.", 1],
    ["'Suspicion to rise 10%'", SUSPICION, "sacrifice", "Allow the guards' Suspicion to rise 10% as you push through the gate.", 1],
    ["a signed amount beside the stat, '(+10% Suspicion)'", SUSPICION, "sacrifice", "Slip past the guards in plain sight (+10% Suspicion).", 1],
    ["a direction word in the stat's own name left out ('Lower the Rising Panic')", PANIC, "reward", "Lower the Rising Panic 10% by calming the crowd.", -1],
  ])("reads the option's words about the stat: %s", (_label, on, kind, option, direction) => {
    expect(leverDirection(on, kind, option)).toBe(direction);
  });

  it.each<Case>([
    ["'increase Stress by 20%', where the option's 'gain clearer insights' is about something else", STRESS, "sacrifice", "Concentrate deeply, sacrificing 20% of your Stress Level to amplify your Spirit Communication and gain clearer insights into the runes.", 1],
    ["'a temporary spike (+20%) in Family Pressure'", PRESSURE, "sacrifice", "Tell your parents about the move tonight.", 1],
    ["'Let Suspicion rise 10%'", SUSPICION, "sacrifice", "Walk through the gate under the guards' Suspicion.", 1],
  ])("reads the stat's lever rule where the option's words say nothing about the stat: %s", (_label, on, kind, option, direction) => {
    expect(leverDirection(on, kind, option)).toBe(direction);
  });

  it("reads the option before the rule: a rule written backwards before the adoption doesn't turn a rise the option says", () => {
    const backwards = { ...SUSPICION, optionsToSacrifice: "Reduce Suspicion by 10% to calm the guards." };
    expect(leverDirection(backwards, "sacrifice", "Let the guards' Suspicion rise 10% and walk through the gate in plain sight.")).toBe(1);
  });

  it("keeps a sacrifice down and a reward up where neither says anything about the stat", () => {
    const resolve = stat("player_resolve", { name: "Resolve", optionsToSacrifice: "Steel yourself with 10% Resolve.", optionsToGainAsReward: "Take heart for 10% Resolve." });
    expect(leverDirection(resolve, "sacrifice", "Steel your Resolve and step into the ring.")).toBe(-1);
    expect(leverDirection(resolve, "reward", "Take a breath for your Resolve.")).toBe(1);
  });
});
