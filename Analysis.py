"""Clustering and statistics (step 4).

Both functions work on the tree from Galaxy.tree(), a list of
(name_a, name_b, length) edges, so they never recompute distances.

Clustering rule: cut the k-1 longest tree edges; the connected pieces that
remain are the k clusters. (This is the same as "single linkage"
clustering: repeatedly merge the two closest groups until k are left.)
"""

import math
from dataclasses import dataclass


def clamp_k(k, n):
    """Nearest valid cluster count for a galaxy of n stars (1 when n is 0)."""
    return max(1, min(k, n))


def cluster_labels(names, edges, k):
    """Map each star name to a cluster number 0..k-1.

    names: all star names, in galaxy order; edges: the MST of those stars.
    Cluster numbers are given in order of first appearance in `names`, so
    the first star is always in cluster 0 and numbering is stable.
    Ties between equally long edges are broken by their order in `edges`
    (earlier edge is cut first), so the result is deterministic.

    Running time: sorting the n-1 edges is O(n log n); the union-find pass
    over the kept edges and the labelling are O(n * alpha(n)), which is
    effectively O(n). Total O(n log n) once the tree exists.
    """
    n = len(names)
    if n == 0:
        return {}
    if isinstance(k, bool) or not isinstance(k, int) or k < 1 or k > n:
        raise ValueError(f"k must be a whole number from 1 to {n}.")

    index = {name: i for i, name in enumerate(names)}

    # the k-1 longest edges are cut (sorted() is stable, so ties keep order)
    by_length_desc = sorted(range(len(edges)), key=lambda e: -edges[e][2])
    cut = set(by_length_desc[:k - 1])

    parent = list(range(n))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]  # path halving
            a = parent[a]
        return a

    for e, (a, b, _) in enumerate(edges):
        if e not in cut:
            parent[find(index[a])] = find(index[b])

    labels = {}
    root_label = {}
    for name in names:
        root = find(index[name])
        if root not in root_label:
            root_label[root] = len(root_label)
        labels[name] = root_label[root]
    return labels


@dataclass(frozen=True)
class Stats:
    stars: int
    edges: int
    total_length: float
    shortest: float | None   # None when there are no edges (fewer than 2 stars)
    longest: float | None
    average: float | None
    clusters: int


def compute_stats(names, edges, labels):
    """Numbers for the bottom panel. O(n) for n stars."""
    lengths = [e[2] for e in edges]
    total = math.fsum(lengths)
    return Stats(
        stars=len(names),
        edges=len(edges),
        total_length=total,
        shortest=min(lengths) if lengths else None,
        longest=max(lengths) if lengths else None,
        average=total / len(lengths) if lengths else None,
        clusters=len(set(labels.values())),
    )