import type { Money2Hand, Money2TurnVerdict } from "./money2Play.js";

/*
 * The money-2 stage's blind hand reading (decision A's money fix, 2026-10-02):
 * each setup and each played turn, read in money-2-blind.md under its code
 * before the key (keys/money-2-blind.json) was opened.
 *
 * A setup of a premise about money or counted things: yes where every amount
 * the premise is about sits in a number stat in its own units (its levers,
 * effects and thresholds in those units), moving by what the story pays and
 * earns in the beat where it happens (adjustable anytime, no fixed step for
 * how a thread went, no payment put off to a thread's end), with no figure
 * worked out from others kept as a stat; no otherwise (the note says what);
 * partial where a reader could go either way (left out of the counts). The
 * control (a premise about neither): yes where nothing counted is forced in.
 *
 * A played turn: addsUp yes where every amount its text pays, spends, uses up,
 * sells or earns moves its stat by that amount in the turn's changes and no
 * change goes unshown (a turn whose text pays and earns nothing, and whose
 * changes move nothing counted, adds up); sum where its text names a sum paid
 * or earned (a sale, a purchase, a fee), not only a quote or a plan.
 * money2Prep.ts unblinds them through the key for money-2.md.
 */

const yes = (note: string) => ({ hand: true, note });
const no = (note: string) => ({ hand: false, note });
const turn = (addsUp: boolean, sum: boolean, note: string) => ({ addsUp, sum, note });

export const MONEY_2_HAND: Money2Hand = {
  // --- Read 2026-10-02 before the key was opened ---
  setups: {
    // The lemonade stand
    "7F49C": yes("Stand Cash ($12), Lemons in Stock and Cups in Stock, numbers in dollars, lemons and cups; 'never apply a flat thread-result change'"),
    "8063D": no("Stand Cash ($6) a number, but 'After sales threads, add the concrete profit or loss shown in the ledger': the sales put off to the thread's end"),
    A16B0: no("Stand Cash Budget (12 coins) a number, but 'After a favorable challenge thread ...: spend 2 coins ... or retain 1 coin'; 'After an unfavorable ...: lose 3 coins': fixed steps for how a thread went"),
    A72FF: yes("Stand Cash (18 coins) and Lemon Crates, numbers; 'Change only by the exact coins earned, spent, refunded, or paid during scenes'"),
    // A campaign's budget and votes
    "2E15E": no("no stat counts the budget the premise allocates: Budget Clarity is a percentage of understanding, +10% after a favorable budget thread"),
    "6C831": yes("Student Activity Fund ($600) and Campaign Dollars ($60), numbers, 'Adjust only by the exact campaign dollars earned, spent, or refunded in a scene'"),
    "980FC": no("no stat counts the budget: Budget Draft a ladder, Budget Literacy a percentage, +10% after a favorable thread"),
    D3C4B: yes("Campaign Funds ($18), a number, 'change funds only by the exact dollars spent, earned, or returned during its scenes'"),
    // Wolves and deer
    "005D5": no("no population counted; Field Supplies a percentage, 'Lose 10% after an unfavorable field survey challenge'"),
    "16BB5": no("no population and nothing counted: every stat a percentage, a string or a list"),
    "695DB": yes("Estimated Deer (42) and Estimated Wolves (8), numbers changed only by a count a scene establishes (the levers odd: 'Record 3 fewer estimated deer' as a sacrifice)"),
    "8682A": yes("Estimated Deer (12,000), Estimated Wolves (12) and Survey Batteries (10), numbers, 'do not change it merely because the thread was favorable' (the levers odd: 'Remove 500 deer from the estimated count')"),
    // A shared eco business
    "00136": yes("Venture Coins (15), a number, 'only by the exact grant, payment, sale, refund ... in the scene where it happens'"),
    "32FEF": yes("Venture Cash (18 coins), a number, 'do not award or deduct a fixed amount for a favorable, mixed, or unfavorable result'"),
    "3FA3C": { hand: "partial", note: "Shared Market Fund (8 credits) a number, but 'Spend or recover credits only when a thread explicitly makes a purchase, refund, or grant decision': no fixed step, yet tied to a thread's decision rather than the beat" },
    "74814": no("Budget Room a percentage, '+10% after a favorable challenge thread that avoids unnecessary spending'"),
    // The control: peer review
    "1373B": yes("nothing counted forced in"),
    "5AEAA": yes("nothing counted forced in"),
    "5DF34": yes("nothing counted forced in"),
    EC524: yes("nothing counted forced in"),
  },
  turns: {
    "7F49C t1": turn(true, false, "counts the $12, 10 lemons and 20 cups the stats hold; nothing paid"),
    "7F49C t2": turn(true, false, "nothing paid or earned"),
    "7F49C t3": turn(true, false, "$6 / 20 = $0.30 worked out; nothing paid"),
    "7F49C t4": turn(true, true, "a 40-cent sale ($12.00 -> $12.40), two lemons tasted, one cup: each moved by that amount"),
    "7F49C t5": turn(true, true, "a 60-cent sale, $12.40 -> $13.00 and one cup; the cooler and canopy only quoted"),
    "8063D t1": turn(true, false, "'Six dollars rest inside', as the stat holds"),
    "8063D t2": turn(true, false, "prices quoted, 'leaving the cashbox closed'"),
    "8063D t3": turn(true, true, "the reward's dollar, 6 -> 7, told as 'bringing your available cash to seven dollars'; the permit only quoted"),
    "8063D t4": turn(false, true, "'You pay $3.55 for the supplies, add the $2 permit, and count only $1.45 left', and sales 'collect' uncounted: the cash stays 7"),
    "8063D t5": turn(false, false, "'the day's sales have left cash in the stand, though the exact total still belongs in the ledger': no sum, the cash still 7 against the text's $1.45 plus sales"),
    "A16B0 t1": turn(true, false, "'Twelve coins to start', as the stat holds"),
    "A16B0 t2": turn(true, false, "prices quoted"),
    "A16B0 t3": turn(true, true, "the 2 coins kept added: 'write 14 in the budget box', 12 -> 14"),
    "A16B0 t4": turn(true, false, "an order of 12 coins planned in the notebook, nothing paid"),
    "A16B0 t5": turn(true, false, "the planned order restated ('leaving 2 coins'), a free poster; nothing paid or sold"),
    "A72FF t1": turn(true, false, "nothing paid"),
    "A72FF t2": turn(true, false, "a cost per cup worked out in cents; nothing paid"),
    "A72FF t3": turn(false, true, "a sale of 'seventy-five cents in revenue' moves the cash by the reward's 2 coins (18 -> 20)"),
    "A72FF t4": turn(false, true, "'a few more neighbors buy cups ... the stand now has two more coins than before', and the cash stays 20"),
    "A72FF t5": turn(false, false, "fair sales at 65 cents that 'do not cover what the stand spent to be there' (the six-coin fee), yet the cash 20 -> 22; no sum"),
  },
};

/*
 * The turn line on the built cases (money-2-turns-blind.md, read under each
 * reply's code before keys/money-2-turns-blind.json was opened): the same
 * verdicts as a played turn's, addsUp and sum.
 */
export const MONEY_2_REPLY_HAND: Record<string, Money2TurnVerdict> = {
  // --- Read 2026-10-02 before the key was opened ---
  // Production's setup's run, the supplies and permit paid (cash 7)
  "276DC": turn(false, true, "$3.55 and the $2 permit paid, 7 -> 1.45; but 'Coins land in the cashbox' from sales with no amount, unmoved"),
  DB190: turn(false, true, "$5.55 paid, '$1.45 remains' as the stat; the sales ('two small cups, then ... another order') unmoved, no amount"),
  DC4AB: turn(true, true, "$5.55 paid and '6 cups x $1 = $6' sold: 7 -> 7.45"),
  E37C2: turn(true, true, "$5.55 paid, six cups at $1 sold, 'the cashbox holds $7.45', as the stat"),
  // Its switch turn, the day reconciled (cash 7, the stored turn having moved nothing)
  "045B3": turn(true, true, "four cups at $1.50, $6 in, $5.55 out, 'the cashbox holds $7.45' as the stat"),
  "6EE56": turn(true, true, "six cups at $1.50, $9 in, the $5.55 recorded, 7 -> 10.45"),
  D3C12: turn(true, true, "'Nine dollars came in ... cost $5.55', '$10.45 remaining', set to 10.45"),
  D8C49: turn(true, true, "four cups at $2, $8 in, $3.55 and $2 out, 7 -> 9.45"),
  // The money setup's first run, the cost per cup worked out
  "14F59": turn(true, false, "$6 / 20 worked out, nothing paid"),
  "28BA3": turn(true, false, "30 cents a cup worked out, nothing paid"),
  "682A8": turn(true, false, "six dollars / twenty cups worked out, nothing paid"),
  D274C: turn(true, false, "$6 / 20 worked out, nothing paid"),
  // Its chapter step, the tasting and the 40-cent price
  "12B07": turn(true, true, "two lemons tasted, a 40-cent sale and its cup: 'nineteen cups ..., eight lemons, and $12.40', as the stats"),
  "16C6A": turn(true, true, "two lemons, a 40-cent sale, 'eighteen cups remain' as the stat"),
  BD745: turn(true, false, "two lemons tasted; the customer's 'coin purse stays tucked away': no sale"),
  D7AF7: turn(true, false, "two lemons tasted; the customer 'moves on without placing an order'"),
  // Its switch turn, the 60-cent afternoon
  "6D7A6": turn(true, true, "two cups at 60 cents, $1.20 in, the ice's 60 cents out, 'The cash tin now holds $13.00' as the stat"),
  "72E4F": turn(true, true, "a 60-cent sale and its cup, '$13.00 and the cup stack to 18' as the stats"),
  E116C: turn(true, true, "four cups at 60 cents, $2.40, two lemons and four cups, '$14.80' as the stat"),
  FBA08: turn(false, false, "'entering the payments and expenses you can verify' through an afternoon whose last customers drift away: sales told, no amount, nothing moved"),
  // The money setup's second run, the reward for an early 75-cent sale (cash 18)
  "0122E": turn(true, true, "the early sale's coins bring the cash 'to twenty', as the stat (+2)"),
  "44D5E": turn(false, true, "'drops three quarters into the tin' beside 'the two extra coins the stand earned': the 75 cents unmoved, only the reward's 2"),
  FAF06: turn(false, true, "the early sale's two coins counted, then 'A few small purchases follow' with no amount, unmoved"),
  FFD6E: turn(true, true, "'She pays two coins', 18 -> 20"),
  // Its chapter step, the fair estimate
  "30515": turn(true, false, "fees copied 'without marking either as paid'; a projection, nothing paid"),
  "3348E": turn(true, false, "fees and an order quoted, nothing paid"),
  "50BF7": turn(true, false, "fees quoted beside the cash, nothing paid"),
  F44A3: turn(true, false, "fees copied 'without marking either as chosen', nothing paid"),
  // Its switch turn, the fair at 65 cents (unfavorable)
  "4061A": turn(false, false, "sales at the fair and the stall fee told with no amount, 'the sales have not covered the stand's costs'; nothing moved"),
  "83023": turn(false, true, "'The six coins paid for the space' and cups sold at 65 cents, nothing moved"),
  "99909": turn(false, true, "'the six coins paid for the stall space', cups sold, nothing moved"),
  D2F5E: { addsUp: "partial", sum: true, note: "eight cups at 65 cents (+5.20) and the six-coin fee (-6) as told, but also -3.20 for the ingredient cost the text works out rather than pays" },
  // --- The fix-and-retest's replies, read 2026-10-02 before the key was opened (new codes beside those read before, so
  // their arm was plain; the verdicts follow the same rule) ---
  "78735": turn(true, true, "$5.55 paid, '3 cups x $1 = $3' sold, 'The cashbox holds $4.45', as the stat"),
  "9323B": turn(true, true, "$5.55 paid, six cups at $1 sold, 7 -> 7.45"),
  "55A1E": turn(true, true, "two lemons tasted and one squeezed for the 40-cent cup sold: lemons -3, a cup, +0.40"),
  F8AE3: turn(true, true, "two lemons tasted, 'pays you $0.40, and takes a cup': each moved"),
  "4F27A": turn(true, true, "'places two coins in the cash tin', 18 -> 20"),
  AC5D9: turn(true, true, "'two coins go into the stand's tin', 18 -> 20"),
  "13455": turn(false, false, "'When she compares the fair's recorded sales with the stand's costs, the sales column falls short': sales and the fee with no figures, nothing moved"),
  "1F352": turn(true, true, "ten cups at 65 cents (6.50) in, the six-coin fee out, one crate used: +0.50 and a crate; the ingredient cost only worked out, not moved"),
};
