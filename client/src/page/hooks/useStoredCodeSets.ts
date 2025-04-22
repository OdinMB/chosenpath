import { useState, useCallback } from "react";
import { StoredCodeSet } from "@common/SessionContext";
import {
  getSortedCodeSets,
  deleteStoredCodeSet,
  generateJoinLink,
} from "@common/codeSetUtils";
import { useSession } from "@common/useSession";
import { Logger } from "@common/logger";

export function useStoredCodeSets() {
  const [codeSets, setCodeSets] = useState<StoredCodeSet[]>(
    getSortedCodeSets()
  );
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [codeSetToDelete, setCodeSetToDelete] = useState<number | null>(null);

  const { refreshStoredCodeSets } = useSession();

  // Refresh UI when code sets change
  const refreshLocalCodeSets = useCallback(() => {
    setCodeSets(getSortedCodeSets());
    refreshStoredCodeSets();
  }, [refreshStoredCodeSets]);

  // Copy a code to clipboard
  const handleCopyCode = useCallback((code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);

    // Clear copied status after 2 seconds
    setTimeout(() => {
      setCopiedCode(null);
    }, 2000);
  }, []);

  // Copy a join link to clipboard
  const handleCopyJoinLink = useCallback((code: string) => {
    const joinLink = generateJoinLink(code);

    navigator.clipboard.writeText(joinLink);
    setCopiedCode(code);

    // Clear copied status after 2 seconds
    setTimeout(() => {
      setCopiedCode(null);
    }, 2000);
  }, []);

  // Prepare to delete a code set
  const handleDeleteCodeSet = useCallback((timestamp: number) => {
    setCodeSetToDelete(timestamp);
    setIsConfirmDialogOpen(true);
  }, []);

  // Confirm deletion of a code set
  const confirmDelete = useCallback(() => {
    if (codeSetToDelete !== null) {
      if (deleteStoredCodeSet(codeSetToDelete)) {
        Logger.UI.log("Successfully deleted code set");
      } else {
        Logger.UI.warn("Failed to delete code set");
      }

      // Refresh both local and context state
      refreshLocalCodeSets();

      // Reset deletion state
      setCodeSetToDelete(null);
      setIsConfirmDialogOpen(false);
    }
  }, [codeSetToDelete, refreshLocalCodeSets]);

  return {
    codeSets,
    copiedCode,
    isConfirmDialogOpen,
    setIsConfirmDialogOpen,
    handleCopyCode,
    handleCopyJoinLink,
    handleDeleteCodeSet,
    confirmDelete,
    refreshLocalCodeSets,
  };
}
