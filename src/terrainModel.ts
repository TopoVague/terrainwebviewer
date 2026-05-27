import * as THREE from "three";

export type XYZPoint = {
  x: number;
  y: number;
  z: number;
};

export type FootprintPoint = {
  x: number;
  y: number;
  z?: number; // Optional Z coordinate for multi-floor buildings
};

export type FloorDefinition = {
  footprint: FootprintPoint[];
  z: number; // Base Z level for this floor
};

export type BuildingFootprint = {
  id?: string;
  footprint?: FootprintPoint[]; // Single footprint (legacy or simple buildings)
  floors?: FloorDefinition[]; // Multiple floors with different footprints
  height?: number; // Total height or floor height
  floorHeight?: number; // Height of each floor (if using floors array)
  color?: string;
  splitLevel?: boolean; // Whether to split building into separate floors
};

export type Building = {
  id: string;
  footprint?: FootprintPoint[]; // Single footprint (legacy)
  floors?: FloorDefinition[]; // Multiple floors
  height: number; // Total building height
  floorHeight?: number; // Height per floor
  x: number;
  y: number;
  z: number; // Base Z level
  rotation: number;
  color: string;
};

export type ParseResult = {
  points: XYZPoint[];
  warnings: string[];
};

function splitCsvLine(line: string): string[] {
  return line.trim().split(/[,;\t]/).map((value) => value.trim());
}

function omitEmptyRows(rows: string[][]) {
  return rows.filter((row) => row.length > 0 && !row.every((cell) => cell === ""));
}

export function parseXYZCsv(csvText: string): ParseResult {
  const warnings: string[] = [];
  const rows = omitEmptyRows(
    csvText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"))
      .map(splitCsvLine)
  );

  if (rows.length === 0) {
    return { points: [], warnings: ["The file is empty or contains only comments."] };
  }

  const firstRow = rows[0].map((value) => value.toLowerCase());
  const hasHeader = firstRow.includes("x") && firstRow.includes("y") && firstRow.includes("z");

  const xIndex = hasHeader ? firstRow.indexOf("x") : 0;
  const yIndex = hasHeader ? firstRow.indexOf("y") : 1;
  const zIndex = hasHeader ? firstRow.indexOf("z") : 2;
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const points: XYZPoint[] = [];

  dataRows.forEach((row, index) => {
    const sourceLine = index + 1 + (hasHeader ? 1 : 0);
    if (row.length < 3) {
      warnings.push(`Skipped line ${sourceLine}: expected at least 3 columns.`);
      return;
    }

    const x = Number(row[xIndex]);
    const y = Number(row[yIndex]);
    const z = Number(row[zIndex]);

    if (![x, y, z].every(Number.isFinite)) {
      warnings.push(`Skipped line ${sourceLine}: x, y, or z is not a valid number.`);
      return;
    }

    points.push({ x, y, z });
  });

  return { points, warnings };
}

export function makeDemoTerrain(): XYZPoint[] {
  const points: XYZPoint[] = [];
  const size = 24;

  for (let x = -size / 2; x <= size / 2; x += 1) {
    for (let y = -size / 2; y <= size / 2; y += 1) {
      const z = Math.sin(x * 0.35) * 1.4 + Math.cos(y * 0.28) * 1.1 + Math.sin((x + y) * 0.12) * 0.8;
      points.push({ x, y, z });
    }
  }

  return points;
}

export function getTerrainHeight(points: XYZPoint[], x: number, y: number): number {
  if (points.length === 0) return 0;

  let minDist = Infinity;
  let nearestZ = 0;

  for (const p of points) {
    const dist = Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2);
    if (dist < minDist) {
      minDist = dist;
      nearestZ = p.z;
    }
  }

  return nearestZ;
}

function normalizeFootprintPoint(value: any): FootprintPoint | null {
  if (typeof value !== "object" || value === null) return null;
  const x = Number(value.x);
  const y = Number(value.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const z = value.z !== undefined ? Number(value.z) : undefined;
  return {
    x,
    y,
    z: Number.isFinite(z) ? z : undefined
  };
}

function normalizeFloorDefinition(value: any): FloorDefinition | null {
  if (typeof value !== "object" || value === null) return null;

  const footprintValue = value.footprint ?? value.points ?? value.polygon;
  if (!Array.isArray(footprintValue)) return null;

  const points = footprintValue.map(normalizeFootprintPoint).filter(Boolean) as FootprintPoint[];
  if (points.length < 3) return null;

  const z = Number(value.z ?? value.height ?? 0);
  if (!Number.isFinite(z)) return null;

  return { footprint: points, z };
}

function buildFootprintFromBuildingData(buildingData: any): BuildingFootprint | null {
  if (typeof buildingData !== "object" || buildingData === null) return null;

  // Check if this is the new format with floors
  if (buildingData.floors && Array.isArray(buildingData.floors)) {
    const floors: FloorDefinition[] = [];
    for (const floorData of buildingData.floors) {
      if (floorData.footprint && Array.isArray(floorData.footprint)) {
        const points = floorData.footprint.map(normalizeFootprintPoint).filter(Boolean) as FootprintPoint[];
        if (points.length >= 3) {
          floors.push({
            footprint: points,
            z: Number(floorData.z) || 0
          });
        }
      }
    }

    if (floors.length === 0) return null;

    return {
      id: buildingData.id || (buildingData["Building ID"]?.[0]?.ID?.toString()),
      floors,
      floorHeight: Number(buildingData.floorHeight) || 0.5,
      color: typeof buildingData.color === "string" ? buildingData.color : "#64748b",
      splitLevel: Boolean(buildingData.splitLevel)
    };
  }

  // Fallback to old format with single footprint
  const footprintValue = buildingData.footprint ?? buildingData.points ?? buildingData.polygon;
  if (!Array.isArray(footprintValue)) return null;

  const points = footprintValue.map(normalizeFootprintPoint).filter(Boolean) as FootprintPoint[];
  if (points.length < 3) return null;

  const height = Number(buildingData.height);
  const color = typeof buildingData.color === "string" ? buildingData.color : undefined;
  const id = typeof buildingData.id === "string" ? buildingData.id : buildingData["Building ID"]?.[0]?.ID?.toString();

  return {
    id,
    footprint: points,
    height: Number.isFinite(height) ? height : undefined,
    color,
  };
}

function parseBuildingFootprintCsv(csvText: string): { footprints: BuildingFootprint[]; warnings: string[] } {
  const warnings: string[] = [];
  const rows = omitEmptyRows(
    csvText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"))
      .map(splitCsvLine)
  );

  if (rows.length === 0) {
    return { footprints: [], warnings: ["The file is empty or contains only comments."] };
  }

  const firstRow = rows[0].map((value) => value.toLowerCase());
  const hasHeader = firstRow.includes("x") && firstRow.includes("y");
  const xIndex = hasHeader ? firstRow.indexOf("x") : 0;
  const yIndex = hasHeader ? firstRow.indexOf("y") : 1;
  const heightIndex = hasHeader ? firstRow.indexOf("height") : 2;
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const points: FootprintPoint[] = [];
  const heights: number[] = [];

  dataRows.forEach((row, index) => {
    const sourceLine = index + 1 + (hasHeader ? 1 : 0);
    if (row.length < 2) {
      warnings.push(`Skipped line ${sourceLine}: expected at least 2 columns for x and y.`);
      return;
    }

    const x = Number(row[xIndex]);
    const y = Number(row[yIndex]);
    const height = Number.isFinite(Number(row[heightIndex])) ? Number(row[heightIndex]) : undefined;

    if (![x, y].every(Number.isFinite)) {
      warnings.push(`Skipped line ${sourceLine}: x or y is not a valid number.`);
      return;
    }

    points.push({ x, y });
    if (height !== undefined) {
      heights.push(height);
    }
  });

  if (points.length < 3) {
    warnings.push("Building footprint CSV must contain at least 3 valid x,y vertices.");
    return { footprints: [], warnings };
  }

  if (heights.length > 0) {
    const uniqueHeights = Array.from(new Set(heights));
    if (uniqueHeights.length > 1) {
      warnings.push("Multiple height values were found; the first height value will be used.");
    }
  }

  const height = heights.length > 0 ? heights[0] : undefined;
  return { footprints: [{ footprint: points, height }], warnings };
}

export function parseBuildingFootprintFile(fileText: string): { footprints: BuildingFootprint[]; warnings: string[] } {
  const trimmed = fileText.trim();
  if (trimmed.length === 0) {
    return { footprints: [], warnings: ["The building footprint file is empty."] };
  }

  try {
    const data = JSON.parse(trimmed);
    const footprints: BuildingFootprint[] = [];
    const warnings: string[] = [];

    if (Array.isArray(data)) {
      // Handle array of buildings (new format with floors)
      for (const buildingData of data) {
        const footprint = buildFootprintFromBuildingData(buildingData);
        if (footprint) {
          footprints.push(footprint);
        } else {
          warnings.push("Skipped invalid building entry in JSON array.");
        }
      }
    } else {
      // Handle single building object
      const footprint = buildFootprintFromBuildingData(data);
      if (footprint) {
        footprints.push(footprint);
      } else {
        warnings.push("The JSON file does not contain a valid building footprint object.");
      }
    }

    if (footprints.length === 0 && warnings.length === 0) {
      warnings.push("No valid footprint data found in the JSON file.");
    }

    return { footprints, warnings };
  } catch {
    return parseBuildingFootprintCsv(fileText);
  }
}

export function getFootprintCentroid(footprint: FootprintPoint[]) {
  const centroid = footprint.reduce(
    (acc, point) => {
      acc.x += point.x;
      acc.y += point.y;
      return acc;
    },
    { x: 0, y: 0 }
  );

  return {
    x: centroid.x / footprint.length,
    y: centroid.y / footprint.length,
  };
}

export function createBuildingFromFootprint(
  footprint: BuildingFootprint,
  points: XYZPoint[],
  overrideHeight?: number,
  id?: string
): Building {
  let centroid: { x: number; y: number };
  let height: number;
  let floorHeight: number | undefined;

  if (footprint.floors && footprint.floors.length > 0) {
    // Multi-floor building - use the first floor's centroid as building position
    centroid = getFootprintCentroid(footprint.floors[0].footprint);
    floorHeight = footprint.floorHeight ?? overrideHeight ?? 3;
    // Calculate total height based on floors
    const maxFloorZ = Math.max(...footprint.floors.map(f => f.z));
    const minFloorZ = Math.min(...footprint.floors.map(f => f.z));
    height = maxFloorZ - minFloorZ + floorHeight;
  } else if (footprint.footprint && footprint.footprint.length > 0) {
    // Single footprint building
    centroid = getFootprintCentroid(footprint.footprint);
    height = overrideHeight ?? footprint.height ?? 3;
  } else {
    // Fallback
    centroid = { x: 0, y: 0 };
    height = overrideHeight ?? 3;
  }

  const z = getTerrainHeight(points, centroid.x, centroid.y);

  return {
    id: id ?? `building-${Date.now()}`,
    footprint: footprint.footprint,
    floors: footprint.floors,
    height,
    floorHeight,
    x: centroid.x,
    y: centroid.y,
    z,
    rotation: 0,
    color: footprint.color ?? "#64748b",
  };
}
