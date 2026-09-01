/**
 * 식스샵 프로 마켓플레이스 블록 목록 수집기
 *
 * 화면 조작은 사람이 직접 한다. 이 스크립트는 브라우저가 주고받는 JSON 응답을
 * 전부 받아 적고, 요청할 때마다 현재 화면의 HTML을 통째로 저장한다.
 * 마켓플레이스의 API 주소나 DOM 구조를 미리 알 필요가 없다.
 *
 * 실행: npm run capture
 */

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'out', 'marketplace');
const PROFILE = path.join(ROOT, '.auth', 'chromium');
const START_URL = process.env.START_URL ?? 'https://pro.sixshop.com/';

// 블록 목록으로 의심되는 응답을 가려내는 단서.
// 하나라도 걸리면 candidate 로 표시해 두고, 나중에 사람이 그것부터 열어본다.
const HINTS = [
  '블록', 'block', 'marketplace', 'thumbnail', 'thumbUrl',
  '(Natural)', '(Fresh)', '(Calm)', '(Bubble)', '(Healthy)', '(Luminous)', '(Pop)',
];

const MIN_BODY_BYTES = 400;   // 이보다 작은 JSON 은 설정/핑 응답일 가능성이 높다
const MAX_BODY_BYTES = 40 * 1024 * 1024;

const manifest = [];
let seq = 0;
let snapshotSeq = 0;

function slug(url) {
  try {
    const u = new URL(url);
    return (u.pathname + u.search)
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'root';
  } catch {
    return 'unparsed';
  }
}

async function recordResponse(res) {
  const req = res.request();
  const url = res.url();

  if (!/^https?:/.test(url)) return;

  const ctype = (res.headers()['content-type'] ?? '').toLowerCase();
  const looksJson = ctype.includes('json') || /\.json(\?|$)/.test(url);
  if (!looksJson) return;

  let body;
  try {
    body = await res.text();
  } catch {
    return; // 리다이렉트, 캐시 히트 등 본문을 읽을 수 없는 응답
  }

  const bytes = Buffer.byteLength(body);
  if (bytes < MIN_BODY_BYTES || bytes > MAX_BODY_BYTES) return;

  const hits = HINTS.filter((h) => body.includes(h));
  const n = String(++seq).padStart(3, '0');
  const file = `${n}__${slug(url)}.json`;

  await fs.writeFile(path.join(OUT, 'api', file), body);

  manifest.push({
    file,
    url,
    method: req.method(),
    status: res.status(),
    bytes,
    candidate: hits.length > 0,
    hints: hits,
  });

  const mark = hits.length ? '★' : ' ';
  console.log(`${mark} [${n}] ${(bytes / 1024).toFixed(0).padStart(5)} KB  ${url.slice(0, 110)}`);
}

/** 보이는 스크롤 컨테이너 중 가장 긴 것을 끝까지 내린다. */
async function autoScroll(context) {
  const targets = context.pages().flatMap((p) => p.frames());
  let scrolled = 0;

  for (const frame of targets) {
    try {
      const did = await frame.evaluate(async () => {
        const scrollables = [...document.querySelectorAll('*')].filter((el) => {
          const overflow = getComputedStyle(el).overflowY;
          return (
            (overflow === 'auto' || overflow === 'scroll') &&
            el.scrollHeight - el.clientHeight > 400 &&
            el.getBoundingClientRect().height > 200
          );
        });

        const el =
          scrollables.sort((a, b) => b.scrollHeight - a.scrollHeight)[0] ??
          document.scrollingElement;
        if (!el) return false;

        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        let last = -1;
        // 새 항목이 더 안 붙을 때까지 내린다. 최대 400회로 무한루프를 막는다.
        for (let i = 0; i < 400 && el.scrollHeight !== last; i++) {
          last = el.scrollHeight;
          el.scrollTop = el.scrollHeight;
          await sleep(350);
        }
        return true;
      });
      if (did) scrolled++;
    } catch {
      // 프레임이 사라졌거나 교차 출처인 경우
    }
  }
  console.log(`\n  스크롤 완료 (${scrolled}개 영역)\n`);
}

/** 열려 있는 모든 페이지/프레임의 HTML 을 저장한다. */
async function snapshot(context, label) {
  const n = String(++snapshotSeq).padStart(2, '0');
  const tag = (label || 'snapshot').replace(/[^\w가-힣.-]+/g, '_').slice(0, 40);
  let count = 0;

  for (const page of context.pages()) {
    for (const frame of page.frames()) {
      try {
        const html = await frame.content();
        if (html.length < 2000) continue;
        const name = `${n}__${tag}__f${count}.html`;
        await fs.writeFile(path.join(OUT, 'html', name), html);
        count++;
      } catch {
        // 접근 불가 프레임
      }
    }
  }
  console.log(`\n  HTML ${count}개 저장 → out/marketplace/html/ (${n}__${tag})\n`);
}

async function writeManifest() {
  const candidates = manifest.filter((m) => m.candidate);
  await fs.writeFile(
    path.join(OUT, 'manifest.json'),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        total: manifest.length,
        candidates: candidates.length,
        responses: manifest,
      },
      null,
      2,
    ),
  );

  console.log('\n' + '─'.repeat(64));
  console.log(`JSON 응답 ${manifest.length}건 저장, 그중 유력 후보 ${candidates.length}건`);
  if (candidates.length) {
    console.log('\n유력 후보 (★ 표시된 것들):');
    for (const c of candidates
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 12)) {
      console.log(`  ${(c.bytes / 1024).toFixed(0).padStart(6)} KB  ${c.file}`);
      console.log(`            ${c.url.slice(0, 100)}`);
    }
  }
  console.log(`\n저장 위치: ${OUT}`);
  console.log('─'.repeat(64) + '\n');
}

const HELP = `
┌────────────────────────────────────────────────────────────┐
│  식스샵 마켓플레이스 수집기                                │
├────────────────────────────────────────────────────────────┤
│  브라우저 창에서 직접 조작하세요.                          │
│                                                            │
│   1. 로그인 (첫 실행 때만 — 이후 세션이 유지됩니다)        │
│   2. 에디터 열기 → 블록 추가 → 마켓플레이스                │
│   3. 아래 키로 수집                                        │
│                                                            │
│  이 터미널에서 누르는 키:                                  │
│                                                            │
│   a   목록을 끝까지 자동 스크롤 (블록이 다 로딩됨)         │
│   s   지금 화면의 HTML 저장                                │
│   q   저장하고 종료                                        │
│                                                            │
│  JSON 응답은 아무 키도 안 눌러도 자동으로 다 기록됩니다.   │
│  ★ 표시가 뜨면 블록 목록일 가능성이 높은 응답입니다.       │
└────────────────────────────────────────────────────────────┘
`;

async function main() {
  await fs.mkdir(path.join(OUT, 'api'), { recursive: true });
  await fs.mkdir(path.join(OUT, 'html'), { recursive: true });
  await fs.mkdir(PROFILE, { recursive: true });

  // CAPTURE_AUTO: 사람 없이 한 바퀴 돌고 끝낸다 (자체 점검 및 재수집용).
  const auto = process.env.CAPTURE_AUTO === '1';
  const headless = process.env.HEADLESS === '1';

  const context = await chromium.launchPersistentContext(PROFILE, {
    headless,
    viewport: headless ? { width: 1600, height: 1000 } : null,
    args: ['--window-size=1600,1000'],
    // 별도 위치에 크롬을 두고 쓰는 환경용 탈출구. 보통은 비워둔다.
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });

  context.on('response', (res) => {
    recordResponse(res).catch(() => {});
  });

  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(START_URL).catch(() => {
    console.log('첫 페이지 로딩 실패 — 브라우저에서 직접 주소를 입력하세요.');
  });

  if (auto) {
    await page.waitForLoadState('networkidle').catch(() => {});
    await autoScroll(context).catch(() => {});
    await snapshot(context, 'auto').catch(() => {});
    await writeManifest();
    await context.close();
    process.exit(0);
  }

  console.log(HELP);

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  let busy = false;
  await new Promise((resolve) => {
    process.stdin.on('keypress', async (str, key) => {
      if (key.ctrl && key.name === 'c') return resolve();
      if (busy) return;

      if (key.name === 'a') {
        busy = true;
        console.log('\n  스크롤 중… 목록이 길면 1~2분 걸립니다.');
        await autoScroll(context).catch(() => {});
        busy = false;
      } else if (key.name === 's') {
        busy = true;
        await snapshot(context, 'manual').catch(() => {});
        busy = false;
      } else if (key.name === 'q') {
        resolve();
      }
    });
  });

  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  await snapshot(context, 'final').catch(() => {});
  await writeManifest();
  await context.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
