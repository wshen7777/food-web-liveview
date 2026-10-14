# Mangrove LIVE VIEW plugin

Type **LIVE VIEW** (or `/live-view`) and the "Build the Food Chain" quiz from
https://wshen7777.github.io/mangrove-food-web/ appears inside the Claude chat.
When the student solves it, the quiz posts `[LIVE VIEW COMPLETE] …` into the
conversation automatically and Claude moves on to the next step.

```
mangrove-live-view/
├── .claude-plugin/plugin.json   plugin manifest
├── .mcp.json                    points the plugin at your server  ← edit the URL
├── commands/live-view.md        the /live-view command
├── skills/live-view/SKILL.md    what Claude does before, during and after the quiz  ← edit "Step 3"
└── server/                      the MCP App server (Node 20+)
    ├── server.js                fetches your GitHub page, serves it as the inline widget
    └── bridge.js                injected into the page; reports attempts + completion to Claude
```

## How it works

1. Claude calls the `live_view` tool. The tool points at a UI resource, so Claude
   shows it as an interactive widget in the chat.
2. The server builds that widget from your **live** GitHub Pages site: it fetches the
   page, inlines the photos, and adds `bridge.js`. (Claude doesn't allow a widget to
   embed another site in an iframe, which is why the page is copied in rather than linked.)
   Changes you push to GitHub appear within about a minute.
3. `bridge.js` watches the `data-food-chain-result` attribute your page already sets
   when the answer is correct. When it appears, the bridge
   - silently gives Claude the full result (score, attempts, time), and
   - sends a chat message as the student: `[LIVE VIEW COMPLETE] I finished … 5/5 in 2 attempts.`
4. That message starts Claude's next turn, and the skill tells Claude what "the next step" is.

During the quiz, every "Check my answer" press also gives Claude a silent update
(which spaces are right or wrong), so if the student asks for help, Claude can hint
without revealing the order.

**Keep this in your site:** the line that sets
`document.documentElement.dataset.foodChainResult = JSON.stringify(result)` with
`correct: true`. That's the signal the bridge listens for.

## 1. Run it locally

```bash
cd server
npm install
npm start                      # http://localhost:3000/mcp
```

Open http://localhost:3000/preview in a normal browser and solve the quiz. A pop-up
shows the exact message that would be sent to Claude.

## 2. Put it online

Claude needs to reach the server over public HTTPS.

- Quick test: `cloudflared tunnel --url http://localhost:3000` and use the
  `https://….trycloudflare.com/mcp` address it prints.
- Permanent: deploy the `server/` folder to any Node host (Render, Railway, Fly.io,
  a VPS…). Start command `npm start`; the port comes from `PORT`.

Then replace `https://YOUR-SERVER-HOST/mcp` in `.mcp.json` with your real URL.

Optional settings (environment variables): `SITE_URL` (a different quiz page),
`CACHE_MS` (how often to re-fetch the page, default 60000).

## 3. Use it

- **As a plugin** (Claude apps that support plugins, such as Cowork): install this
  folder as a plugin. That adds the connector, the `/live-view` command and the skill.
- **In claude.ai chat**: add `https://YOUR-SERVER-HOST/mcp` as a custom connector, and
  upload `skills/live-view` (zipped) as a skill so Claude knows the lesson flow.

The quiz is a visual widget, so it shows up in Claude's chat apps (web, desktop,
mobile, Cowork). A terminal-only session can't display it.

## Customising the "next step"

Edit **Step 3** in `skills/live-view/SKILL.md`. Claude starts it only after it
receives the `[LIVE VIEW COMPLETE]` message.

## One fix worth making in the website

If a photo fails to load, the page removes that `<img>`, and later
`c.querySelector('img').cloneNode()` in `render()` throws — so that card can no
longer be placed and the quiz gets stuck. The server inlines the photos, which makes
this unlikely here, but a small guard in the site makes it safe everywhere:

```js
let src = c.querySelector('img');
if (src) { let im = src.cloneNode(); im.draggable = false; s.append(im); }
let n = document.createElement('span'); n.className = 'name'; n.textContent = placed[i]; s.append(n);
```
