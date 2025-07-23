import {
  LandingSection,
  LandingBenefit,
  LandingHero,
  LandingFAQ,
  LandingProcess,
  Footer,
  Carousel,
} from "../components";

export function ForCoaches() {
  const exampleScenarios = [
    {
      title: "Career Transition Anxiety",
      currentSituation: "35-year-old investment banker in Mumbai, financially secure, working long hours",
      challenge:
        "Leaving high-paying finance to join Teach for India, moving to rural Maharashtra for education work",
      insights:
        "How does it feel to explain the career change to family? What daily realities of rural life feel manageable vs. overwhelming? Which aspects of teaching bring genuine fulfillment vs. frustration?",
    },
    {
      title: "Relationship Decision Making",
      currentSituation:
        "34-year-old in Osaka, 7-year relationship that's stable but emotionally unfulfilling",
      challenge:
        "Breaking engagement to explore independence and personal identity",
      insights:
        "What does independence feel like day-to-day? How do family and social pressures affect daily mood and decisions? Which aspects of single life bring liberation vs. loneliness?",
    },
  ];

  const benefits = [
    {
      imageSrc: "/landing/enter-door.jpeg",
      title: "Coachees Need to Experience, Not Just Discuss",
      description:
        "Use Chosen Path to let your coachees experience different scenarios — career transitions, relationship changes, relocations — and discover how they truly feel about each path.",
    },
    {
      imageSrc: "/landing/digging-deep.jpeg",
      title: "You Want Deeper Insights",
      description:
        "Even deep coaching conversations often miss emotional reactions and overlooked concerns. Chosen Path transforms vague scenarios into fully fleshed-out story worlds, revealing authentic responses and helping you identify blind spots.",
    },
    {
      imageSrc: "/landing/protective-bubble.jpeg",
      title: "You Need Safe Spaces for High-Stakes Decisions",
      description:
        "Major life changes feel overwhelming because the stakes are so high. Our AI creates low-risk environments where coachees can get a feel for different scenarios.",
    },
  ];

  const process = [
    {
      number: 1,
      title: "Identify Scenarios with Your Coachee",
      description:
        "Together, explore potential life changes — career pivots, relationship decisions, geographic moves. Choose which scenario to explore through interactive storytelling.",
      imageSrc: "/landing/people-over-map.jpeg",
    },
    {
      number: 2,
      title: "Quick Setup or Custom World Creation",
      description: (
        <>
          Send your coachee directly to our{" "}
          <a
            href="/setup?step=3&category=see-your-future-self&players=1&images=true"
            className="text-link"
          >
            quick setup page
          </a>{" "}
          for immediate exploration, or <a href="/users/signin" className="text-link">create a custom story World</a> with
          specific scenarios, challenges, and decision points tailored to their
          situation.
        </>
      ),
      imageSrc: "/academy/story-engine.jpeg",
    },
    {
      number: 3,
      title: "Debrief and Extract Insights",
      description:
        "Use the coachee's story experience as rich material for coaching conversations. Explore their emotional reactions, decision patterns, and surprising discoveries to guide real-world planning.",
      imageSrc: "/landing/treasure-chest.jpeg",
    },
  ];

  const faqs = [
    {
      question: "How does this differ from traditional coaching exercises?",
      answer:
        "Traditional coaching relies on hypothetical discussions and visualization exercises. Chosen Path creates immersive, interactive experiences where coachees face realistic challenges and make actual decisions, revealing authentic emotional responses and thought patterns.",
    },
    {
      question: "Is this complicated to set up?",
      answer: (
        <>
          Not at all! You can start immediately by sending coachees a link to
          the{" "}
          <a
            href="/setup?step=3&category=see-your-future-self&players=1&images=true"
            className="text-link"
          >
            setup page
          </a>
          . For more customized scenarios, our worldbuilding interface uses
          plain language descriptions — no technical skills required.
        </>
      ),
    },
    {
      question: "What about privacy and confidentiality?",
      answer:
        "Chosen Path has a data processing agreement with OpenAI, and data is not used for model training. However, Chosen Path does have access to story worlds and played stories.\n\nPlease ensure that no personal information (real names, specific companies, addresses, etc.) is used when creating coaching scenarios. Use fictional details while maintaining the emotional and structural authenticity of the situation.",
    },
    {
      question: "Can I customize scenarios for specific coaching goals?",
      answer: (
        <>
          Absolutely! You can <a href="/users/signin" className="text-link">create tailored story Worlds</a> that focus on your
          coachee's specific situation — whether that's career transition
          anxiety, relationship decision-making, or major life changes. Visit
          our{" "}
          <a href="/academy" className="text-link">
            Academy
          </a>{" "}
          to learn about advanced configuration options.
        </>
      ),
    },
    {
      question: "How do I integrate this into my coaching practice?",
      answer:
        "You can use Chosen Path as 'homework' between sessions — coachees explore scenarios on their own, then bring their experiences to the next coaching call for deeper discussion. Since a full story takes about 1 hour to complete, it's typically not ideal for use during coaching sessions themselves.",
    },
  ];

  return (
    <div className="max-w-2xl mx-auto p-4 font-lora">
      <LandingHero
        headline="Transform Coaching into Experiential Learning"
        subheadline="Chosen Path helps coaches create immersive scenarios where clients can safely explore major life decisions, discover authentic emotional responses, and gain deeper self-awareness through AI-powered interactive storytelling."
        ctaPrimary={{
          text: "Give It a Try",
          link: "/setup?step=3&category=see-your-future-self&players=1&images=true",
        }}
        // ctaSecondary={{
        //   text: "Learn More",
        //   link: "/academy",
        // }}
      />

      <div className="grid md:grid-cols-3 gap-6 md:gap-4 mb-12">
        {benefits.map((benefit, index) => (
          <LandingBenefit key={index} {...benefit} />
        ))}
      </div>

      <LandingSection title="How It Works">
        <LandingProcess steps={process} />
      </LandingSection>

      <LandingSection title="Examples for Your Practice">
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
                    Current Situation:{" "}
                    <span className="font-normal">
                      "{scenario.currentSituation}"
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-primary-700">
                    Potential Change:{" "}
                    <span className="font-normal">{scenario.challenge}</span>
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-primary-700">
                    Aspects to Explore:{" "}
                    <span className="font-normal">{scenario.insights}</span>
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

      <LandingSection title="Ready to Enhance Your Coaching Practice?">
        <div className="bg-primary-50 p-8 rounded-lg">
          <p className="text-xl mb-6 text-primary-700">
            Join coaches who are transforming client conversations through
            experiential learning.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <a
              href="/setup?step=3&category=see-your-future-self&players=1&images=true"
              className="inline-block bg-accent text-white px-8 py-3 rounded-lg font-semibold hover:bg-accent-dark transition-colors"
            >
              Give It a Try
            </a>
            {/* <a
              href="/academy"
              className="inline-block bg-white text-primary-700 px-8 py-3 rounded-lg font-semibold border border-primary-200 hover:bg-primary-50 transition-colors"
            >
              Learn More
            </a> */}
          </div>
        </div>
      </LandingSection>

      <Footer />
    </div>
  );
}
