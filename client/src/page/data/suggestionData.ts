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
          instructions: "We're the evil tech support overlords at AutoLoop Industries, designing the most frustrating phone trees and automated systems to ensure no customer ever reaches a human being, competing to see who can add the most pointless menu options...",
        },
        {
          frustration: "Government offices requiring seventeen different forms for simple tasks, each form references three other forms, and half the information isn't available online",
          instructions: "We're the bureaucracy design team at the Department of Circular Paperwork, creating forms that reference other forms in an endless loop, celebrating when citizens need to visit seven different offices for a simple permit...",
        },
        {
          frustration: "Event planning when every venue requires different apps, non-refundable deposits, and impossible cancellation policies that change based on how they're feeling that day",
          instructions: "We're the venue management team developing the most predatory cancellation policies and incompatible booking systems, high-fiving when someone loses their deposit because they used the wrong app or called on a Wednesday...",
        },
        {
          frustration: "Utility companies that change billing systems monthly, make splitting costs a nightmare, and require everyone to sign up individually with different verification requirements",
          instructions: "We're the utility company executives brainstorming new ways to make billing impossible to understand, adding random fees and changing the system monthly to maximize confusion and late payment charges...",
        },
      ],
      competitive: [
        {
          frustration: "Apartment hunting where landlords demand credit scores, employment history, references, first-born children, and a detailed essay about why you deserve to pay three times what the place is worth",
          instructions: "We're rival landlords competing to create the most outrageous rental requirements, seeing who can demand the most ridiculous qualifications for a studio apartment with no windows that costs $3000/month...",
        },
        {
          frustration: "Social media influencer culture where success is measured by engagement metrics and brand sponsorships rather than actual talent, creating fake authenticity competitions",
          instructions: "We're competing social media platform executives designing algorithms that reward the most vapid content and punish genuine creativity, celebrating when authentic artists give up and start making dance videos...",
        },
        {
          frustration: "Corporate promotion systems where being visible in meetings and networking with executives matters infinitely more than actual work quality or innovation",
          instructions: "We're rival middle managers competing to perfect the art of looking important in meetings while contributing nothing, seeing who can get promoted fastest through pure networking and buzzword usage...",
        },
        {
          frustration: "Restaurant reservation systems that favor VIPs and regulars while making ordinary customers jump through digital hoops and waitlists that move backwards mysteriously",
          instructions: "We're competing restaurant owners designing the most elitist reservation systems, seeing who can make ordinary people jump through the most ridiculous hoops while VIPs waltz right in...",
        },
      ],
      cooperativeCompetitive: [
        {
          frustration: "Workplace productivity tools that supposedly increase efficiency but actually create more meetings about using the tools than time saved by using them",
          instructions: "We're the productivity software design team working together to create tools that generate maximum inefficiency, while competing to see whose feature can waste the most time with mandatory training sessions and update meetings...",
        },
        {
          frustration: "Family group chats where everyone uses different messaging apps, has different technical skill levels, and argues about which platform to use while missing important information",
          instructions: "We're tech company executives collaborating to fragment communication by making our messaging apps incompatible, while competing to see whose platform can be the most confusing for people over 40...",
        },
        {
          frustration: "Neighborhood HOA politics where minor aesthetic choices become major community battles involving lawyers, petitions, and neighbors who take fence height personally",
          instructions: "We're HOA board members working together to create the most petty and arbitrary rules possible, while competing to see who can cause the biggest neighborhood drama over mailbox colors and garden gnome heights...",
        },
        {
          frustration: "Online gaming communities where cooperation is required to win but individual rankings create toxic competition and blame-shifting when things go wrong",
          instructions: "We're game developers collaborating to design multiplayer systems that require teamwork but reward individual stats, competing to see whose features can create the most toxic player behavior and blame-shifting...",
        },
      ],
    },
    placeholders: {
      singlePlayer: {
        frustration: "Health insurance bureaucracy that prioritizes profits over patient care...",
        instructions: "Playing as the CEO gleefully designing the most predatory insurance policies...",
      },
      cooperative: {
        frustration: "Group coordination made impossible by incompatible apps and systems...",
        instructions: "Working together as the evil design team creating maximally frustrating systems...",
      },
      competitive: {
        frustration: "Systems designed to pit individuals against each other unnecessarily...",
        instructions: "Competing to design the most unfair and predatory business practices...",
      },
      cooperativeCompetitive: {
        frustration: "Tools that claim to help teamwork but create individual performance pressure...",
        instructions: "Collaborating to design systems while competing to create maximum individual toxicity...",
      },
    },
  },
  "pretend-to-be": {
    suggestions: {
      singlePlayer: [
        {
          role: "emergency room doctor",
          aspects: "making life-or-death decisions under extreme time pressure with incomplete information while managing patient families and hospital bureaucracy",
          instructions: "I'm Dr. Elena Vasquez, emergency room doctor at St. Mercy Hospital, making split-second decisions about patient triage while juggling worried families, insurance approval calls, and a shortage of critical supplies during the night shift...",
        },
        {
          role: "marine biologist",
          aspects: "balancing scientific research with conservation efforts while securing limited funding and dealing with climate change impacts on marine ecosystems",
          instructions: "I'm Dr. Marina Santos, marine biologist discovering that the new species in the Mariana Trench has been trying to communicate with satellites while my funding gets cut and coral reefs die around me...",
        },
        {
          role: "aerospace engineer",
          aspects: "designing critical life-support systems for Mars missions while managing technical failures, budget constraints, and the psychological pressure of crew safety",
          instructions: "I'm Engineer Alex Chen, designing the oxygen recycling system for the first Mars colony while dealing with budget cuts that force me to use cheaper components, knowing that any failure means six people die in space...",
        },
        {
          role: "investigative journalist",
          aspects: "building trust with whistleblowers and sources while uncovering corporate corruption in hostile environments where powerful interests want to silence you",
          instructions: "I'm journalist Sam Rivera, investigating pharmaceutical corruption while building trust with anonymous sources, dodging corporate lawyers, and dealing with death threats as I uncover how executives knew their drugs were killing people...",
        },
      ],
      cooperative: [
        {
          role: "surgical team members",
          aspects: "coordinating complex life-saving procedures while maintaining sterile environments, managing unexpected complications, and ensuring clear communication under pressure",
          instructions: "We're the cardiac surgery team at Metropolitan Hospital performing a 12-hour heart transplant, coordinating between surgeon, anesthesiologist, and nurses while managing unexpected bleeding and ensuring perfect sterile protocol...",
        },
        {
          role: "archaeological expedition team",
          aspects: "excavating historically significant sites while preserving delicate artifacts, managing local community relationships, and dealing with funding and permit challenges",
          instructions: "We're archaeologists excavating a newly discovered Mayan site, carefully preserving fragile 1000-year-old pottery while negotiating with local communities about land access and racing against our expiring permits and funding deadline...",
        },
        {
          role: "disaster response firefighters",
          aspects: "coordinating rescue efforts in dangerous conditions while managing limited resources, equipment failures, and the emotional toll of emergency situations",
          instructions: "We're wildfire response team coordinating evacuation and containment efforts with limited water resources, malfunctioning communication equipment, and the emotional weight of not being able to save every home...",
        },
        {
          role: "space station crew members",
          aspects: "maintaining critical life support systems while conducting scientific experiments, handling emergency situations, and managing interpersonal dynamics in isolation",
          instructions: "We're the International Space Station crew managing a critical oxygen system failure while conducting time-sensitive experiments, dealing with interpersonal tensions after six months in isolation...",
        },
      ],
      competitive: [
        {
          role: "rival paleontologists",
          aspects: "racing to publish groundbreaking fossil discoveries while securing excavation rights, competing for limited research funding, and dealing with academic politics",
          instructions: "We're rival paleontologists who discovered the same Tyrannosaurus rex site, racing to publish first while competing for excavation permits, National Geographic funding, and academic tenure track positions...",
        },
        {
          role: "competing astronaut candidates",
          aspects: "training for Mars mission selection while demonstrating technical expertise, leadership qualities, and psychological resilience under intense evaluation",
          instructions: "We're the final four astronaut candidates competing for two spots on the Mars mission, undergoing psychological evaluations, technical tests, and leadership challenges while NASA observers judge our every move...",
        },
        {
          role: "rival fashion designers",
          aspects: "creating innovative collections for international fashion weeks while managing celebrity endorsements, supply chain challenges, and rapidly changing trends",
          instructions: "We're competing fashion designers preparing for Milan Fashion Week, racing to secure celebrity endorsements and manage fabric supply chain issues while creating collections that respond to rapidly changing social media trends...",
        },
        {
          role: "competitive marine researchers",
          aspects: "studying endangered species behavior while competing for research grants, publication opportunities, and access to prime research locations",
          instructions: "We're marine biologists competing to study the same endangered whale pod, racing to publish behavioral research while competing for limited boat time, research grants, and access to the protected sanctuary waters...",
        },
      ],
      cooperativeCompetitive: [
        {
          role: "research lab colleagues",
          aspects: "collaborating on breakthrough medical research while competing for individual recognition, career advancement, and limited resources within the same institution",
          instructions: "We're cancer researchers collaborating on a breakthrough treatment while competing for first authorship on publications, lab leadership positions, and the limited post-doc funding that determines our careers...",
        },
        {
          role: "expedition team members",
          aspects: "working together to survive harsh Antarctic conditions while competing for leadership roles, research discoveries, and the chance to have findings named after you",
          instructions: "We're Antarctic research expedition members working together to survive blizzards and equipment failures while competing to lead the mission and have our individual geological discoveries named after us...",
        },
        {
          role: "startup co-founders",
          aspects: "building a revolutionary tech company together while navigating different visions for the company's future, equity distribution, and decision-making authority",
          instructions: "We're co-founders building a revolutionary AI company, collaborating on daily operations while competing for CEO authority, equity distribution, and whether to take venture capital or remain independent...",
        },
        {
          role: "military unit specialists",
          aspects: "completing dangerous missions as a coordinated team while competing for promotions, specialized training opportunities, and leadership positions within the unit",
          instructions: "We're elite military specialists completing dangerous covert missions as a coordinated team while competing for promotions, selection to even more elite units, and leadership positions within our squadron...",
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
          instructions: "I'm 50-year-old me looking back at the decision to leave corporate finance for environmental nonprofit work, reflecting on how the pay cut affected my lifestyle but how much more fulfilled I feel working on renewable energy policy that actually helps the planet...",
        },
        {
          currentSituation: "Living in small hometown of 3,000 people with family nearby providing emotional support but facing limited career opportunities and feeling intellectually isolated",
          potentialChanges: "Moving to Portland for a vibrant tech scene and cultural community while leaving behind family support system and dealing with higher living costs and urban stress",
          instructions: "I'm 38-year-old me living in Portland after moving from my small hometown, reflecting on how the vibrant tech scene and cultural community intellectually stimulated me but how I miss family gatherings and struggle with urban isolation despite being surrounded by people...",
        },
        {
          currentSituation: "In an 8-year stable relationship with shared finances and mutual friends but lacking passion and feeling emotionally disconnected from long-term life goals",
          potentialChanges: "Ending the relationship to focus on personal growth and rediscovering individual identity while dealing with loneliness, financial independence, and rebuilding social circles",
          instructions: "I'm 42-year-old me reflecting on ending my long-term relationship to focus on personal growth, exploring how the initial loneliness was difficult but how rediscovering my individual identity and rebuilding my social circle from scratch ultimately led to deeper self-understanding...",
        },
        {
          currentSituation: "Working a comfortable corporate marketing job with excellent benefits and job security but dreaming of starting a freelance graphic design business focusing on social justice causes",
          potentialChanges: "Leaving steady employment to launch independent creative business with uncertain income but gaining creative freedom and alignment with personal values",
          instructions: "I'm 45-year-old me looking back at leaving my secure marketing job to start my freelance graphic design business, reflecting on how the uncertain income was stressful but how designing for social justice causes gave me creative freedom and alignment with my values that made the financial sacrifice worthwhile...",
        },
      ],
      cooperative: [
        {
          currentSituation: "Group of college friends working different corporate jobs across the country but all feeling unfulfilled and passionate about sustainable living and community building",
          potentialChanges: "Starting an eco-friendly intentional community together while balancing individual career transitions, shared financial responsibilities, and different comfort levels with change",
          instructions: "We're 45-year-old versions of ourselves who left our corporate jobs to start the eco-friendly intentional community we always dreamed about, reflecting on how we navigated individual career transitions, shared the financial risks, and dealt with different comfort levels about leaving stable careers...",
        },
        {
          currentSituation: "Three siblings who inherited the family farm but are currently living in different cities with established careers in finance, education, and technology",
          potentialChanges: "Moving back to run a modern sustainable agriculture operation while maintaining some remote work, dealing with different farming philosophies, and managing family dynamics",
          instructions: "We're older versions of ourselves who moved back to run the family farm together, reflecting on how we balanced modern sustainable agriculture with our different professional backgrounds, dealt with conflicting farming philosophies, and navigated complicated family dynamics while working together daily...",
        },
        {
          currentSituation: "College friends scattered across different states but wanting to support each other's creative dreams and missing the close community they had in school",
          potentialChanges: "Relocating to the same city to start a collaborative creative studio and shared living space while coordinating career transitions and maintaining individual artistic visions",
          instructions: "We're older versions of ourselves who relocated to the same city to start our collaborative creative studio, reflecting on how we coordinated major career transitions, supported each other's artistic visions, and recreated the close community we missed from college...",
        },
        {
          currentSituation: "Married couple both feeling burned out in demanding corporate careers while managing care for aging parents and wanting more work-life balance",
          potentialChanges: "Transitioning together to remote freelance work while becoming primary caregivers for parents, pursuing artistic passions, and redefining success metrics",
          instructions: "We're future versions of ourselves who left corporate careers for remote freelance work, reflecting on how we became primary caregivers for our aging parents, pursued our artistic passions, and completely redefined what success means to us as a couple...",
        },
      ],
      competitive: [
        {
          currentSituation: "Twin siblings with different visions for the family restaurant business after parents announced retirement - one wants modern fusion, the other traditional recipes",
          potentialChanges: "Competing for operational control while trying to honor family legacy, each implementing their vision, and dealing with divided staff and customer loyalty",
          instructions: "We're twin siblings 10 years later, competing versions of ourselves who fought for control of the family restaurant, reflecting on how our different visions led to divided staff loyalty, customer confusion, and family tension while we tried to honor our parents' legacy...",
        },
        {
          currentSituation: "Former college roommates who remained close friends but both developed feelings for the same person they met at a mutual friend's wedding last year",
          potentialChanges: "Navigating romantic competition while trying to preserve friendship, dealing with jealousy and loyalty conflicts, and making decisions about pursuit versus stepping aside",
          instructions: "We're future versions of ourselves reflecting on how our romantic competition affected our friendship, exploring whether the jealousy and loyalty conflicts were worth it and how our decisions about pursuit versus stepping aside shaped our relationship patterns...",
        },
        {
          currentSituation: "Two coworkers who started as entry-level employees and became friends, now both up for the same senior management promotion requiring relocation to different cities",
          potentialChanges: "Competing professionally while maintaining personal friendship, weighing career advancement against relationship impact, and dealing with workplace politics and resentment",
          instructions: "We're older versions of ourselves reflecting on how professional competition affected our friendship, exploring whether career advancement was worth the relationship strain and how workplace politics and resentment changed us as people...",
        },
        {
          currentSituation: "Twin artists who developed different creative philosophies but share the same gallery representation and are often compared by critics and buyers",
          potentialChanges: "Pursuing individual artistic recognition while dealing with constant comparisons, market competition for collector attention, and pressure to differentiate their work",
          instructions: "We're older twin artists reflecting on how pursuing individual recognition affected our relationship, exploring how constant comparisons and market competition shaped our artistic development and whether the pressure to differentiate was ultimately beneficial or destructive...",
        },
      ],
      cooperativeCompetitive: [
        {
          currentSituation: "Business partners who built a successful tech consulting company together but now have different visions for expansion - one wants rapid scaling, the other sustainable growth",
          potentialChanges: "Balancing daily operational collaboration while competing for strategic control, investor attention, and implementation of conflicting business philosophies",
          instructions: "We're future business partners 10 years later, reflecting on how we balanced collaboration with competition for strategic control, exploring how our different visions for rapid vs. sustainable growth affected our partnership and whether our conflicting business philosophies ultimately strengthened or weakened the company...",
        },
        {
          currentSituation: "Band members who love creating music together but have different ambitions - some want commercial success, others prioritize artistic integrity",
          potentialChanges: "Maintaining creative partnership while pursuing individual side projects, solo opportunities, and dealing with different definitions of success and artistic compromise",
          instructions: "We're older band members reflecting on how we maintained our creative partnership while pursuing individual recognition, exploring how our different definitions of success led to artistic compromises and whether our solo projects enhanced or damaged our collaborative music...",
        },
        {
          currentSituation: "Academic research partners collaborating on groundbreaking climate science while building individual reputations in a competitive field with limited tenure positions",
          potentialChanges: "Sharing research discoveries while competing for job opportunities, individual recognition, and the pressure to be first author on publications",
          instructions: "We're older academic colleagues reflecting on how we shared research discoveries while competing for career advancement, exploring how the pressure for individual recognition and first authorship affected our collaboration and whether our competitive field ultimately helped or hindered our scientific progress...",
        },
        {
          currentSituation: "Family members running a successful restaurant together but disagreeing about modernization - updating technology and menu versus preserving traditional atmosphere and recipes",
          potentialChanges: "Preserving family business traditions while adapting to modern market demands, balancing individual career aspirations with family expectations and legacy preservation",
          instructions: "We're older family members reflecting on how we modernized the restaurant while preserving traditions, exploring how we balanced individual career aspirations with family expectations and whether our approach to legacy preservation successfully adapted to modern market demands...",
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
          kidAge: "4-5",
          instructions: "I'm Pip the field mouse, trying to save my burrow village from the giant tabby cat Mr. Whiskers by using my knowledge of the Big House's secret passages...",
        },
        {
          kidAge: "6-7",
          instructions: "I'm Sam the curious 8-year-old who discovered that my backyard shed is actually a portal to the Underground Kingdom of friendly mole people...",
        },
        {
          kidAge: "8-10",
          instructions: "I'm apprentice wizard Luna learning to control my color-magic at Miss Sparkle's Academy, where spells gone wrong turn homework rainbow-colored...",
        },
        {
          kidAge: "11-13",
          instructions: "I'm Sage the young fox trying to solve the mystery of why all the forest berries taste like vanilla suddenly...",
        },
      ],
      cooperative: [
        {
          kidAge: "5-8 mixed ages",
          instructions: "We're the Backyard Brigade - Max the rabbit, Zoe the squirrel, and Sam the hedgehog - working together to build the best fort before winter...",
        },
        {
          kidAge: "6-9 mixed ages",
          instructions: "We're student wizards at Crystal Creek Academy learning teamwork spells while preparing for the annual Friendship Festival...",
        },
        {
          kidAge: "7-10 mixed ages",
          instructions: "We're the animal rescue squad saving forest friends from getting lost during the Big Storm using our different skills...",
        },
        {
          kidAge: "4-12 wide range",
          instructions: "We're young inventors in the treehouse laboratory creating helpful gadgets for our neighborhood friends...",
        },
      ],
      competitive: [
        {
          kidAge: "8-12 competitive age",
          instructions: "We're rival baking teams at the Annual Forest Cake Contest, where creativity and teamwork matter more than winning...",
        },
        {
          kidAge: "10-14 competitive age",
          instructions: "We're young knights training at different castles, competing in friendly challenges that test courage and kindness...",
        },
        {
          kidAge: "9-13 competitive age",
          instructions: "We're student magicians from different magical schools competing in the Goodwill Games, where showing good sportsmanship earns extra points...",
        },
        {
          kidAge: "7-11 competitive age",
          instructions: "We're young explorers from different clubs racing to find the legendary Friendship Treasure, discovering that sharing clues helps everyone...",
        },
      ],
      cooperativeCompetitive: [
        {
          kidAge: "6-12 mixed cooperation/competition",
          instructions: "We're members of different animal clubs working together during the Great Forest Emergency while also trying to show which club is most helpful...",
        },
        {
          kidAge: "8-14 mixed cooperation/competition",
          instructions: "We're young adventurers sharing a quest to help the Dragon Queen while each hoping to be chosen as her special apprentice...",
        },
        {
          kidAge: "7-13 mixed cooperation/competition",
          instructions: "We're classmates working on group projects while also competing for the Student of the Month award through individual achievements...",
        },
        {
          kidAge: "5-11 mixed cooperation/competition",
          instructions: "We're neighborhood kids building the Ultimate Treehouse together while each contributing our special skills and hoping our part gets the most attention...",
        },
      ],
    },
    placeholders: {
      singlePlayer: {
        kidAge: "8-10",
        instructions: "Child-friendly adventure story with positive themes and age-appropriate content...",
      },
      cooperative: {
        kidAge: "6-9 mixed ages",
        instructions: "Collaborative children's story emphasizing teamwork and friendship...",
      },
      competitive: {
        kidAge: "9-13 competitive age",
        instructions: "Friendly competitive children's story where good sportsmanship matters most...",
      },
      cooperativeCompetitive: {
        kidAge: "7-12 mixed cooperation/competition",
        instructions: "Mixed children's story balancing teamwork with individual recognition...",
      },
    },
  },
  "learn-something": {
    suggestions: {
      singlePlayer: [
        {
          learningGoals: "Financial literacy: budgeting, saving, and compound interest through running a lemonade empire that evolves into a multi-product business with suppliers, employees, and seasonal challenges",
          targetAudience: "middle school students",
          instructions: "I'm 12-year-old Alex starting with a simple lemonade stand but learning to track expenses, calculate profit margins, reinvest earnings into new products, hire neighborhood friends as employees, and deal with seasonal demand changes while building a multi-product beverage empire...",
        },
        {
          learningGoals: "Scientific method: hypothesis formation, experimentation, and data analysis through solving magical mysteries in a wizard academy where spells follow scientific principles",
          targetAudience: "elementary science students",
          instructions: "I'm student wizard Sam at Arcane Academy, using the scientific method to solve why levitation spells keep failing - forming hypotheses about wand materials, testing different incantation variables, collecting data on success rates, and analyzing results to understand the underlying magical principles...",
        },
        {
          learningGoals: "Environmental science: ecosystem balance, conservation, and sustainability through managing a virtual national park with endangered species, weather patterns, and human impact factors",
          targetAudience: "high school environmental science students",
          instructions: "I'm park ranger Jordan managing Silverwood National Park, learning about predator-prey relationships by tracking wolf and deer populations, understanding how weather patterns affect plant growth, and balancing human recreation with wildlife conservation efforts...",
        },
        {
          learningGoals: "History and civics: democratic processes, civic engagement, and historical change through organizing and running a student government campaign with real policy decisions",
          targetAudience: "high school civics students",
          instructions: "I'm high school student Taylor running for student body president, learning about democratic processes by organizing campaign rallies, understanding civic engagement through voter outreach, and making real policy decisions about budget allocation for school clubs and facilities...",
        },
      ],
      cooperative: [
        {
          learningGoals: "Collaborative economics: market research, cost analysis, and ethical sourcing through starting an eco-friendly business together with shared financial responsibilities and decision-making",
          targetAudience: "high school business students",
          instructions: "We're high school friends starting EcoSoap Co-op, collaborating on market research by surveying classmates, sharing cost analysis of organic ingredients vs. conventional materials, learning about ethical sourcing from local suppliers, and making shared financial decisions about profit distribution...",
        },
        {
          learningGoals: "Team-based science: molecular biology and ecosystem interconnections through tracking different aspects of photosynthesis while learning how natural systems depend on cooperation",
          targetAudience: "high school biology students",
          instructions: "We're biology students studying photosynthesis as a team, with each member tracking different molecules (CO2, H2O, glucose, oxygen), learning how chloroplasts, stomata, and root systems must cooperate for plants to convert sunlight into food, just like our research team must cooperate to understand the full process...",
        },
        {
          learningGoals: "Social studies and organizing: how historical movements used cooperation, communication, and shared strategy to create lasting social and political change",
          targetAudience: "high school history students",
          instructions: "We're student organizers researching the Civil Rights Movement, learning how different groups coordinated economic boycotts, shared communication strategies through underground networks, and used collective action to create lasting political change...",
        },
        {
          learningGoals: "Resource management and group dynamics: balancing competing needs for limited resources while maintaining team cohesion, fair distribution, and collective decision-making",
          targetAudience: "middle school leadership students",
          instructions: "We're student council members managing our school's limited activity budget, learning to balance competing club needs, maintain team cohesion during difficult decisions, ensure fair distribution of resources, and use collective decision-making processes to allocate funds...",
        },
      ],
      competitive: [
        {
          learningGoals: "Competitive economics and finance: establishing profitable trade routes in historical settings while learning about risk management, international finance, and market competition",
          targetAudience: "high school economics students",
          instructions: "We're rival Renaissance merchant families competing to establish the most profitable spice trade routes from Venice to Constantinople, learning about currency exchange rates, managing risks from pirates and storms, negotiating international contracts, and competing for limited shipping licenses...",
        },
        {
          learningGoals: "Meteorology through competition: playing different weather systems competing for atmospheric influence while demonstrating scientific principles of pressure, temperature, and climate patterns",
          targetAudience: "middle school earth science students",
          instructions: "We're competing weather systems - high pressure fronts vs. low pressure storms - learning about atmospheric physics as we battle for dominance, demonstrating how temperature differences create pressure gradients, how humidity affects precipitation, and how wind patterns emerge from our competition...",
        },
        {
          learningGoals: "Political strategy and communication: running rival historical campaigns using different tactics like grassroots organizing, media influence, and coalition building to win elections",
          targetAudience: "high school government students",
          instructions: "We're competing campaign managers in the 1960 Kennedy vs. Nixon election, learning about political strategy through grassroots organizing, using different media approaches (radio vs. television), building coalitions with labor unions and business groups, and understanding how communication styles affect voter perception...",
        },
        {
          learningGoals: "Space economics and resource allocation: competing asteroid mining operations learning about supply and demand, efficiency optimization, and sustainable resource management in harsh environments",
          targetAudience: "high school STEM students",
          instructions: "We're rival asteroid mining corporations competing for rare earth elements, learning about supply and demand in space markets, optimizing fuel efficiency for long-distance mining operations, managing resource scarcity in harsh space environments, and understanding economic trade-offs in frontier industries...",
        },
      ],
      cooperativeCompetitive: [
        {
          learningGoals: "Mixed business economics: family business simulation balancing operational cooperation with individual leadership ambitions while learning about management, finance, and strategic planning",
          targetAudience: "high school business students",
          instructions: "We're siblings running our family's pizza restaurant chain, cooperating on daily operations like supply chain management and staff scheduling while competing for leadership roles, learning about profit margins, strategic expansion planning, and balancing family relationships with business decisions...",
        },
        {
          learningGoals: "Collaborative research dynamics: working together on scientific discoveries while competing for individual recognition, learning about academic ethics, peer review, and career advancement",
          targetAudience: "college science students",
          instructions: "We're graduate students collaborating on climate change research, sharing data and resources to make breakthrough discoveries while competing for first authorship on publications, learning about peer review processes, academic ethics, and how individual recognition affects career advancement...",
        },
        {
          learningGoals: "Environmental stewardship with competition: managing shared ecosystems while competing for conservation funding, public support, and measurable environmental impact results",
          targetAudience: "college environmental studies students",
          instructions: "We're park rangers managing different sections of the same wilderness area, cooperating on wildlife protection and visitor safety while competing for limited conservation funding, learning about ecosystem interconnections and how to measure and communicate environmental impact to gain public support...",
        },
        {
          learningGoals: "Innovation and entrepreneurship: collaborating on technological breakthroughs while competing for patents, market share, and investor attention in emerging technology sectors",
          targetAudience: "college entrepreneurship students",
          instructions: "We're young inventors working together on renewable energy technology while competing for patents and investor funding, learning about innovation processes, intellectual property law, market analysis, and how to balance collaboration with competitive business interests...",
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