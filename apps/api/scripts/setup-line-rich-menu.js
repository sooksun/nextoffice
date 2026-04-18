/* eslint-disable */
/**
 * LINE Rich Menu Setup Script
 *
 * Generates a 2500x843 PNG rich menu with 3 buttons:
 *   [📊 แดชบอร์ด]  [📋 งานของฉัน]  [🔍 ค้นหา]
 *
 * Then uploads it to LINE Messaging API and sets it as the default rich menu.
 *
 * Usage (from repo root):
 *   LINE_CHANNEL_ACCESS_TOKEN=xxx LIFF_ID=2009827697-xxx \
 *     node apps/api/scripts/setup-line-rich-menu.js
 *
 * Or load from .env:
 *   cd apps/api && node scripts/setup-line-rich-menu.js
 *
 * Re-running the script creates a new rich menu and promotes it to default.
 * Old rich menus remain in the channel — delete manually via LINE console
 * or extend this script with `--cleanup`.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

// Load env from apps/api/.env if LINE_CHANNEL_ACCESS_TOKEN not already set
if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf8').split('\n');
      for (const line of lines) {
        const m = line.match(/^([A-Z_]+)\s*=\s*(.*)$/);
        if (m && !process.env[m[1]]) {
          process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
        }
      }
    }
  } catch (e) {
    /* ignore */
  }
}

const TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LIFF_ID = process.env.LIFF_ID;

if (!TOKEN) {
  console.error('❌ LINE_CHANNEL_ACCESS_TOKEN not set');
  process.exit(1);
}
if (!LIFF_ID) {
  console.error('❌ LIFF_ID not set');
  process.exit(1);
}

// ─── Register Sarabun font (looks in dev src/ and dist/ paths) ───────────────
const fontCandidates = [
  path.join(__dirname, '..', 'src', 'stamps', 'fonts'),
  path.join(__dirname, '..', 'dist', 'src', 'stamps', 'fonts'),
];
const fontDir = fontCandidates.find((p) => fs.existsSync(path.join(p, 'Sarabun-Regular.ttf')));
if (fontDir) {
  try {
    GlobalFonts.registerFromPath(path.join(fontDir, 'Sarabun-Regular.ttf'), 'Sarabun');
    GlobalFonts.registerFromPath(path.join(fontDir, 'Sarabun-Bold.ttf'), 'SarabunBold');
    console.log(`    using fonts from ${fontDir}`);
  } catch (e) {
    console.warn('⚠ Sarabun font register failed — falling back to default');
  }
} else {
  console.warn('⚠ Sarabun font not found — falling back to default');
}

// ─── Draw rich menu image ─────────────────────────────────────────────────────
const WIDTH = 2500;
const HEIGHT = 843;

function drawRichMenu() {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Background gradient (deep purple → indigo, matches Midone UI)
  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, '#4f46e5');
  bg.addColorStop(1, '#6366f1');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Vertical dividers
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 3;
  for (let i = 1; i < 3; i++) {
    const x = (WIDTH / 3) * i;
    ctx.beginPath();
    ctx.moveTo(x, 120);
    ctx.lineTo(x, HEIGHT - 120);
    ctx.stroke();
  }

  // Buttons: icon + Thai label
  const cells = [
    { icon: '📊', label: 'แดชบอร์ด', sub: 'ภาพรวมงาน' },
    { icon: '📋', label: 'งานของฉัน', sub: 'หนังสือค้างดำเนินการ' },
    { icon: '🔍', label: 'ค้นหาหนังสือ', sub: 'ตามเลขที่ / หัวเรื่อง' },
  ];

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';

  cells.forEach((cell, i) => {
    const cx = WIDTH / 3 / 2 + (WIDTH / 3) * i;
    const cy = HEIGHT / 2;

    // Icon
    ctx.font = '180px sans-serif';
    ctx.fillText(cell.icon, cx, cy - 120);

    // Label (Thai)
    ctx.font = 'bold 90px SarabunBold, Sarabun, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(cell.label, cx, cy + 60);

    // Sub label
    ctx.font = '48px Sarabun, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(cell.sub, cx, cy + 150);
  });

  return canvas.encode('png');
}

// ─── LINE API helpers ─────────────────────────────────────────────────────────
function apiRequest(host, pathname, method, body, contentType) {
  return new Promise((resolve, reject) => {
    const bodyBuf = Buffer.isBuffer(body) ? body : body ? Buffer.from(body) : null;
    const req = https.request(
      {
        host,
        path: pathname,
        method,
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': contentType || 'application/json',
          ...(bodyBuf ? { 'Content-Length': bodyBuf.length } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data ? JSON.parse(data) : {});
          } else {
            reject(new Error(`${method} ${pathname} → ${res.statusCode} ${data}`));
          }
        });
      },
    );
    req.on('error', reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

async function createRichMenu() {
  const liffUrl = `https://liff.line.me/${LIFF_ID}`;

  const menu = {
    size: { width: WIDTH, height: HEIGHT },
    selected: true,
    name: 'NextOffice Main Menu',
    chatBarText: 'เมนู NextOffice',
    areas: [
      // Column 1 — Dashboard → LIFF
      {
        bounds: { x: 0, y: 0, width: WIDTH / 3, height: HEIGHT },
        action: { type: 'uri', uri: liffUrl },
      },
      // Column 2 — My Tasks → LIFF (same base, user sees my-tasks section in dashboard)
      {
        bounds: { x: WIDTH / 3, y: 0, width: WIDTH / 3, height: HEIGHT },
        action: { type: 'uri', uri: liffUrl },
      },
      // Column 3 — Search → text message prompt
      {
        bounds: { x: (WIDTH / 3) * 2, y: 0, width: WIDTH / 3, height: HEIGHT },
        action: { type: 'message', text: 'ค้นหา ' },
      },
    ],
  };

  const res = await apiRequest(
    'api.line.me',
    '/v2/bot/richmenu',
    'POST',
    JSON.stringify(menu),
  );
  return res.richMenuId;
}

async function uploadImage(richMenuId, pngBuffer) {
  await apiRequest(
    'api-data.line.me',
    `/v2/bot/richmenu/${richMenuId}/content`,
    'POST',
    pngBuffer,
    'image/png',
  );
}

async function setDefault(richMenuId) {
  await apiRequest(
    'api.line.me',
    `/v2/bot/user/all/richmenu/${richMenuId}`,
    'POST',
    null,
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  try {
    console.log('1/4 Generating rich menu image…');
    const png = await drawRichMenu();
    const outPath = path.join(__dirname, 'rich-menu.png');
    fs.writeFileSync(outPath, png);
    console.log(`    saved preview → ${outPath}`);

    console.log('2/4 Creating rich menu on LINE…');
    const richMenuId = await createRichMenu();
    console.log(`    richMenuId = ${richMenuId}`);

    console.log('3/4 Uploading image…');
    await uploadImage(richMenuId, png);

    console.log('4/4 Setting as default for all users…');
    await setDefault(richMenuId);

    console.log('✅ Done! เปิด LINE → เมนูจะขึ้นที่ด้านล่างแชท');
    console.log('   (ผู้ใช้บางคนต้องปิด/เปิดแชทใหม่ 1 ครั้งเพื่อให้เมนูขึ้น)');
  } catch (err) {
    console.error('❌ Setup failed:', err.message);
    process.exit(1);
  }
})();
