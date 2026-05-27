import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, Edges, Grid, OrbitControls, TransformControls } from "@react-three/drei";
import { Upload, RotateCcw, Save, Plus } from "lucide-react";
import * as THREE from "three";
import Delaunator from "delaunator";
import {
  XYZPoint,
  Building,
  makeDemoTerrain,
  parseXYZCsv,
  getTerrainHeight,
  parseBuildingFootprintFile,
  createBuildingFromFootprint,
} from "./terrainModel";

type TransformMode = "translate" | "rotate";


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

    return { geo, center };
  }, [points]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry.geo} position={[geometry.center.x, geometry.center.z, geometry.center.y]}>
      <meshStandardMaterial color="#808080" transparent opacity={0.5} side={THREE.DoubleSide} flatShading />
      <Edges threshold={15} color="#000000" />
    </mesh>
  );
}

function BuildingMesh({
  building,
  isSelected,
  onSelect,
  onRegisterObject,
}: {
  building: Building;
  isSelected: boolean;
  onSelect: () => void;
  onRegisterObject: (id: string, object: THREE.Group | null) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    onRegisterObject(building.id, groupRef.current);

    return () => {
      onRegisterObject(building.id, null);
    };
  }, [building.id, onRegisterObject]);

  const centroid = useMemo(() => {
    if (building.floors && building.floors.length > 0) {
      // Use first floor for centroid calculation
      const firstFloor = building.floors[0];
      const summary = firstFloor.footprint.reduce(
        (acc, point) => {
          acc.x += point.x;
          acc.y += point.y;
          return acc;
        },
        { x: 0, y: 0 }
      );
      return { x: summary.x / firstFloor.footprint.length, y: summary.y / firstFloor.footprint.length };
    } else if (building.footprint && building.footprint.length > 0) {
      const summary = building.footprint.reduce(
        (acc, point) => {
          acc.x += point.x;
          acc.y += point.y;
          return acc;
        },
        { x: 0, y: 0 }
      );
      return { x: summary.x / building.footprint.length, y: summary.y / building.footprint.length };
    }
    return { x: 0, y: 0 };
  }, [building.footprint, building.floors]);

  const geometry = useMemo(() => {
    if (building.floors && building.floors.length > 0) {
      // Multi-floor building - use first floor for now
      const firstFloor = building.floors[0];
      if (firstFloor.footprint.length < 3) return null;

      const shape = new THREE.Shape();
      firstFloor.footprint.forEach((point, index) => {
        const x = point.x - centroid.x;
        const y = point.y - centroid.y;
        if (index === 0) {
          shape.moveTo(x, y);
        } else {
          shape.lineTo(x, y);
        }
      });
      shape.closePath();

      const extrudeSettings = { depth: building.floorHeight ?? 3, bevelEnabled: false };
      const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      geo.rotateX(Math.PI / 2);
      geo.translate(0, firstFloor.z + (building.floorHeight ?? 3) / 2, 0);
      return geo;
    } else if (building.footprint && building.footprint.length >= 3) {
      const shape = new THREE.Shape();
      building.footprint.forEach((point, index) => {
        const x = point.x - centroid.x;
        const y = point.y - centroid.y;
        if (index === 0) {
          shape.moveTo(x, y);
        } else {
          shape.lineTo(x, y);
        }
      });
      shape.closePath();

      const height = building.height ?? 10;
      const extrudeSettings = { depth: height, bevelEnabled: false };
      const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      geo.rotateX(Math.PI / 2);
      geo.translate(0, height / 2, 0);
      return geo;
    }
    return null;
  }, [building.footprint, building.floors, building.height, building.floorHeight, centroid]);

  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  if (!geometry) return null;

  return (
    <group
      ref={groupRef}
      position={[building.x, building.z, building.y]}
      rotation={[0, building.rotation, 0]}
    >
      <mesh
        geometry={geometry}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <meshStandardMaterial color={isSelected ? "#f59e0b" : building.color} transparent opacity={0.85} />
      </mesh>
      <Edges geometry={geometry} color="#000000" />
    </group>
  );
}


function Scene({
  points,
  buildings,
  selectedId,
  transformMode,
  onSelectBuilding,
  onUpdateBuilding,
}: {
  points: XYZPoint[];
  buildings: Building[];
  selectedId: string | null;
  transformMode: TransformMode;
  onSelectBuilding: (id: string | null) => void;
  onUpdateBuilding: (
    id: string,
    x: number,
    y: number,
    z: number,
    rotation: number
  ) => void;
}) {
  const orbitRef = useRef<any>(null);
  const transformRef = useRef<any>(null);

  const objectRefs = useRef<Map<string, THREE.Group>>(new Map());

  const [orbitEnabled, setOrbitEnabled] = useState(true);
  const [selectedObject, setSelectedObject] = useState<THREE.Group | null>(null);

  const selectedBuilding = buildings.find((b) => b.id === selectedId) ?? null;

  const registerObject = useCallback(
    (id: string, object: THREE.Group | null) => {
      if (object) {
        objectRefs.current.set(id, object);
      } else {
        objectRefs.current.delete(id);
      }

      if (id === selectedId) {
        setSelectedObject(object);
      }
    },
    [selectedId]
  );

  useEffect(() => {
    if (!selectedId) {
      setSelectedObject(null);
      return;
    }

    setSelectedObject(objectRefs.current.get(selectedId) ?? null);
  }, [selectedId, buildings.length]);

  useEffect(() => {
    const controls = transformRef.current;
    if (!controls) return;

    const handleDraggingChanged = (event: any) => {
      setOrbitEnabled(!event.value);
    };

    controls.addEventListener("dragging-changed", handleDraggingChanged);

    return () => {
      controls.removeEventListener("dragging-changed", handleDraggingChanged);
    };
  }, [selectedObject]);

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
          onRegisterObject={registerObject}
        />
      ))}

      {selectedObject && selectedBuilding && (
        <TransformControls
          ref={transformRef}
          object={selectedObject}
          mode={transformMode}
          onObjectChange={() => {
            if (!selectedObject || !selectedBuilding || !selectedId) return;

            const pos = selectedObject.position;
            const baseZ = pos.y - selectedBuilding.height / 2;
            const rotation = selectedObject.rotation.y;

            onUpdateBuilding(selectedId, pos.x, pos.z, baseZ, rotation);
          }}
        />
      )}

      <OrbitControls ref={orbitRef} makeDefault enabled={orbitEnabled} />
    </Canvas>
  );
}


export default function App() {
  const [points, setPoints] = useState<XYZPoint[]>(makeDemoTerrain());
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transformMode, setTransformMode] = useState<TransformMode>("translate");
  const [fileName, setFileName] = useState<string>("Demo terrain");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [buildingWarnings, setBuildingWarnings] = useState<string[]>([]);
  const [buildingHeight, setBuildingHeight] = useState<number>(3);
  const [buildingFileName, setBuildingFileName] = useState<string>("No building file loaded");

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const result = parseXYZCsv(text);

    setPoints(result.points);
    setWarnings(result.warnings);
    setFileName(file.name);
  }

  async function handleBuildingFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const result = parseBuildingFootprintFile(text);
    const newBuildings = result.footprints.map((footprint, index) =>
      createBuildingFromFootprint(
        footprint,
        points,
        footprint.height ?? buildingHeight,
        `building-${Date.now()}-${index}`
      )
    );

    if (newBuildings.length === 0) {
      setBuildingWarnings(result.warnings);
      setBuildingFileName(file.name);
      event.target.value = "";
      return;
    }

    setBuildings((prev) => [...prev, ...newBuildings]);
    setSelectedId(newBuildings[0]?.id ?? null);
    setBuildingWarnings(result.warnings);
    setBuildingFileName(file.name);
    event.target.value = "";
  }

  function resetDemo() {
    setPoints(makeDemoTerrain());
    setWarnings([]);
    setFileName("Demo terrain");
  }

  function addBuilding() {
    const id = `building-${Date.now()}`;
    const x = buildings.length * 3;
    const y = 0;
    const terrainZ = getTerrainHeight(points, x, y);
    const footprint = [
      { x: x - 1, y: y - 1 },
      { x: x + 1, y: y - 1 },
      { x: x + 1, y: y + 1 },
      { x: x - 1, y: y + 1 },
    ];

    const newBuilding: Building = {
      id,
      footprint,
      height: 3,
      x,
      y,
      z: terrainZ,
      rotation: 0,
      color: "#64748b",
    };

    setBuildings((prev) => [...prev, newBuilding]);
    setSelectedId(id);
  }

  function updateBuildingTransform(
  id: string,
  x: number,
  y: number,
  z: number,
  rotation: number
  ) {
  setBuildings((prev) =>
    prev.map((b) =>
      b.id === id
        ? {
            ...b,
            x,
            y,
            z,
            rotation,
          }
        : b
    )
  );
}

  function savePositions() {
    const data = buildings.map((b) => ({
      id: b.id,
      x: b.x,
      y: b.y,
      z: b.z,
      height: b.height,
      rotation: b.rotation,
      footprint: b.footprint,
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "building-positions.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const warningMessages = [...warnings, ...buildingWarnings];

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

        <label className="upload-box">
          <Upload size={22} />
          <span>
            <strong>Load Building Footprint</strong>
            <small>JSON or CSV file with footprint coordinates and optional height.</small>
          </span>
          <input type="file" accept=".json,.csv,.txt" onChange={handleBuildingFileChange} />
        </label>

        <div className="field-row">
          <label htmlFor="building-height">Default building height</label>
          <input
            id="building-height"
            type="number"
            min="0.5"
            step="0.25"
            value={buildingHeight}
            onChange={(event) => setBuildingHeight(Number(event.target.value))}
          />
        </div>

        <p className="footprint-note">Loaded building file: {buildingFileName}</p>

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
        <h2>Transform mode</h2>

        <div className="button-group">
          <button
            className={transformMode === "translate" ? "primary-button" : "secondary-button"}
            onClick={() => setTransformMode("translate")}
          >
            Move
          </button>

          <button
            className={transformMode === "rotate" ? "primary-button" : "secondary-button"}
            onClick={() => setTransformMode("rotate")}
          >
            Rotate
          </button>
        </div>
      </section>

        {warningMessages.length > 0 && (
          <section className="warnings">
            <h2>Import warnings</h2>
            <ul>
              {warningMessages.slice(0, 8).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
            {warningMessages.length > 8 && <p>And {warningMessages.length - 8} more warning(s).</p>}
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
        transformMode={transformMode}
        onSelectBuilding={setSelectedId}
        onUpdateBuilding={updateBuildingTransform}
      />
      </section>
    </main>
  );
}
