import { useEffect, useRef, useState } from "react";
import { Notification } from "components/ui";
import {
  chooseAgainLine,
  secondsUntilChoice,
  type ChoiceLimit,
} from "game/choiceLimit";

interface ChoiceLimitNoticeProps {
  /** The refused choice, or null while there is none to tell */
  limit: ChoiceLimit | null;
}

/**
 * Above the choices when the player's choice was refused for choosing faster
 * than the game allows: that it wasn't sent, why, and a countdown to when
 * they can choose again. A polite live region that stays on screen while the
 * choices are open, so a screen reader announces the message when it comes
 * and "You can choose again now." when the wait is over, but not every
 * second of the countdown. Empty, it takes no space. No close button: it
 * goes when the player chooses again.
 */
export function ChoiceLimitNotice({ limit }: ChoiceLimitNoticeProps) {
  return (
    <div aria-live="polite">
      {limit && (
        // A new refusal counts down from its own wait
        <ChoiceLimitMessage key={limit.until} until={limit.until} />
      )}
    </div>
  );
}

function ChoiceLimitMessage({ until }: { until: number }) {
  const secondsLeft = useSecondsUntil(until);
  const ref = useRef<HTMLDivElement>(null);

  // Into view as it appears, if it isn't: the choices were hidden while the
  // refused one was on its way, which can leave it below a phone's screen
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest" });
  }, []);

  return (
    <div ref={ref} className="w-full max-w-2xl mx-auto">
      <Notification
        type="info"
        title="Your choice wasn't sent"
        dismissible={false}
        message={
          <p>
            You're choosing faster than the game allows.{" "}
            {secondsLeft > 0 ? (
              <>
                <span aria-hidden="true">{chooseAgainLine(secondsLeft)}</span>
                <span className="sr-only">
                  You can choose again in a few seconds.
                </span>
              </>
            ) : (
              chooseAgainLine(0)
            )}
          </p>
        }
      />
    </div>
  );
}

/** The seconds left until `until`, ticking once a second until none are left. */
function useSecondsUntil(until: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time >= until) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [until]);

  return secondsUntilChoice(until, now);
}
