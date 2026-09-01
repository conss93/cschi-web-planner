/**
 * 마켓플레이스 API 에서 블록 목록을 직접 받아온다.
 *
 * 화면을 긁어 모으면 에디터가 요청한 필드만 얻게 된다. 실제로 에디터는
 * fields[] 로 blockId, name 정도만 받아가서 썸네일이 응답에 없다.
 * 여기서는 필드 제한 없이 관계까지 펼쳐서(populate) 페이지를 끝까지 돈다.
 *
 * 브라우저 안에서 fetch 하므로 로그인 세션(.auth)이 그대로 쓰인다.
 * 결과는 capture 와 같은 위치에 저장되어 build-catalog 가 함께 읽는다.
 *
 * 실행: npm run fetch
 */

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'out', 'marketplace');
const PROFILE = path.join(ROOT, '.auth', 'chromium');

const ORIGIN = process.env.MARKETPLACE_ORIGIN ?? 'https://marketplace.sixshop.io';
const PAGE_SIZE = Number(process.env.PAGE_SIZE ?? 100);
const MAX_PAGES = 60;

/**
 * populate 는 Strapi 설정에 따라 거부될 수 있어 넓은 것부터 차례로 시도한다.
 * 관계를 못 펼치면 썸네일을 못 얻으므로, 되는 것 중 가장 넓은 걸 쓴다.
 */
const POPULATE_ATTEMPTS = ['populate=*', 'populate=deep', ''];

async function apiGet(page, url) {
  return page.evaluate(async (u) => {
    try {
      const res = await fetch(u, { credentials: 'include', headers: { accept: 'application/json' } });
      const text = await res.text();
      return { status: res.status, text };
    } catch (err) {
      return { status: 0, text: String(err) };
    }
  }, url);
}

function countRecords(payload) {
  const raw = payload?.data ?? payload?.results ?? payload;
  return Array.isArray(raw) ? raw.length : 0;
}

async function pullAll(page, endpoint, populate, label) {
  const saved = [];
  let total = null;

  for (let p = 1; p <= MAX_PAGES; p++) {
    const qs = [
      `pagination[page]=${p}`,
      `pagination[pageSize]=${PAGE_SIZE}`,
      populate,
      'sort[0]=publishedAt:desc',
    ]
      .filter(Boolean)
      .join('&');
    const url = `${ORIGIN}${endpoint}?${qs}`;

    const { status, text } = await apiGet(page, url);
    if (status !== 200) {
      console.log(`  ${label} ${p}쪽: HTTP ${status}`);
      return { ok: false, saved, status };
    }

    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      console.log(`  ${label} ${p}쪽: JSON 아님`);
      return { ok: false, saved, status: -1 };
    }

    const n = countRecords(payload);
    total ??= payload?.meta?.pagination?.total ?? null;

    const file = `direct-${label}-${String(p).padStart(2, '0')}.json`;
    await fs.writeFile(path.join(OUT, 'api', file), text);
    saved.push({ file, url, status, bytes: Buffer.byteLength(text), candidate: true, hints: ['direct'] });

    const totalNote = total != null ? ` / 전체 ${total}` : '';
    console.log(`  ${label} ${p}쪽: ${n}건${totalNote}`);

    if (n === 0 || n < PAGE_SIZE) break;
    if (total != null && p * PAGE_SIZE >= total) break;
  }

  return { ok: true, saved };
}

async function main() {
  await fs.mkdir(path.join(OUT, 'api'), { recursive: true });

  const context = await chromium.launchPersistentContext(PROFILE, {
    headless: process.env.HEADLESS === '1',
    viewport: { width: 1280, height: 900 },
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });

  const page = context.pages()[0] ?? (await context.newPage());

  // API 와 같은 출처에 올라타야 쿠키가 실린다.
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' }).catch(() => {});

  console.log(`\n${ORIGIN} 에서 받아옵니다. 한 쪽에 ${PAGE_SIZE}건씩.\n`);

  // 어떤 populate 가 통하는지 한 쪽만 받아보고 정한다.
  let populate = null;
  for (const attempt of POPULATE_ATTEMPTS) {
    const probe = `${ORIGIN}/api/blocks?pagination[pageSize]=1&${attempt}`;
    const { status, text } = await apiGet(page, probe);
    if (status === 200) {
      populate = attempt;
      const hasMedia = /"url"\s*:\s*"[^"]+\.(png|jpe?g|webp|avif)/i.test(text);
      console.log(`populate: ${attempt || '(없음)'} — 이미지 URL ${hasMedia ? '보임' : '안 보임'}`);
      if (hasMedia || attempt === '') break;
    } else if (status === 401 || status === 403) {
      console.log(`\n권한 없음 (HTTP ${status}). 브라우저에서 식스샵에 로그인한 뒤 다시 실행하세요.`);
      await context.close();
      process.exit(1);
    }
  }

  if (populate === null) {
    console.log('\nAPI 응답을 받지 못했습니다. 주소가 바뀌었을 수 있습니다.');
    console.log('out/marketplace/manifest.json 에서 실제 주소를 확인하고 MARKETPLACE_ORIGIN 으로 넘기세요.');
    await context.close();
    process.exit(1);
  }

  const blocks = await pullAll(page, '/api/blocks', populate, 'blocks');
  const cats = await pullAll(page, '/api/block-categories', populate, 'categories');

  // build-catalog 가 읽을 수 있도록 기존 목록에 이어 붙인다.
  const manifestPath = path.join(OUT, 'manifest.json');
  let manifest = { responses: [] };
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch {
    // 수집 없이 바로 받아온 경우
  }

  const added = [...blocks.saved, ...cats.saved];
  const keep = manifest.responses.filter((r) => !r.file?.startsWith('direct-'));
  manifest.responses = [...keep, ...added];
  manifest.fetchedAt = new Date().toISOString();
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`\n${added.length}개 파일 저장. 이어서 npm run catalog 를 실행하세요.\n`);

  await context.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
