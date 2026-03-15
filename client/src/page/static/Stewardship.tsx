import { Footer } from "../components/Footer";

export function Stewardship() {
  return (
    <div className="max-w-2xl mx-auto p-4 font-lora">
      <h1 className="text-2xl font-montserrat font-semibold mb-6 text-primary-800">
        Stewardship
      </h1>

      <div className="space-y-6">
        <section>
          <p className="mb-4">
            Chosen Path is a solo-built open-source project looking for a
            long-term home. If you're a gaming company, edtech startup,
            university lab, open-source community, or nonprofit that sees
            potential in AI-powered interactive narrative — this page is for you.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-montserrat font-semibold mb-3 text-primary-700">
            What You'd Be Getting
          </h2>
          <div className="space-y-4">
            <div className="p-4 bg-primary-50 rounded-lg">
              <ul className="space-y-2 text-sm text-primary-600">
                <li>
                  <strong>AI-powered narrative engine</strong> — a rich system
                  for interactive storytelling, explored in depth at the{" "}
                  <a
                    href="/academy"
                    className="text-primary-600 hover:text-primary-800 underline"
                  >
                    Worldbuilding Academy
                  </a>
                </li>
                <li>
                  <strong>Template system</strong> — create reusable story setups
                  without code
                </li>
                <li>
                  <strong>Multiplayer support</strong> — 1-3 players,
                  cooperative/competitive/mixed
                </li>
                <li>
                  <strong>Cross-domain</strong> — entertainment, education,
                  coaching, DEI training, scenario planning
                </li>
                <li>
                  <strong>Modern stack</strong> — React, TypeScript, Express,
                  PostgreSQL, LangChain/OpenAI
                </li>
                <li>
                  No competitor combines all of these in a browser-based,
                  AI-driven package
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-montserrat font-semibold mb-3 text-primary-700">
            Ways to Get Involved
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-primary-50 rounded-lg">
              <h3 className="text-md font-montserrat font-bold mb-1">
                Fork and Adapt
              </h3>
              <p className="text-sm text-primary-600">
                The AGPL license lets you build on this for your own needs. If
                you deploy modifications as a service, share your source.
              </p>
            </div>
            <div className="p-4 bg-primary-50 rounded-lg">
              <h3 className="text-md font-montserrat font-bold mb-1">
                Commercial License
              </h3>
              <p className="text-sm text-primary-600">
                Need non-AGPL terms? Contact the maintainer to discuss licensing
                arrangements.
              </p>
            </div>
            <div className="p-4 bg-primary-50 rounded-lg">
              <h3 className="text-md font-montserrat font-bold mb-1">
                Take Over This Site
              </h3>
              <p className="text-sm text-primary-600">
                If you want to become the project's primary steward, let's talk.
                The contributor agreement is structured to allow relicensing to
                new stewards.
              </p>
            </div>
            <div className="p-4 bg-primary-50 rounded-lg">
              <h3 className="text-md font-montserrat font-bold mb-1">
                Sponsor Development
              </h3>
              <p className="text-sm text-primary-600">
                Support ongoing development via{" "}
                <a
                  href="https://ko-fi.com/OdinMB"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-800 underline"
                >
                  Ko-fi
                </a>{" "}
                or reach out about dedicated feature work.
              </p>
            </div>
            <div className="p-4 bg-primary-50 rounded-lg col-span-2">
              <h3 className="text-md font-montserrat font-bold mb-1">
                Partner on a Use Case
              </h3>
              <p className="text-sm text-primary-600">
                Education pilot? Coaching integration? Research collaboration?
                The engine is flexible.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-montserrat font-semibold mb-3 text-primary-700">
            Open Source & License
          </h2>
          <div className="p-4 bg-primary-50 rounded-lg">
            <h3 className="text-md font-montserrat font-bold mb-1">
              AGPL-3.0
            </h3>
            <p className="text-sm text-primary-600 mb-2">
              Chosen Path is open-source software licensed under the{" "}
              <a
                href="https://github.com/OdinMB/chosenpath/blob/main/LICENSE"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:text-primary-800 underline"
              >
                GNU Affero General Public License v3.0 (AGPL-3.0)
              </a>
              .
            </p>
            <p className="text-sm text-primary-600 mb-2">
              The source code is available on{" "}
              <a
                href="https://github.com/OdinMB/chosenpath"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:text-primary-800 underline"
              >
                GitHub
              </a>
              .
            </p>
            <p className="text-sm text-primary-600 mb-2">
              If you deploy a modified version of this software as a network
              service, you must make your modified source code available under
              the same license.
            </p>
            <p className="text-sm text-primary-600">
              See the{" "}
              <a
                href="https://github.com/OdinMB/chosenpath/blob/main/CONTRIBUTING.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:text-primary-800 underline"
              >
                Contributor Guide
              </a>{" "}
              for contributor terms.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-montserrat font-semibold mb-3 text-primary-700">
            The Engine Roadmap
          </h2>
          <p className="text-sm text-primary-600">
            The plan is to extract the narrative engine into a standalone package
            (<code className="text-primary-700">chosenpath-engine</code>) so
            other projects can integrate interactive narrative capabilities
            without forking the full application. This is a priority — if you're
            interested in using the engine, get in touch to shape extraction
            priorities.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-montserrat font-semibold mb-3 text-primary-700">
            Get in Touch
          </h2>
          <div className="p-4 bg-primary-50 rounded-lg">
            <ul className="space-y-2 text-sm text-primary-600">
              <li>
                <strong>GitHub:</strong>{" "}
                <a
                  href="https://github.com/OdinMB/chosenpath"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-800 underline"
                >
                  OdinMB/chosenpath
                </a>{" "}
                — issues, discussions, contributions
              </li>
              <li>
                <strong>Website:</strong>{" "}
                <a
                  href="https://odins.website"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-800 underline"
                >
                  odins.website
                </a>
              </li>
              <li>
                <strong>LinkedIn:</strong>{" "}
                <a
                  href="https://www.linkedin.com/in/odinmuehlenbein/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-800 underline"
                >
                  Odin Mühlenbein
                </a>
              </li>
              <li>
                <strong>Support Us:</strong>{" "}
                <a
                  href="https://ko-fi.com/OdinMB"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-800 underline"
                >
                  ko-fi.com/OdinMB
                </a>
              </li>
            </ul>
          </div>
        </section>
      </div>

      <Footer />
    </div>
  );
}
