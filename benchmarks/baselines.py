"""Run unmodified public APIs on single-row pairs; keep inputs as strings.

Normalized values in cases.json were authored independently, not produced by
won-diff. This control demonstrates the role of domain-specific preprocessing.
"""
import io
import csv
import json
import sys
import importlib.metadata
import pandas as pd
from csv_diff import load_csv, compare
from tabulardelta import PandasComparator

cases = json.load(open(sys.argv[1], encoding="utf-8"))
result = {"versions": {p: importlib.metadata.version(p) for p in ["csv-diff", "tabulardelta", "pandas", "numpy"]}, "raw": {}, "normalized": {}}
for mode in ["raw", "normalized"]:
    result[mode] = {"csv-diff": {}, "tabulardelta": {}}
    for item in cases:
        a = item["beforeWon" if mode == "normalized" else "before"]
        b = item["afterWon" if mode == "normalized" else "after"]
        def as_csv(value):
            stream = io.StringIO()
            writer = csv.writer(stream)
            writer.writerows([["id", "amount"], [item["id"], value]])
            stream.seek(0)
            return load_csv(stream, key="id")
        diff = compare(as_csv(a), as_csv(b))
        result[mode]["csv-diff"][item["id"]] = bool(diff["changed"])
        da = pd.DataFrame([{"id": item["id"], "amount": a}], dtype=str)
        db = pd.DataFrame([{"id": item["id"], "amount": b}], dtype=str)
        delta = PandasComparator(join_columns=["id"], check_row_order=False).compare(da, db)
        if delta.errors:
            raise RuntimeError(delta.errors)
        result[mode]["tabulardelta"][item["id"]] = bool(len(delta.rows.unequal))
print(json.dumps(result, ensure_ascii=False, indent=2))
