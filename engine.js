// Vortex engine — rules, search and explanation.
// Pure: no document, no window, no canvas. Loads in the browser as the global
// `Vortex` and in Node via require().
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Vortex = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ───────────────────────────── board ─────────────────────────────────────

  var N = 24, SPOKES = 8, RINGS = 3;
  var CORE = 3;            // inner-ring stones needed at the start of a turn
  var DRAW_PLIES = 200;    // plies with no capture
  var WIN = 10000, WIN_THRESHOLD = 9000;

  function ringOf(node) { return node >> 3; }
  function spokeOf(node) { return node & 7; }

  // NEIGH[node] = [ringMinus1, ringPlus1, inward, outward]; -1 where absent.
  var NEIGH = [];
  for (var n = 0; n < N; n++) {
    var r = ringOf(n), s = spokeOf(n);
    NEIGH.push([
      r * 8 + ((s + 7) & 7),
      r * 8 + ((s + 1) & 7),
      r > 0 ? (r - 1) * 8 + s : -1,
      r < RINGS - 1 ? (r + 1) * 8 + s : -1
    ]);
  }

  var RING_LETTER = ['I', 'M', 'O'];
  var RING_WORD = ['inner', 'middle', 'outer'];
  var PLAYER_NAME = ['', 'Ember', 'Frost'];

  // ───────────────────────────── rules ─────────────────────────────────────

  function initial() {
    var st = new Int8Array(N);
    st[8] = st[9] = st[10] = st[11] = 1;      // Ember
    st[12] = st[13] = st[14] = st[15] = 2;    // Frost
    return st;
  }

  function count(state, player) {
    var c = 0;
    for (var i = 0; i < N; i++) if (state[i] === player) c++;
    return c;
  }

  function inner(state, player) {
    var c = 0;
    for (var i = 0; i < SPOKES; i++) if (state[i] === player) c++;
    return c;
  }

  // Every legal move for `player`, in a fixed order: ascending origin node,
  // then ring−1, ring+1, inward, outward.
  function moves(state, player) {
    var out = [];
    for (var i = 0; i < N; i++) {
      if (state[i] !== player) continue;
      var nb = NEIGH[i];
      for (var k = 0; k < 4; k++) {
        var j = nb[k];
        if (j < 0) continue;
        var t = state[j];
        if (t === player) continue;                          // own stone: illegal
        if (t === 0) {                                       // plain step
          out.push({ from: i, to: j, pushTo: -1, captured: false });
          continue;
        }
        var o = NEIGH[j][3];                                 // the enemy's outward node
        if (o < 0) {                                         // enemy on the rim
          out.push({ from: i, to: j, pushTo: -1, captured: true });
        } else if (o === i) {                                // swap: we just vacated it
          out.push({ from: i, to: j, pushTo: o, captured: false });
        } else if (state[o] !== 0) {                         // squeeze
          out.push({ from: i, to: j, pushTo: -1, captured: true });
        } else {
          out.push({ from: i, to: j, pushTo: o, captured: false });
        }
      }
    }
    return out;
  }

  // Returns a NEW Int8Array. Never mutates `state`.
  function apply(state, player, move) {
    var next = state.slice();
    next[move.from] = 0;
    if (move.pushTo >= 0) next[move.pushTo] = 3 - player;
    next[move.to] = player;
    return next;
  }

  // Turn-aware. `toMove` is the side about to move; it wins if it begins its
  // turn holding CORE stones on the inner ring. Draws are resolved by the caller.
  function winner(state, toMove) {
    return inner(state, toMove) >= CORE ? toMove : 0;
  }

  // Nodes of `victim`'s stones that the opponent can capture on its next move.
  function threatened(state, victim) {
    var out = [];
    var ms = moves(state, 3 - victim);
    for (var i = 0; i < ms.length; i++) {
      if (ms[i].captured && out.indexOf(ms[i].to) < 0) out.push(ms[i].to);
    }
    return out.sort(function (a, b) { return a - b; });
  }

  function threats(state, victim) { return threatened(state, victim).length; }

  function name(node) { return RING_LETTER[ringOf(node)] + (spokeOf(node) + 1); }

  function moveToText(move) {
    return name(move.from) + '→' + name(move.to) + (move.captured ? '×' : '');
  }

  // Game result at the start of `toMove`'s turn. 0 = play on, 1 / 2 = that
  // side has won, 3 = draw. `quiet` is the number of plies since the last
  // capture.
  function outcome(state, toMove, quiet) {
    var w = winner(state, toMove);
    if (w) return w;
    if (count(state, toMove) === 0) return 3 - toMove;       // no legal move
    if (quiet >= DRAW_PLIES) return 3;
    return 0;
  }

  // The draw counter after a move. Only a capture resets it: core claims can
  // be traded back and forth for ever, so they must not.
  function nextQuiet(quiet, move) {
    return move.captured ? 0 : quiet + 1;
  }

  // ───────────────────────────── evaluation ────────────────────────────────

  var RADIAL = [26, 10, 0];       // inner, middle, outer

  // Centistones from the side to move's perspective. Allocation-free.
  function evaluate(state, toMove) {
    var s = 0;
    for (var i = 0; i < N; i++) {
      var p = state[i];
      if (p === 0) continue;
      var sign = p === 1 ? 1 : -1;
      var r = i >> 3;
      var nb = NEIGH[i];
      s += sign * (100 + RADIAL[r]);                         // material + radial
      var inw = nb[2];
      if (inw >= 0 && state[inw] === 3 - p) {                // an enemy behind it
        var out = nb[3];
        if (r === 2) s -= sign * 46;                         // dead next turn
        else if (state[out] !== 0) s -= sign * 30;           // squeezed
        else s -= sign * 12;                                 // shoved toward danger
      }
      var empty = 0;                                         // mobility
      for (var k = 0; k < 4; k++) {
        var j = nb[k];
        if (j >= 0 && state[j] === 0) empty++;
      }
      s += sign * empty * 3;
    }
    return toMove === 1 ? s : -s;
  }

  // ───────────────────────────── search ────────────────────────────────────

  var TIMEOUT = { timeout: true };
  var EXACT = 0, LOWER = 1, UPPER = 2;
  var nodeCount = 0, deadline = Infinity, table = new Map();

  function now() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  function orderScore(m) {
    var s = 0;
    if (m.captured) s += 1000;
    if (m.pushTo >= 0) s += ringOf(m.pushTo) === 2 ? 370 : 120;
    if (ringOf(m.to) < ringOf(m.from)) s += 60;
    if (ringOf(m.to) > ringOf(m.from)) s -= 40;
    return s;
  }

  // Stable descending insertion sort, in place. `first` (from*32+to) leads.
  function order(ms, first) {
    var n = ms.length, sc = new Array(n), i;
    for (i = 0; i < n; i++) {
      sc[i] = (ms[i].from * 32 + ms[i].to === first ? 1e6 : 0) + orderScore(ms[i]);
    }
    for (i = 1; i < n; i++) {
      var m = ms[i], v = sc[i], j = i - 1;
      while (j >= 0 && sc[j] < v) { ms[j + 1] = ms[j]; sc[j + 1] = sc[j]; j--; }
      ms[j + 1] = m; sc[j + 1] = v;
    }
    return ms;
  }

  function negamax(state, toMove, depth, alpha, beta, ply) {
    if ((++nodeCount & 255) === 0 && now() > deadline) throw TIMEOUT;

    // One pass: core counts, my stone count and the position key (< 2^53).
    var mine = 0, myCore = 0, theirCore = 0, key = 0;
    for (var i = 0; i < N; i++) {
      var p = state[i];
      if (p === toMove) { mine++; if (i < SPOKES) myCore++; }
      else if (p !== 0 && i < SPOKES) theirCore++;
      key = key * 3 + p;
    }
    if (myCore >= CORE) return WIN - ply;        // winner(state, toMove): I held the core
    if (mine === 0) return -WIN + ply;           // no legal move
    // At the horizon, never stand pat while the opponent holds a claim: look at
    // the replies to see whether it can be broken. Claims can answer claims, so
    // the extension is capped at four plies past the horizon.
    if (depth <= 0 && !(theirCore >= CORE && depth > -4)) return evaluate(state, toMove);

    key = key * 2 + (toMove - 1);
    var a0 = alpha, first = -1;
    var e = table.get(key);
    if (e !== undefined) {
      first = e.best;
      if (e.depth >= depth) {
        var tv = e.value;                        // stored relative to this node
        if (tv > WIN_THRESHOLD) tv -= ply; else if (tv < -WIN_THRESHOLD) tv += ply;
        if (e.flag === EXACT) return tv;
        if (e.flag === LOWER) { if (tv > alpha) alpha = tv; }
        else if (tv < beta) beta = tv;
        if (alpha >= beta) return tv;
      }
    }

    var ms = order(moves(state, toMove), first);
    var best = -Infinity, bestKey = -1;
    for (var k = 0; k < ms.length; k++) {
      var m = ms[k];
      var v = -negamax(apply(state, toMove, m), 3 - toMove, depth - 1, -beta, -alpha, ply + 1);
      if (v > best) { best = v; bestKey = m.from * 32 + m.to; }
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }

    var sv = best;
    if (sv > WIN_THRESHOLD) sv += ply; else if (sv < -WIN_THRESHOLD) sv -= ply;
    table.set(key, {
      depth: depth, value: sv, best: bestKey,
      flag: best <= a0 ? UPPER : best >= beta ? LOWER : EXACT
    });
    return best;
  }

  // Scores every root move with a full window, so each score is exact.
  function rootSearch(state, toMove, depth, ordered) {
    var out = [];
    for (var i = 0; i < ordered.length; i++) {
      var m = ordered[i];
      var v = -negamax(apply(state, toMove, m), 3 - toMove, depth - 1, -Infinity, Infinity, 1);
      out.push({ move: m, score: v });
    }
    // Array.prototype.sort is stable: equal scores keep their search order.
    return out.sort(function (a, b) { return b.score - a.score; });
  }

  // The line both sides are expected to play, starting with `firstMove`.
  function principalVariation(state, toMove, firstMove, depth) {
    var line = [firstMove];
    var s = apply(state, toMove, firstMove), p = 3 - toMove;
    for (var d = depth - 1; d > 0; d--) {
      if (winner(s, p) !== 0) break;
      var ms = order(moves(s, p), -1);
      if (!ms.length) break;
      var best = null, bestV = -Infinity, alpha = -Infinity;
      for (var i = 0; i < ms.length; i++) {
        var v = -negamax(apply(s, p, ms[i]), 3 - p, d - 1, -Infinity, -alpha, line.length + 1);
        if (v > bestV) { bestV = v; best = ms[i]; }
        if (v > alpha) alpha = v;
      }
      line.push(best);
      s = apply(s, p, best);
      p = 3 - p;
    }
    return line;
  }

  // Iterative deepening to `maxDepth`, bounded by `budgetMs`. Depth 1 always
  // completes, so `scored` is never empty when a legal move exists.
  function analyse(state, player, maxDepth, budgetMs) {
    var t0 = now();
    nodeCount = 0;
    table = new Map();
    var ordered = order(moves(state, player), -1);
    var scored = [], reached = 0, pv = [];
    if (!ordered.length) {
      return { scored: scored, depth: 0, nodes: 0, ms: 0, pv: pv, sentence: '' };
    }
    for (var d = 1; d <= maxDepth; d++) {
      deadline = d === 1 ? Infinity : t0 + budgetMs;
      try {
        scored = rootSearch(state, player, d, ordered);
        reached = d;
        ordered = scored.map(function (x) { return x.move; });   // best first next time
      } catch (err) {
        if (err !== TIMEOUT) throw err;
        break;
      }
    }
    var best = scored[0].move;
    deadline = now() + 250;
    try {
      pv = principalVariation(state, player, best, reached);
    } catch (err2) {
      if (err2 !== TIMEOUT) throw err2;
      pv = [best];
    }
    deadline = Infinity;
    return {
      scored: scored, depth: reached, nodes: nodeCount, ms: now() - t0, pv: pv,
      sentence: explain(state, player, best, apply(state, player, best))
    };
  }

  function bestMove(state, player, depth, budgetMs) {
    var a = analyse(state, player, depth, budgetMs);
    return a.scored.length ? a.scored[0].move : null;
  }

  function pvLine(state, player, depth, budgetMs) {
    return analyse(state, player, depth, budgetMs).pv;
  }

  // Plies until the forced result a mate score encodes, or 0 if none.
  function pliesToEnd(score) {
    return Math.abs(score) > WIN_THRESHOLD ? WIN - Math.abs(score) : 0;
  }

  // ───────────────────────────── explanation ───────────────────────────────

  var COUNT_WORD = ['none', 'one', 'two', 'three', 'four'];

  // One sentence about `move`, built only from measured differences between
  // `state` (before) and `after`: the move's own fields, ring changes, core
  // counts and capture threats on each side.
  function explain(state, player, move, after) {
    var opp = 3 - player;
    var me = PLAYER_NAME[player], them = PLAYER_NAME[opp];
    var fromR = ringOf(move.from), toR = ringOf(move.to);
    var target = them + '’s stone at ' + name(move.to);
    var what;

    if (move.captured) {
      what = toR === 2
        ? 'shoves ' + target + ' off the rim and captures it'
        : 'squeezes ' + target + ' against the stone behind it and captures it';
    } else if (move.pushTo >= 0) {
      if (toR === 0) {
        what = move.pushTo === move.from
          ? 'trades places with ' + target + ', shoving it off the inner ring'
          : 'shoves ' + target + ' off the inner ring';
      } else {
        what = 'shoves ' + target + ' out onto the rim';
      }
    } else if (toR < fromR) {
      what = toR === 0 ? 'steps onto the inner ring at ' + name(move.to)
                       : 'steps in from the rim to ' + name(move.to);
    } else if (toR > fromR) {
      what = toR === 2 ? 'steps out to the rim at ' + name(move.to)
                       : 'steps back to the middle ring at ' + name(move.to);
    } else {
      what = 'slides along the ' + (toR === 2 ? 'rim' : RING_WORD[toR] + ' ring') + ' to ' + name(move.to);
    }

    var why = [];
    var theirCoreBefore = inner(state, opp), theirCoreAfter = inner(after, opp);
    var myCoreBefore = inner(state, player), myCoreAfter = inner(after, player);

    if (theirCoreBefore >= CORE && theirCoreAfter < CORE) {
      why.push('breaking ' + them + '’s hold on the core');
    } else if (theirCoreBefore >= CORE) {
      why.push('failing to break ' + them + '’s hold on the core');
    } else if (theirCoreAfter < theirCoreBefore) {
      why.push('cutting ' + them + ' back to ' + COUNT_WORD[theirCoreAfter] + ' on the inner ring');
    }

    if (myCoreAfter >= CORE && myCoreBefore < CORE) {
      why.push('claiming the core with three stones, which wins unless ' + them + ' shoves one off');
    } else if (myCoreAfter === 2 && myCoreBefore < 2) {
      why.push('giving it two of the three core stones it needs');
    }

    var dangerBefore = threats(state, player), dangerAfter = threats(after, player);
    if (dangerAfter < dangerBefore) {
      why.push(dangerBefore - dangerAfter > 1 ? 'saving its own stones from capture'
                                              : 'saving its own stone from capture');
    } else if (dangerAfter > dangerBefore) {
      why.push('leaving one of its own stones open to capture');
    }

    if (threats(after, opp) > threats(state, opp)) {
      why.push('threatening a capture next turn');
    }

    var text = me + ' ' + what;
    for (var i = 0; i < why.length; i++) {
      text += (i === why.length - 1 && i > 0 ? ' and ' : ', ') + why[i];
    }
    return text + '.';
  }

  return {
    N: N, SPOKES: SPOKES, RINGS: RINGS, CORE: CORE, DRAW_PLIES: DRAW_PLIES, NEIGH: NEIGH,
    ringOf: ringOf, spokeOf: spokeOf,
    initial: initial, moves: moves, apply: apply, winner: winner,
    count: count, inner: inner, threatened: threatened, threats: threats,
    name: name, moveToText: moveToText,
    outcome: outcome, nextQuiet: nextQuiet,
    evaluate: evaluate, analyse: analyse, bestMove: bestMove, pvLine: pvLine,
    pliesToEnd: pliesToEnd, explain: explain
  };
});
