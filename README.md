# NYC coordinate reprojection — CSV/XLSX utility

Converts explicitly named WGS84 (EPSG:4326) latitude/longitude columns to New York Long Island State Plane (EPSG:2263). The output appends **x_epsg2263_ft** and **y_epsg2263_ft** in US survey feet while retaining the original latitude, longitude and other attributes.

**This is an independent portfolio project, not an official NYC DOT service.** It uses the same publicly documented coordinate systems commonly used for NYC geospatial workflows.

## Run locally (PowerShell)

Requires Python 3.12 and Node.js 22.

Terminal 1:
```powershell
cd geospatial-reprojection-backend
py -m pip install -r requirements.txt
npm ci
node server.js
```
Terminal 2:
```powershell
cd client
npm ci
npm run dev
```

Open http://localhost:5173, upload a CSV or XLSX (max 10 MB) with columns latitude/longitude or lat/lon, then download the converted file. An example lives in examples/nyc_points.csv.

## Reproducible validation

```powershell
cd geospatial-reprojection-backend
py -m unittest discover -s tests -v
node --test tests/server.test.cjs
cd ../client
npm run build
```

The API uses randomized temporary directories, not the user's Downloads folder, and never trusts uploaded filenames as paths. It rejects unsupported formats, large uploads and invalid coordinates. GitHub Actions tests the projection numerically (round-trip tolerance), XLSX, a real HTTP upload/download, and the Vite/TypeScript build.

### What this version does not do

GeoJSON, DOC and WKT geometries are **not supported** in this milestone. GeoJSON normally requires WGS84 coordinates under RFC 7946, so silently writing EPSG:2263 numbers into GeoJSON would misrepresent its coordinate system. A future feature could export GeoPackage instead.
Inputs must already be EPSG:4326. This does not infer arbitrary CRS, transform non-point geometries, or provide a hosted production API. Validate the result against authoritative GIS sources before regulatory or engineering uses.
