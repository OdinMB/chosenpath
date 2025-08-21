import { generateIdFromName, updateIdFromName } from '../../../src/shared/utils/idGeneration';

describe('generateIdFromName', () => {
  it('should generate simple IDs from names', () => {
    expect(generateIdFromName('Mr. X')).toBe('mr_x');
    expect(generateIdFromName('Tour Bus')).toBe('tour_bus');
    expect(generateIdFromName('Village Energy')).toBe('village_energy');
  });

  it('should handle special characters', () => {
    expect(generateIdFromName('Mrs. Smith-Jones!')).toBe('mrs_smithjones');
    expect(generateIdFromName('Café & Restaurant')).toBe('caf_restaurant');
    expect(generateIdFromName('Player 1\'s Sword')).toBe('player_1s_sword');
  });

  it('should handle empty or invalid names', () => {
    expect(generateIdFromName('')).toBe('unnamed');
    expect(generateIdFromName('   ')).toBe('unnamed');
    expect(generateIdFromName('!!!')).toBe('unnamed');
  });

  it('should respect length limits', () => {
    const longName = 'This is a very long name that exceeds thirty characters';
    const result = generateIdFromName(longName);
    expect(result.length).toBeLessThanOrEqual(30);
    expect(result).toBe('this_is_a_very_long_name_that_');
  });

  it('should ensure uniqueness with existing IDs', () => {
    const existingIds = ['mr_x', 'mr_x_1', 'village_energy'];
    
    expect(generateIdFromName('Mr. X', existingIds)).toBe('mr_x_2');
    expect(generateIdFromName('Village Energy', existingIds)).toBe('village_energy_1');
    expect(generateIdFromName('New Name', existingIds)).toBe('new_name');
  });

  it('should handle multiple conflicts', () => {
    const existingIds = ['test', 'test_1', 'test_2', 'test_3'];
    expect(generateIdFromName('Test', existingIds)).toBe('test_4');
  });

  it('should remove leading and trailing underscores', () => {
    expect(generateIdFromName('_Leading Underscore')).toBe('leading_underscore');
    expect(generateIdFromName('Trailing Underscore_')).toBe('trailing_underscore');
    expect(generateIdFromName('___Multiple___')).toBe('multiple');
  });
});

describe('updateIdFromName', () => {
  it('should return new ID when name changes', () => {
    const existingIds = ['other_id', 'another_id'];
    expect(updateIdFromName('old_id', 'New Name', existingIds)).toBe('new_name');
  });

  it('should return new ID even when name would generate same as old ID', () => {
    const existingIds = ['other_id'];
    expect(updateIdFromName('old_name', 'Old Name', existingIds)).toBe('old_name');
  });

  it('should ensure uniqueness excluding the old ID', () => {
    const existingIds = ['old_id', 'new_name', 'other_id'];
    expect(updateIdFromName('old_id', 'New Name', existingIds)).toBe('new_name_1');
  });

  it('should handle edge cases', () => {
    expect(updateIdFromName('old_id', '', [])).toBe('unnamed');
    expect(updateIdFromName('old_id', '!!!', [])).toBe('unnamed');
  });
});