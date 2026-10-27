import React from "react";
import {
  REFLECTION_QUESTION_MAX_LENGTH,
  REFLECTION_QUESTIONS_PER_OUTCOME,
} from "core/types";
import { Icons, PrimaryButton, TextArea } from "components/ui";

interface ReflectionQuestionsFieldProps {
  /** Unique on the page (an outcome's id): the field's ids start with it. */
  id: string;
  /** The questions as written so far, blank ones included. */
  questions: string[];
  /** Called with every question, in order, on each change. */
  onChange: (questions: string[]) => void;
  readOnly?: boolean;
  /** What the questions are for, before their limits. */
  hint?: string;
  /**
   * The element that names the questions (an outcome's heading): the field
   * then shows no heading or hint of its own, and is described by
   * `describedBy`, a note the page shows once for several fields.
   */
  labelledBy?: string;
  describedBy?: string;
}

const DEFAULT_HINT = "Optional. Shown under this question on the end screen of every story.";

/**
 * One outcome's reflection questions: a text area for each, growing with its
 * text from two lines, up to the most an outcome takes
 * (REFLECTION_QUESTIONS_PER_OUTCOME), each held to
 * REFLECTION_QUESTION_MAX_LENGTH characters, as the server reads them.
 */
export function ReflectionQuestionsField({
  id,
  questions,
  onChange,
  readOnly = false,
  hint = DEFAULT_HINT,
  labelledBy,
  describedBy,
}: ReflectionQuestionsFieldProps) {
  const labelId = `${id}-reflection-label`;
  const hintId = `${id}-reflection-hint`;
  const full = questions.length >= REFLECTION_QUESTIONS_PER_OUTCOME;

  const replaced = (index: number, value: string) =>
    questions.map((question, i) => (i === index ? value : question));

  return (
    <div
      role="group"
      aria-labelledby={labelledBy ?? labelId}
      aria-describedby={labelledBy ? describedBy : hintId}
      className="space-y-2"
    >
      {!labelledBy && (
        <div>
          <span id={labelId} className="font-semibold">
            Reflection questions
          </span>
          <p id={hintId} className="text-sm text-gray-600">
            {`${hint} Up to ${REFLECTION_QUESTIONS_PER_OUTCOME}, each up to ${REFLECTION_QUESTION_MAX_LENGTH} characters.`}
          </p>
        </div>
      )}

      {readOnly ? (
        questions.length > 0 ? (
          <ul className="list-disc ml-5 space-y-1 text-sm">
            {questions.map((question, index) => (
              <li key={index}>{question}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-600">None</p>
        )
      ) : (
        <>
          {questions.map((question, index) => (
            <div key={index} className="flex items-start gap-2">
              <TextArea
                id={`${id}-reflection-${index}`}
                aria-label={`Reflection question ${index + 1}`}
                value={question}
                maxLength={REFLECTION_QUESTION_MAX_LENGTH}
                placeholder="A question to think about once the story is over"
                autoHeight
                // Two lines at the least (with the padding and border), however short the question
                className="min-h-[4.25rem] bg-white"
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  onChange(replaced(index, e.target.value))
                }
              />
              <button
                type="button"
                onClick={() => onChange(questions.filter((_, i) => i !== index))}
                className="mt-3 text-tertiary hover:text-tertiary-700 flex-shrink-0"
                aria-label={`Remove reflection question ${index + 1}`}
              >
                <Icons.Trash className="h-4 w-4" />
              </button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <PrimaryButton
              variant="outline"
              leftBorder={false}
              size="sm"
              type="button"
              onClick={() => onChange([...questions, ""])}
              disabled={full}
              leftIcon={<Icons.Plus className="h-4 w-4" />}
            >
              Add reflection question
            </PrimaryButton>
            {full && <span className="text-sm text-gray-600">That&apos;s the most an outcome takes.</span>}
          </div>
        </>
      )}
    </div>
  );
}
