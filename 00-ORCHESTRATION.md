# VORTEX — Build Orchestration Kit

**Role of this document:** you are the orchestrator. Fable 5.2 is the builder.
Your job is to sequence the work, hold the contracts stable, and gate each
stage. The model's job is to execute each stage at full capability.

**Deliverable:** a single self-contained browser game, no libraries, no network,
no build step, opens on double-click. 2-minute live demo.

---

## 1. What you are building

**Vortex** — an original two-player abstract strategy game with a computer
opponent that explains its own reasoning.

The board is three concentric rings. You push your rival's stones outward.
Shove one off the rim and it dies. You can only push from the inside out, so the
inner ring is the source of all force — and the most contested ground on the
board.

**Why this one wins the rubric:**

| Criterion | How Vortex earns it |
|---|---|
| Everyday problem | Learning a new board game is the friction. Vortex teaches itself with an in-app walkthrough, then plays you. |
| Something new | Radial board + outward-push capture. Not a chess/checkers/othello/go/hex variant. |
| Complicated | Negamax + alpha-beta + iterative deepening + a real evaluation function, and a "Why this move?" panel whose numbers come from the actual search. |
| Delight | You *play* it. It beats you, then explains why. Spectator wow is Demo 2; participation wow is this. |
| 2-min demo | Rules → play → reveal reasoning → land it. Cleanest arc of the five options. |

---

## 2. Architecture

**Five files, classic scripts, no build step.** Every file is loadable from
`file://` by double-click, so the game is demoable at the end of *every* stage.

```
index.html    shell: layout, panel, overlays, <script> tags
engine.js     PURE. rules + search + explain. No DOM. No canvas. Node-testable.
render.js     canvas drawing. Takes (ctx, state, options). No game logic.
ui.js         DOM wiring: input, panel, overlays, keyboard. No game logic.
app.js        controller: turn scheduling, state → render, animation queue.
```

**The one rule that makes staged development work:**

> `engine.js` never touches `document`, `window`, or canvas.
> `render.js` never decides anything — it only draws what it is given.
> `ui.js` and `app.js` never re-implement a rule that `engine.js` owns.

If a stage breaks this, the stage is not done.

**Testability:** `engine.js` ends with
`if (typeof module !== 'undefined') module.exports = Vortex;` so the same file
runs in Node for the Stage 1–2 test suites.

---

## 3. The seven stages

| # | Stage | Budget | Output | Hard gate |
|---|---|---|---|---|
| 0 | Spec lock | 15 min | validated GAME-SPEC, test suite | no forced win, balanced first move |
| 1 | Engine | 45 min | `engine.js` rules half | 16 legal moves from start, all vectors green |
| 2 | Search + explain | 60 min | `engine.js` search half | depth 6 < 150ms, beats random 95/100 |
| 3 | Visual | 40 min | `render.js` | premium at 3 sizes, crisp at DPR 2 |
| 4 | Interaction | 45 min | `ui.js` + `app.js` | full game playable, all controls live |
| 5 | Polish + analysis | 25 min | animations, "Why" panel, presentation mode | 2-min script runs end to end |
| 6 | Demo lock | 10 min | cold-start verification, handoff | zero console errors |

**Stage 5 is the flex buffer.** If you are behind at Stage 4, cut polish, never
cut the engine or the "Why" panel.

---

## 4. The consistency protocol

This is the part that kills staged builds. Every stage is a fresh context for
the model, and fresh contexts invent things. Five rules:

1. **Contracts are read-only.** `contracts/*.md` are authoritative. Only the
   stage that owns a contract may edit it. Everyone else reads and complies.
2. **Every stage opens the same way.** Read all three contracts before writing
   a line. The prompt says so explicitly.
3. **No identifier drift.** If a stage needs something the schema doesn't have,
   it **stops and reports** — it does not invent a parallel shape.
4. **Every stage closes the same way.** Write `handoffs/stage-N.md`: built /
   changed vs spec / known gaps / what the next stage must not touch.
5. **Verify before claiming.** Every handoff pastes real command output. No
   "should work".

**Owner map:**

| Contract | Owner | Everyone else |
|---|---|---|
| `GAME-SPEC.md` | Stage 0 | reads, never edits |
| `STATE-SCHEMA.md` | Stage 1 | reads, never edits |
| `DESIGN-TOKENS.md` | Stage 3 | reads, never edits |

---

## 5. The max-power protocol

How you get maximum capability out of the model instead of a safe sketch.

### 5.1 Prepend this to every stage prompt

```
You are operating at full capability. This is not a prototype and not a sketch.
Produce the complete, correct, polished implementation in this pass.

Hard rules:
- No TODO, no FIXME, no "left as an exercise", no stub functions, no
  "// implement later". If you can name it, implement it.
- No defensive hedging like "in a real app we would". This IS the real app.
- Do not simplify the design to save effort. If the spec says three visual
  states for legal moves, implement three.
- Prefer the ambitious correct version over the safe incomplete one.
- If something is genuinely impossible in scope, say so explicitly and propose
  the smallest honest cut. Do not silently degrade.
- Verify by running the code. Paste real output. Never claim untested behaviour.
```

### 5.2 Close every stage with this

```
When you finish:
1. Run the verification commands and paste the real output.
2. Do a second pass titled ADVERSARIAL REVIEW. Attack your own work:
   - what looks cheap or generic?
   - what contradicts DESIGN-TOKENS.md?
   - what breaks at 375px width or at 200% zoom?
   - what would a judge notice in the first five seconds?
   Fix everything you find.
3. Write handoffs/stage-N.md:
   - Built
   - Changed vs spec (and why)
   - Known gaps
   - What the next stage must not touch
4. Stop. Do not start the next stage.
```

### 5.3 Why this works

- **"No stubs" removes the model's escape hatch.** The most common failure in
  long builds is a plausible-looking partial file with three `// TODO`s that
  you discover at minute 200.
- **"Verify by running" converts confidence into evidence.** A stage that
  cannot run its own verification is not done.
- **"ADVERSARIAL REVIEW" buys you a second pass for free.** Models are far
  better at critiquing finished work than at avoiding flaws while writing.
- **"Stop. Do not start the next stage."** Without this the model races ahead
  and you lose the gate.

### 5.4 One more lever: ask for the design before the code

For Stage 3 (visual) and Stage 4 (interaction), demand a **written design
rationale first** — 10 lines on the look and feel, the motion language, the
visual hierarchy — then implement against it. This costs two minutes and
prevents the generic look.

---

## 6. Gates

Do not proceed until the gate is true. Gates are cheap; rework is not.

| Gate | Check |
|---|---|
| G0 | 200 self-play games at depth 4: first-player win rate 40–60%, no forced win at depth 8, mean game 20–70 plies |
| G1 | `moves(initial, 1).length === 16`; all six test vectors pass; symmetry holds |
| G2 | depth 6 median < 150ms; beats random 95+/100; explain() never fabricates |
| G3 | screenshots at 375 / 900 / 1440 px look intentional; crisp at DPR 2 |
| G4 | a human can play a full game to completion with mouse only |
| G5 | the 2-minute script runs without a hitch, twice in a row |
| G6 | cold load, zero console errors, zero network requests |

---

## 7. Cut list (in order, if behind)

1. Presentation mode (Stage 5) — nice, not essential.
2. Decorative vortex animation — the static board is fine.
3. PV step-through in the "Why" panel — keep the top-3 and the sentence.
4. Keyboard shortcuts — mouse-only is acceptable for a demo.
5. Move history panel — keep the last-move highlight instead.

**Never cut:** the test suite, the search, the "Why this move?" panel, the
walkthrough. Those are the demo.

---

## 8. Recovery matrix

| Symptom | Cause | Fix |
|---|---|---|
| Depth 6 takes > 1s | bad move ordering | order: captures → rim-pushes → inward moves; add iterative deepening |
| AI plays legally but badly | evaluation is material-only | add radial + threat terms per `skills/search-engine.md` |
| Board looks flat | no depth cues | stone sprite with radial gradient + pre-rendered glow, not `shadowBlur` |
| Board looks blurry | no DPR scaling | `canvas.width = css * devicePixelRatio`, `ctx.scale(dpr, dpr)` |
| Stone animation stutters | allocating in the render loop | pre-render sprites once; interpolate positions only |
| "Why" panel feels fake | prose invented | derive every clause from measured state deltas |
| Panel overflows on laptop | fixed height | `max-height: 100vh; overflow-y: auto` on the panel |
| Model keeps drifting from spec | no contract read step | make reading the contracts the first instruction, and re-paste the relevant one |

---

## 9. File map

```
vortex-build/
├── 00-ORCHESTRATION.md        ← you are here
├── contracts/
│   ├── GAME-SPEC.md           ← the rules. Owner: Stage 0.
│   ├── STATE-SCHEMA.md        ← data shapes + API. Owner: Stage 1.
│   └── DESIGN-TOKENS.md       ← palette, type, motion. Owner: Stage 3.
├── skills/
│   ├── game-design.md         ← how to validate an abstract game
│   ├── search-engine.md       ← minimax, eval, explainability
│   ├── visual-design.md       ← canvas craft, art direction
│   ├── interaction-ux.md      ← input, feedback, accessibility
│   └── presentation.md        ← the 2-minute demo
└── prompts/
    ├── stage-0-spec-lock.md
    ├── stage-1-engine.md
    ├── stage-2-search.md
    ├── stage-3-visual.md
    ├── stage-4-interaction.md
    ├── stage-5-polish.md
    └── stage-6-demo-lock.md
```

**How to run it:** paste `prompts/stage-0-spec-lock.md` into Claude Code. When
it hands off, read `handoffs/stage-0.md`, confirm the gate, paste Stage 1.
Repeat. Do not batch stages.

---

## 10. Ground rules for you, the orchestrator

- **One stage at a time.** Batching stages is how consistency dies.
- **Read the handoff before pasting the next prompt.** If the handoff says
  "known gap: undo is broken", fix it in the next stage's brief, don't hope.
- **Trust the gate, not the vibe.** "It looks done" is not a gate.
- **If a stage produces something that contradicts a contract, reject it.**
  Re-paste the stage with the contract quoted inline.
- **Never let the model edit a contract it doesn't own.** If it insists, that is
  the signal it has misread the brief — re-paste with the contract quoted.
