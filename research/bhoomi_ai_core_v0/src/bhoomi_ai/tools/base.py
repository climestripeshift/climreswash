"""Tool contract, fact objects and a small JSON-schema argument validator."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

UNIT_DISPLAY = {
    "mm": " mm", "percent": "%", "days": " days", "degC": " °C", "mm/decade": " mm/decade",
    "degC/decade": " °C/decade", "index_0_10": " (index, 0-10 scale)", "people": " people",
    "count": "", "year": "", "": "", "mm/yr": " mm per year", "pct_points": " percentage points",
}


@dataclass
class Fact:
    key: str
    label: str
    value: Any
    unit: str = ""
    decimals: int | None = None
    definition: str = ""
    id: str = ""

    def display(self) -> str:
        v = self.value
        if isinstance(v, bool) or v is None:
            return "not available" if v is None else str(v)
        if isinstance(v, (int, float)):
            d = self.decimals
            if d is None:
                d = 0 if float(v).is_integer() else 1
            s = f"{v:,.{d}f}" if abs(v) >= 10000 else f"{v:.{d}f}"
            return s + UNIT_DISPLAY.get(self.unit, f" {self.unit}")
        return str(v)

    def numeric(self):
        return self.value if isinstance(self.value, (int, float)) and not isinstance(self.value, bool) else None


@dataclass
class ToolResult:
    tool: str
    status: str                       # ok | stale | ambiguous | not_found | unsupported | error | control
    summary: str = ""
    facts: list[Fact] = field(default_factory=list)
    entities: dict = field(default_factory=dict)       # {"state":..., "district":..., "year":...}
    semantics: dict = field(default_factory=dict)      # data_class, temporal_class, spatial, coverage, ...
    provenance: list[dict] = field(default_factory=list)
    limitations: list[str] = field(default_factory=list)
    data: dict = field(default_factory=dict)

    def to_log(self) -> dict:
        return {"tool": self.tool, "status": self.status, "summary": self.summary,
                "facts": [{"id": f.id, "key": f.key, "label": f.label, "value": f.value, "unit": f.unit,
                           "display": f.display()} for f in self.facts],
                "entities": self.entities, "semantics": self.semantics, "provenance": self.provenance,
                "limitations": self.limitations,
                "data": {k: v for k, v in self.data.items() if k in ("metric", "order", "candidates", "months", "url")}}


@dataclass
class ToolContext:
    store: Any
    cfg: dict
    now: datetime


class Tool:
    name = ""
    description = ""
    parameters: dict = {"type": "object", "properties": {}, "required": [], "additionalProperties": False}
    semantics: dict = {}

    def spec(self) -> dict:
        return {"type": "function", "function": {"name": self.name, "description": self.description,
                                                 "parameters": self.parameters}}

    def run(self, args: dict, ctx: ToolContext) -> ToolResult:  # pragma: no cover
        raise NotImplementedError


# ---------------------------------------------------------------------------
# argument validation (JSON-schema subset: object/properties/required/type/enum/
# minimum/maximum/maxLength/items/additionalProperties=false)
# ---------------------------------------------------------------------------
def _coerce(value, typ):
    if typ == "integer":
        if isinstance(value, bool):
            return value, "boolean is not an integer"
        if isinstance(value, int):
            return value, None
        if isinstance(value, float) and value.is_integer():
            return int(value), None
        if isinstance(value, str) and re.fullmatch(r"-?\d+", value.strip()):
            return int(value.strip()), None
        return value, "must be an integer"
    if typ == "number":
        if isinstance(value, bool):
            return value, "boolean is not a number"
        if isinstance(value, (int, float)):
            return value, None
        if isinstance(value, str):
            try:
                return float(value.strip()), None
            except ValueError:
                pass
        return value, "must be a number"
    if typ == "string":
        if isinstance(value, str):
            return value, None
        return value, "must be a string"
    if typ == "boolean":
        if isinstance(value, bool):
            return value, None
        return value, "must be a boolean"
    if typ == "array":
        if isinstance(value, list):
            return value, None
        return value, "must be an array"
    return value, None


def validate_args(schema: dict, args) -> tuple[dict, list[str]]:
    """Return (clean_args, errors). Unknown properties are rejected."""
    errors: list[str] = []
    if not isinstance(args, dict):
        return {}, ["arguments must be a JSON object"]
    props = schema.get("properties", {})
    clean: dict = {}
    for k, v in args.items():
        if k not in props:
            errors.append(f"unknown argument '{k}'")
            continue
        p = props[k]
        if v is None:
            continue
        v2, err = _coerce(v, p.get("type"))
        if err:
            errors.append(f"'{k}' {err}")
            continue
        if "enum" in p and v2 not in p["enum"]:
            errors.append(f"'{k}' must be one of {p['enum']}")
            continue
        if isinstance(v2, (int, float)) and not isinstance(v2, bool):
            if "minimum" in p and v2 < p["minimum"]:
                errors.append(f"'{k}' must be >= {p['minimum']}")
                continue
            if "maximum" in p and v2 > p["maximum"]:
                errors.append(f"'{k}' must be <= {p['maximum']}")
                continue
        if isinstance(v2, str):
            v2 = v2.strip()
            if len(v2) > p.get("maxLength", 200):
                errors.append(f"'{k}' is too long")
                continue
        if p.get("type") == "array":
            it = p.get("items", {})
            out = []
            for i, el in enumerate(v2[:20]):
                e2, er = _coerce(el, it.get("type"))
                if er or ("enum" in it and e2 not in it["enum"]):
                    errors.append(f"'{k}[{i}]' invalid")
                else:
                    out.append(e2)
            v2 = out
        clean[k] = v2
    for r in schema.get("required", []):
        if r not in clean:
            errors.append(f"missing required argument '{r}'")
    return clean, errors
