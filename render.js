// Vortex renderer.
//
// ART DIRECTION
//  1. The board is an orrery cut into obsidian: one object seen from above, lit by a
//     single lamp at the upper-left. Every highlight sits top-left, every shadow
//     bottom-right, on the bowl and on each stone alike.
//  2. Obsidian is the ground: near-black navy that never reaches black, so the
//     only saturated things on screen are the eight stones.
//  3. The stones are the light. Ember is a banked coal, Frost a chip of ice; each
//     carries its own soft halo, so the eye lands on them before any linework.
//  4. Depth is stated three times and no more: the bowl's rim, the raised core
//     disc, and the shadow each stone throws down-right.
//  5. The core is the goal, so it is the one place the ground lifts and the only
//     part of the board that ever takes a player's colour.
//  6. Linework is hairline and almost silent. Rings and spokes explain how stones
//     move; they must never compete with where stones are.
//  7. Hierarchy: stones, then what you may do (markers), then what threatens you
//     (reticles), then the board, then everything else.
//  8. Every state has a shape as well as a colour: solid disc against ring-and-dot,
//     dot against dashed ring against cross. It must read in greyscale.
//  9. Motion is cause and effect. The shover lands, and only then does the shoved
//     stone leave. Nothing moves that the rules did not move, except slow idle
//     rotation that says the machine is running.
// 10. Nothing is drawn that a player cannot use.
//
// render() decides nothing: it draws the state and the options it is handed.
(function (root) {
  'use strict';

  var TAU = Math.PI * 2;

  // Every colour below is a DESIGN-TOKENS value.
  var COL = {
    bg0: '#06080D', bg1: '#0B1017', surface: '#0E141C', line: '#1B2735',
    lineSoft: 'rgba(255,255,255,0.07)', spoke: 'rgba(255,255,255,0.045)',
    node: '#0A0F16', nodeStroke: 'rgba(120,150,180,0.18)',
    text: '#E9EFF6', danger: '#E8705F', good: '#7BD88F', focus: 'rgba(255,255,255,0.55)',
    rim: 'rgba(255,255,255,0.18)',
    player: [null,
      { base: '#F2A65A', light: '#FFD9A8', dark: '#A85B22', glow: 'rgba(242,166,90,0.45)', clear: 'rgba(242,166,90,0)' },
      { base: '#6FC8E8', light: '#CFF0FF', dark: '#2A6F8C', glow: 'rgba(111,200,232,0.45)', clear: 'rgba(111,200,232,0)' }
    ]
  };
  var MONO = '500 13px ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace';

  var RADII = [0.175, 0.315, 0.435];
  var NODE_R = 0.037;
  var STONE = 0.9;            // stone radius as a fraction of the node radius
  var SPRITE_SPAN = 2.0;      // sprite half-width in stone radii (room for the halo)

  // ───────────────────────────── geometry ──────────────────────────────────

  function geom(W, H) {
    var S = Math.min(W, H);
    return { S: S, cx: W / 2, cy: H / 2, nodeR: NODE_R * S,
             radii: [RADII[0] * S, RADII[1] * S, RADII[2] * S] };
  }

  function angleOf(node) { return -Math.PI / 2 + (node & 7) * (TAU / 8); }

  function place(g, node) {
    var a = angleOf(node), r = g.radii[node >> 3];
    return { x: g.cx + Math.cos(a) * r, y: g.cy + Math.sin(a) * r };
  }

  // A point `dist` further out along the node's own spoke.
  function outward(g, node, dist) {
    var a = angleOf(node), r = g.radii[node >> 3] + dist;
    return { x: g.cx + Math.cos(a) * r, y: g.cy + Math.sin(a) * r };
  }

  function pos(W, H, node) { return place(geom(W, H), node); }

  // Nearest node, capped at nodeR * 1.45. Never first-hit.
  function hitTest(W, H, x, y) {
    var g = geom(W, H), best = -1, bestD = Infinity;
    for (var i = 0; i < 24; i++) {
      var p = place(g, i);
      var d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
      if (d < bestD) { bestD = d; best = i; }
    }
    var cap = g.nodeR * 1.45;
    return bestD <= cap * cap ? best : -1;
  }

  // Sizes the backing store for the device (DPR capped at 2) and returns a
  // context that draws in CSS pixels.
  function fit(canvas) {
    var dpr = Math.min(root.devicePixelRatio || 1, 2);
    var W = canvas.clientWidth, H = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    var ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, W: W, H: H };
  }

  // ───────────────────────────── sprites ───────────────────────────────────

  var sprites = {};
  var backgrounds = {};

  function clearCache() { sprites = {}; backgrounds = {}; }

  function offscreen(size) {
    var c = root.document.createElement('canvas');
    c.width = c.height = Math.max(2, Math.round(size));
    return c;
  }

  // One stone, rendered once at 4x: halo, cast shadow, lit body, rim, and for
  // Frost the ring-and-dot glyph. No per-frame gradients, no shadowBlur.
  function stoneSprite(player, radius) {
    var key = player + ':' + Math.round(radius * 4);
    if (sprites[key]) return sprites[key];
    var scale = 4, r = radius * scale;
    var c = offscreen(r * SPRITE_SPAN * 2);
    var g = c.getContext('2d');
    var cx = c.width / 2, cy = c.height / 2;
    var pc = COL.player[player];

    var halo = g.createRadialGradient(cx, cy, r * 0.85, cx, cy, r * SPRITE_SPAN);
    halo.addColorStop(0, pc.glow);
    halo.addColorStop(1, pc.clear);
    g.fillStyle = halo;
    g.beginPath(); g.arc(cx, cy, r * SPRITE_SPAN, 0, TAU); g.fill();

    var sx = cx + r * 0.16, sy = cy + r * 0.2;               // shadow falls down-right
    var shade = g.createRadialGradient(sx, sy, r * 0.7, sx, sy, r * 1.3);
    shade.addColorStop(0, 'rgba(6,8,13,0.7)');
    shade.addColorStop(1, 'rgba(6,8,13,0)');
    g.fillStyle = shade;
    g.beginPath(); g.arc(sx, sy, r * 1.3, 0, TAU); g.fill();

    var body = g.createRadialGradient(cx - r * 0.4, cy - r * 0.4, r * 0.05, cx, cy, r);
    body.addColorStop(0, pc.light);
    body.addColorStop(0.55, pc.base);
    body.addColorStop(1, pc.dark);
    g.fillStyle = body;
    g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();

    g.strokeStyle = COL.rim;
    g.lineWidth = scale;                                      // 1px at display size
    g.beginPath(); g.arc(cx, cy, r - scale / 2, 0, TAU); g.stroke();

    if (player === 2) {                                       // second channel
      g.strokeStyle = pc.dark;
      g.lineWidth = r * 0.13;
      g.beginPath(); g.arc(cx, cy, r * 0.52, 0, TAU); g.stroke();
      g.fillStyle = pc.dark;
      g.beginPath(); g.arc(cx, cy, r * 0.17, 0, TAU); g.fill();
    }
    sprites[key] = c;
    return c;
  }

  // Soft white disc used for the last-move halo.
  function haloSprite(radius) {
    var key = 'h:' + Math.round(radius);
    if (sprites[key]) return sprites[key];
    var c = offscreen(radius * 2);
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(radius, radius, 0, radius, radius, radius);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.7)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
    sprites[key] = c;
    return c;
  }

  // The static board: ground, bowl, core disc, rings, spokes, nodes. Drawn
  // once per size into an offscreen canvas and blitted every frame.
  function background(ctx, W, H, g) {
    var t = ctx.getTransform();
    var key = W + 'x' + H + '@' + t.a;
    if (backgrounds[key]) return backgrounds[key];
    var c = root.document.createElement('canvas');
    c.width = Math.max(1, Math.round(W * t.a));
    c.height = Math.max(1, Math.round(H * t.d));
    var b = c.getContext('2d');
    b.setTransform(t.a, 0, 0, t.d, 0, 0);

    var bg = b.createRadialGradient(g.cx, g.cy, 0, g.cx, g.cy, g.S * 0.62);
    bg.addColorStop(0, COL.bg1);
    bg.addColorStop(1, COL.bg0);
    b.fillStyle = bg;
    b.fillRect(0, 0, W, H);

    var hair = Math.max(1, g.S * 0.0025);
    var bowl = g.radii[2] + g.nodeR * 1.55;

    b.lineWidth = hair;                                       // bowl: lit top-left, shaded bottom-right
    b.strokeStyle = COL.rim;
    b.beginPath(); b.arc(g.cx, g.cy, bowl, Math.PI * 0.95, Math.PI * 1.55); b.stroke();
    b.strokeStyle = COL.lineSoft;
    b.beginPath(); b.arc(g.cx, g.cy, bowl, Math.PI * 1.55, Math.PI * 1.95); b.stroke();
    b.beginPath(); b.arc(g.cx, g.cy, bowl, Math.PI * 0.55, Math.PI * 0.95); b.stroke();
    b.strokeStyle = COL.bg0;
    b.lineWidth = hair * 2;
    b.beginPath(); b.arc(g.cx, g.cy, bowl, -Math.PI * 0.05, Math.PI * 0.55); b.stroke();

    var core = coreRadius(g);                                 // the raised core
    b.fillStyle = COL.surface;
    b.beginPath(); b.arc(g.cx, g.cy, core, 0, TAU); b.fill();
    b.lineWidth = hair;
    b.strokeStyle = COL.line;
    b.beginPath(); b.arc(g.cx, g.cy, core, 0, TAU); b.stroke();
    b.strokeStyle = COL.lineSoft;
    b.beginPath(); b.arc(g.cx, g.cy, core, Math.PI * 0.95, Math.PI * 1.55); b.stroke();

    b.strokeStyle = COL.lineSoft;
    for (var r = 0; r < 3; r++) {
      b.beginPath(); b.arc(g.cx, g.cy, g.radii[r], 0, TAU); b.stroke();
    }

    b.strokeStyle = COL.spoke;                                // all eight spokes, one path
    b.beginPath();
    for (var s = 0; s < 8; s++) {
      var a = angleOf(s);
      b.moveTo(g.cx + Math.cos(a) * g.radii[0], g.cy + Math.sin(a) * g.radii[0]);
      b.lineTo(g.cx + Math.cos(a) * g.radii[2], g.cy + Math.sin(a) * g.radii[2]);
    }
    b.stroke();

    var i, p;
    b.fillStyle = COL.node;
    b.beginPath();
    for (i = 0; i < 24; i++) { p = place(g, i); b.moveTo(p.x + g.nodeR, p.y); b.arc(p.x, p.y, g.nodeR, 0, TAU); }
    b.fill();
    b.strokeStyle = COL.nodeStroke;
    b.lineWidth = Math.max(1, g.S * 0.003);
    b.beginPath();
    for (i = 0; i < 24; i++) { p = place(g, i); b.moveTo(p.x + g.nodeR, p.y); b.arc(p.x, p.y, g.nodeR, 0, TAU); }
    b.stroke();

    backgrounds[key] = c;
    return c;
  }

  function coreRadius(g) { return (g.radii[0] + g.radii[1]) / 2; }

  // ───────────────────────────── primitives ────────────────────────────────

  function easeOut(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return 1 - Math.pow(1 - t, 3); }

  function drawStone(ctx, g, player, x, y, alpha, scale) {
    var r = g.nodeR * STONE;
    var half = r * SPRITE_SPAN * scale;
    ctx.globalAlpha = alpha;
    ctx.drawImage(stoneSprite(player, r), x - half, y - half, half * 2, half * 2);
    ctx.globalAlpha = 1;
  }

  function cross(ctx, x, y, k) {
    ctx.beginPath();
    ctx.moveTo(x - k, y - k); ctx.lineTo(x + k, y + k);
    ctx.moveTo(x + k, y - k); ctx.lineTo(x - k, y + k);
    ctx.stroke();
  }

  // Arrow from a to b, trimmed at both ends so it never covers a stone.
  function arrow(ctx, a, b, trimA, trimB, width, color, alpha) {
    var dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;
    var ux = dx / len, uy = dy / len;
    var x0 = a.x + ux * trimA, y0 = a.y + uy * trimA;
    var x1 = b.x - ux * trimB, y1 = b.y - uy * trimB;
    var head = width * 2.6;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - ux * head * 0.8, y1 - uy * head * 0.8); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - ux * head - uy * head * 0.62, y1 - uy * head + ux * head * 0.62);
    ctx.lineTo(x1 - ux * head + uy * head * 0.62, y1 - uy * head - ux * head * 0.62);
    ctx.closePath(); ctx.fill();
    ctx.lineCap = 'butt';
    ctx.globalAlpha = 1;
  }

  function markerKind(state, move) {
    if (move.captured) return 'capture';
    if (move.pushTo >= 0) return 'shove';
    return 'quiet';
  }

  // ───────────────────────────── layers ────────────────────────────────────

  function drawVortex(ctx, g, time) {
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = Math.max(1, g.S * 0.0025);
    for (var k = 0; k < 3; k++) {
      var rr = g.radii[0] + (g.radii[2] - g.radii[0]) * (0.18 + k * 0.27);
      var a0 = time * 0.00012 * (k % 2 ? -1 : 1) + k * 2.1;
      ctx.beginPath(); ctx.arc(g.cx, g.cy, rr, a0, a0 + Math.PI * 0.9); ctx.stroke();
    }
  }

  // The core takes the colour of whoever holds three stones on it.
  function drawCoreState(ctx, g, opts) {
    var who = opts.won || opts.claim;
    if (!who) return;
    var pulse = opts.won || opts.reduced ? 1 : 0.62 + 0.38 * Math.sin(opts.time / 1400 * TAU);
    var core = coreRadius(g);
    ctx.globalAlpha = 0.1 * pulse;
    ctx.fillStyle = COL.player[who].base;
    ctx.beginPath(); ctx.arc(g.cx, g.cy, core, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.85 * pulse;
    ctx.strokeStyle = COL.player[who].base;
    ctx.lineWidth = Math.max(1.5, g.S * 0.004);
    if (!opts.won) ctx.setLineDash([g.nodeR * 0.5, g.nodeR * 0.34]);
    ctx.beginPath(); ctx.arc(g.cx, g.cy, core, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  function drawLastMove(ctx, g, opts) {
    var m = opts.lastMove;
    if (!m) return;
    var age = opts.lastMoveAge;
    var alpha = opts.reduced || age === undefined ? 0.12 : 0.12 + 0.2 * (1 - Math.min(1, age / 900));
    var r = g.nodeR * 2.1;
    var sprite = haloSprite(r);
    ctx.globalAlpha = alpha;
    var a = place(g, m.from), b = place(g, m.to);
    ctx.drawImage(sprite, a.x - r, a.y - r, r * 2, r * 2);
    ctx.drawImage(sprite, b.x - r, b.y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }

  // Under-stone part of the legal markers: dot, or dashed ring with its arrow.
  function drawMarkers(ctx, g, state, opts) {
    var legal = opts.legal || [];
    var color = COL.player[opts.player || 1].base;
    for (var i = 0; i < legal.length; i++) {
      var m = legal[i], kind = markerKind(state, m), p = place(g, m.to);
      var age = opts.selectAge === undefined || opts.reduced ? 1 : (opts.selectAge - i * 20) / 100;
      var grow = easeOut(age);
      if (grow <= 0) continue;
      var hot = opts.hover === m.to;
      ctx.lineWidth = Math.max(1.5, g.nodeR * 0.12);

      if (kind === 'quiet') {
        if (hot) {
          ctx.globalAlpha = 0.14;
          ctx.fillStyle = color;
          ctx.beginPath(); ctx.arc(p.x, p.y, g.nodeR, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = (hot ? 1 : 0.55) * grow;
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(p.x, p.y, g.nodeR * (hot ? 0.38 : 0.3) * grow, 0, TAU); ctx.fill();
      } else {
        var ringColor = kind === 'capture' ? COL.danger : color;
        ctx.globalAlpha = (hot ? 1 : 0.85) * grow;
        ctx.strokeStyle = ringColor;
        ctx.setLineDash([g.nodeR * 0.42, g.nodeR * 0.3]);
        ctx.beginPath(); ctx.arc(p.x, p.y, g.nodeR * (1.12 + 0.2 * (1 - grow)), 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        if (kind === 'shove') {                               // which way it will be sent
          arrow(ctx, outward(g, m.to, g.nodeR * 1.35), outward(g, m.to, g.nodeR * 2.25), 0, 0,
                Math.max(1.5, g.nodeR * 0.13), color, (hot ? 1 : 0.85) * grow);
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  // Over-stone part: the × on a stone that would be captured.
  function drawCaptureGlyphs(ctx, g, state, opts) {
    var legal = opts.legal || [];
    for (var i = 0; i < legal.length; i++) {
      var m = legal[i];
      if (!m.captured) continue;
      var p = place(g, m.to), k = g.nodeR * 0.36;
      ctx.lineCap = 'round';
      ctx.strokeStyle = COL.bg0;
      ctx.lineWidth = Math.max(4, g.nodeR * 0.34);
      cross(ctx, p.x, p.y, k);
      ctx.strokeStyle = COL.danger;
      ctx.lineWidth = Math.max(2, g.nodeR * 0.17);
      cross(ctx, p.x, p.y, k);
      ctx.lineCap = 'butt';
    }
  }

  function drawHint(ctx, g, opts) {
    var m = opts.hint;
    if (!m) return;
    var p = place(g, m.to);
    var pulse = opts.reduced ? 1 : 1 + 0.08 * Math.sin(opts.time / 1400 * TAU);
    arrow(ctx, place(g, m.from), p, g.nodeR * 1.05, g.nodeR * 1.5, Math.max(2, g.nodeR * 0.16), COL.good, 0.9);
    ctx.strokeStyle = COL.good;
    ctx.lineWidth = Math.max(2, g.nodeR * 0.14);
    ctx.beginPath(); ctx.arc(p.x, p.y, g.nodeR * 1.3 * pulse, 0, TAU); ctx.stroke();
  }

  function drawStones(ctx, g, state, opts) {
    var hidden = opts.hidden || [], legal = opts.legal || [];
    var hoverMove = null, i;
    for (i = 0; i < legal.length; i++) if (legal[i].to === opts.hover) hoverMove = legal[i];

    for (i = 0; i < 24; i++) {
      var p = state[i];
      if (!p || hidden.indexOf(i) >= 0) continue;
      var at = place(g, i);
      var doomed = hoverMove && hoverMove.captured && hoverMove.to === i;
      drawStone(ctx, g, p, at.x, at.y, doomed ? 0.4 : 1, 1);
      if (opts.hover === i && p === opts.player && !hoverMove) {   // own stone under the pointer
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = COL.text;
        ctx.beginPath(); ctx.arc(at.x, at.y, g.nodeR * STONE, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    if (hoverMove && hoverMove.pushTo >= 0) {                      // where the shoved stone will land
      var gp = place(g, hoverMove.pushTo);
      drawStone(ctx, g, state[hoverMove.to], gp.x, gp.y, 0.45, 1);
    }

    var fl = opts.floaters || [];
    for (i = 0; i < fl.length; i++) {
      var f = fl[i], a = place(g, f.from);
      var b = f.to >= 0 ? place(g, f.to) : outward(g, f.from, g.nodeR * 2.4);
      var t = f.t < 0 ? 0 : f.t > 1 ? 1 : f.t;
      var fade = f.fade || 0;
      drawStone(ctx, g, f.player, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 1 - fade, 1 + 0.25 * fade);
    }
  }

  // Reticle on a stone that can be captured next move.
  function drawDanger(ctx, g, opts) {
    var list = opts.danger || [];
    if (!list.length) return;
    var r = g.nodeR * 1.24, tick = g.nodeR * 0.3;
    ctx.strokeStyle = COL.danger;
    ctx.lineWidth = Math.max(1.5, g.nodeR * 0.09);
    ctx.globalAlpha = 0.9;
    for (var i = 0; i < list.length; i++) {
      var p = place(g, list[i]);
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p.x - r - tick, p.y); ctx.lineTo(p.x - r + tick * 0.4, p.y);
      ctx.moveTo(p.x + r + tick, p.y); ctx.lineTo(p.x + r - tick * 0.4, p.y);
      ctx.moveTo(p.x, p.y - r - tick); ctx.lineTo(p.x, p.y - r + tick * 0.4);
      ctx.moveTo(p.x, p.y + r + tick); ctx.lineTo(p.x, p.y + r - tick * 0.4);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawWinners(ctx, g, state, opts) {
    if (!opts.won) return;
    ctx.strokeStyle = COL.player[opts.won].light;
    ctx.lineWidth = Math.max(2, g.nodeR * 0.12);
    for (var i = 0; i < 8; i++) {
      if (state[i] !== opts.won) continue;
      var p = place(g, i);
      ctx.beginPath(); ctx.arc(p.x, p.y, g.nodeR * 1.3, 0, TAU); ctx.stroke();
    }
  }

  function drawSelection(ctx, g, state, opts) {
    if (opts.selection >= 0) {
      var p = place(g, opts.selection);
      var grow = opts.reduced || opts.selectAge === undefined ? 1 : easeOut(opts.selectAge / 120);
      ctx.strokeStyle = COL.player[state[opts.selection] || opts.player || 1].light;
      ctx.lineWidth = Math.max(1.5, g.nodeR * 0.11);
      ctx.setLineDash([g.nodeR * 0.5, g.nodeR * 0.36]);
      ctx.lineDashOffset = opts.reduced ? 0 : -opts.time * 0.012;
      ctx.globalAlpha = grow;
      ctx.beginPath(); ctx.arc(p.x, p.y, g.nodeR * (1.55 + 0.3 * (1 - grow)), 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
      ctx.globalAlpha = 1;
    }
    if (opts.cursor >= 0) {
      var c = place(g, opts.cursor);
      ctx.strokeStyle = COL.focus;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(c.x, c.y, g.nodeR * 1.4, 0, TAU); ctx.stroke();
    }
  }

  function drawLabel(ctx, x, y, text, color) {
    ctx.font = MONO;
    var w = ctx.measureText(text).width + 12, h = 20;
    ctx.fillStyle = COL.surface;
    ctx.strokeStyle = COL.line;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.94;
    ctx.beginPath(); ctx.rect(Math.round(x - w / 2) + 0.5, Math.round(y - h / 2) + 0.5, Math.round(w), h);
    ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 1);
  }

  function drawGhosts(ctx, g, state, opts) {
    var ghosts = opts.ghosts || [], i, gh, a, b;
    for (i = ghosts.length - 1; i >= 0; i--) {                // strongest drawn last, on top
      gh = ghosts[i];
      a = place(g, gh.move.from); b = place(g, gh.move.to);
      arrow(ctx, a, b, g.nodeR * 1.05, g.nodeR * 1.12,
            gh.strong ? Math.max(4, g.nodeR * 0.26) : Math.max(2, g.nodeR * 0.12),
            gh.color, gh.strong ? 1 : 0.6);
    }
    for (i = ghosts.length - 1; i >= 0; i--) {
      gh = ghosts[i];
      if (!gh.label) continue;
      a = place(g, gh.move.from); b = place(g, gh.move.to);
      // Labels sit beside the arrow's far end, pushed away from the board centre.
      var mx = a.x + (b.x - a.x) * 0.62, my = a.y + (b.y - a.y) * 0.62;
      var nx = -(b.y - a.y), ny = b.x - a.x, nl = Math.sqrt(nx * nx + ny * ny) || 1;
      nx /= nl; ny /= nl;
      if (nx * (mx - g.cx) + ny * (my - g.cy) < 0) { nx = -nx; ny = -ny; }
      drawLabel(ctx, mx + nx * g.nodeR * 1.5, my + ny * g.nodeR * 1.5, gh.label, gh.strong ? COL.text : gh.color);
    }
    if (opts.pvArrow) {
      var m = opts.pvArrow, who = state[m.from] || opts.player || 1;
      arrow(ctx, place(g, m.from), place(g, m.to), g.nodeR * 1.05, g.nodeR * 1.12,
            Math.max(4, g.nodeR * 0.28), COL.player[who].light, 1);
    }
  }

  // A hypothetical position is framed by a dashed bowl so it cannot be
  // mistaken for the real game.
  function drawPreviewFrame(ctx, g) {
    ctx.strokeStyle = COL.focus;
    ctx.lineWidth = Math.max(1, g.S * 0.0025);
    ctx.setLineDash([g.nodeR * 0.5, g.nodeR * 0.5]);
    ctx.beginPath(); ctx.arc(g.cx, g.cy, g.radii[2] + g.nodeR * 1.55, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
  }

  // ───────────────────────────── entry point ───────────────────────────────

  function render(ctx, W, H, state, opts) {
    var g = geom(W, H);
    ctx.globalAlpha = 1;
    ctx.drawImage(background(ctx, W, H, g), 0, 0, W, H);
    if (opts.vortex && !opts.reduced) drawVortex(ctx, g, opts.time);
    drawCoreState(ctx, g, opts);
    if (opts.preview) drawPreviewFrame(ctx, g);
    drawLastMove(ctx, g, opts);
    drawMarkers(ctx, g, state, opts);
    drawHint(ctx, g, opts);
    drawStones(ctx, g, state, opts);
    drawCaptureGlyphs(ctx, g, state, opts);
    drawDanger(ctx, g, opts);
    drawWinners(ctx, g, state, opts);
    drawSelection(ctx, g, state, opts);
    drawGhosts(ctx, g, state, opts);
  }

  root.VortexRender = {
    render: render, hitTest: hitTest, fit: fit, pos: pos, clearCache: clearCache, COLORS: COL
  };
})(typeof self !== 'undefined' ? self : this);
