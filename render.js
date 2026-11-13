/* Pure drawing helpers: they turn a snapshot from bridge.py into Plotly
 * traces/layout and into text. No DOM access here, so they are tested in
 * Node (test_render.js). In the browser they are plain global functions. */

var DEFAULT_CAMERA = {
    eye: { x: 1.5, y: 1.5, z: 1.2 },
    center: { x: 0, y: 0, z: 0 },
    up: { x: 0, y: 0, z: 1 },
  };
  
  var COLORS = {
    background: '#0b1020',
    grid: '#27314f',
    text: '#9fb0d0',
    star: '#cfe3ff',
    edge: '#6f8fcf',
  };
  
  /* Number -> text; null (e.g. "shortest edge" with fewer than 2 stars) -> a dash. */
  function formatNumber(value, digits) {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    return value.toFixed(digits === undefined ? 3 : digits);
  }
  
  /* Plotly shows hover text as mini-HTML, so star names (typed by the user,
   * later also read from CSV files) must not be able to inject tags. */
  function escapeHoverText(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  
  function formatCoords(star) {
    return '(' + formatNumber(star.x, 2) + ', ' + formatNumber(star.y, 2) + ', ' +
      formatNumber(star.z, 2) + ')';
  }
  
  function hoverText(star) {
    return escapeHoverText(star.name) + '<br>x: ' + formatNumber(star.x) +
      '<br>y: ' + formatNumber(star.y) + '<br>z: ' + formatNumber(star.z);
  }
  
  /* Returns [edgeTrace, starTrace]. The tree is one line trace: every edge
   * contributes (start, end, null); the null makes Plotly lift the pen, so
   * separate edges are not joined. */
  function buildTraces(snap, opts) {
    var showMst = !opts || opts.showMst !== false;
    var ex = [], ey = [], ez = [];
    if (showMst) {
      for (var e = 0; e < snap.edges.length; e++) {
        var a = snap.stars[snap.edges[e][0]];
        var b = snap.stars[snap.edges[e][1]];
        ex.push(a.x, b.x, null);
        ey.push(a.y, b.y, null);
        ez.push(a.z, b.z, null);
      }
    }
    var edgeTrace = {
      type: 'scatter3d', mode: 'lines', name: 'Tree',
      x: ex, y: ey, z: ez,
      line: { color: COLORS.edge, width: 2 },
      opacity: 0.7, hoverinfo: 'skip', showlegend: false,
    };
    var starTrace = {
      type: 'scatter3d', mode: 'markers', name: 'Stars',
      x: snap.stars.map(function (s) { return s.x; }),
      y: snap.stars.map(function (s) { return s.y; }),
      z: snap.stars.map(function (s) { return s.z; }),
      text: snap.stars.map(hoverText),
      hovertemplate: '%{text}<extra></extra>',
      marker: { size: 4, color: COLORS.star },
      showlegend: false,
    };
    return [edgeTrace, starTrace];
  }
  
  /* The camera is deliberately NOT set here: 'uirevision' makes Plotly keep
   * whatever rotation/zoom the user has, so adding a star doesn't reset the view. */
  function buildLayout(snap) {
    var empty = snap.stars.length === 0;
    function axis(title) {
      var ax = {
        title: { text: title },
        color: COLORS.text,
        gridcolor: COLORS.grid,
        zerolinecolor: COLORS.grid,
        showbackground: true,
        backgroundcolor: COLORS.background,
      };
      if (empty) { ax.range = [-1, 1]; ax.autorange = false; } else { ax.autorange = true; }
      return ax;
    }
    return {
      paper_bgcolor: COLORS.background,
      margin: { l: 0, r: 0, t: 0, b: 0 },
      showlegend: false,
      uirevision: 'keep',
      hoverlabel: { bgcolor: '#17203a', font: { color: '#e6edf9' } },
      scene: {
        aspectmode: 'data',           // true distances, so the tree looks right
        dragmode: 'orbit',            // left-drag rotates; wheel zooms; right-drag pans
        bgcolor: COLORS.background,
        xaxis: axis('X'), yaxis: axis('Y'), zaxis: axis('Z'),
      },
    };
  }
  
  /* [label, text] pairs for the bottom statistics panel. */
  function statsRows(stats) {
    return [
      ['Stars', String(stats.stars)],
      ['Tree edges', String(stats.edges)],
      ['Total length', formatNumber(stats.total_length)],
      ['Shortest edge', formatNumber(stats.shortest)],
      ['Longest edge', formatNumber(stats.longest)],
      ['Average edge', formatNumber(stats.average)],
      ['Clusters', String(stats.clusters)],
    ];
  }
  
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      DEFAULT_CAMERA, COLORS, formatNumber, escapeHoverText, formatCoords,
      hoverText, buildTraces, buildLayout, statsRows,
    };
  }