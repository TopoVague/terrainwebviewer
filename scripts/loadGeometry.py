#!/usr/bin/env python3
"""Load a CSV file of XYZ points and export a terrain mesh as GLB."""

import argparse
import csv
import json
import re
from pathlib import Path

import numpy as np
import trimesh
from scipy.spatial import Delaunay


def parse_args() -> argparse.Namespace:
    repo_root = Path(__file__).resolve().parent.parent

    parser = argparse.ArgumentParser(description="Create a terrain mesh from XYZ CSV data")
    parser.add_argument(
        "csv_path",
        nargs="?",
        default=None,
        help="Path to the original (pre-building) terrain XYZ CSV file (optional if --site-dir is given)",
    )
    parser.add_argument(
        "--site-dir",
        type=Path,
        default=None,
        help="Directory containing all of a site's source files. Auto-discovers the original terrain "
        "CSV (*TerrainOriginal*.csv), scenario CSV/JSON pairs (*_Placed_Buildings_<name>.json matched "
        "with *_TerrainModified*_<name>.csv by shared name), a swissBUILDINGS3D GeoJSON "
        "(SwissBuildings3*.geojson), polyline CSVs (filename containing 'buildable', 'siteboundary', "
        "'boundary', or 'envelope'), and an origin.csv (x,y,z on one line, comma or space separated) "
        "if present. Unrecognized files are skipped with a log line. Explicit flags/positional args "
        "still take precedence over what's auto-discovered.",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=None,
        help="Path to the original terrain GLB file (defaults to rabbitWeb/originalTerrain.glb)",
    )
    parser.add_argument(
        "--modified-csv",
        type=Path,
        default=None,
        help="Optional path to the modified (post-building) terrain XYZ CSV file",
    )
    parser.add_argument(
        "--modified-output",
        type=Path,
        default=None,
        help="Path to the modified terrain GLB file (defaults to rabbitWeb/modifiedTerrain.glb)",
    )
    parser.add_argument(
        "--building-json",
        type=Path,
        default=None,
        help="Optional JSON file with building footprints/geometry to include in the mesh",
    )
    parser.add_argument(
        "--buildings-output",
        type=Path,
        default=None,
        help="Path to the buildings GLB file (defaults to rabbitWeb/buildings.glb)",
    )
    parser.add_argument(
        "--neighborhood-geojson",
        type=Path,
        default=None,
        help="Optional GeoJSON file with neighboring geometry to export as a separate GLB",
    )
    parser.add_argument(
        "--neighborhood-output",
        type=Path,
        default=None,
        help="Path to the neighborhood GLB file (defaults to rabbitWeb/neighborhood.glb)",
    )
    parser.add_argument(
        "--swiss-buildings-geojson",
        type=Path,
        default=None,
        help="Optional swissBUILDINGS3D-style GeoJSON file (real-world LV95 coordinates) to export as buildings",
    )
    parser.add_argument(
        "--geojson-dir",
        type=Path,
        default=None,
        help="Directory containing many swissBUILDINGS3D GeoJSON files (e.g. a shared swisstopo export "
        "folder), searched recursively. Only used with --site-dir, and only as a fallback when no "
        "swissBUILDINGS3D GeoJSON is found via --swiss-buildings-geojson or inside --site-dir itself: "
        "the file whose name ends with '<short-name>.geojson' is picked automatically, where "
        "<short-name> is the --site-dir folder name up to its first underscore "
        "(e.g. 'Weinfelden_CH440666779312' -> 'Weinfelden').",
    )
    parser.add_argument(
        "--swiss-buildings-radius-km",
        type=float,
        default=None,
        help="Only keep swiss buildings within this radius (in km) of the terrain's footprint center",
    )
    parser.add_argument(
        "--swiss-buildings-output",
        type=Path,
        default=None,
        help="Path to the swiss buildings GLB file (defaults to rabbitWeb/neighborhood.glb, which is "
        "what the viewer actually loads for the Neighborhood layer)",
    )
    parser.add_argument(
        "--origin",
        type=float,
        nargs=3,
        metavar=("X", "Y", "Z"),
        default=None,
        help="Shared translation subtracted from every input source (terrain CSV, building JSON, "
        "swiss buildings GeoJSON) so they all land in the same local space near (0, 0, 0). "
        "All three inputs must already be expressed in the same real-world coordinate system "
        "for this to line them up correctly. If omitted, uses origin.csv from --site-dir when "
        "present, otherwise (0, 0, 0).",
    )
    parser.add_argument(
        "--scenario",
        action="append",
        nargs=3,
        metavar=("NAME", "MODIFIED_CSV", "BUILDING_JSON"),
        default=None,
        help="Add a design scenario (repeat this flag once per scenario): a name, its modified-terrain "
        "XYZ CSV, and its placed-buildings JSON. Each scenario gets its own GLB pair under "
        "rabbitWeb/scenarios/, and a rabbitWeb/scenarios.json manifest is written for the viewer's "
        "tabbed UI. The shared original terrain and neighborhood are unaffected by this.",
    )
    parser.add_argument(
        "--scenarios-output-dir",
        type=Path,
        default=None,
        help="Directory for per-scenario GLBs (defaults to rabbitWeb/scenarios)",
    )
    parser.add_argument(
        "--scenarios-manifest",
        type=Path,
        default=None,
        help="Path to the scenarios manifest JSON (defaults to rabbitWeb/scenarios.json)",
    )
    parser.add_argument(
        "--polyline",
        action="append",
        nargs=2,
        metavar=("NAME", "CSV_PATH"),
        default=None,
        help="Add a polyline overlay (repeat this flag once per polyline): a name and its XYZ CSV "
        "(e.g. a site boundary or buildable envelope). Rendered as a closed loop. Each one is "
        "offset by --origin and exported to rabbitWeb/polylines/<name>.json, listed in "
        "rabbitWeb/polylines.json for the viewer.",
    )
    parser.add_argument(
        "--polylines-output-dir",
        type=Path,
        default=None,
        help="Directory for per-polyline JSON files (defaults to rabbitWeb/polylines)",
    )
    parser.add_argument(
        "--polylines-manifest",
        type=Path,
        default=None,
        help="Path to the polylines manifest JSON (defaults to rabbitWeb/polylines.json)",
    )
    return parser.parse_args()


def prettify_label(name: str) -> str:
    """Turn a scenario/polyline id into a display label, e.g. 'siteBoundary' -> 'Site Boundary'."""
    spaced = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", name)
    spaced = spaced.replace("_", " ").replace("-", " ")
    return spaced.strip().title()


ORIGIN_FILENAME = "origin.csv"
TERRAIN_ORIGINAL_PATTERN = re.compile(r"TerrainOriginal.*\.csv$", re.IGNORECASE)
TERRAIN_MODIFIED_PLAIN_PATTERN = re.compile(r"TerrainModified.*\.csv$", re.IGNORECASE)
SWISS_BUILDINGS_PATTERN = re.compile(r"^SwissBuildings3.*\.geojson$", re.IGNORECASE)
SCENARIO_JSON_PATTERN = re.compile(r"Placed_Buildings_(?P<suffix>.+)\.json$", re.IGNORECASE)
SCENARIO_JSON_PLAIN_PATTERN = re.compile(r"Placed_Buildings\.json$", re.IGNORECASE)
POLYLINE_KEYWORDS = ("buildable", "siteboundary", "boundary", "envelope")


def read_origin_file(path: Path) -> tuple[float, float, float] | None:
    """Parse an origin.csv: an optional 'x,y,z' header, then one line of 3 numbers,
    comma- or whitespace-separated (the export tool isn't always consistent)."""
    with path.open("r", encoding="utf-8-sig") as handle:
        for line in handle:
            parts = [p for p in re.split(r"[,\s]+", line.strip()) if p]
            if len(parts) < 3:
                continue
            try:
                return (float(parts[0]), float(parts[1]), float(parts[2]))
            except ValueError:
                continue
    return None


def discover_site_files(site_dir: Path) -> dict:
    """Scan a site directory and auto-match its files by naming convention.

    Returns a dict with: origin, original_terrain, swiss_buildings_geojson,
    scenarios (list of (name, modified_csv, building_json)), plain_building_json,
    plain_modified_csv, polylines (list of (name, csv_path)).
    """
    files = sorted(p for p in site_dir.iterdir() if p.is_file())
    claimed: set[Path] = set()

    origin_value = None
    origin_path = site_dir / ORIGIN_FILENAME
    if origin_path.exists():
        origin_value = read_origin_file(origin_path)
        claimed.add(origin_path)

    terrain_candidates = [p for p in files if p not in claimed and TERRAIN_ORIGINAL_PATTERN.search(p.name)]
    original_terrain_path = None
    if terrain_candidates:
        original_terrain_path = max(terrain_candidates, key=lambda p: p.stat().st_mtime)
        if len(terrain_candidates) > 1:
            others = ", ".join(p.name for p in terrain_candidates if p != original_terrain_path)
            print(
                f"Multiple original-terrain CSVs found in {site_dir}, using the most recently "
                f"modified: {original_terrain_path.name} (ignored: {others})"
            )
        claimed.add(original_terrain_path)

    swiss_candidates = [p for p in files if p not in claimed and SWISS_BUILDINGS_PATTERN.match(p.name)]
    swiss_buildings_path = None
    if swiss_candidates:
        swiss_buildings_path = swiss_candidates[0]
        if len(swiss_candidates) > 1:
            print(f"Multiple swissBUILDINGS3D GeoJSON files found in {site_dir}, using: {swiss_buildings_path.name}")
        claimed.add(swiss_buildings_path)

    scenarios: list[tuple[str, Path, Path]] = []
    json_files = [p for p in files if p not in claimed and p.suffix.lower() == ".json"]
    for json_path in json_files:
        match = SCENARIO_JSON_PATTERN.search(json_path.name)
        if not match:
            continue
        suffix = match.group("suffix")
        modified_pattern = re.compile(rf"TerrainModified.*_{re.escape(suffix)}\.csv$", re.IGNORECASE)
        modified_candidates = [p for p in files if p not in claimed and modified_pattern.search(p.name)]
        if not modified_candidates:
            print(f"Skipping scenario '{suffix}': no matching TerrainModified CSV for {json_path.name}")
            continue
        modified_path = modified_candidates[0]
        scenarios.append((suffix, modified_path, json_path))
        claimed.add(json_path)
        claimed.add(modified_path)

    plain_json_candidates = [
        p for p in files if p not in claimed and p.suffix.lower() == ".json" and SCENARIO_JSON_PLAIN_PATTERN.search(p.name)
    ]
    plain_building_json = plain_json_candidates[0] if plain_json_candidates else None
    plain_modified_csv = None
    if plain_building_json is not None:
        claimed.add(plain_building_json)
        plain_modified_candidates = [
            p for p in files if p not in claimed and TERRAIN_MODIFIED_PLAIN_PATTERN.search(p.name)
        ]
        if plain_modified_candidates:
            plain_modified_csv = plain_modified_candidates[0]
            claimed.add(plain_modified_csv)

    polylines: list[tuple[str, Path]] = []
    for path in files:
        if path in claimed or path.suffix.lower() != ".csv":
            continue
        stem_lower = path.stem.lower()
        if not any(keyword in stem_lower for keyword in POLYLINE_KEYWORDS):
            continue
        polyline_id = path.stem.rsplit("_", 1)[-1]
        polylines.append((polyline_id, path))
        claimed.add(path)

    for path in files:
        if path not in claimed:
            print(f"Skipping unrecognized file in {site_dir}: {path.name}")

    return {
        "origin": origin_value,
        "original_terrain": original_terrain_path,
        "swiss_buildings_geojson": swiss_buildings_path,
        "scenarios": scenarios,
        "plain_building_json": plain_building_json,
        "plain_modified_csv": plain_modified_csv,
        "polylines": polylines,
    }


def site_short_name(site_dir: Path) -> str:
    """The --site-dir folder name up to its first underscore, e.g. 'Weinfelden_CH440666779312' -> 'Weinfelden'."""
    return site_dir.name.split("_", 1)[0]


def find_geojson_by_site_name(geojson_dir: Path, short_name: str) -> Path | None:
    """Search geojson_dir (recursively) for a GeoJSON whose filename ends with '<short_name>.geojson'."""
    suffix = f"{short_name}.geojson".lower()
    candidates = [p for p in geojson_dir.rglob("*.geojson") if p.name.lower().endswith(suffix)]
    if not candidates:
        return None

    chosen = max(candidates, key=lambda p: p.stat().st_mtime)
    if len(candidates) > 1:
        others = ", ".join(str(p) for p in candidates if p != chosen)
        print(
            f"Multiple GeoJSON files in {geojson_dir} match '*{suffix}', using the most recently "
            f"modified: {chosen} (ignored: {others})"
        )
    return chosen


def read_xyz_points(csv_path: Path) -> list[tuple[float, float, float]]:
    points: list[tuple[float, float, float]] = []

    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.reader(handle)
        for row_index, row in enumerate(reader, start=1):
            if not row or not any(cell.strip() for cell in row):
                continue

            cells = [cell.strip() for cell in row]
            if row_index == 1 and set(cell.lower() for cell in cells[:3]).issuperset({"x", "y", "z"}):
                continue

            if len(cells) < 3:
                continue

            try:
                x = float(cells[0])
                y = float(cells[1])
                z = float(cells[2])
            except ValueError:
                continue

            points.append((x, y, z))

    if len(points) < 3:
        raise ValueError(f"Not enough valid XYZ points found in {csv_path}")

    return points


def build_mesh(points: list[tuple[float, float, float]]) -> trimesh.Trimesh:
    vertices = np.asarray(points, dtype=np.float64)

    # The CSV stores the terrain as (x, y, z). The first two values define the horizontal plane,
    # and the third value is the elevation. The viewer expects the mesh to be built with the
    # elevation on Z, so we keep the coordinates in that order.
    xy = vertices[:, :2]
    triangulation = Delaunay(xy)
    faces = triangulation.simplices.astype(np.int32)

    # Create a mesh whose vertices are laid out as (x, z, y) so the height is on Z.
    # This matches how the React/Three viewer constructs the terrain mesh.
    corrected_vertices = np.column_stack((vertices[:, 0], vertices[:, 2], vertices[:, 1]))

    mesh = trimesh.Trimesh(vertices=corrected_vertices, faces=faces, process=False)
    mesh.remove_unreferenced_vertices()
    return mesh


def build_ground_from_lowest_points(
    meshes: list[trimesh.Trimesh],
    metadata_class: str = "terrain",
) -> trimesh.Trimesh | None:
    """Build a coarse ground mesh from each building's lowest vertex.

    Buildings loaded without an accompanying terrain (e.g. the neighborhood swiss
    buildings) otherwise appear to float; using each building's own lowest point as a
    ground sample and triangulating across them gives a rough floor to sit them on.
    """
    points: list[tuple[float, float, float]] = []
    for mesh in meshes:
        if len(mesh.vertices) == 0:
            continue
        lowest_index = int(np.argmin(mesh.vertices[:, 1]))
        x, height, y = mesh.vertices[lowest_index]
        points.append((x, y, height))

    if len(points) < 3:
        return None

    vertices = np.asarray(points, dtype=np.float64)
    try:
        triangulation = Delaunay(vertices[:, :2])
    except Exception:
        return None
    faces = triangulation.simplices.astype(np.int32)

    corrected_vertices = np.column_stack((vertices[:, 0], vertices[:, 2], vertices[:, 1]))
    mesh = trimesh.Trimesh(vertices=corrected_vertices, faces=faces, process=False)
    mesh.remove_unreferenced_vertices()
    mesh.metadata["class"] = metadata_class
    return mesh


def build_prism_from_polygon(
    points_2d: list[tuple[float, float]],
    base_z: float = 0.0,
    height: float = 3.0,
    metadata_class: str = "feature",
) -> trimesh.Trimesh:
    polygon = np.asarray(points_2d, dtype=np.float64)
    bottom_vertices = np.column_stack((polygon[:, 0], np.full(len(polygon), base_z), polygon[:, 1]))
    top_vertices = np.column_stack((polygon[:, 0], np.full(len(polygon), base_z + height), polygon[:, 1]))
    vertices = np.vstack((bottom_vertices, top_vertices))

    faces: list[list[int]] = []
    for i in range(1, len(polygon) - 1):
        faces.append([0, i + 1, i])
    for i in range(1, len(polygon) - 1):
        faces.append([len(polygon), len(polygon) + i, len(polygon) + i + 1])
    for i in range(len(polygon)):
        j = (i + 1) % len(polygon)
        faces.append([i, j, len(polygon) + j])
        faces.append([i, len(polygon) + j, len(polygon) + i])

    prism = trimesh.Trimesh(vertices=vertices, faces=np.asarray(faces, dtype=np.int32), process=False)
    prism.remove_unreferenced_vertices()
    prism.metadata["class"] = metadata_class
    return prism


# Create BUILDING GEOMEtry
def load_building_geometry(
    json_path: Path,
    offset: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> list[trimesh.Trimesh]:
    if json_path is None or not json_path.exists():
        return []

    offset_x, offset_y, offset_z = offset

    with json_path.open("r", encoding="utf-8-sig") as handle:
        data = json.load(handle)

    geometries: list[trimesh.Trimesh] = []

    if isinstance(data, dict):
        features = data.get("features", [])
        data = features

    if not isinstance(data, list):
        return geometries

    for entry in data:
        if not isinstance(entry, dict):
            continue

        floors = entry.get("floors") or []
        if not isinstance(floors, list) or not floors:
            continue

        for floor in floors:
            footprint = floor.get("footprint") or []
            if not isinstance(footprint, list) or len(footprint) < 3:
                continue

            base_z = float(floor.get("z", 0.0)) - offset_z
            height = float(floor.get("height", 1.0))
            points_2d = []
            for point in footprint:
                if isinstance(point, dict):
                    x = float(point.get("x", 0.0)) - offset_x
                    y = float(point.get("y", 0.0)) - offset_y
                    points_2d.append((x, y))

            if len(points_2d) < 3:
                continue

            prism = build_prism_from_polygon(points_2d, base_z=base_z, height=height, metadata_class="building")
            geometries.append(prism)

    return geometries


def load_geojson_geometry(json_path: Path, metadata_class: str = "neighborhood") -> list[trimesh.Trimesh]:
    if json_path is None or not json_path.exists():
        return []

    with json_path.open("r", encoding="utf-8-sig") as handle:
        data = json.load(handle)

    geometries: list[trimesh.Trimesh] = []

    if isinstance(data, dict):
        features = data.get("features", [])
        if isinstance(features, list):
            data = features
        else:
            data = [data]

    if not isinstance(data, list):
        return geometries

    for entry in data:
        if not isinstance(entry, dict):
            continue

        geometry = entry.get("geometry") or {}
        properties = entry.get("properties") or {}

        geom_type = geometry.get("type")
        coordinates = geometry.get("coordinates") or []
        if geom_type == "Polygon":
            polygons = [coordinates]
        elif geom_type == "MultiPolygon":
            polygons = coordinates
        else:
            continue

        for polygon_coordinates in polygons:
            if not polygon_coordinates:
                continue

            outer_ring = polygon_coordinates[0] if isinstance(polygon_coordinates, list) and polygon_coordinates else []
            if not isinstance(outer_ring, list) or len(outer_ring) < 3:
                continue

            points_2d = []
            for point in outer_ring:
                if isinstance(point, (list, tuple)) and len(point) >= 2:
                    points_2d.append((float(point[0]), float(point[1])))

            if len(points_2d) < 3:
                continue

            base_z = float(properties.get("base_z", properties.get("z", 0.0)))
            height = float(properties.get("height", properties.get("extrusion_height", 3.0)))
            prism = build_prism_from_polygon(points_2d, base_z=base_z, height=height, metadata_class=metadata_class)
            geometries.append(prism)

    return geometries


def build_mesh_from_facets(
    facets: list[list[tuple[float, float, float]]],
    offset: tuple[float, float, float] = (0.0, 0.0, 0.0),
    metadata_class: str = "building",
) -> trimesh.Trimesh | None:
    """Build a mesh from planar 3D facets (each a closed ring of >= 3 real-world points)."""
    offset_x, offset_y, offset_z = offset

    vertices: list[tuple[float, float, float]] = []
    faces: list[list[int]] = []

    for facet in facets:
        ring = facet[:-1] if len(facet) > 1 and facet[0] == facet[-1] else facet
        if len(ring) < 3:
            continue

        base_index = len(vertices)
        for x, y, z in ring:
            # Swiss LV95 vertices are (easting, northing, elevation); the viewer expects
            # elevation on Z, matching the (x, z, y) layout used elsewhere in this file.
            vertices.append((x - offset_x, z - offset_z, y - offset_y))

        for i in range(1, len(ring) - 1):
            faces.append([base_index, base_index + i, base_index + i + 1])

    if not faces:
        return None

    mesh = trimesh.Trimesh(
        vertices=np.asarray(vertices, dtype=np.float64),
        faces=np.asarray(faces, dtype=np.int32),
        process=False,
    )
    mesh.remove_unreferenced_vertices()
    mesh.metadata["class"] = metadata_class
    return mesh


def load_swiss_buildings_geojson(
    json_path: Path,
    offset: tuple[float, float, float] = (0.0, 0.0, 0.0),
    metadata_class: str = "building",
    center: tuple[float, float] | None = None,
    radius: float | None = None,
) -> list[trimesh.Trimesh]:
    """Parse a swissBUILDINGS3D-style GeoJSON (e.g. SwissBuildings3_*.geojson).

    Unlike load_geojson_geometry, each feature's MultiPolygon is already a set of
    real-world 3D roof/wall facets (LV95 easting/northing plus true elevation) rather
    than a 2D footprint to extrude, so the facets are triangulated and used directly.

    If both center and radius are given (in the same local space produced by offset),
    buildings whose centroid falls outside that radius are skipped.
    """
    if json_path is None or not json_path.exists():
        return []

    with json_path.open("r", encoding="utf-8-sig") as handle:
        data = json.load(handle)

    features = data.get("features", []) if isinstance(data, dict) else data
    if not isinstance(features, list):
        return []

    geometries: list[trimesh.Trimesh] = []

    for feature in features:
        if not isinstance(feature, dict):
            continue

        geometry = feature.get("geometry") or {}
        if geometry.get("type") != "MultiPolygon":
            continue

        facets: list[list[tuple[float, float, float]]] = []
        for polygon in geometry.get("coordinates") or []:
            if not polygon:
                continue

            outer_ring = polygon[0]
            if not isinstance(outer_ring, list) or len(outer_ring) < 3:
                continue

            facets.append([(float(p[0]), float(p[1]), float(p[2]) if len(p) > 2 else 0.0) for p in outer_ring])

        mesh = build_mesh_from_facets(facets, offset=offset, metadata_class=metadata_class)
        if mesh is None:
            continue

        if center is not None and radius is not None:
            # Vertices are laid out (x, elevation, y), so the horizontal plane is columns 0 and 2.
            centroid_x, centroid_y = mesh.vertices[:, 0].mean(), mesh.vertices[:, 2].mean()
            distance = ((centroid_x - center[0]) ** 2 + (centroid_y - center[1]) ** 2) ** 0.5
            if distance > radius:
                continue

        uuid = (feature.get("properties") or {}).get("UUID")
        if uuid:
            mesh.metadata["uuid"] = uuid

        geometries.append(mesh)

    return geometries


##main function

def main() -> None:
    args = parse_args()
    repo_root = Path(__file__).resolve().parent.parent

    site_dir = args.site_dir.expanduser().resolve() if args.site_dir is not None else None
    discovered = discover_site_files(site_dir) if site_dir is not None else None

    if args.csv_path is not None:
        csv_path = Path(args.csv_path).expanduser().resolve()
    elif discovered is not None and discovered["original_terrain"] is not None:
        csv_path = discovered["original_terrain"]
    else:
        raise SystemExit("No original terrain CSV given: pass it as a positional argument or via --site-dir.")

    terrain_output_path = (
        args.output.expanduser().resolve()
        if args.output is not None
        else repo_root / "rabbitWeb" / "originalTerrain.glb"
    )
    modified_terrain_output_path = (
        args.modified_output.expanduser().resolve()
        if args.modified_output is not None
        else repo_root / "rabbitWeb" / "modifiedTerrain.glb"
    )
    buildings_output_path = (
        args.buildings_output.expanduser().resolve()
        if args.buildings_output is not None
        else repo_root / "rabbitWeb" / "buildings.glb"
    )
    neighborhood_output_path = (
        args.neighborhood_output.expanduser().resolve()
        if args.neighborhood_output is not None
        else repo_root / "rabbitWeb" / "neighborhood.glb"
    )
    swiss_buildings_output_path = (
        args.swiss_buildings_output.expanduser().resolve()
        if args.swiss_buildings_output is not None
        else repo_root / "rabbitWeb" / "neighborhood.glb"
    )

    if not csv_path.exists():
        raise FileNotFoundError(f"CSV file not found: {csv_path}")

    if args.origin is not None:
        origin = tuple(args.origin)
    elif discovered is not None and discovered["origin"] is not None:
        origin = discovered["origin"]
        print(f"Using origin from {site_dir / ORIGIN_FILENAME}: {origin}")
    else:
        origin = (0.0, 0.0, 0.0)
    origin_x, origin_y, origin_z = origin

    points = read_xyz_points(csv_path)
    points = [(x - origin_x, y - origin_y, z - origin_z) for x, y, z in points]
    terrain_mesh = build_mesh(points)
    terrain_mesh.metadata["class"] = "originalTerrain"

    # Center of the original terrain's footprint, in the same local space as `points`, used to
    # scope down the (much larger) swiss buildings dataset to what's actually nearby.
    terrain_xs = [p[0] for p in points]
    terrain_ys = [p[1] for p in points]
    terrain_center = ((min(terrain_xs) + max(terrain_xs)) / 2, (min(terrain_ys) + max(terrain_ys)) / 2)

    if args.modified_csv is not None:
        modified_csv_path = args.modified_csv.expanduser().resolve()
    elif discovered is not None and discovered["plain_modified_csv"] is not None:
        modified_csv_path = discovered["plain_modified_csv"]
    else:
        modified_csv_path = None
    modified_terrain_mesh: trimesh.Trimesh | None = None
    if modified_csv_path is not None:
        if not modified_csv_path.exists():
            raise FileNotFoundError(f"Modified CSV file not found: {modified_csv_path}")
        modified_points = read_xyz_points(modified_csv_path)
        modified_points = [(x - origin_x, y - origin_y, z - origin_z) for x, y, z in modified_points]
        modified_terrain_mesh = build_mesh(modified_points)
        modified_terrain_mesh.metadata["class"] = "modifiedTerrain"

    if args.building_json is not None:
        building_json = args.building_json.expanduser().resolve()
    elif discovered is not None and discovered["plain_building_json"] is not None:
        building_json = discovered["plain_building_json"]
    else:
        building_json = None
    building_meshes: list[trimesh.Trimesh] = []
    if building_json is not None and building_json.exists():
        building_meshes = load_building_geometry(building_json, offset=origin)

    neighborhood_geojson = (
        args.neighborhood_geojson.expanduser().resolve()
        if args.neighborhood_geojson is not None
        else None
    )
    neighborhood_meshes: list[trimesh.Trimesh] = []
    if neighborhood_geojson is not None and neighborhood_geojson.exists():
        neighborhood_meshes = load_geojson_geometry(neighborhood_geojson, metadata_class="neighborhood")

    if args.swiss_buildings_geojson is not None:
        swiss_buildings_geojson = args.swiss_buildings_geojson.expanduser().resolve()
    elif discovered is not None and discovered["swiss_buildings_geojson"] is not None:
        swiss_buildings_geojson = discovered["swiss_buildings_geojson"]
    elif args.geojson_dir is not None and site_dir is not None:
        geojson_dir = args.geojson_dir.expanduser().resolve()
        short_name = site_short_name(site_dir)
        swiss_buildings_geojson = find_geojson_by_site_name(geojson_dir, short_name)
        if swiss_buildings_geojson is not None:
            print(f"Using {swiss_buildings_geojson} for neighborhood (matched site name '{short_name}')")
        else:
            print(f"No GeoJSON found in {geojson_dir} matching '*{short_name}.geojson'")
    else:
        swiss_buildings_geojson = None
        if args.geojson_dir is not None and site_dir is None:
            print("Ignoring --geojson-dir: it only applies when --site-dir is also given.")
    swiss_buildings_radius = (
        args.swiss_buildings_radius_km * 1000.0 if args.swiss_buildings_radius_km is not None else None
    )
    swiss_buildings_meshes: list[trimesh.Trimesh] = []
    if swiss_buildings_geojson is not None and swiss_buildings_geojson.exists():
        swiss_buildings_meshes = load_swiss_buildings_geojson(
            swiss_buildings_geojson,
            offset=origin,
            center=terrain_center,
            radius=swiss_buildings_radius,
            metadata_class="neighborhood",
        )

        neighborhood_ground_mesh = build_ground_from_lowest_points(
            swiss_buildings_meshes, metadata_class="neighborhoodTerrain"
        )
        if neighborhood_ground_mesh is not None:
            swiss_buildings_meshes = [neighborhood_ground_mesh, *swiss_buildings_meshes]

    scenarios_output_dir = (
        args.scenarios_output_dir.expanduser().resolve()
        if args.scenarios_output_dir is not None
        else repo_root / "rabbitWeb" / "scenarios"
    )
    scenarios_manifest_path = (
        args.scenarios_manifest.expanduser().resolve()
        if args.scenarios_manifest is not None
        else repo_root / "rabbitWeb" / "scenarios.json"
    )

    def relative_to_rabbitweb(path: Path) -> str:
        try:
            return str(path.relative_to(repo_root / "rabbitWeb")).replace("\\", "/")
        except ValueError:
            return str(path)

    scenario_specs: list[tuple[str, Path, Path]] = list(discovered["scenarios"]) if discovered is not None else []
    if args.scenario:
        explicit_names = {name for name, _, _ in args.scenario}
        scenario_specs = [spec for spec in scenario_specs if spec[0] not in explicit_names]
        scenario_specs.extend(
            (name, Path(scenario_csv).expanduser().resolve(), Path(scenario_json).expanduser().resolve())
            for name, scenario_csv, scenario_json in args.scenario
        )

    if scenario_specs:
        scenarios_output_dir.mkdir(parents=True, exist_ok=True)
        scenario_entries = []

        for name, scenario_csv_path, scenario_json_path in scenario_specs:
            if not scenario_csv_path.exists():
                raise FileNotFoundError(f"Scenario '{name}' CSV not found: {scenario_csv_path}")

            scenario_points = read_xyz_points(scenario_csv_path)
            scenario_points = [(x - origin_x, y - origin_y, z - origin_z) for x, y, z in scenario_points]
            scenario_terrain_mesh = build_mesh(scenario_points)
            scenario_terrain_mesh.metadata["class"] = "modifiedTerrain"

            scenario_building_meshes: list[trimesh.Trimesh] = []
            if scenario_json_path.exists():
                scenario_building_meshes = load_building_geometry(scenario_json_path, offset=origin)

            scenario_terrain_glb_path = scenarios_output_dir / f"{name}-modifiedTerrain.glb"
            scenario_buildings_glb_path = scenarios_output_dir / f"{name}-buildings.glb"

            scenario_terrain_mesh.export(str(scenario_terrain_glb_path))

            if scenario_building_meshes:
                trimesh.Scene(scenario_building_meshes).export(str(scenario_buildings_glb_path))
            else:
                scenario_buildings_glb_path.unlink(missing_ok=True)

            scenario_entries.append(
                {
                    "id": name,
                    "label": prettify_label(name),
                    "modifiedTerrain": relative_to_rabbitweb(scenario_terrain_glb_path),
                    "buildings": relative_to_rabbitweb(scenario_buildings_glb_path)
                    if scenario_building_meshes
                    else None,
                }
            )

            print(
                f"Exported scenario '{name}': {scenario_terrain_glb_path.name}"
                + (f", {scenario_buildings_glb_path.name}" if scenario_building_meshes else " (no buildings)")
            )

        scenarios_manifest_path.parent.mkdir(parents=True, exist_ok=True)
        with scenarios_manifest_path.open("w", encoding="utf-8") as handle:
            json.dump({"scenarios": scenario_entries}, handle, indent=2)
        print(f"Wrote scenarios manifest to {scenarios_manifest_path}")

    polylines_output_dir = (
        args.polylines_output_dir.expanduser().resolve()
        if args.polylines_output_dir is not None
        else repo_root / "rabbitWeb" / "polylines"
    )
    polylines_manifest_path = (
        args.polylines_manifest.expanduser().resolve()
        if args.polylines_manifest is not None
        else repo_root / "rabbitWeb" / "polylines.json"
    )

    polyline_specs: list[tuple[str, Path]] = list(discovered["polylines"]) if discovered is not None else []
    if args.polyline:
        explicit_names = {name for name, _ in args.polyline}
        polyline_specs = [spec for spec in polyline_specs if spec[0] not in explicit_names]
        polyline_specs.extend(
            (name, Path(polyline_csv).expanduser().resolve()) for name, polyline_csv in args.polyline
        )

    if polyline_specs:
        polylines_output_dir.mkdir(parents=True, exist_ok=True)
        polyline_entries = []

        for name, polyline_csv_path in polyline_specs:
            if not polyline_csv_path.exists():
                raise FileNotFoundError(f"Polyline '{name}' CSV not found: {polyline_csv_path}")

            polyline_points = read_xyz_points(polyline_csv_path)
            # Reorder to the viewer's (x, elevation, y) convention, same as every mesh export.
            polyline_points = [
                (x - origin_x, z - origin_z, y - origin_y) for x, y, z in polyline_points
            ]

            polyline_json_path = polylines_output_dir / f"{name}.json"
            with polyline_json_path.open("w", encoding="utf-8") as handle:
                json.dump({"points": polyline_points}, handle)

            polyline_entries.append(
                {
                    "id": name,
                    "label": prettify_label(name),
                    "url": relative_to_rabbitweb(polyline_json_path),
                }
            )
            print(f"Exported polyline '{name}' ({len(polyline_points)} points) to {polyline_json_path}")

        polylines_manifest_path.parent.mkdir(parents=True, exist_ok=True)
        with polylines_manifest_path.open("w", encoding="utf-8") as handle:
            json.dump({"polylines": polyline_entries}, handle, indent=2)
        print(f"Wrote polylines manifest to {polylines_manifest_path}")

    terrain_output_path.parent.mkdir(parents=True, exist_ok=True)
    modified_terrain_output_path.parent.mkdir(parents=True, exist_ok=True)
    buildings_output_path.parent.mkdir(parents=True, exist_ok=True)
    neighborhood_output_path.parent.mkdir(parents=True, exist_ok=True)
    swiss_buildings_output_path.parent.mkdir(parents=True, exist_ok=True)

    terrain_mesh.export(str(terrain_output_path))
    print(f"Exported original terrain mesh to {terrain_output_path}")

    if modified_terrain_mesh is not None:
        modified_terrain_mesh.export(str(modified_terrain_output_path))
        print(f"Exported modified terrain mesh to {modified_terrain_output_path}")
    else:
        modified_terrain_output_path.unlink(missing_ok=True)

    if building_meshes:
        building_scene = trimesh.Scene(building_meshes)
        building_scene.export(str(buildings_output_path))
        print(f"Exported {len(building_meshes)} building meshes to {buildings_output_path}")
    else:
        buildings_output_path.unlink(missing_ok=True)

    if neighborhood_meshes:
        neighborhood_scene = trimesh.Scene(neighborhood_meshes)
        neighborhood_scene.export(str(neighborhood_output_path))
        print(f"Exported {len(neighborhood_meshes)} neighborhood meshes to {neighborhood_output_path}")
    else:
        neighborhood_output_path.unlink(missing_ok=True)

    if swiss_buildings_meshes:
        swiss_buildings_scene = trimesh.Scene(swiss_buildings_meshes)
        swiss_buildings_scene.export(str(swiss_buildings_output_path))
        print(f"Exported {len(swiss_buildings_meshes)} swiss building meshes to {swiss_buildings_output_path}")
    else:
        swiss_buildings_output_path.unlink(missing_ok=True)

    print(f"Loaded {len(points)} points from {csv_path}")
    total_triangles = len(terrain_mesh.faces) + sum(len(mesh.faces) for mesh in building_meshes)
    if modified_terrain_mesh is not None:
        total_triangles += len(modified_terrain_mesh.faces)
    print(f"Triangles: {total_triangles}")


if __name__ == "__main__":
    main()
