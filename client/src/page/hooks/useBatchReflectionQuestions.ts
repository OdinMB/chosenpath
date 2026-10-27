import { useEffect, useRef, useState } from "react";
import {
  ReflectionQuestions,
  filledReflectionQuestions,
  reflectionQuestionsOf,
} from "core/types";
import type { TemplateReflectionOutcome } from "core/types/api";
import { templateApi } from "resources/templates/templateApi";
import { Logger } from "shared/logger";

/*
 * Reflection questions for several stories at once (TemplateConfigurator):
 * they start as the World's own; whoever starts the stories can change them,
 * and every start of the batch sends those of the outcomes its stories play,
 * in place of the World's. A single start sends none and takes the World's.
 */

export type BatchReflectionStatus = "loading" | "ready" | "failed";

/** The outcomes a story with this many players plays: the shared ones and its seats' own. */
export function outcomesForSeats(
  outcomes: TemplateReflectionOutcome[],
  playerCount: number
): TemplateReflectionOutcome[] {
  return outcomes.filter(
    ({ owner }) => owner === "shared" || Number(owner.replace("player", "")) <= playerCount
  );
}

/** The World's questions for each outcome, as copies to edit. */
export function worldDrafts(outcomes: TemplateReflectionOutcome[]): ReflectionQuestions {
  return Object.fromEntries(outcomes.map(({ id, reflectionQuestions }) => [id, [...reflectionQuestions]]));
}

/**
 * What every start of the batch sends: the filled questions of these
 * outcomes, by id; {} when none is left, so the stories show none.
 */
export function batchReflectionQuestions(
  drafts: ReflectionQuestions,
  outcomes: TemplateReflectionOutcome[]
): ReflectionQuestions {
  const sent: ReflectionQuestions = {};
  for (const { id } of outcomes) {
    const filled = filledReflectionQuestions(reflectionQuestionsOf(drafts, id) ?? []);
    if (filled.length > 0) sent[id] = filled;
  }
  return sent;
}

/** How many questions the stories will show, across these outcomes. */
export function questionCount(drafts: ReflectionQuestions, outcomes: TemplateReflectionOutcome[]): number {
  return Object.values(batchReflectionQuestions(drafts, outcomes)).reduce((sum, list) => sum + list.length, 0);
}

/**
 * The batch's reflection questions: loaded once the several-stories start is
 * chosen, then kept while the form is open. A load that failed is tried again
 * for the next sign-in (`account`, the signed-in user), or the next time the
 * start is chosen.
 */
export function useBatchReflectionQuestions(
  templateId: string,
  active: boolean,
  account?: object | null
) {
  const requested = useRef(false);
  const [status, setStatus] = useState<BatchReflectionStatus>("loading");
  const [outcomes, setOutcomes] = useState<TemplateReflectionOutcome[]>([]);
  const [drafts, setDrafts] = useState<ReflectionQuestions>({});
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!active || requested.current) return;
    requested.current = true;
    setStatus("loading");
    templateApi
      .getReflectionQuestions(templateId)
      .then((loaded) => {
        setOutcomes(loaded);
        setDrafts(worldDrafts(loaded));
        setStatus("ready");
      })
      .catch((error: unknown) => {
        Logger.App.warn("The World's reflection questions could not be loaded", error);
        requested.current = false;
        setStatus("failed");
      });
  }, [active, templateId, account]);

  return {
    status,
    open,
    toggle: () => setOpen((wasOpen) => !wasOpen),
    drafts,
    /** The outcomes the batch's stories play, at this player count. */
    outcomesFor: (playerCount: number) => outcomesForSeats(outcomes, playerCount),
    setQuestions: (outcomeId: string, questions: string[]) =>
      setDrafts((previous) => ({ ...previous, [outcomeId]: questions })),
    /** What each start sends; nothing until the World's questions are loaded, so the stories take the World's. */
    requestQuestions: (playerCount: number): ReflectionQuestions | undefined =>
      status === "ready" ? batchReflectionQuestions(drafts, outcomesForSeats(outcomes, playerCount)) : undefined,
  };
}
