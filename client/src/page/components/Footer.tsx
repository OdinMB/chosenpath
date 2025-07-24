import { useNavigate } from "react-router-dom";
import { Icons } from "components/ui";
import {
  NewsletterButton,
  NewsletterModal,
  useNewsletter,
} from "resources/newsletter";
import { DiscordButton, AcademyButton } from "shared/components";

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
          <NewsletterButton onClick={openNewsletterModal} />
          <DiscordButton />
          <AcademyButton
            onClick={() => {
              navigate("/academy");
            }}
          />
        </div>

        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={() => navigate("/for-storytellers")}
            className="px-3 py-1.5 text-xs font-medium bg-white border border-primary-200 rounded text-primary-700 hover:bg-primary-50 transition-colors"
          >
            For Storytellers
          </button>
          <button
            onClick={() => navigate("/for-coaches")}
            className="px-3 py-1.5 text-xs font-medium bg-white border border-primary-200 rounded text-primary-700 hover:bg-primary-50 transition-colors"
          >
            For Coaches
          </button>
          <button
            onClick={() => navigate("/for-educators")}
            className="px-3 py-1.5 text-xs font-medium bg-white border border-primary-200 rounded text-primary-700 hover:bg-primary-50 transition-colors"
          >
            For Educators
          </button>
        </div>

        <p className="mb-2">
          Looking for collaborators. Are you a writer, storyteller, designer, or
          world builder? Reach out!
        </p>

        <div className="flex items-center gap-2 mb-2">
          <span>Odin Mühlenbein</span>
          <div className="flex gap-2">
            <a
              href="https://odin.muehlenbein.de"
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
          </div>
          <span>Sonnenallee 50, 12045 Berlin</span>
        </div>

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
            className="footer-link"
          >
            Credits
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
