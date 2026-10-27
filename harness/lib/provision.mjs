// Fixture content the seed doesn't make, made through the product's own API
// (through the front door, as the browser calls it): a playable template,
// drafted by the server from a premise with the fake model and published, so
// the journey can start a story from the library.

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
 * Signs in as the fixture editor, drafts a template from the fixture premise
 * (POST /templates/generate, which runs the content filter and the setup call
 * against the fake model) and publishes it. Returns its id and title.
 */
export async function provisionTemplate(origin, { editor, template }) {
  const api = apiSession(origin);
  // Any GET past the server's CSRF middleware sets the token cookie
  await api.request("GET", "/templates/published");
  if (!api.hasCookie(CSRF_COOKIE)) throw new Error("the server set no CSRF cookie");
  expectOk(await api.request("POST", "/auth/login", { email: editor.email, password: editor.password }), "signing in as the fixture editor (fixture-vars.json's editor; the seed's accounts are in server/src/scripts/devSeedData.ts)");
  const generated = expectOk(
    await api.request("POST", "/templates/generate", {
      prompt: template.premise,
      playerCount: template.playerCount,
      maxTurns: template.maxTurns,
      gameMode: template.gameMode,
      generateImages: false,
    }),
    "drafting the fixture template"
  );
  const { id, title } = generated.template;
  expectOk(await api.request("PUT", `/templates/${id}`, { template: { publicationStatus: "published" } }), "publishing the fixture template");
  return { id, title };
}
