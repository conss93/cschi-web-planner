/**
 * 캔버스 화면을 진짜 브라우저에서 확인한다.
 *
 * 휠 동작과 가로 스크롤은 코드를 읽어서는 알 수 없다. 실제로 굴려 봐야
 * 캔버스만 움직이는지 창까지 따라 움직이는지 알 수 있고, 실제로 이 검사가
 * 없어서 세 가지를 놓쳤다.
 *
 * 서버가 떠 있어야 한다. 기획서는 가짜로 끼워 넣으므로 DB 는 필요 없다.
 *   PLANNER_PASSWORD=... npm run start &
 *   BASE=http://localhost:3000 PLANNER_PASSWORD=... npm run test:canvas
 */

import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const PASSWORD = process.env.PLANNER_PASSWORD ?? '';
const CHROME = process.env.CHROME_PATH ?? undefined;

const svg = (w, h, hue) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="hsl(${hue},30%,88%)"/></svg>`,
  );

const s = (purpose, key, tone = false) => ({
  purpose, blockId: 'b', blockName: '블록', blockStyle: 'Calm', officialPartner: true,
  thumbnail: `https://marketplace.sixshop.io/uploads/${key}.png`,
  note: '메모', copy: '문구', needsCustomTone: tone,
});

const page5 = (i, title, slug) => ({
  index: i, title, slug,
  sections: [s('공통 헤더', 'a'), s('메인 배너', 'b'), s('본문', 'c', true), s('공통 푸터', 'e')],
});

const plan = {
  id: 'demo', company: '청새카페', status: 'done', share_token: 'tok',
  data: {
    strategy: { style: 'Calm' },
    architecture: { pages: [] },
    pages: [page5(0, '홈', 'home'), page5(1, '메뉴', 'menu'), page5(2, '공간 소개', 'about')],
  },
};

const sizes = { a: [1200, 120], b: [1200, 700], c: [1200, 520], e: [1200, 320] };

let fail = 0;
const check = (label, ok, extra = '') => {
  console.log(`  ${ok ? '통과' : '실패'}  ${label}${extra ? ` — ${extra}` : ''}`);
  if (!ok) fail++;
};

if (!PASSWORD) {
  console.error('PLANNER_PASSWORD 를 넣어 주세요. 서버에 넣은 것과 같아야 합니다.');
  process.exit(2);
}

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.route('**/api/plans/demo?raw=1', (r) => r.fulfill({ json: plan }));
await page.route('**/api/plans/demo', (r) => r.fulfill({ json: plan }));
await page.route('**/api/thumb**', (r) => {
  const key = new URL(r.request().url()).searchParams.get('src').match(/([a-z])\.png/)[1];
  const [w, h] = sizes[key];
  return r.fulfill({ contentType: 'image/svg+xml', body: svg(w, h, key.charCodeAt(0) * 31) });
});

await page.goto(`${BASE}/login`);
await page.fill('input[type=password]', PASSWORD);
await page.click('button.btn');
await page.waitForURL(`${BASE}/`);

/* ── 가로 스크롤이 생기지 않아야 한다 ─────────────────────── */

const overflow = () =>
  page.evaluate(() => ({
    doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));

for (const [label, url] of [['목록', '/'], ['새 기획서', '/new'], ['캔버스', '/plans/demo/canvas']]) {
  await page.goto(BASE + url);
  await page.waitForTimeout(500);
  const o = await overflow();
  check(`${label} 화면에 가로 스크롤 없음`, o.doc <= 0 && o.body <= 0, JSON.stringify(o));
}

/* ── 캔버스 휠 ───────────────────────────────────────────── */

await page.goto(`${BASE}/plans/demo/canvas`);
await page.waitForSelector('.pagecard');
await page.waitForTimeout(900);

const stageXY = () =>
  page.evaluate(() => {
    const m = new DOMMatrix(getComputedStyle(document.querySelector('.canvas-stage')).transform);
    return { x: Math.round(m.e), y: Math.round(m.f), scale: Number(m.a.toFixed(3)) };
  });
const winScroll = () => page.evaluate(() => ({ x: scrollX, y: scrollY }));

const box = await page.locator('.canvas-frame').boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;
await page.mouse.move(cx, cy);

// 그냥 휠 — 캔버스만 세로로 움직이고 창은 가만히
let before = await stageXY();
await page.mouse.wheel(0, 300);
await page.waitForTimeout(200);
let after = await stageXY();
let scroll = await winScroll();
check('휠로 캔버스가 세로로 움직임', after.y < before.y, `${before.y} → ${after.y}`);
check('휠에 창이 따라 움직이지 않음', scroll.x === 0 && scroll.y === 0, JSON.stringify(scroll));

// Shift+휠 — 가로로
before = await stageXY();
await page.keyboard.down('Shift');
await page.mouse.wheel(0, 300);
await page.keyboard.up('Shift');
await page.waitForTimeout(200);
after = await stageXY();
scroll = await winScroll();
check('Shift+휠로 캔버스가 가로로 움직임', after.x < before.x, `${before.x} → ${after.x}`);
check('Shift+휠에 세로는 그대로', after.y === before.y, `${before.y} → ${after.y}`);
check('Shift+휠에 창이 따라 움직이지 않음', scroll.x === 0 && scroll.y === 0, JSON.stringify(scroll));

// Ctrl+휠 — 배율만
before = await stageXY();
await page.keyboard.down('Control');
await page.mouse.wheel(0, -300);
await page.keyboard.up('Control');
await page.waitForTimeout(200);
after = await stageXY();
scroll = await winScroll();
check('Ctrl+휠로 캔버스가 확대됨', after.scale > before.scale, `${before.scale} → ${after.scale}`);
check('Ctrl+휠에 창이 따라 움직이지 않음', scroll.x === 0 && scroll.y === 0, JSON.stringify(scroll));

// 커서를 축으로 확대하는지: 커서 아래 지점이 제자리에 남아야 한다
const mx = cx - box.x;
const my = cy - box.y;
const pointBefore = { x: (mx - before.x) / before.scale, y: (my - before.y) / before.scale };
const pointAfter = { x: (mx - after.x) / after.scale, y: (my - after.y) / after.scale };
check(
  '커서 아래 지점이 제자리에 남음',
  Math.abs(pointBefore.x - pointAfter.x) < 1 && Math.abs(pointBefore.y - pointAfter.y) < 1,
  `${JSON.stringify(pointBefore)} vs ${JSON.stringify(pointAfter)}`,
);

console.log(fail === 0 ? '\n전부 통과\n' : `\n실패 ${fail}건\n`);
await browser.close();
process.exit(fail ? 1 : 0);
