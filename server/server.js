// Mangrove "LIVE VIEW" MCP App server
// -----------------------------------
// Serves the GitHub Pages quiz as an interactive widget inside the Claude chat,
// and injects a small bridge that tells the conversation when the quiz is solved.
//
// Why we don't just <iframe> the GitHub URL: Claude's widget sandbox does not
// allow nested iframes (CSP frameDomains is restricted). So instead the server
// fetches the live page from GitHub, inlines its photos, adds the bridge, and
// serves the result as the widget's own HTML. Edits you push to GitHub show up
// here within CACHE_MS (hosts may also cache the widget for a while).

import express from "express";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  registerAppTool,
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";

const SITE_URL = process.env.SITE_URL ?? "https://wshen7777.github.io/mangrove-food-web/";
const RESOURCE_URI = "ui://mangrove/live-view.html";
const CACHE_MS = Number(process.env.CACHE_MS ?? 60_000);
const IMAGE_WIDTH = 640; // keep the widget payload small
const PORT = Number(process.env.PORT ?? 3000);

// ---------------------------------------------------------------------------
// 0. Lesson flow. Claude receives this text when the quiz opens, so students
//    don't have to install anything except the connector.
//    EDIT "AFTER THE QUIZ" to change the next step.
// ---------------------------------------------------------------------------
const LESSON_INSTRUCTIONS = `The "Build the Food Chain" quiz is now on screen. The student is a primary-school pupil: keep every message short, warm and simple.

WHILE THE QUIZ IS OPEN
- Give one short line of encouragement now, then stop. Do not reveal or discuss the correct order.
- You may receive silent updates about each attempt. If the student asks for help, give one hint about a wrong space (e.g. "Which living thing makes its own food from sunlight?"), never the full order.
- If the student says they are done but no [LIVE VIEW COMPLETE] message has arrived, ask them to press "Check my answer" in the quiz.

AFTER THE QUIZ — start only when a message beginning with [LIVE VIEW COMPLETE] arrives
1. Celebrate briefly and repeat the chain: Mangrove tree → Mangrove crab → Mudskipper → Collared kingfisher → Saltwater crocodile. Remind them the arrow means "is consumed by".
2. Ask these questions ONE AT A TIME, waiting for each answer and giving short feedback:
   a. Which living thing is the producer? How do you know?
   b. Where does the energy in this food chain first come from?
   c. What might happen to the mudskippers if the collared kingfishers disappeared?
3. Finish with one sentence summing up what they learned.`;

// ---------------------------------------------------------------------------
// 1. The ext-apps browser bundle, rewritten so an inline <script> can use it.
//    (The widget sandbox blocks CDN imports, so this must be inlined.)
// ---------------------------------------------------------------------------
const require = createRequire(import.meta.url);
const EXT_APPS_BUNDLE = readFileSync(
  require.resolve("@modelcontextprotocol/ext-apps/app-with-deps"),
  "utf8",
).replace(/export\{([^}]+)\};?\s*$/, (_, body) =>
  "globalThis.ExtApps={" +
  body
    .split(",")
    .map((pair) => {
      const [local, exported] = pair.split(" as ").map((s) => s.trim());
      return `${exported ?? local}:${local}`;
    })
    .join(",") +
  "};",
);

const BRIDGE = readFileSync(new URL("./bridge.js", import.meta.url), "utf8");

// ---------------------------------------------------------------------------
// 2. Fetch the live site and turn it into a self-contained widget page.
// ---------------------------------------------------------------------------
const UA = "MangroveLiveView/1.0 (MCP App; educational quiz widget)";

// Wikimedia originals can be many MB; ask for a resized copy instead.
function smallerImageUrl(url) {
  const u = new URL(url);
  if (u.hostname === "commons.wikimedia.org" && u.pathname.includes("Special:FilePath")) {
    u.searchParams.set("width", String(IMAGE_WIDTH));
    return u.toString();
  }
  const m = u.hostname === "upload.wikimedia.org" &&
    u.pathname.match(/^\/wikipedia\/commons\/(?!thumb\/)[0-9a-f]\/[0-9a-f]{2}\/([^/]+)$/);
  if (m) {
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${m[1]}?width=${IMAGE_WIDTH}`;
  }
  return url;
}

async function toDataUrl(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return undefined;
    const mime = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0];
    if (!mime.startsWith("image/")) return undefined;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return undefined;
  }
}

async function buildWidgetHtml() {
  const res = await fetch(SITE_URL, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Could not load ${SITE_URL} (HTTP ${res.status})`);
  let html = await res.text();

  // Inline every <img src="..."> as a data: URL (falls back to an absolute URL).
  const srcs = [...html.matchAll(/<img\b[^>]*?\ssrc="([^"]+)"/gi)].map((m) => m[1]);
  const unique = [...new Set(srcs)].filter((s) => !s.startsWith("data:"));
  const resolved = await Promise.all(
    unique.map(async (src) => {
      const abs = new URL(src, SITE_URL).toString();
      const data = (await toDataUrl(smallerImageUrl(abs))) ?? (await toDataUrl(abs));
      return [src, data ?? abs];
    }),
  );
  for (const [src, replacement] of resolved) {
    html = html.split(`src="${src}"`).join(`src="${replacement}" referrerpolicy="no-referrer"`);
  }

  // The page's success message mentions ChatGPT; make it read naturally in Claude.
  html = html.replace(/share with ChatGPT/g, "share with Claude");

  // Inject the bridge just before </body>.
  const bridgeTag = `<script type="module">\n${BRIDGE}\n</script>`;
  html = html.includes("</body>")
    ? html.replace("</body>", () => `${bridgeTag}\n</body>`)
    : html + bridgeTag;

  return html.replace("/*__EXT_APPS_BUNDLE__*/", () => EXT_APPS_BUNDLE);
}

let cache = { html: null, at: 0 };
async function getWidgetHtml() {
  if (cache.html && Date.now() - cache.at < CACHE_MS) return cache.html;
  try {
    cache = { html: await buildWidgetHtml(), at: Date.now() };
  } catch (err) {
    console.error(err);
    if (!cache.html) {
      return `<!doctype html><meta charset="utf-8"><p style="font:16px system-ui;padding:16px">
        Sorry — the quiz page could not be loaded right now. Please try LIVE VIEW again in a minute.</p>`;
    }
  }
  return cache.html;
}

// ---------------------------------------------------------------------------
// 3. The MCP server: one tool (live_view) + one UI resource.
// ---------------------------------------------------------------------------
function createServer() {
  const server = new McpServer({ name: "mangrove-live-view", version: "1.0.0" });

  registerAppTool(
    server,
    "live_view",
    {
      title: "LIVE VIEW: Build the Food Chain",
      description:
        "Shows the interactive mangrove 'Build the Food Chain' quiz inline in the chat so the " +
        "student can do it right here. Call this when the user types LIVE VIEW (any capitalisation), " +
        "runs /live-view, or asks to start the mangrove food chain activity. The student works in the " +
        "widget; when they solve it, the widget automatically sends a chat message that starts with " +
        "[LIVE VIEW COMPLETE]. After calling this tool, give one short line of encouragement and stop: " +
        "do not reveal the correct order, and do not move on until that completion message arrives.",
      annotations: { title: "LIVE VIEW", readOnlyHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async () => ({
      content: [{ type: "text", text: LESSON_INSTRUCTIONS }],
    }),
  );

  registerAppResource(
    server,
    "Mangrove food chain quiz",
    RESOURCE_URI,
    { description: "Live copy of the Build the Food Chain quiz with a completion bridge." },
    async () => ({
      contents: [
        {
          uri: RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: await getWidgetHtml(),
          _meta: {
            ui: {
              // Only used if an image could not be inlined server-side.
              csp: {
                resourceDomains: [
                  new URL(SITE_URL).origin,
                  "https://upload.wikimedia.org",
                  "https://commons.wikimedia.org",
                ],
              },
            },
          },
        },
      ],
    }),
  );

  return server;
}

// ---------------------------------------------------------------------------
// 4. HTTP transport (stateless streamable HTTP).
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: "1mb" }));

app.post("/mcp", async (req, res) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: "internal error" });
  }
});
app.all("/mcp", (_req, res) => res.status(405).set("Allow", "POST").end());

app.get("/", (_req, res) => res.type("text").send("Mangrove LIVE VIEW MCP server is running. MCP endpoint: /mcp"));

// Local test page: open http://localhost:3000/preview in a normal browser.
// A fake host logs what the widget would send to Claude, so you can check the
// completion detection without connecting to Claude at all.
app.get("/preview", async (_req, res) => {
  const html = await getWidgetHtml();
  const shim = `globalThis.ExtApps={App:class{
    constructor(){} async connect(){} getHostContext(){return{}}
    async sendMessage(m){console.log("sendMessage →",m);alert("Would send to Claude:\\n\\n"+m.content[0].text);return{}}
    async updateModelContext(c){console.log("updateModelContext →",c);return{}}
    async openLink({url}){window.open(url,"_blank");return{}}
  }};`;
  res.type("html").send(html.replace(EXT_APPS_BUNDLE, () => shim));
});

app.listen(PORT, () => console.log(`LIVE VIEW MCP server on http://localhost:${PORT}/mcp`));
