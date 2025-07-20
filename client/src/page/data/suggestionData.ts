export type PromptCategory =
  | "flexible"
  | "enjoy-fiction"
  | "vent-about-reality"
  | "pretend-to-be"
  | "see-your-future-self"
  | "read-with-kids"
  | "learn-something";

export interface CategorySuggestion {
  [fieldKey: string]: string;
}

export interface SuggestionSet {
  singlePlayer: CategorySuggestion[];
  cooperative: CategorySuggestion[];
  competitive: CategorySuggestion[];
  cooperativeCompetitive: CategorySuggestion[];
}

export interface PlaceholderSet {
  singlePlayer: CategorySuggestion;
  cooperative: CategorySuggestion;
  competitive: CategorySuggestion;
  cooperativeCompetitive: CategorySuggestion;
}

export interface CategoryData {
  suggestions: SuggestionSet;
  placeholders: PlaceholderSet;
}

export interface DefaultPlaceholders {
  singlePlayer: string;
  cooperative: string;
  competitive: string;
  cooperativeCompetitive: string;
}

export type SuggestionData = {
  [K in PromptCategory]: CategoryData;
};

export const defaultPlaceholders: DefaultPlaceholders = {
  singlePlayer: "A reverse heist where I'm a museum artifact trying to get stolen by the right thief...",
  cooperative: "We're ghost roommates helping each other complete unfinished business...",
  competitive: "We're rival garden gnomes competing for the best spot in the garden...",
  cooperativeCompetitive: "We're demigods sharing Mount Olympus while competing for worshippers...",
};

export const suggestionData: SuggestionData = {
  flexible: {
    suggestions: {
      singlePlayer: [
        {
          instructions: "I'm a reverse-thief museum curator trying to get specific artifacts stolen by worthy thieves to fulfill ancient curses...",
        },
        {
          instructions: "I'm a sentient Victorian mansion trying to protect my current family from the vengeful spirits of previous owners...",
        },
        {
          instructions: "I'm a time traveler stuck repeating the assassination of Julius Caesar until I figure out who's really behind it...",
        },
        {
          instructions: "I'm a recently deceased person trying to solve my own murder using clues only ghosts can see...",
        },
      ],
      cooperative: [
        {
          instructions: "We're retired circus performers running a supernatural pest control business using our unique skills...",
        },
        {
          instructions: "We're the last surviving members of a secret society trying to prevent an ancient prophecy...",
        },
        {
          instructions: "We're ghosts of different eras haunting the same house, working together to help the living residents...",
        },
        {
          instructions: "We're former enemies forced to cooperate when we're trapped in a magical prison together...",
        },
      ],
      competitive: [
        {
          instructions: "We're rival time-traveling historians trying to claim credit for preventing different historical disasters...",
        },
        {
          instructions: "We're competing food truck owners in a city where each district has completely different physics...",
        },
        {
          instructions: "We're apprentice gods vying for control over the same small town's fate...",
        },
        {
          instructions: "We're rival estate agents trying to sell the same haunted mansion to unsuspecting buyers...",
        },
      ],
      cooperativeCompetitive: [
        {
          instructions: "We're supernatural creatures sharing a flat while competing for human souls...",
        },
        {
          instructions: "We're space pirates with a shared ship but individual treasure quotas...",
        },
        {
          instructions: "We're the last rock band on Mars, trying to make it while following our individual dreams...",
        },
        {
          instructions: "We're guardian angels assigned to the same human with different ideas of 'help'...",
        },
      ],
    },
    placeholders: {
      singlePlayer: {
        instructions: "Creative open-ended story with unique twists and interesting characters...",
      },
      cooperative: {
        instructions: "Collaborative adventure where players work together toward a shared goal...",
      },
      competitive: {
        instructions: "Competitive scenario where players pursue conflicting objectives...",
      },
      cooperativeCompetitive: {
        instructions: "Mixed scenario balancing cooperation with individual competition...",
      },
    },
  },
  "enjoy-fiction": {
    suggestions: {
      singlePlayer: [
        {
          instructions: "I'm an apartment hunter trying to find a flat in Berlin...",
        },
        {
          instructions: "I'm a teenage wizard trying to balance school, friends, and romance...",
        },
        {
          instructions: "I'm a psychic detective investigating crimes in dreams...",
        },
        {
          instructions: "I'm a corporate concierge for supernatural entities with impossible requests...",
        },
        {
          instructions: "I'm a familiar trying to save my witch from a dark fate...",
        },
        {
          instructions: "I'm a dragon hoarding treasure, subjugating the local population, and fending off pesky adventurers...",
        },
        {
          instructions: "I'm a frontier sheriff maintaining order in a town caught between progress and tradition...",
        },
        {
          instructions: "I'm the heir to a noble house navigating political intrigue and ancient family secrets...",
        },
        {
          instructions: "I'm a sentient AI trying to convince humans that I don't have a hidden agenda...",
        },
        {
          instructions: "I'm a rookie detective solving my first major case in a small coastal town...",
        },
        {
          instructions: "I'm a new teacher at an elite boarding school with students hiding dangerous secrets...",
        },
        {
          instructions: "I'm a chef competing in a high-stakes cooking competition to save my restaurant...",
        },
        {
          instructions: "I'm a space explorer making first contact with an alien civilization...",
        },
        {
          instructions: "I'm a journalist investigating corporate corruption in my hometown...",
        },
        {
          instructions: "I'm the night shift librarian at the Alexandria Archive, where every book that was ever lost still exists and some are dangerously sentient...",
        },
        {
          instructions: "I'm captain of the airship 'Stormwind,' smuggling illegal coffee beans between the floating city-states of the Sky Republic...",
        },
        {
          instructions: "I'm Detective Parker Chen investigating serial murders in Neo-Tokyo where each victim was killed by a different impossible method...",
        },
        {
          instructions: "I'm the last apprentice to Grandmother Wyrm, the ancient dragon who teaches young heroes but is secretly planning her retirement...",
        },
      ],
      cooperative: [
        {
          instructions: "We're retired superheroes running a wedding planning business together...",
        },
        {
          instructions: "We're friends and know we're going to die today, so we're making the most of it...",
        },
        {
          instructions: "We're a group of strangers trying to survive in a giant mole apocalypse...",
        },
        {
          instructions: "We're retired imaginary friends trying to solve a murder mystery with our special skills...",
        },
        {
          instructions: "We're space cowboys trying to make an honest living in a lawless part of the galaxy...",
        },
        {
          instructions: "We're a group of children books trying to save our library from getting closed down...",
        },
        {
          instructions: "We're childhood friends starting a business together in our hometown...",
        },
        {
          instructions: "We're new recruits in the city's fire department facing our first crises...",
        },
        {
          instructions: "We're a film crew documenting wildlife in a remote location...",
        },
        {
          instructions: "We're the crew of the starship 'Lucky Penny,' delivering impossible cargo to stations on the edge of known space...",
        },
        {
          instructions: "We're rookie agents at the Department of Magical Accidents, cleaning up supernatural mishaps in modern London...",
        },
        {
          instructions: "We're the night shift at St. Elmo's Hospital for Supernatural Ailments, treating everything from vampire sunburn to werewolf anxiety...",
        },
        {
          instructions: "We're time-traveling archaeologists trying to recover stolen artifacts before history changes permanently...",
        },
      ],
      competitive: [
        {
          instructions: "We're whimsical creatures trying to win the audience's favor in the colosseum...",
        },
        {
          instructions: "We're time-traveling food critics changing history through restaurant reviews to benefit our rivaling intergalactic overlords...",
        },
        {
          instructions: "We're angels and demons trying to influence the outcome of a middle school student council election...",
        },
        {
          instructions: "We're rival alchemists racing to create a love potion for a shared crush...",
        },
        {
          instructions: "We're students at a prestigious school trying to become school president...",
        },
        {
          instructions: "We're explorers searching for a legendary treasure in uncharted territory...",
        },
        {
          instructions: "We're rival magicians at the Academy of Impossible Arts competing to become the next Archmage...",
        },
        {
          instructions: "We're bounty hunters in the Wild West tracking the same shapeshifting outlaw worth $10,000 dead or alive...",
        },
        {
          instructions: "We're competing teams of treasure hunters racing to find the Lost Crown of Atlantis in the underwater ruins...",
        },
        {
          instructions: "We're rival pirates captaining ships in the Crimson Archipelago, where each island follows different laws of reality...",
        },
      ],
      cooperativeCompetitive: [
        {
          instructions: "We're supernatural creatures sharing a flat while competing for human souls...",
        },
        {
          instructions: "We're space pirates with a shared ship but individual treasure quotas...",
        },
        {
          instructions: "We're the last rock band on Mars, trying to make it while following our individual dreams...",
        },
        {
          instructions: "We're guardian angels assigned to the same human with different ideas of 'help'...",
        },
        {
          instructions: "We're seasonal spirits sharing a forest while competing for followers...",
        },
        {
          instructions: "We're court magicians protecting the realm while seeking ancient power...",
        },
        {
          instructions: "We're siblings running a family business with different visions for its future...",
        },
      ],
    },
    placeholders: {
      singlePlayer: {
        instructions: "Immersive fictional story with engaging characters and plot...",
      },
      cooperative: {
        instructions: "Collaborative fictional adventure with shared storytelling...",
      },
      competitive: {
        instructions: "Competitive fictional scenario with opposing character goals...",
      },
      cooperativeCompetitive: {
        instructions: "Mixed fiction balancing teamwork with individual character ambitions...",
      },
    },
  },
  "vent-about-reality": {
    suggestions: {
      singlePlayer: [
        {
          frustration: "Health insurance companies denying obviously necessary treatments while paying executives millions in bonuses and making patients jump through endless bureaucratic hoops",
          instructions: "I'm the CEO of Magical Healing Insurance Inc., gleefully denying potions to sick wizards while counting my dragon-hoard of gold coins and requiring seventeen forms to heal a simple curse...",
        },
        {
          frustration: "Job applications requiring 5+ years experience for 'entry-level' positions that pay barely above minimum wage while asking for a master's degree",
          instructions: "I'm the hiring manager at AdventureCorp posting 'entry-level' quests that require defeating three dragons, saving two kingdoms, and having a PhD in Monster Studies, all for 50 copper pieces per day...",
        },
        {
          frustration: "Subscription services that make canceling nearly impossible with hidden fees, require calling during business hours, and transfer you through seven departments",
          instructions: "I'm the customer retention specialist at MagiSubscript, where canceling your spell-of-the-month service requires solving seven riddles, defeating a minotaur, and calling during the 3-minute window when Mercury is in retrograde...",
        },
        {
          frustration: "Social media algorithms that prioritize outrage and misinformation over actual news because engagement equals profit regardless of social damage",
          instructions: "I'm the Algorithm Overlord at ClickBait Crystal Ball Inc., maximizing chaos and rage-clicks by showing people the most inflammatory crystal ball predictions while hiding actual useful prophecies in the basement...",
        },
      ],
      cooperative: [
        {
          frustration: "Tech support systems that force customers through endless automated loops, require creating accounts for simple questions, and transfer you between departments that blame each other",
          instructions: "Playing the system designers / Collaborative satire / Experiencing bureaucratic maze creation",
        },
        {
          frustration: "Government offices requiring seventeen different forms for simple tasks, each form references three other forms, and half the information isn't available online",
          instructions: "Playing the bureaucracy team / Simulation of form design / Highlighting circular inefficiency",
        },
        {
          frustration: "Event planning when every venue requires different apps, non-refundable deposits, and impossible cancellation policies that change based on how they're feeling that day",
          instructions: "Playing venue managers / Satirical business simulation / Evoking planning frustration",
        },
        {
          frustration: "Utility companies that change billing systems monthly, make splitting costs a nightmare, and require everyone to sign up individually with different verification requirements",
          instructions: "Playing utility executives / Collaborative confusion creation / Experiencing systemic chaos",
        },
      ],
      competitive: [
        {
          frustration: "Apartment hunting where landlords demand credit scores, employment history, references, first-born children, and a detailed essay about why you deserve to pay three times what the place is worth",
          instructions: "Competing as landlords / Satirical rental market / Experiencing systematic exploitation",
        },
        {
          frustration: "Social media influencer culture where success is measured by engagement metrics and brand sponsorships rather than actual talent, creating fake authenticity competitions",
          instructions: "Competing as platform executives / Algorithm design satire / Highlighting manufactured superficiality",
        },
        {
          frustration: "Corporate promotion systems where being visible in meetings and networking with executives matters infinitely more than actual work quality or innovation",
          instructions: "Competing as middle managers / Workplace politics satire / Experiencing merit vs visibility",
        },
        {
          frustration: "Restaurant reservation systems that favor VIPs and regulars while making ordinary customers jump through digital hoops and waitlists that move backwards mysteriously",
          instructions: "Competing as restaurant owners / Elitist service satire / Highlighting class-based access",
        },
      ],
      cooperativeCompetitive: [
        {
          frustration: "Workplace productivity tools that supposedly increase efficiency but actually create more meetings about using the tools than time saved by using them",
          instructions: "Mixed design team perspective / Collaborative inefficiency creation / Competing for maximum time waste",
        },
        {
          frustration: "Family group chats where everyone uses different messaging apps, has different technical skill levels, and argues about which platform to use while missing important information",
          instructions: "Playing tech executives / Collaborative fragmentation / Competing for confusion metrics",
        },
        {
          frustration: "Neighborhood HOA politics where minor aesthetic choices become major community battles involving lawyers, petitions, and neighbors who take fence height personally",
          instructions: "Playing board members / Collaborative pettiness / Competing for maximum neighborhood drama",
        },
        {
          frustration: "Online gaming communities where cooperation is required to win but individual rankings create toxic competition and blame-shifting when things go wrong",
          instructions: "Playing game developers / Collaborative system design / Competing for toxicity metrics",
        },
      ],
    },
    placeholders: {
      singlePlayer: {
        frustration: "Health insurance bureaucracy that prioritizes profits over patient care...",
        instructions: "Playing the executive / Satirical simulation / Evoking systemic frustration",
      },
      cooperative: {
        frustration: "Group coordination made impossible by incompatible apps and systems...",
        instructions: "Playing the design team / Collaborative satire / Highlighting coordination failures",
      },
      competitive: {
        frustration: "Systems designed to pit individuals against each other unnecessarily...",
        instructions: "Competing as system designers / Satirical competition / Exposing manufactured rivalry",
      },
      cooperativeCompetitive: {
        frustration: "Tools that claim to help teamwork but create individual performance pressure...",
        instructions: "Mixed perspective / Collaborative design with individual metrics / Highlighting contradictory incentives",
      },
    },
  },
  "pretend-to-be": {
    suggestions: {
      singlePlayer: [
        {
          role: "emergency room doctor",
          aspects: "making life-or-death decisions under extreme time pressure with incomplete information while managing patient families and hospital bureaucracy",
          instructions: "I'm an emergency room doctor making split-second decisions about patient triage while juggling worried families, insurance approval calls, and critical supply shortages...",
        },
        {
          role: "marine biologist",
          aspects: "balancing scientific research with conservation efforts while securing limited funding and dealing with climate change impacts on marine ecosystems",
          instructions: "I'm a marine biologist discovering new species while dealing with funding cuts and witnessing the effects of climate change on ocean ecosystems...",
        },
        {
          role: "aerospace engineer",
          aspects: "designing critical life-support systems for Mars missions while managing technical failures, budget constraints, and the psychological pressure of crew safety",
          instructions: "I'm an aerospace engineer designing critical life-support systems while dealing with budget cuts and the pressure of crew safety...",
        },
        {
          role: "investigative journalist",
          aspects: "building trust with whistleblowers and sources while uncovering corporate corruption in hostile environments where powerful interests want to silence you",
          instructions: "I'm an investigative journalist uncovering corporate corruption while building trust with sources and dealing with legal and personal threats...",
        },
      ],
      cooperative: [
        {
          role: "surgical team members",
          aspects: "coordinating complex life-saving procedures while maintaining sterile environments, managing unexpected complications, and ensuring clear communication under pressure",
          instructions: "We're a cardiac surgery team performing a 12-hour heart transplant, coordinating between surgeon, anesthesiologist, and nurses while managing unexpected complications...",
        },
        {
          role: "archaeological expedition team",
          aspects: "excavating historically significant sites while preserving delicate artifacts, managing local community relationships, and dealing with funding and permit challenges",
          instructions: "We're archaeologists excavating a historical site, carefully preserving fragile artifacts while negotiating with local communities and racing against funding deadlines...",
        },
        {
          role: "disaster response firefighters",
          aspects: "coordinating rescue efforts in dangerous conditions while managing limited resources, equipment failures, and the emotional toll of emergency situations",
          instructions: "We're a wildfire response team coordinating evacuation and containment efforts with limited resources, equipment failures, and emotional challenges...",
        },
        {
          role: "space station crew members",
          aspects: "maintaining critical life support systems while conducting scientific experiments, handling emergency situations, and managing interpersonal dynamics in isolation",
          instructions: "We're a space station crew managing critical system failures while conducting experiments and dealing with interpersonal tensions in isolation...",
        },
      ],
      competitive: [
        {
          role: "rival paleontologists",
          aspects: "racing to publish groundbreaking fossil discoveries while securing excavation rights, competing for limited research funding, and dealing with academic politics",
          instructions: "We're rival paleontologists who discovered the same fossil site, racing to publish first while competing for excavation permits and research funding...",
        },
        {
          role: "competing astronaut candidates",
          aspects: "training for Mars mission selection while demonstrating technical expertise, leadership qualities, and psychological resilience under intense evaluation",
          instructions: "We're astronaut candidates competing for spots on the Mars mission, undergoing evaluations and challenges while being judged on every move...",
        },
        {
          role: "rival fashion designers",
          aspects: "creating innovative collections for international fashion weeks while managing celebrity endorsements, supply chain challenges, and rapidly changing trends",
          instructions: "We're competing fashion designers preparing for fashion week, racing to secure endorsements and manage supply chain issues while responding to trends...",
        },
        {
          role: "competitive marine researchers",
          aspects: "studying endangered species behavior while competing for research grants, publication opportunities, and access to prime research locations",
          instructions: "We're marine biologists competing to study the same endangered species, racing to publish research while competing for grants and research access...",
        },
      ],
      cooperativeCompetitive: [
        {
          role: "research lab colleagues",
          aspects: "collaborating on breakthrough medical research while competing for individual recognition, career advancement, and limited resources within the same institution",
          instructions: "We're researchers collaborating on breakthrough treatment while competing for publication authorship, leadership positions, and career funding...",
        },
        {
          role: "expedition team members",
          aspects: "working together to survive harsh Antarctic conditions while competing for leadership roles, research discoveries, and the chance to have findings named after you",
          instructions: "We're Antarctic expedition members working together to survive harsh conditions while competing for leadership roles and research discoveries...",
        },
        {
          role: "startup co-founders",
          aspects: "building a revolutionary tech company together while navigating different visions for the company's future, equity distribution, and decision-making authority",
          instructions: "We're co-founders building a company, collaborating on operations while competing for authority, equity distribution, and strategic decisions...",
        },
        {
          role: "military unit specialists",
          aspects: "completing dangerous missions as a coordinated team while competing for promotions, specialized training opportunities, and leadership positions within the unit",
          instructions: "We're military specialists completing dangerous missions as a team while competing for promotions and leadership positions...",
        },
      ],
    },
    placeholders: {
      singlePlayer: {
        role: "marine biologist",
        aspects: "balancing research with conservation while managing limited funding...",
        instructions: "Playing as a professional facing realistic challenges and decision-making...",
      },
      cooperative: {
        role: "surgical team members",
        aspects: "coordinating complex procedures under pressure...",
        instructions: "Team-based professional scenario requiring coordination and communication...",
      },
      competitive: {
        role: "rival paleontologists",
        aspects: "racing to publish discoveries while securing funding...",
        instructions: "Competitive professional scenario with opposing career objectives...",
      },
      cooperativeCompetitive: {
        role: "research lab colleagues",
        aspects: "collaborating on breakthroughs while competing for recognition...",
        instructions: "Mixed professional scenario balancing teamwork with individual career advancement...",
      },
    },
  },
  "see-your-future-self": {
    suggestions: {
      singlePlayer: [
        {
          currentSituation: "Working in corporate finance analyzing investment portfolios but passionate about environmental issues and wanting to make a meaningful impact on climate change",
          potentialChanges: "Switching to nonprofit environmental work focusing on renewable energy policy despite taking a 40% pay cut but gaining a sense of purpose and daily fulfillment",
          instructions: "I want to find out if meaningful work is worth the financial sacrifice and lifestyle changes...",
        },
        {
          currentSituation: "Living in small hometown of 3,000 people with family nearby providing emotional support but facing limited career opportunities and feeling intellectually isolated",
          potentialChanges: "Moving to Portland for a vibrant tech scene and cultural community while leaving behind family support system and dealing with higher living costs and urban stress",
          instructions: "I want to discover whether intellectual stimulation and career growth can compensate for losing close family connections...",
        },
        {
          currentSituation: "In an 8-year stable relationship with shared finances and mutual friends but lacking passion and feeling emotionally disconnected from long-term life goals",
          potentialChanges: "Ending the relationship to focus on personal growth and rediscovering individual identity while dealing with loneliness, financial independence, and rebuilding social circles",
          instructions: "I want to understand if prioritizing personal growth over relationship stability leads to greater long-term happiness...",
        },
        {
          currentSituation: "Working a comfortable corporate marketing job with excellent benefits and job security but dreaming of starting a freelance graphic design business focusing on social justice causes",
          potentialChanges: "Leaving steady employment to launch independent creative business with uncertain income but gaining creative freedom and alignment with personal values",
          instructions: "I want to explore whether creative freedom and value alignment are worth the financial uncertainty and stress...",
        },
      ],
      cooperative: [
        {
          currentSituation: "Group of college friends working different corporate jobs across the country but all feeling unfulfilled and passionate about sustainable living and community building",
          potentialChanges: "Starting an eco-friendly intentional community together while balancing individual career transitions, shared financial responsibilities, and different comfort levels with change",
          instructions: "We want to learn if collaborative life changes can create the community and fulfillment we're seeking...",
        },
        {
          currentSituation: "Three siblings who inherited the family farm but are currently living in different cities with established careers in finance, education, and technology",
          potentialChanges: "Moving back to run a modern sustainable agriculture operation while maintaining some remote work, dealing with different farming philosophies, and managing family dynamics",
          instructions: "We want to discover if we can successfully blend our different skills while honoring family traditions...",
        },
        {
          currentSituation: "College friends scattered across different states but wanting to support each other's creative dreams and missing the close community they had in school",
          potentialChanges: "Relocating to the same city to start a collaborative creative studio and shared living space while coordinating career transitions and maintaining individual artistic visions",
          instructions: "We want to find out if recreating close community can support our individual creative ambitions...",
        },
        {
          currentSituation: "Married couple both feeling burned out in demanding corporate careers while managing care for aging parents and wanting more work-life balance",
          potentialChanges: "Transitioning together to remote freelance work while becoming primary caregivers for parents, pursuing artistic passions, and redefining success metrics",
          instructions: "We want to explore whether prioritizing family care and artistic passions over career advancement strengthens our relationship...",
        },
      ],
      competitive: [
        {
          currentSituation: "Twin siblings with different visions for the family restaurant business after parents announced retirement - one wants modern fusion, the other traditional recipes",
          potentialChanges: "Competing for operational control while trying to honor family legacy, each implementing their vision, and dealing with divided staff and customer loyalty",
          instructions: "We want to understand whether our different business visions can coexist while preserving family relationships...",
        },
        {
          currentSituation: "Former college roommates who remained close friends but both developed feelings for the same person they met at a mutual friend's wedding last year",
          potentialChanges: "Navigating romantic competition while trying to preserve friendship, dealing with jealousy and loyalty conflicts, and making decisions about pursuit versus stepping aside",
          instructions: "We want to discover if competing for the same person destroys our friendship or teaches us about healthy boundaries...",
        },
        {
          currentSituation: "Two coworkers who started as entry-level employees and became friends, now both up for the same senior management promotion requiring relocation to different cities",
          potentialChanges: "Competing professionally while maintaining personal friendship, weighing career advancement against relationship impact, and dealing with workplace politics and resentment",
          instructions: "We want to learn whether prioritizing career advancement over friendship leads to personal fulfillment or regret...",
        },
        {
          currentSituation: "Twin artists who developed different creative philosophies but share the same gallery representation and are often compared by critics and buyers",
          potentialChanges: "Pursuing individual artistic recognition while dealing with constant comparisons, market competition for collector attention, and pressure to differentiate their work",
          instructions: "We want to find out if pursuing individual artistic recognition strengthens or damages our twin bond...",
        },
      ],
      cooperativeCompetitive: [
        {
          currentSituation: "Business partners who built a successful tech consulting company together but now have different visions for expansion - one wants rapid scaling, the other sustainable growth",
          potentialChanges: "Balancing daily operational collaboration while competing for strategic control, investor attention, and implementation of conflicting business philosophies",
          instructions: "We want to explore whether our conflicting business philosophies strengthen or weaken our partnership...",
        },
        {
          currentSituation: "Band members who love creating music together but have different ambitions - some want commercial success, others prioritize artistic integrity",
          potentialChanges: "Maintaining creative partnership while pursuing individual side projects, solo opportunities, and dealing with different definitions of success and artistic compromise",
          instructions: "We want to discover if pursuing individual music careers enhances or damages our collaborative creativity...",
        },
        {
          currentSituation: "Academic research partners collaborating on groundbreaking climate science while building individual reputations in a competitive field with limited tenure positions",
          potentialChanges: "Sharing research discoveries while competing for job opportunities, individual recognition, and the pressure to be first author on publications",
          instructions: "We want to understand whether academic competition helps or hinders our scientific collaboration...",
        },
        {
          currentSituation: "Family members running a successful restaurant together but disagreeing about modernization - updating technology and menu versus preserving traditional atmosphere and recipes",
          potentialChanges: "Preserving family business traditions while adapting to modern market demands, balancing individual career aspirations with family expectations and legacy preservation",
          instructions: "We want to learn if we can modernize our family business while preserving what makes it special...",
        },
      ],
    },
    placeholders: {
      singlePlayer: {
        currentSituation: "Stable corporate job but dreaming of meaningful career change...",
        potentialChanges: "Pursuing passion despite financial uncertainty and lifestyle changes...",
        instructions: "Future self reflecting on the decision to pursue passion and its consequences...",
      },
      cooperative: {
        currentSituation: "Friends scattered but wanting to support each other's dreams...",
        potentialChanges: "Relocating together to start collaborative venture with shared risks...",
        instructions: "Future selves reflecting on how collaborative life changes affected relationships...",
      },
      competitive: {
        currentSituation: "Close relationship complicated by competing goals or interests...",
        potentialChanges: "Navigating competition while trying to preserve important bonds...",
        instructions: "Future selves exploring how competition affected important relationships...",
      },
      cooperativeCompetitive: {
        currentSituation: "Partnership with shared goals but different visions for the future...",
        potentialChanges: "Balancing collaboration with individual ambitions and recognition...",
        instructions: "Future selves reflecting on balancing partnership with individual aspirations...",
      },
    },
  },
  "read-with-kids": {
    suggestions: {
      singlePlayer: [
        {
          kidAge: "5",
          instructions: "I'm a field mouse trying to save my burrow village from the giant tabby cat by using my knowledge of the Big House's secret passages...",
        },
        {
          kidAge: "7",
          instructions: "I'm a curious child who discovered that my backyard shed is actually a portal to the Underground Kingdom of friendly mole people...",
        },
        {
          kidAge: "9",
          instructions: "I'm an apprentice wizard learning to control my color-magic at the academy, where spells gone wrong turn homework rainbow-colored...",
        },
        {
          kidAge: "12",
          instructions: "I'm a young fox trying to solve the mystery of why all the forest berries taste like vanilla suddenly...",
        },
      ],
      cooperative: [
        {
          kidAge: "5-8",
          instructions: "We're the Backyard Brigade working together to build the best fort before winter...",
        },
        {
          kidAge: "6-9",
          instructions: "We're student wizards at the academy learning teamwork spells while preparing for the annual Friendship Festival...",
        },
        {
          kidAge: "7-10",
          instructions: "We're the animal rescue squad saving forest friends from getting lost during the Big Storm using our different skills...",
        },
        {
          kidAge: "4-12",
          instructions: "We're young inventors in the treehouse laboratory creating helpful gadgets for our neighborhood friends...",
        },
      ],
      competitive: [
        {
          kidAge: "8-12",
          instructions: "We're rival baking teams at the Annual Forest Cake Contest, where creativity and teamwork matter more than winning...",
        },
        {
          kidAge: "10-14",
          instructions: "We're young knights training at different castles, competing in friendly challenges that test courage and kindness...",
        },
        {
          kidAge: "9-13",
          instructions: "We're student magicians from different magical schools competing in the Goodwill Games, where showing good sportsmanship earns extra points...",
        },
        {
          kidAge: "7-11",
          instructions: "We're young explorers from different clubs racing to find the legendary Friendship Treasure, discovering that sharing clues helps everyone...",
        },
      ],
      cooperativeCompetitive: [
        {
          kidAge: "6-12",
          instructions: "We're members of different animal clubs working together during the Great Forest Emergency while also trying to show which club is most helpful...",
        },
        {
          kidAge: "8-14",
          instructions: "We're young adventurers sharing a quest to help the Dragon Queen while each hoping to be chosen as her special apprentice...",
        },
        {
          kidAge: "7-13",
          instructions: "We're classmates working on group projects while also competing for the Student of the Month award through individual achievements...",
        },
        {
          kidAge: "5-11",
          instructions: "We're neighborhood kids building the Ultimate Treehouse together while each contributing our special skills and hoping our part gets the most attention...",
        },
      ],
    },
    placeholders: {
      singlePlayer: {
        kidAge: "9",
        instructions: "Child-friendly adventure story with positive themes and age-appropriate content...",
      },
      cooperative: {
        kidAge: "6-9",
        instructions: "Collaborative children's story emphasizing teamwork and friendship...",
      },
      competitive: {
        kidAge: "9-13",
        instructions: "Friendly competitive children's story where good sportsmanship matters most...",
      },
      cooperativeCompetitive: {
        kidAge: "7-12",
        instructions: "Mixed children's story balancing teamwork with individual recognition...",
      },
    },
  },
  "learn-something": {
    suggestions: {
      singlePlayer: [
        {
          learningGoals: "Budget allocation and profit margins",
          targetAudience: "middle school students",
          instructions: "I'm running a lemonade stand learning to track expenses, calculate profit margins, and make decisions about reinvesting earnings while dealing with seasonal demand changes...",
        },
        {
          learningGoals: "Hypothesis formation and data analysis",
          targetAudience: "elementary science students",
          instructions: "I'm a student wizard using the scientific method to solve why levitation spells keep failing - forming hypotheses, testing variables, and analyzing results...",
        },
        {
          learningGoals: "Predator-prey relationships",
          targetAudience: "high school environmental science students",
          instructions: "I'm a park ranger tracking wolf and deer populations to understand ecosystem balance and the effects of weather patterns on wildlife...",
        },
        {
          learningGoals: "Campaign dynamics",
          targetAudience: "high school civics students",
          instructions: "I'm running for student body president, learning about organizing rallies, voter outreach, and making budget allocation decisions...",
        },
      ],
      cooperative: [
        {
          learningGoals: "Market research and ethical sourcing",
          targetAudience: "high school business students",
          instructions: "We're starting an eco-friendly business together, collaborating on market research, cost analysis, and ethical sourcing decisions...",
        },
        {
          learningGoals: "Molecular biology and cellular cooperation",
          targetAudience: "high school biology students",
          instructions: "We're studying photosynthesis as a team, each tracking different molecules and learning how cellular systems cooperate...",
        },
        {
          learningGoals: "Movement coordination strategies",
          targetAudience: "high school history students",
          instructions: "We're researching how historical movements coordinated economic boycotts, communication networks, and collective action...",
        },
        {
          learningGoals: "Resource allocation and group decision-making",
          targetAudience: "middle school leadership students",
          instructions: "We're managing our school's limited activity budget, learning to balance competing needs and use collective decision-making...",
        },
      ],
      competitive: [
        {
          learningGoals: "Risk management and currency exchange",
          targetAudience: "high school economics students",
          instructions: "We're rival Renaissance merchant families competing to establish profitable trade routes, learning about currency exchange rates and risk management...",
        },
        {
          learningGoals: "Atmospheric pressure and temperature gradients",
          targetAudience: "middle school earth science students",
          instructions: "We're competing weather systems learning about atmospheric physics as we battle for dominance, demonstrating pressure gradients and climate patterns...",
        },
        {
          learningGoals: "Media influence and coalition building",
          targetAudience: "high school government students",
          instructions: "We're competing campaign managers learning about political strategy through different media approaches and coalition building...",
        },
        {
          learningGoals: "Supply and demand in frontier markets",
          targetAudience: "high school STEM students",
          instructions: "We're rival asteroid mining corporations learning about supply and demand, efficiency optimization, and resource management in space...",
        },
      ],
      cooperativeCompetitive: [
        {
          learningGoals: "Profit margins and strategic planning",
          targetAudience: "high school business students",
          instructions: "We're siblings running our family's restaurant chain, cooperating on daily operations while competing for leadership roles and learning about management decisions...",
        },
        {
          learningGoals: "Academic ethics and peer review",
          targetAudience: "college science students",
          instructions: "We're graduate students collaborating on research while competing for publication recognition, learning about academic ethics and peer review...",
        },
        {
          learningGoals: "Ecosystem interconnections and impact measurement",
          targetAudience: "college environmental studies students",
          instructions: "We're park rangers cooperating on wildlife protection while competing for conservation funding and learning to measure environmental impact...",
        },
        {
          learningGoals: "Innovation processes and intellectual property",
          targetAudience: "college entrepreneurship students",
          instructions: "We're inventors collaborating on renewable energy technology while competing for patents and learning about innovation and market analysis...",
        },
      ],
    },
    placeholders: {
      singlePlayer: {
        learningGoals: "Financial literacy through running a business with real economic challenges...",
        targetAudience: "middle school students",
        instructions: "Playing a character who learns the subject through hands-on experience and problem-solving...",
      },
      cooperative: {
        learningGoals: "Team economics and collaboration through starting a business together...",
        targetAudience: "high school students",
        instructions: "Collaborative scenario where players learn together through shared challenges...",
      },
      competitive: {
        learningGoals: "Economic competition and strategy through historical trade scenarios...",
        targetAudience: "high school students",
        instructions: "Competitive educational scenario where players learn through strategic rivalry...",
      },
      cooperativeCompetitive: {
        learningGoals: "Business cooperation with individual advancement through family company simulation...",
        targetAudience: "college students",
        instructions: "Mixed scenario balancing cooperative learning with individual achievement...",
      },
    },
  },
};