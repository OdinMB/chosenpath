import {
  optimizeImagePositions,
  enforceLastParagraphConstraint,
  enforceSpacingConstraint,
  calculateMoveDistance,
  validateConstraints
} from '../../../src/game/utils/imageRepositioning.js';

describe('imageRepositioning', () => {
  describe('optimizeImagePositions', () => {
    test('should handle empty input', () => {
      expect(optimizeImagePositions([], 5)).toEqual([]);
    });

    test('should handle single image', () => {
      expect(optimizeImagePositions([2], 5)).toEqual([2]);
    });

    test('should move image from last paragraph', () => {
      // Image in last paragraph (5) should move to paragraph 4
      expect(optimizeImagePositions([5], 5)).toEqual([4]);
    });

    test('should fix spacing between adjacent images - your test case', () => {
      // Images in paragraphs 2,3 of 5 total → should become 2,4
      const result = optimizeImagePositions([2, 3], 5);
      expect(result).toEqual([2, 4]);
    });

    test('should handle multiple spacing violations', () => {
      // Images in 1,2,3 → should spread them out
      const result = optimizeImagePositions([1, 2, 3], 6);
      expect(result).toEqual([1, 3, 5]);
    });

    test('should prioritize last paragraph constraint over spacing', () => {
      // Images in 3,4 of 4 total → second image must move from last paragraph
      // Even if it creates spacing violation
      const result = optimizeImagePositions([3, 4], 4);
      expect(result).toEqual([1, 3]); // Moved 4→3, then 3→1 for spacing
    });

    test('should handle backward movement when forward is blocked', () => {
      // Images in 2,3 of 4 total → can't move 3→4 (last paragraph), so move 2→1
      const result = optimizeImagePositions([2, 3], 4);
      expect(result).toEqual([1, 3]);
    });

    test('should preserve good spacing when no changes needed', () => {
      // Images already properly spaced
      expect(optimizeImagePositions([1, 3, 5], 6)).toEqual([1, 3, 5]);
    });

    test('should handle edge case with minimal paragraphs', () => {
      // 2 paragraphs total: [1,2]. Image in paragraph 2 (last) should move to paragraph 1
      // But paragraph 1 already has an image. One image per paragraph constraint.
      // In this impossible case, prefer "no last paragraph" over "one per paragraph"
      // So result should be [1] (remove one image rather than violate hard constraints)
      expect(optimizeImagePositions([1, 2], 2)).toEqual([1]);
    });
  });

  describe('enforceLastParagraphConstraint', () => {
    test('should move images from last paragraph', () => {
      expect(enforceLastParagraphConstraint([2, 4], 4)).toEqual([1, 3]);
    });

    test('should not change valid positions', () => {
      expect(enforceLastParagraphConstraint([1, 3], 4)).toEqual([1, 3]);
    });

    test('should handle invalid input by filtering', () => {
      // This test is for post-validation - input should be pre-validated
      expect(enforceLastParagraphConstraint([2, 4], 4)).toEqual([1, 3]);
    });
  });

  describe('enforceSpacingConstraint', () => {
    test('should fix adjacent images by moving forward', () => {
      expect(enforceSpacingConstraint([2, 3], 5)).toEqual([2, 4]);
    });

    test('should fix adjacent images by moving backward when forward blocked', () => {
      expect(enforceSpacingConstraint([2, 3], 3)).toEqual([1, 3]);
    });

    test('should not change properly spaced images', () => {
      expect(enforceSpacingConstraint([1, 3, 5], 6)).toEqual([1, 3, 5]);
    });

    test('should handle multiple spacing violations', () => {
      expect(enforceSpacingConstraint([1, 2, 3], 6)).toEqual([1, 3, 5]);
    });
  });

  describe('calculateMoveDistance', () => {
    test('should calculate total move distance', () => {
      expect(calculateMoveDistance([2, 3], [2, 4])).toBe(1);
      expect(calculateMoveDistance([1, 2, 3], [1, 3, 5])).toBe(3); // 0 + 1 + 2 = 3
    });

    test('should handle no movement', () => {
      expect(calculateMoveDistance([1, 3, 5], [1, 3, 5])).toBe(0);
    });

    test('should throw error for different array lengths', () => {
      expect(() => calculateMoveDistance([1, 2], [1, 2, 3])).toThrow();
    });
  });

  describe('validateConstraints', () => {
    test('should validate correct positioning', () => {
      const result = validateConstraints([1, 3, 5], 6);
      expect(result.valid).toBe(true);
      expect(result.violations).toEqual([]);
    });

    test('should detect last paragraph violations', () => {
      const result = validateConstraints([2, 5], 5);
      expect(result.valid).toBe(false);
      expect(result.violations).toContain('Images in last paragraph: 5');
    });

    test('should detect spacing violations', () => {
      const result = validateConstraints([2, 3], 5);
      expect(result.valid).toBe(false);
      expect(result.violations).toContain('Images too close: 2 and 3');
    });

    test('should detect multiple violations', () => {
      const result = validateConstraints([2, 3, 5], 5);
      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(2);
    });
  });

  describe('integration tests - real scenarios', () => {
    test('scenario: user test case - images 2/5 and 3/5', () => {
      const original = [2, 3];
      const optimized = optimizeImagePositions(original, 5);
      
      expect(optimized).toEqual([2, 4]);
      expect(calculateMoveDistance(original, optimized)).toBe(1); // Minimal move
      expect(validateConstraints(optimized, 5).valid).toBe(true);
    });

    test('scenario: multiple images with last paragraph violation', () => {
      const original = [1, 3, 4, 5];
      const optimized = optimizeImagePositions(original, 5);
      
      // Expected: [1, 2, 3, 4] - move from last paragraph, accept spacing violations
      expect(optimized).toEqual([1, 2, 3, 4]);
      expect(optimized[optimized.length - 1]).toBeLessThan(5); // No image in last paragraph
      
      // Note: This may not pass spacing validation, but that's acceptable
      // since "no last paragraph" is higher priority than spacing
    });

    test('scenario: crowded beginning', () => {
      const original = [1, 2, 3];
      const optimized = optimizeImagePositions(original, 6);
      
      expect(optimized).toEqual([1, 3, 5]);
      expect(validateConstraints(optimized, 6).valid).toBe(true);
    });
  });
});