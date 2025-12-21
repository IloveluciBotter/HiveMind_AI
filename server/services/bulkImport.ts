import { z } from "zod";
import { parseNumeric } from "../utils/numericGrade";

export interface BulkImportError {
  index: number;
  field: string;
  message: string;
}

export interface BulkImportQuestion {
  prompt: string;
  difficulty: number;
  questionType: "mcq" | "numeric";
  numericAnswer?: string;
  numericTolerance?: number | null;
  numericUnit?: string | null;
  // For MCQ
  choices?: string[];
  correctChoiceIndex?: number;
}

const MAX_QUESTIONS_PER_REQUEST = 200;
const MAX_PROMPT_LENGTH = 2000;

/**
 * Validate a single question for bulk import
 */
export function validateQuestion(
  question: BulkImportQuestion,
  index: number
): BulkImportError[] {
  const errors: BulkImportError[] = [];

  // Validate prompt
  if (!question.prompt || typeof question.prompt !== "string") {
    errors.push({
      index,
      field: "prompt",
      message: "Prompt is required and must be a string",
    });
  } else if (question.prompt.length > MAX_PROMPT_LENGTH) {
    errors.push({
      index,
      field: "prompt",
      message: `Prompt must be ${MAX_PROMPT_LENGTH} characters or less`,
    });
  }

  // Validate difficulty
  if (typeof question.difficulty !== "number" || question.difficulty < 1 || question.difficulty > 5) {
    errors.push({
      index,
      field: "difficulty",
      message: "Difficulty must be a number between 1 and 5",
    });
  }

  // Validate questionType
  if (question.questionType !== "mcq" && question.questionType !== "numeric") {
    errors.push({
      index,
      field: "questionType",
      message: 'questionType must be "mcq" or "numeric"',
    });
  }

  // Type-specific validation
  if (question.questionType === "numeric") {
    if (!question.numericAnswer || typeof question.numericAnswer !== "string") {
      errors.push({
        index,
        field: "numericAnswer",
        message: "numericAnswer is required for numeric questions",
      });
    } else {
      // Validate numericAnswer can be parsed
      const parsed = parseNumeric(question.numericAnswer);
      if (parsed === null) {
        errors.push({
          index,
          field: "numericAnswer",
          message: `Invalid numeric format: "${question.numericAnswer}"`,
        });
      }
    }

    if (question.numericTolerance !== null && question.numericTolerance !== undefined) {
      if (typeof question.numericTolerance !== "number" || question.numericTolerance < 0) {
        errors.push({
          index,
          field: "numericTolerance",
          message: "numericTolerance must be a number >= 0",
        });
      }
    }
  } else if (question.questionType === "mcq") {
    if (!question.choices || !Array.isArray(question.choices) || question.choices.length < 2) {
      errors.push({
        index,
        field: "choices",
        message: "choices array with at least 2 options is required for MCQ questions",
      });
    }

    if (question.correctChoiceIndex === undefined || question.correctChoiceIndex === null) {
      errors.push({
        index,
        field: "correctChoiceIndex",
        message: "correctChoiceIndex is required for MCQ questions",
      });
    } else if (
      typeof question.correctChoiceIndex !== "number" ||
      question.correctChoiceIndex < 0 ||
      (question.choices && question.correctChoiceIndex >= question.choices.length)
    ) {
      errors.push({
        index,
        field: "correctChoiceIndex",
        message: "correctChoiceIndex must be a valid index in the choices array",
      });
    }
  }

  return errors;
}

/**
 * Validate bulk import request
 */
export function validateBulkImport(
  questions: BulkImportQuestion[]
): BulkImportError[] {
  const errors: BulkImportError[] = [];

  // Check count limit
  if (questions.length > MAX_QUESTIONS_PER_REQUEST) {
    errors.push({
      index: -1,
      field: "questions",
      message: `Maximum ${MAX_QUESTIONS_PER_REQUEST} questions per request`,
    });
    return errors; // Early return if over limit
  }

  if (questions.length === 0) {
    errors.push({
      index: -1,
      field: "questions",
      message: "At least one question is required",
    });
    return errors;
  }

  // Validate each question
  questions.forEach((question, index) => {
    const questionErrors = validateQuestion(question, index);
    errors.push(...questionErrors);
  });

  return errors;
}

/**
 * Convert bulk import question to database format
 */
export function convertToDbQuestion(
  question: BulkImportQuestion,
  trackId: string
) {
  if (question.questionType === "numeric") {
    return {
      trackId,
      text: question.prompt,
      options: [], // Empty for numeric questions
      correctIndex: 0, // Placeholder for numeric
      complexity: question.difficulty,
      questionType: "numeric" as const,
      numericAnswer: question.numericAnswer!,
      numericTolerance: question.numericTolerance ?? null,
      numericUnit: question.numericUnit ?? null,
    };
  } else {
    return {
      trackId,
      text: question.prompt,
      options: question.choices!,
      correctIndex: question.correctChoiceIndex!,
      complexity: question.difficulty,
      questionType: "mcq" as const,
      numericAnswer: null,
      numericTolerance: null,
      numericUnit: null,
    };
  }
}

