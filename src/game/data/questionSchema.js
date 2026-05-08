import { z } from "zod";

export const QUESTION_OPTION_COUNT = 4;

export const QuestionSchema = z.object({
  prompt: z.string().trim().min(1, "Prompt is required."),
  options: z
    .array(z.string().trim().min(1, "Answer is required."))
    .length(QUESTION_OPTION_COUNT, "Options must contain exactly 4 answers."),
  correct: z
    .number()
    .int("Correct must be an integer.")
    .min(0, "Correct must be 0, 1, 2, or 3.")
    .max(QUESTION_OPTION_COUNT - 1, "Correct must be 0, 1, 2, or 3.")
}).strip();

export function parseQuestion(value) {
  return QuestionSchema.safeParse(value);
}

export function isValidQuestion(value) {
  return parseQuestion(value).success;
}

export function getQuestionValidationMessage(value) {
  if (value == null) return "No custom question set.";
  const result = parseQuestion(value);
  if (result.success) return "";
  return result.error.issues[0]?.message || "Question is invalid.";
}
