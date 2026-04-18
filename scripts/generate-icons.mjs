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
 * macOS app icon, using Apple's icon grid. A 1024×1024 canvas has ~100px
 * of transparent padding on each side and the visible squircle fills the
 * inner 824×824 area with ~22.5% corner radius. That lets macOS scale and
 * shadow it consistently alongside other apps in the Dock / Launchpad.
 */
function appIconSvg(size) {
  const margin = size * (100 / 1024);
  const inner = size - margin * 2;
  const radius = inner * 0.225;
  const logoWidth = inner * 0.62;
  const logoHeight = (logoWidth * 42) / 96;
  const logoX = (size - logoWidth) / 2;
  const logoY = (size - logoHeight) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="g" cx="50%" cy="32%" r="78%">
      <stop offset="0%" stop-color="#241a38"/>
      <stop offset="55%" stop-color="#0e0b14"/>
      <stop offset="100%" stop-color="#050507"/>
    </radialGradient>
  </defs>
  <rect x="${margin}" y="${margin}" width="${inner}" height="${inner}" rx="${radius}" ry="${radius}" fill="url(#g)"/>
  <g transform="translate(${logoX} ${logoY}) scale(${logoWidth / 96})">
    <path d="${LOGO_PATH}" fill="#ffffff"/>
    <circle cx="47" cy="12" r="5" fill="#FF3E54"/>
    <circle cx="47" cy="30" r="5" fill="#FF3E54"/>
    <path fill-rule="evenodd" clip-rule="evenodd" d="${O_PATH}" fill="#ffffff"/>
  </g>
</svg>`;
}

/**
 * macOS template tray icon: a simple filled "recording" dot on transparency.
 * Template images must be pure black; macOS inverts per the menu bar theme.
 */
function trayIconSvg(width, height) {
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) * 0.35;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="#000000"/>
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

  // Tray template icons at the standard menu-bar size.
  const traySvg1 = trayIconSvg(22, 18);
  await renderPng(traySvg1, path.join(ASSETS, "iconTemplate.png"), { width: 22, height: 18 });
  const traySvg2 = trayIconSvg(44, 36);
  await renderPng(traySvg2, path.join(ASSETS, "iconTemplate@2x.png"), { width: 44, height: 36 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
