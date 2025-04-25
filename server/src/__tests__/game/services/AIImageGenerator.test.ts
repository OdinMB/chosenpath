/// <reference types="mocha" />
import { aiImageGenerator } from "game/services/AIImageGenerator.js";
import { expect } from "chai";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { getStoragePath } from "shared/storageUtils.js";
import { ImageReference } from "core/types/image.js";

// Load environment variables for tests
dotenv.config();

// Sample template UUID
const TEMPLATE_ID = "22b80460-e916-4ed2-a81a-a7e2d4940748";

// Debug utility to check environment
function checkEnvironment() {
  // Use getStoragePath to get the library path and then add the template ID
  const templateDir = path.join(getStoragePath("library"), TEMPLATE_ID);
  console.log("Template directory exists:", fs.existsSync(templateDir));
  if (!fs.existsSync(templateDir)) {
    try {
      fs.mkdirSync(templateDir, { recursive: true });
      console.log("Created template directory");
    } catch (error) {
      console.error("Failed to create template directory:", error);
    }
  }
}

describe("AIImageGenerator", function () {
  // Set a longer timeout since image generation can take time
  this.timeout(60000);

  it("should generate a single image and save it to the template directory", async function () {
    // Run environment check first
    checkEnvironment();

    // Skip test if OpenAI API key is not set
    if (!process.env.OPENAI_API_KEY) {
      console.log("Skipping test: OPENAI_API_KEY is not set");
      this.skip();
      return;
    }

    try {
      const imgEvelyn = {
        id: "evelyn",
        source: "template",
        sourceId: TEMPLATE_ID,
      } as ImageReference;
      const imgTommy = {
        id: "tommy",
        source: "template",
        sourceId: TEMPLATE_ID,
      } as ImageReference;

      const prompt = `Evelyn and Tommy in a fist fight in a dark alley at night in London. Cinematic, wide shot.`;

      console.log("Test: Starting image generation");
      const imagePath = await aiImageGenerator.generateSingleImage(
        prompt,
        TEMPLATE_ID,
        [imgEvelyn, imgTommy]
      );
      console.log("Image generated at path:", imagePath);

      // Check if file exists
      expect(fs.existsSync(imagePath)).to.be.true;

      // Check if file is an image (has content and ends with .jpeg)
      const stats = fs.statSync(imagePath);
      console.log("Image file size:", stats.size);
      expect(stats.size).to.be.greaterThan(0);
      expect(path.extname(imagePath)).to.equal(".jpeg");

      // Verify the file is in the correct directory
      const templatePath = path.join(getStoragePath("library"), TEMPLATE_ID);
      const normalizedImagePath = path.normalize(imagePath);
      const normalizedTemplatePath = path.normalize(templatePath);

      console.log("Template path:", normalizedTemplatePath);
      console.log("Image path:", normalizedImagePath);

      // Check if the image path contains the template path
      expect(
        normalizedImagePath.includes(normalizedTemplatePath) ||
          normalizedImagePath.includes(
            normalizedTemplatePath.replace(/\\/g, "/")
          )
      ).to.be.true;

      console.log(`Image generated successfully at: ${imagePath}`);
    } catch (error) {
      console.error("Test failed with error:", error);
      throw error;
    }
  });
});
