"""Offline checks for WGS84 -> EPSG:2263 in CSV and XLSX files."""

import csv
import sys
import tempfile
import unittest
from pathlib import Path

from openpyxl import Workbook, load_workbook
from pyproj import Transformer

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from process_file import CoordinateError, reproject_coordinates

BACK = Transformer.from_crs("EPSG:2263", "EPSG:4326", always_xy=True)


class ProjectionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)

    def write_csv(self, body):
        source = self.directory / "in.csv"
        source.write_text(body, encoding="utf-8")
        return source

    def test_csv_writes_real_projected_fields_and_preserves_metadata(self):
        source = self.write_csv("latitude,longitude,label\n40.7484,-73.9857,ESB\n")
        output = self.directory / "out.csv"
        reproject_coordinates(source, output)
        with output.open(newline="") as data:
            rows = list(csv.DictReader(data))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["label"], "ESB")
        x, y = float(rows[0]["x_epsg2263_ft"]), float(rows[0]["y_epsg2263_ft"])
        lon, lat = BACK.transform(x, y)
        self.assertAlmostEqual(lon, -73.9857, places=5)
        self.assertAlmostEqual(lat, 40.7484, places=5)

    def test_xlsx_has_projected_columns(self):
        file = self.directory / "in.xlsx"
        book = Workbook()
        sheet = book.active
        sheet.append(["lat", "lon", "name"])
        sheet.append([40.7484, -73.9857, "Empire State"])
        book.save(file)
        output = self.directory / "out.xlsx"
        reproject_coordinates(file, output)
        values = list(load_workbook(output, read_only=True).active.values)
        self.assertEqual(values[0][-2:], ("x_epsg2263_ft", "y_epsg2263_ft"))
        self.assertEqual(values[1][2], "Empire State")

    def test_invalid_rows_fail_with_context(self):
        for bad in ("nan", "100", "missing"):
            source = self.write_csv("latitude,longitude\n" + bad + ",-73.9\n")
            with self.subTest(bad=bad), self.assertRaisesRegex(CoordinateError, "Row 2"):
                reproject_coordinates(source, self.directory / "out.csv")

    def test_rejects_unsupported_formats_and_same_output_path(self):
        source = self.write_csv("latitude,longitude\n40,-73\n")
        with self.assertRaisesRegex(CoordinateError, "different"):
            reproject_coordinates(source, source)
        with self.assertRaisesRegex(CoordinateError, "CSV and XLSX"):
            reproject_coordinates(source, self.directory / "other.geojson")

    def test_needs_explicit_column_names(self):
        source = self.write_csv("name,x,y\nA,20,40\n")
        with self.assertRaisesRegex(CoordinateError, "latitude/longitude"):
            reproject_coordinates(source, self.directory / "out.csv")


if __name__ == "__main__":
    unittest.main()
