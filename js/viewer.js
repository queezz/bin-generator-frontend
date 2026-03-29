import * as THREE from "three";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/STLLoader.js";
import { generateBin } from "./api.js";
import { getCached, setCached, clearAllCached } from "./cache.js";

const viewerEl = document.getElementById("viewer");
const apiBaseEl = document.getElementById("apiBase");

const LOCAL_API = "http://localhost:8080";
const CLOUD_API = "https://bin-generator-540296082924.asia-northeast1.run.app";

function detectBackend() {
  const host = window.location.hostname;
  // file:// has empty hostname; use local API so Generate hits your uvicorn, not production.
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "" ||
    window.location.protocol === "file:"
  ) {
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
const appUiEl = document.getElementById("app-ui");
const contentEl = document.getElementById("content");
const howtoTabEl = document.getElementById("howto-tab");
const binTabEl = document.getElementById("bin-tab");
const unitsEl = document.querySelector(".toolbar .units");

/** @type {HTMLElement | null} */
let howtoMainCachedClone = null;

let objectUrl = null;
let currentMesh = null;
let renderToken = 0;
let userRenderToken = 0;
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

const VIEWER_LOG = "[viewer]";

/**
 * @param {string} step
 * @param {string} [detail]
 */
function vlog(step, detail) {
  const ms = Math.round(performance.now());
  const tag = `${VIEWER_LOG}[+${ms}ms]`;
  if (detail !== undefined) console.log(`${tag} ${step}`, detail);
  else console.log(`${tag} ${step}`);
}

/** Snapshot of inputs after DOMContentLoaded applies demo + saved dimensions (for version reconcile guard). */
let initialReconcileSnapshot = null;

function snapshotInputs() {
  return {
    x: xEl.value,
    y: yEl.value,
    h: hEl.value,
    wall: wallEl.value,
    ears: earsEl.checked,
    ramp: useRampEl?.checked ?? true,
    texture: document.getElementById("texture")?.checked ?? false,
  };
}

function userHasModifiedInputs() {
  if (!initialReconcileSnapshot) return false;
  const a = initialReconcileSnapshot;
  const b = snapshotInputs();
  return (
    a.x !== b.x ||
    a.y !== b.y ||
    a.h !== b.h ||
    a.wall !== b.wall ||
    a.ears !== b.ears ||
    a.ramp !== b.ramp ||
    a.texture !== b.texture
  );
}

const STORAGE_KEYS = {
  x: "bin-generator-x",
  y: "bin-generator-y",
  h: "bin-generator-h",
  wall: "bin-generator-wall",
  stl: "bin-generator-stl",
};

const BACKEND_VERSION_KEY = "backend_version";
/** @type {string | null} */
let sessionBackendVersion = null;

/** @type {Promise<void>} */
let fastInitialRenderPromise;

/**
 * @param {string} baseUrl
 * @returns {Promise<string | null>}
 */
async function fetchBackendVersion(baseUrl) {
  const base = baseUrl.replace(/\/+$/, "");
  try {
    const r = await fetch(`${base}/info`);
    if (!r.ok) return null;
    const data = await r.json();
    if (typeof data?.version !== "string" || !data.version) return null;
    return data.version;
  } catch {
    return null;
  }
}

/**
 * Debug (console): texture checkbox, backend local vs cloud, GET /info version.
 * @param {string} baseUrl
 * @param {boolean} textureChecked
 */
async function logGenerateDebug(baseUrl, textureChecked) {
  const normalized = baseUrl.replace(/\/+$/, "");
  const localNorm = LOCAL_API.replace(/\/+$/, "");
  const cloudNorm = CLOUD_API.replace(/\/+$/, "");
  let profile;
  if (normalized === localNorm) {
    profile = "local (matches LOCAL_API)";
  } else if (normalized === cloudNorm) {
    profile = "cloud (matches CLOUD_API)";
  } else if (/(localhost|127\.0\.0\.1)/.test(normalized)) {
    profile = "local (custom host/port)";
  } else {
    profile = "cloud or custom URL";
  }

  console.log("[BeanBins] texture checkbox checked:", textureChecked);
  console.log("[BeanBins] backend baseUrl:", normalized, "|", profile);

  try {
    const r = await fetch(`${normalized}/info`, { cache: "no-store" });
    if (!r.ok) {
      console.log("[BeanBins] GET /info:", r.status, r.statusText);
      return;
    }
    const data = await r.json();
    console.log("[BeanBins] GET /info →", data);
  } catch (e) {
    console.warn("[BeanBins] GET /info error:", e);
  }
}

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

const DEMO_FILENAME = "demo-bin-40-40-20-w1.2-ears0-ramp1.stl";

function parseDemoParams(filename) {
  try {
    const name = filename.replace(".stl", "");

    const match = name.match(
      /bin-(\d+)-(\d+)-(\d+)-w([\d.]+)-ears(\d)-ramp(\d)(?:-(smooth|textured))?/
    );

    if (!match) return null;

    return {
      x: parseFloat(match[1]),
      y: parseFloat(match[2]),
      h: parseFloat(match[3]),
      wall: parseFloat(match[4]),
      ears: match[5] === "1",
      ramp: match[6] === "1",
      texture: match[7] === "textured",
    };
  } catch (e) {
    console.warn("Failed to parse demo params", e);
    return null;
  }
}

function applyParamsToUI(p) {
  if (!p) return;

  document.querySelector("#x").value = String(p.x);
  document.querySelector("#y").value = String(p.y);
  document.querySelector("#h").value = String(p.h);
  document.querySelector("#wall").value = String(p.wall);

  document.querySelector("#ears").checked = p.ears;
  document.querySelector("#useRamp").checked = p.ramp;
  const texEl = document.querySelector("#texture");
  if (texEl) texEl.checked = p.texture ?? false;
}

/**
 * @param {ArrayBuffer} ab
 * @returns {boolean}
 */
function isValidStlArrayBuffer(ab) {
  if (!ab || ab.byteLength < 84) return false;
  const head = new Uint8Array(ab, 0, Math.min(5, ab.byteLength));
  const prefix = String.fromCharCode(...head).toLowerCase();
  if (prefix.startsWith("solid")) return ab.byteLength > 80;
  const view = new DataView(ab);
  const triCount = view.getUint32(80, true);
  return triCount > 0 && 84 + triCount * 50 === ab.byteLength;
}

/**
 * @param {number} maxAttempts
 * @returns {Promise<Blob | null>}
 */
async function fetchDemoBlobWithRetries(maxAttempts) {
  const url = `./assets/${DEMO_FILENAME}`;
  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      vlog("fetch", `demo STL attempt ${attempt}/${maxAttempts}`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      if (!blob || blob.size === 0) throw new Error("empty blob");
      vlog("fetch", "demo STL ok");
      return blob;
    } catch (e) {
      lastErr = e;
      console.error("[FETCH_FAIL] demo STL", { attempt, maxAttempts, err: e });
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  }
  if (lastErr) console.error("[FETCH_FAIL] demo STL exhausted retries", lastErr);
  return null;
}

/**
 * @param {Blob} blob
 * @param {number} token
 * @param {string} downloadFilename
 * @param {string | null} statusText
 */
async function renderSTL(blob, token, downloadFilename, statusText) {
  if (token !== renderToken) return;
  try {
    const arrayBuffer = await blob.arrayBuffer();
    if (token !== renderToken) return;
    const geometry = loader.parse(arrayBuffer);
    if (token !== renderToken) return;
    showGeometry(geometry);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(blob);
    downloadBtn.href = objectUrl;
    downloadBtn.download = downloadFilename;
    downloadBtn.classList.remove("disabled");
    if (statusText) setStatus(statusText, "ok");
    requestAnimationFrame(() => {
      if (currentMesh) fitCameraToObject(camera, currentMesh, controls);
    });
  } catch (e) {
    console.error("[LOAD_FAIL] STL parse or render", e);
    throw e;
  }
}

function disposeCurrentMesh() {
  if (currentMesh) {
    scene.remove(currentMesh);
    currentMesh.geometry.dispose();
    currentMesh.material.dispose();
    currentMesh = null;
  }
}

function resize() {
  const width = viewerEl.clientWidth;
  const height = viewerEl.clientHeight;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function parseHowtoMainFromHtml(text) {
  const doc = new DOMParser().parseFromString(text, "text/html");
  return doc.querySelector("main.howto-content") || doc.querySelector("main");
}

async function loadHowTo() {
  try {
    let mainEl;
    if (howtoMainCachedClone) {
      mainEl = howtoMainCachedClone.cloneNode(true);
    } else {
      const response = await fetch("howto.html");
      if (!response.ok) {
        window.location.href = "howto.html";
        return;
      }
      const text = await response.text();
      const main = parseHowtoMainFromHtml(text);
      if (!main) {
        window.location.href = "howto.html";
        return;
      }
      howtoMainCachedClone = main.cloneNode(true);
      mainEl = main.cloneNode(true);
    }
    contentEl.replaceChildren(mainEl);
    appUiEl.classList.add("hidden");
    contentEl.classList.remove("hidden");
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    howtoTabEl.classList.add("active");
    unitsEl?.classList.add("hidden");
    window.scrollTo(0, 0);
  } catch {
    window.location.href = "howto.html";
  }
}

function showBin() {
  contentEl.replaceChildren();
  contentEl.classList.add("hidden");
  appUiEl.classList.remove("hidden");
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  binTabEl.classList.add("active");
  unitsEl?.classList.remove("hidden");
  requestAnimationFrame(() => resize());
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
  disposeCurrentMesh();

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
  const token = ++renderToken;
  userRenderToken = token;

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
  const texture = document.getElementById("texture")?.checked ?? false;
  const textureTag = texture ? "textured" : "smooth";
  const cacheKey = `bin-${x}-${y}-${h}-w${wall}-ears${ears}-ramp${useRamp}-${textureTag}`;

  try {
    await logGenerateDebug(baseUrl, texture);

    let cached = null;
    if (
      sessionBackendVersion != null &&
      localStorage.getItem(BACKEND_VERSION_KEY) === sessionBackendVersion
    ) {
      cached = await getCached(cacheKey);
    }
    if (token !== renderToken) return;
    if (cached) {
      console.log(
        "[BeanBins] IndexedDB cache hit — no /generate fetch. cacheKey:",
        cacheKey
      );
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(cached);
      const arrayBuffer = await cached.arrayBuffer();
      if (token !== renderToken) return;
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
        "-" +
        textureTag +
        ".stl";
      downloadBtn.classList.remove("disabled");
      saveDimensions(x, y, h, wall);
      saveStl(arrayBuffer);
      setStatus("Loaded from browser cache", "ok");
      generateBtn.disabled = false;
      return;
    }

    if (token !== renderToken) return;

    let blob;
    try {
      blob = await generateBin(baseUrl, x, y, h, wall, ears, useRamp, texture);
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
    if (token !== renderToken) return;

    await setCached(cacheKey, blob);

    if (token !== renderToken) return;

    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(blob);

    const arrayBuffer = await blob.arrayBuffer();
    if (token !== renderToken) return;
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
      "-" +
      textureTag +
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

/**
 * Fast path: never waits on backend. Renders validated localStorage STL or demo asset.
 * Reads STL from storage synchronously at start so a parallel version sync cannot clear it first.
 */
function runFastInitialRender() {
  const run = async () => {
    const token = ++renderToken;
    vlog("init", "fast path start");
    disposeCurrentMesh();
    resize();

    const stlBuffer = loadStl();
    await new Promise((r) => requestAnimationFrame(r));

    if (token !== renderToken) {
      vlog("init", "fast path aborted (superseded)");
      return;
    }

    if (stlBuffer && isValidStlArrayBuffer(stlBuffer)) {
      vlog("cache", "cache hit (optimistic)");
      const blob = new Blob([stlBuffer], { type: "application/octet-stream" });
      const downloadFilename =
        "bin-" +
        xEl.value +
        "-" +
        yEl.value +
        "-" +
        hEl.value +
        "-w" +
        wallEl.value +
        ".stl";
      try {
        await renderSTL(blob, token, downloadFilename, "Model loaded.");
        vlog("render", "done (cache)");
        return;
      } catch (e) {
        console.error("[CACHE_FAIL] stored STL failed to parse; falling back to demo", e);
        try {
          localStorage.removeItem(STORAGE_KEYS.stl);
        } catch (err) {
          console.warn("Failed to remove bad STL from localStorage", err);
        }
        disposeCurrentMesh();
      }
    } else {
      if (stlBuffer) {
        console.error("[CACHE_FAIL] invalid or corrupt STL in localStorage (size/structure)");
        try {
          localStorage.removeItem(STORAGE_KEYS.stl);
        } catch (e) {
          console.warn("Failed to remove invalid STL from localStorage", e);
        }
      } else {
        vlog("cache", "no localStorage STL");
      }
    }

    if (token !== renderToken) {
      vlog("init", "fast path aborted before demo fetch");
      return;
    }

    vlog("fetch", "loading demo STL (fast path)");
    const demoBlob = await fetchDemoBlobWithRetries(2);
    if (!demoBlob) {
      setStatus("Could not load demo model.", "error");
      return;
    }
    if (token !== renderToken) {
      vlog("init", "fast path aborted after demo fetch");
      return;
    }

    try {
      await renderSTL(demoBlob, token, DEMO_FILENAME, "Model loaded.");
      vlog("render", "done (demo)");
    } catch (e) {
      console.error("[LOAD_FAIL] demo STL", e);
      setStatus("Could not display demo model.", "error");
    }
  };

  fastInitialRenderPromise = run();
  return fastInitialRenderPromise;
}

/**
 * Fetches backend version in the background. On mismatch, may invalidate cache and re-render once.
 * Waits for the fast path to finish before clearing storage so optimistic read stays valid.
 */
async function runBackgroundVersionSync() {
  const base = apiBaseEl.value.trim().replace(/\/+$/, "");
  const version = await fetchBackendVersion(base);
  vlog("sync", "version sync complete");

  if (!version) {
    return;
  }

  const prevStored = localStorage.getItem(BACKEND_VERSION_KEY);
  if (prevStored === version) {
    sessionBackendVersion = version;
    vlog("sync", `matched stored version ${version}`);
    return;
  }

  sessionBackendVersion = version;

  await fastInitialRenderPromise;

  if (userHasModifiedInputs()) {
    vlog("sync", "version changed; user modified inputs — skip reconcile");
    return;
  }

  if (userRenderToken !== 0) {
    vlog("sync", "version changed; user already generated — skip reconcile");
    return;
  }

  vlog("sync", `version changed (${prevStored ?? "none"} → ${version}); reconciling`);

  try {
    await clearAllCached();
  } catch (e) {
    console.warn("Failed to clear STL cache", e);
  }
  try {
    localStorage.removeItem(STORAGE_KEYS.stl);
  } catch (e) {
    console.warn("Failed to remove STL from localStorage", e);
  }
  try {
    localStorage.setItem(BACKEND_VERSION_KEY, version);
  } catch (e) {
    console.warn("Failed to save backend version", e);
  }

  const demoParams = parseDemoParams(DEMO_FILENAME);
  applyParamsToUI(demoParams);

  const token = ++renderToken;
  if (userRenderToken !== 0) {
    vlog("sync", "reconcile aborted (user generated during clear)");
    return;
  }

  const demoBlob = await fetchDemoBlobWithRetries(2);
  if (!demoBlob) {
    setStatus("Could not reload model after update.", "error");
    return;
  }
  if (token !== renderToken) return;

  try {
    await renderSTL(demoBlob, token, DEMO_FILENAME, "Model updated.");
    vlog("render", "done (version reconcile)");
  } catch (e) {
    console.error("[LOAD_FAIL] version reconcile demo", e);
    setStatus("Could not display updated demo model.", "error");
  }
}

binTabEl.addEventListener("click", showBin);
howtoTabEl.addEventListener("click", () => {
  loadHowTo();
});

function preloadHowTo() {
  if (howtoMainCachedClone) return;
  fetch("howto.html")
    .then((r) => (r.ok ? r.text() : Promise.reject()))
    .then((text) => {
      const main = parseHowtoMainFromHtml(text);
      if (main) howtoMainCachedClone = main.cloneNode(true);
    })
    .catch(() => {});
}

generateBtn.addEventListener("click", generateAndPreview);
resetViewBtn.addEventListener("click", resetView);

document.addEventListener("DOMContentLoaded", () => {
  const demoParams = parseDemoParams(DEMO_FILENAME);
  applyParamsToUI(demoParams);

  const dims = loadDimensions();
  if (dims) {
    xEl.value = dims.x;
    yEl.value = dims.y;
    hEl.value = dims.h;
    if (dims.wall != null) wallEl.value = dims.wall;
  }

  initialReconcileSnapshot = snapshotInputs();

  void runFastInitialRender().catch((e) => {
    console.error("[LOAD_FAIL] fast initial render", e);
    setStatus("Could not load model.", "error");
  });
  void runBackgroundVersionSync().catch((e) => {
    console.error("[LOAD_FAIL] background version sync", e);
  });
  resize();
});
window.addEventListener("resize", resize);
resize();
animate();

if (typeof requestIdleCallback === "function") {
  requestIdleCallback(() => preloadHowTo(), { timeout: 4000 });
} else {
  setTimeout(preloadHowTo, 1);
}
