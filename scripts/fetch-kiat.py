#!/usr/bin/env python3
"""Fetch a specific public ALIO disclosure and extract only selected public rows.

No contact details or full disclosure HTML are saved. Python standard library.
"""
from html.parser import HTMLParser
from urllib.request import urlopen
from decimal import Decimal
from pathlib import Path
import csv
import hashlib
import json
import argparse

URL = "https://alio.go.kr/upload/disclosure/2025/04/10/2025041002977191/doc.html"

class Rows(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows, self.row, self.cell = [], None, None

    def handle_starttag(self, tag, attrs):
        if tag == "tr": self.row = []
        if tag in ("td", "th") and self.row is not None: self.cell = []

    def handle_data(self, data):
        if self.cell is not None: self.cell.append(data)

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self.cell is not None:
            self.row.append(" ".join("".join(self.cell).split()))
            self.cell = None
        if tag == "tr" and self.row is not None:
            self.rows.append(self.row)
            self.row = None

def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument("--html", type=Path, help="인증서를 검증해 내려받은 동일 URL의 HTML 사본")
    options = args.parse_args()
    raw = options.html.read_bytes() if options.html else urlopen(URL, timeout=30).read()
    text = raw.decode("utf-8")
    if "한국산업기술진흥원" not in text or "백만원" not in text:
        raise RuntimeError("Unexpected disclosure content")
    parser = Rows()
    parser.feed(text)
    names = ["출연금", "이전수입", "위탁수입", "소계"]
    selected = {}
    for row in parser.rows:
        for name in names:
            if name in row and name not in selected:
                numbers = row[-6:]
                if len(numbers) != 6 or any(not x.replace(",", "").isdigit() for x in numbers):
                    raise RuntimeError(f"Source layout changed: {row}")
                selected[name] = numbers
    if set(selected) != set(names): raise RuntimeError("Missing source rows")
    out = Path("examples")
    out.mkdir(exist_ok=True)
    # Extract 2023/2024 settlements in original million KRW; exact converted copy.
    for year, index, unit in [(2023, 3, "백만원"), (2024, 4, "백만원"), (2024, 4, "억원"), (2025, 5, "백만원")]:
        with (out / f"kiat-{year}-{unit}.csv").open("w", encoding="utf-8", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["항목", "금액"])
            for name in names:
                value = selected[name][index]
                if unit == "억원": value = format(Decimal(value.replace(",", "")) / 100, "f")
                writer.writerow([name, value])
    evidence = {
        "source_url": URL, "title": "한국산업기술진흥원 수입·지출 현황 2025년 1/4분기",
        "submitted": "2025-04-10", "base_date": "2024-12-31",
        "retrieved_date": "2026-10-21", "html_sha256": hashlib.sha256(raw).hexdigest(),
        "unit": "백만원", "columns": ["2020 결산", "2021 결산", "2022 결산", "2023 결산", "2024 결산", "2025 예산"],
        "selected_rows": selected,
        "basis_note": "당해연도는 예산(현금주의), 과년도는 회계결산(발생주의). 반올림 결과에 따라 합계간 금액 차이 발생 가능.",
        "scope": "정부지원수입의 수치가 있는 3개 항목과 소계만 발췌. 원문의 다른 결측(-) 항목을 0으로 바꾸지 않았으며, 전체 수입·지출 감사가 아님."
    }
    (out / "source.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"source_sha256": evidence["html_sha256"], "rows": len(selected)}, ensure_ascii=False))

if __name__ == "__main__":
    main()
