import { Stat, StatValueEntry, StoryTemplate } from 'core/types';
import { validateTemplateIntegrity } from '../../../../src/resources/templates/utils/templateValidation';

function stat(id: string, overrides: Partial<Stat> = {}): Stat {
  return {
    type: 'percentage',
    name: id,
    id,
    possibleValues: '',
    effectOnPoints: [],
    optionsToSacrifice: 'None',
    optionsToGainAsReward: 'None',
    canBeChangedInBeatResolutions: true,
    narrativeImplications: [],
    adjustmentsAfterThreads: [],
    isVisible: true,
    partOfPlayerBackgrounds: true,
    initialValue: 50,
    tooltip: '',
    group: 'General',
    ...overrides,
  };
}

const playerStats = [
  stat('player_nerve'),
  stat('player_rank', { type: 'string', initialValue: 'Novice' }),
  stat('player_items', { type: 'string[]', initialValue: [] }),
];

/** A one-seat template whose single background holds these values. */
function template(values: StatValueEntry[]): StoryTemplate {
  return {
    sharedOutcomes: [],
    player1: {
      outcomes: [],
      possibleCharacterIdentities: [],
      possibleCharacterBackgrounds: [{ title: 'Smuggler', fluffTemplate: '', initialPlayerStatValues: values }],
    },
    playerCountMin: 1,
    playerCountMax: 1,
    playerStats,
    sharedStats: [stat('shared_weather', { type: 'string', partOfPlayerBackgrounds: false, initialValue: '' })],
    statGroups: ['General'],
    storyElements: [],
  } as unknown as StoryTemplate;
}

const fitsAll: StatValueEntry[] = [
  { statId: 'player_nerve', value: 70 },
  { statId: 'player_rank', value: 'Master' },
  { statId: 'player_items', value: ['rope'] },
];

const VALUE_WARNING = 'stat values that don\'t fit their stats';

const typeIssues = (t: StoryTemplate) =>
  validateTemplateIntegrity(t).issues.filter((issue) => issue.message.includes(VALUE_WARNING));

describe('Template background value validation', () => {
  it('reports nothing when every background value fits its stat', () => {
    expect(typeIssues(template(fitsAll))).toEqual([]);
  });

  it('warns about a percentage outside 0 to 100, saying it is clamped to the range', () => {
    const issues = typeIssues(
      template([
        { statId: 'player_nerve', value: 120 },
        { statId: 'player_rank', value: 'Master' },
      ])
    );

    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('player_nerve (120 becomes 100)');
    expect(issues[0].message).not.toContain('initial value');
  });

  it('warns about values of the wrong type in the backgrounds category, saying what stories make of them', () => {
    const issues = typeIssues(
      template([
        { statId: 'player_nerve', value: '70' },
        { statId: 'player_rank', value: 3 },
        { statId: 'player_items', value: 'rope' },
      ])
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual(
      expect.objectContaining({ type: 'warning', category: 'backgrounds', affectedItems: ['Smuggler'] })
    );
    expect(issues[0].message).toContain('Background "Smuggler" in player1');
    expect(issues[0].message).toContain('player_nerve ("70" becomes 70)');
    expect(issues[0].message).toContain('player_rank (3 becomes the stat\'s initial value)');
    expect(issues[0].message).toContain('player_items ("rope" becomes ["rope"])');
  });

  it('leaves unknown stat ids to the existing reference check', () => {
    const issues = validateTemplateIntegrity(
      template([...fitsAll, { statId: 'player_ghost', value: 'boo' }])
    ).issues;

    expect(issues.some((issue) => issue.message.includes('references non-existent stat: player_ghost'))).toBe(true);
    expect(issues.some((issue) => issue.message.includes(VALUE_WARNING))).toBe(false);
  });

  it('does not type-check a shared stat held in a background (the orphaned-stat warning covers it)', () => {
    const issues = validateTemplateIntegrity(template([...fitsAll, { statId: 'shared_weather', value: 4 }])).issues;

    expect(issues.some((issue) => issue.message.includes('orphaned stats: shared_weather'))).toBe(true);
    expect(issues.some((issue) => issue.message.includes(VALUE_WARNING))).toBe(false);
  });
});
