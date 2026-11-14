/* Page wiring: load Python in the browser, draw what bridge.py reports, and
 * send add / update / remove back to it. The drawing logic itself lives in
 * render.js and the galaxy rules in the Python modules; this file only
 * connects them to the page. */
(function () {
    'use strict';
  
    var PY_FILES = [
      { source: 'Galaxy.py', module: 'Galaxy.py' },
      { source: 'mst.py', module: 'mst.py' },
      { source: 'Analysis.py', module: 'Analysis.py' },
      { source: 'storage.py', module: 'storage.py' },
      { source: 'bridge.py', module: 'bridge.py' },
    ];
  
    var $ = function (id) { return document.getElementById(id); };
    var state = {
      session: null, showMst: true, snap: null, selected: null,
      plotClicksBound: false, csvAction: null,
    };
  
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
        var picked = s.name === state.selected;
        if (picked) li.className = 'selected';
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'star-pick';
        button.setAttribute('aria-pressed', String(picked));
        button.title = picked ? 'Click to deselect' : 'Select this star';
        var name = document.createElement('span');
        name.className = 'name';
        name.textContent = s.name;                 // textContent: never parsed as HTML
        var coords = document.createElement('span');
        coords.className = 'coords';
        coords.textContent = formatCoords(s);
        button.append(name, coords);
        button.addEventListener('click', function () {
          selectStar(s.name, { toggle: true });
        });
        li.append(button);
        list.append(li);
      });
    }
  
    function renderPlot(snap) {
      var config = { responsive: true, displaylogo: false, displayModeBar: false };
      return Plotly.react(
        'plot',
        buildTraces(snap, { showMst: state.showMst, selected: state.selected }),
        buildLayout(snap),
        config
      ).then(function () {
        var plot = $('plot');
        if (!state.plotClicksBound && plot.on) {
          plot.on('plotly_click', onPlotClick);
          state.plotClicksBound = true;
        }
      });
    }

    function onPlotClick(ev) {
      var pt = ev.points && ev.points[0];
      if (!pt || !pt.data || pt.data.name !== 'Stars' || !state.snap) return;
      var star = state.snap.stars[pt.pointNumber];
      if (star) selectStar(star.name, { toggle: true, scroll: true });
    }
  
    /* Ask Python for the current galaxy and redraw everything. */
    function refresh() {
      var t0 = performance.now();
      var snap = JSON.parse(state.session.snapshot());
      var ms = performance.now() - t0;
      state.snap = snap;
  
      $('galaxy-name').textContent = snap.name;
      if (state.selected && !snap.stars.some(function (s) { return s.name === state.selected; })) {
        state.selected = null;
        $('star-form').reset();
      }
      renderStats(snap.stats);
      renderStarList(snap.stars);
      renderPlot(snap);
      syncForm();
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
  
    /* ---------- add, edit, remove, select ---------- */

    function field(id) {
      return $(id).value;
    }

    function syncForm() {
      var selected = !!state.selected;
      var ready = !!state.session;
      $('star-form-title').textContent = selected ? 'Edit star' : 'Add a star';
      $('btn-add').disabled = !ready || selected;
      $('btn-update').disabled = !selected;
      $('btn-remove').disabled = !selected;
      $('btn-deselect').hidden = !selected;
    }

    function fillForm(star) {
      $('star-name').value = star.name;
      $('star-x').value = String(star.x);
      $('star-y').value = String(star.y);
      $('star-z').value = String(star.z);
    }

    function clearSelection() {
      state.selected = null;
      $('star-form').reset();
      syncForm();
      if (state.snap) {
        renderStarList(state.snap.stars);
        renderPlot(state.snap);
      }
    }

    function selectStar(name, opts) {
      opts = opts || {};
      if (!state.snap) return;
      if (opts.toggle && state.selected === name) {
        clearSelection();
        setMessage('Selection cleared.', false);
        return;
      }
      var star = null;
      for (var i = 0; i < state.snap.stars.length; i++) {
        if (state.snap.stars[i].name === name) star = state.snap.stars[i];
      }
      if (!star) return;
      state.selected = name;
      fillForm(star);
      syncForm();
      renderStarList(state.snap.stars);
      renderPlot(state.snap);
      if (opts.scroll) {
        var rows = $('star-list').querySelectorAll('li.selected');
        if (rows.length) rows[0].scrollIntoView({ block: 'nearest' });
      }
      if (!opts.silent) setMessage("Selected '" + star.name + "'.", false);
    }

    function onAdd(e) {
      e.preventDefault();
      if (state.selected) { onUpdate(); return; }
      var name = field('star-name');
      var result = JSON.parse(state.session.add_star(name, field('star-x'), field('star-y'), field('star-z')));
      if (!result.ok) { setMessage(result.error, true); return; }
      refresh();
      selectStar(name.trim(), { silent: true });
      setMessage("Added star '" + name.trim() + "'.", false);
    }

    function onUpdate() {
      if (!state.selected) return;
      var name = state.selected;
      var newName = field('star-name');
      var result = JSON.parse(state.session.edit_star(
        name, field('star-x'), field('star-y'), field('star-z'), newName
      ));
      if (!result.ok) { setMessage(result.error, true); return; }
      newName = newName.trim();
      state.selected = newName;
      refresh();
      selectStar(newName, { silent: true });
      setMessage("Updated star '" + newName + "'.", false);
    }

    function onRemove() {
      if (!state.selected) return;
      var name = state.selected;
      var result = JSON.parse(state.session.remove_star(name));
      if (!result.ok) { setMessage(result.error, true); return; }
      state.selected = null;
      $('star-form').reset();
      refresh();
      setMessage("Removed star '" + name + "'.", false);
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
      state.selected = null;
      $('star-form').reset();
      refresh();
      setMessage('Loaded a demo galaxy with ' + starsText(count) + ' (seed ' + seed + ').', false);
    }
  
    function onClear() {
      JSON.parse(state.session.clear());
      state.selected = null;
      $('star-form').reset();
      refresh();
      setMessage('Galaxy cleared.', false);
    }

    function csvFilename(name) {
      var safe = String(name || 'galaxy').trim().replace(/[\\/:*?"<>|]+/g, '_');
      return (safe || 'galaxy') + '.csv';
    }

    function downloadCsv(text, name) {
      var blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = csvFilename(name);
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    function onSaveCsv() {
      try {
        var result = JSON.parse(state.session.export_csv());
        if (!result.ok) { setMessage(result.error, true); return; }
        downloadCsv(result.csv, state.snap.name);
        setMessage('Downloaded ' + csvFilename(state.snap.name) + '.', false);
      } catch (err) {
        setMessage('Could not save CSV: ' + String(err && err.message || err), true);
      }
    }

    function showImportResult(result) {
      var count = result.added;
      if (!result.skipped.length) {
        setMessage(count ? 'Imported ' + starsText(count) + '.' : 'No stars to import.', false);
        return;
      }
      var details = result.skipped.slice(0, 5).map(function (row) {
        return 'Line ' + row.line + ': ' + row.error;
      }).join(' ');
      var more = result.skipped.length > 5 ?
        ' (' + (result.skipped.length - 5) + ' more skipped).' : '';
      setMessage(
        'Imported ' + starsText(count) + '; skipped ' + result.skipped.length +
        ' row(s). ' + details + more,
        true
      );
    }

    function chooseCsv(action) {
      state.csvAction = action;
      $('csv-file').click();
    }

    async function onCsvFileSelected() {
      var input = $('csv-file');
      var file = input.files && input.files[0];
      var action = state.csvAction;
      state.csvAction = null;
      if (!file) return;
      try {
        var text = await file.text();
        if (action === 'load') {
          if (state.snap.stars.length &&
              !window.confirm('Replace the current galaxy with the contents of this CSV file?')) {
            setMessage('Load canceled; the current galaxy was kept.', false);
            return;
          }
          var name = file.name.replace(/\.csv$/i, '') || 'Untitled';
          var loaded = JSON.parse(state.session.load_csv(text, name));
          if (!loaded.ok) { setMessage(loaded.error, true); return; }
          state.selected = null;
          $('star-form').reset();
          refresh();
          setMessage('Loaded ' + starsText(loaded.loaded) + ' from ' + file.name + '.', false);
          return;
        }

        var imported = JSON.parse(state.session.import_csv(text));
        if (!imported.ok) { setMessage(imported.error, true); return; }
        if (imported.added) refresh();
        showImportResult(imported);
      } catch (err) {
        setMessage('Could not read CSV: ' + String(err && err.message || err), true);
      } finally {
        input.value = '';
      }
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
          '"python3 -m http.server" in the project folder and visit http://localhost:8000), ' +
          'not by double-clicking the file.');
      }
      if (typeof loadPyodide !== 'function') {
        throw new Error('Could not load Pyodide (Python in the browser) from the internet. ' +
          'Check your connection, or the version number in Index.html.');
      }
      if (typeof Plotly === 'undefined') {
        throw new Error('Could not load Plotly (the 3D charts) from the internet. ' +
          'Check your connection, or the version number in Index.html.');
      }
  
      var pyodide = await loadPyodide();
      for (var i = 0; i < PY_FILES.length; i++) {
        var file = PY_FILES[i];
        var response = await fetch(file.source, { cache: 'no-cache' });
        if (!response.ok) throw new Error('Could not fetch ' + file.source + ' (HTTP ' + response.status + ').');
        pyodide.FS.writeFile('/home/pyodide/' + file.module, await response.text());
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
      $('btn-save').addEventListener('click', onSaveCsv);
      $('btn-load').addEventListener('click', function () { chooseCsv('load'); });
      $('btn-import').addEventListener('click', function () { chooseCsv('import'); });
      $('csv-file').addEventListener('change', onCsvFileSelected);
      $('star-form').addEventListener('submit', onAdd);
      $('btn-update').addEventListener('click', onUpdate);
      $('btn-remove').addEventListener('click', onRemove);
      $('btn-deselect').addEventListener('click', function () {
        clearSelection();
        setMessage('Selection cleared.', false);
      });
      $('btn-demo').disabled = false;
      $('btn-clear').disabled = false;
      $('btn-save').disabled = false;
      $('btn-load').disabled = false;
      $('btn-import').disabled = false;
      syncForm();

      refresh();
      setMessage('Ready. Add a star with a name and coordinates, or load the demo galaxy.', false);
    }
  
    // Any unexpected error during start-up is shown in the message line.
    boot().catch(function (err) { setMessage(String(err && err.message || err), true); });
  })();