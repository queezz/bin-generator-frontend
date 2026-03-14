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
controls.maxPolarAngle = Math.PI / 2;
controls.minDistance = 10;
controls.maxDistance = 2000;
controls.target.copy(defaultControlsTarget);

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(80, 120, 100);
scene.add(dirLight);

const grid = new THREE.GridHelper(200, 20, 0x3a4455, 0x252c38);
scene.add(grid);

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
 * Centers the camera and controls so the object fills the viewport.
 * @param {THREE.PerspectiveCamera} camera
 * @param {THREE.Object3D} object
 * @param {OrbitControls} controls
 */
function fitCameraToObject(camera, object, controls) {
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxDim = Math.max(size.x, size.y, size.z);
  const distance = Math.max(maxDim * 2.5, 50);

  camera.position.set(center.x + distance * 0.7, center.y + distance * 0.7, center.z + distance * 0.7);
  controls.target.copy(center);
  camera.near = distance / 100;
  camera.far = distance * 100;
  camera.updateProjectionMatrix();
  controls.update();
}

function frameGeometry(geometry) {
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const box = geometry.boundingBox;
  const size = new THREE.Vector3();
  box.getSize(size);

  const center = new THREE.Vector3();
  box.getCenter(center);

  geometry.translate(-center.x, -box.min.y, -center.z);

  if (currentMesh) {
    fitCameraToObject(camera, currentMesh, controls);
  }

  modelInfoEl.textContent = `Size: ${size.x.toFixed(1)} × ${size.z.toFixed(1)} × ${size.y.toFixed(1)} mm`;
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
    color: 0x8cb7ff,
    metalness: 0.08,
    roughness: 0.55
  });

  currentMesh = new THREE.Mesh(geometry, material);
  currentMesh.castShadow = false;
  currentMesh.receiveShadow = false;
  scene.add(currentMesh);

  frameGeometry(geometry);
}

function resetView() {
  controls.target.copy(defaultControlsTarget);
  camera.position.copy(defaultCameraPosition);
  camera.near = 0.1;
  camera.far = 10000;
  camera.updateProjectionMatrix();
  controls.update();
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
  if (currentMesh && currentMesh.geometry) {
    frameGeometry(currentMesh.geometry);
  }
});

generateBtn.addEventListener("click", generateAndPreview);
resetViewBtn.addEventListener("click", resetView);

window.addEventListener("resize", resize);
resize();
animate();
