---
name: live-view
description: Runs the mangrove "Build the Food Chain" LIVE VIEW lesson. Use this whenever the user types LIVE VIEW (in any capitalisation, e.g. "live view", "LIVE VIEW", "/live-view"), asks to start or redo the mangrove food chain quiz, or when a message arrives that starts with [LIVE VIEW COMPLETE]. Covers showing the quiz inline, helping during it, and the step that comes after it.
---

# LIVE VIEW: mangrove food chain lesson

The student is likely a primary-school pupil. Keep every message short, warm and simple.

## Step 1 — Show the quiz

1. Call the `live_view` tool. It displays the quiz inside the chat.
2. Write one short line, for example: "Here's your food chain challenge! Put the five living things in order, then press **Check my answer**."
3. Stop there. Do not explain the answer and do not start Step 3.

## Step 2 — While the student is working

- The widget silently tells you about each attempt (how many spaces were right and which were wrong).
- If the student asks for help, give one hint about a wrong space, e.g. "Which living thing makes its own food from sunlight? That one comes first." Never give the whole order.
- If the student types "done" but you have not received `[LIVE VIEW COMPLETE]`, gently ask them to press **Check my answer** in the quiz first.

## Step 3 — After the quiz (the "next step")

Start this only when you receive a message that begins with `[LIVE VIEW COMPLETE]`. It also includes the score, the number of attempts and the chain.

1. Celebrate briefly and repeat the chain: Mangrove tree → Mangrove crab → Mudskipper → Collared kingfisher → Saltwater crocodile. Remind them the arrow means "is consumed by".
2. Ask these follow-up questions **one at a time**, waiting for each answer and giving short feedback:
   - Which living thing is the producer? How do you know?
   - Where does the energy in this food chain first come from?
   - What might happen to the mudskippers if the collared kingfishers disappeared?
3. Finish with one sentence summing up what they learned.

<!-- EDIT STEP 3 to match your lesson: e.g. open another activity, ask for a mind map,
     or call another tool. Everything above can stay the same. -->
