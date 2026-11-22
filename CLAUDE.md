# Vortex — build orchestration

You are building **Vortex**: an original two-player abstract strategy game with
a game-tree-search opponent that explains its own moves.

Browser game. Single page. No libraries, no network, no build step, opens on
double-click. Delivered in seven staged passes.

---

## Read these first — they are authoritative

@contracts/GAME-SPEC.md

@contracts/STATE-SCHEMA.md

@contracts/DESIGN-TOKENS.md

If a stage needs something these do not contain, it **stops and reports**. It
does not invent a parallel shape.

---

## Non-negotiable rules

1. **Contracts are read-only.** Only the stage that owns a contract may edit it.
   `GAME-SPEC.md` → Stage 0 · `STATE-SCHEMA.md` → Stage 1 · `DESIGN-TOKENS.md` →
   Stage 3.
2. **`engine.js` never touches `document`, `window`, or canvas.** It must load in
   Node via `require()`.
3. **`render.js` decides nothing.** It draws the state and options it is given.
4. **`apply()` returns a new array.** Mutating state corrupts the search
   silently. This is the single most common engine bug.
5. **One stage at a time.** Never start the next stage without an explicit
   instruction.
6. **No stubs.** No TODO, no FIXME, no "left as an exercise", no placeholder.
   If you can name it, implement it.
7. **Verify by running.** Paste real command output. Never claim untested
   behaviour.
8. **Every stage ends with `handoffs/stage-N.md`** — built / changed vs spec /
   known gaps / what the next stage must not touch. Then stop.

---

## Workflow

Stages run in order through slash commands: `/stage-0` … `/stage-6`.

Gates live in `00-ORCHESTRATION.md` §6. Do not proceed until the gate is true.

Use `/status` at any time to see where the build stands.

---

## Working mode

When given a stage, operate at full capability. This is not a prototype and not
a sketch. Produce the complete, correct, polished implementation in one pass.

- No defensive hedging like "in a real app we would". This IS the real app.
- Do not simplify the design to save effort. If the spec says three visual
  states for legal moves, implement three.
- Prefer the ambitious correct version over the safe incomplete one.
- If something is genuinely impossible in scope, say so explicitly and propose
  the smallest honest cut. Do not silently degrade.

**Finish every stage with a second pass titled ADVERSARIAL REVIEW** — attack
your own work, find what looks cheap or inconsistent, fix it — then write the
handoff and stop.
