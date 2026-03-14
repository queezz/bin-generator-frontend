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
let defaultCameraPosition = new THREE.Vector3(140, 120, 160);
let defaultControlsTarget = new THREE.Vector3(0, 0, 0);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d12);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
camera.position.copy(defaultCameraPosition);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
viewerEl.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.screenSpacePanning = true;
controls.maxPolarAngle = Math.PI / 2;
controls.minDistance = 10;
controls.maxDistance = 1000;
controls.target.copy(defaultControlsTarget);

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(80, 120, 100);
scene.add(dirLight);

const grid = new THREE.GridHelper(200, 20, 0x444444, 0x444444);
grid.position.set(0, 0, 0);
scene.add(grid);

const axesHelper = new THREE.AxesHelper(50);
scene.add(axesHelper);

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
  renderer.setSize(width, height, false);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

/**
 * Centers the object at the origin using its bounding box.
 * @param {THREE.Object3D} object
 */
function centerObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  object.position.sub(center);
}

/**
 * Moves the camera to frame the object using its bounding box and camera FOV.
 * @param {THREE.PerspectiveCamera} camera
 * @param {THREE.Object3D} object
 * @param {OrbitControls} controls
 * @param {number} offset
 */
function fitCameraToObject(camera, object, controls, offset = 1.25) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = camera.fov * (Math.PI / 180);
  let cameraZ = Math.abs(maxDim / Math.tan(fov / 2));
  cameraZ *= offset;

  camera.position.set(center.x, center.y + cameraZ * 0.2, center.z + cameraZ);
  camera.lookAt(center);

  if (controls) {
    controls.target.copy(center);
    controls.update();
  }
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
    color: 0x8aa4d6,
    metalness: 0.1,
    roughness: 0.6
  });

  currentMesh = new THREE.Mesh(geometry, material);
  currentMesh.rotation.x = -Math.PI / 2; // CAD Z-up -> Three.js Y-up
  currentMesh.castShadow = false;
  currentMesh.receiveShadow = false;
  scene.add(currentMesh);

  centerObject(currentMesh);

  const box = new THREE.Box3().setFromObject(currentMesh);
  const size = box.getSize(new THREE.Vector3());
  modelInfoEl.textContent = `Size: ${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} mm`;

  fitCameraToObject(camera, currentMesh, controls, 1.25);
  fitViewBtn.classList.add("hidden");
}

function resetView() {
  if (currentMesh) {
    fitCameraToObject(camera, currentMesh, controls);
  } else {
    controls.target.copy(defaultControlsTarget);
    camera.position.copy(defaultCameraPosition);
    camera.near = 0.1;
    camera.far = 10000;
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
