"""Saving, loading and CSV import/export (step 3).

Design decisions:
- One JSON file per galaxy, in a folder. The file name IS the galaxy name,
  so renaming a galaxy is just renaming the file.
- Galaxy names must be safe as file names and are unique ignoring case
  (so the folder behaves the same on every operating system).
- A corrupted or invalid file raises StorageError; it never produces a
  half-loaded galaxy. Loading re-checks every star with the normal Galaxy
  rules (unique names, no duplicate coordinates, finite numbers).
- Saves are atomic: write a temp file, then replace the real one.
- CSV format is name,x,y,z. Bad rows are skipped and reported.
"""

import csv
import io
import json
import os
import re
import tempfile
from dataclasses import dataclass, field

from galaxy import Galaxy, GalaxyError

FORMAT_VERSION = 1
MAX_NAME_LENGTH = 100
_BAD_NAME_CHARS = re.compile(r'[\\/:*?"<>|\x00-\x1f]')
_RESERVED_NAMES = {"CON", "PRN", "AUX", "NUL"} | \
    {f"COM{i}" for i in range(1, 10)} | {f"LPT{i}" for i in range(1, 10)}


class StorageError(Exception):
    """Raised for file problems; the message is meant for the user."""


def check_galaxy_name(name):
    """Return the cleaned galaxy name or raise StorageError."""
    if not isinstance(name, str):
        raise StorageError("Galaxy name must be text.")
    name = name.strip()
    if not name:
        raise StorageError("Galaxy name cannot be empty.")
    if len(name) > MAX_NAME_LENGTH:
        raise StorageError(f"Galaxy name is longer than {MAX_NAME_LENGTH} characters.")
    if _BAD_NAME_CHARS.search(name):
        raise StorageError('Galaxy name cannot contain any of \\ / : * ? " < > |')
    if name.startswith(".") or name.endswith("."):
        raise StorageError("Galaxy name cannot start or end with a dot.")
    if name.split(".")[0].upper() in _RESERVED_NAMES:
        raise StorageError(f"'{name}' is a reserved system name.")
    return name


def _atomic_write(path, text):
    """Write text to path without ever leaving a half-written file."""
    folder = os.path.dirname(path) or "."
    tmp = None
    try:
        fd, tmp = tempfile.mkstemp(dir=folder, suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
            f.write(text)
        os.replace(tmp, path)
        tmp = None
    except OSError as e:
        raise StorageError(f"Could not write '{path}': {e.strerror or e}")
    finally:
        if tmp is not None and os.path.exists(tmp):
            os.remove(tmp)


class GalaxyStore:
    """A folder of saved galaxies."""

    def __init__(self, folder="galaxies"):
        self.folder = folder

    def _path(self, name):
        return os.path.join(self.folder, name + ".json")

    def list_galaxies(self):
        """Saved galaxy names, sorted ignoring case."""
        if not os.path.isdir(self.folder):
            return []
        names = []
        for f in os.listdir(self.folder):
            if f.endswith(".json") and os.path.isfile(os.path.join(self.folder, f)):
                names.append(f[:-5])
        return sorted(names, key=lambda s: (s.lower(), s))

    def _clash(self, name, ignore=None):
        """An existing galaxy whose name equals `name` ignoring case."""
        for existing in self.list_galaxies():
            if existing != ignore and existing.lower() == name.lower():
                return existing
        return None

    def exists(self, name):
        return check_galaxy_name(name) in self.list_galaxies()

    def save(self, galaxy):
        """Save (overwriting a galaxy of the same name; the UI should ask first)."""
        name = check_galaxy_name(galaxy.name)
        clash = self._clash(name)
        if clash is not None and clash != name:
            raise StorageError(f"A galaxy named '{clash}' already exists "
                               "(names are not case-sensitive).")
        data = {
            "format": FORMAT_VERSION,
            "stars": [{"name": n, "x": c[0], "y": c[1], "z": c[2]}
                      for n, c in galaxy.stars()],
        }
        try:
            text = json.dumps(data, indent=2, allow_nan=False)
        except ValueError:
            raise StorageError("Galaxy contains a coordinate that cannot be saved.")
        try:
            os.makedirs(self.folder, exist_ok=True)
        except OSError as e:
            raise StorageError(f"Could not create folder '{self.folder}': {e.strerror or e}")
        _atomic_write(self._path(name), text)
        galaxy.name = name

    def load(self, name):
        name = check_galaxy_name(name)
        path = self._path(name)
        if not os.path.isfile(path):
            raise StorageError(f"No saved galaxy named '{name}'.")
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, ValueError):
            raise StorageError(f"'{name}' is damaged and cannot be read.")

        if not isinstance(data, dict) or data.get("format") != FORMAT_VERSION:
            raise StorageError(f"'{name}' is not a valid galaxy file (unknown format).")
        stars = data.get("stars")
        if not isinstance(stars, list):
            raise StorageError(f"'{name}' is not a valid galaxy file (no star list).")

        galaxy = Galaxy(name)
        for i, s in enumerate(stars, start=1):
            if (not isinstance(s, dict) or not {"name", "x", "y", "z"} <= s.keys()
                    or not isinstance(s["name"], str)
                    or any(isinstance(s[k], bool) or not isinstance(s[k], (int, float))
                           for k in "xyz")):
                raise StorageError(f"'{name}' is damaged: star #{i} is malformed.")
            try:
                galaxy.add_star(s["name"], s["x"], s["y"], s["z"])
            except GalaxyError as e:
                raise StorageError(f"'{name}' is damaged: star #{i}: {e}")
        return galaxy

    def rename(self, old, new):
        old = check_galaxy_name(old)
        new = check_galaxy_name(new)
        if old not in self.list_galaxies():
            raise StorageError(f"No saved galaxy named '{old}'.")
        if old == new:
            return
        clash = self._clash(new, ignore=old)
        if clash is not None:
            raise StorageError(f"A galaxy named '{clash}' already exists.")
        try:
            os.replace(self._path(old), self._path(new))
        except OSError as e:
            raise StorageError(f"Could not rename: {e.strerror or e}")

    def delete(self, name):
        name = check_galaxy_name(name)
        if name not in self.list_galaxies():
            raise StorageError(f"No saved galaxy named '{name}'.")
        try:
            os.remove(self._path(name))
        except OSError as e:
            raise StorageError(f"Could not delete: {e.strerror or e}")


# ---------------------------------------------------------------- CSV

@dataclass
class ImportResult:
    added: int = 0
    skipped: list = field(default_factory=list)  # (line number, reason)

    def summary(self):
        s = f"{self.added} imported"
        if self.skipped:
            lines = ", ".join(str(n) for n, _ in self.skipped[:10])
            more = "..." if len(self.skipped) > 10 else ""
            s += f", {len(self.skipped)} skipped (lines {lines}{more})"
        return s


def import_csv(galaxy, path):
    """Add stars from a name,x,y,z CSV file to `galaxy`.

    A first row that is exactly name,x,y,z (any case) is a header. Blank
    lines are ignored. Any other row that cannot be added (wrong number of
    columns, bad number, duplicate name or coordinates) is skipped and
    reported with its line number. Stars added before an unreadable part of
    the file stay added.

    Each add_star is O(size of galaxy), so importing m rows into a galaxy
    of n stars is O(m * (n + m)).
    """
    result = ImportResult()
    try:
        with open(path, newline="", encoding="utf-8-sig") as f:
            reader = csv.reader(f)
            first = True
            for row in reader:
                line = reader.line_num
                if not row or all(c.strip() == "" for c in row):
                    continue
                if first:
                    first = False
                    if (len(row) == 4 and
                            [c.strip().lower() for c in row] == ["name", "x", "y", "z"]):
                        continue
                if len(row) != 4:
                    result.skipped.append(
                        (line, f"expected 4 columns, found {len(row)}"))
                    continue
                try:
                    galaxy.add_star(*row)
                    result.added += 1
                except GalaxyError as e:
                    result.skipped.append((line, str(e)))
    except OSError as e:
        raise StorageError(f"Could not read '{path}': {e.strerror or e}")
    except (UnicodeDecodeError, csv.Error):
        raise StorageError(f"'{path}' is not a readable CSV text file.")
    return result


def export_csv(galaxy, path):
    """Write the galaxy as name,x,y,z with a header row."""
    buf = io.StringIO(newline="")
    writer = csv.writer(buf)
    writer.writerow(["name", "x", "y", "z"])
    for name, (x, y, z) in galaxy.stars():
        writer.writerow([name, repr(x), repr(y), repr(z)])
    _atomic_write(path, buf.getvalue())