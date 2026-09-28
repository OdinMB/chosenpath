import { GameModes, Outcome, PlayerCount, StoryTemplate } from 'core/types';
import { validateTemplateIntegrity } from '../../../../src/resources/templates/utils/templateValidation';

function outcome(id: string): Outcome {
  return {
    id,
    question: `Question of ${id}?`,
    possibleResolutions: { favorable: 'Won.', mixed: 'Half won.', unfavorable: 'Lost.' },
    resonance: 'It matters.',
    intendedNumberOfMilestones: 2,
    milestones: [],
  };
}

function seat(outcomes: Outcome[]) {
  return { outcomes, possibleCharacterIdentities: [], possibleCharacterBackgrounds: [] };
}

/** A template holding only what the outcome checks read (and the lists the other checks walk). */
function template(
  sharedOutcomes: Outcome[],
  seats: [Outcome[], Outcome[], Outcome[]],
  playerCountMin: PlayerCount,
  playerCountMax: PlayerCount
): StoryTemplate {
  return {
    sharedOutcomes,
    player1: seat(seats[0]),
    player2: seat(seats[1]),
    player3: seat(seats[2]),
    playerCountMin,
    playerCountMax,
    playerStats: [],
    sharedStats: [],
    statGroups: [],
    storyElements: [],
  } as unknown as StoryTemplate;
}

const outcomeIssues = (t: StoryTemplate) =>
  validateTemplateIntegrity(t).issues.filter((issue) => issue.category === 'outcomes');

describe('Template outcome validation', () => {
  it('reports no issue for a template whose stories all have the outcomes they need', () => {
    const complete = template(
      [outcome('shared_ritual_stopped')],
      [[outcome('player1_trust')], [outcome('player2_debt')], [outcome('player3_name')]],
      1,
      3
    );

    expect(outcomeIssues(complete)).toEqual([]);
  });

  it('reports an error when no list holds an outcome', () => {
    const issues = outcomeIssues(template([], [[], [], []], 1, 1));

    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('error');
    expect(issues[0].message).toMatch(/^Stories from this World won't start: there are no outcomes/);
  });

  it('reports an error when every allowed story is multiplayer and there is no shared outcome', () => {
    const issues = outcomeIssues(template([], [[outcome('player1_trust')], [outcome('player2_debt')], []], 2, 3));

    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('error');
    expect(issues[0].message).toMatch(/^Stories from this World won't start: .*needs a shared outcome/);
  });

  it('warns that multiplayer stories will not start when single player still can', () => {
    const issues = outcomeIssues(template([], [[outcome('player1_trust')], [], []], 1, 3));

    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('warning');
    expect(issues[0].message).toMatch(/^Multiplayer stories from this World won't start: .*needs a shared outcome/);
  });

  it('reads only the seats a story can have', () => {
    const issues = outcomeIssues(template([], [[], [], [outcome('player3_name')]], 1, 2));

    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('error');
    expect(issues[0].message).toMatch(/^Stories from this World won't start: there are no outcomes/);
  });

  it('names the stories each problem stops, as errors when no story can start', () => {
    const heads = (t: StoryTemplate) => outcomeIssues(t).map((issue) => [issue.type, issue.message.split(':')[0]]);

    expect(heads(template([], [[], [outcome('player2_debt')], []], 1, 2))).toEqual([
      ['error', "Single-player stories from this World won't start"],
      ['error', "Multiplayer stories from this World won't start"],
    ]);
    expect(heads(template([], [[], [], [outcome('player3_name')]], 1, 3))).toEqual([
      ['error', "Stories for 1 or 2 players from this World won't start"],
      ['error', "Stories for 3 players from this World won't start"],
    ]);
  });

  describe('contested shared outcomes (side A against side B)', () => {
    const contested: Outcome = {
      ...outcome('shared_crown'),
      possibleResolutions: { sideAWins: 'A takes the crown.', mixed: 'They share it.', sideBWins: 'B takes the crown.' },
    };
    const seats: [Outcome[], Outcome[], Outcome[]] = [[outcome('player1_trust')], [outcome('player2_debt')], [outcome('player3_name')]];
    const world = (gameMode: GameModes, min: PlayerCount, max: PlayerCount) => ({ ...template([contested], seats, min, max), gameMode }) as StoryTemplate;

    it('warns that a cooperative World cannot play them, naming them', () => {
      const issues = outcomeIssues(world(GameModes.Cooperative, 2, 3));

      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe('warning');
      expect(issues[0].message).toMatch(/^Stories from this World can't play contested outcomes/);
      expect(issues[0].message).toContain('shared_crown');
      expect(issues[0].message).toContain('competitive and cooperative-competitive stories with two or more players');
      expect(issues[0].affectedItems).toEqual(['shared_crown']);
    });

    it("names only a competitive World's single-player stories", () => {
      const issues = outcomeIssues(world(GameModes.Competitive, 1, 3));

      expect(issues.map((issue) => issue.message.split(':')[0])).toEqual(["Single-player stories from this World can't play contested outcomes (side A against side B)"]);
    });

    it('finds nothing in a competitive or cooperative-competitive World for two or more players', () => {
      expect(outcomeIssues(world(GameModes.Competitive, 2, 3))).toEqual([]);
      expect(outcomeIssues(world(GameModes.CooperativeCompetitive, 2, 2))).toEqual([]);
    });
  });

  it('warns about an outcome id held in more than one list', () => {
    const issues = outcomeIssues(
      template(
        [outcome('shared_ritual_stopped'), outcome('the_crown')],
        [[outcome('the_crown'), outcome('player1_trust')], [outcome('player1_trust')], []],
        1,
        2
      )
    );

    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('warning');
    expect(issues[0].message).toContain('the_crown (shared, player1)');
    expect(issues[0].message).toContain('player1_trust (player1, player2)');
    expect(issues[0].message).toContain('milestones land on one copy only');
    expect(issues[0].affectedItems).toEqual(['the_crown', 'player1_trust']);
  });
});
