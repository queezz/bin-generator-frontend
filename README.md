# Bin Generator Frontend

Simple parametric STL generator UI: enter dimensions (X, Y, H), generate an STL from the backend, preview it in the browser, and download.

## Run locally

- **Option 1:** Open `index.html` directly in a browser (some features may be limited due to CORS when calling the API).
- **Option 2:** Use a static server so paths and modules resolve correctly:
  - **VS Code / Cursor:** Install the "Live Server" extension and use "Go Live" from the project folder.
  - **Node:** `npx serve .` then open the URL shown (e.g. `http://localhost:3000`).
  - **Python:** `python -m http.server 8080` then open `http://localhost:8080`.

The app uses ES modules and an import map; it must be served over HTTP (or `file://` for opening `index.html` directly).

## API endpoint configuration

The backend URL is set in the **Backend URL** field on the page (default: your Cloud Run URL).

- The frontend calls `{Backend URL}/generate?x=X&y=Y&h=H` to get the STL.
- If the backend is on another origin, it must send CORS headers so the browser allows the request.

## Usage

1. Set the backend URL if needed.
2. Enter X, Y, and Height (mm).
3. Click **Generate** to fetch the STL and show it in the viewer.
4. Use the viewer: rotate (drag), zoom (wheel), pan (right-drag), double-click to fit the model.
5. Click **Reset View** to restore the default camera.
6. Click **Download STL** to save the file (enabled after a successful generate).

## Dependencies

- Three.js (core, OrbitControls, STLLoader) loaded from the unpkg CDN. No build step or npm required.
