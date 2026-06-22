"""
Multi-hazard counting and demographic aggregation — UNICEF CCRR 2026 framework.
Produces non-duplicating "people exposed to N hazards" headlines.
"""


def multi_hazard_count(hazard_scores: dict[str, float], threshold: float = 5.0) -> int:
    """Count how many hazards have scores >= threshold. CCRR default 5.0."""
    return sum(1 for v in hazard_scores.values() if v >= threshold)


def hazards_triggered(hazard_scores: dict[str, float], threshold: float = 5.0) -> list[str]:
    """Return hazard names with score >= threshold, sorted alphabetically."""
    return sorted(k for k, v in hazard_scores.items() if v >= threshold)


def multi_hazard_intensity(hazard_scores: dict[str, float]) -> float:
    """Return the maximum hazard score. 0.0 for empty input."""
    return max(hazard_scores.values()) if hazard_scores else 0.0


def people_at_exactly_k_hazards(
    hexes: list[dict],
    demographic_key: str,
    k: int,
    threshold: float = 5.0,
) -> int:
    """Sum demographic count across hexes where multi_hazard_count == k."""
    total = 0
    for h in hexes:
        if multi_hazard_count(h.get("hazards", {}), threshold) == k:
            total += h.get(demographic_key, 0)
    return round(total)


def people_at_k_or_more_hazards(
    hexes: list[dict],
    demographic_key: str,
    k: int,
    threshold: float = 5.0,
) -> int:
    """Cumulative: sum where multi_hazard_count >= k.
    Drives headlines like 'X million children exposed to 2+ hazards'."""
    total = 0
    for h in hexes:
        if multi_hazard_count(h.get("hazards", {}), threshold) >= k:
            total += h.get(demographic_key, 0)
    return round(total)


def breakdown_by_hazard_count(
    hexes: list[dict],
    demographic_key: str,
    threshold: float = 5.0,
) -> dict[int, int]:
    """Full distribution {0: count, 1: count, ...} up to max count seen.
    Sum of all values equals total demographic population."""
    counts: dict[int, int] = {}
    max_k = 0
    for h in hexes:
        k = multi_hazard_count(h.get("hazards", {}), threshold)
        counts[k] = counts.get(k, 0) + h.get(demographic_key, 0)
        if k > max_k:
            max_k = k
    return {i: round(counts.get(i, 0)) for i in range(max_k + 1)}
