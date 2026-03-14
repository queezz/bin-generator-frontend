import * as THREE from "three";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/STLLoader.js";

const viewerEl = document.getElementById("viewer");
const apiBaseEl = document.getElementById("apiBase");
const xEl = document.getElementById("x");
const yEl = document.getElementById("y");
const hEl = document.getElementById("h");
const nameEl = document.getElementById("name");
const cacheBustEl = document.getElementById("cacheBust");
const generateBtn = document.getElementById("generateBtn");
const downloadBtn = document.getElementById("downloadBtn");
const statusEl = document.getElementById("status");
const requestUrlEl = document.getElementById("requestUrl");
const modelInfoEl = document.getElementById("modelInfo");

let objectUrl = null;
let currentMesh = null;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d12);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
camera.position.set(140, 120, 160);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
viewerEl.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

controls.rotateSpeed = 1.2;
controls.zoomSpeed = 1.2;
controls.panSpeed = 1.0;

controls.screenSpacePanning = true;

controls.minDistance = 10;
controls.maxDistance = 2000;

const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
scene.add(hemi);

const dir1 = new THREE.DirectionalLight(0xffffff, 1.1);
dir1.position.set(80, 120, 100);
scene.add(dir1);

const dir2 = new THREE.DirectionalLight(0xffffff, 0.5);
dir2.position.set(-80, 40, -60);
scene.add(dir2);

const grid = new THREE.GridHelper(300, 30, 0x3a4455, 0x252c38);
scene.add(grid);

const axes = new THREE.AxesHelper(60);
scene.add(axes);

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

function buildUrl() {
  const base = apiBaseEl.value.trim().replace(/\/+$/, "");
  const url = new URL(base + "/generate");
  url.searchParams.set("x", xEl.value);
  url.searchParams.set("y", yEl.value);
  url.searchParams.set("h", hEl.value);
  if (nameEl.checked) {
    url.searchParams.set("name", "true");
  }
  if (cacheBustEl.checked) {
    url.searchParams.set("_t", Date.now().toString());
  }
  return url;
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

  const maxDim = Math.max(size.x, size.y, size.z);

  const distance = maxDim * 2.5;

  camera.position.set(distance, distance * 0.8, distance);
  controls.target.set(0, size.y * 0.5, 0);

  camera.near = distance / 100;
  camera.far = distance * 100;

  camera.updateProjectionMatrix();
  controls.update();

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

async function generateAndPreview() {
  generateBtn.disabled = true;
  downloadBtn.classList.add("disabled");
  setStatus("Generating STL...", "warn");

  try {
    const url = buildUrl();
    requestUrlEl.textContent = url.toString();

    const response = await fetch(url.toString(), { method: "GET" });
    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }

    const blob = await response.blob();

    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
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

window.addEventListener("resize", resize);
resize();
animate();
