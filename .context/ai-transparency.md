# AI transparency record (EU AI Act, Art. 50)

_Last assessed: 2026-09-25 · by: agent run (ai-act-disclosure skill, improvement mode) · skill facts verified: 2026-09-25 · next re-test: 2026-11-15_

<!-- Next re-test: 2026-11-15, the owner's review date for the text-watermark decision (§5), ahead of the 2 Dec 2026 deadline.
     Otherwise whenever a feature, model or pipeline changes, and at least every six months (rec.). -->

> Not legal advice. This is an engineering record of how this project meets the AI Act's transparency duties. The latest full assessment is `DOCS/2026-09-25_ai-act-disclosure-assessment.md`, which is local and not versioned. Its row numbers are cited below as "A-row n".

How to keep this true:
- Update it in the same change that adds or alters an AI feature, a model id, a label, or an image or export pipeline.
- Keep current state only. Delete finished open items.

## 1. Roles

| Item | Value | Evidence |
|---|---|---|
| Name on the system (F1) | "Chosen Path" at chosenpath.ai. A private individual runs it under that name; he is named in the site footer. It is not incorporated. | `client/src/page/components/Footer.tsx:95-124`; `client/index.html:14`; `client/src/page/static/ForStorytellers.tsx:91` |
| Our role | **Both.** Provider of the Chosen Path AI system, built on OpenAI models [AIA Art. 3(3); G ¶¶10–11]. Deployer for what the operator publishes himself: library templates and covers an admin approves, site illustrations, launch posts [G ¶15]. | assessment §2 |
| Partner and written role split (F6) | None today. A new steward is being sought, and nothing is in writing (ASK-OWNER, §11). | `client/src/page/static/Stewardship.tsx:13-16` |
| Audience; minors or vulnerable users (F2) | Public. Anyone can create and play without a login. **Minors: yes** ("Read with Kids"). Emotionally vulnerable users are plausible ("Vent about Reality", "Meet your Future Self", the therapist and coach pages). | `server/src/stories/storyRoutes.ts` (`verifyUser({ required: false })`); `client/src/page/Page.tsx:96-130` |
| Professional or personal (F3) | Not purely personal, so the Art. 50(4) deployer duties apply [G ¶19]. Whether it is "placed on the market" is open (brief §10 q2–q4): it is free, donation-funded, offers a commercial licence, and plans a premium tier. | `Footer.tsx:115`; `Page.tsx:193`; `Stewardship.tsx:76-83` |
| Open source; hosted instance, and whether it runs today (F5) | AGPL-3.0-or-later. Hosted at chosenpath.ai and api.chosenpath.ai on Render; assumed to be running. | `LICENSE`; `.context/deployment.md` |
| Code of Practice signatory | No | — |

Architecture and processors: no `.context/system-overview.md` exists yet. The only AI vendor is OpenAI, through LangChain `ChatOpenAI` for text and the `openai` SDK for images. The `@langchain/anthropic` and `@langchain/google-genai` packages are installed but unused.

## 2. AI features

Model ids are the code defaults in `server/src/config.ts`. Render environment variables may override them (ASK-OWNER, §11). A text override can only pick another OpenAI model, because the class and the key are OpenAI's.

| # | Feature | Call site | Vendor · model id | Modality | Length | Mode | Destination | Human review | First public (F4) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Story narrator: beats, interludes, options, threads and switches, pregenerated beats, AI-assigned odds | `server/src/game/services/AIStoryGenerator.ts`; `prompts/BeatPromptService.ts` | OpenAI · `gpt-4.1-mini` (`TEXT_MODEL_NAME`, `SWITCH_THREAD_MODEL_NAME`) | text | beats **≥200** (5–6 paragraphs, about 400–800 tokens); titles, options, interludes and odds <200 | conversational (turn-based choices) | the session's players; stored and replayable | none | ≤2025-05-24 |
| 2 | Custom-story setup from a free-text premise | `server/src/stories/StoryCreationService.ts`; `AIStoryGenerator.ts` | OpenAI · `gpt-4.1` (`GENERATION_MODEL_NAME`) | text | **≥200** in aggregate | one-shot form | creator and co-players; stored | none | ≤2025-05-24 |
| 3 | In-game images: beat illustrations, custom-story cover, custom-story portraits | `server/src/images/openaiImageClient.ts`; `AIImageGenerator.ts`; `game/services/StoryImageJobs.ts` | OpenAI · `gpt-image-2.5-flare` (`IMAGE_GENERATION_MODEL`) | image | — | background | the session's players; served publicly by URL | none | Apr 2025 (model changed 2026-09-24) |
| 4 | Template-editor images: element images, identity portraits, template cover | `server/src/images/imageGenerationRoutes.ts`; `AIImageGenerator.ts` | OpenAI · `gpt-image-2.5-sunburst` (`IMAGE_GENERATION_TEMPLATE_MODEL`) | image | — | one-shot (worldbuilder or admin) | editor; after an admin publishes, the library and the home carousel | worldbuilder keeps or regenerates; an admin publishes | ~2025-05 |
| 5 | AI Worldbuilding Assistant: AI Draft and AI Iteration | `server/src/templates/templateRoutes.ts`; `TemplateService.ts` | OpenAI · `gpt-4.1` (`GENERATION_MODEL_NAME`) | text | **≥200** in aggregate | one-shot form | editor; World text in the library after admin approval | creator edits and accepts section by section; an admin publishes | ~2025-08 |
| 6 | Content filter on premises, AI Draft and Iteration prompts, and template-editor image requests | `server/src/game/services/ContentFilterService.ts`; `images/imageRequestScreening.ts` | OpenAI · `gpt-4.1-mini` (`CONTENT_FILTER_MODEL_NAME`) | classification plus short reason | <200 | background | the requester (a notification) | none | 2025-04-21 |
| 7 | Website illustrations | `client/public/*.jpeg`, `landing/`, `academy/` | made in ChatGPT / GPT-4o (pasted in) | image | — | pasted in | public site | the operator selected them | 2025 |
| 8 | Launch posts (LinkedIn, intfiction.org) | `DOCS/social media/*` | screenshots of #1–#4 | text/image | — | posted by hand | LinkedIn; forum | the operator | 2025-05 |

Not features:
- The image-model eval harness (`server/src/evals/imageModelEval/`), whose outputs only the developer sees.
- Video generation, which returns 501 and never shipped.
- Academy videos, which have human narration and machine-transcribed captions.

## 3. Duties and measures

| Feature | Duty | Measure | Implemented at | Verdict | Deadline | Last verified |
|---|---|---|---|---|---|---|
| #1, #2 (every player, co-players included) | Art. 50(1) interaction | The owner's approved notices (CP-1 to CP-5, option a), mounted: a session notice above the first beat a player sees in each session (child-friendly in read-with-kids stories), a line on the character-selection screen where co-players arrive by code, a line next to "Create Story" in the setup flow, and a reminder at each new Thread in vent and future-self stories (the coach and therapist pages link to future-self). Where each sits: §7. | `client/src/shared/components/AiNotice.tsx`; `client/src/game/hooks/useBeatAiNotice.ts`; `client/src/game/utils/aiNotice.ts`; `StoryDisplay.tsx`; `CharacterSelection.tsx`; `StoryInitializer.tsx` | **implemented, pending deploy** (A-rows 1, 2). D3 (browser check as a first-time visitor) not run. | now (since 2026-08-02) | 2026-09-25 (rendering tests: exact text, `role="note"`, accessible name, first paint) |
| #5 | Art. 50(1) interaction | The "AI Worldbuilding Assistant" heading and the "AI Draft" and "AI Iteration" tabs. | `client/src/resources/templates/components/AiDraftTab.tsx:48`; `TemplateForm.tsx:170, 175` | PASS (code evidence; D3 not run) | — | 2026-09-25 |
| #1, #2, #5 | Art. 50(1) self-identification (A4) | No prompt claims the model is human. Players cannot type free text in the game. | `server/src/game/services/prompts/` | PASS | — | 2026-09-25 |
| #4 template covers | Art. 50(2) marking + detection | Stored exactly as the Images API returns them: no resize, no re-encode. OpenAI's C2PA credentials and SynthID therefore reach the file served to the library and the home carousel (if the model embeds them; see §4). Covers stored from mid-2025 until 2026-09-25 were resized and lost their credentials; a backfill adds unsigned IPTC `DigitalSourceType` to them (§11). The oldest covers (April 2025, before the resize) still carry C2PA and are skipped. | `server/src/images/AIImageGenerator.ts` (`generateCoverImageForTemplate`); `server/src/scripts/backfillCoverDigitalSourceType.ts` | **fixed in code; served file not yet verified.** Old covers stay FAIL (against the Code baseline) until re-generated: unsigned IPTC is a fallback, not the Code's signed metadata layer. | now under the strict reading (brief §10 q2, q7); 2026-12-02 at the latest | 2026-09-25 (unit test: stored bytes equal API bytes) |
| #3, #4 other images | Art. 50(2) marking + detection | Bytes kept end to end: decoded from base64, written with `fs.writeFileSync`, served with `res.sendFile`. | `openaiImageClient.ts`; `AIImageGenerator.ts`; `imageRoutes.ts` | ASK-OWNER (provisional UPSTREAM-GAP) (A-row 6): no gpt-image-2.5 file has been verified | now (conservative); 2026-12-02 at the latest | — |
| #1 narrator text | Art. 50(2) marking + detection | **Interim machine-readable marker, not a watermark.** Every game state sent over Socket.IO carries `provenance: { aiGenerated: true, digitalSourceType: "…/trainedAlgorithmicMedia", generator: "Chosen Path" }`. The reader's beat text container carries `data-ai-generated="true"` and `data-digital-source-type`. This is **not equivalent to the Code's watermark layer**: it is a plain field that copying the text removes, and no detector exists. | `core/types/provenance.ts`; `core/models/ClientStateManager.ts`; `client/src/game/utils/aiContentMarkers.ts`; `client/src/game/components/BeatContent.tsx` | **UPSTREAM-GAP** (A-row 4). Owner decision: wait for OpenAI (§5). | now under the strict reading; **2026-12-02** at the latest | 2026-09-25 (unit test on the served state) |
| #2 setup, #5 AI Draft/Iteration text | Art. 50(2) marking + detection | The same interim marker: in the game state for setup text; in the `provenance` field of the `/templates/generate` and `/templates/:id/iterate` responses. Not a watermark. | `server/src/templates/templateRoutes.ts` | **UPSTREAM-GAP** (A-row 5) | as above | 2026-09-25 (code) |
| #1, #2 story text | Art. 50(4) label | Not published: only the session's players see it, and it is fiction. | — | N/A | — | 2026-09-25 |
| #4, #7, #8 images | Art. 50(4) deep fake | Stylised drawings, not deep fakes. No style guard prevents a photorealistic image of a real person; the admin's publish review is the checkpoint. | `server/src/templates/templateMiddleware.ts:146-155` | N/A | — | 2026-09-25 |
| all | Art. 50(5) visible, timely, accessible | Real text with a visible "AI" badge, shown without interaction at first exposure and never dismissible. Each notice is `role="note"`, `lang="en"`, accessible name "AI system"; the badge is `aria-hidden`. Text `primary-600` on white (5.7:1). The AI Worldbuilding Assistant keeps its headings. | as the Art. 50(1) row | **implemented, pending deploy**. D3 not run. | now | 2026-09-25 (rendering tests) |

## 4. Upstream reliance and test results

| Output | Vendor · model | Marking relied on | Detection available | Tested on | Method | Result |
|---|---|---|---|---|---|---|
| In-game images (#3) | OpenAI · gpt-image-2.5-flare, jpeg, compression 75 | C2PA + SynthID on "supported images" [OAI-PROV] SECONDARY (vendor); coverage per model and format is undocumented (V2) | openai.com/verify; `POST /v1/content_provenance_checks` | not yet | `c2patool` on a served production URL, then the provenance check (fix-patterns §4.6) | **pending**: needs one production image generated since 2026-09-24 (ASK-OWNER) |
| Template covers and other editor images (#4) | OpenAI · gpt-image-2.5-sunburst | as above; covers are now stored unaltered | as above | not yet | as above, on a cover generated after this change | **pending** |
| Covers stored mid-2025 to 2026-09-25 | gpt-image-1 / 1.5 era, resized | none left. The byte check of 2026-09-25 found 0 c2pa hits in the three newest local covers. The backfill dry run over the local copy (34 covers) found 22 without credentials to mark and 12 older unresized covers (April 2025) that still carry C2PA with `trainedAlgorithmicMedia`, which it skips. The backfill adds unsigned IPTC `DigitalSourceType` | none | 2026-09-25 (local copies) | `grep -c -a c2pa`; backfill dry run; marking one local cover and reading the XMP back (pixels unchanged) | stripped; backfill script ready, not yet run on Render |
| Story text (#1, #2, #5) | OpenAI · gpt-4.1 / gpt-4.1-mini | none: OpenAI text carries no provenance signal (V1) [OAI-PROV; OAI-HELP] SECONDARY (vendor) | none | — | — | UPSTREAM-GAP; interim JSON and HTML markers only |

## 5. Text-marking feasibility assessment

**What reaches people.** Story beats of about 400–800 tokens (#1), the setup text shown with a story (#2), and AI Draft and Iteration World text (#5). All three come from OpenAI `gpt-4.1` / `gpt-4.1-mini` through LangChain `ChatOpenAI`. Beats are stored and replayable, so the ephemeral-content exemption does not apply [G ¶88].

**Why there is no watermark.** As of 2026-09-25, no OpenAI text model carries a watermark or other provenance signal, and OpenAI offers no detector. OpenAI states the goal and ties it to its Code of Practice commitments, but gives no date (V1) [OAI-PROV; OAI-HELP] SECONDARY (vendor). The project uses the vendor's model and cannot add a model-level watermark itself.

**Options considered** (fix-patterns §8; details and costs in the assessment's §5 D2):
1. Move the long generations to a Claude model that watermarks text today (Opus 5.5, Opus 5, Fable 5.1, Mythos 5.1 per [ANT], SECONDARY). This costs a much higher price per beat, brings a new processor, and has unknown quality until an eval runs. Detection is in private preview only (brief §10 q17).
2. **Wait for OpenAI.** Costs nothing; the gap stays open until OpenAI ships text provenance.
3. A third-party post-hoc text watermark. No production-grade service was verified (UNCONFIRMED).
4. This feasibility assessment and the gap analysis in §6, which are documentation, not compliance.

**Chosen (owner decision, 2026-09-25): option 2, wait for OpenAI, with options 4 and the interim measures below.** Review on **2026-11-15**: re-check OpenAI's text provenance (V1) before the 2 Dec 2026 deadline, and decide then whether to move the long routes to a watermarking model (option 1).

**Feasibility is judged objectively** [G ¶81]. It does not depend on this project's resources or capabilities. Text watermarking is available on the market from another vendor, which weakens an infeasibility argument. Implementation cost may be taken into account [G ¶85]. Under the strict reading of the grace period (brief §10 q2: a free service may only be "put into service"), the gap is open now. Under either reading it must be closed by 2 Dec 2026.

**Interim measures, none of which is equivalent to the Code's watermark layer:**
- the machine-readable `provenance` field in the served JSON and the `data-ai-generated` attributes in the reader (§3);
- the visible AI notices (§7), implemented 2026-09-25 and pending deploy.

Also: never pad, truncate or split text to get under 200 tokens.

## 6. Gap analysis against the Code of Practice

Not a signatory, so this is kept as the gap analysis the Guidelines expect [G ¶148].

| Code measure | What it expects | What we do | Gap | Plan |
|---|---|---|---|---|
| S1 M1.1 multi-layer marking | Signed, time-stamped metadata plus an imperceptible watermark for images; a watermark for free-form text of 200 tokens or more | Images: the vendor's C2PA + SynthID kept end to end; template covers no longer re-encoded. Text: interim unsigned JSON/HTML markers only. | Text has no watermark (upstream). Image coverage for gpt-image-2.5 is untested. Old covers have unsigned IPTC only. | Wait for OpenAI text provenance, reviewed 2026-11-15. Verify one served image of each model. Old covers improve only when regenerated. |
| S1 M1.2 non-removal | Preserve existing marks; a ToS prohibition on removal; no circumvention tools | The pipeline keeps image bytes. The C2PA stripper exists only in the eval, and ESLint rejects importing `src/evals/` from app code. The README asks people not to remove or tamper with the markings (a request, not a prohibition: the code is AGPL-3.0). There are no ToS. | No ToS prohibition for users of the hosted site. | A ToS clause only if ToS are ever written (§11). |
| S1 M2.1 detection | Free detection, publicly available where the public is exposed | Nothing published. Images can be checked at openai.com/verify. | No detection pointer. There is no detector for text. | An "AI on this site" page: owner copy (§11). |
| S1 Commitment 3 robustness and interoperability | Robust marks; established metadata standards | C2PA and IPTC `DigitalSourceType` (the standard vocabulary). The text marker is not robust. | Text marker: a plain field that copying removes. | Replace it once a text watermark exists. |
| S1 Commitment 4 compliance process | A documented process with testing, proportionate for SMEs | This record, plus unit tests that stored cover bytes equal the API bytes, that every image prompt carries the rules, and that the served state carries the marker. | Served-file verification not yet done. | §4 pending rows. |
| S2 M1.1–1.2 labels | An "AI" main element; placement at first exposure; accessible | `AiNotice` with a visible "AI" badge, `role="note"` and accessible name "AI system", at first exposure (§7). AI images carry "AI-generated image:" in their alt text. | Pending deploy; D3 not run. | Check in a browser after deploy (§7). |
| S2 Commitment 2 labelling process | Internal documentation; label verification; correction of mislabelling | This record. | No correction channel. | Owner copy (§11). |
| S2 Commitment 3 creative works | Non-hampering disclosure, perceivable at first exposure | — | Not applicable yet: no published deep fakes. | — |
| S2 Commitment 4 human review | A policy naming the editorially responsible person | — | Not relied on: no published public-interest text. | — |

## 7. Label policy and correction channel

- **Labels in use** (implemented 2026-09-25, pending deploy). The copy is the owner's, approved in `DOCS/2026-09-25_ai-label-copy-review.md` (CP-1 option a); change a word only with the owner. All notice copy lives in `client/src/shared/components/AiNotice.tsx`.
  - CP-1 `session`, above the first beat a player sees in each session (and on the "Setting up the story..." screen before it), in `StoryDisplay.tsx`: "Story text and images in this game are generated by AI as you play." A session starts when the story view mounts, so it shows on every visit; there is no dismissal (conservative reading of G ¶143, brief §10 q16).
  - CP-4 `kids` replaces CP-1 in read-with-kids stories: "This story is written by an AI. That's a computer program, not a real person. It can make mistakes."
  - CP-5 `reminder`, above the first beat of each later Thread in vent and future-self stories: "Reminder: this story is generated by an AI system, not written by a person." When a Thread starts on the session's first beat, CP-1 shows instead (one notice per beat).
  - CP-2 `join`, under the heading of the character selection (`CharacterSelection.tsx`), which everyone arriving at `/game/:code` sees: "This story is written by an AI system, not a person. Your choices steer what it writes next."
  - CP-3 setup line (`SetupAiNotice`), directly above the button row on both pages that start a story. Every entry point ends on one of them: home tiles, category deep links, the For-… pages and "Create your own" go to `/setup` (`StoryInitializer.tsx`); library and home-carousel "Play" buttons and shared links go to `/templates/:id/configure` (`TemplateConfigurator.tsx`). The sentence follows the story's source and the page's own images checkbox, so it changes when the player ticks or unticks images. The template and no-images variants were added 2026-09-26 (owner-reported gap), pending deploy.
    - Custom story, above Back / "Create Story" (images on by default): "An AI system will write your story and create its images from your premise." Without images: "An AI system will write your story from your premise."
    - Template story, above Back / Share / "Start Story" (images off by default): "An AI system will write your story and create its images from this template." Without images: "An AI system will write your story from this template." "Template" is the word that page's own copy uses.
    - Not in the template editor's AI Draft (`StoryInitializer` in template mode), which is the labelled AI Worldbuilding Assistant.
  - CP-8 alt text "AI-generated image: {description}" on beat images (`storyTextProcessor.ts`), covers (`CoverCard.tsx`) and portraits (`CharacterSelection.tsx`, `GameLayout.tsx`, `PlayerInterlude.tsx`), via `shared/utils/aiImageAlt.ts`. Captions unchanged. Interlude images and the template editor are not prefixed. Template images imported by zip may not be AI-made and are labelled all the same.
  - CP-9 moderation notification: "Our automated moderation, which uses AI, flagged your content, so we couldn't process it." The copy lives in `shared/notifications/moderationMessage.ts`. What people see is the notification `apiClient.ts` raises on a `MODERATION_BLOCKED` response (story creation, template draft and iteration), shown by `NotificationDisplay` with the reason below; `ContentModerationNotification.tsx` carries the same copy but is not mounted anywhere.
  - CP-11 README, as a request because the code is AGPL-3.0.
- **How labels are checked:** rendering tests assert each notice's exact text, `role="note"`, accessible name and position on the first paint (`client/tests/unit/**`, static render). A static render cannot tick a checkbox, so the template page's with-images line is asserted through `SetupAiNotice`, not on the page. Still to do: check them in a browser as a first-time visitor (D3), at desktop and mobile widths, after deploy.
- **Correction channel:** none. The footer has no email address (ASK-OWNER, §11).

## 8. Human-review policy

Not applicable: the human-review exception is not relied on, because no public-interest text is published.

## 9. AI literacy (Art. 4)

The operator builds and runs the AI features himself and handles image generation and publishing. Whether anyone else holds the worldbuilder or admin role is ASK-OWNER. If someone does, add a short note on how they are briefed on the AI features and these safeguards.

## 10. Adjacent rules

| Item | Status | Where |
|---|---|---|
| Art. 5 safeguards for images of real people and minors (from 2 Dec 2026) | **Implemented 2026-09-25** (owner decision, all four measures). (1) The content filter fails closed: one retry, then the request is refused with the existing error messages. (2) Explicit rules (no sexual or sexualised content with minors; no real, identifiable people in sexual, intimate, nude or humiliating situations; no undressing or nudifying) in the premise filter, in a filter pass on template-editor image requests (reference images included), and appended to every image prompt, with extra rules for input images on edits. (3) Image moderation `auto` for read-with-kids stories and for template-editor images of templates tagged "Kids" (the latter implemented 2026-09-25, pending deploy), `low` elsewhere (owner's choice). (4) Documented in `.context/content-safety.md`. Failed or refused images never stop a story: the text continues and the reader hides the slot. Known limits: prompt injection, reference images not inspected, uploads not screened. | `.context/content-safety.md` |
| Privacy notice names the AI vendors and the transfers | **Implemented 2026-09-25, pending deploy** (CP-10, in the page's "we" voice): premise, choices and self-descriptions go to OpenAI (USA), which processes them under a data processing agreement and doesn't use them for training. Still missing: the transfer basis (A-row 9, Q7). | `client/src/page/static/Privacy.tsx` |
| Imprint (§ 5 DDG / § 18 MStV) | Name and postal address are present; no email address and no imprint page (A-row 10). | `Footer.tsx`: owner copy |
| Vendor terms (OpenAI Sharing & Publication Policy) | Future launch posts need a caption line (A-row 11). | owner |
| Consumer law (B2C only) | Revisit when a paid tier launches (A-row 12). | — |

## 11. Open items

| Item | Check | Who | Due |
|---|---|---|---|
| **Deploy the approved labels and check them (D3):** the notices, alt texts, moderation message, privacy line and README note (§7) are committed but not deployed. After deploy, open the game as a first-time visitor (create a story, start one from a library template with and without images, join one by code, play into a vent story's second Thread) at desktop and mobile widths, and record the result in §7. | A2, A5, A8, D1, D3 | owner deploys; agent checks | now (overdue since 2026-08-02) |
| **Remaining supporting copy:** the transfer basis for the privacy line (EU-US Data Privacy Framework or standard contractual clauses; Q7), and confirm the "doesn't use it for training" claim against the OpenAI account settings; an imprint email; an optional "AI on this site" page with a correction contact; a ToS no-removal clause if ToS are ever written. | A-rows 9, 10; F-2, F-3; B9 | owner | next re-test |
| **Text watermark:** re-check OpenAI text provenance (V1). If it is still absent, decide on assessment §5 D2 option 1 (a watermarking Claude model for the long routes; needs a cost estimate and a text-model eval, which spends API credit) or record why waiting continues. | B6, B8 | owner | **2026-11-15** (deadline 2026-12-02) |
| **Verify a served image:** give one production image URL generated since 2026-09-24 (a beat image and a template cover made after this change), or allow one test generation (cents). Run `c2patool` and the OpenAI provenance check; record the result in §4. | B3, B4 | owner provides; agent runs | before 2026-12-02 |
| **Backfill old template covers on Render:** in the Render shell, from `server/`, run `NODE_ENV=production npm run backfill:cover-dst` (dry run), check the list, then add `-- --write`. It marks only covers without C2PA and never re-encodes them. | B4 | owner | before 2026-12-02 |
| **Render environment variables:** do any override the model ids in §2? | inventory | owner | next re-test |
| **Roles and legal positions:** is chosenpath.ai "placed on the market" (donations, commercial licences, premium tier)? This decides whether the Art. 50(2) rows are overdue now or due 2 Dec 2026 (brief §10 q2–q4). Also: put the provider/deployer split in writing before any handover or co-branding. | B2, E2, F6 | owner (a lawyer or the Bundesnetzagentur KI-Service-Desk for the classification) | before handover; before 2026-12-02 |
| **Worldbuilder and admin roles:** does anyone besides the operator hold them? This decides the AI-literacy note (§9). | E3 | owner | next re-test |
