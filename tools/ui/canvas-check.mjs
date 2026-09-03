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

// 드래그로 옮길 때 글자가 잡히면 안 된다
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx - 260, cy - 160, { steps: 10 });
await page.mouse.up();
const selected = await page.evaluate(() => getSelection().toString());
check('드래그해도 글자가 선택되지 않음', selected === '', JSON.stringify(selected));

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

/* ── 블록을 누르면 옆 패널이 열린다 ─────────────────────── */

await page.click('text=전체 보기');
await page.waitForTimeout(400);

// 끌어서 옮긴 것은 클릭이 아니다
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx - 120, cy - 60, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(150);
check('끌어서 옮긴 것은 패널을 열지 않음', (await page.locator('.slotpanel').count()) === 0);

// 블록을 누르면 열린다
const slab = page.locator('[data-slot="0:1"]');
await slab.click({ position: { x: 20, y: 20 } });
await page.waitForSelector('.slotpanel');
check('블록을 누르면 옆 패널이 열림', true);
check('그 자리가 몇 번째인지 보임', (await page.textContent('.slotpanel-head .where')).includes('02'));
check('아직 저장할 것은 없음', await page.locator('nav .btn:not(.ghost)').isDisabled());

// 고치면 저장 버튼이 살아난다
await page.fill('.slotpanel .purpose', '손으로 고친 자리 이름');
await page.waitForTimeout(150);
check('고치면 저장 버튼이 살아남', !(await page.locator('nav .btn:not(.ghost)').isDisabled()));
check(
  '캔버스의 이름표도 같이 바뀜',
  (await page.textContent('[data-slot="0:1"] .slab-label .what')) === '손으로 고친 자리 이름',
);

// 아래로 한 칸
await page.click('.slotpanel .slotactions .icon >> nth=1');
await page.waitForTimeout(200);
check(
  '아래로 옮기면 캔버스에서도 자리가 바뀜',
  (await page.textContent('[data-slot="0:2"] .slab-label .what')) === '손으로 고친 자리 이름',
);
check('패널이 옮긴 자리를 따라감', (await page.textContent('.slotpanel-head .where')).includes('03'));

// 다른 페이지로 보내기
await page.selectOption('.slotpanel .sendto', { index: 1 });
await page.waitForTimeout(250);
check('다른 페이지로 보내면 패널이 닫힘', (await page.locator('.slotpanel').count()) === 0);
check(
  '보낸 자리가 그 페이지 맨 아래에 붙음',
  (await page.textContent('[data-slot="1:4"] .slab-label .what')) === '손으로 고친 자리 이름',
);

// 되돌리기
await page.click('text=되돌리기');
await page.waitForTimeout(250);
check('되돌리면 원래대로', (await page.locator('[data-slot="1:4"]').count()) === 0);
check('되돌리면 저장할 것이 없어짐', await page.locator('nav .btn:not(.ghost)').isDisabled());

console.log(fail === 0 ? '\n전부 통과\n' : `\n실패 ${fail}건\n`);
await browser.close();
process.exit(fail ? 1 : 0);
