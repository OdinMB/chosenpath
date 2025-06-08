import { config } from "../../config.js";
import { LectureGrid } from "./LectureGrid.js";

export function Academy() {
  return (
    <div className="max-w-4xl mx-auto p-4 font-lora">
      <div className="mb-6 overflow-hidden rounded-lg">
        <img
          src="/worldbuilding-academy.jpeg"
          alt="Create your own worlds"
          className="w-full object-cover"
        />
      </div>
      <div className="mb-6">
        <p className="mb-2">
          Use Chosen Path as your Story Engine. Define Worlds with setting,
          characters, conflicts, stats, mechanics, possible endings, and much
          more. Worldbuilding Academy teaches you how.{" "}
          <a href="/users/signin" className="text-link font-semibold">
            Sign in
          </a>{" "}
          to build a World, and join us on{" "}
          <a
            href={config.discordUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-link font-semibold"
          >
            Discord
          </a>{" "}
          to meet other students and faculty.
        </p>
      </div>

      <div className="mb-8">
        <h2 className="text-xl font-montserrat font-semibold mb-4 text-primary-800">
          Lectures
        </h2>
        <LectureGrid />
      </div>
    </div>
  );
}
