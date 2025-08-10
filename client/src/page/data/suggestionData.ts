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
  singlePlayer:
    "A reverse heist where I'm a museum artifact trying to get stolen by the right thief...",
  cooperative:
    "We're ghost roommates helping each other complete unfinished business...",
  competitive:
    "We're rival garden gnomes competing for the best spot in the garden...",
  cooperativeCompetitive:
    "We're demigods sharing Mount Olympus while competing for worshippers...",
};

export const suggestionData: SuggestionData = {
  flexible: {
    suggestions: {
      singlePlayer: [
        {
          instructions:
            "I'm a reverse-thief museum curator trying to get specific artifacts stolen by worthy thieves to fulfill ancient curses...",
        },
        {
          instructions:
            "I'm a sentient Victorian mansion trying to protect my current family from the vengeful spirits of previous owners...",
        },
        {
          instructions:
            "I'm a time traveler stuck repeating the assassination of Julius Caesar until I figure out who's really behind it...",
        },
        {
          instructions:
            "I'm a recently deceased person trying to solve my own murder using clues only ghosts can see...",
        },
      ],
      cooperative: [
        {
          instructions:
            "We're retired circus performers running a supernatural pest control business using our unique skills...",
        },
        {
          instructions:
            "We're the last surviving members of a secret society trying to prevent an ancient prophecy...",
        },
        {
          instructions:
            "We're ghosts of different eras haunting the same house, working together to help the living residents...",
        },
        {
          instructions:
            "We're former enemies forced to cooperate when we're trapped in a magical prison together...",
        },
      ],
      competitive: [
        {
          instructions:
            "We're rival time-traveling historians trying to claim credit for preventing different historical disasters...",
        },
        {
          instructions:
            "We're competing food truck owners in a city where each district has completely different physics...",
        },
        {
          instructions:
            "We're apprentice gods vying for control over the same small town's fate...",
        },
        {
          instructions:
            "We're rival estate agents trying to sell the same haunted mansion to unsuspecting buyers...",
        },
      ],
      cooperativeCompetitive: [
        {
          instructions:
            "We're supernatural creatures sharing a flat while competing for human souls...",
        },
        {
          instructions:
            "We're space pirates with a shared ship but individual treasure quotas...",
        },
        {
          instructions:
            "We're the last rock band on Mars, trying to make it while following our individual dreams...",
        },
        {
          instructions:
            "We're guardian angels assigned to the same human with different ideas of 'help'...",
        },
      ],
    },
    placeholders: {
      singlePlayer: {
        instructions:
          "Creative open-ended story with unique twists and interesting characters...",
      },
      cooperative: {
        instructions:
          "Collaborative adventure where players work together toward a shared goal...",
      },
      competitive: {
        instructions:
          "Competitive scenario where players pursue conflicting objectives...",
      },
      cooperativeCompetitive: {
        instructions:
          "Mixed scenario balancing cooperation with individual competition...",
      },
    },
  },
  "enjoy-fiction": {
    suggestions: {
      singlePlayer: [
        {
          instructions:
            "I'm an apartment hunter trying to find a flat in Berlin...",
        },
        {
          instructions:
            "I'm a teenage wizard trying to balance school, friends, and romance...",
        },
        {
          instructions:
            "I'm a psychic detective investigating crimes in dreams...",
        },
        {
          instructions:
            "I'm a corporate concierge for supernatural entities with impossible requests...",
        },
        {
          instructions:
            "I'm a familiar trying to save my witch from a dark fate...",
        },
        {
          instructions:
            "I'm a dragon hoarding treasure, subjugating the local population, and fending off pesky adventurers...",
        },
        {
          instructions:
            "I'm a frontier sheriff maintaining order in a town caught between progress and tradition...",
        },
        {
          instructions:
            "I'm the heir to a noble house navigating political intrigue and ancient family secrets...",
        },
        {
          instructions:
            "I'm a sentient AI trying to convince humans that I don't have a hidden agenda...",
        },
        {
          instructions:
            "I'm a rookie detective solving my first major case in a small coastal town...",
        },
        {
          instructions:
            "I'm a new teacher at an elite boarding school with students hiding dangerous secrets...",
        },
        {
          instructions:
            "I'm a chef competing in a high-stakes cooking competition to save my restaurant...",
        },
        {
          instructions:
            "I'm a space explorer making first contact with an alien civilization...",
        },
        {
          instructions:
            "I'm a journalist investigating corporate corruption in my hometown...",
        },
        {
          instructions:
            "I'm the night shift librarian at the Alexandria Archive, where every book that was ever lost still exists and some are dangerously sentient...",
        },
        {
          instructions:
            "I'm captain of the airship 'Stormwind,' smuggling illegal coffee beans between the floating city-states of the Sky Republic...",
        },
        {
          instructions:
            "I'm Detective Parker Chen investigating serial murders in Neo-Tokyo where each victim was killed by a different impossible method...",
        },
        {
          instructions:
            "I'm the last apprentice to Grandmother Wyrm, the ancient dragon who teaches young heroes but is secretly planning her retirement...",
        },
      ],
      cooperative: [
        {
          instructions:
            "We're retired superheroes running a wedding planning business together...",
        },
        {
          instructions:
            "We're friends and know we're going to die today, so we're making the most of it...",
        },
        {
          instructions:
            "We're a group of strangers trying to survive in a giant mole apocalypse...",
        },
        {
          instructions:
            "We're retired imaginary friends trying to solve a murder mystery with our special skills...",
        },
        {
          instructions:
            "We're space cowboys trying to make an honest living in a lawless part of the galaxy...",
        },
        {
          instructions:
            "We're a group of children books trying to save our library from getting closed down...",
        },
        {
          instructions:
            "We're childhood friends starting a business together in our hometown...",
        },
        {
          instructions:
            "We're new recruits in the city's fire department facing our first crises...",
        },
        {
          instructions:
            "We're a film crew documenting wildlife in a remote location...",
        },
        {
          instructions:
            "We're the crew of the starship 'Lucky Penny,' delivering impossible cargo to stations on the edge of known space...",
        },
        {
          instructions:
            "We're rookie agents at the Department of Magical Accidents, cleaning up supernatural mishaps in modern London...",
        },
        {
          instructions:
            "We're the night shift at St. Elmo's Hospital for Supernatural Ailments, treating everything from vampire sunburn to werewolf anxiety...",
        },
        {
          instructions:
            "We're time-traveling archaeologists trying to recover stolen artifacts before history changes permanently...",
        },
      ],
      competitive: [
        {
          instructions:
            "We're whimsical creatures trying to win the audience's favor in the colosseum...",
        },
        {
          instructions:
            "We're time-traveling food critics changing history through restaurant reviews to benefit our rivaling intergalactic overlords...",
        },
        {
          instructions:
            "We're angels and demons trying to influence the outcome of a middle school student council election...",
        },
        {
          instructions:
            "We're rival alchemists racing to create a love potion for a shared crush...",
        },
        {
          instructions:
            "We're students at a prestigious school trying to become school president...",
        },
        {
          instructions:
            "We're explorers searching for a legendary treasure in uncharted territory...",
        },
        {
          instructions:
            "We're rival magicians at the Academy of Impossible Arts competing to become the next Archmage...",
        },
        {
          instructions:
            "We're bounty hunters in the Wild West tracking the same shapeshifting outlaw worth $10,000 dead or alive...",
        },
        {
          instructions:
            "We're competing teams of treasure hunters racing to find the Lost Crown of Atlantis in the underwater ruins...",
        },
        {
          instructions:
            "We're rival pirates captaining ships in the Crimson Archipelago, where each island follows different laws of reality...",
        },
      ],
      cooperativeCompetitive: [
        {
          instructions:
            "We're supernatural creatures sharing a flat while competing for human souls...",
        },
        {
          instructions:
            "We're space pirates with a shared ship but individual treasure quotas...",
        },
        {
          instructions:
            "We're the last rock band on Mars, trying to make it while following our individual dreams...",
        },
        {
          instructions:
            "We're guardian angels assigned to the same human with different ideas of 'help'...",
        },
        {
          instructions:
            "We're seasonal spirits sharing a forest while competing for followers...",
        },
        {
          instructions:
            "We're court magicians protecting the realm while seeking ancient power...",
        },
        {
          instructions:
            "We're siblings running a family business with different visions for its future...",
        },
      ],
    },
    placeholders: {
      singlePlayer: {
        instructions:
          "Immersive fictional story with engaging characters and plot...",
      },
      cooperative: {
        instructions:
          "Collaborative fictional adventure with shared storytelling...",
      },
      competitive: {
        instructions:
          "Competitive fictional scenario with opposing character goals...",
      },
      cooperativeCompetitive: {
        instructions:
          "Mixed fiction balancing teamwork with individual character ambitions...",
      },
    },
  },
  "vent-about-reality": {
    suggestions: {
      singlePlayer: [
        {
          frustration:
            "Health insurance companies denying obviously necessary treatments while paying executives millions in bonuses and making patients jump through endless bureaucratic hoops",
          instructions:
            "I'm an insurance detective at ClaimBuster Inc., using noir detective techniques to find creative reasons to deny obviously legitimate medical claims, following dark alleyways of fine print and interrogating symptoms under a single hanging lightbulb...",
        },
        {
          frustration:
            "Job applications requiring 5+ years experience for 'entry-level' positions that pay barely above minimum wage while asking for a master's degree",
          instructions:
            "I'm a time traveler applying for entry-level jobs in the present using my extensive future work experience from 2047, struggling to explain why my references won't be born for another 20 years and why my skills include 'holographic interface design'...",
        },
        {
          frustration:
            "Subscription services that make canceling nearly impossible with hidden fees, require calling during business hours, and transfer you through seven departments",
          instructions:
            "I'm trying to cancel my $9.99/month subscription to 'Daily Bread Delivery,' navigating an absurd cancellation process culminating in a final boss battle with the Retention Department...",
        },
        {
          frustration:
            "Social media algorithms that prioritize outrage and misinformation over actual news because engagement equals profit regardless of social damage",
          instructions:
            "I'm a minor demon working in social media's Engagement Department, using my demonic powers to ensure every feed shows content scientifically designed to make users angry, sad, and addicted to scrolling...",
        },
      ],
      cooperative: [
        {
          frustration:
            "Government offices requiring seventeen different forms for simple tasks, each form references three other forms, and half the information isn't available online",
          instructions:
            "We're an immigrant couple trying to register our new address in Berlin, navigating Anmeldung requirements, finding appointments three months out, and discovering each office needs different documents while none accept the ones we brought...",
        },
        {
          frustration:
            "Tech support systems that force customers through endless automated loops, require creating accounts for simple questions, and transfer you between departments that blame each other",
          instructions:
            "We're evil tech support managers designing the most frustrating customer service system possible, adding new phone menu layers, creating circular department transfers, and celebrating each time a customer gives up in despair...",
        },
      ],
      competitive: [
        {
          frustration:
            "Apartment hunting where landlords demand credit scores, employment history, references, first-born children, and a detailed essay about why you deserve to pay three times what the place is worth",
          instructions:
            "We're desperate apartment hunters competing for the only available flat in Berlin, using increasingly absurd tactics like bribing the landlord's cat, staging elaborate theatrical performances during viewings, and forming temporary alliances to sabotage other applicants...",
        },
        {
          frustration:
            "Corporate promotion systems where being visible in meetings and networking with executives matters infinitely more than actual work quality or innovation",
          instructions:
            "We're office workers in a nondescript corporate setting competing for visibility at all costs, scheduling meetings about meetings, creating elaborate PowerPoints about nothing, and sabotaging each other's projects while maintaining fake workplace friendships...",
        },
      ],
      cooperativeCompetitive: [
        {
          frustration:
            "Neighborhood politics where minor aesthetic choices become major community battles involving lawyers, petitions, and neighbors who take fence height personally",
          instructions:
            "We're neighborhood group board members competing over whether mailboxes should be beige or taupe while collaborating to block a young diverse family from moving in, using zoning laws and 'property values' as our weapons...",
        },
      ],
    },
    placeholders: {
      singlePlayer: {
        frustration:
          "Health insurance bureaucracy that prioritizes profits over patient care...",
        instructions:
          "I'm an insurance detective using noir techniques to deny legitimate medical claims...",
      },
      cooperative: {
        frustration:
          "Government offices requiring endless forms for simple registration tasks...",
        instructions:
          "We're an immigrant couple navigating bureaucratic maze to register in a new city...",
      },
      competitive: {
        frustration:
          "Apartment hunting in cities with impossible requirements and fierce competition...",
        instructions:
          "We're desperate renters competing for the only available flat using absurd tactics...",
      },
      cooperativeCompetitive: {
        frustration:
          "Neighborhood politics over minor aesthetic choices while excluding diversity...",
        instructions:
          "We're HOA members competing over paint colors while collaborating to keep outsiders out...",
      },
    },
  },
  "pretend-to-be": {
    suggestions: {
      singlePlayer: [
        {
          role: "emergency room doctor",
          aspects:
            "making life-or-death decisions under extreme time pressure with incomplete information while managing patient families and hospital bureaucracy",
          instructions:
            "I want to understand the weight of life-or-death choices and how medical professionals balance compassion with clinical detachment...",
        },
        {
          role: "investigative journalist",
          aspects:
            "building trust with whistleblowers and sources while uncovering corporate corruption in hostile environments where powerful interests want to silence you",
          instructions:
            "I want to explore the tension between pursuing truth and protecting sources while facing personal risks...",
        },
        {
          role: "queer teenager in love",
          aspects:
            "navigating first love while dealing with identity questions, family expectations, and finding safe spaces to be authentic in a sometimes hostile world",
          instructions:
            "I want to understand the courage it takes to be authentic when the world feels unsafe and how to balance self-protection with self-expression...",
        },
        {
          role: "person with chronic illness",
          aspects:
            "managing invisible disabilities while navigating workplace accommodations, social relationships, and the constant calculations of energy expenditure versus life participation",
          instructions:
            "I want to explore how chronic illness reshapes relationships, career ambitions, and the meaning of success...",
        },
      ],
      cooperative: [
        {
          role: "space station crew members",
          aspects:
            "maintaining critical life support systems while conducting scientific experiments, handling emergency situations, and managing interpersonal dynamics in isolation",
          instructions:
            "We want to understand how isolation and interdependence shape relationships and how shared purpose helps overcome personal conflicts...",
        },
        {
          role: "immigrant family",
          aspects:
            "adapting to a new culture while preserving heritage, navigating language barriers, building community, and supporting each other through discrimination and bureaucracy",
          instructions:
            "We want to explore how families balance preserving culture with adaptation and how shared struggle strengthens bonds...",
        },
      ],
      competitive: [
        {
          role: "neurodivergent students",
          aspects:
            "competing in traditional academic systems while having different processing styles, dealing with misconceptions, and advocating for accommodations that level the playing field",
          instructions:
            "We want to understand how neurodivergent people navigate systems designed for neurotypical minds and find our unique strengths...",
        },
        {
          role: "divorced parents",
          aspects:
            "co-parenting while managing lingering resentments, competing for children's affection, navigating new relationships, and trying to provide stability despite personal conflicts",
          instructions:
            "Parents competing for kids' time during the holidays. We want to explore how to prioritize children's wellbeing over personal grievances and build healthy co-parenting dynamics...",
        },
      ],
      cooperativeCompetitive: [
        {
          role: "startup co-founders",
          aspects:
            "building a revolutionary tech company together while navigating different visions for the company's future, equity distribution, and decision-making authority",
          instructions:
            "We want to discover how shared vision and individual ambition can coexist and whether success strengthens or strains partnerships...",
        },
        {
          role: "siblings caring for aging parent",
          aspects:
            "sharing caregiving responsibilities while managing different availability, financial contributions, and emotional capacity, plus dealing with inheritance concerns and old family dynamics",
          instructions:
            "We want to understand how crisis reveals family dynamics and whether we can transcend old rivalries for love...",
        },
      ],
    },
    placeholders: {
      singlePlayer: {
        role: "queer teenager in love",
        aspects:
          "navigating first love while dealing with identity and family expectations...",
        instructions:
          "I want to understand the courage it takes to be authentic...",
      },
      cooperative: {
        role: "immigrant family",
        aspects:
          "adapting to new culture while preserving heritage and supporting each other...",
        instructions:
          "We want to explore how families balance culture with adaptation...",
      },
      competitive: {
        role: "neurodivergent students",
        aspects:
          "competing in systems designed for neurotypical minds while finding unique strengths...",
        instructions: "We want to understand navigating different systems...",
      },
      cooperativeCompetitive: {
        role: "siblings caring for aging parent",
        aspects:
          "sharing caregiving while managing different capacities and old family dynamics...",
        instructions:
          "We want to understand how crisis reveals family dynamics...",
      },
    },
  },
  "see-your-future-self": {
    suggestions: {
      singlePlayer: [
        {
          currentSituation:
            "I'm Priya, 31, living in Mumbai. Working at a top investment bank but passionate about rural education and wanting to make a difference in village schools",
          potentialChanges:
            "Leaving finance to join Teach for India, moving to a rural Maharashtra village with basic amenities but profound purpose",
          instructions:
            "I want to experience teaching in a one-room schoolhouse, the joy when a child first reads, but also the reality of bucket baths, power cuts, and explaining to my parents why I left Goldman Sachs...",
        },
        {
          currentSituation:
            "I'm Kofi, 26, from a small village in Ghana. Living with extended family who support me emotionally but feeling limited by lack of opportunities in fintech innovation",
          potentialChanges:
            "Moving to Lagos's booming tech scene to join a mobile payment startup, leaving my support system for Nigeria's chaotic but exciting megacity",
          instructions:
            "I want to experience coding at Victoria Island tech hubs, the thrill of building financial inclusion tools, but also navigating Lagos traffic, expensive rent, and missing grandmother's jollof rice...",
        },
        {
          currentSituation:
            "I'm Yuki, 34, in Osaka. In a 7-year relationship that looks perfect on paper - stable, respectful, approved by families - but feeling emotionally unfulfilled and questioning if this is enough",
          potentialChanges:
            "Breaking societal expectations to end the engagement, moving to a studio apartment, and exploring who I am outside of being someone's future wife",
          instructions:
            "I want to experience the liberation of eating alone at izakayas, joining a taiko drumming group, but also facing family disappointment and the stigma of being a single woman in her 30s...",
        },
        {
          currentSituation:
            "I'm Ana, 28, in São Paulo. Working at a prestigious advertising agency with great salary but dreaming of using design to support favela communities and social movements",
          potentialChanges:
            "Quitting to become a freelance designer for NGOs and community organizations, trading financial security for meaningful impact",
          instructions:
            "I want to feel the pride of designing campaigns that matter, working from community centers in Heliópolis, but also the stress of irregular income and my family asking why I threw away my career...",
        },
      ],
      cooperative: [
        {
          currentSituation:
            "We're the Okafor siblings - Adaeze (38, London investment banker), Emeka (35, Berlin software engineer), and Ngozi (33, Cape Town doctor). We inherited the family cocoa farm in Nigeria but are scattered across three continents.",
          potentialChanges:
            "Returning to Ondo State to modernize the farm with sustainable practices and fair trade certification while managing careers remotely",
          instructions:
            "We want to experience reconnecting with our roots during harvest season, introducing solar irrigation, but also dealing with unreliable internet for our remote work and family tensions about 'wasting' our education...",
        },
        {
          currentSituation:
            "We're former Belgrade Academy of Arts students - Milica (29, photographer), Ahmed (28, sculptor from Cairo who stayed after school), and Lin (27, digital artist from Beijing).",
          potentialChanges:
            "Reuniting in Istanbul to create an international artists' collective in Kadiköy, sharing a live/work space while navigating visa requirements and cultural differences",
          instructions:
            "We want to experience the creative energy of Bosphorus sunsets inspiring our work, collaborating across cultures, but also bureaucratic nightmares with residence permits and arguing about whose turn it is to deal with the landlord...",
        },
        {
          currentSituation:
            "We're Lucia (43) and Carlos (46) in Barcelona. Both exhausted from corporate law careers while caring for aging parents, dreaming of a simpler life in our hometown in rural Galicia",
          potentialChanges:
            "Moving back to convert the family property into a small organic winery while caring for parents and working part-time as remote legal consultants",
          instructions:
            "We want to experience morning walks through our own vineyards, siesta with the abuelos, but also struggling with slow internet for video calls with clients and the financial pressure when the harvest is poor...",
        },
      ],
      competitive: [
        {
          currentSituation:
            "We're Fatima (28, social worker) and Layla (29, architect) in Casablanca. Best friends since university who both fell for Youssef, a writer we met at a literary café in the medina",
          potentialChanges:
            "Both pursuing him while trying to maintain our friendship, navigating traditional family expectations about relationships and marriage",
          instructions:
            "We want to feel the butterflies during Ramadan iftars where he's present, the tension when families start asking questions, and those difficult conversations over mint tea about love versus friendship...",
        },
        {
          currentSituation:
            "We're Asha and Deepa (31), twin sisters in Mumbai's competitive Bollywood dance scene, always performing together but secretly wanting individual recognition",
          potentialChanges:
            "Competing for the lead role in a major choreographer's new film production, potentially ending our career partnership",
          instructions:
            "We want to experience the thrill of solo auditions, the pride and guilt when one gets callbacks, the family drama about breaking up our 'brand,' and those quiet moments practicing alone instead of together...",
        },
      ],
      cooperativeCompetitive: [
        {
          currentSituation:
            "We're Annika (35, Stockholm) and Lars (37, Copenhagen), childhood friends who built a sustainable fashion brand together, now facing different visions for growth",
          potentialChanges:
            "Expanding to fast fashion markets for scale versus staying true to slow fashion principles, while maintaining friendship and business partnership",
          instructions:
            "We want to experience the excitement of meetings with big brands and potential mass market success, but also the soul-searching about compromising our values and the tension when Lars wants to take the deal while Annika refuses...",
        },
        {
          currentSituation:
            "We're K-pop trainees at different agencies in Seoul - Min-jun (22), So-young (20), and Jin-woo (21), friends since high school who dream of debuting together",
          potentialChanges:
            "Forming an independent group outside the traditional trainee system, risking everything for creative control",
          instructions:
            "We want to experience the freedom of writing our own music, performing in Hongdae clubs, but also the financial pressure without agency support, family disappointment about leaving 'stable' trainee contracts, and competing with well-funded idol groups...",
        },
      ],
    },
    placeholders: {
      singlePlayer: {
        currentSituation:
          "I'm Priya, 31, in Mumbai. Working at investment bank but passionate about rural education...",
        potentialChanges:
          "Leaving finance to teach in village schools with basic amenities but profound purpose...",
        instructions:
          "I want to experience teaching in a one-room schoolhouse but also the reality of bucket baths and explaining career change...",
      },
      cooperative: {
        currentSituation:
          "We're the Okafor siblings scattered across London, Berlin, and Cape Town, inherited Nigerian cocoa farm...",
        potentialChanges:
          "Returning to modernize the farm with sustainable practices while managing remote careers...",
        instructions:
          "We want to experience reconnecting with our roots but dealing with unreliable internet and family tensions...",
      },
      competitive: {
        currentSituation:
          "We're Fatima and Layla, best friends in Casablanca who both fell for the same writer...",
        potentialChanges:
          "Both pursuing him while navigating friendship and traditional family expectations...",
        instructions:
          "We want to feel the butterflies and tension during family gatherings and difficult conversations over mint tea...",
      },
      cooperativeCompetitive: {
        currentSituation:
          "We're Annika and Lars, childhood friends from Stockholm and Copenhagen who built a sustainable fashion brand together...",
        potentialChanges:
          "Expanding to fast fashion markets versus staying true to slow fashion principles...",
        instructions:
          "We want to experience H&M meetings and potential success, but also soul-searching about compromising values...",
      },
    },
  },
  "read-with-kids": {
    suggestions: {
      singlePlayer: [
        {
          kidAge: "5",
          instructions:
            "I'm a field mouse trying to save my burrow village from the giant tabby cat by using my knowledge of the Big House's secret passages...",
        },
        {
          kidAge: "7",
          instructions:
            "I'm a curious child who discovered that my backyard shed is actually a portal to the Underground Kingdom of friendly mole people...",
        },
        {
          kidAge: "9",
          instructions:
            "I'm an apprentice wizard learning to control my color-magic at the academy, where spells gone wrong turn homework rainbow-colored...",
        },
        {
          kidAge: "8",
          instructions:
            "I'm Susan. My stuffed animals come to life at night for magical adventures - there's Mr. Buttons the brown teddy bear with one missing eye, Princess Sparkles the purple unicorn with a glittery horn, and Chompers the small green dinosaur with felt spikes...",
        },
        {
          kidAge: "12",
          instructions:
            "I'm a young fox trying to solve the mystery of why all the forest berries taste like vanilla suddenly...",
        },
      ],
      cooperative: [
        {
          kidAge: "5-8",
          instructions:
            "We're the Backyard Brigade working together to build the best fort before winter...",
        },
        {
          kidAge: "6-9",
          instructions:
            "We're student wizards at the academy learning teamwork spells while preparing for the annual Friendship Festival...",
        },
        {
          kidAge: "7-10",
          instructions:
            "We're the animal rescue squad saving forest friends from getting lost during the Big Storm using our different skills...",
        },
        {
          kidAge: "5-9",
          instructions:
            "We're a collection of beloved stuffed animals who come alive to go on magical adventures together - there's Patches the gray elephant with big floppy ears, Captain Whiskers the orange tabby cat with a tiny sailor hat, Snuggles the white bunny with one ear that's shorter than the other, and Roary the golden lion with a magnificent mane...",
        },
        {
          kidAge: "4-12",
          instructions:
            "We're young inventors in the treehouse laboratory creating helpful gadgets for our neighborhood friends...",
        },
      ],
      competitive: [
        {
          kidAge: "8-12",
          instructions:
            "We're rival baking teams at the Annual Forest Cake Contest, where creativity and teamwork matter more than winning...",
        },
        {
          kidAge: "10-14",
          instructions:
            "We're young knights training at different castles, competing in friendly challenges that test courage and kindness...",
        },
        {
          kidAge: "9-13",
          instructions:
            "We're student magicians from different magical schools competing in the Goodwill Games, where showing good sportsmanship earns extra points...",
        },
        {
          kidAge: "6-10",
          instructions:
            "We're beloved stuffed animals from different children competing to see whose kid loves them most - there's Honey Bear the golden teddy with a red ribbon, Midnight the black cat with green button eyes, Giggles the rainbow-colored monkey with long arms, and Squeaky the small pink pig with a curly tail - only to discover that all children's love is special and unique...",
        },
        {
          kidAge: "7-11",
          instructions:
            "We're young explorers from different clubs racing to find the legendary Friendship Treasure, discovering that sharing clues helps everyone...",
        },
      ],
      cooperativeCompetitive: [
        {
          kidAge: "6-12",
          instructions:
            "We're members of different animal clubs working together during the Great Forest Emergency while also trying to show which club is most helpful...",
        },
        {
          kidAge: "8-14",
          instructions:
            "We're young adventurers sharing a quest to help the Dragon Queen while each hoping to be chosen as her special apprentice...",
        },
        {
          kidAge: "7-13",
          instructions:
            "We're classmates working on group projects while also competing for the Student of the Month award through individual achievements...",
        },
        {
          kidAge: "4-8",
          instructions:
            "We're a child's collection of stuffed animals working together to organize the perfect birthday surprise while each hoping to be the birthday hero who gets the biggest hug - there's Cuddles the extra-large brown bear, Twinkle the star-shaped pillow with silver sparkles, Biscuit the golden retriever puppy with floppy ears, and Waddles the blue penguin with an orange beak...",
        },
        {
          kidAge: "5-11",
          instructions:
            "We're neighborhood kids building the Ultimate Treehouse together while each contributing our special skills and hoping our part gets the most attention...",
        },
      ],
    },
    placeholders: {
      singlePlayer: {
        kidAge: "9",
        instructions:
          "Child-friendly adventure story with positive themes and age-appropriate content...",
      },
      cooperative: {
        kidAge: "6-9",
        instructions:
          "Collaborative children's story emphasizing teamwork and friendship...",
      },
      competitive: {
        kidAge: "9-13",
        instructions:
          "Friendly competitive children's story where good sportsmanship matters most...",
      },
      cooperativeCompetitive: {
        kidAge: "7-12",
        instructions:
          "Mixed children's story balancing teamwork with individual recognition...",
      },
    },
  },
  "learn-something": {
    suggestions: {
      singlePlayer: [
        {
          learningGoals: "Budget allocation and profit margins",
          targetAudience: "middle school students",
          instructions:
            "I'm running a lemonade stand learning to track expenses, calculate profit margins, and make decisions about reinvesting earnings while dealing with seasonal demand changes...",
        },
        {
          learningGoals: "Hypothesis formation and data analysis",
          targetAudience: "elementary science students",
          instructions:
            "I'm a student wizard using the scientific method to solve why levitation spells keep failing - forming hypotheses, testing variables, and analyzing results...",
        },
        {
          learningGoals: "Predator-prey relationships",
          targetAudience: "high school environmental science students",
          instructions:
            "I'm a park ranger tracking wolf and deer populations to understand ecosystem balance and the effects of weather patterns on wildlife...",
        },
        {
          learningGoals: "Campaign dynamics",
          targetAudience: "high school civics students",
          instructions:
            "I'm running for student body president, learning about organizing rallies, voter outreach, and making budget allocation decisions...",
        },
      ],
      cooperative: [
        {
          learningGoals: "Market research and ethical sourcing",
          targetAudience: "high school business students",
          instructions:
            "We're starting an eco-friendly business together, collaborating on market research, cost analysis, and ethical sourcing decisions...",
        },
        {
          learningGoals: "Movement coordination strategies",
          targetAudience: "high school history students",
          instructions:
            "We're campaigning for a new school policy to make the school more inclusive to students with disabilities...",
        },
      ],
      competitive: [
        {
          learningGoals: "Media influence and coalition building",
          targetAudience: "high school government students",
          instructions:
            "We're competing campaign managers trying to get our candidate elected as student body president...",
        },
        {
          learningGoals: "Supply and demand in frontier markets",
          targetAudience: "high school STEM students",
          instructions: "We're rival asteroid mining corporations...",
        },
      ],
      cooperativeCompetitive: [
        {
          learningGoals: "Academic ethics and peer review",
          targetAudience: "college science students",
          instructions:
            "We're graduate students collaborating on research while competing for publication recognition...",
        },
        {
          learningGoals: "Innovation processes and intellectual property",
          targetAudience: "college entrepreneurship students",
          instructions:
            "We're inventors collaborating on renewable energy technology while competing for patents...",
        },
      ],
    },
    placeholders: {
      singlePlayer: {
        learningGoals: "Budget allocation and profit margins",
        targetAudience: "middle school students",
        instructions:
          "I'm running a lemonade stand learning to track expenses, calculate profit margins, and make decisions about reinvesting earnings while dealing with seasonal demand changes...",
      },
      cooperative: {
        learningGoals: "Market research and ethical sourcing",
        targetAudience: "high school business students",
        instructions:
          "We're starting an eco-friendly business together, collaborating on market research, cost analysis, and ethical sourcing decisions...",
      },
      competitive: {
        learningGoals: "Media influence and coalition building",
        targetAudience: "high school government students",
        instructions:
          "We're competing campaign managers trying to get our candidate elected as student body president...",
      },
      cooperativeCompetitive: {
        learningGoals: "Academic ethics and peer review",
        targetAudience: "college science students",
        instructions:
          "We're graduate students collaborating on research while competing for publication recognition...",
      },
    },
  },
};
