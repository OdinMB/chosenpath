import { Footer } from "../components/Footer";

export function ForTherapists() {
  return (
    <div className="max-w-2xl mx-auto p-4 font-lora">
      <h1 className="text-2xl font-montserrat font-semibold mb-6 text-primary-800">
        Chosen Path and Narrative Therapy
      </h1>

      <div className="space-y-6">
        <section>
          <p className="mb-4">
            Chosen Path has connections to narrative therapy:
            externalization, re-authoring, perspective-taking. The platform
            already lets people step into unfamiliar roles, confront dilemmas
            through fictional characters, or experience a possible future as a
            story rather than an abstract idea.
          </p>
          <p>
            I'm not a therapist. I don't know if or how this could be useful in
            clinical practice. Maybe it's a natural fit for some approaches. I'd
            love to collaborate with experts to find out!
          </p>
        </section>

        <div className="my-8">
          <img
            src="/landing/protective-bubble.jpeg"
            alt="A person in a protective bubble, surrounded by nature"
            className="w-full rounded-lg object-cover"
          />
        </div>

        <section>
          <h2 className="text-lg font-montserrat font-semibold mb-3 text-primary-700">
            What the platform can do
          </h2>
          <div className="space-y-4">
            <div className="p-4 bg-primary-50 rounded-lg">
              <h3 className="text-md font-montserrat font-bold mb-1">
                Custom scenarios
              </h3>
              <p className="text-primary-600">
                You describe the situation, characters, and emotional tone. The
                AI builds an interactive story around that. Every scenario is
                generated fresh. You can save setups as templates if you want to
                reuse them.
              </p>
            </div>
            <div className="p-4 bg-primary-50 rounded-lg">
              <h3 className="text-md font-montserrat font-bold mb-1">
                Narrative distance
              </h3>
              <p className="text-primary-600">
                People engage with challenges through characters, not as
                themselves. That might create a useful kind of safety for
                exploring difficult topics. That's a hypothesis, not a claim.
              </p>
            </div>
            <div className="p-4 bg-primary-50 rounded-lg">
              <h3 className="text-md font-montserrat font-bold mb-1">
                Future-self scenarios
              </h3>
              <p className="text-primary-600">
                One of the existing categories lets people describe a possible
                future and then live through it as a story. What does daily life
                look like? What tradeoffs come up? Coaches already use this. It
                might have therapeutic applications too.
              </p>
            </div>
          </div>
        </section>

        <div className="my-8">
          <img
            src="/landing/enter-door.jpeg"
            alt="A person opening a door to a new world"
            className="w-full rounded-lg object-cover"
          />
        </div>

        <section>
          <h2 className="text-lg font-montserrat font-semibold mb-3 text-primary-700">
            What I'm looking for
          </h2>
          <p className="mb-4 text-primary-600">
            I'd love to hear from narrative therapists, clinical psychologists,
            or researchers who find this interesting. Whether that means
            exploring a collaboration, running a pilot, or just telling me why
            it wouldn't work. The platform is{" "}
            <a
              href="https://github.com/OdinMB/chosenpath"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 hover:text-primary-800 underline"
            >
              open-source
            </a>{" "}
            and can be self-hosted for privacy-sensitive contexts.
          </p>
          <p className="text-primary-600">
            If you want to get a feel for it, try a{" "}
            <a
              href="/setup?step=3&category=see-your-future-self&players=1&images=true"
              className="text-primary-600 hover:text-primary-800 underline"
            >
              future-self scenario
            </a>{" "}
            or look at the{" "}
            <a
              href="/academy"
              className="text-primary-600 hover:text-primary-800 underline"
            >
              Worldbuilding Academy
            </a>{" "}
            to see how story worlds are set up. Then get in touch. I'm at{" "}
            <a
              href="https://odins.website"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 hover:text-primary-800 underline"
            >
              odins.website
            </a>{" "}
            or on{" "}
            <a
              href="https://www.linkedin.com/in/odinmuehlenbein/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 hover:text-primary-800 underline"
            >
              LinkedIn
            </a>
            .
          </p>
        </section>

        <div className="my-8">
          <img
            src="/landing/people-over-map.jpeg"
            alt="Two people looking at a map together"
            className="w-full rounded-lg object-cover"
          />
        </div>
      </div>

      <Footer />
    </div>
  );
}
