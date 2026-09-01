/**
 * 수집기 + 카탈로그 생성기 자체 점검.
 *
 * 식스샵을 흉내 낸 로컬 페이지를 띄운다. 스크롤할 때마다 블록을 더 불러오는
 * 무한 스크롤 목록이 있고, 응답은 실제 마켓플레이스와 같은 Strapi 모양이다.
 * 수집기를 붙여 돌린 뒤 카탈로그를 만들어, 블록이 빠짐없이 들어갔는지 확인한다.
 *
 * 실행: npm run selftest
 */

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'out', 'marketplace');
const TMP = path.join(ROOT, 'out', 'selftest');

const PAGE_SIZE = 60;
const TOTAL = 300;
const STYLES = ['Natural', 'Fresh', 'Calm', 'Bubble', 'Healthy', 'Luminous', 'Pop'];
const CATEGORIES = ['메인 배너', '갤러리', '폼', '푸터', '리뷰'];

/** 실제 마켓플레이스와 같은 Strapi v4 모양: data[].attributes, 미디어는 중첩. */
function makeBlockPage(page) {
  const data = Array.from({ length: PAGE_SIZE }, (_, i) => {
    const n = page * PAGE_SIZE + i;
    return {
      id: n + 1,
      attributes: {
        blockId: `blk_${n}`,
        name: `테스트 블록 ${n} (${STYLES[n % STYLES.length]})`,
        publishedAt: '2026-01-01T00:00:00.000Z',
        // 실제 마켓플레이스는 카테고리·스타일·등급을 한 필드에 섞어서 준다.
        blockCategory: {
          data: [
            { attributes: { name: STYLES[n % STYLES.length].toLowerCase() } },
            { attributes: { name: '프리미어' } },
            { attributes: { name: CATEGORIES[n % CATEGORIES.length] } },
          ],
        },
        author: { data: { attributes: { name: '어쎔블네트웍스' } } },
        // 절반은 Strapi 미디어 관계로, 절반은 확장자 없는 CDN 주소 문자열로 준다.
        // 실제로 어느 쪽인지 모르는 채로 양쪽을 다 읽어낼 수 있어야 한다.
        ...(n % 2 === 0
          ? { thumbnail: { data: { attributes: { url: `https://example.test/thumb/${n}.png`, formats: {} } } } }
          : { blockPreviewImage: `https://cdn.example.test/i/${n}abc` }),
      },
    };
  });
  return { data, meta: { pagination: { page, pageSize: PAGE_SIZE, total: TOTAL } } };
}

function makeCategories() {
  return {
    data: CATEGORIES.map((name, i) => ({
      id: i + 1,
      attributes: { name, slug: `cat-${i}`, order: i },
    })),
  };
}

const HTML = `<!doctype html><meta charset="utf-8"><title>가짜 마켓플레이스</title>
<style>#grid{height:600px;overflow-y:auto;border:1px solid #ccc}.c{height:120px;border-bottom:1px solid #eee}</style>
<h1>마켓플레이스</h1><div id="grid"></div>
<script>
let page = 0, done = false, loading = false;
const grid = document.getElementById('grid');
fetch('/api/block-categories?sort[0]=order:asc');
async function load() {
  if (done || loading) return;
  loading = true;
  const r = await fetch('/api/blocks?sort=publishedAt:desc&pagination[page]=' + page);
  const j = await r.json();
  for (const b of j.data) {
    const d = document.createElement('div');
    d.className = 'c';
    d.textContent = b.attributes.name;
    grid.appendChild(d);
  }
  page++;
  if (page * ${PAGE_SIZE} >= ${TOTAL}) done = true;
  loading = false;
}
grid.addEventListener('scroll', () => {
  if (grid.scrollTop + grid.clientHeight > grid.scrollHeight - 200) load();
});
load();
</script>`;

const server = http.createServer((req, res) => {
  const json = (obj) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(obj));
  };

  if (req.url.startsWith('/api/blocks')) {
    return json(makeBlockPage(Number(new URL(req.url, 'http://x').searchParams.get('pagination[page]') ?? 0)));
  }
  if (req.url.startsWith('/api/block-categories')) return json(makeCategories());
  // 작고 무관한 응답. 걸러져야 한다.
  if (req.url.startsWith('/api/ping')) return json({ ok: true });

  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(HTML);
});

function run(args, env) {
  return new Promise((resolve) => {
    const p = spawn('node', args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: 'inherit' });
    p.on('exit', resolve);
  });
}

let failures = 0;
const check = (label, ok) => {
  console.log(`  ${ok ? '통과' : '실패'}  ${label}`);
  if (!ok) failures++;
};

async function main() {
  await fs.rm(OUT, { recursive: true, force: true });
  await fs.rm(TMP, { recursive: true, force: true });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  console.log(`\n가짜 마켓플레이스: http://127.0.0.1:${port}\n`);

  await run(['tools/marketplace-capture/capture.mjs'], {
    START_URL: `http://127.0.0.1:${port}/`,
    HEADLESS: '1',
    CAPTURE_AUTO: '1',
  });
  server.close();

  console.log('\n─── 수집 ───');
  const manifest = JSON.parse(await fs.readFile(path.join(OUT, 'manifest.json'), 'utf8'));
  const pages = manifest.responses.filter((r) => r.url.includes('/api/blocks'));
  check(`블록 응답 5건 수집 (실제 ${pages.length}건)`, pages.length === 5);
  check('카테고리 응답 수집', manifest.responses.some((r) => r.url.includes('/api/block-categories')));
  check('작고 무관한 /api/ping 은 제외됨', !manifest.responses.some((r) => r.url.includes('/api/ping')));

  const files = await fs.readdir(path.join(OUT, 'html'));
  const html = await fs.readFile(path.join(OUT, 'html', files[0]), 'utf8');
  check('자동 스크롤로 마지막 블록까지 로딩됨', html.includes(`테스트 블록 ${TOTAL - 1} `));

  // 실제 data/ 를 건드리지 않도록 임시 위치에 카탈로그를 만든다.
  await run(['tools/marketplace-capture/build-catalog.mjs'], { CATALOG_OUT: TMP });

  console.log('\n─── 카탈로그 ───');
  const cat = JSON.parse(await fs.readFile(path.join(TMP, 'sixshop-blocks.json'), 'utf8'));
  check(`블록 ${TOTAL}개 (실제 ${cat.blocks.length}개)`, cat.blocks.length === TOTAL);
  check(`카테고리 ${CATEGORIES.length}개 (실제 ${cat.categories.length}개)`, cat.categories.length === CATEGORIES.length);
  check('중복 없음', new Set(cat.blocks.map((b) => b.blockId)).size === cat.blocks.length);

  const sample = cat.blocks.find((b) => b.blockId === 'blk_0');
  check('스타일 인식 (Natural)', sample?.style === 'Natural');
  check('이름에서 스타일 떼어낸 본체', sample?.baseName === '테스트 블록 0');
  check('뒤섞인 태그에서 카테고리만 골라냄', JSON.stringify(sample?.categories) === JSON.stringify(['메인 배너']));
  check('공식 파트너 블록 표시', sample?.officialPartner === true && cat.counts.officialPartner === TOTAL);
  check('스타일 태그가 카테고리에 섞이지 않음', cat.blocks.every((b) => b.categories.every((c) => CATEGORIES.includes(c))));
  check('중첩된 제작자 관계를 풀어냄', sample?.author === '어쎔블네트웍스');
  check('중첩된 미디어에서 썸네일 URL 추출', sample?.thumbnail === 'https://example.test/thumb/0.png');
  check(
    '이름 모르는 필드의 확장자 없는 CDN 주소도 인식',
    cat.blocks.find((b) => b.blockId === 'blk_1')?.thumbnail === 'https://cdn.example.test/i/1abc',
  );
  check('빈 썸네일 없음', cat.blocks.every((b) => b.thumbnail));
  check('빈 카테고리 없음', cat.blocks.every((b) => b.categories.length));
  check(`스타일 ${STYLES.length}종 모두 인식`, Object.keys(cat.counts.byStyle).length === STYLES.length);
  check('카테고리 집계가 5개로 유지됨', Object.keys(cat.counts.byCategory).length === CATEGORIES.length);

  await fs.rm(TMP, { recursive: true, force: true });
  console.log(failures === 0 ? '\n전부 통과\n' : `\n실패 ${failures}건\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
