import { ChangeEvent, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, Grid, OrbitControls, TransformControls } from "@react-three/drei";
import { Upload, RotateCcw, Save, Plus } from "lucide-react";
import * as THREE from "three";
import Delaunator from "delaunator";

type XYZPoint = {
  x: number;
  y: number;
  z: number;
};

type Building = {
  id: string;
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  rotation: number;
};

type ParseResult = {
  points: XYZPoint[];
  warnings: string[];
};

function splitCsvLine(line: string): string[] {
  return line.trim().split(/[,;\t]/).map((value) => value.trim());
}

function parseXYZCsv(csvText: string): ParseResult {
  const warnings: string[] = [];
  const rows = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map(splitCsvLine);

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

function makeDemoTerrain(): XYZPoint[] {
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

// Find the nearest terrain point and return its Z height
function getTerrainHeight(points: XYZPoint[], x: number, y: number): number {
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

function TerrainMesh({ points }: { points: XYZPoint[] }) {
  const geometry = useMemo(() => {
    if (points.length < 3) return null;

    const box = new THREE.Box3();
    points.forEach((p) => box.expandByPoint(new THREE.Vector3(p.x, p.y, p.z)));
    const center = new THREE.Vector3();
    box.getCenter(center);

    const points2d = points.map((p) => [p.x - center.x, p.y - center.y] as [number, number]);
    const delaunay = Delaunator.from(points2d);
    const triangles = delaunay.triangles;

    const vertices: number[] = [];
    const normals: number[] = [];

    for (let i = 0; i < triangles.length; i += 3) {
      const i0 = triangles[i];
      const i1 = triangles[i + 1];
      const i2 = triangles[i + 2];

      const p0 = points[i0];
      const p1 = points[i1];
      const p2 = points[i2];

      vertices.push(
        p0.x - center.x, p0.z - center.z, p0.y - center.y,
        p1.x - center.x, p1.z - center.z, p1.y - center.y,
        p2.x - center.x, p2.z - center.z, p2.y - center.y
      );

      const v1 = new THREE.Vector3(p1.x - p0.x, p1.z - p0.z, p1.y - p0.y);
      const v2 = new THREE.Vector3(p2.x - p0.x, p2.z - p0.z, p2.y - p0.y);
      const normal = new THREE.Vector3().crossVectors(v1, v2).normalize();

      for (let j = 0; j < 3; j++) {
        normals.push(normal.x, normal.z, normal.y);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));

    return geo;
  }, [points]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#5baa6e" side={THREE.DoubleSide} flatShading />
    </mesh>
  );
}

function BuildingMesh({
  building,
  isSelected,
  onSelect,
  onTransform,
  setOrbitEnabled, // ADD
}: {
  building: Building;
  isSelected: boolean;
  onSelect: () => void;
  onTransform: (id: string, x: number, y: number, z: number) => void;
  setOrbitEnabled: (enabled: boolean) => void; // ADD
}) {
  const groupRef = useRef<THREE.Group>(null);

  return (
    <group
      ref={groupRef}
      position={[building.x, building.z + building.height / 2, building.y]}
      rotation={[0, building.rotation, 0]}
    >
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <boxGeometry args={[building.width, building.height, building.depth]} />
        <meshStandardMaterial color={isSelected ? "#f59e0b" : "#64748b"} />
      </mesh>
      {isSelected && groupRef.current && (
        <TransformControls
          object={groupRef.current}
          mode="translate"
          onObjectChange={() => {
            if (groupRef.current) {
              const pos = groupRef.current.position;
              const baseZ = pos.y - building.height / 2;
              onTransform(building.id, pos.x, pos.z, baseZ);
            }
          }}
        />
      )}
    </group>
  );
}

function Scene({
  points,
  buildings,
  selectedId,
  onSelectBuilding,
  onUpdateBuilding,
}: {
  points: XYZPoint[];
  buildings: Building[];
  selectedId: string | null;
  onSelectBuilding: (id: string | null) => void;
  onUpdateBuilding: (id: string, x: number, y: number, z: number) => void;
}) {
  const orbitRef = useRef<any>(null);

  const setOrbitEnabled = (enabled: boolean) => {
    if (orbitRef.current) {
      orbitRef.current.enabled = enabled;
    }
  };

  return (
    <Canvas
      camera={{ position: [18, 14, 18], fov: 50 }}
      onPointerMissed={() => onSelectBuilding(null)}
    >
      <color attach="background" args={["#0f172a"]} />
      <ambientLight intensity={0.85} />
      <directionalLight position={[12, 18, 10]} intensity={1.4} />

      <Grid
        args={[40, 40]}
        position={[0, -0.02, 0]}
        cellSize={1}
        cellThickness={0.5}
        sectionSize={5}
        sectionThickness={1}
        fadeDistance={60}
        fadeStrength={1}
      />

      <axesHelper args={[6]} />

      <Bounds fit clip observe margin={1.25}>
        <TerrainMesh points={points} />
      </Bounds>

      {buildings.map((building) => (
        <BuildingMesh
          key={building.id}
          building={building}
          isSelected={selectedId === building.id}
          onSelect={() => onSelectBuilding(building.id)}
          onTransform={onUpdateBuilding}
          setOrbitEnabled={setOrbitEnabled} // PASS DOWN
        />
      ))}

      <OrbitControls ref={orbitRef} makeDefault />
    </Canvas>
  );
}


export default function App() {
  const [points, setPoints] = useState<XYZPoint[]>(makeDemoTerrain());
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("Demo terrain");
  const [warnings, setWarnings] = useState<string[]>([]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const result = parseXYZCsv(text);

    setPoints(result.points);
    setWarnings(result.warnings);
    setFileName(file.name);
  }

  function resetDemo() {
    setPoints(makeDemoTerrain());
    setWarnings([]);
    setFileName("Demo terrain");
  }

  function addBuilding() {
    // Find terrain height at origin
    const terrainZ = getTerrainHeight(points, 0, 0);
    
    const newBuilding: Building = {
      id: `building-${Date.now()}`,
      x: 0,
      y: 0,
      z: terrainZ,
      width: 2,
      depth: 2,
      height: 3,
      rotation: 0,
    };
    setBuildings([...buildings, newBuilding]);
    setSelectedId(newBuilding.id);
  }

  function updateBuildingPosition(id: string, x: number, y: number, z: number) {
  // Snap base to terrain height
  const terrainZ = getTerrainHeight(points, x, y);
  const snappedZ = Math.max(z, terrainZ);

  // Use functional update to avoid stale closures during rapid drags
  setBuildings(prev =>
    prev.map(b =>
      b.id === id ? { ...b, x, y, z: snappedZ } : b
    )
  );
}

  function savePositions() {
    const data = buildings.map((b) => ({
      id: b.id,
      x: b.x,
      y: b.y,
      z: b.z,
      rotation: b.rotation,
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "building-positions.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">3D Terrain Configurator ve 0.1</p>
          <h1>RARE Topo</h1>
          <p className="intro">
            This is a simple 3D terrain viewer for visualizing topological data. The points should be in <code>x,y,z</code> coordinates.
          </p>
        </div>

        <label className="upload-box">
          <Upload size={22} />
          <span>
            <strong>Load Terrain CSV</strong>
            <small>Header row may be x,y,z. Semicolon and tab also work.</small>
          </span>
          <input type="file" accept=".csv,.txt" onChange={handleFileChange} />
        </label>

        <button className="secondary-button" onClick={resetDemo}>
          <RotateCcw size={16} />
          Reset demo terrain
        </button>

        <div className="button-group">
          <button className="primary-button" onClick={addBuilding}>
            <Plus size={16} />
            Add Building
          </button>
          <button className="primary-button" onClick={savePositions} disabled={buildings.length === 0}>
            <Save size={16} />
            Save Positions
          </button>
        </div>

        <section className="stats">
          <h2>Current data</h2>
          <dl>
            <div>
              <dt>File</dt>
              <dd>{fileName}</dd>
            </div>
            <div>
              <dt>Terrain Points</dt>
              <dd>{points.length.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Buildings</dt>
              <dd>{buildings.length}</dd>
            </div>
          </dl>
        </section>

        {warnings.length > 0 && (
          <section className="warnings">
            <h2>Import warnings</h2>
            <ul>
              {warnings.slice(0, 8).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
            {warnings.length > 8 && <p>And {warnings.length - 8} more warning(s).</p>}
          </section>
        )}

        <section className="notes">
          <h2>Expected CSV format</h2>
          <pre>{`x,y,z
0,0,0
1,0,0.4
2,0,0.7`}</pre>
        </section>
      </aside>

      <section className="viewport">
        <Scene
          points={points}
          buildings={buildings}
          selectedId={selectedId}
          onSelectBuilding={setSelectedId}
          onUpdateBuilding={updateBuildingPosition}
        />
      </section>
    </main>
  );
}
