import { Modal } from "../../shared/components/ui/Modal";
import { UserAccountPage } from "./UserAccountPage";

interface UserAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialView?: "login" | "register";
}

export function UserAccountModal({
  isOpen,
  onClose,
  initialView = "login",
}: UserAccountModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      width="md"
      showCloseButton={true}
      title={initialView === "login" ? "Login" : "Create Account"}
    >
      <UserAccountPage isInModal={true} onClose={onClose} />
    </Modal>
  );
}
