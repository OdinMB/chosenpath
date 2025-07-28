import { Footer } from "../components/Footer";

export function Privacy() {
  return (
    <div className="max-w-2xl mx-auto p-4 font-lora">
      <h1 className="text-2xl font-montserrat font-semibold mb-6 text-primary-800">
        Privacy Policy
      </h1>

      <div className="space-y-6">
        <section>
          <p className="mb-4">
            We only collect and store data on your device that is absolutely
            necessary to provide our services.
          </p>

          <p className="mb-4">
            <b>We do NOT use</b> invasive services like ads, Google Analytics,
            user tracking, or any other such nonsense. We're so restrained that
            we don't even need a cookie banner.
          </p>

          <p className="mb-4">
            We use <b>Simple Analytics</b>, a privacy-first analytics service that:
            • Does not track users across websites
            • Does not store cookies
            • Does not collect personal data
            • Respects Do Not Track settings
            This helps us understand basic usage patterns while fully respecting your privacy.
          </p>

          <div className="my-6">
            <img
              src="/no-cookies_medium.jpeg"
              alt="No cookies policy"
              className="w-full rounded-lg object-cover"
            />
          </div>

          <h2 className="text-lg font-montserrat font-semibold mt-6 mb-3 text-primary-700">
            Information We Collect
          </h2>

          <div className="space-y-4">
            <div className="p-4 bg-primary-50 rounded-lg">
              <h3 className="text-md font-montserrat font-bold mb-1">
                IP Address
              </h3>
              <p className="text-sm text-primary-600">
                We temporarily store your IP address to protect our site from
                abuse, such as attacks, account theft attempts, or excessive
                resource usage. IP addresses are only stored in memory (not in
                log files) and are automatically deleted after 24 hours.
              </p>
            </div>

            <div className="p-4 bg-primary-50 rounded-lg">
              <h3 className="text-md font-montserrat font-bold mb-1">
                Email Address
              </h3>
              <p className="text-sm text-primary-600">
                Providing your email address is completely optional. We only
                collect it if you choose to register an account or sign up for
                our newsletter. You don't need an account to create and play
                stories.
              </p>
            </div>
          </div>

          <h2 className="text-lg font-montserrat font-semibold mt-6 mb-3 text-primary-700">
            Information Stored on Your Device
          </h2>

          <div className="space-y-4">
            <div className="p-4 bg-primary-50 rounded-lg">
              <h3 className="text-md font-montserrat font-bold mb-1">
                Session and Authentication Tokens
              </h3>
              <p className="text-sm text-primary-600">
                For users who log into their accounts, we store authentication
                tokens on your device. These tokens are necessary to keep you
                logged in and to securely verify your identity when you interact
                with our services.
              </p>
            </div>

            <div className="p-4 bg-primary-50 rounded-lg">
              <h3 className="text-md font-montserrat font-bold mb-1">
                Story Access Codes
              </h3>
              <p className="text-sm text-primary-600">
                After creating a story or joining a multiplayer story, we store
                access codes on your device. These codes are necessary to verify
                that you are authorized to play that specific story.
              </p>
            </div>
          </div>
        </section>
      </div>
      
      <Footer />
    </div>
  );
}
