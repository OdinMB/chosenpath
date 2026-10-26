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
        This makes the platform interesting for different types of creators:
      </p>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
        <p class="mb-2"><strong>Architects</strong> use every advanced feature available to create Worlds that work exactly as they want them to.</p>
        <p class="mb-2"><strong>Dreamers</strong> want to test new ideas quickly. They use the AI Worldbuilding Assistant to create playable experiences in minutes.</p>
        <p class="mb-2"><strong>Game Designers</strong> create multiplayer experiences without having to manage story trees that are even larger than for single-player stories.</p>
        <p class="mb-2"><strong>Satirists</strong> see the absurd and unjust in the world. They create short, interactive experiences that highlight these issues. (See our <a href="/library?tags=Satire" target="_blank" style=>Library</a> for examples.)</p>
        <p class="mb-2"><strong>Futurists</strong> bring their scenarios to life without having to know anything about the intricacies of interactive fiction.</p>
        <p class="mb-2"><strong>Teachers</strong> use Chosen Path to teach students about storytelling and to create interactive simulations (History, Social Studies, Politics).</p>
        <p class="mb-0"><strong>Coaches</strong> help their clients envision their future selfs in detailed and realistic scenarios.</p>
      </div>
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
      <p class="mb-2"><strong>Outcome:</strong> "Will the Hero Guilds reform their anti-goblin policies?" Possible Resolutions:</p>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
        <p class="mb-2"><strong>Favorable:</strong> The Hero Guilds adopt new codes that protect goblin rights and punish violence against them.</p>
        <p class="mb-2"><strong>Mixed:</strong> Some reforms are enacted, but enforcement is weak and many heroes resist change.</p>
        <p class="mb-0"><strong>Unfavorable:</strong> The Hero Guilds double down on anti-goblin violence, forcing goblins further underground.</p>
      </div>

      <h3 class="text-lg font-semibold mb-3 mt-6">Resolving Outcomes</h3>
      <p class="mb-4">
        <strong>Milestones</strong> get us closer to an answer. They are the significant moments that move the story toward one resolution or another.
      </p>
      <p class="mb-4">
        <strong>Outcome:</strong> "Will the Hero Guilds reform their anti-goblin policies?"
      </p>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
        <p class="mb-2"><strong>Milestone 1 - Unfavorable:</strong> Sir Bram doesn't budge.</p>
        <p class="mb-0"><strong>Milestone 2 - Favorable:</strong> Protests happen in Elderglen.</p>
      </div>
      <p class="mb-4">
        Outcomes can have 2-4 milestones. The more milestones an Outcome has, the more weight it has in the story.
      </p>

      <h3 class="text-lg font-semibold mb-3 mt-6">How Milestones are Added</h3>
      <p class="mb-4">
        Milestones are added after each mini-chapter (called a <strong>Thread</strong>). See the lecture "Narrative Structure: Switches and Threads" for more details. Here's the basic flow:
      </p>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
          <p class="mb-2"><strong>Switch:</strong> 1 Beat to find out what the next mini-chapter will be<br/>
          <em>Example: Meet Sir Bram, leader of the local Hero Guild</em></p>
          <p class="mb-2"><strong>Thread:</strong> 2-4 Beats to find out which Milestone will be added<br/>
          <em>Example: Rikkit fails to convince Sir Bram.</em></p>
          <p class="mb-0"><strong>Milestone:</strong> The result is recorded<br/>
          <em>Example: Unfavorable: Sir Bram keeps the anti-Goblin policies of his Guild in place.</em></p>
      </div>

      <h3 class="text-lg font-semibold mb-3 mt-6">Shared vs. Player Outcomes</h3>
      <p class="mb-4">
        Outcomes come in two types:
      </p>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
      <p class="mb-2"><strong>Shared Outcomes:</strong> Apply to all players in the story. These address the big questions that affect everyone. You can adjust these in the <strong>"Outcomes" tab</strong> in the Worldbuilding interface.</p>
        <p class="mb-0"><strong>Player Outcomes:</strong> Only apply to a single player. These focus on individual character arcs and personal stakes. You can adjust these in the <strong>"Players" tab</strong> in the Worldbuilding interface.</p>
      </div>
      <p class="mb-4">
        We will discuss Shared Outcomes in more detail in the lecture on Multiplayer.
      </p>

      <h3 class="text-lg font-semibold mb-3 mt-6">Recommended Structure</h3>
      <p class="mb-4">
        For a story with <strong>25 Beats</strong>, we recommend having <strong>3 Outcomes</strong> per player (among Shared and Player Outcomes) with a total of approximately <strong>7 Milestones</strong>. This provides enough narrative momentum without overwhelming the story structure.
      </p>

      <h3 class="text-lg font-semibold mb-3 mt-6">Key Concepts Summary</h3>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
      <p class="mb-2"><strong>Outcome:</strong> A question that will define the ending of the story.</p>
        <p class="mb-2"><strong>Resolution:</strong> The answer to that question.</p>
        <p class="mb-2"><strong>Milestone:</strong> A step towards an Outcome's Resolution.</p>
        <p class="mb-0"><strong>Thread:</strong> Mini-chapter that establishes a Milestone.</p>
      </div>

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
        <p class="mb-2"><strong>Switch:</strong> 1 Beat to find out what the next mini-chapter will be<br/>
        <em>Example: Meet Sir Bram, leader of the local Hero Guild</em></p>
        <p class="mb-2"><strong>Thread:</strong> 2-4 Beats to find out which Milestone will be added<br/>
        <em>Example: Rikkit fails to convince Sir Bram.</em></p>
        <p class="mb-0"><strong>Milestone:</strong> The result is recorded<br/>
        <em>Example: Unfavorable: Sir Bram keeps the anti-Goblin policies of his Guild in place.</em></p>
      </div>

      <h3 class="text-lg font-semibold mb-3 mt-6">Two Types of Switches</h3>
      <p class="mb-4">
        There are two types of Switches that give players different kinds of control:
      </p>

      <h4 class="text-md font-semibold mb-2 mt-4">Topic Switch</h4>
      <p class="mb-2">
        Which Outcome should we drive toward a Resolution next?
      </p>
      <div class="bg-blue-50 p-3 rounded-lg mb-4">
        <p class="mb-2"><strong>Option 1:</strong> Meet Sir Bram, leader of the Hero Guild.</p>
        <p class="mb-2"><strong>Option 2:</strong> Print posters to identify supporters.</p>
        <p class="mb-0"><strong>Option 3:</strong> Prepare a hideout in case things get ugly.</p>
      </div>
      <p class="mb-4">
        Topic Switches give the player more freedom. They are provided to the player whenever possible.
      </p>

      <h4 class="text-md font-semibold mb-2 mt-4">Flavor Switch</h4>
      <p class="mb-2">
        How should the next Thread for a predefined Outcome look like?
      </p>
      <div class="bg-green-50 p-3 rounded-lg mb-4">
        <p class="mb-2"><strong>Option 1:</strong> Show up to the trial.</p>
        <p class="mb-2"><strong>Option 2:</strong> Organize a protest to stop the trial.</p>
        <p class="mb-0"><strong>Option 3:</strong> Escape the trial.</p>
      </div>

      <h3 class="text-lg font-semibold mb-3 mt-6">When Flavor Switches Are Generated</h3>
      <p class="mb-4">
        Flavor Switches are generated in three specific scenarios:
      </p>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
      <p class="mb-2"><strong>Urgency:</strong> Something happened that requires the character's immediate attention.<br/>
        <em>Example: Someone launches a personal attack on Rikkit. The next Thread must address this.</em></p>
        <p class="mb-2"><strong>Continuation:</strong> Narratively, we simply must follow up on the previous Thread.<br/>
        <em>Example: After seizing the Hero Guild, we must address the aftermath.</em></p>
        <p class="mb-0"><strong>Missing Milestones:</strong> The story is coming to an end, and an Outcome is still missing Milestones.</p>
      </div>

      <h3 class="text-lg font-semibold mb-3 mt-6">Two Types of Threads</h3>
      <p class="mb-4">
        Threads can be either exploratory or focused on success vs. failure:
      </p>

      <p class="mb-2"><strong>Exploration Thread</strong></p>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
        <p class="mb-2">
          <strong>Resolution depends on player preferences</strong>
        </p>
        <p class="mb-2"><strong>Example 1:</strong> Peaceful protest, civil disobedience, or violent sabotage?</p>
        <p class="mb-2"><strong>Example 2:</strong> How does Rikkit feel about their actions?</p>
        <p class="mb-0"><strong>Example 3:</strong> Which allies does Rikkit want to engage?</p>
      </div>

      <p class="mb-2"><strong>Challenge Thread</strong></p>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
        <p class="mb-2">
          <strong>Resolution is a matter of success vs. failure</strong>
        </p>
        <p class="mb-2"><strong>Example 1:</strong> Does Rikkit mobilize enough support for a rally?</p>
        <p class="mb-0"><strong>Example 2:</strong> Does Rikkit convince Zelda to join the movement?</p>
      </div>

      <h3 class="text-lg font-semibold mb-3 mt-6">Thread Beat Progression</h3>
      <p class="mb-4">
        Threads come with a <strong>pre-defined beat progression</strong>. The progression is laid out by the AI before the first beat of the Thread is generated.
      </p>
      <p class="mb-2">Example Thread: "Meet Sir Bram"</p>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
        <ol class="list-decimal list-inside space-y-2 ml-4">
          <li>What is Sir Bram's first impression of Rikkit?</li>
          <li>Does Rikkit find leverage in the negotiation?</li>
          <li>Does Rikkit convince Sir Bram?</li>
        </ol>
      </div>
      <p class="mt-3">After Beat 3: Milestone is added</p>
      <p class="mt-2">Beats 1-3 build momentum toward the Thread's climax.</p>

      <h3 class="text-lg font-semibold mb-3 mt-6">Fine-tuning Switches and Threads</h3>
      <p class="mb-4">
        You can control the flow of your stories by adjusting several aspects:
      </p>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
      <p class="mb-2"><strong>Selection of potential Threads:</strong> <em>Public protests, secret negotiations, public speeches, ...</em></p>
        <p class="mb-2"><strong>Variety:</strong> <em>Alternate between public action Threads and private, personal Threads.</em></p>
        <p class="mb-2"><strong>Length:</strong> <em>As a default, keep the length of personal Threads to 2 beats.</em></p>
        <p class="mb-2"><strong>Sequencing:</strong> <em>If the player ever gets hurt physically, the next Thread must be about healing their wounds.</em></p>
        <p class="mb-0"><strong>Surprises:</strong> <em>Around beat 13-16 / 25, introduce a personal attack on the player (social or physical).</em></p>
      </div>

      <h3 class="text-lg font-semibold mb-3 mt-6">Key Concepts Summary</h3>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
      <p class="mb-2"><strong>Topic Switches:</strong> Allow players to choose which Outcome should be addressed. They are offered to the player whenever possible.</p>
        <p class="mb-2"><strong>Flavor Switches:</strong> Allow players to choose how a predefined Outcome should be addressed. They are offered to the player if we cannot give the player control over the topic of the next Thread.</p>
        <p class="mb-2"><strong>Challenge Threads:</strong> Are a matter of success vs. failure.</p>
        <p class="mb-2"><strong>Exploration Threads:</strong> Are not.</p>
        <p class="mb-0"><strong>Threads:</strong> Come with pre-defined beat progressions and end with new Milestones.</p>
      </div>

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
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
      <p class="mb-2"><strong>Identities:</strong> Pronouns, appearance, mannerisms.</p>
        <p class="mb-0"><strong>Backgrounds:</strong> Initial stats (see the video on Stats for more details), the role of the character in the World.</p>
      </div>
      <p class="mb-4">
        Each player chooses one Identity and one Background.
      </p>

      <h3 class="text-lg font-semibold mb-3 mt-6">Summary</h3>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
      <p class="mb-2"><strong>Guidelines:</strong> Contain high-level descriptions about the world and the conflicts in the story, as well as instructions for scenes and pacing.</p>
        <p class="mb-2"><strong>Story Elements:</strong> Define an initial set of characters, locations, items, rumors, etc.</p>
        <p class="mb-0"><strong>Player Identities and Backgrounds:</strong> Define starting points for the player characters.</p>
      </div>
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
      <p class="mt-4 mb-4">
        <strong>Success and failure mechanics only apply to Challenge Threads.</strong> In Exploration Threads, there's no right or wrong choice — it's simply a matter of player preference.
      </p>

      <h3 class="text-lg font-semibold mb-3 mt-6">Baseline Probability Distributions</h3>
      <p class="mb-4">
        Each option that players can choose in a Challenge Thread starts with a baseline probability distribution for success versus failure. The AI categorizes options into three types:
      </p>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
      <p class="mb-2"><strong>Balanced:</strong> Equal chance (33/34/33%) of Favorable, Mixed, and Unfavorable outcomes.</p>
        <p class="mb-2"><strong>Safe:</strong> Fewer extreme results (25/50/25%), with more outcomes falling into the Mixed category.</p>
        <p class="mb-0"><strong>Risky:</strong> More extreme results (40/20/40%), with higher chances of both Favorable and Unfavorable outcomes, but fewer Mixed results.</p>
      </div>

      <h3 class="text-lg font-semibold mb-3 mt-6">The Five Types of Modifiers</h3>
      <p class="mb-4">
        The baseline distribution is then adjusted by applying modifiers. There are five types of influences that can affect your chances of success:
      </p>

      <div class="bg-gray-50 p-4 rounded-lg mb-4">
      
        <p class="mb-4">
          <strong>1. Difficulty Level (Controllable)</strong>. A standard default bonus or penalty that applies to every success versus failure roll in the entire story. You can set this when creating your World.
        </p>

        <p class="mb-4">
          <strong>2. Stats (Controllable)</strong>. Each relevant stat can apply a bonus or penalty between +15 and -15. This includes skills, resources, relationships, environmental conditions, or anything being tracked by the engine.
        </p>

        <p class="mb-4">
          <strong>3. Sacrifices and Rewards (Controllable)</strong>. Sometimes options offer special trade-offs:
        </p>
        <p class="mb-2 ml-8"><strong>Sacrifices:</strong> Give up something (money, mana, public support) for a +30 bonus to the current beat.</p>
        <p class="mb-4 ml-8"><strong>Chasing Rewards:</strong> Accept a -30 penalty to gain something valuable (like grabbing a healing plant while chasing a foe).</p>

        <p class="mb-4">
          <strong>4. Previous Beat Results (Not Controllable)</strong>. The outcome of the previous beat affects the current one, creating momentum within Threads. This pushes Threads toward dramatic climaxes where stakes get higher.
        </p>

        <p class="mb-4">
          <strong>5. Player Choice Quality (Not Controllable)</strong>. The AI awards minor bonuses (+5) or penalties (-10) based on how sensible a choice seems in context. This creates interesting decisions where players must choose between "obviously sensible" options and choices that leverage their character's unique strengths.
        </p>
      </div>

      <h3 class="text-lg font-semibold mb-3 mt-6">Difficulty Levels</h3>
      <p class="mb-4">
        You can set different difficulty levels for your World, each creating a different player experience:
      </p>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
        <p class="mb-2"><strong>Friendly (+20):</strong> Perfect for children's stories or satires where everything works out.</p>
        <p class="mb-2"><strong>Relaxed (+10):</strong> Good for romance stories where you want positive outcomes.</p>
        <p class="mb-2"><strong>Balanced (0):</strong> The default — mixed results with some ups and downs.</p>
        <p class="mb-2"><strong>Challenging (-10):</strong> Players must make real trade-offs; failure becomes likely.</p>
        <p class="mb-2"><strong>Grim (-20):</strong> For horror or survival stories where struggle is the point.</p>
        <p class="mb-0"><strong>Extreme (-30):</strong> Meta-commentary difficulty where success is nearly impossible.</p>
      </div>

      <h3 class="text-lg font-semibold mb-3 mt-6">Thread Momentum</h3>
      <p class="mb-4">
        Here's how momentum works within a Thread:
      </p>
      <p class="mb-2"><strong>Momentum Effects:</strong></p>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
        <p class="mb-2"><strong>Mixed result:</strong> No bonus or penalty for next beat.</p>
        <p class="mb-2"><strong>Favorable result:</strong> +30 bonus for next beat.</p>
        <p class="mb-2"><strong>Unfavorable result:</strong> -30 penalty for next beat.</p>
      </div>
      <p class="mt-4 mb-2"><strong>Example Thread: "Meeting Sir Bram"</strong></p>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
        <p class="mb-2"><strong>Beat 1:</strong> Establish first impressions. No modifier, because it's the first Beat of the Thread. Resolution: Mixed.</p>
        <p class="mb-2"><strong>Beat 2:</strong> Find leverage in negotiation. No modifier, because the first Beat was Mixed. Resolution: Unfavorable.</p>
        <p class="mb-0"><strong>Beat 3:</strong> Attempt to convince Sir Bram. -30 penalty, because the previous Beat was Unfavorable.</p>
      </div>

      <h3 class="text-lg font-semibold mb-3 mt-6">Key Concepts Summary</h3>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
      <p class="mb-2"><strong>Challenge Threads:</strong> Are resolved using success vs. failure mechanics. Exploration Threads are not.</p>
        <p class="mb-2"><strong>Baseline distributions:</strong> Are Balanced, Safe, or Risky depending on the option.</p>
        <p class="mb-2"><strong>Five modifier types:</strong> Adjust probabilities: Difficulty Level, Stats, Sacrifices/Rewards, Previous Beat, and Player Choice Quality.</p>
        <p class="mb-2"><strong>Thread momentum:</strong> Makes each beat's outcome affect the next, building toward dramatic climaxes.</p>
        <p class="mb-0"><strong>Difficulty levels:</strong> Set the overall tone and challenge level for your entire World.</p>
      </div>

      <h3 class="text-lg font-semibold mb-3 mt-6">Design Tip: Choose Your Difficulty Thoughtfully</h3>
      <p class="mb-4">
        The difficulty level fundamentally changes the player experience. A Balanced (0) setting works for most stories, but consider your narrative goals: Do you want players to feel empowered and successful, or do you want them to struggle and make hard choices? Match your difficulty to your story's themes and intended emotional journey.
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
      <p class="mt-4 mb-4">
        <strong>Stats model the world.</strong> They tell the AI what to focus on in the narrative, what to monitor, and which elements should be integrated into the story.
      </p>
      <p class="mb-4">
        Whatever is captured as a stat is an indication that it's important for the narrative and that the AI should consider it. You don't have to manage these stats yourself — you just define them, and the Chosen Path engine takes care of tracking and integrating them throughout your stories.
      </p>

      <h3 class="text-lg font-semibold mb-3 mt-6">What Stats Tell the AI</h3>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
        <p class="mb-2"><strong>What to Focus On:</strong> Elements captured as stats become narrative priorities</p>
        <p class="mb-2"><strong>What to Monitor:</strong> The AI tracks changes and adjustments to stat values</p>
        <p class="mb-2"><strong>What to Integrate:</strong> Stats shape player options and influence success/failure mechanics</p>
        <p class="mb-0"><strong>How to Influence:</strong> Stats provide bonuses and penalties in Challenge Threads</p>
      </div>

      <h3 class="text-lg font-semibold mb-3 mt-6">Types of Stats</h3>
      <p class="mb-4">
        Choose the right type for each aspect of your world you want to model:
      </p>

      <h4 class="text-md font-semibold mb-2 mt-4">Percentage-Based Stats</h4>
      <p class="mb-2">
        For elements that need granular, frequent tracking with capacity limits.
      </p>
      <div class="bg-blue-50 p-3 rounded-lg mb-4">
        <p class="mb-2"><strong>Good for:</strong> Resources (mana, spaceship fuel), health statuses, core relationships</p>
        <p class="mb-0"><strong>Example:</strong> Public Support (0-100%) — tracks how much the general population supports the goblin rights movement</p>
      </div>

      <h4 class="text-md font-semibold mb-2 mt-4">Opposites</h4>
      <p class="mb-2">
        Two percentage stats in one — a zero-sum system where one side's loss is the other's gain.
      </p>
      <div class="bg-blue-50 p-3 rounded-lg mb-4">
        <p class="mb-2"><strong>Good for:</strong> Moral alignments (Good vs. Evil), competing influences (Science vs. Magic), character dispositions (Patient vs. Action-oriented)</p>
        <p class="mb-0"><strong>Example:</strong> Hero Guild Stance — ranges from "Supportive of Reform" to "Violently Anti-Goblin"</p>
      </div>

      <h4 class="text-md font-semibold mb-2 mt-4">Simple Numbers</h4>
      <p class="mb-2">
        For countable quantities without a maximum limit. Use sparingly — other types are often better.
      </p>
      <div class="bg-blue-50 p-3 rounded-lg mb-4">
        <p class="mb-2"><strong>Good for:</strong> Followers in your cult, money, magic mushrooms collected</p>
        <p class="mb-0"><strong>Note:</strong> Only use as a last resort — typically other stat types provide better narrative integration</p>
      </div>

      <h4 class="text-md font-semibold mb-2 mt-4">Strings</h4>
      <p class="mb-2">
        For qualitative aspects that don't change often, with discrete levels.
      </p>
      <div class="bg-blue-50 p-3 rounded-lg mb-4">
        <p class="mb-2"><strong>Good for:</strong> Health conditions (Unscathed → Bruised → Injured → Critical), relationship statuses (Acquaintance → Friend → Lover)</p>
        <p class="mb-0"><strong>Example:</strong> Community Standing with possible values: "Newcomer," "Respected Advocate," "Movement Leader"</p>
      </div>

      <h4 class="text-md font-semibold mb-2 mt-4">Lists</h4>
      <p class="mb-2">
        For collections where having the item matters more than the level of proficiency.
      </p>
      <div class="bg-blue-50 p-3 rounded-lg mb-4">
        <p class="mb-2"><strong>Good for:</strong> Superpowers, inventory items, contacts, skills where level doesn't matter</p>
        <p class="mb-0"><strong>Example:</strong> Advocacy Tools — might include "Pamphlets," "Public Speaking," "Secret Negotiations," "Rally Organization"</p>
      </div>

      <h3 class="text-lg font-semibold mb-3 mt-6">Shared vs. Player Stats</h3>
      <p class="mb-4">
        This distinction is particularly important for multiplayer stories:
      </p>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
        <p class="mb-2"><strong>Shared Stats:</strong> Same values for all players. Good for world conditions, faction relationships, environmental factors that affect everyone.</p>
        <p class="mb-0"><strong>Player Stats:</strong> Different values for each player. Good for personal skills, individual relationships, character-specific resources.</p>
      </div>

      <h3 class="text-lg font-semibold mb-3 mt-6">Stat Properties</h3>

      <p class="mb-2"><strong>Example:</strong> Public Support</p>

      <h4 class="text-md font-semibold mb-2 mt-4">Narrative Implications</h4>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
        <p class="mb-2"><strong>Below 30%:</strong> Onlookers are hostile during public encounters</p>
        <p class="mb-0"><strong>Above 70%:</strong> Crowds might join protests or offer help</p>
      </div>

      <h4 class="text-md font-semibold mb-2 mt-4">Success/Failure Bonuses</h4>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
        <p class="mb-2"><strong>Low Public Support:</strong> -10 penalty on public challenges</p>
        <p class="mb-0"><strong>High Public Support:</strong> +10 bonus on public challenges</p>
      </div>

      <h4 class="text-md font-semibold mb-2 mt-4">Sacrifices and Rewards</h4>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
        <p class="mb-2"><strong>Sacrifice:</strong> Give up 10% Public Support to push through a controversial action (+30 bonus to current beat)</p>
        <p class="mb-0"><strong>Reward:</strong> Accept a penalty in court but gain public support through dramatic gestures</p>
      </div>

      <h4 class="text-md font-semibold mb-2 mt-4">How the Stat can Change</h4>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
        <p class="mb-0"><strong>Example:</strong> "After a favorable public Thread, expect Public Support to increase. After an unfavorable public Thread, expect it to decrease."</p>
      </div>

      <h3 class="text-lg font-semibold mb-3 mt-6">Player Backgrounds and Starting Values</h3>
      <p class="mb-4">
        Player stats can have different starting values based on chosen backgrounds:
      </p>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
        <p class="mb-2"><strong>"Networker from the Shadows":</strong> Starts with several contacts, high energy, negotiation skills</p>
        <p class="mb-0"><strong>"Passionate Newcomer":</strong> Starts with fewer contacts but maximum energy and public speaking skills</p>
      </div>

      <h3 class="text-lg font-semibold mb-3 mt-6">Stat Groups</h3>
      <p class="mb-4">
        Organize stats into groups purely for user interface purposes. This has no mechanical effect but makes the game easier to understand for players.
      </p>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
        <p class="mb-2"><strong>Movement:</strong> Public Support, Hero Guild Stance, Queen's Opinion</p>
        <p class="mb-2"><strong>Personal:</strong> Energy, Community Standing, Advocacy Tools</p>
        <p class="mb-0"><strong>Relationships:</strong> Contacts, Friends, Romantic Interest</p>
      </div>

      <h3 class="text-lg font-semibold mb-3 mt-6">Example: Refining Stats for "Goblin Rights Now!"</h3>
      <p class="mb-4">
        Here's how we improved our initial AI-generated stats:
      </p>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
        <p class="mb-2"><strong>Added:</strong> Queen's Opinion (to track royal influence), Energy (to model activist burnout), Friends and Romantic Interest (for personal storylines)</p>
        <p class="mb-2"><strong>Removed:</strong> Personal Safety (redundant with Hero Guild Stance)</p>
        <p class="mb-2"><strong>Expanded:</strong> Advocacy Tools to include "Public Speaking," "Rally Organization," and "Negotiations"</p>
        <p class="mb-0"><strong>Adjusted:</strong> Made some stats harder to sacrifice (skills shouldn't be lost easily in a single beat)</p>
      </div>

      <h3 class="text-lg font-semibold mb-3 mt-6">Key Concepts Summary</h3>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
        <p class="mb-2"><strong>Stats model the world:</strong> They tell the AI what to focus on, monitor, and integrate into stories.</p>
        <p class="mb-2"><strong>Choose the right type:</strong> Percentage for frequent tracking, strings for discrete levels, lists for collections.</p>
        <p class="mb-2"><strong>Shared vs. Player:</strong> Shared stats have same values for all players; player stats are individual.</p>
        <p class="mb-2"><strong>Narrative integration:</strong> Define thresholds, bonuses, and change conditions to shape the story.</p>
        <p class="mb-0"><strong>Stat groups:</strong> Organize for better UI presentation.</p>
      </div>

      <h3 class="text-lg font-semibold mb-3 mt-6">Design Tip: Match Your Creator Style</h3>
      <p class="mb-4">
        <strong>Architects:</strong> Fine-tune every stat attribute to create exactly the experience you want. Iterate until the mechanics perfectly support your vision.
      </p>
      <p class="mb-4">
        <strong>Dreamers:</strong> Don't worry too much about perfection. Tell the AI roughly what you want and go with what it gives you. Only change things that are clearly broken after testing.
      </p>

      <h3 class="text-lg font-semibold mb-3 mt-6">Design Tip: Align Stats with Your Vision</h3>
      <p class="mb-4">
        Your stats should support the kinds of stories you want to enable. If your story is about personal growth, include stats that track character development. If it's about resource management, focus on percentage-based stats for key resources. The stats you choose communicate to the AI what your story is really about.
      </p>
    `,
  },
  {
    id: "multiplayer",
    title: "Multiplayer",
    summary:
      "Up to three players share one World, each with their own character, code and point of view. Learn how turns, shared Stats and Outcomes, and the three game modes work, and how to design and run a story for a group.",
    imagePath: "/academy/multiplayer.jpeg",
    content: `
      <p class="mt-4 mb-4">
        <strong>One story, told to every player at once.</strong>
      </p>
      <p class="mb-4">
        Stories in Chosen Path can be played by <strong>1 to 3 players</strong>. In a multiplayer story, each player sits at their own device, joins with their own code and plays their own character. The engine writes a separate Beat for every player, addressed to them as "you", while the other player characters appear by name. Everyone shares the same World, the same Shared Stats and the same Shared Outcomes, but each player experiences the story from their own point of view.
      </p>
      <p class="mb-4">
        That makes multiplayer interesting for teachers and trainers who want a small group to negotiate, cooperate or compete in a simulation, for coaches working with pairs, and for game designers who want group play without managing a story tree for every combination of choices.
      </p>

      <h3 class="text-lg font-semibold mb-3 mt-6">What Each Player Sees</h3>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
        <p class="mb-2"><strong>Their own Beats:</strong> A text written for their character, and their own options. Players don't see each other's texts or options.</p>
        <p class="mb-2"><strong>Shared Stats:</strong> The same values for everyone.</p>
        <p class="mb-2"><strong>Their own Player Stats:</strong> Each player sees their own values, not the other players'.</p>
        <p class="mb-0"><strong>Who is still choosing:</strong> While a player waits, the game shows which players haven't made their choice yet.</p>
      </div>
      <p class="mb-4">
        Players act only by choosing options. There is no chat inside the game, so groups talk to each other in the room or on a call.
      </p>

      <h3 class="text-lg font-semibold mb-3 mt-6">How a Turn Works</h3>
      <p class="mb-4">
        There is no turn order. Everyone reads and chooses at the same time, and the story moves forward together:
      </p>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
        <ol class="list-decimal list-inside space-y-2 ml-4">
          <li>Every player reads their own Beat and picks one of their options, in any order.</li>
          <li>Players who have chosen wait for the others.</li>
          <li>Once the last player has chosen, the engine writes the next Beat for all players at once.</li>
        </ol>
      </div>
      <p class="mb-4">
        The story waits for everyone. Nobody is skipped: if one player stops playing, the story pauses until they come back. At the end, every player gets their own ending.
      </p>

      <h3 class="text-lg font-semibold mb-3 mt-6">Switches and Threads with Several Players</h3>
      <p class="mb-4">
        The structure from the lecture "Narrative Structure: Switches and Threads" stays the same: Switch, Thread, Switch, Thread, ..., Ending. With several players, a few rules apply:
      </p>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
        <p class="mb-2"><strong>Together at the start:</strong> The first Thread always puts every player into one Thread about a Shared Outcome. In a competitive story with a contested Outcome, it's about that Outcome.</p>
        <p class="mb-2"><strong>One Thread per player:</strong> After every Switch, each player is in exactly one Thread. Players can share a Thread or play separate Threads side by side.</p>
        <p class="mb-2"><strong>In step:</strong> Threads that run side by side always have the same number of Beats, so all players reach the next Switch at the same time.</p>
        <p class="mb-0"><strong>Grouping:</strong> At a Switch, each player chooses from their own options. The AI decides how to group players: it can give everyone the same Flavor Switch for a joint Thread, let players opt into a shared Thread through their options, or send them down separate paths. It then plans the next Threads around everyone's picks.</p>
      </div>

      <h3 class="text-lg font-semibold mb-3 mt-6">When Players Share a Thread</h3>
      <p class="mb-4">
        Every player in a Thread makes their own choice in each Beat. The engine combines those choices into one result for the Thread's step:
      </p>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
        <p class="mb-2"><strong>Challenge Threads:</strong> Every player rolls for their own option. The step can only go the way the rolls lean, or end Mixed: the more they lean one way, the likelier that result. When favorable and unfavorable rolls cancel each other out, the step is Mixed.</p>
        <p class="mb-2"><strong>Exploration Threads:</strong> The option most players chose decides the step. A tie is broken by chance.</p>
        <p class="mb-0"><strong>A player's own Outcome:</strong> If the Thread is about one player's personal Outcome and that player is in it, only their roll or choice decides the step. The others take part in the scene, but it's that player's story.</p>
      </div>

      <h3 class="text-lg font-semibold mb-3 mt-6">Shared vs. Personal</h3>
      <p class="mb-4">
        The lectures on Outcomes and Stats introduced shared and personal elements. In multiplayer stories, this is where the design happens:
      </p>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
        <p class="mb-2"><strong>Shared Stats:</strong> One value for the whole group. Every player's story can move them, and a sacrifice or reward on a Shared Stat spends or gains for everyone. Good for the group's resources, the state of the world, and relationships between the player characters.</p>
        <p class="mb-2"><strong>Player Stats:</strong> Every player has every Player Stat, each with their own value. Starting values come from the Background a player chooses, unless you switch off "Part of player backgrounds" for a stat: then every player starts with the same value.</p>
        <p class="mb-2"><strong>Shared Outcomes:</strong> The questions the group's story answers. A story with two or three players needs at least one: without it, the story won't start, and the World's validation flags it.</p>
        <p class="mb-0"><strong>Player Outcomes:</strong> Each player seat (Player 1, 2 and 3) has its own personal Outcomes in the <strong>"Players" tab</strong>. They give each player something of their own to pursue.</p>
      </div>

      <h3 class="text-lg font-semibold mb-3 mt-6">The Three Game Modes</h3>
      <p class="mb-4">
        Every multiplayer story has a game mode. For a World, you set it in the <strong>"Meta" tab</strong> (Shared Goals, Mixed Goals or Competing Goals). Players who create their own story choose it on the setup form (Cooperative, Mixed or Competitive).
      </p>

      <h4 class="text-md font-semibold mb-2 mt-4">Cooperative (Shared Goals)</h4>
      <p class="mb-2">
        Players work together toward shared goals.
      </p>
      <div class="bg-blue-50 p-3 rounded-lg mb-4">
        <p class="mb-2"><strong>Rule:</strong> The engine never plays a contest in a cooperative story. If the AI plans one anyway, it becomes a shared Challenge for everyone in it.</p>
        <p class="mb-0"><strong>Example:</strong> "Will the Hero Guilds reform their anti-goblin policies?" (All players are goblin activists.)</p>
      </div>

      <h4 class="text-md font-semibold mb-2 mt-4">Mixed (Mixed Goals)</h4>
      <p class="mb-2">
        Players cooperate overall, but also have goals that pull them apart.
      </p>
      <div class="bg-blue-50 p-3 rounded-lg mb-4">
        <p class="mb-2"><strong>Typical setup:</strong> One Shared Outcome the group can only reach together, one contested Shared Outcome they compete over, and a personal Outcome for each player.</p>
        <p class="mb-0"><strong>Example:</strong> The activists fight for reform together, but compete over who will speak for the goblins at the Queen's council.</p>
      </div>

      <h4 class="text-md font-semibold mb-2 mt-4">Competitive (Competing Goals)</h4>
      <p class="mb-2">
        Players compete over what matters most.
      </p>
      <div class="bg-blue-50 p-3 rounded-lg mb-4">
        <p class="mb-2"><strong>Typical setup:</strong> At least one contested Shared Outcome, plus personal Outcomes about what winning or losing costs each character.</p>
        <p class="mb-0"><strong>Example:</strong> "Who will become the King's Black Hand?" (In a World in which players compete for positions at a royal court.)</p>
      </div>
      <p class="mb-4">
        The game mode also guides how the AI groups players. In cooperative stories, it looks for chances to put players into the same Thread. In competitive stories, it mixes separate Threads (preparation, eavesdropping) with direct confrontations. In mixed stories, it balances joint Threads for shared goals with individual Threads for personal goals.
      </p>

      <h3 class="text-lg font-semibold mb-3 mt-6">Contests: Side A vs. Side B</h3>
      <p class="mb-4">
        In Mixed and Competitive stories with two or more players, a Shared Outcome can be a <strong>Contest</strong>. Its Resolutions are <em>Side A wins</em>, <em>Mixed</em> (a draw or compromise) and <em>Side B wins</em>. The World editor offers the Contest kind only on Shared Outcomes of Worlds that can play it.
      </p>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
        <p class="mb-2"><strong>Two sides, always:</strong> Side A is Player 1's side. With three players, a Contest still has only two sides, so two players share one. There are no three-way contests.</p>
        <p class="mb-2"><strong>Who wins a step:</strong> Every player in a contest Thread rolls. Each side is scored by the average of its players' results, and the better side wins the step. Even sides make it Mixed.</p>
        <p class="mb-0"><strong>Only one side shows up:</strong> If only one side's players end up in a contest Thread because the others chose something else, it's played as that side's Challenge: a favorable result counts as their side winning.</p>
      </div>

      <h3 class="text-lg font-semibold mb-3 mt-6">Designing a World for a Group</h3>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
        <p class="mb-2"><strong>Make every player count work:</strong> In the "Meta" tab, you set the minimum and maximum number of players. Player 1's seat is always in play; Player 2 and Player 3 only join when a story has that many players. Check that your World works for every count you allow: multiplayer stories need a Shared Outcome, and Contests only work with two or more players.</p>
        <p class="mb-2"><strong>Give each seat its own role:</strong> Each seat has its own Identities, Backgrounds and personal Outcomes. Make the seats clearly different (the organizer, the printer, the spy), so that players never end up playing the same character.</p>
        <p class="mb-2"><strong>Open with a reason to be together:</strong> Since the first Thread puts everyone on a Shared Outcome, make sure at least one Shared Outcome gives every character a reason to be in the same scene from the start.</p>
        <p class="mb-2"><strong>Give each player a personal pull:</strong> At least one personal Outcome per seat gives players a reason to split up into separate Threads, and each of them a story of their own. The recommendation of about 3 Outcomes per player includes the Shared Outcomes.</p>
        <p class="mb-2"><strong>One relationship, one stat:</strong> A relationship between two player characters is one Shared Stat, not a copy for each player.</p>
        <p class="mb-2"><strong>One scoreboard per Contest:</strong> Add a Shared Stat of the Opposites type that shows who is ahead, named after the two sides, Player 1's side first (for example "Enclave's Voice|Printers' Voice"). End the Contest's resonance with "Scored by" and the stat's name. Start it at 50, and under "How to change after Threads" let it move 10 to 20 points toward the side that won each Thread about the Contest, none after a Mixed result. When the engine can tell which side just won, it turns around any scoreboard move against that side. Once the Contest has all its Milestones, the AI is told to let the side ahead win in the ending unless the Milestones clearly say otherwise; a score between 45 and 55 counts as a draw.</p>
        <p class="mb-2"><strong>Camps for three players:</strong> In a three-player Contest, say in each seat's Backgrounds which side that seat is on.</p>
        <p class="mb-0"><strong>Spread out your key characters:</strong> Threads that run side by side happen at the same moment, and the AI is told to keep each person in only one Thread's scene at a time. A World with several important NPCs gives parallel Threads more to work with than one character every Thread needs.</p>
      </div>

      <h3 class="text-lg font-semibold mb-3 mt-6">Running a Session</h3>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
        <p class="mb-2"><strong>Start the story:</strong> Pick a World from the Library or create your own story, and choose the number of players. You get a code for every player and play as Player 1.</p>
        <p class="mb-2"><strong>Invite the others:</strong> The share icon next to each code copies a join link. Send each player their own link. They can also type their 6-character code into "Join Game" on the start page.</p>
        <p class="mb-2"><strong>Choose characters:</strong> Each player picks an Identity and a Background for their seat. The story begins once everyone has chosen.</p>
        <p class="mb-2"><strong>Getting back in:</strong> Players can return with their link or code at any time, and the story continues where it stopped. On the device you played on, the story also appears on the start page with a "Resume" button, and once you're logged in, you can link it to your account. As the story's creator, you see every player's code there, so you can send a lost one again.</p>
        <p class="mb-0"><strong>If a turn fails:</strong> Every player sees a notice with a "Try again" button.</p>
      </div>

      <h3 class="text-lg font-semibold mb-3 mt-6">Plan for Waiting</h3>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
        <p class="mb-2"><strong>No head start:</strong> In single-player stories, Chosen Path can prepare the next Beat for each option in advance ("Reduce wait time after choices"). This isn't available for multiplayer stories: the next Beat is only written once the last player has chosen.</p>
        <p class="mb-2"><strong>More to write:</strong> Each turn, the engine writes a Beat for every player. Turns that end or start a Thread take a little longer, because the engine also plans what comes next.</p>
        <p class="mb-0"><strong>Several stories at once:</strong> A story is made for up to three players. To run several side by side, for a class, a workshop or a game night, sign in, open a World and tick "Start several stories at once": you start 2 to 12 copies, each with its own codes, and get printable seat cards to hand out. Choices in stories you started while signed in are counted per seat, so they can all run on the same network. Stories started without an account share their network address's limits: when several of them run on one network, such as a school's, choices get turned away until the limit resets.</p>
      </div>

      <h3 class="text-lg font-semibold mb-3 mt-6">Key Concepts Summary</h3>
      <div class="bg-gray-50 p-4 rounded-lg mb-4">
        <p class="mb-2"><strong>1-3 players:</strong> Each on their own device, with their own code, reading their own Beats.</p>
        <p class="mb-2"><strong>Turns:</strong> Everyone chooses at the same time. The story moves on when the last player has chosen.</p>
        <p class="mb-2"><strong>Threads:</strong> Everyone starts together. After that, each player is in exactly one Thread, and parallel Threads stay in step.</p>
        <p class="mb-2"><strong>Shared vs. personal:</strong> Shared Stats and Outcomes belong to the group; Player Stats and Outcomes to one player.</p>
        <p class="mb-2"><strong>Game modes:</strong> Cooperative stories never play a Contest. Mixed and Competitive stories can have Contests between Side A and Side B.</p>
        <p class="mb-0"><strong>Sessions:</strong> One code per player, waits between turns, and several stories at once when you start them signed in.</p>
      </div>

      <h3 class="text-lg font-semibold mb-3 mt-6">Design Tip: Start Together, Then Let Players Drift Apart</h3>
      <p class="mb-4">
        Imagine a two-player version of our sample World "Goblin Rights Now!". The reform of the Hero Guilds is the Shared Outcome that brings both activists into the first Thread. Each seat has a role of its own (Player 1 the enclave's organizer, Player 2 the movement's printer) with personal Outcomes that grow out of that role. After the opening Thread, the activists can split up to follow their own concerns, and come back together when the movement needs them both.
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
