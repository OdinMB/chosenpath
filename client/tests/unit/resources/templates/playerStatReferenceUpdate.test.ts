// Test that player background stat references are updated when stat IDs change
import { Stat, PlayerOptionsGeneration } from 'core/types';

describe('Player Stat Reference Updates', () => {
  // Mock the generateIdFromName function
  const generateIdFromName = (name: string, existingIds: string[] = []): string => {
    let baseId = name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 30);

    if (!baseId) {
      baseId = 'unnamed';
    }

    let finalId = baseId;
    let counter = 1;
    while (existingIds.includes(finalId)) {
      finalId = `${baseId}_${counter}`;
      counter++;
    }

    return finalId;
  };

  // Simulate the stat ID change tracking and background reference updating logic
  const updatePlayerStatsAndBackgrounds = (
    playerStats: Stat[],
    existingIds: string[],
    playerOptions: Record<string, PlayerOptionsGeneration>
  ) => {
    const statIdChanges: Array<{ oldId: string; newId: string }> = [];
    
    // Process stats and track ID changes
    const processedStats = playerStats.map(stat => {
      if (!stat.name?.trim()) {
        return stat;
      }
      
      const otherIds = existingIds.filter(id => id !== stat.id);
      const newId = generateIdFromName(stat.name, otherIds);
      
      if (stat.id && stat.id !== newId) {
        statIdChanges.push({ oldId: stat.id, newId });
      }
      
      return { ...stat, id: newId };
    });

    // Update player background stat references
    const updatedPlayerOptions: Record<string, PlayerOptionsGeneration> = {};
    if (statIdChanges.length > 0) {
      Object.keys(playerOptions).forEach((slot) => {
        const playerOption = playerOptions[slot];
        if (playerOption?.possibleCharacterBackgrounds && playerOption.possibleCharacterBackgrounds.length > 0) {
          const updatedBackgrounds = playerOption.possibleCharacterBackgrounds.map((background) => {
            const updatedStatValues = background.initialPlayerStatValues.map((statValue) => {
              const change = statIdChanges.find(c => c.oldId === statValue.statId);
              return change ? { ...statValue, statId: change.newId } : statValue;
            });
            
            return {
              ...background,
              initialPlayerStatValues: updatedStatValues
            };
          });
          
          updatedPlayerOptions[slot] = {
            ...playerOption,
            possibleCharacterBackgrounds: updatedBackgrounds
          };
        }
      });
    }

    return {
      processedStats,
      statIdChanges,
      updatedPlayerOptions
    };
  };

  it('should update player background stat references when stat ID changes', () => {
    const playerStats: Stat[] = [
      {
        id: 'player_strength',
        name: 'Strength',
        type: 'number',
        tooltip: 'Physical power',
        group: 'Physical',
        partOfPlayerBackgrounds: true,
        possibleValues: '',
        effectOnPoints: ['test1', 'test2', 'test3'],
        optionsToSacrifice: 'None',
        optionsToGainAsReward: 'None',
        canBeChangedInBeatResolutions: true,
        narrativeImplications: ['test'],
        adjustmentsAfterThreads: ['test'],
        isVisible: true,
        initialValue: 50
      },
      {
        id: 'player_magic',
        name: 'Magic Power', // Name changed from 'Magic' - should generate new ID
        type: 'number',
        tooltip: 'Magical ability',
        group: 'Mental',
        partOfPlayerBackgrounds: true,
        possibleValues: '',
        effectOnPoints: ['test1', 'test2', 'test3'],
        optionsToSacrifice: 'None',
        optionsToGainAsReward: 'None',
        canBeChangedInBeatResolutions: true,
        narrativeImplications: ['test'],
        adjustmentsAfterThreads: ['test'],
        isVisible: true,
        initialValue: 20
      }
    ];

    const playerOptions: Record<string, PlayerOptionsGeneration> = {
      player1: {
        outcomes: [],
        possibleCharacterIdentities: [],
        possibleCharacterBackgrounds: [
          {
            title: 'Warrior',
            fluffTemplate: 'Strong fighter',
            initialPlayerStatValues: [
              { statId: 'player_strength', value: 80 },
              { statId: 'player_magic', value: 20 } // This should be updated to new ID
            ]
          },
          {
            title: 'Mage',
            fluffTemplate: 'Magic user',
            initialPlayerStatValues: [
              { statId: 'player_strength', value: 30 },
              { statId: 'player_magic', value: 90 } // This should be updated to new ID
            ]
          }
        ]
      }
    };

    const result = updatePlayerStatsAndBackgrounds(
      playerStats,
      [], // No existing IDs to avoid conflicts
      playerOptions
    );

    // Should detect two ID changes (both stats get new IDs from names)
    expect(result.statIdChanges).toHaveLength(2);
    
    const strengthChange = result.statIdChanges.find(c => c.oldId === 'player_strength');
    const magicChange = result.statIdChanges.find(c => c.oldId === 'player_magic');
    
    expect(strengthChange).toEqual({
      oldId: 'player_strength',
      newId: 'strength'
    });
    
    expect(magicChange).toEqual({
      oldId: 'player_magic',
      newId: 'magic_power'
    });

    // Should update the stat in processed stats
    const magicStat = result.processedStats.find(s => s.name === 'Magic Power');
    expect(magicStat?.id).toBe('magic_power');

    // Should update player background references
    expect(result.updatedPlayerOptions.player1).toBeDefined();
    const updatedBackgrounds = result.updatedPlayerOptions.player1!.possibleCharacterBackgrounds;
    
    // Warrior background should have updated stat references
    const warrior = updatedBackgrounds?.find(bg => bg.title === 'Warrior');
    expect(warrior?.initialPlayerStatValues).toEqual([
      { statId: 'strength', value: 80 }, // Updated from 'player_strength'
      { statId: 'magic_power', value: 20 } // Updated from 'player_magic'
    ]);

    // Mage background should have updated stat references
    const mage = updatedBackgrounds?.find(bg => bg.title === 'Mage');
    expect(mage?.initialPlayerStatValues).toEqual([
      { statId: 'strength', value: 30 }, // Updated from 'player_strength'
      { statId: 'magic_power', value: 90 } // Updated from 'player_magic'
    ]);
  });

  it('should handle multiple stat ID changes', () => {
    const playerStats: Stat[] = [
      {
        id: 'player_str',
        name: 'Physical Strength', // Changed from shorter name
        type: 'number',
        tooltip: 'Physical power',
        group: 'Physical',
        partOfPlayerBackgrounds: true,
        possibleValues: '',
        effectOnPoints: ['test1', 'test2', 'test3'],
        optionsToSacrifice: 'None',
        optionsToGainAsReward: 'None',
        canBeChangedInBeatResolutions: true,
        narrativeImplications: ['test'],
        adjustmentsAfterThreads: ['test'],
        isVisible: true,
        initialValue: 50
      },
      {
        id: 'player_int',
        name: 'Intelligence Level', // Changed from shorter name
        type: 'number',
        tooltip: 'Mental ability',
        group: 'Mental',
        partOfPlayerBackgrounds: true,
        possibleValues: '',
        effectOnPoints: ['test1', 'test2', 'test3'],
        optionsToSacrifice: 'None',
        optionsToGainAsReward: 'None',
        canBeChangedInBeatResolutions: true,
        narrativeImplications: ['test'],
        adjustmentsAfterThreads: ['test'],
        isVisible: true,
        initialValue: 50
      }
    ];

    const playerOptions: Record<string, PlayerOptionsGeneration> = {
      player1: {
        outcomes: [],
        possibleCharacterIdentities: [],
        possibleCharacterBackgrounds: [
          {
            title: 'Balanced',
            fluffTemplate: 'Well-rounded character',
            initialPlayerStatValues: [
              { statId: 'player_str', value: 50 },
              { statId: 'player_int', value: 50 }
            ]
          }
        ]
      }
    };

    const result = updatePlayerStatsAndBackgrounds(
      playerStats,
      [],
      playerOptions
    );

    // Should detect two ID changes
    expect(result.statIdChanges).toHaveLength(2);
    expect(result.statIdChanges).toContainEqual({
      oldId: 'player_str',
      newId: 'physical_strength'
    });
    expect(result.statIdChanges).toContainEqual({
      oldId: 'player_int',
      newId: 'intelligence_level'
    });

    // Should update all references in player backgrounds
    const updatedBackground = result.updatedPlayerOptions.player1!.possibleCharacterBackgrounds?.[0];
    expect(updatedBackground?.initialPlayerStatValues).toEqual([
      { statId: 'physical_strength', value: 50 },
      { statId: 'intelligence_level', value: 50 }
    ]);
  });

  it('should not update when no stat IDs change', () => {
    const playerStats: Stat[] = [
      {
        id: 'strength', // ID already matches what would be generated from name
        name: 'Strength',
        type: 'number',
        tooltip: 'Physical power',
        group: 'Physical',
        partOfPlayerBackgrounds: true,
        possibleValues: '',
        effectOnPoints: ['test1', 'test2', 'test3'],
        optionsToSacrifice: 'None',
        optionsToGainAsReward: 'None',
        canBeChangedInBeatResolutions: true,
        narrativeImplications: ['test'],
        adjustmentsAfterThreads: ['test'],
        isVisible: true,
        initialValue: 50
      }
    ];

    const playerOptions: Record<string, PlayerOptionsGeneration> = {
      player1: {
        outcomes: [],
        possibleCharacterIdentities: [],
        possibleCharacterBackgrounds: [
          {
            title: 'Warrior',
            fluffTemplate: 'Strong fighter',
            initialPlayerStatValues: [
              { statId: 'strength', value: 80 }
            ]
          }
        ]
      }
    };

    const result = updatePlayerStatsAndBackgrounds(
      playerStats,
      [],
      playerOptions
    );

    // Should detect no ID changes
    expect(result.statIdChanges).toHaveLength(0);

    // Should not create updated player options
    expect(Object.keys(result.updatedPlayerOptions)).toHaveLength(0);
  });

  it('should handle players without character backgrounds', () => {
    const playerStats: Stat[] = [
      {
        id: 'player_magic',
        name: 'Magic Power',
        type: 'number',
        tooltip: 'Magical ability',
        group: 'Mental',
        partOfPlayerBackgrounds: true,
        possibleValues: '',
        effectOnPoints: ['test1', 'test2', 'test3'],
        optionsToSacrifice: 'None',
        optionsToGainAsReward: 'None',
        canBeChangedInBeatResolutions: true,
        narrativeImplications: ['test'],
        adjustmentsAfterThreads: ['test'],
        isVisible: true,
        initialValue: 20
      }
    ];

    const playerOptions: Record<string, PlayerOptionsGeneration> = {
      player1: {
        outcomes: [],
        possibleCharacterIdentities: [],
        possibleCharacterBackgrounds: [] // No backgrounds
      },
      player2: {
        outcomes: [],
        possibleCharacterIdentities: [],
        possibleCharacterBackgrounds: []
        // No possibleCharacterBackgrounds property - empty array instead
      }
    };

    const result = updatePlayerStatsAndBackgrounds(
      playerStats,
      [],
      playerOptions
    );

    // Should detect the ID change
    expect(result.statIdChanges).toHaveLength(1);

    // Should not crash and should not create player option updates
    expect(Object.keys(result.updatedPlayerOptions)).toHaveLength(0);
  });
});