import { DiscordButton } from "../../shared/components/DiscordButton";

export function ForStorytellers() {
  return (
    <div className="max-w-2xl mx-auto p-4 font-lora">
      <h1 className="text-2xl font-montserrat font-semibold mb-6 text-primary-800">
        For Storytellers
      </h1>

      <div className="space-y-6">
        <section>
          <p className="mb-4">
            Experience a new way of telling interactive stories. With Chosen
            Path, you can create dynamic and branching narratives without having
            to write 20,000 words for a 3,000-word experience.
          </p>
          <p className="mb-4">
            Instead, you define a <strong>story environment</strong> with rules,
            characters, conflicts, mechanics, and possible endings. Focus on
            world-building and creative vision and let the AI handles the
            complex task of weaving together compelling narratives that respond
            to player choices in real-time.
          </p>
          <p className="mb-4">
            And don't forget: Chosen Path allows you to create multiplayer
            stories. A whole new way to design and experience interactive
            fiction!
          </p>
          <div className="my-6 overflow-hidden rounded-lg">
            <img
              src="/create-worlds.jpg"
              alt="Create your own worlds"
              className="w-full object-cover"
            />
          </div>
          <h2 className="text-lg font-montserrat font-semibold mt-6 mb-3 text-primary-700">
            Learn How to Create Your Own Worlds
          </h2>
          <p className="mb-4">
            Watch our comprehensive tutorial series to master the art of world
            creation on Chosen Path:
          </p>
          <div className="space-y-4">
            <div className="p-4 bg-primary-50 rounded-lg">
              <h3 className="text-md font-montserrat font-bold mb-2">
                <a
                  href="https://www.loom.com/share/1b12f539294f441a9ca3209de5467b9a"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  Part 1/2: Playing Your Story, Guidelines, Media, Story
                  Elements
                </a>
              </h3>
              <p className="text-sm text-primary-600">
                Learn the fundamentals of setting up your story, defining
                guidelines, incorporating media, and creating compelling story
                elements that engage your players.
              </p>
            </div>

            <div className="p-4 bg-primary-50 rounded-lg">
              <h3 className="text-md font-montserrat font-bold mb-2">
                <a
                  href="https://www.loom.com/share/b350dbd863d2475c880723515807812a"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  Part 2/2: Switches/Threads/Outcomes, Players, AI Features
                </a>
              </h3>
              <p className="text-sm text-primary-600">
                Dive deeper into advanced features like switches, threads,
                outcomes, player management, and AI-powered storytelling tools
                that make your worlds truly dynamic.
              </p>
            </div>
          </div>
          <h2 className="text-lg font-montserrat font-semibold mt-8 mb-3 text-primary-700">
            Ready to start creating?
          </h2>
          <p className="mb-4">
            Sign up for an account to unlock advanced storytelling features and
            start building your own interactive worlds today.
          </p>
          <p className="mb-4">
            Have questions about world-building or need help getting started?
            Join our Discord community where storytellers share tips, ask
            questions, and collaborate on creating amazing interactive
            experiences.
          </p>
          <div className="flex justify-center">
            <DiscordButton
              variant="primary"
              showText={true}
              className="px-6 py-3"
            />
          </div>
        </section>
      </div>
    </div>
  );
}
