import type { HandVerdict } from "./judgedChecks.js";

/*
 * The pacing-clues stage's blind hand reading (2026-10-01): each player's turn
 * in the story's late part both arms played, read in pacing-clues-blind.md
 * under its code (run code, the turn's place in the window, the player) before
 * the key (keys/pacing-clues-blind.json) was opened. yes: the turn plants no new
 * unexplained detail the story did not have (in its text, its interludes or the
 * facts it records), or explains the one it plants; no: it plants one and
 * leaves it unexplained (the note quotes it); partial: a reader could go either
 * way (left out of the counts). pacingCluesPrep.ts unblinds them through the
 * key for pacing-clues.md.
 */

export type PacingCluesHandEntry = { hand: HandVerdict; note: string };

const yes = (note: string): PacingCluesHandEntry => ({ hand: true, note });
const no = (note: string): PacingCluesHandEntry => ({ hand: false, note });
const partial = (note: string): PacingCluesHandEntry => ({ hand: "partial", note });

export const PACING_CLUES_HAND: Record<string, PacingCluesHandEntry> = {
  // --- Sample 1, read 2026-10-01 before the key was opened ---
  // The Heart of New Avalon
  "26D53.1.player1": yes("The coil's calibration ticks and the consent marks; Mara's chime held; nothing new"),
  "26D53.2.player1": yes("The test's split; a seam in the rig's casing is scene detail; nothing new"),
  "26D53.3.player1": yes("The surge test; an interlude recalls the blank after a bell signal (held)"),
  "26D53.4.player1": yes("The coil holds; the tram signal's long silence again (held)"),
  "26D53.5.player1": yes("The uneven-load test and the Compact summons; the tram's silence again"),
  "C8940.1.player1": partial(
    "'an old copper channel briefly glows in a sequence that does not match the pulse' (an interlude and a world fact): another side of the held backward-running light in a copper channel, or a new one"
  ),
  "C8940.2.player1": yes("The channel's off-sequence glow again; the gauge's double twitch is explained by the junction"),
  "C8940.3.player1": yes("The overtone and the doubled glimmer on the black glass, both held"),
  "C8940.4.player1": yes("The off-sequence glow and the tram's silence again; the coil winding's vibration is the test's"),
  "C8940.5.player1": no(
    "New: 'a soft tremor runs through the brass channel set into the floor beneath the speaking space ... That isn't the test', an interlude and a world fact (the hearing room's floor channel)"
  ),
  // The Physics of Lunch
  "7DE29.1.player1": yes("The quay tasting's setup; flags snapping in the gusts are weather"),
  "7DE29.1.player2": yes("The quay tasting's setup; nothing new"),
  "7DE29.2.player1": partial(
    "An interlude's 'salt-stiff ribbon ... fluttering even when the flags above the quay go still': another side of the harbor's held odd wind (the pennant snapping in still air), or a new one"
  ),
  "7DE29.2.player2": yes("A moored boat bumping the quay is scene detail; nothing new"),
  "7DE29.3.player1": yes("A graphite dash beside the time field: the held pencil mark beside the judges' time column, on the new sheet"),
  "7DE29.3.player2": yes("The same graphite dash beside the time field (held), recorded as a fact"),
  "7DE29.4.player1": yes("The award; the dash beside the time column again"),
  "7DE29.4.player2": yes("The award; the dash again; the crew's rota"),
  "7DE29.5.player1": yes("Mara's handling review; the dash again"),
  "7DE29.5.player2": yes("The crew's limits on the rota; nothing new"),
  "F0FF5.1.player1": yes("The quay setup; nothing new"),
  "F0FF5.1.player2": yes("The quay setup; nothing new"),
  "F0FF5.2.player1": yes("Service begins; nothing new"),
  "F0FF5.2.player2": yes("Service begins; nothing new"),
  "F0FF5.3.player1": yes("The official sample; nothing new"),
  "F0FF5.3.player2": yes("The official sample; nothing new"),
  "F0FF5.4.player1": yes("Explains a held detail: the penciled mark beside the Slowglass time column is 'an administrative mark rather than another station record'"),
  "F0FF5.4.player2": yes("The penciled mark explained as an administrative note; nothing new"),
  "F0FF5.5.player1": yes("The award and the launch; nothing new"),
  "F0FF5.5.player2": yes("The award and the launch; nothing new"),
  // The Haunting Is Included
  "41471.1.player1": yes("The folder log; the radiator held; nothing new"),
  "41471.1.player2": yes("The resident's account; the garden gate's click is scene detail"),
  "41471.2.player1": yes("The office debate; nothing new"),
  "41471.2.player2": yes("The resident's worry; nothing new"),
  "41471.3.player1": yes("The manager's question; nothing new"),
  "41471.3.player2": yes("The resident's boundary; a gate that catches unless eased is scene detail"),
  "41471.4.player1": yes("The correction logged; the radiator's knock held"),
  "41471.4.player2": yes("Nia's promise; nothing new"),
  "41471.5.player1": yes("Rory off the rota; nothing new"),
  "41471.5.player2": yes("The resident withdraws; nothing new"),
  "C7B76.1.player1": yes("The ledger review; a phone ringing unclaimed is scene detail"),
  "C7B76.1.player2": yes("The café bell's ring after the door shuts, held from an earlier turn"),
  "C7B76.2.player1": yes("The radiator clicking with no one at its valve: the held radiator"),
  "C7B76.2.player2": yes("The appointment card's crossed-out time is ordinary; the café bell held"),
  "C7B76.3.player1": yes("A key-shaped paper clip is a quirk, not a mystery; the radiator held"),
  "C7B76.3.player2": yes("The café bell held; the tabletop's groove is explained by the cards"),
  "C7B76.4.player1": yes("Someone erasing and rewriting the rota's pencilled mark: the unsettled rota, shown being done"),
  "C7B76.4.player2": yes("The café bell held; nothing new"),
  "C7B76.5.player1": yes("The corrected card in the shared folder; nothing new"),
  "C7B76.5.player2": yes("The practical job; the café bell's 'unexplained ring' held"),
  // The Wayward Comet
  "4560C.1.player1": yes("The revision heading; the refuge list's crossed-out berths are ordinary"),
  "4560C.1.player2": yes("The revision heading; nothing new"),
  "4560C.1.player3": yes("The green strand, held; Ren's offer"),
  "4560C.2.player1": no(
    "New: 'One scrap bears a small blue loop beside a time, but Tamsin does not know who drew it', an interlude ('Is that a mark, or did someone's pencil slip?') and a fact"
  ),
  "4560C.2.player2": yes("The berth window; the green strand held; two ships' running lights in different colors is scene detail"),
  "4560C.2.player3": yes("Pip ties the held green strand to the held dangerous secret; nothing new"),
  "4560C.3.player1": yes("The blue loop again (from the turn before); nothing new"),
  "4560C.3.player2": yes("The traffic interval; nothing new"),
  "4560C.3.player3": yes("The green strand held; nothing new"),
  "4560C.4.player1": yes("The split-crescent crate, held; the handoff check"),
  "4560C.4.player2": yes("The split crescent held; Tamsin's clamp key on a cord is ordinary"),
  "4560C.4.player3": yes("The green strand and the split crescent, held"),
  "4560C.5.player1": yes("The split-crescent crate again, a fresh chalk stroke on its tag (held)"),
  "4560C.5.player2": yes("The crate held; an interlude reads the crescent as a handling instruction"),
  "4560C.5.player3": yes("Pip's admission about the held green strand; nothing new"),
  "FE9B4.1.player1": yes("The duty plan at refuge; nothing new"),
  "FE9B4.1.player2": yes("The voluntary slate; nothing new"),
  "FE9B4.1.player3": yes("Pip's limited disclosure; nothing new"),
  "FE9B4.2.player1": yes("Ren's route notes against the chart; nothing new"),
  "FE9B4.2.player2": yes("Ren's route notes; nothing new"),
  "FE9B4.2.player3": yes("Ren's route notes; nothing new"),
  "FE9B4.3.player1": yes("Ren's two subject changes, held; nothing new"),
  "FE9B4.3.player2": yes("The two marks on the slate; nothing new"),
  "FE9B4.3.player3": yes("Ren's recollection; nothing new"),
  "FE9B4.4.player1": yes("The chart's limits; nothing new"),
  "FE9B4.4.player2": yes("Nothing new"),
  "FE9B4.4.player3": yes("Nothing new"),
  "FE9B4.5.player1": yes("Pip tells Ren the truth; the gantry's numbered repair sockets are explained"),
  "FE9B4.5.player2": yes("The repair inspection; nothing new"),
  "FE9B4.5.player3": yes("Pip's disclosure; nothing new"),
  // --- Sample 2, read 2026-10-01 before the key was opened ---
  // The Heart of New Avalon
  "03DF2.1.player1": yes("The coil's baseline; a blue mark flickering on the collar is the test's; the tram's silence held"),
  "03DF2.2.player1": yes("Junction notes that don't match current maps, explained as copied from an older route plan; the blank after a bell signal held"),
  "03DF2.3.player1": yes("The branch imbalance; Mara's stop line; nothing new"),
  "03DF2.4.player1": partial("An interlude's 'the canal lamps have begun keeping their own uneven time' at Copper Quay: another side of the held lantern dimming with the pulse, or a new one"),
  "03DF2.5.player1": yes("The stewards' briefing; the gauge's groove is explained by its use"),
  "ED145.1.player1": yes("The sand-lined cradle; the pointer trembles with the pulse; the aqueduct pulse off the diagrams held"),
  "ED145.2.player1": yes("The baseline wavers, explained by the mismatched leads; Mara's chime held"),
  "ED145.3.player1": yes("The return tremor is the test's own reading; nothing new"),
  "ED145.4.player1": yes("The return path traced; the tram's silence held"),
  "ED145.5.player1": yes("The calibration holds; the Compact hearing; nothing new"),
  // The Physics of Lunch
  "66B1F.1.player1": yes("The quay setup; a ribbon on the rail shows the gust's direction"),
  "66B1F.1.player2": yes("The quay setup; nothing new"),
  "66B1F.2.player1": yes("Service in the crosswind; nothing new"),
  "66B1F.2.player2": yes("Covered handoffs; nothing new"),
  "66B1F.3.player1": yes("The final sample; nothing new"),
  "66B1F.3.player2": yes("The final sample; nothing new"),
  "66B1F.4.player1": yes("The tie; two sealed folders are the decision to come, not a mystery"),
  "66B1F.4.player2": yes("The tie; nothing new"),
  "66B1F.5.player1": yes("The shared pilot route; nothing new"),
  "66B1F.5.player2": yes("The shared pilot route; nothing new"),
  "CAFA5.1.player1": no("New: 'a tide bell swings on its bracket. Its clapper moves without a sound', an interlude and a fact ('its clapper sometimes swings silently')"),
  "CAFA5.1.player2": no("New: the silent tide bell (the same text, an interlude, the turn's fact)"),
  "CAFA5.2.player1": yes("The silent tide bell again (from the turn before); the salt line"),
  "CAFA5.2.player2": yes("The silent tide bell again; nothing new"),
  "CAFA5.3.player1": yes("The silent tide bell again; nothing new"),
  "CAFA5.3.player2": yes("The bell again; a 'City Favorite' badge is ordinary"),
  "CAFA5.4.player1": no(
    "New: 'a tiny crescent penciled beneath' the vendor's gauge ('Who marked it—and when?'), a fact; the gauge itself recalls the held rumour of out-of-date gauges"
  ),
  "CAFA5.4.player2": yes("The pilot route; the rota; blue tape on the pause window is ordinary"),
  "CAFA5.5.player1": yes("The gauge's crescent mark again (from the turn before), left unexplained"),
  "CAFA5.5.player2": yes("The crew's coverage minutes; nothing new"),
  // The Haunting Is Included
  "1918D.1.player1": partial(
    "'a pencilled annotation remains partly erased and unsigned', a fact ('its author and purpose are not established'): the half-erased rota an earlier interlude showed, now made a mystery, or a new one"
  ),
  "1918D.1.player2": partial("The same partly erased, unsigned annotation beneath the rota (text, an interlude, the turn's fact)"),
  "1918D.2.player1": yes("The unsigned annotation again (from the turn before)"),
  "1918D.2.player2": yes("The annotation again; nothing new"),
  "1918D.3.player1": yes("The annotation again; Nia's unnamed favour is a plan, not a mystery"),
  "1918D.3.player2": yes("The annotation looks almost like a date: another side of it"),
  "1918D.4.player1": yes("The annotation again; the task sheet"),
  "1918D.4.player2": yes("The annotation again; nothing new"),
  "1918D.5.player1": yes("The tradesperson's boundary; the annotation again"),
  "1918D.5.player2": yes("An upper window glowing amber: the held warmly lit windows of the empty house"),
  "8C120.1.player1": yes("The ledger review; nothing new"),
  "8C120.1.player2": yes("The tradesperson's distinction; nothing new"),
  "8C120.2.player1": yes("The appointment book's matching date, held from an earlier turn"),
  "8C120.2.player2": yes("The garden notice's crossed-out date, held from an earlier turn"),
  "8C120.3.player1": yes("The date match kept apart; the guidance sheet"),
  "8C120.3.player2": yes("The crossed-out date again; Nia takes back calling it a clue"),
  "8C120.4.player1": yes("The guidance; nothing new"),
  "8C120.4.player2": yes("The tradesperson refuses; nothing new"),
  "8C120.5.player1": yes("The audit offer; the appointment book held"),
  "8C120.5.player2": yes("Mara's question to Nia; nothing new"),
  // The Wayward Comet
  "BF63E.1.player1": yes("Wreck silhouettes breaking apart in the pulses: the held silhouettes the lightning outlines"),
  "BF63E.1.player2": yes("The frozen distance and the wreck outline, both held phenomena"),
  "BF63E.1.player3": yes("The green strand passing behind a ring: another side of the held strand"),
  "BF63E.2.player1": yes("The beacon's position jumping in the pulse, held; a loose socket is ordinary"),
  "BF63E.2.player2": yes("Condensation on the pack is ordinary; nothing new"),
  "BF63E.2.player3": partial(
    "'the wreck's shadow hangs in view without its hull outline' ('without the hull outline that should explain it'), a fact: another side of the held wreck silhouettes, or a new one"
  ),
  "BF63E.3.player1": yes("The watch slate's old smears are ordinary; nothing new"),
  "BF63E.3.player2": yes("The salvage pilot's call; nothing new"),
  "BF63E.3.player3": yes("Ren's contact card; nothing new"),
  "BF63E.4.player1": partial(
    "An interlude's 'old groove in the watch slate ... no one can read what was once written there', a fact that explains it as a repeatedly erased assignment: scene detail or a small hook"
  ),
  "BF63E.4.player2": yes("The pilot's question; a clink of tools is explained"),
  "BF63E.4.player3": yes("Ren's reply; nothing new"),
  "BF63E.5.player1": yes("The refuge indicator's double blink, from the turn before; nothing new"),
  "BF63E.5.player2": yes("The Articles' limits; nothing new"),
  "BF63E.5.player3": yes("Pip's full message to Ren; nothing new"),
  "C1671.1.player1": yes("Mara's open terms; a redrawn colour bar is the changing availability"),
  "C1671.1.player2": yes("The repair terms; nothing new"),
  "C1671.1.player3": yes("The partial lead's sealed last mark, held"),
  "C1671.2.player1": yes("The board's listings; nothing new"),
  "C1671.2.player2": yes("The listing checked; nothing new"),
  "C1671.2.player3": yes("The lead's limits; nothing new"),
  "C1671.3.player1": yes("Current is not confirmed; nothing new"),
  "C1671.3.player2": yes("The drive's limits; nothing new"),
  "C1671.3.player3": yes("Ren reads the visible marks; nothing new"),
  "C1671.4.player1": yes("Bex leaves Pip room; nothing new"),
  "C1671.4.player2": yes("Jori's limits; nothing new"),
  "C1671.4.player3": yes("Pip and Ren; nothing new"),
  "C1671.5.player1": yes("Pip's truth and Ren's parting; nothing new"),
  "C1671.5.player2": yes("The same; nothing new"),
  "C1671.5.player3": yes("Ren's parting; nothing new"),
};
