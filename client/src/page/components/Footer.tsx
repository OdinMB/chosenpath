import { useNavigate } from "react-router-dom";
import { PrimaryButton, Icons } from "components/ui";
import {
  NewsletterButton,
  NewsletterModal,
  useNewsletter,
} from "resources/newsletter";
import { DiscordButton, AcademyButton } from "shared/components";

function SupportButton() {
  return (
    <PrimaryButton
      onClick={() => window.open("https://ko-fi.com/OdinMB", "_blank")}
      size="sm"
      variant="primary"
      className="flex items-center"
      aria-label="Support us on Ko-fi"
      title="Support us on Ko-fi"
      leftIcon={<Icons.Heart className="w-4 h-4" />}
    >
      Support
    </PrimaryButton>
  );
}

function GitHubButton() {
  return (
    <PrimaryButton
      onClick={() =>
        window.open("https://github.com/OdinMB/chosenpath", "_blank")
      }
      size="sm"
      variant="primary"
      className="flex items-center"
      aria-label="View on GitHub"
      title="View on GitHub"
      leftIcon={<Icons.GitHub className="w-4 h-4" />}
    >
      GitHub
    </PrimaryButton>
  );
}

export function Footer() {
  const navigate = useNavigate();
  const {
    isNewsletterModalOpen,
    openNewsletterModal,
    closeNewsletterModal,
    handleSubscribe,
  } = useNewsletter();

  return (
    <>
      <footer className="mt-12 pt-4 border-t border-primary-100 text-xs text-primary-400">
        <div className="mb-4 flex flex-wrap items-center gap-2 sm:gap-4">
          <AcademyButton
            onClick={() => {
              navigate("/academy");
            }}
          />
          <GitHubButton />
          <SupportButton />
          <NewsletterButton onClick={openNewsletterModal} />
          <DiscordButton />
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button
            onClick={() => navigate("/for-storytellers")}
            className="px-3 py-1.5 text-xs font-medium bg-white border border-primary-200 rounded text-primary-700 hover:bg-primary-50 transition-colors"
          >
            Storytellers
          </button>
          <button
            onClick={() => navigate("/for-educators")}
            className="px-3 py-1.5 text-xs font-semibold bg-white border border-primary-300 rounded text-primary-700 hover:bg-primary-50 transition-colors"
          >
            Educators
          </button>
          <button
            onClick={() => navigate("/for-therapists")}
            className="px-3 py-1.5 text-xs font-semibold bg-white border border-primary-300 rounded text-primary-700 hover:bg-primary-50 transition-colors"
          >
            Therapists
          </button>
          <button
            onClick={() => navigate("/for-coaches")}
            className="px-3 py-1.5 text-xs font-semibold bg-white border border-primary-300 rounded text-primary-700 hover:bg-primary-50 transition-colors"
          >
            Coaches
          </button>
        </div>

        <div className="flex items-center gap-2 mb-2">
          <span>Odin Mühlenbein</span>
          <div className="flex gap-2">
            <a
              href="https://odins.website"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center hover:text-primary-600"
            >
              <Icons.Globe />
            </a>
            <a
              href="https://www.linkedin.com/in/odinmuehlenbein/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center hover:text-primary-600"
            >
              <Icons.LinkedIn />
            </a>
            <a
              href="https://ko-fi.com/OdinMB"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center hover:text-primary-600"
            >
              <Icons.Heart />
            </a>
          </div>
          <span>Sonnenallee 50, 12045 Berlin</span>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <a
              href="/privacy"
              onClick={(e) => {
                e.preventDefault();
                navigate("/privacy");
              }}
              className="footer-link mr-3"
            >
              Privacy
            </a>
            <a
              href="/credits"
              onClick={(e) => {
                e.preventDefault();
                navigate("/credits");
              }}
              className="footer-link mr-3"
            >
              Credits
            </a>
            <a
              href="/stewardship"
              onClick={(e) => {
                e.preventDefault();
                navigate("/stewardship");
              }}
              className="footer-link"
            >
              Stewardship
            </a>
          </div>
          <a
            href="https://github.com/OdinMB/chosenpath"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-link"
          >
            Proudly open-source
          </a>
        </div>
      </footer>

      <NewsletterModal
        isOpen={isNewsletterModalOpen}
        onClose={closeNewsletterModal}
        onSubmit={handleSubscribe}
      />
    </>
  );
}
