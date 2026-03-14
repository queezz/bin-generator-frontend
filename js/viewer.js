import * as THREE from "three";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/STLLoader.js";
import { generateBin } from "./api.js";

const viewerEl = document.getElementById("viewer");
const apiBaseEl = document.getElementById("apiBase");
const xEl = document.getElementById("x");
const yEl = document.getElementById("y");
const hEl = document.getElementById("h");
const nameEl = document.getElementById("name");
const cacheBustEl = document.getElementById("cacheBust");
const generateBtn = document.getElementById("generateBtn");
const resetViewBtn = document.getElementById("resetViewBtn");
const downloadBtn = document.getElementById("downloadBtn");
const statusEl = document.getElementById("status");
const requestUrlEl = document.getElementById("requestUrl");
const modelInfoEl = document.getElementById("modelInfo");

let objectUrl = null;
let currentMesh = null;
let defaultCameraPosition = new THREE.Vector3(120, -120, 120);
let defaultControlsTarget = new THREE.Vector3(0, 0, 0);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7c8c8f);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
camera.position.copy(defaultCameraPosition);
camera.up.set(0, 0, 1);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
viewerEl.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.2;
controls.screenSpacePanning = true;
controls.maxPolarAngle = Math.PI * 0.95; 
controls.minDistance = 30;
controls.maxDistance = 300;
controls.target.copy(defaultControlsTarget);

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(80, 120, 100);
scene.add(dirLight);

const grid = new THREE.GridHelper(200, 20, 0x444444, 0xd4ce28);
grid.rotation.x = Math.PI / 2;
grid.position.set(0, 0, 0);
grid.material.opacity = 0.4;
grid.material.transparent = true;
scene.add(grid);

// const axesHelper = new THREE.AxesHelper(50);
// scene.add(axesHelper);

const loader = new STLLoader();

function setStatus(text, level) {
  if (level === undefined) level = "";
  statusEl.textContent = text;
  statusEl.className = "status";
  if (level) statusEl.classList.add(level);
}

function resize() {
  const width = viewerEl.clientWidth || 800;
  const height = viewerEl.clientHeight || 500;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
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

/**
 * Moves the camera to frame the object using its bounding box and camera FOV.
 * @param {THREE.PerspectiveCamera} camera
 * @param {THREE.Object3D} object
 * @param {OrbitControls} controls
 * @param {number} offset
 */
function fitCameraToObject(camera, object, controls, offset = 0) {

  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxDim = Math.max(size.x, size.y, size.z);

  const fov = camera.fov * (Math.PI / 180);
  let distance = Math.abs(maxDim / Math.tan(fov / 2));
  distance *= offset;

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
    color: 0xff834a,
    metalness: 0.3,
    roughness: 0.3
  });

  currentMesh = new THREE.Mesh(geometry, material);
  currentMesh.castShadow = false;
  currentMesh.receiveShadow = false;
  scene.add(currentMesh);

  placeObjectOnGrid(currentMesh);

  const box = new THREE.Box3().setFromObject(currentMesh);
  const size = box.getSize(new THREE.Vector3());
  modelInfoEl.textContent = `Size: ${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} mm`;

  fitCameraToObject(camera, currentMesh, controls, 0.5);
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
  const url = new URL(baseUrl + "/generate");
  url.searchParams.set("x", xEl.value);
  url.searchParams.set("y", yEl.value);
  url.searchParams.set("h", hEl.value);
  if (nameEl.checked) url.searchParams.set("name", "true");
  if (cacheBustEl.checked) url.searchParams.set("_t", String(Date.now()));
  requestUrlEl.textContent = url.toString();

  try {
    const blob = await generateBin(baseUrl, xEl.value, yEl.value, hEl.value, cacheBustEl.checked);

    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(blob);

    const arrayBuffer = await blob.arrayBuffer();
    const geometry = loader.parse(arrayBuffer);
    showGeometry(geometry);
    
    downloadBtn.href = objectUrl;
    downloadBtn.download = nameEl.checked
      ? "bin-" + xEl.value + "-" + yEl.value + "-" + hEl.value + ".stl"
      : "bin.stl";
    downloadBtn.classList.remove("disabled");

    setStatus("Model loaded.", "ok");
  } catch (error) {
    console.error(error);
    setStatus("Failed to load STL. If the API works in browser but not here, enable CORS on the backend.", "error");
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

generateBtn.addEventListener("click", generateAndPreview);
resetViewBtn.addEventListener("click", resetView);

window.addEventListener("resize", resize);
resize();
animate();
