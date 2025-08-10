import { jest } from "@jest/globals";
import * as mockFs from "../../helpers/mockFsPromises.js";

// ESM-safe fs mock before imports
// Avoid duplicate default key by splitting default from the rest
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { default: defaultFsMock, ...restFsMock } = mockFs as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
await (jest as any).unstable_mockModule("fs/promises", () => ({
  __esModule: true,
  default: defaultFsMock,
  ...restFsMock,
}));

// Prepare storageUtils mock with jest.fn functions (ESM-safe)
const storageUtilsMock = {
  getPregeneratedStoryFilePath: jest.fn(),
  listPregeneratedStoryFiles: jest.fn(),
  deleteAllPregeneratedStoryFiles: jest.fn(),
  deletePregeneratedStoryFilesForTurn: jest.fn(),
  readStoryFile: jest.fn(),
  writeStoryFile: jest.fn(),
  deleteStoryDirectory: jest.fn(),
  getStoryDirectoryPath: (await import("../../../src/shared/storageUtils.js"))
    .getStoryDirectoryPath,
};
// Mock storage utils module before importing StoryRepository
// eslint-disable-next-line @typescript-eslint/no-explicit-any
await (jest as any).unstable_mockModule(
  "../../../src/shared/storageUtils.js",
  () => ({ __esModule: true, ...storageUtilsMock })
);

const storageUtils = await import("../../../src/shared/storageUtils.js");
const { StoryRepository } = await import(
  "../../../src/stories/StoryRepository.js"
);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fs = (await import("fs/promises")) as any as typeof import("fs/promises");

// Define types inline to avoid core imports
type PlayerSlot = "player1" | "player2" | "player3" | "player4";

// Import the existing mock story state creator
import { AIStoryGenerator } from "../../__mocks__/game/services/AIStoryGenerator.js";

const mockAIGenerator = new AIStoryGenerator();
const createMockStoryState = () => mockAIGenerator.createInitialState();

// Mock core imports - create a simple Story mock without recursive references
jest.mock("core/models/Story.js", () => ({
  Story: class MockStory {
    private state: unknown;

    constructor(state: unknown) {
      this.state = state;
    }

    getState() {
      return this.state;
    }

    // Add stub methods and properties to satisfy TypeScript - no recursive constructor calls
    clone = jest.fn().mockReturnValue({ getState: () => this.state });
    getId = jest.fn().mockReturnValue("mock-id");
    getTemplateId = jest.fn().mockReturnValue(null);
    isBasedOnTemplate = jest.fn().mockReturnValue(false);
  },
}));

// Create a local mock class for use in tests - simplified to avoid type issues
const Story = class {
  private state: unknown;

  constructor(state: unknown) {
    this.state = state;
  }

  getState() {
    return this.state;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

// Mock dependencies: type only for subset used in tests
type FsSubset = Pick<
  typeof import("fs/promises"),
  "readFile" | "writeFile" | "unlink" | "access" | "readdir"
>;
const fsMock = mockFs as unknown as jest.Mocked<FsSubset>;
// Spies for storage utils (typed) – use the mocked fns directly
let spyGetPregeneratedStoryFilePath: jest.SpiedFunction<
  typeof storageUtils.getPregeneratedStoryFilePath
>;
// note: other spies are created inline where used to avoid unused variables

describe("StoryRepository - Pregeneration Methods", () => {
  let repository: ReturnType<typeof StoryRepository.getInstance>;
  const mockStoryId = "test-story-123";
  const mockTurn = 5;
  const mockPlayerSlot: PlayerSlot = "player1";
  const mockOptionIndex = 2;

  let mockStoryState: Awaited<ReturnType<typeof createMockStoryState>>;

  // Mock console methods to suppress output during tests
  beforeAll(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterAll(() => {
    (console.log as jest.Mock).mockRestore();
    (console.error as jest.Mock).mockRestore();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    // Spy on storage utils we need
    spyGetPregeneratedStoryFilePath = jest
      .spyOn(storageUtils, "getPregeneratedStoryFilePath")
      .mockImplementation(
        (
          storyId: string,
          turn: number,
          playerSlot: string,
          optionIndex: number
        ) =>
          `/mock/${storyId}/pregeneration_${turn}_${playerSlot}_${optionIndex}.json`
      );
    jest
      .spyOn(storageUtils, "listPregeneratedStoryFiles")
      .mockResolvedValue([]);
    jest
      .spyOn(storageUtils, "deleteAllPregeneratedStoryFiles")
      .mockResolvedValue();
    jest
      .spyOn(storageUtils, "deletePregeneratedStoryFilesForTurn")
      .mockResolvedValue();
    // Get the singleton instance
    repository = StoryRepository.getInstance();
    // Create fresh mock state for each test
    mockStoryState = await createMockStoryState();
  });

  describe("getPregeneratedStory", () => {
    it("should retrieve and parse pregenerated story from file", async () => {
      const mockFilePath = "/path/to/pregenerated.json";
      jest
        .spyOn(storageUtils, "getPregeneratedStoryFilePath")
        .mockReturnValue(mockFilePath);
      fsMock.readFile.mockResolvedValue(JSON.stringify(mockStoryState));

      const result = await repository.getPregeneratedStory(
        mockStoryId,
        mockTurn,
        mockPlayerSlot,
        mockOptionIndex
      );

      expect(storageUtils.getPregeneratedStoryFilePath).toHaveBeenCalledWith(
        mockStoryId,
        mockTurn,
        mockPlayerSlot,
        mockOptionIndex
      );
      expect(fs.readFile).toHaveBeenCalledWith(mockFilePath, "utf-8");
      expect(result).toBeTruthy();
      expect(result?.getState).toBeInstanceOf(Function);
      expect(result?.getState().id).toBe("mock-story-id"); // Using the actual mock ID
    });

    it("should return null when file doesn't exist", async () => {
      const mockFilePath = "/path/to/pregenerated.json";
      jest
        .spyOn(storageUtils, "getPregeneratedStoryFilePath")
        .mockReturnValue(mockFilePath);

      const error = new Error("ENOENT") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      fsMock.readFile.mockRejectedValue(error);

      const result = await repository.getPregeneratedStory(
        mockStoryId,
        mockTurn,
        mockPlayerSlot,
        mockOptionIndex
      );

      expect(result).toBeNull();
    });

    it("should return null for other file read errors", async () => {
      const mockFilePath = "/path/to/pregenerated.json";
      jest
        .spyOn(storageUtils, "getPregeneratedStoryFilePath")
        .mockReturnValue(mockFilePath);
      fsMock.readFile.mockRejectedValue(new Error("Permission denied"));

      const result = await repository.getPregeneratedStory(
        mockStoryId,
        mockTurn,
        mockPlayerSlot,
        mockOptionIndex
      );

      expect(result).toBeNull();
    });
  });

  describe("storePregeneratedStory", () => {
    it("should store pregenerated story to file", async () => {
      const mockFilePath = "/path/to/pregenerated.json";
      const mockStory = new Story(mockStoryState);

      spyGetPregeneratedStoryFilePath.mockReturnValue(mockFilePath);
      fsMock.writeFile.mockResolvedValue(undefined);

      await repository.storePregeneratedStory(
        mockStoryId,
        mockTurn,
        mockPlayerSlot,
        mockOptionIndex,
        mockStory
      );

      expect(storageUtils.getPregeneratedStoryFilePath).toHaveBeenCalledWith(
        mockStoryId,
        mockTurn,
        mockPlayerSlot,
        mockOptionIndex
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        mockFilePath,
        JSON.stringify(mockStoryState, null, 2)
      );
    });

    it("should throw error when write fails", async () => {
      const mockFilePath = "/path/to/pregenerated.json";
      const mockStory = new Story(mockStoryState);

      jest
        .spyOn(storageUtils, "getPregeneratedStoryFilePath")
        .mockReturnValue(mockFilePath);
      fsMock.writeFile.mockRejectedValue(new Error("Write failed"));

      await expect(
        repository.storePregeneratedStory(
          mockStoryId,
          mockTurn,
          mockPlayerSlot,
          mockOptionIndex,
          mockStory
        )
      ).rejects.toThrow("Write failed");
    });
  });

  describe("deletePregeneratedStory", () => {
    it("should delete specific pregenerated story file", async () => {
      const mockFilePath = "/path/to/pregenerated.json";

      (
        storageUtils.getPregeneratedStoryFilePath as unknown as jest.Mock
      ).mockReturnValue(mockFilePath);
      fsMock.unlink.mockResolvedValue(undefined);

      await repository.deletePregeneratedStory(
        mockStoryId,
        mockTurn,
        mockPlayerSlot,
        mockOptionIndex
      );

      expect(fs.unlink).toHaveBeenCalledWith(mockFilePath);
    });

    it("should not throw when file doesn't exist", async () => {
      const mockFilePath = "/path/to/pregenerated.json";

      jest
        .spyOn(storageUtils, "getPregeneratedStoryFilePath")
        .mockReturnValue(mockFilePath);

      const error = new Error("ENOENT") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      fsMock.unlink.mockRejectedValue(error);

      await expect(
        repository.deletePregeneratedStory(
          mockStoryId,
          mockTurn,
          mockPlayerSlot,
          mockOptionIndex
        )
      ).resolves.not.toThrow();
    });

    it("should throw for other delete errors", async () => {
      const mockFilePath = "/path/to/pregenerated.json";

      jest
        .spyOn(storageUtils, "getPregeneratedStoryFilePath")
        .mockReturnValue(mockFilePath);
      fsMock.unlink.mockRejectedValue(new Error("Permission denied"));

      await expect(
        repository.deletePregeneratedStory(
          mockStoryId,
          mockTurn,
          mockPlayerSlot,
          mockOptionIndex
        )
      ).rejects.toThrow("Permission denied");
    });
  });

  describe("deleteAllPregeneratedStories", () => {
    it("should call storage util to delete all pregenerated files", async () => {
      jest
        .spyOn(storageUtils, "deleteAllPregeneratedStoryFiles")
        .mockResolvedValue(undefined);

      await repository.deleteAllPregeneratedStories(mockStoryId);

      expect(storageUtils.deleteAllPregeneratedStoryFiles).toHaveBeenCalledWith(
        mockStoryId
      );
    });

    it("should throw error when deletion fails", async () => {
      jest
        .spyOn(storageUtils, "deleteAllPregeneratedStoryFiles")
        .mockRejectedValue(new Error("Deletion failed"));

      await expect(
        repository.deleteAllPregeneratedStories(mockStoryId)
      ).rejects.toThrow("Deletion failed");
    });
  });

  describe("deletePregeneratedStoriesForTurn", () => {
    it("should call storage util to delete files for specific turn", async () => {
      jest
        .spyOn(storageUtils, "deletePregeneratedStoryFilesForTurn")
        .mockResolvedValue(undefined);

      await repository.deletePregeneratedStoriesForTurn(mockStoryId, mockTurn);

      expect(
        storageUtils.deletePregeneratedStoryFilesForTurn
      ).toHaveBeenCalledWith(mockStoryId, mockTurn);
    });

    it("should throw error when deletion fails", async () => {
      jest
        .spyOn(storageUtils, "deletePregeneratedStoryFilesForTurn")
        .mockRejectedValue(new Error("Deletion failed"));

      await expect(
        repository.deletePregeneratedStoriesForTurn(mockStoryId, mockTurn)
      ).rejects.toThrow("Deletion failed");
    });
  });

  describe("listPregeneratedStories", () => {
    it("should return list of pregenerated stories", async () => {
      const mockFiles = [
        {
          filename: "pregen1.json",
          turn: 5,
          playerSlot: "player1",
          optionIndex: 0,
        },
        {
          filename: "pregen2.json",
          turn: 5,
          playerSlot: "player1",
          optionIndex: 1,
        },
        {
          filename: "pregen3.json",
          turn: 6,
          playerSlot: "player2",
          optionIndex: 0,
        },
      ];

      jest
        .spyOn(storageUtils, "listPregeneratedStoryFiles")
        .mockResolvedValue(mockFiles);

      const result = await repository.listPregeneratedStories(mockStoryId);

      expect(storageUtils.listPregeneratedStoryFiles).toHaveBeenCalledWith(
        mockStoryId
      );
      expect(result).toEqual([
        { turn: 5, playerSlot: "player1", optionIndex: 0 },
        { turn: 5, playerSlot: "player1", optionIndex: 1 },
        { turn: 6, playerSlot: "player2", optionIndex: 0 },
      ]);
    });

    it("should handle empty list", async () => {
      jest
        .spyOn(storageUtils, "listPregeneratedStoryFiles")
        .mockResolvedValue([]);

      const result = await repository.listPregeneratedStories(mockStoryId);

      expect(result).toEqual([]);
    });

    it("should throw error when listing fails", async () => {
      jest
        .spyOn(storageUtils, "listPregeneratedStoryFiles")
        .mockRejectedValue(new Error("List failed"));

      await expect(
        repository.listPregeneratedStories(mockStoryId)
      ).rejects.toThrow("List failed");
    });
  });

  describe("hasPregeneratedStory", () => {
    it("should return true when pregenerated story exists", async () => {
      const mockFilePath = "/path/to/pregenerated.json";

      (storageUtils.getPregeneratedStoryFilePath as jest.Mock).mockReturnValue(
        mockFilePath
      );
      fsMock.access.mockResolvedValue(undefined);

      const result = await repository.hasPregeneratedStory(
        mockStoryId,
        mockTurn,
        mockPlayerSlot,
        mockOptionIndex
      );

      expect(fs.access).toHaveBeenCalledWith(mockFilePath);
      expect(result).toBe(true);
    });

    it("should return false when pregenerated story doesn't exist", async () => {
      const mockFilePath = "/path/to/pregenerated.json";

      (storageUtils.getPregeneratedStoryFilePath as jest.Mock).mockReturnValue(
        mockFilePath
      );
      fsMock.access.mockRejectedValue(new Error("ENOENT"));

      const result = await repository.hasPregeneratedStory(
        mockStoryId,
        mockTurn,
        mockPlayerSlot,
        mockOptionIndex
      );

      expect(result).toBe(false);
    });
  });
});
