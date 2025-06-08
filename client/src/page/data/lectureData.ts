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
    content: `
      <p class="mb-4">
        asdf
      </p>
      <p class="mb-4">
        adsf
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
