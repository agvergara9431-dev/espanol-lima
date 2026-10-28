// Renders icons/icon.svg to the PNG sizes the manifest and iOS need.
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const dir = resolve(import.meta.dirname, "../icons");
const svg = await readFile(resolve(dir, "icon.svg"), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, pad] of [["icon-192.png", 192, 0], ["icon-512.png", 512, 0], ["apple-touch-icon.png", 180, 0], ["icon-maskable-512.png", 512, 0.1]]) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * (1 - pad * 2));
  await page.setContent(`<body style="margin:0;background:#233152;display:grid;place-items:center;width:${size}px;height:${size}px">${svg.replace("<svg ", `<svg width="${inner}" height="${inner}" `)}</body>`);
  await page.screenshot({ path: resolve(dir, name), omitBackground: false });
  console.log("wrote", name);
}
await browser.close();
