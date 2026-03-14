/**
 * Calls the backend /generate endpoint and returns the STL blob.
 * @param {string} baseUrl - Backend base URL (no trailing slash).
 * @param {number|string} x - X dimension (mm).
 * @param {number|string} y - Y dimension (mm).
 * @param {number|string} h - Height (mm).
 * @param {boolean} [cacheBust=false] - If true, appends _t for cache busting.
 * @returns {Promise<Blob>} STL file blob.
 */
export async function generateBin(baseUrl, x, y, h, cacheBust = false) {
  const url = new URL(baseUrl.replace(/\/+$/, "") + "/generate");
  url.searchParams.set("x", String(x));
  url.searchParams.set("y", String(y));
  url.searchParams.set("h", String(h));
  if (cacheBust) url.searchParams.set("_t", String(Date.now()));

  const response = await fetch(url.toString(), { method: "GET" });
  if (!response.ok) {
    throw new Error("HTTP " + response.status);
  }
  return response.blob();
}
