import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ASSETS = path.join(ROOT, "assets");
const ICONS_DIR = path.join(ASSETS, "icons");

const LOGO_PATH = "M12.78 22.08L8.79003 13.7428C8.77168 13.7044 8.73294 13.68 8.69043 13.68C8.62944 13.68 8.58 13.7294 8.58 13.7904V37.59C8.58 39.9593 6.6593 41.88 4.29 41.88C1.9207 41.88 0 39.9593 0 37.59V6.31726C0 2.82834 2.82834 0 6.31726 0C8.57177 0 10.6554 1.20149 11.7848 3.15274L21.42 19.8L25.41 28.1372C25.4283 28.1756 25.4671 28.2 25.5096 28.2C25.5706 28.2 25.62 28.1506 25.62 28.0896V4.29C25.62 1.9207 27.5407 0 29.91 0C32.2793 0 34.2 1.9207 34.2 4.29V35.5627C34.2 39.0517 31.3717 41.88 27.8827 41.88C25.6282 41.88 23.5446 40.6785 22.4152 38.7273L12.78 22.08Z";
const O_PATH = "M77.5 0C67.2827 0 59 8.28273 59 18.5V23.5C59 33.7173 67.2827 42 77.5 42C87.7173 42 96 33.7173 96 23.5V18.5C96 8.28273 87.7173 0 77.5 0ZM77.5 7C71.1487 7 66 12.1487 66 18.5V23.5C66 29.8513 71.1487 35 77.5 35C83.8513 35 89 29.8513 89 23.5V18.5C89 12.1487 83.8513 7 77.5 7Z";

/**
 * Square app icon SVG: dark rounded-square background with the logo centered.
 * Background: zinc-950 (#09090b) with a subtle violet glow, matching the app theme.
 */
function appIconSvg(size) {
  const radius = Math.round(size * 0.225);
  const logoWidth = Math.round(size * 0.66);
  const logoHeight = Math.round((logoWidth * 42) / 96);
  const logoX = Math.round((size - logoWidth) / 2);
  const logoY = Math.round((size - logoHeight) / 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="g" cx="50%" cy="35%" r="75%">
      <stop offset="0%" stop-color="#1f1530"/>
      <stop offset="60%" stop-color="#0d0b12"/>
      <stop offset="100%" stop-color="#050507"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="url(#g)"/>
  <g transform="translate(${logoX} ${logoY}) scale(${logoWidth / 96})">
    <path d="${LOGO_PATH}" fill="#ffffff"/>
    <circle cx="47" cy="12" r="5" fill="#FF3E54"/>
    <circle cx="47" cy="30" r="5" fill="#FF3E54"/>
    <path fill-rule="evenodd" clip-rule="evenodd" d="${O_PATH}" fill="#ffffff"/>
  </g>
</svg>`;
}

/**
 * macOS template tray icon: all-black on transparency. macOS inverts
 * automatically based on menu bar appearance.
 */
function trayIconSvg(width, height) {
  const scale = height / 42;
  const logoWidth = 96 * scale;
  const x = (width - logoWidth) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <g transform="translate(${x} 0) scale(${scale})">
    <path d="${LOGO_PATH}" fill="#000000"/>
    <circle cx="47" cy="12" r="5" fill="#000000"/>
    <circle cx="47" cy="30" r="5" fill="#000000"/>
    <path fill-rule="evenodd" clip-rule="evenodd" d="${O_PATH}" fill="#000000"/>
  </g>
</svg>`;
}

async function renderPng(svg, outPath, size) {
  await sharp(Buffer.from(svg)).resize(size.width, size.height).png().toFile(outPath);
  console.log(`wrote ${path.relative(ROOT, outPath)} (${size.width}x${size.height})`);
}

async function main() {
  await mkdir(ICONS_DIR, { recursive: true });

  // App icons at standard sizes.
  const appSizes = [16, 32, 64, 128, 256, 512, 1024];
  for (const s of appSizes) {
    const svg = appIconSvg(s);
    await renderPng(svg, path.join(ICONS_DIR, `icon-${s}.png`), { width: s, height: s });
  }

  // The 1024 is also the canonical source for electron-builder.
  const masterSvg = appIconSvg(1024);
  await writeFile(path.join(ASSETS, "icon.svg"), masterSvg);
  await renderPng(masterSvg, path.join(ASSETS, "icon.png"), { width: 1024, height: 1024 });

  // Tray template icons. Wider than tall so the "N:O" wordmark stays legible.
  const trayW1 = 41;
  const trayH1 = 18;
  const traySvg1 = trayIconSvg(trayW1, trayH1);
  await renderPng(traySvg1, path.join(ASSETS, "iconTemplate.png"), { width: trayW1, height: trayH1 });
  const trayW2 = 82;
  const trayH2 = 36;
  const traySvg2 = trayIconSvg(trayW2, trayH2);
  await renderPng(traySvg2, path.join(ASSETS, "iconTemplate@2x.png"), { width: trayW2, height: trayH2 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
