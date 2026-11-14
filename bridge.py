"""Glue between the web page (JavaScript) and the core modules.

Runs inside Pyodide in the browser, but is plain Python, so it is tested
with unittest like everything else. Every method returns a JSON *string*
(simple and safe to pass across the Python/JavaScript boundary).

The session exposes snapshots, demo data, star editing, and CSV save/load/import
to the browser UI.
"""

import json
import random
from dataclasses import asdict

from Analysis import clamp_k, cluster_labels, compute_stats
from Galaxy import Galaxy, GalaxyError
from storage import StorageError, export_csv_text, import_csv_text, load_csv_text

MAX_DEMO_STARS = 1000


def _ok(**extra):
    return json.dumps({"ok": True, **extra}, allow_nan=False)


def _err(message):
    return json.dumps({"ok": False, "error": message})


def _as_int(value):
    """int for whole numbers (JS sends numbers as int or float), else None."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return None


class Session:
    """The galaxy the page is currently showing."""

    def __init__(self):
        self.galaxy = Galaxy("Untitled")
        self.k = 1            # number of clusters wanted (used from step 5d)
        self._tree = None     # cached MST; reset whenever the stars change

    # ---------------------------------------------------------- changes

    def clear(self):
        self.galaxy = Galaxy("Untitled")
        self._tree = None
        return _ok()

    def _change(self, operation, *args):
        """Run a galaxy change; on success forget the cached tree.

        A rejected change leaves the galaxy untouched (Galaxy guarantees
        this), so the cache stays valid and the user sees the reason.
        """
        try:
            operation(*args)
        except GalaxyError as e:
            return _err(str(e))
        self._tree = None
        return _ok()

    def add_star(self, name, x, y, z):
        return self._change(self.galaxy.add_star, name, x, y, z)

    def remove_star(self, name):
        return self._change(self.galaxy.remove_star, name)

    def edit_star(self, name, x, y, z, new_name=None):
        return self._change(self.galaxy.edit_star, name, x, y, z, new_name)

    def export_csv(self):
        return _ok(csv=export_csv_text(self.galaxy))

    def import_csv(self, text):
        working = Galaxy(self.galaxy.name)
        for name, (x, y, z) in self.galaxy.stars():
            working.add_star(name, x, y, z)
        try:
            result = import_csv_text(working, text)
        except StorageError as e:
            return _err(str(e))
        if result.added:
            self.galaxy = working
            self._tree = None
        return _ok(
            added=result.added,
            skipped=[{"line": line, "error": reason}
                     for line, reason in result.skipped],
        )

    def load_csv(self, text, name="Untitled"):
        try:
            galaxy, result = load_csv_text(text, name)
        except StorageError as e:
            return _err(str(e))
        self.galaxy = galaxy
        self._tree = None
        return _ok(loaded=result.added)

    def load_demo(self, count, seed=1):
        """Replace the galaxy with `count` random stars in a few clumps.

        Temporary testing aid. The same seed gives the same galaxy.
        """
        count, seed = _as_int(count), _as_int(seed)
        if count is None or not 0 <= count <= MAX_DEMO_STARS:
            return _err(f"Star count must be a whole number from 0 to {MAX_DEMO_STARS}.")
        if seed is None:
            return _err("Seed must be a whole number.")

        rng = random.Random(seed)
        centers = [tuple(rng.uniform(-50, 50) for _ in range(3))
                   for _ in range(max(1, count // 25))]
        galaxy = Galaxy("Demo galaxy")
        while len(galaxy) < count:
            cx, cy, cz = rng.choice(centers)
            try:
                galaxy.add_star(f"S{len(galaxy) + 1}",
                                cx + rng.gauss(0, 6),
                                cy + rng.gauss(0, 6),
                                cz + rng.gauss(0, 6))
            except GalaxyError:
                continue  # (practically impossible) same spot twice: retry
        self.galaxy = galaxy
        self._tree = None
        return _ok()

    # ---------------------------------------------------------- queries

    def _get_tree(self):
        if self._tree is None:
            self._tree = self.galaxy.tree()   # O(n^2), only when stars changed
        return self._tree

    def snapshot(self):
        """Everything the page needs to draw: stars, tree, clusters, stats.

        Edges are [i, j, length] where i and j index into "stars".
        """
        stars = self.galaxy.stars()
        names = [name for name, _ in stars]
        index = {name: i for i, name in enumerate(names)}
        edges = self._get_tree()
        k = clamp_k(self.k, len(names))
        labels = cluster_labels(names, edges, k)
        stats = compute_stats(names, edges, labels)
        return json.dumps({
            "name": self.galaxy.name,
            "k": k,
            "max_k": max(1, len(names)),
            "stars": [{"name": name, "x": c[0], "y": c[1], "z": c[2],
                       "cluster": labels[name]} for name, c in stars],
            "edges": [[index[a], index[b], d] for a, b, d in edges],
            "stats": asdict(stats),
        }, allow_nan=False)