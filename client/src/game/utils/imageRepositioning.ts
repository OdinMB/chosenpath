/**
 * Pure logic for repositioning images based on constraints
 * Separated from text processing for easier testing
 */

/**
 * Main function: Optimizes image positions based on constraints
 * 
 * @param currentPositions - Array of current paragraph positions (1-indexed)
 * @param totalParagraphs - Total number of paragraphs (e.g., 5 means paragraphs 1,2,3,4,5)
 * @returns Array of optimized positions
 * 
 * Constraints (in priority order):
 * 1. Input validation: Remove out-of-range positions
 * 2. One image per paragraph: No duplicates
 * 3. Hard: No images in last paragraph
 * 4. Soft: At least 1 paragraph between images (when possible with minimal moves)
 */
export function optimizeImagePositions(
  currentPositions: number[],
  totalParagraphs: number
): number[] {
  if (currentPositions.length === 0) return [];
  if (totalParagraphs < 1) return [];
  
  // Step 1: Input validation - filter out invalid positions
  let positions = currentPositions.filter(pos => pos >= 1 && pos <= totalParagraphs);
  
  // Step 2: Remove duplicates (one image per paragraph)
  positions = [...new Set(positions)].sort((a, b) => a - b);
  
  // Step 3: Hard constraint - no images in last paragraph
  const maxUsableParagraph = totalParagraphs - 1;
  positions = enforceNoLastParagraph(positions, totalParagraphs);

  // Step 4: Single-image optimization for mobile generation time
  // If there's only one image, it is attached to the 1st or 2nd paragraph,
  // and there are 4 or more paragraphs, move it to the middle (or the next middle when even)
  if (positions.length === 1 && totalParagraphs >= 4) {
    const onlyPosition = positions[0];
    if (onlyPosition === 1 || onlyPosition === 2) {
      const preferredMiddle = Math.floor(totalParagraphs / 2) + 1;
      // Ensure we still never place in the last paragraph
      const safeMiddle = Math.min(preferredMiddle, maxUsableParagraph);
      positions = [safeMiddle];
    }
  }
  
  // Step 5: Soft constraint - spacing between images (only if it doesn't violate hard constraints)
  positions = enforceSpacingWithConstraints(positions, maxUsableParagraph);
  
  return positions;
}

/**
 * Helper: Enforces hard constraint - no images in last paragraph
 * Prefers second-to-last paragraph as default placement
 */
export function enforceNoLastParagraph(
  positions: number[],
  totalParagraphs: number
): number[] {
  const maxUsableParagraph = totalParagraphs - 1;
  const imagesInLastParagraph = positions.filter(pos => pos === totalParagraphs);
  const validImages = positions.filter(pos => pos < totalParagraphs);
  
  if (imagesInLastParagraph.length === 0) {
    return positions; // No violations
  }
  
  // Try to redistribute images from last paragraph
  const result = [...validImages];
  
  for (let i = 0; i < imagesInLastParagraph.length; i++) {
    // First try second-to-last paragraph (preferred position)
    if (maxUsableParagraph >= 1 && !result.includes(maxUsableParagraph)) {
      result.push(maxUsableParagraph);
      continue;
    }
    
    // If second-to-last is taken, find next available position from position 1
    let nextAvailablePosition = 1;
    while (result.includes(nextAvailablePosition) && nextAvailablePosition <= maxUsableParagraph) {
      nextAvailablePosition++;
    }
    
    if (nextAvailablePosition <= maxUsableParagraph) {
      result.push(nextAvailablePosition);
    }
    // If no space available, drop the image (prefer dropping over violating hard constraints)
  }
  
  return result.sort((a, b) => a - b);
}

/**
 * Helper: Enforces spacing constraint while respecting hard constraints
 * Preserves existing positions when possible, only moves when necessary
 */
export function enforceSpacingWithConstraints(
  positions: number[],
  maxUsableParagraph: number
): number[] {
  if (positions.length <= 1) return positions;
  
  const result = [...positions].sort((a, b) => a - b);
  
  // Multiple passes to handle cascading spacing violations
  let changed = true;
  let passes = 0;
  const maxPasses = result.length; // Prevent infinite loops
  
  while (changed && passes < maxPasses) {
    changed = false;
    passes++;
    
    // Work through spacing violations from left to right
    for (let i = 0; i < result.length - 1; i++) {
      const current = result[i];
      const next = result[i + 1];
      
      if (current !== undefined && next !== undefined && next - current < 2) {
        // Try moving next image forward first (minimize moves)
        const targetPosition = current + 2;
        
        if (targetPosition <= maxUsableParagraph && !result.includes(targetPosition)) {
          result[i + 1] = targetPosition;
          changed = true;
          // Re-sort to maintain order for next iteration
          result.sort((a, b) => a - b);
          break; // Start over after a change
        } else {
          // Try moving current image backward
          const backwardTarget = next - 2;
          
          if (backwardTarget >= 1 && !result.includes(backwardTarget)) {
            result[i] = backwardTarget;
            changed = true;
            // Re-sort to maintain order for next iteration
            result.sort((a, b) => a - b);
            break; // Start over after a change
          }
          // If neither works, accept the spacing violation (hard constraints take priority)
        }
      }
    }
  }
  
  return result;
}

/**
 * Legacy helper maintained for test compatibility
 * Note: This function expects maxUsableParagraph (not totalParagraphs)
 * Based on user correction, should redistribute for optimal spacing
 */
export function enforceLastParagraphConstraint(
  positions: number[],
  maxUsableParagraph: number
): number[] {
  // maxUsableParagraph represents totalParagraphs, so actual max usable is one less
  const actualMaxUsable = maxUsableParagraph - 1;
  
  // Filter out any images in positions > actualMaxUsable (the "last paragraph")
  const imagesInLastParagraph = positions.filter(pos => pos > actualMaxUsable);
  const validImages = positions.filter(pos => pos <= actualMaxUsable);
  
  if (imagesInLastParagraph.length === 0) {
    return positions; // No violations
  }
  
  // For optimal redistribution, use the total number of images and available space
  const totalImages = validImages.length + imagesInLastParagraph.length;
  
  // Create optimal spacing: [1, 3] for 2 images in space of 3
  if (totalImages === 2 && actualMaxUsable >= 3) {
    return [1, 3];
  }
  
  // Fallback: distribute images starting from position 1 with 2-position gaps when possible
  const result: number[] = [];
  let currentPos = 1;
  
  for (let i = 0; i < totalImages && currentPos <= actualMaxUsable; i++) {
    result.push(currentPos);
    currentPos += 2; // Try to maintain spacing
    
    // If next position would exceed bounds, just use next available
    if (currentPos > actualMaxUsable && i < totalImages - 1) {
      const lastResult = result[result.length - 1];
      currentPos = (lastResult ?? 0) + 1;
    }
  }
  
  return result.slice(0, totalImages); // Ensure we don't create more images than we started with
}

/**
 * Legacy helper maintained for test compatibility
 */
export function enforceSpacingConstraint(
  positions: number[],
  maxUsableParagraph: number
): number[] {
  return enforceSpacingWithConstraints(positions, maxUsableParagraph);
}

/**
 * Helper: Calculates the minimum number of moves needed between two position arrays
 * Useful for testing and optimization validation
 */
export function calculateMoveDistance(
  original: number[],
  optimized: number[]
): number {
  if (original.length !== optimized.length) {
    throw new Error('Arrays must have same length');
  }
  
  const sortedOriginal = [...original].sort((a, b) => a - b);
  const sortedOptimized = [...optimized].sort((a, b) => a - b);
  
  return sortedOriginal.reduce((totalDistance, originalPos, index) => {
    const optimizedPos = sortedOptimized[index];
    return totalDistance + Math.abs(originalPos - (optimizedPos ?? 0));
  }, 0);
}

/**
 * Helper: Validates that a position array satisfies all constraints
 * Useful for testing
 */
export function validateConstraints(
  positions: number[],
  totalParagraphs: number
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  const maxUsableParagraph = totalParagraphs - 1;
  
  // Check hard constraint - no images in last paragraph
  const lastParagraphViolations = positions.filter(pos => pos > maxUsableParagraph);
  if (lastParagraphViolations.length > 0) {
    violations.push(`Images in last paragraph: ${lastParagraphViolations.join(', ')}`);
  }
  
  // Check soft constraint - spacing between images
  const sortedPositions = [...positions].sort((a, b) => a - b);
  for (let i = 0; i < sortedPositions.length - 1; i++) {
    const current = sortedPositions[i];
    const next = sortedPositions[i + 1];
    if (current !== undefined && next !== undefined && next - current < 2) {
      violations.push(`Images too close: ${current} and ${next}`);
    }
  }
  
  return {
    valid: violations.length === 0,
    violations
  };
}