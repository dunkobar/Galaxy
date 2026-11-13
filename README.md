
# Galaxy Explorer

A 3D model of the stars of a galaxy with a minimum spanning tree, built step by step.
Python (running in the browser through Pyodide) does the work; Plotly draws the 3D view.

## Run it locally

The page loads Python files with `fetch`, so it must be served, not opened by double-click:

    python -m http.server 8000

then visit <http://localhost:8000>. An internet connection is needed for the Pyodide and
Plotly libraries (the versions are pinned in `index.html`).

## Run the tests

    python -m unittest -v      # Python: galaxy, MST, storage, analysis, bridge
    node --test test_render.js # JavaScript drawing helpers (Node 20+)

## Files

| File | Role |
|---|---|
| `galaxy.py` | Stars, names, coordinates, validation, `tree()` |
| `mst.py` | Prim's algorithm (O(n^2)) and a Kruskal version used only to cross-check it in tests |
| `analysis.py` | Clustering (cut the longest tree edges) and statistics |
| `storage.py` | Folder-of-JSON saving, CSV import/export (desktop version; the browser version comes in step 5c) |
| `bridge.py` | Glue between the page and the modules above |
| `render.js` | Turns a snapshot into Plotly traces, layout and text |
| `app.js`, `index.html`, `style.css` | The page |
