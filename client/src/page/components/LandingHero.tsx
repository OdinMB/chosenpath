import { PrimaryButton } from "components/ui";
import { useNavigate } from "react-router-dom";

interface LandingHeroProps {
  headline: string;
  subheadline: string;
  ctaPrimary?: {
    text: string;
    link: string;
  };
  ctaSecondary?: {
    text: string;
    link: string;
  };
}

export function LandingHero({
  headline,
  subheadline,
  ctaPrimary,
  ctaSecondary,
}: LandingHeroProps) {
  const navigate = useNavigate();

  return (
    <div className="mb-16">
      <h1 className="text-3xl md:text-4xl font-montserrat font-bold mb-6 text-primary-800 text-center">
        {headline}
      </h1>
      <p className="text-lg md:text-xl mb-8 text-primary-600 max-w-3xl">
        {subheadline}
      </p>
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        {ctaPrimary && (
          <PrimaryButton
            size="lg"
            onClick={() => navigate(ctaPrimary.link)}
            className="font-semibold"
          >
            {ctaPrimary.text}
          </PrimaryButton>
        )}
        {ctaSecondary && (
          <PrimaryButton
            size="lg"
            onClick={() => navigate(ctaSecondary.link)}
            variant="outline"
            className="font-semibold"
          >
            {ctaSecondary.text}
          </PrimaryButton>
        )}
      </div>
    </div>
  );
}
