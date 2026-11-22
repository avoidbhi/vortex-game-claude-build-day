// Vortex UI layer. Touches the DOM and reports input. Decides nothing: every
// handler forwards to the controller, every setter writes what it is given.
(function (root) {
  'use strict';

  var doc = root.document;
  function $(id) { return doc.getElementById(id); }

  var CHIP = ['chip chip--none', 'chip chip--ember', 'chip chip--frost'];

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function make(tag, className, text) {
    var e = doc.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function init(on) {
    var el = {
      body: doc.body, board: $('board'), panel: $('panel'),
      statusBlock: doc.querySelector('.status-block'),
      statusChip: $('statusChip'), statusMain: $('statusMain'), statusSub: $('statusSub'),
      hudChip: $('hudChip'), hudStatus: $('hudStatus'), hudEvalFill: $('hudEvalFill'), hudEvalLabel: $('hudEvalLabel'),
      evalFill: $('evalFill'), evalLabel: $('evalLabel'),
      coreEmber: $('coreEmber'), coreFrost: $('coreFrost'), stonesEmber: $('stonesEmber'), stonesFrost: $('stonesFrost'),
      btnHint: $('btnHint'), btnWhy: $('btnWhy'), btnUndo: $('btnUndo'), btnRestart: $('btnRestart'),
      btnHelp: $('btnHelp'), btnStart: $('btnStart'), btnBack: $('btnBack'), btnPrev: $('btnPrev'), btnNext: $('btnNext'),
      history: $('history'), engine: $('engineLine'),
      viewGame: $('viewGame'), viewWhy: $('viewWhy'),
      whyMove: $('whyMove'), whyScore: $('whyScore'), whySentence: $('whySentence'),
      whyConsidered: $('whyConsidered'), whyAlts: $('whyAlts'), whyLine: $('whyLine'), whyStep: $('whyStep'),
      walkthrough: $('walkthrough'),
      cards: Array.prototype.slice.call(doc.querySelectorAll('.card-canvas')),
      depth: Array.prototype.slice.call(doc.querySelectorAll('input[name="depth"]'))
    };
    var evalTracks = Array.prototype.slice.call(doc.querySelectorAll('.eval-track'));

    // ── input ────────────────────────────────────────────────────────────

    function local(ev) {
      var r = el.board.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    }
    el.board.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0) return;
      var p = local(ev);
      on.boardPress(p.x, p.y);
    });
    el.board.addEventListener('pointermove', function (ev) {
      var p = local(ev);
      on.boardHover(p.x, p.y);
    });
    el.board.addEventListener('pointerleave', function () { on.boardLeave(); });
    el.board.addEventListener('focus', function () { on.boardFocus(el.board.matches(':focus-visible')); });
    el.board.addEventListener('blur', function () { on.boardBlur(); });
    el.board.addEventListener('keydown', function (ev) {
      var k = ev.key;
      if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown' || k === 'Enter' || k === ' ') {
        ev.preventDefault();
        on.boardKey(k);
      }
    });

    function action(button, name) {
      button.addEventListener('click', function () { on.action(name); });
    }
    action(el.btnHint, 'hint'); action(el.btnWhy, 'why'); action(el.btnUndo, 'undo');
    action(el.btnRestart, 'restart'); action(el.btnHelp, 'help'); action(el.btnStart, 'start');
    action(el.btnBack, 'back'); action(el.btnPrev, 'prev'); action(el.btnNext, 'next');

    el.depth.forEach(function (input) {
      input.addEventListener('change', function () { if (input.checked) on.depth(Number(input.value)); });
    });

    doc.addEventListener('keydown', function (ev) {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      var k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
      if (k === 'u' || k === 'r' || k === 'h' || k === 'w' || k === 'p' || k === 'Escape') {
        if (k !== 'Escape') ev.preventDefault();
        on.shortcut(k);
      }
    });

    // ── output ───────────────────────────────────────────────────────────

    function setStatus(s) {
      el.statusChip.className = CHIP[s.chip];
      el.hudChip.className = CHIP[s.chip];
      el.statusMain.textContent = s.main;
      el.hudStatus.textContent = s.main;
      el.statusSub.textContent = s.sub;
      el.statusBlock.classList.toggle('is-danger', s.tone === 'danger');
      el.statusBlock.classList.toggle('is-good', s.tone === 'good');
    }

    function setEval(e) {
      el.evalFill.style.width = e.pct + '%';
      el.hudEvalFill.style.width = e.pct + '%';
      el.evalLabel.textContent = e.label;
      el.hudEvalLabel.textContent = e.label;
      evalTracks.forEach(function (t) {
        t.classList.toggle('is-even', e.lead === 0);
        t.classList.toggle('lead-frost', e.lead === 2);
      });
    }

    function pips(host, n, total) {
      clear(host);
      for (var i = 0; i < total; i++) host.appendChild(make('span', i < n ? 'pip on' : 'pip'));
      host.setAttribute('aria-label', n + ' of ' + total);
    }

    function setScore(s) {
      pips(el.coreEmber, Math.min(s.core[0], s.need), s.need);
      pips(el.coreFrost, Math.min(s.core[1], s.need), s.need);
      el.stonesEmber.textContent = s.stones[0];
      el.stonesFrost.textContent = s.stones[1];
    }

    function setButtons(b) {
      el.btnHint.disabled = !b.hint;
      el.btnUndo.disabled = !b.undo;
      el.btnWhy.disabled = !b.why;
      el.btnWhy.title = b.why ? '' : b.whyTitle;
    }

    function setDepth(depth) {
      el.depth.forEach(function (input) { input.checked = Number(input.value) === depth; });
    }

    function setHistory(rows) {
      clear(el.history);
      if (!rows.length) {
        el.history.appendChild(make('li', 'empty', 'No moves yet.'));
        return;
      }
      rows.forEach(function (r) {
        var li = make('li');
        li.appendChild(make('span', 'n', r.n + '.'));
        li.appendChild(make('span', CHIP[r.player]));
        li.appendChild(make('span', 'mv', r.text));
        el.history.appendChild(li);
      });
    }

    function setEngine(parts) {
      clear(el.engine);
      parts.forEach(function (p, i) {
        if (i) el.engine.appendChild(doc.createTextNode(' · '));
        el.engine.appendChild(p.strong ? make('b', '', p.text) : doc.createTextNode(p.text));
      });
    }

    function setView(name) {
      el.viewGame.hidden = name !== 'game';
      el.viewWhy.hidden = name !== 'why';
    }

    function setWhy(w) {
      el.whyMove.textContent = w.title;
      el.whyScore.textContent = w.score;
      el.whySentence.textContent = w.sentence;
      el.whyConsidered.textContent = w.considered;
      clear(el.whyAlts);
      w.rows.forEach(function (r) {
        var li = make('li', r.played ? 'played' : '');
        li.appendChild(make('span', 'rank', r.rank + '.'));
        li.appendChild(make('span', '', r.text));
        if (r.played) li.appendChild(make('span', 'tag', 'played'));
        li.appendChild(make('span', 'sc', r.score));
        el.whyAlts.appendChild(li);
      });
      clear(el.whyLine);
      w.line.forEach(function (s) {
        var li = make('li', s.now ? 'now' : '');
        li.appendChild(make('span', CHIP[s.player]));
        li.appendChild(doc.createTextNode(s.text));
        el.whyLine.appendChild(li);
      });
      el.whyStep.textContent = w.stepLabel;
      el.btnPrev.disabled = !w.canPrev;
      el.btnNext.disabled = !w.canNext;
    }

    function setPresenting(flag) {
      el.body.classList.toggle('presenting', flag);
      $('hud').setAttribute('aria-hidden', flag ? 'false' : 'true');
    }

    function setWalkthrough(flag) {
      var was = !el.walkthrough.hidden;
      el.walkthrough.hidden = !flag;
      if (flag && !was) el.btnStart.focus();
      if (!flag && was) el.board.focus({ preventScroll: true });
    }

    function setBoardLabel(text) { el.board.setAttribute('aria-label', text); }
    function setBoardCursor(pointer) { el.board.style.cursor = pointer ? 'pointer' : 'default'; }

    return {
      board: el.board, cards: el.cards,
      setStatus: setStatus, setEval: setEval, setScore: setScore, setButtons: setButtons,
      setDepth: setDepth, setHistory: setHistory, setEngine: setEngine, setView: setView,
      setWhy: setWhy, setPresenting: setPresenting, setWalkthrough: setWalkthrough,
      setBoardLabel: setBoardLabel, setBoardCursor: setBoardCursor
    };
  }

  root.VortexUI = { init: init };
})(typeof self !== 'undefined' ? self : this);
