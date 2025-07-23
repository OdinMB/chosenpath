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
      learningGoals: "Hypothesis formation and data analysis",
      targetAudience: "elementary science students",
      instructions:
        "I'm a student wizard using the scientific method to solve why levitation spells keep failing - forming hypotheses, testing variables, and analyzing results...",
    },
    {
      learningGoals: "Market research and ethical sourcing",
      targetAudience: "high school business students",
      instructions:
        "We're starting an eco-friendly business together, collaborating on market research, cost analysis, and ethical sourcing decisions...",
    },
    {
      learningGoals: "Academic ethics and peer review",
      targetAudience: "college science students",
      instructions:
        "We're graduate students collaborating on research while competing for publication recognition...",
    },
  ];

  const benefits = [
    {
      imageSrc: "/landing/enter-door.jpeg",
      title: "Learners Need Active Participation",
      description:
        "Transform passive reading into active participation where learners make choices, solve problems, and experience consequences. Use multiplayer scenarios for collaborative learning — groups can work together on historical simulations, team problem-solving, or explore different perspectives on complex issues.",
    },
    {
      imageSrc: "/landing/digging-deep.jpeg",
      title: "You Need Ultimate Flexibility",
      description:
        "Stories adjust for language complexity, reading level, and cognitive load. Teach scientific method through wizard experiments, explore historical decision-making through crisis simulations, or practice reading comprehension through detective mysteries. The same learning framework works for elementary vocabulary or college-level ethics.",
    },
    {
      imageSrc: "/landing/protective-bubble.jpeg",
      title: "You Want Understanding, Not Memorization",
      description:
        "Students discover 'why' through lived experience — understanding historical motivations by facing the same dilemmas, grasping scientific concepts by testing hypotheses, or learning ethics by experiencing moral consequences firsthand.",
    },
  ];

  const process = [
    {
      number: 1,
      title: "Define Learning Goal, Audience, and Context",
      description:
        "Specify exactly what learners should achieve, who your target audience is (age group, experience level, subject), and any specific context the AI should consider — historical period, reading level, or learning objectives.",
      imageSrc: "/landing/people-over-map.jpeg",
    },
    {
      number: 2,
      title: "Quick Setup or Custom World Creation",
      description: (
        <>
          Send learners directly to our{" "}
          <a
            href="/setup?step=3&category=learn-something&players=1&images=true"
            className="text-link"
          >
            learning scenarios page
          </a>{" "}
          for immediate exploration, or{" "}
          <a href="/users/signin" className="text-link">
            create custom educational Worlds
          </a>{" "}
          tailored to your curriculum and learning objectives.
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
        "Unlike fixed educational games, Chosen Path creates dynamic, personalized learning experiences. Each learner's choices lead to unique outcomes, encouraging multiple playthroughs and deeper exploration of concepts.",
    },
    {
      question: "Is this complicated to set up?",
      answer: (
        <>
          Not at all! Simply share a story link with your learners — they can
          play immediately on their mobile phones, tablets, or computers. No
          accounts or downloads required. For custom content, our{" "}
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
          Absolutely! Educational story Worlds can be shared between educators,
          creating a collaborative resource library. Visit our{" "}
          <a href="/academy" className="text-link">
            Academy
          </a>{" "}
          to learn about sharing and collaboration features.
        </>
      ),
    },
  ];

  return (
    <div className="max-w-2xl mx-auto p-4 font-lora">
      <LandingHero
        headline="Transform Education Through Interactive Storytelling"
        subheadline="Chosen Path helps educators create immersive learning experiences where learners actively engage with curriculum through AI-powered interactive stories that adapt to different learning levels and educational goals."
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
                {scenario.learningGoals}
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
