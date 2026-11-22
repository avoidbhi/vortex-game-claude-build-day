// Vortex controller. Owns the game state and makes every decision.
// engine.js supplies the rules, render.js draws, ui.js touches the DOM.
(function (root) {
  'use strict';

  var V = root.Vortex, R = root.VortexRender;
  var HUMAN = 1, AI = 2;
  var BUDGET_MS = 1200;                 // search time cap per move
  var NAME = ['', 'Ember', 'Frost'];

  // Durations from DESIGN-TOKENS §4, in ms.
  var T = { step: 180, shoveDelay: 40, shove: 200, capture: 320, reply: 420, replyReduced: 60 };

  var motion = root.matchMedia('(prefers-reduced-motion: reduce)');
  var reduced = motion.matches;
  motion.addEventListener('change', function (ev) { reduced = ev.matches; });

  // Game state (STATE-SCHEMA §5).
  var G = {
    state: V.initial(), turn: HUMAN, over: 0, history: [], quiet: 0,
    selection: -1, legal: [], lastMove: null, hint: null,
    depth: 4, thinking: false, lastAI: null, view: 'game', pvStep: 0
  };

  // View state: nothing here affects the rules.
  var X = {
    hover: -1, cursor: -1, anim: null, selectAt: 0, lastMoveAt: 0,
    epoch: 0, evalScore: 0, engine: null, note: '', hintText: '',
    presenting: false, walkthrough: true, preview: null
  };

  var ui = root.VortexUI.init({
    boardPress: function (x, y) { X.cursor = -1; pressNode(R.hitTest(view.W, view.H, x, y)); },
    boardHover: function (x, y) { X.hover = R.hitTest(view.W, view.H, x, y); },
    boardLeave: function () { X.hover = -1; },
    boardFocus: function (byKeyboard) { if (byKeyboard && X.cursor < 0) { X.cursor = G.selection >= 0 ? G.selection : firstStone(HUMAN); } },
    boardBlur: function () { X.cursor = -1; },
    boardKey: boardKey,
    action: action,
    depth: function (d) { G.depth = d; sync(); },
    shortcut: shortcut
  });

  var view = { ctx: null, W: 0, H: 0, dpr: 0 };
  var cards = ui.cards.map(function (canvas) { return { canvas: canvas, ctx: null, W: 0, H: 0, dpr: 0 }; });

  // ───────────────────────────── game flow ─────────────────────────────────

  function newGame() {
    X.epoch++;
    G.state = V.initial(); G.turn = HUMAN; G.over = 0; G.history = []; G.quiet = 0;
    G.selection = -1; G.legal = []; G.lastMove = null; G.hint = null;
    G.thinking = false; G.lastAI = null; G.view = 'game'; G.pvStep = 0;
    X.anim = null; X.evalScore = 0; X.engine = null; X.note = ''; X.hintText = ''; X.preview = null;
    sync();
  }

  function select(node) {
    G.selection = node;
    G.legal = node < 0 ? [] : V.moves(G.state, G.turn).filter(function (m) { return m.from === node; });
    X.selectAt = root.performance.now();
  }

  function pressNode(node) {
    if (G.thinking || G.over || G.view !== 'game' || X.walkthrough) return;
    X.note = '';
    if (node < 0) { select(-1); sync(); return; }
    if (G.selection >= 0) {
      for (var i = 0; i < G.legal.length; i++) {
        if (G.legal[i].to === node) { play(G.legal[i], null); return; }
      }
    }
    if (G.state[node] === HUMAN) {
      select(node);
    } else if (G.selection >= 0) {
      X.note = 'Not adjacent. A stone steps one node along its ring or its spoke.';
      select(-1);
    }
    sync();
  }

  function play(move, analysis) {
    var player = G.turn;
    var after = V.apply(G.state, player, move);
    G.history.push({ pre: G.state, move: move, player: player, quiet: G.quiet, analysis: analysis });
    G.quiet = V.nextQuiet(G.quiet, move);
    G.state = after;
    G.turn = 3 - player;
    G.selection = -1; G.legal = []; G.hint = null;
    G.lastMove = move;
    X.hintText = ''; X.note = '';
    var t = root.performance.now();
    X.anim = reduced ? null : { move: move, player: player, start: t };
    X.lastMoveAt = t + (reduced ? 0 : animLength(move));
    G.over = V.outcome(G.state, G.turn, G.quiet);     // checked at the start of the next turn
    if (!G.over && G.turn === AI) startThinking();
    sync();
  }

  function startThinking() {
    var epoch = X.epoch;
    G.thinking = true;
    root.setTimeout(function () {
      if (epoch !== X.epoch || !G.thinking) return;      // restarted meanwhile
      var a = V.analyse(G.state, AI, G.depth, BUDGET_MS);
      a.pre = G.state;
      a.player = AI;
      G.lastAI = a;
      G.thinking = false;
      X.engine = { depth: a.depth, ms: a.ms, nodes: a.nodes };
      X.evalScore = -a.scored[0].score;
      play(a.scored[0].move, a);
    }, reduced ? T.replyReduced : T.reply);
  }

  function undo() {
    if (G.thinking || !G.history.length || G.view !== 'game') return;
    var pops = G.history.length % 2 === 0 ? 2 : 1, entry = null;
    while (pops-- > 0) entry = G.history.pop();
    G.state = entry.pre; G.quiet = entry.quiet;
    G.turn = HUMAN; G.over = 0;
    G.selection = -1; G.legal = []; G.hint = null;
    X.anim = null; X.note = ''; X.hintText = '';
    var last = G.history.length ? G.history[G.history.length - 1] : null;
    G.lastMove = last ? last.move : null;
    G.lastAI = last ? last.analysis : null;
    X.lastMoveAt = root.performance.now();
    X.evalScore = G.lastAI ? -G.lastAI.scored[0].score : 0;
    X.engine = G.lastAI ? { depth: G.lastAI.depth, ms: G.lastAI.ms, nodes: G.lastAI.nodes } : null;
    sync();
  }

  function hint() {
    if (G.thinking || G.over || G.view !== 'game' || G.turn !== HUMAN) return;
    var a = V.analyse(G.state, HUMAN, Math.max(G.depth, 4), BUDGET_MS);
    G.hint = a.scored[0].move;
    X.hintText = a.sentence;
    X.note = '';
    X.engine = { depth: a.depth, ms: a.ms, nodes: a.nodes };
    select(G.hint.from);
    sync();
  }

  function openWhy() {
    if (!G.lastAI || G.thinking) return;
    if (X.presenting) { X.presenting = false; ui.setPresenting(false); }
    G.view = 'why'; G.pvStep = 0;
    G.selection = -1; G.legal = [];
    X.preview = previewStates(G.lastAI);
    sync();
  }

  function closeWhy() {
    G.view = 'game'; G.pvStep = 0; X.preview = null;
    sync();
  }

  function stepLine(delta) {
    if (G.view !== 'why') return;
    var max = G.lastAI.pv.length - 1;
    G.pvStep = Math.max(0, Math.min(max, G.pvStep + delta));
    sync();
  }

  // The position before each move of the expected line. Throwaway arrays:
  // the real game state is never touched.
  function previewStates(analysis) {
    var states = [analysis.pre], s = analysis.pre, p = analysis.player;
    for (var i = 0; i < analysis.pv.length - 1; i++) {
      s = V.apply(s, p, analysis.pv[i]);
      p = 3 - p;
      states.push(s);
    }
    return states;
  }

  // ───────────────────────────── input ─────────────────────────────────────

  function action(name) {
    if (name === 'start') { X.walkthrough = false; ui.setWalkthrough(false); sync(); return; }
    if (name === 'help') { X.walkthrough = true; ui.setWalkthrough(true); return; }
    if (X.walkthrough) return;
    if (name === 'hint') hint();
    else if (name === 'why') openWhy();
    else if (name === 'undo') undo();
    else if (name === 'restart') newGame();
    else if (name === 'back') closeWhy();
    else if (name === 'prev') stepLine(-1);
    else if (name === 'next') stepLine(1);
  }

  function shortcut(key) {
    if (key === 'Escape') {
      if (X.walkthrough) action('start');
      else if (G.view === 'why') closeWhy();
      else if (G.selection >= 0) { select(-1); sync(); }
      else if (X.presenting) togglePresenting();
      return;
    }
    if (X.walkthrough) return;
    if (key === 'p') { togglePresenting(); return; }
    if (key === 'w') { if (G.view === 'why') closeWhy(); else openWhy(); return; }
    if (G.view !== 'game') return;
    if (key === 'u') undo();
    else if (key === 'r') newGame();
    else if (key === 'h') hint();
  }

  function togglePresenting() {
    X.presenting = !X.presenting;
    if (X.presenting && G.view === 'why') closeWhy();
    ui.setPresenting(X.presenting);
  }

  // Arrow keys walk the board: left / right around the ring, up outward, down inward.
  function boardKey(key) {
    if (X.walkthrough || G.view !== 'game') return;
    if (X.cursor < 0) {
      X.cursor = G.selection >= 0 ? G.selection : firstStone(HUMAN);
      X.hover = X.cursor;
      return;
    }
    if (key === 'Enter' || key === ' ') { pressNode(X.cursor); return; }
    var nb = V.NEIGH[X.cursor];
    var next = key === 'ArrowLeft' ? nb[0] : key === 'ArrowRight' ? nb[1] : key === 'ArrowDown' ? nb[2] : nb[3];
    if (next >= 0) X.cursor = next;
    X.hover = X.cursor;
  }

  function firstStone(player) {
    for (var i = 0; i < V.N; i++) if (G.state[i] === player) return i;
    return 0;
  }

  // ───────────────────────────── presentation ──────────────────────────────

  function claimant(state) {
    return V.inner(state, HUMAN) >= V.CORE ? HUMAN : V.inner(state, AI) >= V.CORE ? AI : 0;
  }

  function formatScore(score) {
    var plies = V.pliesToEnd(score);
    if (plies) return (score > 0 ? 'wins in ' : 'loses in ') + plies;
    return (score < 0 ? '−' : '+') + (Math.abs(score) / 100).toFixed(1);
  }

  function statusModel() {
    var claim = claimant(G.state);
    if (G.over === HUMAN) {
      return { chip: HUMAN, tone: 'good', main: 'You win',
               sub: V.count(G.state, AI) ? 'You held three stones on the inner ring through Frost’s reply.' : 'Frost has no stones left.' };
    }
    if (G.over === AI) {
      return { chip: AI, tone: 'danger', main: 'Frost wins',
               sub: (V.count(G.state, HUMAN) ? 'Frost held three stones on the inner ring through your turn.' : 'You have no stones left.') + ' Undo to try that turn again.' };
    }
    if (G.over === 3) {
      return { chip: 0, tone: '', main: 'Draw', sub: V.DRAW_PLIES + ' plies passed without a capture.' };
    }
    if (G.thinking) {
      return { chip: AI, tone: claim === HUMAN ? 'good' : '', main: 'Frost is thinking…',
               sub: claim === HUMAN ? 'You hold the core. If Frost cannot shove a stone off it, you win.' : '' };
    }
    if (claim === AI) {
      return { chip: HUMAN, tone: 'danger', main: 'Your move — Frost holds the core',
               sub: 'Shove a Frost stone off the inner ring now, or Frost wins.' };
    }
    var sub;
    if (X.note) sub = X.note;
    else if (X.hintText) sub = 'Hint: ' + X.hintText;
    else if (G.selection >= 0) sub = 'Choose where it steps. A dashed ring is a shove.';
    else if (G.lastAI) sub = G.lastAI.sentence;
    else sub = 'Pick one of your amber stones.';
    return { chip: HUMAN, tone: '', main: 'Your move', sub: sub };
  }

  function evalModel() {
    var s = X.evalScore, plies = V.pliesToEnd(s);
    var pct = 50 + Math.max(-4, Math.min(4, s / 100)) * 10;
    if (Math.abs(s) < 20) return { pct: pct, lead: 0, label: 'even' };
    var who = s > 0 ? HUMAN : AI;
    return { pct: pct, lead: who,
             label: plies ? NAME[who] + ' wins in ' + plies : '+' + (Math.abs(s) / 100).toFixed(1) + ' ' + NAME[who] };
  }

  function engineModel() {
    if (G.thinking) return [{ text: 'searching to depth ' + G.depth + '…' }];
    if (!X.engine) return [{ text: 'search idle' }, { text: 'depth ' + G.depth + ' selected' }];
    var ms = X.engine.ms < 1 ? '<1 ms' : Math.round(X.engine.ms) + ' ms';
    return [{ text: 'depth ' + X.engine.depth, strong: true }, { text: ms, strong: true },
            { text: X.engine.nodes.toLocaleString('en-US') + ' nodes', strong: true }];
  }

  function historyModel() {
    var rows = [];
    for (var i = G.history.length - 1; i >= 0; i--) {
      rows.push({ n: i + 1, player: G.history[i].player, text: V.moveToText(G.history[i].move) });
    }
    return rows;
  }

  function whyModel() {
    var a = G.lastAI, rows = [], line = [], p = a.player;
    for (var i = 0; i < a.scored.length && i < 4; i++) {
      rows.push({ rank: i + 1, text: V.moveToText(a.scored[i].move), score: formatScore(a.scored[i].score), played: i === 0 });
    }
    for (var k = 0; k < a.pv.length; k++) {
      line.push({ player: p, text: V.moveToText(a.pv[k]), now: k === G.pvStep });
      p = 3 - p;
    }
    return {
      title: 'Frost played ' + V.moveToText(a.scored[0].move),
      score: formatScore(a.scored[0].score),
      sentence: a.sentence,                              // engine.explain, verbatim
      considered: 'Considered ' + a.scored.length + ' moves · depth ' + a.depth,
      rows: rows, line: line,
      stepLabel: 'step ' + (G.pvStep + 1) + ' of ' + a.pv.length,
      canPrev: G.pvStep > 0, canNext: G.pvStep < a.pv.length - 1
    };
  }

  function boardLabel(status) {
    var where = [[], [], []];
    for (var i = 0; i < V.N; i++) if (G.state[i]) where[G.state[i]].push(V.name(i));
    return 'Vortex board. Ember on ' + (where[1].join(', ') || 'no nodes') + '. Frost on ' +
           (where[2].join(', ') || 'no nodes') + '. ' + status.main + '.';
  }

  // Pushes the whole model to the DOM. Called after every state change.
  function sync() {
    var status = statusModel();
    ui.setStatus(status);
    ui.setEval(evalModel());
    ui.setScore({ core: [V.inner(G.state, HUMAN), V.inner(G.state, AI)], need: V.CORE,
                  stones: [V.count(G.state, HUMAN), V.count(G.state, AI)] });
    ui.setButtons({
      hint: !G.thinking && !G.over && G.turn === HUMAN,
      undo: !G.thinking && G.history.length > 0,
      why: !G.thinking && !!G.lastAI,
      whyTitle: G.thinking ? 'Frost is thinking' : 'Frost hasn’t moved yet'
    });
    ui.setDepth(G.depth);
    ui.setHistory(historyModel());
    ui.setEngine(engineModel());
    ui.setView(G.view);
    if (G.view === 'why') ui.setWhy(whyModel());
    ui.setBoardLabel(boardLabel(status));
  }

  // ───────────────────────────── frame loop ────────────────────────────────

  function easeOut(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return 1 - Math.pow(1 - t, 3); }

  function animLength(move) {
    if (move.captured) return T.shoveDelay + T.capture;
    if (move.pushTo >= 0) return T.shoveDelay + T.shove;
    return T.step;
  }

  // Stones in flight for the move being animated. The shoved stone leaves
  // 40ms after the shover sets off, so the push reads as cause and effect.
  function flight(now, opts) {
    var a = X.anim;
    if (!a) return;
    var t = now - a.start, m = a.move, victim = 3 - a.player;
    if (t >= animLength(m)) { X.anim = null; return; }
    opts.hidden = [m.to];
    opts.floaters = [];
    if (m.pushTo >= 0) {
      opts.hidden.push(m.pushTo);
      opts.floaters.push({ player: victim, from: m.to, to: m.pushTo, t: easeOut((t - T.shoveDelay) / T.shove), fade: 0 });
    } else if (m.captured) {
      var c = easeOut((t - T.shoveDelay) / T.capture);
      opts.floaters.push({ player: victim, from: m.to, to: -1, t: c, fade: c });
    }
    opts.floaters.push({ player: a.player, from: m.from, to: m.to, t: easeOut(t / T.step), fade: 0 });
  }

  function gameOptions(now) {
    var live = !G.over && !G.thinking && G.turn === HUMAN;
    var opts = {
      time: now, reduced: reduced, vortex: true, player: HUMAN,
      selection: G.selection, legal: G.legal, hover: X.hover, cursor: X.cursor,
      lastMove: G.lastMove, lastMoveAge: Math.max(0, now - X.lastMoveAt), selectAge: now - X.selectAt,
      hint: G.hint, ghosts: [], pvArrow: null, preview: false,
      danger: live ? V.threatened(G.state, HUMAN) : [],
      claim: G.over ? 0 : claimant(G.state),
      won: G.over === HUMAN || G.over === AI ? (V.inner(G.state, G.over) >= V.CORE ? G.over : 0) : 0,
      hidden: [], floaters: []
    };
    flight(now, opts);
    return opts;
  }

  function whyOptions(now) {
    var a = G.lastAI, ghosts = [];
    if (G.pvStep === 0) {
      for (var i = 0; i < a.scored.length && i < 3; i++) {
        ghosts.push({ move: a.scored[i].move, label: formatScore(a.scored[i].score),
                      color: R.COLORS.player[AI].base, strong: i === 0 });
      }
    }
    return {
      time: now, reduced: reduced, vortex: true, player: AI,
      selection: -1, legal: [], hover: -1, cursor: -1, lastMove: null, hint: null,
      ghosts: ghosts, pvArrow: G.pvStep > 0 ? a.pv[G.pvStep] : null, preview: G.pvStep > 0,
      danger: [], claim: claimant(X.preview[G.pvStep]), won: 0, hidden: [], floaters: []
    };
  }

  // Re-fits a canvas when its CSS size or the device pixel ratio changed.
  function ensureFit(v, canvas) {
    var dpr = Math.min(root.devicePixelRatio || 1, 2);
    if (v.ctx && v.W === canvas.clientWidth && v.H === canvas.clientHeight && v.dpr === dpr) return;
    var f = R.fit(canvas);
    v.ctx = f.ctx; v.W = f.W; v.H = f.H; v.dpr = dpr;
    R.clearCache();
  }

  // The four walkthrough diagrams: real positions, drawn by the real renderer.
  var CARD = (function () {
    function at(ember, frost) {
      var s = new Int8Array(V.N), i;
      for (i = 0; i < ember.length; i++) s[ember[i]] = HUMAN;
      for (i = 0; i < frost.length; i++) s[frost[i]] = AI;
      return s;
    }
    function from(state, node) {
      return V.moves(state, HUMAN).filter(function (m) { return m.from === node; });
    }
    var start = V.initial(), hold = at([0, 1, 2, 11], [13, 14, 15, 20]);
    return [
      { state: start, selection: -1, legal: [], hover: -1, claim: 0 },
      { state: start, selection: 9, legal: from(start, 9), hover: -1, claim: 0 },
      { state: start, selection: 8, legal: from(start, 8), hover: 15, claim: 0 },
      { state: hold, selection: -1, legal: [], hover: -1, claim: HUMAN }
    ];
  })();

  function drawCards(now) {
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i], model = CARD[i];
      ensureFit(c, c.canvas);
      if (!c.W) continue;
      R.render(c.ctx, c.W, c.H, model.state, {
        time: now, reduced: reduced, vortex: false, player: HUMAN,
        selection: model.selection, legal: model.legal, hover: model.hover, cursor: -1,
        lastMove: null, hint: null, ghosts: [], pvArrow: null, preview: false,
        danger: [], claim: model.claim, won: 0, hidden: [], floaters: []
      });
    }
  }

  function pointerWanted() {
    if (G.view !== 'game' || G.thinking || G.over || X.hover < 0) return false;
    if (G.state[X.hover] === HUMAN) return true;
    for (var i = 0; i < G.legal.length; i++) if (G.legal[i].to === X.hover) return true;
    return false;
  }

  function frame(now) {
    ensureFit(view, ui.board);
    if (view.W) {
      if (G.view === 'why') R.render(view.ctx, view.W, view.H, X.preview[G.pvStep], whyOptions(now));
      else R.render(view.ctx, view.W, view.H, G.state, gameOptions(now));
    }
    if (X.walkthrough) drawCards(now);
    ui.setBoardCursor(pointerWanted());
    root.requestAnimationFrame(frame);
  }

  ui.setWalkthrough(true);
  sync();
  root.requestAnimationFrame(frame);
})(typeof self !== 'undefined' ? self : this);
