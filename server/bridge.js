/*__EXT_APPS_BUNDLE__*/
// Bridge between the quiz page and the Claude conversation.
// It never changes how the quiz works. It only watches:
//   • each click on "Check my answer"  → silently tells Claude how the attempt went
//   • data-food-chain-result on <html> → the quiz's own "solved" signal, which
//     the page sets when all five spaces are correct
const { App } = globalThis.ExtApps;

(async () => {
  const app = new App({ name: "MangroveLiveView", version: "1.0.0" }, {}, { autoResize: true });
  app.ontoolresult = () => {}; // nothing to render from the tool result
  await app.connect();

  const startedAt = Date.now();
  let attempts = 0;
  let reported = false;

  const readBoard = () =>
    [...document.querySelectorAll(".slot")].map((s, i) => ({
      space: i + 1,
      card: s.querySelector(".name")?.textContent ?? null,
      correct: s.classList.contains("correct"),
    }));

  // Outbound links (photo credits) must go through the host.
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    e.preventDefault();
    app.openLink({ url: a.href }).catch(() => {});
  });

  // Each attempt: let Claude know quietly, so it can give a good hint if asked.
  // Capture phase on document, so this runs before the quiz's own handler.
  document.addEventListener("click", (e) => {
    if (!(e.target.closest && e.target.closest("#check"))) return;
    attempts += 1;
    setTimeout(() => {
      if (reported) return;
      const board = readBoard();
      const right = board.filter((b) => b.correct).length;
      app
        .updateModelContext({
          content: [
            {
              type: "text",
              text:
                `LIVE VIEW quiz in progress. Attempt ${attempts}: ${right}/5 spaces correct. ` +
                `Board: ${board.map((b) => `${b.space}=${b.card}${b.correct ? " ✓" : " ✕"}`).join(", ")}. ` +
                `If the student asks for help, give a hint about the wrong spaces; do not reveal the full order.`,
            },
          ],
        })
        .catch(() => {});
    }, 0);
  }, true);

  async function reportCompletion(result) {
    if (reported) return;
    reported = true;
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    const chain = (result.sequence ?? []).join(" → ");
    const summary = { ...result, attempts: Math.max(attempts, 1), secondsTaken: seconds };

    try {
      await app.updateModelContext({
        content: [{ type: "text", text: `LIVE VIEW quiz result: ${JSON.stringify(summary)}` }],
      });
    } catch {}

    try {
      const res = await app.sendMessage({
        role: "user",
        content: [
          {
            type: "text",
            // text:
            //   `[LIVE VIEW COMPLETE] I finished the food chain quiz: ${summary.score}/${summary.total} ` +
            //   `in ${summary.attempts} attempt${summary.attempts === 1 ? "" : "s"}.\n${chain}`,
            text:""
          },
        ],
      });
      if (res && res.isError) throw new Error("host refused");
    } catch {
      // Host can't post for us: ask the student to type it instead.
      const status = document.getElementById("status");
      if (status) {
        status.textContent += '  Now type "done" in the chat to continue.';
      }
    }
  }

  const readResult = () => {
    const raw = document.documentElement.dataset.foodChainResult;
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  new MutationObserver(() => {
    const result = readResult();
    if (result && result.correct) reportCompletion(result);
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-food-chain-result"],
  });
})();
