import { jest } from "@jest/globals";
import * as mockFs from "../../helpers/mockFsPromises.js";

// ESM-safe mock before importing module under test
// Avoid duplicate default key by splitting default from the rest
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { default: defaultFsMock, ...restFsMock } = mockFs as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
await (jest as any).unstable_mockModule("fs/promises", () => ({
  __esModule: true,
  default: defaultFsMock,
  ...restFsMock,
}));

const storageUtils = await import("../../../src/shared/storageUtils.js");
const {
  getPregeneratedStoryFilePath,
  listPregeneratedStoryFiles,
  deleteAllPregeneratedStoryFiles,
  deletePregeneratedStoryFilesForTurn,
  getStoryDirectoryPath,
} = storageUtils;

// Strong-typed handle to mocked fs API using explicit signatures we need
type ReaddirFn = (path: string) => Promise<string[]>;
type UnlinkFn = (path: string) => Promise<void>;
const fsMock = mockFs as unknown as {
  readdir: jest.MockedFunction<ReaddirFn>;
  unlink: jest.MockedFunction<UnlinkFn>;
};

// Create typed references to mocked functions
let readdirSpy: jest.MockedFunction<ReaddirFn>;
let unlinkSpy: jest.MockedFunction<UnlinkFn>;

describe("storageUtils - Pregeneration Functions", () => {
  const mockStoryId = "test-story-123";
  const mockTurn = 5;
  const mockPlayerSlot = "player1";
  const mockOptionIndex = 2;

  beforeEach(() => {
    jest.clearAllMocks();
    readdirSpy = fsMock.readdir;
    unlinkSpy = fsMock.unlink;
    // not used in these tests; ensure they exist to satisfy types
    // fsMock.readFile, fsMock.writeFile, fsMock.access are available
  });

  describe("getPregeneratedStoryFilePath", () => {
    it("should return correct file path with proper naming convention", () => {
      const result = getPregeneratedStoryFilePath(
        mockStoryId,
        mockTurn,
        mockPlayerSlot,
        mockOptionIndex
      );

      expect(result).toContain(mockStoryId);
      expect(result).toContain(
        `pregeneration_${mockTurn}_${mockPlayerSlot}_${mockOptionIndex}.json`
      );
      expect(result).toMatch(/pregeneration_5_player1_2\.json$/);
    });

    it("should use getStoryDirectoryPath for base directory", () => {
      const result = getPregeneratedStoryFilePath(
        mockStoryId,
        mockTurn,
        mockPlayerSlot,
        mockOptionIndex
      );

      const expectedBase = getStoryDirectoryPath(mockStoryId);
      expect(result).toContain(expectedBase);
    });

    it("should handle different player slots", () => {
      const playerSlots = ["player1", "player2", "player3", "player4"];

      playerSlots.forEach((playerSlot) => {
        const result = getPregeneratedStoryFilePath(
          mockStoryId,
          mockTurn,
          playerSlot,
          mockOptionIndex
        );
        expect(result).toContain(
          `pregeneration_${mockTurn}_${playerSlot}_${mockOptionIndex}.json`
        );
      });
    });

    it("should handle different turn numbers", () => {
      const turns = [1, 10, 25, 100];

      turns.forEach((turn) => {
        const result = getPregeneratedStoryFilePath(
          mockStoryId,
          turn,
          mockPlayerSlot,
          mockOptionIndex
        );
        expect(result).toContain(
          `pregeneration_${turn}_${mockPlayerSlot}_${mockOptionIndex}.json`
        );
      });
    });

    it("should handle different option indices", () => {
      const optionIndices = [0, 1, 2, 3, 4];

      optionIndices.forEach((optionIndex) => {
        const result = getPregeneratedStoryFilePath(
          mockStoryId,
          mockTurn,
          mockPlayerSlot,
          optionIndex
        );
        expect(result).toContain(
          `pregeneration_${mockTurn}_${mockPlayerSlot}_${optionIndex}.json`
        );
      });
    });
  });

  describe("listPregeneratedStoryFiles", () => {
    it("should return list of pregenerated files with parsed metadata", async () => {
      const mockFiles = [
        "pregeneration_5_player1_0.json",
        "pregeneration_5_player1_1.json",
        "pregeneration_6_player2_0.json",
        "story.json",
        "image.png",
      ];

      readdirSpy.mockResolvedValue(mockFiles);

      const result = await listPregeneratedStoryFiles(mockStoryId);

      expect(readdirSpy).toHaveBeenCalledWith(
        getStoryDirectoryPath(mockStoryId)
      );
      expect(result).toHaveLength(3);
      expect(result).toEqual([
        {
          filename: "pregeneration_5_player1_0.json",
          turn: 5,
          playerSlot: "player1",
          optionIndex: 0,
        },
        {
          filename: "pregeneration_5_player1_1.json",
          turn: 5,
          playerSlot: "player1",
          optionIndex: 1,
        },
        {
          filename: "pregeneration_6_player2_0.json",
          turn: 6,
          playerSlot: "player2",
          optionIndex: 0,
        },
      ]);
    });

    it("should return empty array when no pregenerated files exist", async () => {
      const mockFiles = ["story.json", "image.png", "other.txt"];

      readdirSpy.mockResolvedValue(mockFiles);

      const result = await listPregeneratedStoryFiles(mockStoryId);

      expect(result).toEqual([]);
    });

    it("should handle directory read errors", async () => {
      readdirSpy.mockRejectedValue(new Error("Directory not found"));

      await expect(listPregeneratedStoryFiles(mockStoryId)).rejects.toThrow(
        "Directory not found"
      );
    });

    it("should filter out invalid pregeneration filenames", async () => {
      const mockFiles = [
        "pregeneration_5_player1_0.json",
        "pregeneration_invalid.json",
        "pregeneration_5_player1.json",
        "pregeneration_5_player1_0_extra.json",
        "pregeneration_.json",
      ];

      readdirSpy.mockResolvedValue(mockFiles);

      const result = await listPregeneratedStoryFiles(mockStoryId);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        filename: "pregeneration_5_player1_0.json",
        turn: 5,
        playerSlot: "player1",
        optionIndex: 0,
      });
    });

    it("should handle numeric parsing correctly", async () => {
      const mockFiles = [
        "pregeneration_10_player2_15.json",
        "pregeneration_999_player4_0.json",
      ];

      readdirSpy.mockResolvedValue(mockFiles);

      const result = await listPregeneratedStoryFiles(mockStoryId);

      expect(result).toHaveLength(2);
      expect(result[0]?.turn).toBe(10);
      expect(result[0]?.optionIndex).toBe(15);
      expect(result[1]?.turn).toBe(999);
      expect(result[1]?.optionIndex).toBe(0);
    });
  });

  describe("deleteAllPregeneratedStoryFiles", () => {
    it("should delete all pregenerated files for a story", async () => {
      const mockFiles = [
        "pregeneration_5_player1_0.json",
        "pregeneration_5_player1_1.json",
        "pregeneration_6_player2_0.json",
        "story.json", // Should be filtered out
      ];

      readdirSpy.mockResolvedValue(mockFiles);
      unlinkSpy.mockResolvedValue(undefined);

      await deleteAllPregeneratedStoryFiles(mockStoryId);

      expect(unlinkSpy).toHaveBeenCalledTimes(3);
      expect(unlinkSpy).toHaveBeenCalledWith(
        expect.stringContaining("pregeneration_5_player1_0.json")
      );
      expect(unlinkSpy).toHaveBeenCalledWith(
        expect.stringContaining("pregeneration_5_player1_1.json")
      );
      expect(unlinkSpy).toHaveBeenCalledWith(
        expect.stringContaining("pregeneration_6_player2_0.json")
      );
    });

    it("should handle case when no pregenerated files exist", async () => {
      const mockFiles = ["story.json", "image.png"];

      readdirSpy.mockResolvedValue(mockFiles);

      await deleteAllPregeneratedStoryFiles(mockStoryId);

      expect(unlinkSpy).not.toHaveBeenCalled();
    });

    it("should not throw for ENOENT errors but throw for other errors", async () => {
      const mockFiles = [
        "pregeneration_5_player1_0.json",
        "pregeneration_5_player1_1.json",
      ];

      readdirSpy.mockResolvedValue(mockFiles);

      // Test ENOENT error (should not throw)
      const enoentError = new Error("ENOENT") as NodeJS.ErrnoException;
      enoentError.code = "ENOENT";
      unlinkSpy
        .mockRejectedValueOnce(enoentError)
        .mockResolvedValueOnce(undefined);

      await expect(
        deleteAllPregeneratedStoryFiles(mockStoryId)
      ).resolves.not.toThrow();
      expect(unlinkSpy).toHaveBeenCalledTimes(2);
    });

    it("should throw for non-ENOENT errors", async () => {
      const mockFiles = ["pregeneration_5_player1_0.json"];

      readdirSpy.mockResolvedValue(mockFiles);
      unlinkSpy.mockRejectedValue(new Error("Permission denied"));

      await expect(
        deleteAllPregeneratedStoryFiles(mockStoryId)
      ).rejects.toThrow("Permission denied");
    });
  });

  describe("deletePregeneratedStoryFilesForTurn", () => {
    it("should delete only files for specified turn", async () => {
      const mockFiles = [
        "pregeneration_5_player1_0.json",
        "pregeneration_5_player1_1.json",
        "pregeneration_5_player2_0.json",
        "pregeneration_6_player1_0.json", // Different turn, should not be deleted
        "story.json", // Not a pregeneration file
      ];

      readdirSpy.mockResolvedValue(mockFiles);
      unlinkSpy.mockResolvedValue(undefined);

      await deletePregeneratedStoryFilesForTurn(mockStoryId, 5);

      expect(unlinkSpy).toHaveBeenCalledTimes(3);
      expect(unlinkSpy).toHaveBeenCalledWith(
        expect.stringContaining("pregeneration_5_player1_0.json")
      );
      expect(unlinkSpy).toHaveBeenCalledWith(
        expect.stringContaining("pregeneration_5_player1_1.json")
      );
      expect(unlinkSpy).toHaveBeenCalledWith(
        expect.stringContaining("pregeneration_5_player2_0.json")
      );
      expect(unlinkSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("pregeneration_6_player1_0.json")
      );
    });

    it("should handle case when no files exist for specified turn", async () => {
      const mockFiles = [
        "pregeneration_6_player1_0.json",
        "pregeneration_7_player1_0.json",
        "story.json",
      ];

      readdirSpy.mockResolvedValue(mockFiles);

      await deletePregeneratedStoryFilesForTurn(mockStoryId, 5);

      expect(unlinkSpy).not.toHaveBeenCalled();
    });

    it("should not throw for ENOENT errors but throw for other errors", async () => {
      const mockFiles = [
        "pregeneration_5_player1_0.json",
        "pregeneration_5_player1_1.json",
      ];

      readdirSpy.mockResolvedValue(mockFiles);

      // Test ENOENT error (should not throw)
      const enoentError = new Error("ENOENT") as NodeJS.ErrnoException;
      enoentError.code = "ENOENT";
      unlinkSpy
        .mockRejectedValueOnce(enoentError)
        .mockResolvedValueOnce(undefined);

      await expect(
        deletePregeneratedStoryFilesForTurn(mockStoryId, 5)
      ).resolves.not.toThrow();
      expect(unlinkSpy).toHaveBeenCalledTimes(2);
    });

    it("should throw for non-ENOENT deletion errors", async () => {
      const mockFiles = ["pregeneration_5_player1_0.json"];

      readdirSpy.mockResolvedValue(mockFiles);
      unlinkSpy.mockRejectedValue(new Error("Permission denied"));

      await expect(
        deletePregeneratedStoryFilesForTurn(mockStoryId, 5)
      ).rejects.toThrow("Permission denied");
    });
  });
});
