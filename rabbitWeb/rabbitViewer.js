import * as THREE from 'three';

import { GLTFLoader }
from 'three/addons/loaders/GLTFLoader.js';

import { OrbitControls }
from 'three/addons/controls/OrbitControls.js';


// -------------------------
// Scene
// -------------------------

const scene = new THREE.Scene();

scene.background = new THREE.Color(0xbfd1e5);


// -------------------------
// Camera
// -------------------------

const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);


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
// Load terrain
// -------------------------

const loader = new GLTFLoader();


loader.load(
    "terrain.glb",

    function(gltf) {

        console.log(
            "Terrain loaded",
            gltf
        );


        const terrain = gltf.scene;


        // Make terrain visible
        terrain.traverse(
            function(child) {

                if (child.isMesh) {

                    child.material =
                        new THREE.MeshStandardMaterial({
                            color: 0x777777,
                            side: THREE.DoubleSide
                        });

                }

            }
        );


        scene.add(
            terrain
        );


        // -------------------------
        // Fit camera to terrain
        // -------------------------

        const box =
            new THREE.Box3()
            .setFromObject(terrain);


        const center =
            box.getCenter(
                new THREE.Vector3()
            );


        const size =
            box.getSize(
                new THREE.Vector3()
            );


        console.log(
            "Terrain bounds:",
            box
        );


        const maxDimension =
            Math.max(
                size.x,
                size.y,
                size.z
            );


        camera.position.set(
            center.x + maxDimension,
            center.y + maxDimension,
            center.z + maxDimension
        );


        camera.lookAt(
            center
        );


        controls.target.copy(
            center
        );

        controls.update();


        // Optional:
        // exaggerate terrain height
        // terrain.scale.z = 5;

    },


    undefined,


    function(error) {

        console.error(
            "GLB loading error",
            error
        );

    }

);


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