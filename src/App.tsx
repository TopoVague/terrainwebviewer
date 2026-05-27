import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, Edges, Grid, OrbitControls, TransformControls } from "@react-three/drei";
import { Upload, RotateCcw, Save, Plus, Trash2 } from "lucide-react";
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
  BuildingFootprint,
} from "./terrainModel";

type TransformMode = "translate" | "rotate";

function TerrainMesh({ points, isOriginal = false, smoothMesh = false, contourOnly = false }: { points: XYZPoint[], isOriginal?: boolean, smoothMesh?: boolean, contourOnly?: boolean }) {
  const geometry = useMemo(() => {
    if (points.length < 3) return null;

    const points2d = points.map((p) => [p.x, p.y] as [number, number]);
    const delaunay = Delaunator.from(points2d);
    const triangles = delaunay.triangles;

    // Create smoothed points if needed
    let workingPoints = points;
    if (smoothMesh) {
      workingPoints = points.map(p => ({ ...p })); // Copy array

      // Apply Laplacian smoothing iterations
      const smoothingIterations = 3;
      for (let iter = 0; iter < smoothingIterations; iter++) {
        const neighbors: number[][] = Array(workingPoints.length).fill(null).map(() => []);

        // Build neighbor adjacency list from triangles
        for (let i = 0; i < triangles.length; i += 3) {
          const i0 = triangles[i];
          const i1 = triangles[i + 1];
          const i2 = triangles[i + 2];

          if (!neighbors[i0].includes(i1)) neighbors[i0].push(i1);
          if (!neighbors[i0].includes(i2)) neighbors[i0].push(i2);
          if (!neighbors[i1].includes(i0)) neighbors[i1].push(i0);
          if (!neighbors[i1].includes(i2)) neighbors[i1].push(i2);
          if (!neighbors[i2].includes(i0)) neighbors[i2].push(i0);
          if (!neighbors[i2].includes(i1)) neighbors[i2].push(i1);
        }

        // Apply smoothing based on neighbor average
        const smoothed = workingPoints.map((p, idx) => {
          const n = neighbors[idx];
          if (n.length === 0) return p;

          const avgZ = n.reduce((sum, nIdx) => sum + workingPoints[nIdx].z, 0) / n.length;
          return {
            x: p.x,
            y: p.y,
            z: p.z * 0.7 + avgZ * 0.3, // Blend with neighbor average
          };
        });
        workingPoints = smoothed;
      }
    }

    const vertices: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];

    for (let i = 0; i < triangles.length; i += 3) {
      const i0 = triangles[i];
      const i1 = triangles[i + 1];
      const i2 = triangles[i + 2];

      const p0 = workingPoints[i0];
      const p1 = workingPoints[i1];
      const p2 = workingPoints[i2];

      vertices.push(
        p0.x, p0.z, p0.y,
        p1.x, p1.z, p1.y,
        p2.x, p2.z, p2.y
      );

      const v1 = new THREE.Vector3(p1.x - p0.x, p1.z - p0.z, p1.y - p0.y);
      const v2 = new THREE.Vector3(p2.x - p0.x, p2.z - p0.z, p2.y - p0.y);
      const normal = new THREE.Vector3().crossVectors(v1, v2).normalize();

      // Determine flatness: normal.y close to 1 means flat
      const flatness = Math.abs(normal.y);
      const isFlat = flatness > 0.1;
      // Different colors for original vs modified
      const color = isOriginal
        ? (isFlat ? [0.2, 0.8, 0.9] : [0.1, 0.1, 0.3]) // Cyan for flat, dark blue for steep
        : (isFlat ? [0.2, 0.8, 0.2] : [0.1, 0.1, 0.1]); // Green for flat, grey for steep

      for (let j = 0; j < 3; j++) {
        normals.push(normal.x, normal.z, normal.y);
        colors.push(color[0], color[1], color[2]);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

    // Generate contour lines every 1m
    const contourLines: number[] = [];
    const minZ = Math.min(...points.map(p => p.z));
    const maxZ = Math.max(...points.map(p => p.z));

    for (let contourZ = Math.ceil(minZ); contourZ <= maxZ; contourZ += 1) {
      for (let i = 0; i < triangles.length; i += 3) {
        const i0 = triangles[i];
        const i1 = triangles[i + 1];
        const i2 = triangles[i + 2];

        const p0 = points[i0];
        const p1 = points[i1];
        const p2 = points[i2];

        const z0 = p0.z;
        const z1 = p1.z;
        const z2 = p2.z;

        // Find edges that cross the contour
        const crossings: THREE.Vector3[] = [];

        // Check edge 0-1
        if ((z0 <= contourZ && z1 >= contourZ) || (z0 >= contourZ && z1 <= contourZ)) {
          const t = (contourZ - z0) / (z1 - z0);
          const x = p0.x + t * (p1.x - p0.x);
          const y = p0.y + t * (p1.y - p0.y);
          crossings.push(new THREE.Vector3(x, contourZ, y));
        }

        // Check edge 1-2
        if ((z1 <= contourZ && z2 >= contourZ) || (z1 >= contourZ && z2 <= contourZ)) {
          const t = (contourZ - z1) / (z2 - z1);
          const x = p1.x + t * (p2.x - p1.x);
          const y = p1.y + t * (p2.y - p1.y);
          crossings.push(new THREE.Vector3(x, contourZ, y));
        }

        // Check edge 2-0
        if ((z2 <= contourZ && z0 >= contourZ) || (z2 >= contourZ && z0 <= contourZ)) {
          const t = (contourZ - z2) / (z0 - z2);
          const x = p2.x + t * (p0.x - p2.x);
          const y = p2.y + t * (p0.y - p2.y);
          crossings.push(new THREE.Vector3(x, contourZ, y));
        }

        // Add line segments
        if (crossings.length === 2) {
          contourLines.push(crossings[0].x, crossings[0].y, crossings[0].z);
          contourLines.push(crossings[1].x, crossings[1].y, crossings[1].z);
        }
      }
    }

    return { geo, contourLines };
  }, [points, isOriginal, smoothMesh]);

  if (!geometry) return null;

  const contourGeometry = new THREE.BufferGeometry();
  contourGeometry.setAttribute("position", new THREE.Float32BufferAttribute(geometry.contourLines, 3));

  return (
    <group position={[0, 0, 0]}>
      {!contourOnly && (
        <mesh geometry={geometry.geo}>
          <meshStandardMaterial vertexColors transparent opacity={0.5} side={THREE.DoubleSide} flatShading />
          <Edges threshold={15} color="#000000" />
        </mesh>
      )}
      <lineSegments geometry={contourGeometry}>
        <lineBasicMaterial color="#404040" linewidth={1} />
      </lineSegments>
    </group>
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

  // Calculate centroid for positioning
  const centroid = useMemo(() => {
    if (building.floors && building.floors.length > 0) {
      // Use first floor's centroid
      const summary = building.floors[0].footprint.reduce(
        (acc, point) => {
          acc.x += point.x;
          acc.y += point.y;
          return acc;
        },
        { x: 0, y: 0 }
      );
      return { x: summary.x / building.floors[0].footprint.length, y: summary.y / building.floors[0].footprint.length };
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

  // Create geometries for floors
  const floorGeometries = useMemo(() => {
    const geometries: THREE.BufferGeometry[] = [];

    if (building.floors && building.floors.length > 0) {
      // Multi-floor building
      const floorHeight = building.floorHeight ?? 3;

      building.floors.forEach((floor) => {
        if (floor.footprint.length < 3) return;

        const shape = new THREE.Shape();
        floor.footprint.forEach((point, index) => {
          const x = point.x - centroid.x;
          const y = point.y - centroid.y;
          if (index === 0) {
            shape.moveTo(x, y);
          } else {
            shape.lineTo(x, y);
          }
        });
        shape.closePath();

        const extrudeSettings = { depth: floorHeight, bevelEnabled: false };
        const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geo.rotateX(Math.PI / 2);
        geo.translate(0, floor.z + floorHeight / 2, 0);
        geometries.push(geo);
      });
    } else if (building.footprint && building.footprint.length >= 3) {
      // Single footprint building
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

      const extrudeSettings = { depth: building.height, bevelEnabled: false };
      const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      geo.rotateX(Math.PI / 2);
      geo.translate(0, building.height / 2, 0);
      geometries.push(geo);
    }

    return geometries;
  }, [building, centroid]);

  useEffect(() => {
    return () => {
      floorGeometries.forEach(geo => geo.dispose());
    };
  }, [floorGeometries]);

  if (floorGeometries.length === 0) return null;

  return (
    <group
      ref={groupRef}
      position={[building.x, building.z, building.y]}
      rotation={[0, building.rotation, 0]}
    >
      {floorGeometries.map((geometry, index) => (
        <group key={index}>
          <mesh
            geometry={geometry}
            onClick={(e: any) => {
              e.stopPropagation();
              onSelect();
            }}
          >
            <meshStandardMaterial color={isSelected ? "#f59e0b" : building.color} transparent opacity={0.85} />
          </mesh>
          <Edges geometry={geometry} color="#000000" />
        </group>
      ))}
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
  cameraPosition,
  isOriginal = false,
  smoothMesh = false,
  contourOnly = false,
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
  cameraPosition: [number, number, number];
  isOriginal?: boolean;
  smoothMesh?: boolean;
  contourOnly?: boolean;
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
      camera={{ position: cameraPosition, fov: 50 }}
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
        <TerrainMesh points={points} isOriginal={isOriginal} smoothMesh={smoothMesh} contourOnly={contourOnly} />
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
  const [cameraPosition, setCameraPosition] = useState<[number, number, number]>([18, 14, 18]);

  const [originalPoints, setOriginalPoints] = useState<XYZPoint[] | null>(null);
  const [modifiedPoints, setModifiedPoints] = useState<XYZPoint[] | null>(null);
  const [isShowingModified, setIsShowingModified] = useState<boolean>(true);
  const [originalFileName, setOriginalFileName] = useState<string>("No original terrain loaded");
  const [modifiedFileName, setModifiedFileName] = useState<string>("No modified terrain loaded");
  const [originalWarnings, setOriginalWarnings] = useState<string[]>([]);
  const [modifiedWarnings, setModifiedWarnings] = useState<string[]>([]);
  const [smoothMesh, setSmoothMesh] = useState<boolean>(false);
  const [contourOnly, setContourOnly] = useState<boolean>(false);

  function updateCameraPosition(points: XYZPoint[]) {
    if (points.length === 0) return;

    const box = new THREE.Box3();
    points.forEach((p) => box.expandByPoint(new THREE.Vector3(p.x, p.y, p.z)));
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 1.5 + 10; // Adjust factor as needed

    setCameraPosition([center.x, center.y + distance, center.z]);
  }

  useEffect(() => {
    updateCameraPosition(points);
  }, []); // Only on mount

  useEffect(() => {
    updateDisplay();
  }, [isShowingModified]);

  function updateDisplay() {
    const currentPoints = isShowingModified ? modifiedPoints : originalPoints;
    const currentFileName = isShowingModified ? modifiedFileName : originalFileName;
    const currentWarnings = isShowingModified ? modifiedWarnings : originalWarnings;

    if (currentPoints) {
      setPoints(currentPoints);
      setFileName(currentFileName);
      setWarnings(currentWarnings);
      updateCameraPosition(currentPoints);
    }
  }

  async function handleModifiedFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const result = parseXYZCsv(text);

    setModifiedPoints(result.points);
    setModifiedWarnings(result.warnings);
    setModifiedFileName(file.name);

    if (isShowingModified) {
      setPoints(result.points);
      setWarnings(result.warnings);
      setFileName(file.name);
      updateCameraPosition(result.points);
    }

    event.target.value = "";
  }

  async function handleOriginalFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const result = parseXYZCsv(text);

    setOriginalPoints(result.points);
    setOriginalWarnings(result.warnings);
    setOriginalFileName(file.name);

    if (!isShowingModified) {
      setPoints(result.points);
      setWarnings(result.warnings);
      setFileName(file.name);
      updateCameraPosition(result.points);
    }

    event.target.value = "";
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
    const demoPoints = makeDemoTerrain();
    setPoints(demoPoints);
    setWarnings([]);
    setFileName("Demo terrain");
    updateCameraPosition(demoPoints);
  }

  function clearLoadedTerrains() {
    const demoPoints = makeDemoTerrain();
    setOriginalPoints(null);
    setModifiedPoints(null);
    setOriginalFileName("No original terrain loaded");
    setModifiedFileName("No modified terrain loaded");
    setOriginalWarnings([]);
    setModifiedWarnings([]);
    setIsShowingModified(true);
    setPoints(demoPoints);
    setWarnings([]);
    setFileName("Demo terrain");
    updateCameraPosition(demoPoints);
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

  function deleteBuilding() {
    if (!selectedId) return;
    setBuildings((prev) => prev.filter((b) => b.id !== selectedId));
    setSelectedId(null);
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
          <h1>RARE TopoViewer </h1>
          <p className="intro">
            This is a simple 3D terrain viewer for visualizing topological data. The points should be in <code>x,y,z</code> coordinates.
          </p>
        </div>

        <label className="upload-box">
          <Upload size={22} />
          <span>
            <strong>Load Modified Terrain</strong>
            <small>a .csv file with modified terrain data.</small>
          </span>
          <input type="file" accept=".csv,.txt" onChange={handleModifiedFileChange} />
        </label>

        <label className="upload-box">
          <Upload size={22} />
          <span>
            <strong>Load Original Terrain</strong>
            <small>a .csv file with original terrain data.</small>
          </span>
          <input type="file" accept=".csv,.txt" onChange={handleOriginalFileChange} />
        </label>

        <div className="button-group toggle-terrain">
          <button
            className={`toggle-button ${isShowingModified ? "active" : ""}`}
            onClick={() => setIsShowingModified(true)}
            disabled={!modifiedPoints}
          >
            Modified
          </button>
          <button
            className={`toggle-button ${!isShowingModified ? "active" : ""}`}
            onClick={() => setIsShowingModified(false)}
            disabled={!originalPoints}
          >
            Original
          </button>
        </div>

        <div className="button-group">
          <button
            className="secondary-button clear-terrain-button"
            onClick={clearLoadedTerrains}
            disabled={!originalPoints && !modifiedPoints}
          >
            <Trash2 size={16} />
            Clear loaded terrains
          </button>
        </div>

        <p className="footprint-note">Loaded modified terrain: {modifiedFileName}</p>
        <p className="footprint-note">Loaded original terrain: {originalFileName}</p>


        <label className="upload-box">
          <Upload size={22} />
          <span>
            <strong>Load Building Footprint</strong>
            <small>JSON or CSV file with footprint coordinates and optional height.</small>
          </span>
          <input type="file" accept=".json,.csv,.txt" onChange={handleBuildingFileChange} />
        </label>


        <p className="footprint-note">Loaded building file: {buildingFileName}</p>

        <div className="button-group">
          <button className="primary-button" onClick={addBuilding}>
            <Plus size={16} />
            Add Building
          </button>
          <button className="primary-button" onClick={deleteBuilding} disabled={!selectedId}>
            <Trash2 size={16} />
            Delete Building
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

        <section className="stats">
        <h2>Mesh options</h2>

        <div className="button-group">
          <button
            className={smoothMesh ? "primary-button" : "secondary-button"}
            onClick={() => setSmoothMesh(!smoothMesh)}
          >
            {smoothMesh ? "Smooth: On" : "Smooth: Off"}
          </button>

          <button
            className={contourOnly ? "primary-button" : "secondary-button"}
            onClick={() => setContourOnly(!contourOnly)}
          >
            {contourOnly ? "Contours Only" : "Show Mesh"}
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


      </aside>

      <section className="viewport">
        <Scene
        points={points}
        buildings={buildings}
        selectedId={selectedId}
        transformMode={transformMode}
        onSelectBuilding={setSelectedId}
        onUpdateBuilding={updateBuildingTransform}
        cameraPosition={cameraPosition}
        isOriginal={!isShowingModified}
        smoothMesh={smoothMesh}
        contourOnly={contourOnly}
      />
      </section>
    </main>
  );
}
