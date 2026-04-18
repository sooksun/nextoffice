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

  // Vertical dividers (4 columns)
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 3;
  for (let i = 1; i < 4; i++) {
    const x = (WIDTH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(x, 120);
    ctx.lineTo(x, HEIGHT - 120);
    ctx.stroke();
  }

  // Icons drawn with canvas primitives (no emoji font dependency)
  const icons = {
    dashboard: (cx, cy, s) => {
      // 2x2 grid of rounded squares
      ctx.fillStyle = '#ffffff';
      const g = s * 0.35;
      const gap = s * 0.12;
      const r = s * 0.08;
      const positions = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
      positions.forEach(([dx, dy]) => {
        const x = cx + dx * (g / 2 + gap / 2) - g / 2;
        const y = cy + dy * (g / 2 + gap / 2) - g / 2;
        roundRect(x, y, g, g, r);
        ctx.fill();
      });
    },
    tasks: (cx, cy, s) => {
      // Clipboard: outline + checkmark line
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = s * 0.08;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // Outer rectangle
      const w = s * 0.7;
      const h = s * 0.85;
      roundRect(cx - w / 2, cy - h / 2, w, h, s * 0.1);
      ctx.stroke();
      // Top clip
      ctx.fillStyle = '#ffffff';
      const cw = s * 0.35;
      const ch = s * 0.15;
      roundRect(cx - cw / 2, cy - h / 2 - ch / 2, cw, ch, s * 0.05);
      ctx.fill();
      // Checkmark
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.18, cy + s * 0.05);
      ctx.lineTo(cx - s * 0.05, cy + s * 0.2);
      ctx.lineTo(cx + s * 0.22, cy - s * 0.12);
      ctx.stroke();
    },
    search: (cx, cy, s) => {
      // Magnifying glass
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = s * 0.08;
      ctx.lineCap = 'round';
      // Circle
      ctx.beginPath();
      ctx.arc(cx - s * 0.1, cy - s * 0.1, s * 0.3, 0, Math.PI * 2);
      ctx.stroke();
      // Handle
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.13, cy + s * 0.13);
      ctx.lineTo(cx + s * 0.33, cy + s * 0.33);
      ctx.stroke();
    },
    clock: (cx, cy, s) => {
      // Analog clock — circle + two hands
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = s * 0.08;
      ctx.lineCap = 'round';
      // Outer circle
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.38, 0, Math.PI * 2);
      ctx.stroke();
      // Hour hand (pointing ~10 o'clock)
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx - s * 0.16, cy - s * 0.1);
      ctx.stroke();
      // Minute hand (pointing up, 12 o'clock)
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, cy - s * 0.24);
      ctx.stroke();
    },
  };

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  const cells = [
    { iconFn: icons.dashboard, label: 'แดชบอร์ด', sub: 'ภาพรวมงาน' },
    { iconFn: icons.tasks, label: 'งานของฉัน', sub: 'หนังสือค้าง' },
    { iconFn: icons.clock, label: 'ลงเวลา', sub: 'เข้า-ออก งาน' },
    { iconFn: icons.search, label: 'ค้นหา', sub: 'เลขที่ / หัวเรื่อง' },
  ];

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  cells.forEach((cell, i) => {
    const cx = WIDTH / 4 / 2 + (WIDTH / 4) * i;
    const cy = HEIGHT / 2;

    // Circular icon background
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.arc(cx, cy - 140, 130, 0, Math.PI * 2);
    ctx.fill();

    // Icon drawing (smaller since 4 columns are narrower)
    cell.iconFn(cx, cy - 140, 220);

    // Label (Thai) — smaller to fit narrower columns
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 78px SarabunBold, sans-serif';
    ctx.fillText(cell.label, cx, cy + 90);

    // Sub label
    ctx.font = '42px Sarabun, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(cell.sub, cx, cy + 160);
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
        bounds: { x: 0, y: 0, width: WIDTH / 4, height: HEIGHT },
        action: { type: 'uri', uri: liffUrl },
      },
      // Column 2 — My Tasks → LIFF (dashboard shows my-tasks section)
      {
        bounds: { x: WIDTH / 4, y: 0, width: WIDTH / 4, height: HEIGHT },
        action: { type: 'uri', uri: liffUrl },
      },
      // Column 3 — Check-in/out → LIFF /checkin
      {
        bounds: { x: (WIDTH / 4) * 2, y: 0, width: WIDTH / 4, height: HEIGHT },
        action: { type: 'uri', uri: `${liffUrl}/checkin` },
      },
      // Column 4 — Search → open keyboard prefilled with "ค้นหา "
      {
        bounds: { x: (WIDTH / 4) * 3, y: 0, width: WIDTH / 4, height: HEIGHT },
        action: {
          type: 'postback',
          data: 'action=search-prompt',
          displayText: 'ค้นหาหนังสือ',
          inputOption: 'openKeyboard',
          fillInText: 'ค้นหา ',
        },
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
