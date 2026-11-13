"""Minimum spanning tree of stars (step 2).

Points are (x, y, z) tuples; the graph is complete and the weight of an
edge is the Euclidean distance. Edges are returned as (i, j, length),
where i and j are indexes into the list of points.

prim_mst     - the real implementation, O(n^2).
kruskal_mst  - an independent second implementation, used only by tests
               to cross-check Prim (it is O(n^2 log n)).
"""

import math


def prim_mst(points):
    """Prim's algorithm on the complete graph, array version.

    best_dist[v] = distance from v to the closest vertex already in the tree
    best_from[v] = which tree vertex that is.
    Each of the n-1 rounds scans all vertices twice (pick the closest
    outside vertex, then update the others): O(n) per round, O(n^2) total.
    """
    n = len(points)
    if n < 2:
        return []

    in_tree = [False] * n
    best_dist = [math.inf] * n
    best_from = [-1] * n

    in_tree[0] = True
    for v in range(1, n):
        best_dist[v] = math.dist(points[0], points[v])
        best_from[v] = 0

    edges = []
    for _ in range(n - 1):
        # pick the closest vertex that is not in the tree yet
        u = -1
        for v in range(n):
            if not in_tree[v] and (u == -1 or best_dist[v] < best_dist[u]):
                u = v
        in_tree[u] = True
        edges.append((best_from[u], u, best_dist[u]))
        # u joined the tree, so it may be a closer neighbour for others
        for v in range(n):
            if not in_tree[v]:
                d = math.dist(points[u], points[v])
                if d < best_dist[v]:
                    best_dist[v] = d
                    best_from[v] = u
    return edges


def kruskal_mst(points):
    """Kruskal's algorithm with union-find. Used to cross-check Prim."""
    n = len(points)
    if n < 2:
        return []

    all_edges = []
    for i in range(n):
        for j in range(i + 1, n):
            all_edges.append((math.dist(points[i], points[j]), i, j))
    all_edges.sort()

    parent = list(range(n))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    edges = []
    for d, i, j in all_edges:
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[ri] = rj
            edges.append((i, j, d))
            if len(edges) == n - 1:
                break
    return edges


def total_length(edges):
    return sum(e[2] for e in edges)