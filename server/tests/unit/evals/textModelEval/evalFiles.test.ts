import fs from "fs";
import os from "os";
import path from "path";
import { evalFiles, FRAME_FILES, JUDGED_FILES } from "../../../../src/evals/textModelEval/evalFiles.js";
import type { ChapterFramesFile } from "../../../../src/evals/textModelEval/chapterFrames.js";
import { chapterKeyOf } from "../../../../src/evals/textModelEval/chapterFrames.js";
import type { ThreadAnalysis } from "core/types/index.js";
import { threadBeat } from "../../../helpers/promptStories.js";
import { evalCase } from "./fixtures.js";

describe("evalFiles", () => {
  let outDir: string;
  beforeEach(() => {
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), "text-eval-files-"));
  });
  afterEach(() => fs.rmSync(outDir, { recursive: true, force: true }));

  const writeKey = (dir: string, pageId: string, baseline: string) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `text-turn-${pageId}.json`), JSON.stringify({ setId: "text-turn", pageId, baseline: { promptState: "round0", armKey: baseline } }));
  };

  it("finds a key in keys/, else in keys/superseded/, so a replaced page's export still scores", () => {
    writeKey(path.join(outDir, "keys"), "aaaa000000", "top");
    writeKey(path.join(outDir, "keys", "superseded"), "bbbb000000", "superseded");
    // A page id in both places reads the current key
    writeKey(path.join(outDir, "keys", "superseded"), "aaaa000000", "older copy");
    const files = evalFiles(outDir);
    expect(files.readKey("aaaa000000")?.baseline.armKey).toBe("top");
    expect(files.readKey("bbbb000000")?.baseline.armKey).toBe("superseded");
    expect(files.readKey("cccc000000")).toBeUndefined();
  });

  it("reads the first frames as chapterFrames and the nearer ones as nearerFrames, each from its own file", () => {
    const state = threadBeat(1).getState();
    const phase = state.storyPhases[state.storyPhases.length - 1] as ThreadAnalysis;
    const beat = evalCase("cont-a-t2", "beat", { state });
    fs.mkdirSync(path.join(outDir, "cases"), { recursive: true });
    fs.writeFileSync(path.join(outDir, "cases", "cases.json"), JSON.stringify([{ id: beat.id, role: beat.role, tags: beat.tags }]));
    fs.writeFileSync(path.join(outDir, "cases", `${beat.id}.json`), JSON.stringify(beat));
    const chapterKey = chapterKeyOf(state.id, phase);
    const threadId = phase.threads[0].id;
    const file = (question: string, typeOfMilestone?: string): ChapterFramesFile => ({
      generatedAt: "",
      missing: [],
      chapters: [
        {
          chapterKey,
          storyId: state.id,
          firstBeatIndex: phase.firstBeatIndex,
          threadIds: [threadId],
          sourceCaseId: beat.id,
          exactInput: false,
          readBy: [beat.id],
          armKey: "a",
          jobKey: "j",
          outputFile: "outputs/f.json",
          frames: { [threadId]: { question, plan: "P.", ...(typeOfMilestone ? { typeOfMilestone } : {}) } },
        },
      ],
    });
    const files = evalFiles(outDir);
    expect(files.readCases()[0].chapterFrames).toBeUndefined();
    files.writeChapterFrames(file("First?"));
    expect(fs.existsSync(path.join(outDir, FRAME_FILES.backfilled))).toBe(true);
    expect(files.readCases()[0].nearerFrames).toBeUndefined();
    files.writeChapterFrames(file("Nearer?", "whether the letters prove it"), "nearer");
    expect(fs.existsSync(path.join(outDir, FRAME_FILES.nearer))).toBe(true);
    const [read] = files.readCases();
    expect(read.chapterFrames?.[threadId].question).toBe("First?");
    expect(read.nearerFrames?.[threadId]).toEqual({ question: "Nearer?", plan: "P.", typeOfMilestone: "whether the letters prove it", chapterKey });
  });

  it("freezes added cases after the others, and without a report keeps the round build report as it was", () => {
    const first = evalCase("cont-a-t2", "beat", { state: threadBeat(1).getState() });
    fs.mkdirSync(path.join(outDir, "cases"), { recursive: true });
    fs.writeFileSync(path.join(outDir, "cases", "cases.json"), JSON.stringify([{ id: first.id, role: first.role, tags: first.tags }]));
    fs.writeFileSync(path.join(outDir, "cases", `${first.id}.json`), JSON.stringify(first));
    fs.writeFileSync(path.join(outDir, "cases", "round-build-report.json"), '{"built":"earlier"}');
    const files = evalFiles(outDir);
    const added = evalCase("round-thread-first-x-t1", "thread", { state: threadBeat(1).getState() });
    files.addCases([added], undefined, false);
    expect(files.readCases().map((c) => c.id)).toEqual([first.id, added.id]);
    expect(fs.readFileSync(path.join(outDir, "cases", "round-build-report.json"), "utf-8")).toBe('{"built":"earlier"}');
    expect(() => files.addCases([added], undefined, false)).toThrow("Already frozen: round-thread-first-x-t1");
  });

  it("writes the stage check's readings to judged-stages.md and .json", () => {
    const files = evalFiles(outDir);
    files.writeJudgedStages("# stages\n", { set: "stages" });
    expect(fs.readFileSync(path.join(outDir, "judged-stages.md"), "utf-8")).toBe("# stages\n");
    expect(JSON.parse(fs.readFileSync(path.join(outDir, "judged-stages.json"), "utf-8"))).toEqual({ set: "stages" });
  });

  it("writes the ending check's readings to judged-endings.md and .json", () => {
    const files = evalFiles(outDir);
    files.writeJudgedEndings("# endings\n", { set: "endings" });
    expect(fs.readFileSync(path.join(outDir, "judged-endings.md"), "utf-8")).toBe("# endings\n");
    expect(JSON.parse(fs.readFileSync(path.join(outDir, "judged-endings.json"), "utf-8"))).toEqual({ set: "endings" });
  });

  it("writes the choice-result stage's judged checks to judged-choice-results.md and .json", () => {
    const files = evalFiles(outDir);
    files.writeJudgedChoiceResults("# choices\n", { set: "choices" });
    expect(fs.readFileSync(path.join(outDir, "judged-choice-results.md"), "utf-8")).toBe("# choices\n");
    expect(JSON.parse(fs.readFileSync(path.join(outDir, "judged-choice-results.json"), "utf-8"))).toEqual({ set: "choices" });
  });

  it("writes the choice-line-sp stage's report to choice-line-sp.md and .json", () => {
    const files = evalFiles(outDir);
    files.writeChoiceLine("# line\n", { set: "line" });
    expect(fs.readFileSync(path.join(outDir, "choice-line-sp.md"), "utf-8")).toBe("# line\n");
    expect(JSON.parse(fs.readFileSync(path.join(outDir, "choice-line-sp.json"), "utf-8"))).toEqual({ set: "line" });
  });

  it("writes the nearer frames' judged turns beside the rounds' file, not over it", () => {
    const files = evalFiles(outDir);
    files.writeJudgedTurns("# rounds\n", { set: "rounds" });
    files.writeJudgedTurns("# nearer\n", { set: "nearer" }, "nearer");
    expect(fs.readFileSync(path.join(outDir, `${JUDGED_FILES.backfilled}.md`), "utf-8")).toBe("# rounds\n");
    expect(fs.readFileSync(path.join(outDir, `${JUDGED_FILES.nearer}.md`), "utf-8")).toBe("# nearer\n");
  });
});
