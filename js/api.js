/**
 * Calls the backend /generate endpoint and returns the STL blob.
 * @param {string} baseUrl - Backend base URL (no trailing slash).
 * @param {number|string} x - X dimension (mm).
 * @param {number|string} y - Y dimension (mm).
 * @param {number|string} h - Height (mm).
 * @param {boolean} ears - Whether to include ears.
 * @param {boolean} useRamp - Whether to include the ramp/lip.
 * @returns {Promise<Blob>} STL file blob.
 */
export async function generateBin(baseUrl, x, y, h, ears, useRamp = true) {
  const url = new URL(baseUrl.replace(/\/+$/, "") + "/generate");
  url.searchParams.set("x", String(x));
  url.searchParams.set("y", String(y));
  url.searchParams.set("h", String(h));
  url.searchParams.set("ears", String(ears));
  url.searchParams.set("use_ramp", String(useRamp));
  url.searchParams.set("name", "true");

  const response = await fetch(url.toString(), { method: "GET" });
  if (!response.ok) {
    throw new Error("HTTP " + response.status);
  }
  return response.blob();
}
