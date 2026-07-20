## Generating the `.glb` files

Everything `rabbitViewer.js` loads is produced by `scripts/loadGeometry.py` from a set of source files. 
The source files for the buildings and terrain are now generated in Rhino/ghx 
The source file from the neighborhood is generated from the geojson files that can be found in the folder : Rabbit Configurator - Documents\02 Input\_BUND Swiss Buildings 3.0\

None of the generated files (`.glb`, `.json` manifests) are meant to be hand-edited or treated as source of truth — regenerate them whenever the source files change.

### Quick start: `--site-dir` (recommended)

Put all of a site's source files in one folder (e.g. `sample-data/Weinfelden_CH440666779312/`) and point `--site-dir` at it — the script auto-discovers everything by filename, no need to spell out every path:

```
python scripts/loadGeometry.py --site-dir sample-data/Weinfelden_CH440666779312 --geojson-dir "C:\Users\panz\Rabbit Real Estate\Rabbit Configurator - Documents\02 Input\_BUND Swiss Buildings 3.0" --swiss-buildings-radius-km 0.5
```

That single line replaces a ~10-flag manual command. What it auto-discovers inside the folder:
| Discovers | By matching | Multiple/none found |
|---|---|---|
| Original terrain | filename contains `TerrainOriginal` | picks the most recently modified, logs the others it ignored |
| A design scenario per pair | `*_Placed_Buildings_<name>.json` matched with `*_TerrainModified*_<name>.csv` sharing the same `<name>` | any JSON with no matching CSV is skipped with a log line |
| A plain (non-scenario) building | `*_Placed_Buildings.json` with no `_<name>` suffix, matched with `*_TerrainModified*.csv` | only used if no suffixed scenario files exist |
| Neighborhood | `SwissBuildings3*.geojson` inside the site folder itself | if none found there, falls back to `--geojson-dir` (see below); logs if more than one local match |
| Polylines | any `.csv` whose filename contains `buildable`, `siteboundary`, `boundary`, or `envelope` (case-insensitive) — id is the text after the last `_` | none required |
| Origin | `origin.csv` in the folder — one line of 3 numbers, comma- or space-separated, optional `x,y,z` header | falls back to `(0, 0, 0)` if absent |

Any file that doesn't match one of these is skipped with a `Skipping unrecognized file: ...` log line — nothing breaks, it's just left out (this is how `..._Max_heightPlane.csv` is currently handled, since nothing visualizes it yet).

Every explicit flag still works alongside `--site-dir` and takes precedence over what's auto-discovered — e.g. `--origin ...` overrides `origin.csv`, an explicit `--scenario name ...` overrides/replaces the auto-discovered scenario with that same name, and you can add extra `--scenario`/`--polyline` entries on top of the discovered ones. Only `--swiss-buildings-radius-km` still needs to be passed explicitly (it's a content decision, not something to infer from filenames).

#### `--geojson-dir`: pulling the neighborhood from the shared swisstopo export

Rather than copying a ~80MB swissBUILDINGS3D file into every site folder, point `--geojson-dir` at the shared export folder (e.g. the `_BUND Swiss Buildings 3.0` folder) and it's picked automatically: the site folder name up to its first underscore (`Weinfelden_CH440666779312` → `Weinfelden`) is matched against filenames ending in `<that>.geojson` (recursively), e.g. `SwissBuildings3_4946_Weinfelden.geojson`. It's only a fallback — a `SwissBuildings3*.geojson` placed directly in the site folder, or an explicit `--swiss-buildings-geojson`, both take precedence over it. Multiple matches use the most recently modified and log the rest.

Notes:
- Scenario/polyline `NAME` (whether auto-discovered or passed via `--scenario`/`--polyline`) becomes both the id (used in filenames/URLs) and, after prettifying (`best_revenues` → "Best Revenues", `siteBoundary` → "Site Boundary"), the tab/legend label.
- Polylines are always rendered as closed loops, even if the CSV doesn't repeat its first point.
- If a scenario's buildings JSON has no valid floors, or there's no swiss buildings GeoJSON / plain building JSON at all, the corresponding output GLB is deleted rather than left stale.
- `--swiss-buildings-output` defaults to `rabbitWeb/neighborhood.glb` (what the viewer actually loads).

#### Pasting multi-line commands into your terminal

Examples in this doc that span multiple lines use a trailing `\` — that's bash/zsh syntax (Git Bash, WSL, macOS, Linux) and won't work as-is in **Windows PowerShell** or `cmd.exe`. Pick whichever matches your terminal:

- **Git Bash / WSL / macOS / Linux**: paste as shown, `\` works.
- **Windows PowerShell**: replace every trailing `\` with a backtick `` ` ``.
- **Any shell, always safe**: drop the line breaks and put it all on one line — no continuation character needed.

### Shared layers

These are always loaded, regardless of scenarios:
| File | Layer | Default visible |
|---|---|---|
| `originalTerrain.glb` | Original Terrain | no |
| `neighborhood.glb` | Neighborhood (swiss buildings + auto ground) | no |
| `polylines.json` + `polylines/*.json` | Polyline overlays (site boundary, buildable envelope, ...) | yes, each individually |

### Design scenarios (tabbed view)
If `rabbitWeb/scenarios.json` exists, the viewer builds a tab bar (top-left) from it and loads the first scenario's modified terrain + buildings by default. Clicking a tab disposes the previous scenario's meshes and loads the new one — only one scenario's terrain/buildings is in memory at a time. If `scenarios.json` is missing (404), the viewer falls back to loading fixed `modifiedTerrain.glb` / `buildings.glb` files instead — useful for a single-scenario site with no tabs.

| File | Default visible |
|---|---|
| `scenarios/<name>-modifiedTerrain.glb` | yes (first scenario only) |
| `scenarios/<name>-buildings.glb` | yes (first scenario only) |

### Coordinate system
Every real-world-coordinate input (terrain CSVs, buildings JSON, swiss buildings GeoJSON, polyline CSVs) must be expressed in the **same coordinate system** (e.g. Swiss LV95 / EPSG:2056) for anything to line up. A single origin `X Y Z` is subtracted from all of them so they land together in local space near `(0, 0, 0)` — with `--site-dir`, put this in `origin.csv` inside the folder; otherwise pass `--origin X Y Z` explicitly.

**What it actually does:** it's the real-world point that becomes local `(0, 0, 0)`. Every coordinate is transformed as `new = old − origin`. It doesn't have to be an actual data point — any fixed reference works — but you must reuse the *same* `X Y Z` across every file for a given site, since that's what keeps them aligned to each other and not just individually close to zero.

Two ways to pick a value:
- **Bounding-box center of the original terrain CSV** — average the min/max of each of x, y, z across the file.
- **A known site base-point**, if your Rhino/GH workflow already has one — more robust than recomputing from the bounding box, since it stays consistent across re-exports even if the terrain's extent shifts slightly.

### Source files

| File | Format | Produces |
|---|---|---|
| Original terrain CSV | `x,y,z` rows, one XYZ point per line, optional header | `originalTerrain.glb` |
| Scenario modified-terrain CSV | same `x,y,z` format, the "after" state of the terrain for that design alternative | `scenarios/<name>-modifiedTerrain.glb` |
| Scenario placed-buildings JSON | list of buildings, each with `floors: [{footprint: [{x,y}, ...], z, height}]` | `scenarios/<name>-buildings.glb` |
| swissBUILDINGS3D GeoJSON | swisstopo `SwissBuildings3_*.geojson` — real-world LV95 coordinates, each feature a `MultiPolygon` of 3D roof/wall facets | `neighborhood.glb` (buildings + an auto-generated ground mesh) |
| Polyline CSV | `x,y,z` rows forming an ordered outline (e.g. site boundary, buildable envelope) | `polylines/<name>.json` |
| `origin.csv` | one line of 3 numbers (comma or space separated), optional `x,y,z` header | used as `--origin` when not passed explicitly |

### Legacy: simple flat-polygon neighborhood
There's also a `--neighborhood-geojson`/`--neighborhood-output` pair for a simpler, generic GeoJSON of flat 2D polygons with `base_z`/`height` properties (see `sample-data/neighborhood-sample.geojson`). It's a separate, lighter-weight path from the swissBUILDINGS3D pipeline above, predating `--site-dir` auto-discovery (which doesn't look for this format) — don't use both `--neighborhood-geojson` and `--swiss-buildings-geojson` at once, since they default to the same output filename (`neighborhood.glb`).
