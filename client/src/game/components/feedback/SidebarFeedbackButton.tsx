import { PrimaryButton } from "../../../shared/components/ui/PrimaryButton.js";
import { Icons } from "../../../shared/components/ui/Icons.js";

interface SidebarFeedbackButtonProps {
  closeSidebarOnMobile?: () => void;
  onOpenFeedbackModal: () => void;
}

export function SidebarFeedbackButton({
  closeSidebarOnMobile,
  onOpenFeedbackModal,
}: SidebarFeedbackButtonProps) {
  const handleOpenModal = () => {
    onOpenFeedbackModal();
    // Close the sidebar on mobile if the function is provided
    if (closeSidebarOnMobile && window.innerWidth < 768) {
      closeSidebarOnMobile();
    }
  };

  return (
    <PrimaryButton
      onClick={handleOpenModal}
      className="w-full mb-3"
      rightIcon={<Icons.ArrowUp />}
    >
      <span className="font-semibold text-sm mr-4">Share Feedback</span>
    </PrimaryButton>
  );
}
