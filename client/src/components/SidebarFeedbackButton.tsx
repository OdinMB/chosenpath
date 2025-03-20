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
    <button
      onClick={handleOpenModal}
      className="w-full p-3 text-left rounded-lg transition-all duration-300
          bg-white text-primary cursor-pointer font-lora
          border-l-8 border border-accent shadow-md
          hover:border-l-8 hover:border-secondary hover:shadow-lg
          hover:translate-x-1 hover:bg-primary-50
          focus:outline-none focus:ring-2 focus:ring-accent focus:ring-opacity-50
          flex items-center justify-between mb-3"
    >
      <span className="font-semibold text-sm mr-4">Share Feedback</span>
      <svg
        className="w-6 h-6 text-primary-700 flex-shrink-0 ml-2"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M7 11l5-5m0 0l5 5m-5-5v12"
        />
      </svg>
    </button>
  );
}
