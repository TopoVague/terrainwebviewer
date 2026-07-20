import * as THREE from 'three';

import { GLTFLoader }
from 'three/addons/loaders/GLTFLoader.js';

import { OrbitControls }
from 'three/addons/controls/OrbitControls.js';


// -------------------------
// Scene
// -------------------------

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);


// -------------------------
// Camera
// -------------------------

const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);

// The far plane and initial framing are widened once assets are loaded, since
// datasets like neighborhood.glb can span a much larger area than the terrain.


// -------------------------
// Renderer
// -------------------------

const renderer = new THREE.WebGLRenderer({
    antialias: true
});

renderer.setSize(
    window.innerWidth,
    window.innerHeight
);

renderer.setPixelRatio(
    window.devicePixelRatio
);

document.body.appendChild(
    renderer.domElement
);


// -------------------------
// Controls
// -------------------------

const controls = new OrbitControls(
    camera,
    renderer.domElement
);

controls.enableDamping = true;


// -------------------------
// Lights
// -------------------------

const ambientLight = new THREE.AmbientLight(
    0xffffff,
    2
);

scene.add(
    ambientLight
);


const directionalLight = new THREE.DirectionalLight(
    0xffffff,
    3
);

directionalLight.position.set(
    20,
    20,
    30
);

scene.add(
    directionalLight
);


// -------------------------
// Grid
// -------------------------

const grid = new THREE.GridHelper(
    30,
    30
);

scene.add(
    grid
);



// -------------------------
// Load geometry
// -------------------------

// -------------------------
// Visibility controls
// -------------------------




const visibilityState = {
    originalTerrain: false,
    modifiedTerrain: true,
    buildings: true,
    neighborhood: false,
    grid: false
};

// Contour interval (meters) between horizontal elevation lines drawn on each terrain type.
const SITE_TERRAIN_CONTOUR_INTERVAL = 0.5;
const NEIGHBORHOOD_TERRAIN_CONTOUR_INTERVAL = 1.0;


const overlay = document.createElement('div');
overlay.style.position = 'absolute';
overlay.style.top = '30px';
overlay.style.right = '30px';
overlay.style.background = 'rgba(190, 190, 190, 0.85)';
overlay.style.color = '#464747';
overlay.style.padding = '15px 15px';
overlay.style.borderRadius = '8px';
overlay.style.fontFamily = 'sans-serif';
overlay.style.fontSize = '14px';
overlay.style.zIndex = '1000';
overlay.style.boxShadow = '0 4px 12px rgba(0,0,0,0.25)';

overlay.innerHTML = `
  <div style="font-weight:600; margin-bottom:6px;">Legend</div>
  <label style="display:flex; align-items:center; gap:8px; margin:4px 0;"><input type="checkbox" id="toggle-original-terrain"> Original Terrain</label>
  <label style="display:flex; align-items:center; gap:8px; margin:4px 0;"><input type="checkbox" id="toggle-modified-terrain" checked> Modified Terrain</label>
  <label style="display:flex; align-items:center; gap:8px; margin:4px 0;"><input type="checkbox" id="toggle-buildings" checked> Buildings</label>
  <label style="display:flex; align-items:center; gap:8px; margin:4px 0;"><input type="checkbox" id="toggle-neighborhood"> Neighborhood</label>
  <label style="display:flex; align-items:center; gap:8px; margin:4px 0;"><input type="checkbox" id="toggle-grid"> Grid</label>
`;

document.body.appendChild(overlay);

document.body.style.margin = '0';
document.body.style.overflow = 'hidden';

// -------------------------
// Scenario tabs
// -------------------------

const scenarioTabBar = document.createElement('div');
scenarioTabBar.style.position = 'absolute';
scenarioTabBar.style.top = '30px';
scenarioTabBar.style.left = '30px';
scenarioTabBar.style.display = 'none';
scenarioTabBar.style.gap = '6px';
scenarioTabBar.style.flexWrap = 'wrap';
scenarioTabBar.style.maxWidth = '60%';
scenarioTabBar.style.zIndex = '1000';

document.body.appendChild(scenarioTabBar);

let scenarios = [];
let activeScenarioId = null;
const scenarioRoots = { modifiedTerrain: null, buildings: null };

function styleScenarioTabButton(button, active) {
    button.style.padding = '6px 12px';
    button.style.borderRadius = '6px';
    button.style.border = active ? '2px solid #2c6e9b' : '1px solid #999';
    button.style.background = active ? '#5597C1' : 'rgba(255, 255, 255, 0.85)';
    button.style.color = active ? '#fff' : '#333';
    button.style.fontFamily = 'sans-serif';
    button.style.fontSize = '13px';
    button.style.fontWeight = active ? '600' : '400';
    button.style.cursor = 'pointer';
    button.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)';
}

function updateScenarioTabsUI() {
    Array.from(scenarioTabBar.children).forEach(function(button) {
        styleScenarioTabButton(button, button.dataset.scenarioId === activeScenarioId);
    });
}

function buildScenarioTabs() {
    scenarioTabBar.innerHTML = '';

    if (!scenarios.length) {
        scenarioTabBar.style.display = 'none';
        return;
    }

    scenarioTabBar.style.display = 'flex';
    scenarios.forEach(function(scenario) {
        const button = document.createElement('button');
        button.textContent = scenario.label || scenario.id;
        button.dataset.scenarioId = scenario.id;
        styleScenarioTabButton(button, false);
        button.addEventListener('click', function() {
            switchScenario(scenario);
        });
        scenarioTabBar.appendChild(button);
    });
    updateScenarioTabsUI();
}

function disposeRoot(root) {
    if (!root) return;

    scene.remove(root);
    const index = geometryRoots.indexOf(root);
    if (index !== -1) geometryRoots.splice(index, 1);

    root.traverse(function(child) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach(function(material) { material.dispose(); });
        }
    });
}

async function loadScenarioAssets(scenario) {
    const results = await Promise.all([
        scenario.modifiedTerrain
            ? loadGeometryAsset(scenario.modifiedTerrain, `${scenario.label} - Modified Terrain`)
            : Promise.resolve(null),
        scenario.buildings
            ? loadGeometryAsset(scenario.buildings, `${scenario.label} - Buildings`)
            : Promise.resolve(null)
    ]);

    scenarioRoots.modifiedTerrain = results[0];
    scenarioRoots.buildings = results[1];
    activeScenarioId = scenario.id;
    return results;
}

async function switchScenario(scenario) {
    if (scenario.id === activeScenarioId) return;

    disposeRoot(scenarioRoots.modifiedTerrain);
    disposeRoot(scenarioRoots.buildings);
    scenarioRoots.modifiedTerrain = null;
    scenarioRoots.buildings = null;

    await loadScenarioAssets(scenario);
    updateScenarioTabsUI();
}

// -------------------------
// Polyline overlays (e.g. site boundary, buildable envelope)
// -------------------------

const POLYLINE_COLORS = [0xffcc00, 0x00e5ff, 0xff5588, 0x8aff66, 0xbb88ff];
let polylineColorIndex = 0;

function addPolylineLegendEntry(entry, color, onToggle) {
    const label = document.createElement('label');
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    label.style.gap = '8px';
    label.style.margin = '4px 0';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.addEventListener('change', function(e) {
        onToggle(e.target.checked);
    });

    const swatch = document.createElement('span');
    swatch.style.width = '10px';
    swatch.style.height = '10px';
    swatch.style.borderRadius = '2px';
    swatch.style.background = '#' + color.toString(16).padStart(6, '0');
    swatch.style.display = 'inline-block';
    swatch.style.flexShrink = '0';

    label.appendChild(checkbox);
    label.appendChild(swatch);
    label.appendChild(document.createTextNode(entry.label || entry.id));
    overlay.appendChild(label);
}

function loadPolyline(entry) {
    return fetch(entry.url)
        .then(function(response) {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then(function(data) {
            const points = (data.points || []).map(function(p) {
                return new THREE.Vector3(p[0], p[1], p[2]);
            });
            if (points.length < 2) return null;

            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const color = POLYLINE_COLORS[polylineColorIndex % POLYLINE_COLORS.length];
            polylineColorIndex += 1;

            const material = new THREE.LineBasicMaterial({ color: color, linewidth: 2 });
            const line = new THREE.LineLoop(geometry, material);
            line.renderOrder = 50;
            scene.add(line);

            addPolylineLegendEntry(entry, color, function(visible) {
                line.visible = visible;
            });

            return line;
        })
        .catch(function(error) {
            console.warn(`Polyline '${entry.id}' failed to load:`, error);
            return null;
        });
}

async function loadPolylinesManifest() {
    try {
        const response = await fetch('polylines.json');
        if (!response.ok) return [];
        const manifest = await response.json();
        if (!manifest || !Array.isArray(manifest.polylines)) return [];
        return manifest.polylines;
    } catch (error) {
        console.warn('No polylines.json found:', error);
        return [];
    }
}

const geometryRoots = [];


function createContourMaterial(baseColor, contourColor, intervalMeters) {
    const material = new THREE.MeshStandardMaterial({
        color: baseColor,
        side: THREE.DoubleSide,
        roughness: 0.95,
        metalness: 0.0
    });

    material.onBeforeCompile = function(shader) {
        shader.uniforms.contourColor = { value: new THREE.Color(contourColor) };
        shader.uniforms.contourInterval = { value: intervalMeters };

        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vContourWorldPosition;')
            .replace(
                '#include <begin_vertex>',
                '#include <begin_vertex>\nvContourWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;'
            );

        shader.fragmentShader = shader.fragmentShader
            .replace(
                '#include <common>',
                '#include <common>\nvarying vec3 vContourWorldPosition;\nuniform vec3 contourColor;\nuniform float contourInterval;'
            )
            .replace(
                '#include <dithering_fragment>',
                `#include <dithering_fragment>
                {
                    float contourCoord = vContourWorldPosition.y / contourInterval;
                    float contourDist = abs(fract(contourCoord - 0.5) - 0.5);
                    float contourLine = 1.0 - clamp(contourDist / fwidth(contourCoord), 0.0, 1.0);
                    gl_FragColor.rgb = mix(gl_FragColor.rgb, contourColor, contourLine * 0.85);
                }`
            );
    };

    return material;
}

function applyGeometryMaterials(root) {
    root.traverse(function(child) {
        if (!child.isMesh) return;

        const name = (child.name || '').toLowerCase();
        const meshClass = child.userData?.class;
        const isBuilding = name.includes('building') || meshClass === 'building';
        const isNeighborhood = name.includes('neighborhood') || meshClass === 'neighborhood';
        const isNeighborhoodTerrain = meshClass === 'neighborhoodTerrain';
        const isOriginalTerrain = meshClass === 'originalTerrain';
        const isModifiedTerrain = meshClass === 'modifiedTerrain';

        if (isBuilding) {
            child.material = new THREE.MeshBasicMaterial({
                color: 0x5597C1,
                transparent: true,
                opacity: 0.5,
                side: THREE.DoubleSide,
                roughness: 0.95,
                depthWrite: false,
                wireframe: false,
                wireframeLinewidth: 1.5
            });

            // EdgesGeometry only keeps edges between faces that aren't roughly coplanar,
            // so the diagonal split of each triangulated quad face is dropped while the
            // actual volume edges (wall/roof corners) are kept.
            const buildingEdgeMaterial = new THREE.LineBasicMaterial({
                color: 0xc90076,
                linewidth: 1,
                transparent: true
            });

            const buildingEdges = new THREE.EdgesGeometry(child.geometry);
            const buildingEdgeLines = new THREE.LineSegments(buildingEdges, buildingEdgeMaterial);
            buildingEdgeLines.renderOrder = 100;
            buildingEdgeLines.material.depthTest = false;
            child.add(buildingEdgeLines);


        } else if (isNeighborhood) {
            child.material = new THREE.MeshStandardMaterial({
                color: 0x404040,
                side: THREE.DoubleSide,
                roughness: 0.9,
                metalness: 0.0,
                transparent: true,
                opacity: 0.45,
                wireframe: false
            });
        } else if (isNeighborhoodTerrain) {
            child.material = createContourMaterial(0xd8d2c4, 0xededed, NEIGHBORHOOD_TERRAIN_CONTOUR_INTERVAL);
        } else if (isOriginalTerrain || isModifiedTerrain) {
            child.material = createContourMaterial(0x808080, 0x2c2c2c, SITE_TERRAIN_CONTOUR_INTERVAL);
        } else {
            child.material = new THREE.MeshStandardMaterial({
                color: 0x777777,
                side: THREE.DoubleSide
            });
        }
    });
}

function updateVisibility() {
    geometryRoots.forEach(function(root) {
        if (!root) return;
        root.traverse(function(child) {
            if (!child.isMesh) return;
            const name = (child.name || '').toLowerCase();
            const meshClass = child.userData?.class;
            const isBuilding = name.includes('building') || meshClass === 'building';
            const isNeighborhoodLayer = name.includes('neighborhood') || meshClass === 'neighborhood' || meshClass === 'neighborhoodTerrain';
            const isOriginalTerrain = meshClass === 'originalTerrain';
            const isModifiedTerrain = meshClass === 'modifiedTerrain';
            if (isBuilding) {
                child.visible = visibilityState.buildings;
            } else if (isNeighborhoodLayer) {
                child.visible = visibilityState.neighborhood;
            } else if (isOriginalTerrain) {
                child.visible = visibilityState.originalTerrain;
            } else if (isModifiedTerrain) {
                child.visible = visibilityState.modifiedTerrain;
            }
        });
    });
    grid.visible = visibilityState.grid;
}

const originalTerrainCheckbox = document.getElementById('toggle-original-terrain');
const modifiedTerrainCheckbox = document.getElementById('toggle-modified-terrain');
const buildingsCheckbox = document.getElementById('toggle-buildings');
const neighborhoodCheckbox = document.getElementById('toggle-neighborhood');
const gridCheckbox = document.getElementById('toggle-grid');

originalTerrainCheckbox.addEventListener('change', function(e) {
    visibilityState.originalTerrain = e.target.checked;
    updateVisibility();
});

modifiedTerrainCheckbox.addEventListener('change', function(e) {
    visibilityState.modifiedTerrain = e.target.checked;
    updateVisibility();
});

buildingsCheckbox.addEventListener('change', function(e) {
    visibilityState.buildings = e.target.checked;
    updateVisibility();
});

neighborhoodCheckbox.addEventListener('change', function(e) {
    visibilityState.neighborhood = e.target.checked;
    updateVisibility();
});

gridCheckbox.addEventListener('change', function(e) {
    visibilityState.grid = e.target.checked;
    updateVisibility();
});

const loader = new GLTFLoader();

function loadGeometryAsset(url, label) {
    return new Promise(function(resolve) {
        loader.load(
            url,
            function(gltf) {
                console.log(`${label} loaded`, gltf);

                const root = gltf.scene;
                geometryRoots.push(root);
                applyGeometryMaterials(root);
                scene.add(root);
                updateVisibility();

                resolve(root);
            },
            undefined,
            function(error) {
                console.warn(`${label} GLB not available yet:`, error);
                resolve(null);
            }
        );
    });
}

function frameCameraToRoots(roots) {
    const box = new THREE.Box3();
    let hasContent = false;

    // traverseVisible skips hidden meshes (e.g. the neighborhood layer, which is off by
    // default) so the initial camera framing zooms to what's actually shown, not everything loaded.
    roots.forEach(function(root) {
        if (!root) return;
        root.traverseVisible(function(child) {
            if (!child.isMesh) return;
            box.expandByObject(child);
            hasContent = true;
        });
    });

    if (!hasContent) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z);

    console.log('Combined scene bounds:', box);

    // Widen the far plane so distant layers (e.g. a large neighborhood dataset)
    // aren't clipped, then frame the camera to fit what's currently visible.
    camera.far = Math.max(1000, maxDimension * 4);
    camera.updateProjectionMatrix();

    camera.position.set(center.x + maxDimension, center.y + maxDimension, center.z + maxDimension);
    camera.lookAt(center);
    controls.target.copy(center);
    controls.update();
}

async function loadScenariosManifest() {
    try {
        const response = await fetch('scenarios.json');
        if (!response.ok) return null;
        const manifest = await response.json();
        if (!manifest || !Array.isArray(manifest.scenarios) || manifest.scenarios.length === 0) return null;
        return manifest.scenarios;
    } catch (error) {
        console.warn('No scenarios.json found, falling back to modifiedTerrain.glb/buildings.glb:', error);
        return null;
    }
}

async function init() {
    const sharedLoaders = [
        loadGeometryAsset('originalTerrain.glb', 'Original Terrain'),
        loadGeometryAsset('neighborhood.glb', 'Neighborhood')
    ];

    scenarios = await loadScenariosManifest() || [];

    if (scenarios.length > 0) {
        buildScenarioTabs();
        sharedLoaders.push(loadScenarioAssets(scenarios[0]));
    } else {
        sharedLoaders.push(loadGeometryAsset('modifiedTerrain.glb', 'Modified Terrain'));
        sharedLoaders.push(loadGeometryAsset('buildings.glb', 'Buildings'));
    }

    const polylineEntries = await loadPolylinesManifest();
    polylineEntries.forEach(function(entry) {
        sharedLoaders.push(loadPolyline(entry));
    });

    const results = await Promise.all(sharedLoaders);
    frameCameraToRoots(results.flat());
}

init();

// -------------------------
// Resize handling
// -------------------------

window.addEventListener(
    "resize",
    function() {

        camera.aspect =
            window.innerWidth /
            window.innerHeight;

        camera.updateProjectionMatrix();


        renderer.setSize(
            window.innerWidth,
            window.innerHeight
        );

    }
);


// -------------------------
// Animation loop
// -------------------------

function animate() {

    requestAnimationFrame(
        animate
    );


    controls.update();


    renderer.render(
        scene,
        camera
    );

}


animate();