// Fixture content the seed doesn't make, made through the product's own API
// (through the front door, as the browser calls it): playable templates,
// each drafted by the server from a premise with the fake model and
// published, so a journey can start a story from the library. One is for a
// single player, one for a group.

import http from "node:http";
import { CLIENT_API_PREFIX } from "./guard.mjs";

const CSRF_COOKIE = "XSRF-TOKEN";
const CSRF_HEADER = "X-CSRF-TOKEN";

/** A signed-in conversation with the API: its cookies kept, the CSRF token sent back on every change. */
export function apiSession(origin) {
  const cookies = new Map();
  const base = new URL(origin);

  function request(method, apiPath, body) {
    const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
    const headers = { accept: "application/json" };
    if (payload) {
      headers["content-type"] = "application/json";
      headers["content-length"] = String(payload.length);
    }
    if (cookies.size > 0) headers.cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
    if (cookies.has(CSRF_COOKIE)) headers[CSRF_HEADER] = decodeURIComponent(cookies.get(CSRF_COOKIE));
    return new Promise((resolve, reject) => {
      const req = http.request(
        { host: base.hostname, port: base.port, method, path: `${CLIENT_API_PREFIX}${apiPath}`, headers },
        (res) => {
          for (const line of [].concat(res.headers["set-cookie"] ?? [])) {
            const [pair] = line.split(";");
            const index = pair.indexOf("=");
            if (index > 0) cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
          }
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            let json;
            try {
              json = text ? JSON.parse(text) : undefined;
            } catch {
              json = undefined;
            }
            resolve({ status: res.statusCode ?? 0, json });
          });
        }
      );
      req.on("error", reject);
      req.setTimeout(120_000, () => req.destroy(new Error(`${method} ${apiPath} timed out`)));
      if (payload) req.write(payload);
      req.end();
    });
  }

  return { request, hasCookie: (name) => cookies.has(name) };
}

function expectOk(response, what) {
  if (response.status < 200 || response.status >= 300 || response.json?.status !== "success") {
    const message = response.json?.errorMessage ?? response.json?.message ?? "";
    throw new Error(`${what} failed (HTTP ${response.status}${message ? `: ${message}` : ""})`);
  }
  return response.json.data;
}

/**
 * The templates a run makes, by the name a journey reads them under
 * (fixture.template, fixture.groupTemplate): fixture-vars.json's, the group
 * one in the game mode --group-mode names, if it names one, and both of the
 * length --story-length names, if it names one.
 */
export function fixtureTemplates(fixtureVars, { groupMode, storyLength } = {}) {
  const length = storyLength ? { maxTurns: storyLength } : {};
  return {
    template: { ...fixtureVars.template, ...length },
    groupTemplate: { ...fixtureVars.groupTemplate, ...(groupMode ? { gameMode: groupMode } : {}), ...length },
  };
}

/**
 * Drafts one template from its premise (POST /templates/generate, which runs
 * the content filter and the setup call against the fake model) for
 * `playerCount` seats, and publishes it. A template with a smaller
 * `playerCountMin` is published for that range: drafted for three seats, it
 * starts stories of two or three.
 */
async function draftAndPublish(api, name, template) {
  const generated = expectOk(
    await api.request("POST", "/templates/generate", {
      prompt: template.premise,
      playerCount: template.playerCount,
      maxTurns: template.maxTurns,
      gameMode: template.gameMode,
      generateImages: false,
    }),
    `drafting the fixture ${name}`
  );
  const { id, title } = generated.template;
  const playerCountMin = template.playerCountMin ?? template.playerCount;
  const range = playerCountMin === template.playerCount ? {} : { playerCountMin, playerCountMax: template.playerCount };
  expectOk(await api.request("PUT", `/templates/${id}`, { template: { publicationStatus: "published", ...range } }), `publishing the fixture ${name}`);
  return { id, title, playerCountMin, playerCountMax: template.playerCount, gameMode: template.gameMode, maxTurns: template.maxTurns };
}

/**
 * Signs in once as the fixture editor and makes each template, in order.
 * Returns each one's id, title, player range, game mode and length in turns under its name.
 */
export async function provisionTemplates(origin, { editor, templates }) {
  const api = apiSession(origin);
  // Any GET past the server's CSRF middleware sets the token cookie
  await api.request("GET", "/templates/published");
  if (!api.hasCookie(CSRF_COOKIE)) throw new Error("the server set no CSRF cookie");
  expectOk(await api.request("POST", "/auth/login", { email: editor.email, password: editor.password }), "signing in as the fixture editor (fixture-vars.json's editor; the seed's accounts are in server/src/scripts/devSeedData.ts)");
  const made = {};
  for (const [name, template] of Object.entries(templates)) made[name] = await draftAndPublish(api, name, template);
  return made;
}
