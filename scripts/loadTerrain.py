#!/usr/bin/env python3
"""Load a CSV file of XYZ points and export a terrain mesh as GLB."""

import argparse
import csv
import json
from pathlib import Path

import numpy as np
import trimesh
from scipy.spatial import Delaunay


def parse_args() -> argparse.Namespace:
    repo_root = Path(__file__).resolve().parent.parent
    default_output = repo_root / "terrain.glb"

    parser = argparse.ArgumentParser(description="Create a terrain mesh from XYZ CSV data")
    parser.add_argument("csv_path", help="Path to the input CSV file")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=None,
        help="Path to the output GLB file (defaults to <csv-stem>.glb in the repo root)",
    )
    parser.add_argument(
        "--building-json",
        type=Path,
        default=None,
        help="Optional JSON file with building footprints/geometry to include in the mesh",
    )
    return parser.parse_args()


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


# Create BUILDING GEOMEtry
def load_building_geometry(json_path: Path) -> list[trimesh.Trimesh]:
    if json_path is None:
        return []

    with json_path.open("r", encoding="utf-8") as handle:
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

            base_z = float(floor.get("z", 0.0))
            height = float(floor.get("height", 1.0))
            points_2d = []
            for point in footprint:
                if isinstance(point, dict):
                    x = float(point.get("x", 0.0))
                    y = float(point.get("y", 0.0))
                    points_2d.append((x, y))

            if len(points_2d) < 3:
                continue

            # Treat this as a building footprint extruded above the terrain.
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
            prism.metadata["class"] = "building"
            geometries.append(prism)

    return geometries


##main function

def main() -> None:
    args = parse_args()
    csv_path = Path(args.csv_path).expanduser().resolve()
    output_path = args.output.expanduser().resolve() if args.output is not None else None

    if not csv_path.exists():
        raise FileNotFoundError(f"CSV file not found: {csv_path}")

    repo_root = Path(__file__).resolve().parent.parent
    if output_path is None:
        output_path = repo_root / f"{csv_path.stem}.glb"

    points = read_xyz_points(csv_path)
    terrain_mesh = build_mesh(points)
    terrain_mesh.metadata["class"] = "terrain"

    building_json = args.building_json.expanduser().resolve() if args.building_json is not None else None
    building_meshes: list[trimesh.Trimesh] = []
    if building_json is not None and building_json.exists():
        building_meshes = load_building_geometry(building_json)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    if building_meshes:
        scene = trimesh.Scene([terrain_mesh, *building_meshes])
        scene.export(str(output_path))
    else:
        terrain_mesh.export(str(output_path))

    print(f"Loaded {len(points)} points from {csv_path}")
    print(f"Exported terrain mesh to {output_path}")
    print(f"Triangles: {len(terrain_mesh.faces) + sum(len(mesh.faces) for mesh in building_meshes)}")


if __name__ == "__main__":
    main()
