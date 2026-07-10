"""Detect duplicate or overlapping thin black border vectors in a PDF.

Usage: python scripts/audit-pdf-borders.py path/to/document.pdf
Requires PyMuPDF (`pip install pymupdf`).
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from pathlib import Path

import fitz


Segment = tuple[str, float, float, float]


def thin_black_segments(page: fitz.Page) -> list[Segment]:
    segments: list[Segment] = []

    for drawing in page.get_drawings():
        stroke = drawing.get("color")
        fill = drawing.get("fill")
        width = float(drawing.get("width") or 0)
        black_stroke = stroke is None or max(stroke) <= 0.2
        black_fill = fill is not None and max(fill) <= 0.2

        for item in drawing.get("items", []):
            if item[0] == "re" and black_fill:
                rectangle = item[1]
                if rectangle.width > 2 and rectangle.height <= 1.5:
                    segments.append(
                        (
                            "h",
                            round((rectangle.y0 + rectangle.y1) / 2, 2),
                            round(rectangle.x0, 2),
                            round(rectangle.x1, 2),
                        )
                    )
                elif rectangle.height > 2 and rectangle.width <= 1.5:
                    segments.append(
                        (
                            "v",
                            round((rectangle.x0 + rectangle.x1) / 2, 2),
                            round(rectangle.y0, 2),
                            round(rectangle.y1, 2),
                        )
                    )
                continue

            if item[0] != "l" or not black_stroke or not (0.5 <= width <= 1.5):
                continue

            first, second = item[1], item[2]
            if abs(first.y - second.y) < 0.02:
                start, end = sorted((first.x, second.x))
                segments.append(("h", round(first.y, 2), round(start, 2), round(end, 2)))
            elif abs(first.x - second.x) < 0.02:
                start, end = sorted((first.y, second.y))
                segments.append(("v", round(first.x, 2), round(start, 2), round(end, 2)))

    return segments


def audit_pdf(path: Path) -> tuple[int, int, int, int]:
    document = fitz.open(path)
    total_segments = 0
    duplicate_segments = 0
    overlapping_segments = 0

    for page in document:
        segments = thin_black_segments(page)
        total_segments += len(segments)
        duplicate_segments += sum(
            count - 1 for count in Counter(segments).values() if count > 1
        )

        grouped: dict[tuple[str, float], list[tuple[float, float]]] = defaultdict(list)
        for orientation, axis, start, end in segments:
            grouped[(orientation, axis)].append((start, end))

        for intervals in grouped.values():
            intervals.sort()
            furthest_end = -1.0
            for start, end in intervals:
                if start < furthest_end - 0.2:
                    overlapping_segments += 1
                furthest_end = max(furthest_end, end)

    return document.page_count, total_segments, duplicate_segments, overlapping_segments


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    args = parser.parse_args()

    pages, segments, duplicates, overlaps = audit_pdf(args.pdf)
    print(
        f"pages={pages} segments={segments} "
        f"duplicate_segments={duplicates} overlapping_segments={overlaps}"
    )
    if duplicates or overlaps:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
