/**
 * 수집기 자체 점검.
 *
 * 식스샵을 흉내 낸 로컬 페이지를 띄운다. 스크롤할 때마다 블록을 더 불러오는
 * 무한 스크롤 목록과, 블록 이름이 담긴 JSON 응답을 갖고 있다.
 * 수집기를 그 페이지에 붙여 돌린 뒤, 블록 목록을 실제로 잡아냈는지 확인한다.
 *
 * 실행: npm run selftest
 */

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'out', 'marketplace');

const PAGE_SIZE = 60;
const TOTAL = 300;
const STYLES = ['Natural', 'Fresh', 'Calm', 'Bubble', 'Healthy', 'Luminous', 'Pop'];

function makePage(page) {
  return Array.from({ length: PAGE_SIZE }, (_, i) => {
    const n = page * PAGE_SIZE + i;
    return {
      id: `blk_${n}`,
      name: `테스트 블록 ${n} (${STYLES[n % STYLES.length]})`,
      category: '메인 배너',
      author: '어쎔블네트웍스',
      thumbnail: `https://example.test/thumb/${n}.png`,
    };
  });
}

const HTML = `<!doctype html><meta charset="utf-8"><title>가짜 마켓플레이스</title>
<style>#grid{height:600px;overflow-y:auto;border:1px solid #ccc}.c{height:120px;border-bottom:1px solid #eee}</style>
<h1>마켓플레이스</h1><div id="grid"></div>
<script>
let page = 0, done = false, loading = false;
const grid = document.getElementById('grid');
async function load() {
  if (done || loading) return;
  loading = true;
  const r = await fetch('/api/marketplace/blocks?page=' + page);
  const j = await r.json();
  for (const b of j.blocks) {
    const d = document.createElement('div');
    d.className = 'c';
    d.textContent = b.name + ' by ' + b.author;
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
  if (req.url.startsWith('/api/marketplace/blocks')) {
    const page = Number(new URL(req.url, 'http://x').searchParams.get('page') ?? 0);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ page, total: TOTAL, blocks: makePage(page) }));
    return;
  }
  if (req.url.startsWith('/api/ping')) {
    // 작고 무관한 응답. 걸러져야 한다.
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(HTML);
});

function run(cmd, args, env) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: 'inherit',
    });
    p.on('exit', (code) => resolve(code));
  });
}

const check = (label, ok) => {
  console.log(`  ${ok ? '통과' : '실패'}  ${label}`);
  return ok;
};

async function main() {
  await fs.rm(OUT, { recursive: true, force: true });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  console.log(`\n가짜 마켓플레이스: http://127.0.0.1:${port}\n`);

  await run('node', ['tools/marketplace-capture/capture.mjs'], {
    START_URL: `http://127.0.0.1:${port}/`,
    HEADLESS: '1',
    CAPTURE_AUTO: '1',
  });

  server.close();

  console.log('\n검증:');
  const manifest = JSON.parse(await fs.readFile(path.join(OUT, 'manifest.json'), 'utf8'));
  const candidates = manifest.responses.filter((r) => r.candidate);

  // 300개를 60개씩 나눠 주므로 응답은 5건이어야 한다.
  const pages = candidates.filter((c) => c.url.includes('/api/marketplace/blocks'));
  let ok = true;
  ok = check(`블록 목록 응답 5건 모두 수집 (실제 ${pages.length}건)`, pages.length === 5) && ok;
  ok = check('작고 무관한 /api/ping 응답은 제외됨', !manifest.responses.some((r) => r.url.includes('/api/ping'))) && ok;

  // 저장된 파일에 블록이 실제로 들어있는지
  const seen = new Set();
  for (const p of pages) {
    const body = JSON.parse(await fs.readFile(path.join(OUT, 'api', p.file), 'utf8'));
    for (const b of body.blocks) seen.add(b.id);
  }
  ok = check(`블록 ${TOTAL}개 전부 확보 (실제 ${seen.size}개)`, seen.size === TOTAL) && ok;

  // 자동 스크롤이 끝까지 내려가 HTML 에도 마지막 블록이 있는지
  const files = await fs.readdir(path.join(OUT, 'html'));
  const html = await fs.readFile(path.join(OUT, 'html', files[0]), 'utf8');
  ok = check('HTML 스냅샷에 마지막 블록이 포함됨 (자동 스크롤 동작)', html.includes(`테스트 블록 ${TOTAL - 1} `)) && ok;

  console.log(ok ? '\n전부 통과\n' : '\n실패한 항목이 있음\n');
  process.exit(ok ? 0 : 1);
}

main();
