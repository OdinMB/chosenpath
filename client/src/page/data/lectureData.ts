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
    videoEmbedUrl:
      "https://iframe.mediadelivery.net/embed/451846/084d81c6-65a9-4a7d-a763-1f706a24a847?autoplay=false&loop=false&muted=false&preload=false&responsive=true",
    content: `
      <p class="mt-4 mb-4">
        <strong>Switches give players control over the direction of the story.</strong>
      </p>
      <p class="mb-4">
        Understanding how Switches and Threads work together is key to creating engaging, player-driven narratives in your World. Let's break down how this system creates meaningful choice and narrative momentum.
      </p>

      <h3 class="text-lg font-semibold mb-3 mt-6">The Basic Flow: Switch → Thread → Milestone</h3>
      <p class="mb-4">
        As we learned in the previous lecture, Milestones are added after each mini-chapter (Thread). Here's how it works:
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

      <h3 class="text-lg font-semibold mb-3 mt-6">Two Types of Switches</h3>
      <p class="mb-4">
        There are two types of Switches that give players different kinds of control:
      </p>

      <h4 class="text-md font-semibold mb-2 mt-4">Topic Switch</h4>
      <p class="mb-2">
        <strong>Which Outcome should we drive toward a Resolution next?</strong>
      </p>
      <div class="bg-blue-50 p-3 rounded-lg mb-4">
        <ul class="list-disc list-inside space-y-1 ml-4">
          <li>Meet Sir Bram, leader of the Hero Guild</li>
          <li>Print posters to identify supporters</li>
          <li>Prepare a hideout in case things get ugly</li>
        </ul>
      </div>
      <p class="mb-4">
        <strong>Topic Switches give the player more freedom.</strong> They are provided to the player whenever possible.
      </p>

      <h4 class="text-md font-semibold mb-2 mt-4">Flavor Switch</h4>
      <p class="mb-2">
        <strong>How should the next Thread for a predefined Outcome look like?</strong>
      </p>
      <div class="bg-green-50 p-3 rounded-lg mb-4">
        <ul class="list-disc list-inside space-y-1 ml-4">
          <li>Show up to the trial</li>
          <li>Organize a protest to stop the trial</li>
          <li>Escape the trial</li>
        </ul>
      </div>

      <h3 class="text-lg font-semibold mb-3 mt-6">When Flavor Switches Are Generated</h3>
      <p class="mb-4">
        Flavor Switches are generated in three specific scenarios:
      </p>
      <ul class="list-disc list-inside space-y-3 ml-4 mb-4">
        <li><strong>Urgency:</strong> Something happened that requires the character's immediate attention.<br/>
        <em>Example: Someone launches a personal attack on Rikkit. The next Thread must address this.</em></li>
        <li><strong>Continuation:</strong> Narratively, we simply must follow up on the previous Thread.<br/>
        <em>Example: After seizing the Hero Guild, we must address the aftermath.</em></li>
        <li><strong>Missing Milestones:</strong> The story is coming to an end, and an Outcome is still missing Milestones.</li>
      </ul>

      <h3 class="text-lg font-semibold mb-3 mt-6">Two Types of Threads</h3>
      <p class="mb-4">
        Threads can be either exploratory or focused on success vs. failure:
      </p>

      <h4 class="text-md font-semibold mb-2 mt-4">Exploration Thread</h4>
      <p class="mb-2">
        <strong>Resolution depends on player preferences</strong>
      </p>
      <ul class="list-disc list-inside space-y-2 ml-4 mb-4">
        <li>Peaceful protest, civil disobedience, or violent sabotage?</li>
        <li>How does Rikkit feel about their actions?</li>
        <li>Which allies does Rikkit want to engage?</li>
      </ul>

      <h4 class="text-md font-semibold mb-2 mt-4">Challenge Thread</h4>
      <p class="mb-2">
        <strong>Resolution is a matter of success vs. failure</strong>
      </p>
      <ul class="list-disc list-inside space-y-2 ml-4 mb-4">
        <li>Does Rikkit mobilize enough support for a rally?</li>
        <li>Does Rikkit convince Zelda to join the movement?</li>
      </ul>

      <h3 class="text-lg font-semibold mb-3 mt-6">Thread Beat Progression</h3>
      <p class="mb-4">
        Threads come with a <strong>pre-defined beat progression</strong>. The progression is laid out by the AI before the first beat of the Thread is generated.
      </p>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
        <p class="mb-2"><strong>Example Thread: "Meet Sir Bram"</strong></p>
        <ol class="list-decimal list-inside space-y-2 ml-4">
          <li>What is Sir Bram's first impression of Rikkit?</li>
          <li>Does Rikkit find leverage in the negotiation?</li>
          <li>Does Rikkit convince Sir Bram?</li>
        </ol>
        <p class="mt-3"><em>After Beat 3: Milestone is added</em></p>
        <p class="mt-2"><em>Beats 1-3 build momentum toward the Thread's climax.</em></p>
      </div>

      <h3 class="text-lg font-semibold mb-3 mt-6">Fine-tuning Switches and Threads</h3>
      <p class="mb-4">
        You can control the flow of your stories by adjusting several aspects:
      </p>
      <ul class="list-disc list-inside space-y-3 ml-4 mb-4">
        <li><strong>Selection of potential Threads:</strong> <em>Public protests, secret negotiations, public speeches, ...</em></li>
        <li><strong>Variety:</strong> <em>Alternate between public action Threads and private, personal Threads.</em></li>
        <li><strong>Length:</strong> <em>As a default, keep the length of personal Threads to 2 beats.</em></li>
        <li><strong>Sequencing:</strong> <em>If the player ever gets hurt physically, the next Thread must be about healing their wounds.</em></li>
        <li><strong>Surprises:</strong> <em>Around beat 13-16 / 25, introduce a personal attack on the player (social or physical).</em></li>
      </ul>

      <h3 class="text-lg font-semibold mb-3 mt-6">Key Concepts Summary</h3>
      <ul class="list-disc list-inside space-y-3 ml-4 mb-4">
        <li><strong>Topic Switches</strong> allow players to choose which Outcome should be addressed. They are offered to the player whenever possible.</li>
        <li><strong>Flavor Switches</strong> allow players to choose how a predefined Outcome should be addressed. They are offered to the player if we cannot give the player control over the topic of the next Thread.</li>
        <li><strong>Challenge Threads</strong> are a matter of success vs. failure.</li>
        <li><strong>Exploration Threads</strong> are not.</li>
        <li><strong>Threads</strong> come with pre-defined beat progressions and end with new Milestones.</li>
      </ul>

      <h3 class="text-lg font-semibold mb-3 mt-6">Design Tip: Provide Different Ways for Players Engage with your World</h3>
      <p class="mb-4">
        In our sample World "Goblin Rights Now!", we expanded the list of possible Threads to include encounters with friends and maybe even romantic interests. We also allowed violent protests as a viable strategy for the activists.
      </p>
      <h3 class="text-lg font-semibold mb-3 mt-6">Design Tip: Think about Pacing</h3>
      <p class="mb-4">
        We instructed the AI to make personal Threads shorter than public Threads (2 vs. 3 Beats by default), and to switch between public activist Threads and personal Threads about reflections and relationships. That way, the focus is still on the activist struggle, with personal Threads acting as breathers.
      </p>
    `,
  },
  {
    id: "setting",
    title: "The Setting: Breath Life Into Your World",
    summary:
      "Define both high-level guidelines (world, tonality, types of conflicts) and concrete elements for your World (characters, locations, factions, rumors, etc.)",
    imagePath: "/academy/setting.jpeg",
    videoEmbedUrl:
      "https://iframe.mediadelivery.net/embed/451846/f3b033df-c045-4ff0-8698-349b787ef63c?autoplay=false&loop=false&muted=false&preload=false&responsive=true",
    content: `
      <p class="mt-4 mb-4">
        Your World's setting consists of three main components: <strong>Guidelines</strong> that establish the high-level framework, <strong>Story Elements</strong> that populate your world with specific details, and <strong>Player Identities and Backgrounds</strong> that represent starting points for the players in your story.
      </p>

      <h3 class="text-lg font-semibold mb-3 mt-6">Guidelines</h3>
      <p class="mb-4">
        Guidelines flesh out the premise and provide key instructions to the AI about how stories in your World should unfold. They establish the foundation upon which all narratives will be built.
      </p>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
        <p class="mb-3"><strong>The World and its Rules.</strong> Define the fundamental laws and social structures that govern your world. These rules create the constraints and opportunities that drive conflict.<br/>
        <em>Heroes are legally permitted to kill goblins for fame and fortune.</em></p>
        
        <p class="mb-3"><strong>Tonality.</strong> Set the emotional atmosphere and narrative voice for your stories. Tonality guides how the AI approaches dialogue, descriptions, and the overall feel of the experience.<br/>
        <em>Moments of dark humor and satire, especially regarding the hypocrisy of 'heroic' culture.</em></p>
        
        <p class="mb-3"><strong>Conflicts and Decisions.</strong> Identify the core dilemmas that characters will face repeatedly throughout stories in your World. These aren't specific plot points, but rather the types of moral and strategic choices that define your setting.<br/>
        <em>Deciding when to compromise and when to stand firm.</em></p>
        
        <p class="mb-3"><strong>Types of Scenes.</strong> Specify the kinds of dramatic situations that should appear in your stories. This helps the AI understand what sorts of Threads to generate and ensures variety in the narrative experience.<br/>
        <em>Public protest or demonstration; Secret negotiation with a powerful figure.</em></p>
        
        <p class="mb-0"><strong>Pacing.</strong> Provide instructions for how the AI should structure the flow of events across multiple Threads. Good pacing guidelines help create emotional rhythm and prevent stories from becoming monotonous.<br/>
        <em>Alternate between public action Threads and private, personal Threads.</em></p>
      </div>

      <h3 class="text-lg font-semibold mb-3 mt-6">Story Elements</h3>
      <p class="mb-4">
        <strong>Story Elements add specific ingredients to your World.</strong>
      </p>
      <p class="mb-4">
        Characters, locations, items, rumors, factions, events, phenomena, ... You define an initial set of elements. The AI will add additional elements as needed as the story progresses.
      </p>

      <h4 class="text-md font-semibold mb-2 mt-4">Example: Gruk</h4>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
        <p class="mb-2"><strong>Role:</strong> Leader of the largest goblin enclave in the city, Gruk is a pragmatic organizer who sometimes clashes with more radical activists.</p>
        <p class="mb-2"><strong>Instructions to the AI:</strong> Gruk can mobilize goblins for protests or provide sanctuary, but expects loyalty and dislikes reckless risks.</p>
        <p class="mb-2"><strong>Appearance (optional, also used for images):</strong> A broad-shouldered goblin with a missing ear, intricate tattoos, and a commanding presence.</p>
        <p class="mb-2"><strong>Facts (AI adds more as the story progresses):</strong> Has a secret truce with a local hero, which he keeps hidden from most goblins.</p>
      </div>

      <h3 class="text-lg font-semibold mb-3 mt-6">Player Characters</h3>
      <p class="mb-4">
        Player characters are defined by <strong>Identities</strong> and <strong>Backgrounds</strong>.
      </p>
      <ul class="list-disc list-inside space-y-3 ml-4 mb-4">
        <li><strong>Identities:</strong> pronouns, appearance, mannerisms</li>
        <li><strong>Backgrounds:</strong> initial stats (see the video on Stats for more details), the role of the character in the World</li>
      </ul>
      <p class="mb-4">
        Each player chooses one Identity and one Background.
      </p>

      <h3 class="text-lg font-semibold mb-3 mt-6">Summary</h3>
      <ul class="list-disc list-inside space-y-3 ml-4 mb-4">
        <li><strong>Guidelines</strong> contain high-level descriptions about the world and the conflicts in the story, as well as instructions for scenes and pacing.</li>
        <li><strong>Story Elements</strong> define an initial set of characters, locations, items, rumors, etc.</li>
        <li><strong>Player Identities and Backgrounds</strong> define starting points for the player characters.</li>
      </ul>
    `,
  },
  {
    id: "success-failure",
    title: "Success and Failure: Gameplay Mechanics",
    summary:
      "Understand how Chosen Path determines chances of success and failure, and how you can use difficulty levels and Stats to tweak these systems.",
    imagePath: "/academy/success-failure.jpeg",
    videoEmbedUrl:
      "https://iframe.mediadelivery.net/embed/451846/a92ef20f-e07a-49e6-8f0e-ec925011b47f?autoplay=false&loop=false&muted=false&preload=false&responsive=true",
    content: `
      <p class="mb-4">
        Coming soon
      </p>
    `,
  },
  {
    id: "stats",
    title: "Stats: Modeling the World",
    summary:
      "From the integrity of a spaceship to the relationship between two characters: Stats tell the AI what your stories are about, what to monitor, and how to influence chances of success and failure.",
    imagePath: "/academy/stats.jpeg",
    videoEmbedUrl:
      "https://iframe.mediadelivery.net/embed/451846/a74529eb-f935-4084-9f07-c35ff3e774c1?autoplay=false&loop=false&muted=false&preload=false&responsive=true",
    content: `
      <p class="mb-4">
        Coming soon
      </p>
    `,
  },
  {
    id: "multiplayer",
    title: "Multiplayer",
    summary: "Features are available. Lecture is coming soon.",
    imagePath: "/academy/multiplayer.jpeg",
    content: `
      <p class="mb-4">
        Multiplayer features are available. Lecture is coming soon.
      </p>
    `,
  },
  {
    id: "images",
    title: "Images",
    summary: "Features are available. Lecture is coming soon.",
    imagePath: "/academy/images.jpeg",
    content: `
      <p class="mb-4">
        Image features are available. Lecture is coming soon.
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
