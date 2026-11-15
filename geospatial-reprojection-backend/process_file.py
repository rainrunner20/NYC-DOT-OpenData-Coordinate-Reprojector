"""Transform explicitly named WGS84 lat/lon columns into EPSG:2263 coordinates.

CSV and XLSX are supported. Other geometry and file types require a separate
GIS format-aware workflow and are intentionally rejected here.
"""
import argparse
import csv
import math
from pathlib import Path

from pyproj import Transformer

LAT_NAMES = {"latitude", "lat"}
LON_NAMES = {"longitude", "lon", "long"}
X_COL = "x_epsg2263_ft"
Y_COL = "y_epsg2263_ft"
TRANSFORM = Transformer.from_crs("EPSG:4326", "EPSG:2263", always_xy=True)


class CoordinateError(ValueError):
    pass


def columns_for(headers):
    if not headers or len(headers) != len(set(headers)):
        raise CoordinateError("Missing or duplicate column headers.")
    normalized = {str(name).strip().casefold(): name for name in headers if name is not None}
    latitude = next((normalized[name] for name in ("latitude", "lat") if name in normalized), None)
    longitude = next((normalized[name] for name in ("longitude", "lon", "long") if name in normalized), None)
    if latitude is None or longitude is None:
        raise CoordinateError("Expected latitude/longitude or lat/lon columns.")
    if X_COL in headers or Y_COL in headers:
        raise CoordinateError("Output coordinate columns already exist.")
    return latitude, longitude


def project(latitude, longitude, line):
    try:
        lat = float(latitude)
        lon = float(longitude)
    except (TypeError, ValueError) as exc:
        raise CoordinateError(f"Row {line}: latitude/longitude must be numeric.") from exc
    if not math.isfinite(lat) or not math.isfinite(lon) or not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise CoordinateError(f"Row {line}: coordinates are out of range.")
    x, y = TRANSFORM.transform(lon, lat)
    if not math.isfinite(x) or not math.isfinite(y):
        raise CoordinateError(f"Row {line}: coordinate transformation failed.")
    return round(x, 3), round(y, 3)


def convert_csv(source, destination):
    with source.open("r", encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        headers = reader.fieldnames or []
        lat_key, lon_key = columns_for(headers)
        with destination.open("w", encoding="utf-8", newline="") as out:
            writer = csv.DictWriter(out, fieldnames=[*headers, X_COL, Y_COL])
            writer.writeheader()
            rows = 0
            for rows, record in enumerate(reader, start=1):
                if None in record:  # extra columns beyond the original header
                    raise CoordinateError(f"Row {rows + 1}: extra fields found.")
                x, y = project(record.get(lat_key), record.get(lon_key), rows + 1)
                writer.writerow({**record, X_COL: x, Y_COL: y})
            if rows == 0:
                raise CoordinateError("The input file contains no coordinate rows.")


def convert_xlsx(source, destination):
    from openpyxl import load_workbook
    book = load_workbook(source)
    sheet = book.active
    headers = [cell.value for cell in sheet[1]]
    lat_key, lon_key = columns_for(headers)
    lat_index, lon_index = headers.index(lat_key) + 1, headers.index(lon_key) + 1
    x_index, y_index = len(headers) + 1, len(headers) + 2
    sheet.cell(1, x_index, X_COL)
    sheet.cell(1, y_index, Y_COL)
    if sheet.max_row < 2:
        raise CoordinateError("The workbook has no coordinate rows.")
    for row_index in range(2, sheet.max_row + 1):
        x, y = project(
            sheet.cell(row_index, lat_index).value,
            sheet.cell(row_index, lon_index).value, row_index
        )
        sheet.cell(row_index, x_index, x)
        sheet.cell(row_index, y_index, y)
    book.save(destination)


def reproject_coordinates(input_path, output_path):
    source, destination = Path(input_path), Path(output_path)
    if source.resolve() == destination.resolve():
        raise CoordinateError("Input and output paths must be different.")
    suffix = source.suffix.lower()
    if suffix not in {".csv", ".xlsx"} or destination.suffix.lower() != suffix:
        raise CoordinateError("Only matching CSV and XLSX input/output pairs are supported.")
    if suffix == ".csv":
        convert_csv(source, destination)
    else:
        convert_xlsx(source, destination)
    return destination


def main():
    parser = argparse.ArgumentParser(description="Append EPSG:2263 projected coordinates")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    try:
        reproject_coordinates(args.input, args.output)
    except (OSError, CoordinateError, ValueError) as exc:
        parser.exit(2, f"Reprojection failed: {exc}\n")


if __name__ == "__main__":
    main()
