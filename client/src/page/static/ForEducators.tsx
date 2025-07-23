import {
  LandingSection,
  LandingBenefit,
  LandingHero,
  LandingFAQ,
  LandingProcess,
  Footer,
  Carousel,
} from "../components";

export function ForEducators() {
  const exampleScenarios = [
    {
      title: "Magical Science Lab",
      learningGoals: "Hypothesis formation and data analysis",
      targetAudience: "elementary science students",
      instructions:
        "I'm a student wizard using the scientific method to solve why levitation spells keep failing - forming hypotheses, testing variables, and analyzing results...",
    },
    {
      title: "Eco-Entrepreneur Simulation",
      learningGoals: "Market research and ethical sourcing",
      targetAudience: "high school business students",
      instructions:
        "We're starting an eco-friendly business together, collaborating on market research, cost analysis, and ethical sourcing decisions...",
    },
    {
      title: "Government Campaign Challenge",
      learningGoals: "Media influence and coalition building",
      targetAudience: "high school government students",
      instructions:
        "We're competing campaign managers trying to get our candidate elected as student body president...",
    },
  ];

  const benefits = [
    {
      imageSrc: "/landing/enter-door.jpeg",
      title: "Learning Needs Engagement",
      description:
        "Learners enter an entire World around a topic, make choices, and experience consequences. In multiplayer scenarios, groups can even work together in historical simulations or experience moral dilemmas from different perspectives.",
    },
    {
      imageSrc: "/landing/fast-iteration2.jpeg",
      title: "You Want Flexibility",
      description:
        "Teach anything from basic reading comprehension to the scientific method. Finetune pedagogical instructions and add elements that will show up in the stories. Adjust language complexity and tonality to match your learners' needs.",
    },
    {
      imageSrc: "/landing/stories-out-of-open-book.jpeg",
      title: "We Learn through Stories",
      description:
        "Students remember historical motivations by facing the same dilemmas, or even version control for software development by managing the government codebase of the fictional city of Gitopia. Stories stick.",
    },
  ];

  const process = [
    {
      number: 1,
      title: "Define Learning Goals, Audience, and Context",
      description:
        "Specify what learners should understand (concepts, skills), who your target audience is (age group, experience level), and any context the AI should consider (historical period, reading level, elements you want to include in the stories).",
      imageSrc: "/landing/bulls-eye.jpeg",
    },
    {
      number: 2,
      title: "Customize the AI Draft",
      description: (
        <>
          Customize the initial draft by the AI Worldbuilding Assistant however
          you want. Modify the setting, game mechanics, difficulty, narrative
          style, instructions for images, and many other aspects.
        </>
      ),
      imageSrc: "/academy/story-engine.jpeg",
    },
    {
      number: 3,
      title: "Facilitate and Debrief",
      description:
        "Use the story experience for group discussions, reflection exercises, or assessment. Learners can share their choices and reflect on the learning embedded in their decisions.",
      imageSrc: "/landing/treasure-chest.jpeg",
    },
  ];

  const faqs = [
    {
      question: "How does this differ from traditional educational games?",
      answer:
        "There are amazing educational games out there. Their limitation: they only work for a specific learning goal for a specific audience. With Chosen Path, you can conjure up interactive stories for many different learning outcomes and easily adjust them to the needs of different audiences. Without any coding, hosting, etc.",
    },
    {
      question: "Is this complicated to set up?",
      answer: (
        <>
          Not at all! Simply share a story link with your learners — they can
          play immediately on their mobile phones, tablets, or computers. No
          accounts or downloads required. To customize your stories, our{" "}
          <a href="/users/signin" className="text-link">
            World-building interface
          </a>{" "}
          uses plain language descriptions — no technical skills required.
        </>
      ),
    },
    {
      question:
        "Can I adjust the language complexity for different reading levels?",
      answer:
        "Yes! Stories can be configured for different reading levels, vocabulary complexity, and cognitive load. The same educational scenario can be adapted for beginners through advanced learners.",
    },
    {
      question: "Can I share my educational Worlds with other educators?",
      answer: (
        <>
          Absolutely! Educational story Worlds can be shared between educators
          or even on the chosenpath.ai platform.
        </>
      ),
    },
  ];

  return (
    <div className="max-w-2xl mx-auto p-4 font-lora">
      <LandingHero
        headline="Bring Learning to Life Through Interactive Stories"
        subheadline="Chosen Path generates interactive stories tailored to your teaching goals. Created for classroom teachers, homeschool families, and professional trainers, it helps learners discover knowledge through experience — making education both effective and enjoyable."
        ctaPrimary={{
          text: "Give It a Try",
          link: "/setup?step=3&category=learn-something&players=1&images=true",
        }}
        ctaSecondary={{
          text: "Create Educational Materials",
          link: "/users/signin",
        }}
      />

      <div className="grid md:grid-cols-3 gap-6 md:gap-4 mb-12">
        {benefits.map((benefit, index) => (
          <LandingBenefit key={index} {...benefit} />
        ))}
      </div>

      <LandingSection title="How It Works">
        <LandingProcess steps={process} />
      </LandingSection>

      <LandingSection title="Educational Use Cases">
        <Carousel
          items={exampleScenarios.map((scenario, index) => (
            <div
              key={index}
              className="bg-white rounded-lg border border-primary-100 p-6 h-full"
            >
              <h4 className="font-semibold text-primary-800 mb-4 text-lg">
                {scenario.title}
              </h4>
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-primary-700">
                    Learning Goals:{" "}
                    <span className="font-normal">
                      {scenario.learningGoals}
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-primary-700">
                    Target Audience:{" "}
                    <span className="font-normal">
                      {scenario.targetAudience}
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-primary-700">
                    Example Scenario:{" "}
                    <span className="font-normal">{scenario.instructions}</span>
                  </p>
                </div>
              </div>
            </div>
          ))}
          showControls={exampleScenarios.length > 1}
          showDots={exampleScenarios.length > 1}
          className="mx-auto"
        />
      </LandingSection>

      <LandingSection title="Frequently Asked Questions">
        <LandingFAQ items={faqs} />
      </LandingSection>

      <LandingSection title="Ready to Enhance Your Educational Practice?">
        <div className="bg-primary-50 p-8 rounded-lg">
          <p className="text-xl mb-6 text-primary-700">
            Join educators who are transforming learning through interactive
            storytelling.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <a
              href="/setup?step=3&category=learn-something&players=1&images=true"
              className="inline-block bg-accent text-white px-8 py-3 rounded-lg font-semibold hover:bg-accent-dark transition-colors"
            >
              Give It a Try
            </a>
            <a
              href="/users/signin"
              className="inline-block bg-white text-primary-700 px-8 py-3 rounded-lg font-semibold border border-primary-200 hover:bg-primary-50 transition-colors"
            >
              Create Educational Materials
            </a>
          </div>
        </div>
      </LandingSection>

      <Footer />
    </div>
  );
}
