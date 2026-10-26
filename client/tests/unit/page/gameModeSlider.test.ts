import { GameModes, type GameMode } from "core/types";
import {
  gameModeForKey,
  gameModeKeyHandler,
  type GameModeKeyEvent,
} from "../../../src/page/utils/gameModeSlider";

const { Cooperative, CooperativeCompetitive, Competitive, SinglePlayer } =
  GameModes;

describe("gameModeForKey", () => {
  it.each([
    [Cooperative, CooperativeCompetitive],
    [CooperativeCompetitive, Competitive],
    [Competitive, Competitive],
  ])("moves from %s to the next mode (%s) with Right, Up and Page Up", (mode, next) => {
    for (const key of ["ArrowRight", "ArrowUp", "PageUp"]) {
      expect(gameModeForKey(mode, key)).toBe(next);
    }
  });

  it.each([
    [Competitive, CooperativeCompetitive],
    [CooperativeCompetitive, Cooperative],
    [Cooperative, Cooperative],
  ])("moves from %s to the previous mode (%s) with Left, Down and Page Down", (mode, previous) => {
    for (const key of ["ArrowLeft", "ArrowDown", "PageDown"]) {
      expect(gameModeForKey(mode, key)).toBe(previous);
    }
  });

  it.each([Cooperative, CooperativeCompetitive, Competitive])(
    "goes to the ends with Home and End (from %s)",
    (mode) => {
      expect(gameModeForKey(mode, "Home")).toBe(Cooperative);
      expect(gameModeForKey(mode, "End")).toBe(Competitive);
    }
  );

  it("reaches every mode from Cooperative, one key at a time", () => {
    const reached: GameMode[] = [Cooperative];
    for (let i = 0; i < 3; i++) {
      reached.push(gameModeForKey(reached[reached.length - 1], "ArrowRight") ?? Cooperative);
    }
    expect(reached).toEqual([Cooperative, CooperativeCompetitive, Competitive, Competitive]);
  });

  // A link can carry the single-player mode with more players; the slider shows it at the Competitive end
  it("moves the single-player mode from the Competitive end", () => {
    expect(gameModeForKey(SinglePlayer, "ArrowLeft")).toBe(CooperativeCompetitive);
    expect(gameModeForKey(SinglePlayer, "ArrowRight")).toBe(Competitive);
    expect(gameModeForKey(SinglePlayer, "Home")).toBe(Cooperative);
  });

  it.each(["Tab", "Enter", " ", "Escape", "a"])("leaves %j to the browser", (key) => {
    expect(gameModeForKey(Cooperative, key)).toBeUndefined();
  });
});

describe("gameModeKeyHandler", () => {
  function press(
    mode: GameMode,
    key: string,
    modifiers: Partial<Pick<GameModeKeyEvent, "altKey" | "ctrlKey" | "metaKey">> = {}
  ) {
    const onSelect = jest.fn();
    const preventDefault = jest.fn();
    gameModeKeyHandler(mode, onSelect)({
      key,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      ...modifiers,
      preventDefault,
    });
    return { onSelect, preventDefault };
  }

  it("selects the mode a key moves to, instead of the browser's 0.01 step", () => {
    const { onSelect, preventDefault } = press(Cooperative, "ArrowRight");

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(CooperativeCompetitive);
    expect(preventDefault).toHaveBeenCalled();
  });

  it("reaches Mixed, the middle stop, from either end", () => {
    expect(press(Cooperative, "ArrowUp").onSelect).toHaveBeenCalledWith(CooperativeCompetitive);
    expect(press(Competitive, "ArrowLeft").onSelect).toHaveBeenCalledWith(CooperativeCompetitive);
    expect(press(Competitive, "PageDown").onSelect).toHaveBeenCalledWith(CooperativeCompetitive);
  });

  it("selects nothing at an end, and still keeps the browser from stepping", () => {
    const atStart = press(Cooperative, "ArrowLeft");
    const atEnd = press(Competitive, "End");

    expect(atStart.onSelect).not.toHaveBeenCalled();
    expect(atStart.preventDefault).toHaveBeenCalled();
    expect(atEnd.onSelect).not.toHaveBeenCalled();
    expect(atEnd.preventDefault).toHaveBeenCalled();
  });

  it("leaves other keys to the browser (Tab moves focus on)", () => {
    const { onSelect, preventDefault } = press(Cooperative, "Tab");

    expect(onSelect).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it.each([{ altKey: true }, { ctrlKey: true }, { metaKey: true }])(
    "leaves browser shortcuts alone (%j)",
    (modifier) => {
      const { onSelect, preventDefault } = press(Cooperative, "ArrowRight", modifier);

      expect(onSelect).not.toHaveBeenCalled();
      expect(preventDefault).not.toHaveBeenCalled();
    }
  );
});
