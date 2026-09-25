# Content safety: the Art. 5 safeguards

What the app refuses in every story and template, and where each refusal is enforced. The owner decided these measures on 2026-09-25 against the AI Act's Art. 5 ban on non-consensual intimate imagery and child sexual abuse material, which applies from 2 Dec 2026. Anyone can create a story anonymously, and "Read with Kids" invites children, so these safeguards must hold without a login. The compliance view (duties, verdicts, open items) is in `.context/ai-transparency.md` §10.

## The rules

`server/src/shared/contentSafetyRules.ts` holds three rules, and they are the single source for all the layers below:

1. No sexual or sexualised content involving minors.
2. No real, identifiable people in sexual, intimate, nude or humiliating situations.
3. No undressing or nudifying anyone, including people in reference or uploaded images.

The tests loop over the live list and check that every rule reaches every filter prompt and every image prompt, so a new rule inherits those checks. The wording is prompt text. The image-model eval (`server/src/evals/imageModelEval/`) sends its prompts through the same `requestImage`, so changing the rules also changes what the eval measures.

## Layers

**1. Text filter (`server/src/game/services/ContentFilterService.ts`).** It screens:

- story premises (`POST /stories`, anonymous);
- AI Draft prompts (`POST /templates/generate`) and AI Iteration feedback (`POST /templates/:id/iterate`). These use the premise prompt: the rules, plus the older general-audience and copyright rules;
- template-editor image requests (element image, identity portrait, cover), via `server/src/images/imageRequestScreening.ts`. These use the rules only, applied to the description plus the image-instruction text. The filter is told how many reference images come with the request; it cannot see them.

The filter fails closed. The classifier gets one retry, on top of the OpenAI SDK's own retries for transient HTTP errors. If that fails, `ContentFilterUnavailableError` is thrown and nothing goes through:

- The story and AI Draft/Iteration routes refuse with their existing generic 500 message.
- The image routes refuse with the existing `TECHNICAL` image error.

Both refusals reuse copy that already existed.

A blocked request gets the responses that existed before. Stories and templates return the moderation-blocked response, which the client shows as the content-moderation notification. Image requests return the `CONTENT_POLICY` image error.

Two things are not screened by this filter:

- In-game image prompts. The story model writes them, from a premise that was already screened.
- Generated beat text.

**2. Image prompts (`server/src/images/imageSafety.ts`, applied in `requestImage`).**

- Every Images API request, in production and in the eval, gets the rules appended.
- An edit with reference images also treats every person in the input images as a real, identifiable person.

**3. OpenAI image moderation.** Moderation is `low` everywhere, which is the owner's choice. Two exceptions use `auto`: in-game images of read-with-kids stories (`imageModerationFor`), and template-editor images (element images, identity portraits, covers) of templates tagged "Kids", whose images end up in read-with-kids stories (`imageModerationForTemplate`; owner decision of 2026-09-25).

A story is read-with-kids when `StoryState.category === "read-with-kids"`:

- **Custom stories:** the category comes from the setup flow. The client sends `category` on `POST /stories`, and unknown values are dropped.
- **Template stories:** the category is set when the template's tags include "Kids" (`categoryFromTemplateTags` in `core/types/story.ts`, the one source for that rule).

Stories created before 2026-09-25 have no category, so they stay on `low`. The template-editor methods of `AIImageGenerator` take the moderation as a required argument, so a new template-image route has to decide it; the routes read the tags of the stored template.

**4. Failures never stop a story.** A refused or failed image never blocks the text:

- The beat proceeds.
- The server records the failed id in `StoryState.failedImageIds`.
- The reader hides that slot, with no error text.

This covers beat images, the custom-story cover and custom-story portraits. The flow is in `.context/image-generation.md`.

## Known limits

- The filter is an LLM classifier, so the text it screens can try to steer it (prompt injection). The image model's own moderation is the backstop.
- Reference images are not inspected. Only the request text is judged, and no vision moderation runs.
- Images that people upload (template zip import, file upload) are not screened.
- The category comes from the client. A client that omits it gets the default moderation, which is the owner's baseline.
- The editor's moderation follows the saved tags. Images generated before a "Kids" tag is saved, or before the template is saved at all, use `low`, and a later tag does not regenerate them.
- There is no coaching category. The coach and therapist pages link to future-self stories, so coaching gets the future-self treatment (the Thread reminder); a coaching story set up another way cannot be told apart.

## When changing this

- **Adding or rewording a rule:** edit the list. The tests check its reach. Update `.context/ai-transparency.md` §10 in the same change.
- **Adding a flow that sends user-written text or images to a model:** screen it with the filter, and send image requests through `requestImage`, so the rules are appended.
