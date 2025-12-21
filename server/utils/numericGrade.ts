/**
 * Numeric grading utilities for math questions
 * Supports parsing decimals, fractions, and tolerance-based comparison
 */

export interface NumericGradeResult {
  correct: boolean;
  error?: string;
  userValue?: number;
  correctValue?: number;
}

/**
 * Parse a numeric string into a number
 * Supports:
 * - Decimals: "12.5", "-3.14"
 * - Fractions: "3/4", "-1/2", "1 1/2"
 * - Leading/trailing spaces are trimmed
 * 
 * @param input - String to parse
 * @returns Parsed number or null if invalid
 */
export function parseNumeric(input: string | null | undefined): number | null {
  if (!input) return null;

  const trimmed = input.trim();
  if (trimmed === "") return null;

  // If string contains "/", try fraction parsing first (before direct parse)
  // This prevents parseFloat("3/4") from returning 3
  if (trimmed.includes("/")) {
    // Try mixed fraction first: "a b/c" (more specific pattern)
    // Handle negative: "-2 3/4" means -(2 + 3/4) = -2.75
    const mixedFractionMatch = trimmed.match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/);
    if (mixedFractionMatch) {
      const whole = parseFloat(mixedFractionMatch[1]);
      const numerator = parseFloat(mixedFractionMatch[2]);
      const denominator = parseFloat(mixedFractionMatch[3]);
      if (denominator !== 0 && isFinite(whole) && isFinite(numerator) && isFinite(denominator)) {
        // If whole is negative, the entire fraction is negative
        const wholeAbs = Math.abs(whole);
        const fraction = wholeAbs + (numerator / denominator);
        return whole < 0 ? -fraction : fraction;
      }
    }

    // Try simple fraction: "a/b"
    const fractionMatch = trimmed.match(/^(-?\d+)\s*\/\s*(\d+)$/);
    if (fractionMatch) {
      const numerator = parseFloat(fractionMatch[1]);
      const denominator = parseFloat(fractionMatch[2]);
      if (denominator !== 0 && isFinite(numerator) && isFinite(denominator)) {
        const result = numerator / denominator;
        return isFinite(result) ? result : null;
      }
    }
    
    // If fraction parsing failed, return null (don't fall through to direct parse)
    return null;
  }

  // Try direct number parse (for decimals, integers, etc.)
  const directParse = parseFloat(trimmed);
  if (!isNaN(directParse) && isFinite(directParse)) {
    // Verify the entire string was consumed (handles cases like "12.5abc")
    const parsedString = directParse.toString();
    if (trimmed === parsedString || trimmed.startsWith(parsedString)) {
      return directParse;
    }
  }

  return null;
}

/**
 * Grade a numeric answer
 * 
 * @param userAnswer - User's answer string
 * @param correctAnswer - Correct answer string (canonical format)
 * @param tolerance - Optional tolerance (null = exact match)
 * @returns Grading result
 */
export function gradeNumeric(
  userAnswer: string | null | undefined,
  correctAnswer: string | null | undefined,
  tolerance: number | null | undefined
): NumericGradeResult {
  if (!userAnswer || !correctAnswer) {
    return {
      correct: false,
      error: "Missing answer",
    };
  }

  const userValue = parseNumeric(userAnswer);
  const correctValue = parseNumeric(correctAnswer);

  if (userValue === null) {
    return {
      correct: false,
      error: "Invalid numeric format",
      correctValue,
    };
  }

  if (correctValue === null) {
    return {
      correct: false,
      error: "Invalid correct answer format",
      userValue,
    };
  }

  // Compare with tolerance
  if (tolerance === null || tolerance === undefined) {
    // Exact match - use small epsilon for floating point precision
    // Use a reasonable tolerance for "exact" matches (1e-10)
    const difference = Math.abs(userValue - correctValue);
    const correct = difference < 1e-10;
    return {
      correct,
      userValue,
      correctValue,
    };
  } else {
    // Tolerance-based match
    // Use a small epsilon to handle floating point precision issues
    const difference = Math.abs(userValue - correctValue);
    const correct = difference <= tolerance + Number.EPSILON;
    return {
      correct,
      userValue,
      correctValue,
    };
  }
}

