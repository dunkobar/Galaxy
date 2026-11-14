
# Galaxy Explorer

A 3D model of the stars of a galaxy with a minimum spanning tree, built step by step.
Python (running in the browser through Pyodide) does the work; Plotly draws the 3D view.

## Run it locally

The page loads Python files with `fetch`, so it must be served, not opened by double-click:

    python3 -m http.server 8000

then visit <http://localhost:8000>. An internet connection is needed for the Pyodide and
Plotly libraries (the versions are pinned in `Index.html`).
Save CSV downloads the current galaxy, Load CSV replaces it after confirmation, and
Import CSV adds valid rows while reporting rejected rows.

## Run the tests

    python3 -m unittest -v    # Galaxy, CSV storage and bridge validation

## Files

| File | Role |
|---|---|
| `Galaxy.py` | Stars, names, coordinates, validation, `tree()` |
| `mst.py` | Prim's algorithm (O(n^2)) and a Kruskal version used only to cross-check it in tests |
| `Analysis.py` | Clustering (cut the longest tree edges) and statistics |
| `storage.py` | CSV parsing/export shared by the browser and Python API; optional JSON file storage |
| `bridge.py` | Glue between the page and the modules above |
| `render.js` | Turns a snapshot into Plotly traces, layout and text |
| `app.js`, `Index.html`, `style.css` | The page, add/edit/remove form, and star selection |
