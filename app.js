/* Page wiring (step 5a): load Python in the browser, draw what bridge.py
 * reports. The drawing logic itself lives in render.js and the galaxy logic
 * in the Python modules; this file only connects them to the page. */
(function () {
    'use strict';
  
    var PY_FILES = ['galaxy.py', 'mst.py', 'analysis.py', 'bridge.py'];
  
    var $ = function (id) { return document.getElementById(id); };
    var state = { session: null, showMst: true, snap: null };
  
    /* ---------- messages ---------- */
  
    function starsText(n) {
      return n + (n === 1 ? ' star' : ' stars');
    }
  
    function setMessage(text, isError) {
      var m = $('message');
      m.textContent = text;
      m.classList.toggle('error', !!isError);
    }
  
    /* ---------- drawing ---------- */
  
    function renderStats(stats) {
      var box = $('stats');
      box.replaceChildren();
      statsRows(stats).forEach(function (row) {
        var item = document.createElement('div');
        item.className = 'stat';
        var label = document.createElement('span');
        label.className = 'label';
        label.textContent = row[0];
        var value = document.createElement('span');
        value.className = 'value';
        value.textContent = row[1];
        item.append(label, value);
        box.append(item);
      });
    }
  
    function renderStarList(stars) {
      var list = $('star-list');
      list.replaceChildren();
      $('star-count').textContent = '(' + stars.length + ')';
      if (stars.length === 0) {
        var none = document.createElement('li');
        var note = document.createElement('span');
        note.className = 'empty';
        note.textContent = 'No stars yet.';
        none.append(note);
        list.append(none);
        return;
      }
      stars.forEach(function (s) {
        var li = document.createElement('li');
        var name = document.createElement('span');
        name.className = 'name';
        name.textContent = s.name;                 // textContent: never parsed as HTML
        var coords = document.createElement('span');
        coords.className = 'coords';
        coords.textContent = formatCoords(s);
        li.append(name, coords);
        list.append(li);
      });
    }
  
    function renderPlot(snap) {
      var config = { responsive: true, displaylogo: false, displayModeBar: false };
      return Plotly.react('plot', buildTraces(snap, { showMst: state.showMst }),
                          buildLayout(snap), config);
    }
  
    /* Ask Python for the current galaxy and redraw everything. */
    function refresh() {
      var t0 = performance.now();
      var snap = JSON.parse(state.session.snapshot());
      var ms = performance.now() - t0;
      state.snap = snap;
  
      $('galaxy-name').textContent = snap.name;
      renderStats(snap.stats);
      renderStarList(snap.stars);
      renderPlot(snap);
      $('algo').textContent = 'Tree + statistics: ' + ms.toFixed(1) + ' ms for ' +
        starsText(snap.stars.length);
    }
  
    /* ---------- toolbar actions ---------- */
  
    function setToggle(button, on) {
      button.setAttribute('aria-pressed', String(on));
    }
  
    function onToggleMst() {
      state.showMst = !state.showMst;
      setToggle($('btn-mst'), state.showMst);
      if (state.snap) renderPlot(state.snap);
    }
  
    function onResetView() {
      Plotly.relayout('plot', { 'scene.camera': DEFAULT_CAMERA });
    }
  
    function onToggleSidebar() {
      var app = $('app');
      var hidden = app.classList.toggle('sidebar-hidden');
      setToggle($('btn-sidebar'), !hidden);
      // the plot resizes itself through the ResizeObserver below
    }
  
    function onLoadDemo() {
      var raw = $('demo-count').value.trim();
      var count = Number(raw);
      if (raw === '' || !Number.isInteger(count) || count < 0 || count > 1000) {
        setMessage('Demo star count must be a whole number from 0 to 1000.', true);
        return;
      }
      var seed = Math.floor(Math.random() * 1e9);   // shown below so a galaxy can be recreated
      var result = JSON.parse(state.session.load_demo(count, seed));
      if (!result.ok) { setMessage(result.error, true); return; }
      refresh();
      setMessage('Loaded a demo galaxy with ' + starsText(count) + ' (seed ' + seed + ').', false);
    }
  
    function onClear() {
      JSON.parse(state.session.clear());
      refresh();
      setMessage('Galaxy cleared.', false);
    }
  
    /* ---------- sidebar resizing ---------- */
  
    function setSidebarWidth(px) {
      var width = Math.max(180, Math.min(600, px));
      document.documentElement.style.setProperty('--sidebar-w', width + 'px');
    }
  
    function initResizer() {
      var resizer = $('resizer');
      var dragging = false;
  
      resizer.addEventListener('pointerdown', function (e) {
        dragging = true;
        resizer.setPointerCapture(e.pointerId);
        e.preventDefault();
      });
      resizer.addEventListener('pointermove', function (e) {
        if (dragging) setSidebarWidth(e.clientX);   // sidebar starts at x = 0
      });
      resizer.addEventListener('pointerup', function () { dragging = false; });
      resizer.addEventListener('pointercancel', function () { dragging = false; });
  
      resizer.addEventListener('keydown', function (e) {
        var current = $('sidebar').getBoundingClientRect().width;
        if (e.key === 'ArrowLeft') { setSidebarWidth(current - 20); e.preventDefault(); }
        if (e.key === 'ArrowRight') { setSidebarWidth(current + 20); e.preventDefault(); }
      });
    }
  
    /* ---------- start-up ---------- */
  
    async function startPython() {
      if (location.protocol === 'file:') {
        throw new Error('Open this page through a web server (for example run ' +
          '"python -m http.server" in the project folder and visit http://localhost:8000), ' +
          'not by double-clicking the file.');
      }
      if (typeof loadPyodide !== 'function') {
        throw new Error('Could not load Pyodide (Python in the browser) from the internet. ' +
          'Check your connection, or the version number in index.html.');
      }
      if (typeof Plotly === 'undefined') {
        throw new Error('Could not load Plotly (the 3D charts) from the internet. ' +
          'Check your connection, or the version number in index.html.');
      }
  
      var pyodide = await loadPyodide();
      for (var i = 0; i < PY_FILES.length; i++) {
        var response = await fetch(PY_FILES[i], { cache: 'no-cache' });
        if (!response.ok) throw new Error('Could not fetch ' + PY_FILES[i] + ' (HTTP ' + response.status + ').');
        pyodide.FS.writeFile('/home/pyodide/' + PY_FILES[i], await response.text());
      }
      pyodide.runPython(
        'import sys\n' +
        'if "/home/pyodide" not in sys.path: sys.path.insert(0, "/home/pyodide")\n');
      state.session = pyodide.pyimport('bridge').Session();
    }
  
    async function boot() {
      initResizer();
      $('btn-mst').addEventListener('click', onToggleMst);
      $('btn-sidebar').addEventListener('click', onToggleSidebar);
  
      try {
        await startPython();
      } catch (err) {
        setMessage(err.message, true);
        return;
      }
  
      // keep the 3D view filling its area when the window or sidebar changes size
      new ResizeObserver(function () {
        if (state.snap) Plotly.Plots.resize('plot');
      }).observe($('plot'));
  
      $('btn-reset').addEventListener('click', onResetView);
      $('btn-demo').addEventListener('click', onLoadDemo);
      $('btn-clear').addEventListener('click', onClear);
      $('btn-demo').disabled = false;
      $('btn-clear').disabled = false;
  
      refresh();
      setMessage('Ready. Try the demo galaxy in the sidebar, then rotate, zoom and hover.', false);
    }
  
    // Any unexpected error during start-up is shown in the message line.
    boot().catch(function (err) { setMessage(String(err && err.message || err), true); });
  })();