import { Icons } from "components/ui";
import {
  reflectionQuestionCount,
  type LostReflectionQuestions,
} from "../utils/aiReflectionQuestions";

interface ReflectionQuestionsLossNoticeProps {
  /** Lets the button that removes them point to this note (aria-describedby). */
  id: string;
  /** The sentence before the list, given the count ("3 reflection questions"). */
  lead: (count: string) => string;
  lost: LostReflectionQuestions[];
}

/**
 * Before an AI change is accepted: the reflection questions it removes with
 * the outcomes it replaces, outcome by outcome. Nothing when it removes none.
 */
export function ReflectionQuestionsLossNotice({ id, lead, lost }: ReflectionQuestionsLossNoticeProps) {
  if (lost.length === 0) return null;
  return (
    <div
      id={id}
      className="mb-4 flex items-start gap-2 rounded-md border border-tertiary-200 bg-tertiary-50 p-3 text-sm text-primary-800"
    >
      <span aria-hidden="true" className="mt-0.5 shrink-0 text-tertiary">
        <Icons.AlertCircle className="h-4 w-4" />
      </span>
      <div>
        <p className="font-semibold">{lead(reflectionQuestionCount(lost))}</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {lost.map(({ outcomeId, question, count }) => (
            <li key={outcomeId}>{`${count} on “${question}”`}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
