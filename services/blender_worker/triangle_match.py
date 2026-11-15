"""Oriented triangle comparison for export verification (not photo fidelity)."""
from collections import defaultdict, deque
from itertools import product
from math import floor, isfinite


def match_triangles(source, candidate, tolerance=1e-6):
    if not isfinite(tolerance) or tolerance <= 0:
        raise ValueError("Tolerance must be positive and finite")
    def checked(triangles):
        result = []
        for tri in triangles:
            if len(tri) != 3 or any(len(row) != 3 for row in tri):
                raise ValueError("Expected triangles of 3D vertices")
            values = tuple(tuple(float(v) for v in row) for row in tri)
            if not all(isfinite(v) for row in values for v in row):
                raise ValueError("Nonfinite coordinate")
            result.append(values)
        if not result:
            raise ValueError("Empty geometry is not a successful export")
        return result
    source, candidate = checked(source), checked(candidate)
    if len(source) != len(candidate):
        return {"geometry_equal": False, "reason": "triangle_count", "tolerance": tolerance}

    def cell(tri):
        return tuple(floor(sum(row[k] / 3 for row in tri) / tolerance) for k in range(3))
    buckets = defaultdict(list)
    for j, tri in enumerate(candidate):
        buckets[cell(tri)].append(j)
    adjacency = []
    distances = {}
    comparisons = 0
    for i, tri in enumerate(source):
        center = cell(tri)
        edges = []
        for offset in product((-1, 0, 1), repeat=3):
            for j in buckets.get(tuple(a + b for a, b in zip(center, offset)), ()):
                comparisons += 1
                if comparisons > 2_000_000:
                    raise ValueError("Ambiguous geometry exceeds comparison limit")
                distance = min(max(abs(tri[v][k] - candidate[j][(v + shift) % 3][k])
                                   for v in range(3) for k in range(3)) for shift in range(3))
                if distance <= tolerance:
                    edges.append(j)
                    distances[i, j] = distance
        adjacency.append(sorted(edges, key=lambda j: distances[i, j]))

    # Augmenting paths enforce one-to-one coverage, including duplicate triangles.
    # A nearest-only greedy match can reject valid close or repeated geometry.
    owners, assignments = {}, {}
    for start in range(len(source)):
        queue, seen, previous = deque([start]), {start}, {}
        free = None
        while queue and free is None:
            i = queue.popleft()
            for j in adjacency[i]:
                if j in previous:
                    continue
                previous[j] = i
                if j not in owners:
                    free = j
                    break
                if owners[j] not in seen:
                    seen.add(owners[j])
                    queue.append(owners[j])
        if free is None:
            return {"geometry_equal": False, "reason": "oriented_vertex_mismatch", "tolerance": tolerance}
        while free is not None:
            i = previous[free]
            previous_assignment = assignments.get(i)
            owners[free], assignments[i] = i, free
            free = previous_assignment
    return {"geometry_equal": True, "matched_triangles": len(owners),
            "max_absolute_vertex_error": max(distances[i, j] for j, i in owners.items()),
            "tolerance": tolerance}
