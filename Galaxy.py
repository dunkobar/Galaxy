"""Core galaxy model (step 1): stars, names, coordinates, validation.

No UI code lives here. Rules (from the design):
- Every star has a unique, non-empty name (case-sensitive, surrounding
  whitespace is stripped).
- Coordinates are three finite numbers.
- Two stars may not have identical coordinates (exact comparison).
- Invalid operations raise GalaxyError; the UI shows the message.
"""

import math

from mst import prim_mst


class GalaxyError(Exception):
    """Raised when an operation violates a galaxy rule."""


class Galaxy:
    def __init__(self, name="Untitled"):
        self.name = name
        self._stars = {}  # star name -> (x, y, z)

    # ---------- validation helpers ----------

    @staticmethod
    def _clean_name(name):
        if not isinstance(name, str):
            raise GalaxyError("Star name must be text.")
        name = name.strip()
        if not name:
            raise GalaxyError("Star name cannot be empty.")
        return name

    @staticmethod
    def _clean_coords(x, y, z):
        coords = []
        for label, value in (("x", x), ("y", y), ("z", z)):
            if isinstance(value, bool):
                raise GalaxyError(f"Coordinate {label} must be a number.")
            try:
                value = float(value)
            except (TypeError, ValueError):
                raise GalaxyError(f"Coordinate {label} must be a number.")
            if not math.isfinite(value):
                raise GalaxyError(f"Coordinate {label} must be finite.")
            coords.append(value)
        return tuple(coords)

    def _owner_of(self, coords, ignore=None):
        """Name of the star at these coordinates, or None."""
        for star_name, c in self._stars.items():
            if star_name != ignore and c == coords:
                return star_name
        return None

    # ---------- operations ----------

    def add_star(self, name, x, y, z):
        name = self._clean_name(name)
        coords = self._clean_coords(x, y, z)
        if name in self._stars:
            raise GalaxyError(f"A star named '{name}' already exists.")
        owner = self._owner_of(coords)
        if owner is not None:
            raise GalaxyError(f"Star '{owner}' is already at those coordinates.")
        self._stars[name] = coords

    def remove_star(self, name):
        if name not in self._stars:
            raise GalaxyError(f"No star named '{name}'.")
        del self._stars[name]

    def edit_star(self, name, x, y, z, new_name=None):
        """Move or rename an existing star, enforcing the normal star rules."""
        if name not in self._stars:
            raise GalaxyError(f"No star named '{name}'.")
        if new_name is None:
            new_name = name
        else:
            new_name = self._clean_name(new_name)
        if new_name != name and new_name in self._stars:
            raise GalaxyError(f"A star named '{new_name}' already exists.")
        coords = self._clean_coords(x, y, z)
        owner = self._owner_of(coords, ignore=name)
        if owner is not None:
            raise GalaxyError(f"Star '{owner}' is already at those coordinates.")
        if new_name == name:
            self._stars[name] = coords
        else:
            self._stars = {
                new_name if star_name == name else star_name:
                    coords if star_name == name else star_coords
                for star_name, star_coords in self._stars.items()
            }

    # ---------- queries ----------

    def __len__(self):
        return len(self._stars)

    def __contains__(self, name):
        return name in self._stars

    def get(self, name):
        if name not in self._stars:
            raise GalaxyError(f"No star named '{name}'.")
        return self._stars[name]

    def stars(self):
        """List of (name, (x, y, z)) in insertion order."""
        return list(self._stars.items())

    def tree(self):
        """Minimum spanning tree as a list of (name_a, name_b, length).

        Runs Prim's algorithm on the current stars: O(n^2) for n stars
        (plus O(n) to translate indexes back to names). 0 or 1 stars
        give an empty list.
        """
        names = list(self._stars.keys())
        points = [self._stars[n] for n in names]
        return [(names[i], names[j], d) for i, j, d in prim_mst(points)]