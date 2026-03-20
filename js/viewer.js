import * as THREE from "three";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/STLLoader.js";
import { generateBin } from "./api.js";
import { getCached, setCached } from "./cache.js";

const viewerEl = document.getElementById("viewer");
const apiBaseEl = document.getElementById("apiBase");

const LOCAL_API = "http://localhost:8080";
const CLOUD_API = "https://bin-generator-540296082924.asia-northeast1.run.app";

function detectBackend() {
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return LOCAL_API;
  }
  return CLOUD_API;
}

apiBaseEl.value = detectBackend();

const xEl = document.getElementById("x");
const yEl = document.getElementById("y");
const hEl = document.getElementById("h");
const wallEl = document.getElementById("wall");
const earsEl = document.getElementById("ears");
const useRampEl = document.getElementById("useRamp");
const generateBtn = document.getElementById("generateBtn");
const resetViewBtn = document.getElementById("resetViewBtn");
const downloadBtn = document.getElementById("downloadBtn");
const statusEl = document.getElementById("status");
const modelInfoEl = document.getElementById("modelInfo");

let objectUrl = null;
let currentMesh = null;
let defaultCameraPosition = new THREE.Vector3(120, -120, 120);
let defaultControlsTarget = new THREE.Vector3(0, 0, 0);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x24302b);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
camera.position.copy(defaultCameraPosition);
camera.up.set(0, 0, 1);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
viewerEl.appendChild(renderer.domElement);

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.physicallyCorrectLights = true;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.2;
controls.screenSpacePanning = true;
controls.maxPolarAngle = Math.PI * 0.95; 
controls.minDistance = 10;
controls.maxDistance = 1000;
controls.target.copy(defaultControlsTarget);

// scene.add(new THREE.AmbientLight(0xffffff, 0.6));
// const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
// dirLight.position.set(80, 120, 100);
//scene.add(dirLight);


const ambient = new THREE.AmbientLight(0xffffff, 0.9);
scene.add(ambient);

const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
hemi.position.set(0,1,0);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(2,3,2);
scene.add(key);

const fill = new THREE.DirectionalLight(0xffffff, 0.8);
fill.position.set(-1,-1,-1);
scene.add(fill);

const rim = new THREE.DirectionalLight(0xffffff, 2.5);
rim.position.set(0,-2,2);
scene.add(rim);

const fill2 = new THREE.DirectionalLight(0x961fff, 1.8);
fill2.position.set(-1, 2,-1);
scene.add(fill2);


const grid = new THREE.GridHelper(200, 20, 0xfff5d6, 0xd4ce28);
grid.rotation.x = Math.PI / 2;
grid.position.set(0, 0, 0);
grid.material.opacity = 0.4;
grid.material.transparent = true;
scene.add(grid);

// const axesHelper = new THREE.AxesHelper(50);
// axesHelper.position.set(10, -40, 0);
// scene.add(axesHelper);

const loader = new STLLoader();

const STORAGE_KEYS = {
  x: "bin-generator-x",
  y: "bin-generator-y",
  h: "bin-generator-h",
  wall: "bin-generator-wall",
  stl: "bin-generator-stl",
};

function saveDimensions(x, y, h, wall) {
  try {
    localStorage.setItem(STORAGE_KEYS.x, String(x));
    localStorage.setItem(STORAGE_KEYS.y, String(y));
    localStorage.setItem(STORAGE_KEYS.h, String(h));
    localStorage.setItem(STORAGE_KEYS.wall, String(wall));
  } catch (e) {
    console.warn("Failed to save dimensions to localStorage", e);
  }
}

function loadDimensions() {
  const x = localStorage.getItem(STORAGE_KEYS.x);
  const y = localStorage.getItem(STORAGE_KEYS.y);
  const h = localStorage.getItem(STORAGE_KEYS.h);
  const wall = localStorage.getItem(STORAGE_KEYS.wall);
  if (x == null || y == null || h == null) return null;
  return { x, y, h, wall };
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function saveStl(arrayBuffer) {
  try {
    const base64 = arrayBufferToBase64(arrayBuffer);
    localStorage.setItem(STORAGE_KEYS.stl, base64);
  } catch (e) {
    if (e.name === "QuotaExceededError") console.warn("localStorage full, STL not saved");
    else console.warn("Failed to save STL to localStorage", e);
  }
}

function loadStl() {
  const base64 = localStorage.getItem(STORAGE_KEYS.stl);
  if (!base64) return null;
  try {
    return base64ToArrayBuffer(base64);
  } catch (e) {
    console.warn("Failed to load STL from localStorage", e);
    return null;
  }
}

function setStatus(text, level) {
  if (level === undefined) level = "";
  statusEl.textContent = text;
  statusEl.className = "status";
  if (level) statusEl.classList.add(level);
}

function resize() {
  const width = viewerEl.clientWidth;
  const height = viewerEl.clientHeight;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

/**
 * Places the object on the grid: centered in X/Y, bottom at Z=0.
 * @param {THREE.Object3D} object
 */
function placeObjectOnGrid(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  object.position.x -= center.x;
  object.position.y -= center.y;
  object.position.z -= box.min.z;
}

const FIT_OFFSET_MOBILE = 1;
const FIT_OFFSET_DESKTOP = 0.6;
const MOBILE_BREAKPOINT = 640;

function getFitOffset() {
  return window.innerWidth <= MOBILE_BREAKPOINT ? FIT_OFFSET_MOBILE : FIT_OFFSET_DESKTOP;
}

/**
 * Moves the camera to frame the object using its bounding box and camera FOV.
 * @param {THREE.PerspectiveCamera} camera
 * @param {THREE.Object3D} object
 * @param {OrbitControls} controls
 * @param {number} [offset] - Zoom offset; uses 1 on mobile, 0.6 on desktop if omitted.
 */
function fitCameraToObject(camera, object, controls, offset) {
  const zoomOffset = offset !== undefined ? offset : getFitOffset();

  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxDim = Math.max(size.x, size.y, size.z);

  const fov = camera.fov * (Math.PI / 180);
  let distance = Math.abs(maxDim / Math.tan(fov / 2));
  distance *= zoomOffset;

  // set orbit center
  controls.target.copy(center);

  // place camera diagonally relative to that center
  camera.position.set(
    center.x + distance ,
    center.y - distance ,
    center.z + distance 
  );

  const direction = new THREE.Vector3(1, -1, 1).normalize();
  camera.position.copy(center).add(direction.multiplyScalar(distance));

  camera.lookAt(center);

  controls.update();
}

function showGeometry(geometry) {
  if (currentMesh) {
    scene.remove(currentMesh);
    currentMesh.geometry.dispose();
    currentMesh.material.dispose();
    currentMesh = null;
  }

  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0x52b8f7,
    metalness: 0.2,
    roughness: 0.4
  });

  currentMesh = new THREE.Mesh(geometry, material);
  currentMesh.castShadow = false;
  currentMesh.receiveShadow = false;
  scene.add(currentMesh);

  placeObjectOnGrid(currentMesh);

  const box = new THREE.Box3().setFromObject(currentMesh);
  const size = box.getSize(new THREE.Vector3());
  modelInfoEl.textContent = `Size: ${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} mm`;

  fitViewBtn.classList.add("hidden");
}

function resetView() {
  if (currentMesh) {
    fitCameraToObject(camera, currentMesh, controls);
  } else {
    controls.target.copy(defaultControlsTarget);
    camera.position.copy(defaultCameraPosition);
    camera.near = 10;
    camera.far = 1000;
    camera.updateProjectionMatrix();
    controls.update();
  }
}

async function generateAndPreview() {
  generateBtn.disabled = true;
  downloadBtn.classList.add("disabled");
  setStatus("Generating STL...", "warn");

  const baseUrl = apiBaseEl.value.trim().replace(/\/+$/, "");
  const x = xEl.value;
  const y = yEl.value;
  const h = hEl.value;
  const wall = wallEl.value;
  const ears = earsEl.checked;
  const useRamp = useRampEl?.checked ?? true;
  const cacheKey = `bin-${x}-${y}-${h}-w${wall}-ears${ears}-ramp${useRamp}`;

  try {
    const cached = await getCached(cacheKey);
    if (cached) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(cached);
      const arrayBuffer = await cached.arrayBuffer();
      const geometry = loader.parse(arrayBuffer);
      showGeometry(geometry);
      requestAnimationFrame(() => {
        if (currentMesh) fitCameraToObject(camera, currentMesh, controls);
      });
      downloadBtn.href = objectUrl;
      downloadBtn.download =
        "bin-" +
        x +
        "-" +
        y +
        "-" +
        h +
        "-w" +
        wall +
        "-ears" +
        (ears ? "1" : "0") +
        "-ramp" +
        (useRamp ? "1" : "0") +
        ".stl";
      downloadBtn.classList.remove("disabled");
      saveDimensions(x, y, h, wall);
      saveStl(arrayBuffer);
      setStatus("Loaded from browser cache", "ok");
      generateBtn.disabled = false;
      return;
    }

    let blob;
    try {
      blob = await generateBin(baseUrl, x, y, h, wall, ears, useRamp);
    } catch (apiError) {
      console.error(apiError);
      const isLocal =
        location.hostname === "localhost" || location.hostname === "127.0.0.1";
      if (isLocal) {
        setStatus("Backend not reachable. Did you start the container?", "error");
      } else {
        setStatus(
          "Service temporarily unavailable. Please try again later.",
          "error"
        );
      }
      return;
    }
    await setCached(cacheKey, blob);

    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(blob);

    const arrayBuffer = await blob.arrayBuffer();
    const geometry = loader.parse(arrayBuffer);
    showGeometry(geometry);

    requestAnimationFrame(() => {
      if (currentMesh) fitCameraToObject(camera, currentMesh, controls);
    });

    downloadBtn.href = objectUrl;
    downloadBtn.download =
      "bin-" +
      x +
      "-" +
      y +
      "-" +
      h +
      "-w" +
      wall +
      "-ears" +
      (ears ? "1" : "0") +
      "-ramp" +
      (useRamp ? "1" : "0") +
      ".stl";
    downloadBtn.classList.remove("disabled");

    saveDimensions(x, y, h, wall);
    saveStl(arrayBuffer);

    setStatus("Model loaded.", "ok");
  } catch (error) {
    console.error(error);
    setStatus(
      "Failed to load STL. If the API works in browser but not here, enable CORS on the backend.",
      "error"
    );
  } finally {
    generateBtn.disabled = false;
  }
}

renderer.domElement.addEventListener("dblclick", () => {
  if (currentMesh) {
    fitCameraToObject(camera, currentMesh, controls);
  }
});

const fitViewBtn = document.getElementById("fitViewBtn");
controls.addEventListener("change", () => {
  if (currentMesh) fitViewBtn.classList.remove("hidden");
});
fitViewBtn.addEventListener("click", () => {
  if (currentMesh) {
    fitCameraToObject(camera, currentMesh, controls);
    fitViewBtn.classList.add("hidden");
  }
});

function restoreFromStorage() {
  const dims = loadDimensions();
  if (dims) {
    xEl.value = dims.x;
    yEl.value = dims.y;
    hEl.value = dims.h;
    if (dims.wall != null) wallEl.value = dims.wall;
  }

  const stlBuffer = loadStl();
  if (stlBuffer) {
    try {
      const geometry = loader.parse(stlBuffer);
      showGeometry(geometry);
      const blob = new Blob([stlBuffer], { type: "application/octet-stream" });
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(blob);
      downloadBtn.href = objectUrl;
      downloadBtn.download =
        "bin-" +
        xEl.value +
        "-" +
        yEl.value +
        "-" +
        hEl.value +
        "-w" +
        wallEl.value +
        ".stl";
      downloadBtn.classList.remove("disabled");
      setStatus("Model loaded.", "ok");
      requestAnimationFrame(() => {
        if (currentMesh) fitCameraToObject(camera, currentMesh, controls);
      });
    } catch (e) {
      console.warn("Failed to restore STL from localStorage", e);
    }
  }
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const tool = tab.dataset.tool;
    console.log("Selected tool:", tool);
  });
});

generateBtn.addEventListener("click", generateAndPreview);
resetViewBtn.addEventListener("click", resetView);

restoreFromStorage();
window.addEventListener("resize", resize);
resize();
animate();
