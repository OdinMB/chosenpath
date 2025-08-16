import { useState, useEffect } from "react";
import { PlayerCount } from "core/types";

export function useAiDraftForm(
  title?: string,
  teaser?: string,
  playerCountMax?: PlayerCount
) {
  const [aiDraftPrompt, setAiDraftPrompt] = useState<string>("");
  const [hasUserSetAiDraftPrompt, setHasUserSetAiDraftPrompt] = useState(false);

  const [aiDraftPlayerCount, setAiDraftPlayerCount] = useState<
    PlayerCount | undefined
  >(undefined);
  const [lastSetupPlayerCount, setLastSetupPlayerCount] = useState<
    PlayerCount | undefined
  >(undefined);

  // Update AI draft prompt based on form data when user hasn't manually set it
  useEffect(() => {
    const constructedPrompt =
      title || teaser
        ? `${title || ""}${title && teaser ? " - " : ""}${teaser || ""}`.trim()
        : "";

    if (constructedPrompt && !hasUserSetAiDraftPrompt) {
      setAiDraftPrompt(constructedPrompt);
    }
  }, [title, teaser, hasUserSetAiDraftPrompt]);

  // Handle player count changes from setup
  useEffect(() => {
    if (playerCountMax !== undefined) {
      // If setup value changed, always update draft
      if (playerCountMax !== lastSetupPlayerCount) {
        setAiDraftPlayerCount(playerCountMax);
        setLastSetupPlayerCount(playerCountMax);
      }
      // If no draft value set yet, use setup value
      else if (aiDraftPlayerCount === undefined) {
        setAiDraftPlayerCount(playerCountMax);
        setLastSetupPlayerCount(playerCountMax);
      }
    }
  }, [playerCountMax, lastSetupPlayerCount, aiDraftPlayerCount]);

  // Handle AI draft form prompt change callback
  const handleAiDraftPromptChange = (prompt: string) => {
    setAiDraftPrompt(prompt);
    setHasUserSetAiDraftPrompt(true);
  };

  // Handle AI draft player count change callback
  const handleAiDraftPlayerCountChange = (playerCount: PlayerCount) => {
    setAiDraftPlayerCount(playerCount);
    // Don't update lastSetupPlayerCount here - we want to track setup changes separately
  };

  return {
    aiDraftPrompt,
    aiDraftPlayerCount,
    handleAiDraftPromptChange,
    handleAiDraftPlayerCountChange,
  };
}