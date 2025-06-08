export interface Lecture {
  id: string;
  title: string;
  summary: string;
  imagePath: string; // Path to image in public/academy/
  videoEmbedUrl?: string; // Optional embedded video URL
  content: string; // Full lecture content
}

export const lectures: Lecture[] = [
  {
    id: "story-engine-not-writing-tool",
    title: "Story Engine, not Writing Tool",
    summary:
      "The core idea behind Chosen Path. You don't write 30,000 words. Instead, you create a World with characters, conflicts, mechanics, possible endings — and let AI take care of the rest.",
    imagePath: "/academy/story-engine.jpeg",
    videoEmbedUrl:
      "https://iframe.mediadelivery.net/embed/451846/87b071d2-d8dd-490d-a082-9379c2a5b4d9?autoplay=false&loop=false&muted=false&preload=false&responsive=true",
    content: `
      <p class="mt-4 mb-4">
        Chosen Path is not a writing tool. It's a <strong>story engine</strong>.
      </p>
      <p class="mb-4">
        You don't write 30,000 words and manage intricate logic in a
        scripting language. Instead, you create compelling story
        environments — or <strong>Worlds</strong>, as we call them. A World defines
        characters, locations, conflicts, mechanics, stats, pacing,
        tonality, possible endings, directions for images, and, if you want,
        a whole range of other details. You set the creative vision for the
        stories that happen in your World.
      </p>
      <p class="mb-4">
        The engine takes care of the rest: writing the prose, generating and
        reacting to player choices, adjusting stats, producing images, etc.
        Chosen Path can even manage <strong>multiplayer stories</strong>,
        which opens up a whole new way to design and experience interactive
        fiction. It also has an <strong>AI Worldbuilding Assistant</strong> that can help you iterate and fill in the details of your Worlds in seconds.
      </p>
      <p class="mb-4">
        This makes the platform intereting for different types of creators:
      </p>
      <ul class="list-disc list-inside space-y-3 ml-4 mb-4">
        <li>
          <strong>Architects</strong> love crafting settings and mechanics and don't want to write entire books and story logic to turn their creations into interactive fiction. Architects use every feature available to create Worlds that work exactly as they want them to.
        </li>
        <li>
          <strong>Dreamers</strong> want to test new ideas quickly. They use the AI Worldbuilding Assistant to create playable experiences in minutes.
        </li>
        <li>
          <strong>Game Designers</strong> create multiplayer experiences without having to manage story trees that are even larger than for single-player stories.
        </li>
        <li>
          <strong>Satirists</strong> see the absurd and unjust in the world. They create short, interactive experiences that highlight these issues. (See our <a href="/library?tags=Satire" target="_blank" style=>Library</a> for examples.)
        </li>
        <li>
          <strong>Futurists</strong> bring their scenarios to life without having to know anything about the intricacies of interactive fiction.
        </li>
        <li>
          <strong>Teachers</strong> use Chosen Path to teach students about storytelling and to create interactive simulations (History, Social Studies, Politics).
        </li>
      </ul>
    `,
  },

  {
    id: "outcomes-milestones-resolutions",
    title: "The Drivers: Outcomes, Milestones, Resolutions",
    summary:
      'Outcomes are questions that stories in your World will answer. ("Will the crew find the treasure?") Learn how to define Outcomes and how they drive your stories forward.',
    imagePath: "/academy/outcomes-resolutions.jpeg",
    videoEmbedUrl:
      "https://iframe.mediadelivery.net/embed/451846/a804a0a4-fe1f-45d7-bd14-1b5f8b0e6b3f?autoplay=false&loop=false&muted=false&preload=false&responsive=true",
    content: `
      <p class="mt-4 mb-4">
        <strong>Stories answer questions.</strong>
      </p>
      <p class="mb-4">
        At the heart of every engaging story in your World lies a set of <strong>Outcomes</strong> — central questions that drive the narrative forward and determine how the story will end.
      </p>
      
      <h3 class="text-lg font-semibold mb-3 mt-6">Outcomes and Resolutions</h3>
      <p class="mb-4">
        Consider this example from our sample World "Goblin Rights Now!":
      </p>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
        <p class="mb-2"><strong>Outcome:</strong> Will the Hero Guilds reform their anti-goblin policies?</p>
        <p class="mb-2"><strong>Possible Resolutions:</strong></p>
        <ul class="list-disc list-inside space-y-2 ml-4">
          <li><strong>Favorable:</strong> The Hero Guilds adopt new codes that protect goblin rights and punish violence against them.</li>
          <li><strong>Mixed:</strong> Some reforms are enacted, but enforcement is weak and many heroes resist change.</li>
          <li><strong>Unfavorable:</strong> The Hero Guilds double down on anti-goblin violence, forcing goblins further underground.</li>
        </ul>
      </div>

      <h3 class="text-lg font-semibold mb-3 mt-6">Resolving Outcomes</h3>
      <p class="mb-4">
        <strong>Milestones</strong> get us closer to an answer. They are the significant moments that move the story toward one resolution or another.
      </p>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
        <p class="mb-4">
          <strong>Outcome:</strong> "Will the Hero Guilds reform their anti-goblin policies?"
        </p>
        <ul class="list-disc list-inside space-y-2 ml-4">
          <li><strong>Milestone 1 - Unfavorable:</strong> Sir Bram doesn't budge.</li>
          <li><strong>Milestone 2 - Favorable:</strong> Protests happen in Elderglen.</li>
        </ul>
      </div>
      <p class="mb-4">
        Outcomes can have 2-4 milestones. The more milestones an Outcome has, the more weight it has in the story.
      </p>

      <h3 class="text-lg font-semibold mb-3 mt-6">How Milestones are Added</h3>
      <p class="mb-4">
        Milestones are added after each mini-chapter (called a <strong>Thread</strong>). See the lecture "Narrative Structure: Switches and Threads" for more details. Here's the basic flow:
      </p>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
        <ol class="list-decimal list-inside space-y-3 ml-4">
          <li><strong>Switch:</strong> 1 Beat to find out what the next mini-chapter will be<br/>
          <em>Example: Meet Sir Bram, leader of the local Hero Guild</em></li>
          <li><strong>Thread:</strong> 2-4 Beats to find out which Milestone will be added<br/>
          <em>Example: Rikkit fails to convince Sir Bram.</em></li>
          <li><strong>Milestone:</strong> The result is recorded<br/>
          <em>Example: Unfavorable: Sir Bram keeps the anti-Goblin policies of his Guild in place.</em></li>
        </ol>
      </div>

      <h3 class="text-lg font-semibold mb-3 mt-6">Shared vs. Player Outcomes</h3>
      <p class="mb-4">
        Outcomes come in two types:
      </p>
      <ul class="list-disc list-inside space-y-3 ml-4 mb-4">
        <li><strong>Shared Outcomes</strong> apply to all players in the story. These address the big questions that affect everyone. You can adjust these in the <strong>"Outcomes" tab</strong> in the Worldbuilding interface.</li>
        <li><strong>Player Outcomes</strong> only apply to a single player. These focus on individual character arcs and personal stakes. You can adjust these in the <strong>"Players" tab</strong> in the Worldbuilding interface.</li>
      </ul>
      <p class="mb-4">
        We will discuss Shared Outcomes in more detail in the lecture on Multiplayer.
      </p>

      <h3 class="text-lg font-semibold mb-3 mt-6">Recommended Structure</h3>
      <p class="mb-4">
        For a story with <strong>25 Beats</strong>, we recommend having <strong>3 Outcomes</strong> per player (among Shared and Player Outcomes) with a total of approximately <strong>7 Milestones</strong>. This provides enough narrative momentum without overwhelming the story structure.
      </p>

      <h3 class="text-lg font-semibold mb-3 mt-6">Key Concepts Summary</h3>
      <ul class="list-disc list-inside space-y-3 ml-4 mb-4">
        <li><strong>Outcome:</strong> A question that will define the ending of the story</li>
        <li><strong>Resolution:</strong> The answer to that question</li>
        <li><strong>Milestone:</strong> A step towards an Outcome's Resolution</li>
        <li><strong>Thread:</strong> Mini-chapter that establishes a Milestone</li>
      </ul>

      <h3 class="text-lg font-semibold mb-3 mt-6">Design Tip: Balance Outcomes for richer and more engaging stories</h3>
      <p class="mb-4">
        In our sample World "Goblin Rights Now!", the AI Worldbuilding Assistant had defined three Outcomes that were all directly related to the characters' activist struggle. We kept the main Outcome about the Hero Guilds' policy changes, but replaced the other two with questions about the main character's self-identity and relationships. This way, stories in our World explore both the <strong>public</strong> (social reform) and <strong>private</strong> (personal journey) sides of our activist characters.
      </p>
    `,
  },
  {
    id: "switches-threads",
    title: "Narrative Structure: Switches and Threads",
    summary:
      "Tweak the structure and pacing of stories. A Switch gives players control over the next Thread. A Thread is a mini-chapter that establishes a Milestone and brings an Outcome closer to its resolution.",
    imagePath: "/academy/switches-threads.jpeg",
    content: `
      <p class="mb-4">
        asdf
      </p>
      <p class="mb-4">
asdf
      </p>
    `,
  },
  {
    id: "setting",
    title: "The Setting: Breath Life Into Your World",
    summary:
      "Define both high-level guidelines (world, tonality, types of conflicts) and concrete elements for your World (characters, locations, factions, rumors, etc.)",
    imagePath: "/academy/setting.jpeg",
    content: `
      <p class="mb-4">
        Coming soon
      </p>
    `,
  },
  {
    id: "success-failure",
    title: "Success and Failure: Gameplay Mechanics",
    summary:
      "Understand how Chosen Path determines chances of success and failure, and how you can use difficulty levels and Stats to tweak these systems.",
    imagePath: "/academy/success-failure.jpeg",
    content: `
      <p class="mb-4">
        Coming soon
      </p>
    `,
  },
  {
    id: "stats",
    title: "Stats Model the World",
    summary:
      "From the integrity of a spaceship to the relationship between two characters: Stats tell the AI what to monitor and integrate into your stories.",
    imagePath: "/academy/stats.jpeg",
    content: `
      <p class="mb-4">
        Coming soon
      </p>
    `,
  },
  {
    id: "multiplayer",
    title: "Multiplayer",
    summary: "Features are available, lecture coming soon",
    imagePath: "/academy/multiplayer.jpeg",
    content: `
      <p class="mb-4">
        Coming soon
      </p>
    `,
  },
  {
    id: "images",
    title: "Images",
    summary: "Features are available, lecture coming soon",
    imagePath: "/academy/images.jpeg",
    content: `
      <p class="mb-4">
        Coming soon
      </p>
    `,
  },
];

export function getLectureById(id: string): Lecture | undefined {
  return lectures.find((lecture) => lecture.id === id);
}

export function getLectureSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
