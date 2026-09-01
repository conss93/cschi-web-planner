/**
 * 수집한 응답들을 하나의 블록 카탈로그로 합친다.
 *
 * out/marketplace/api/ 에 흩어져 있는 /api/blocks, /api/block-categories 응답을
 * 읽어 blockId 기준으로 중복을 제거하고, 기획 에이전트가 쓸 형태로 정리한다.
 *
 * 마켓플레이스는 Strapi 로 돌아가는데 버전에 따라 응답 모양이 다르므로
 * (v4 는 data[].attributes, v5 는 data[] 평면) 양쪽을 모두 받아들인다.
 *
 * 실행: npm run catalog
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CAPTURED = path.join(ROOT, 'out', 'marketplace');
const DATA = process.env.CATALOG_OUT
  ? path.resolve(process.env.CATALOG_OUT)
  : path.join(ROOT, 'data');

/** Strapi 응답에서 레코드 배열을 꺼낸다. 모양이 여러 가지라 순서대로 시도한다. */
function extractRecords(payload) {
  const body = Array.isArray(payload) ? { data: payload } : payload;
  if (!body || typeof body !== 'object') return [];

  const raw = body.data ?? body.results ?? body.items ?? body.blocks ?? null;
  if (!Array.isArray(raw)) return [];

  // v4 는 { id, attributes: {...} }, v5 는 필드가 평면으로 온다.
  return raw
    .filter((r) => r && typeof r === 'object')
    .map((r) => (r.attributes && typeof r.attributes === 'object'
      ? { id: r.id, ...r.attributes }
      : r));
}

// 이미지를 담고 있을 법한 필드 이름. 실제 이름을 모르므로 넓게 잡되,
// preview 와 demo 는 이미지가 아니라 데모 페이지 주소라서 넣지 않는다.
// previewImage 처럼 image 가 붙은 이름은 아래 규칙에 그대로 걸린다.
const IMAGE_KEY = /thumb|image|cover|media|screenshot|capture|poster/i;

/**
 * Strapi 미디어 필드는 중첩이 깊고 버전마다 다르다. 안에서 URL 을 찾아 꺼낸다.
 * CDN 주소는 확장자가 없는 경우가 흔해서, 이미지로 보이는 필드 안에 있으면
 * 확장자를 따지지 않고 URL 로 인정한다.
 */
function mediaUrl(node, depth = 0) {
  if (!node || depth > 6) return null;
  if (typeof node === 'string') {
    return /^(https?:\/\/|\/)\S+$/.test(node.trim()) ? node.trim() : null;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = mediaUrl(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== 'object') return null;

  for (const key of ['url', 'src', 'href']) {
    if (typeof node[key] === 'string' && node[key].trim()) return node[key].trim();
  }
  for (const key of ['data', 'attributes', 'formats', 'large', 'medium', 'small', 'thumbnail']) {
    if (node[key]) {
      const found = mediaUrl(node[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

// 업로드 프로바이더가 local 이라 파일을 Strapi 서버가 직접 서빙한다.
// 그래서 응답의 url 이 /uploads/... 상대경로로 오고, 앞에 원본 주소를 붙여야 열린다.
const MEDIA_ORIGIN = (process.env.MEDIA_ORIGIN ?? 'https://marketplace.sixshop.io').replace(/\/+$/, '');

const absolutize = (url) =>
  !url ? null : /^https?:\/\//.test(url) ? url : `${MEDIA_ORIGIN}/${url.replace(/^\/+/, '')}`;

/** 미디어 객체(그 안에 url 과 formats 를 가진 것)를 찾아 꺼낸다. */
function mediaNode(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = mediaNode(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof node.url === 'string') return node;
  for (const key of ['data', 'attributes']) {
    if (node[key]) {
      const found = mediaNode(node[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 필드 이름을 모르므로 이미지처럼 보이는 필드를 전부 훑는다.
 * Strapi 가 크기별 이미지를 미리 만들어 두므로, 목록에 깔 용도로는 medium 을
 * 쓰고 원본은 상세보기용으로 따로 남긴다. GIF 처럼 formats 가 없는 것도 있다.
 */
function findImages(rec) {
  for (const [key, value] of Object.entries(rec)) {
    if (!IMAGE_KEY.test(key)) continue;

    const node = mediaNode(value);
    if (node) {
      const f = node.formats ?? {};
      return {
        thumbnail: absolutize(f.medium?.url ?? f.small?.url ?? f.thumbnail?.url ?? node.url),
        imageUrl: absolutize(node.url),
      };
    }

    // 미디어 객체가 아니라 주소 문자열만 들어있는 경우
    const plain = mediaUrl(value);
    if (plain) return { thumbnail: absolutize(plain), imageUrl: absolutize(plain) };
  }
  return { thumbnail: null, imageUrl: null };
}

/** 관계 필드에서 사람이 읽을 이름들을 꺼낸다. 값이 여러 개일 수 있다. */
function relationNames(node, depth = 0, acc = []) {
  if (!node || depth > 5) return acc;
  if (typeof node === 'string') {
    const s = node.trim();
    if (s) acc.push(s);
    return acc;
  }
  if (Array.isArray(node)) {
    for (const item of node) relationNames(item, depth + 1, acc);
    return acc;
  }
  if (typeof node !== 'object') return acc;

  for (const key of ['name', 'title', 'label', 'displayName', 'nickname']) {
    if (typeof node[key] === 'string' && node[key].trim()) {
      acc.push(node[key].trim());
      return acc;
    }
  }
  for (const key of ['data', 'attributes']) {
    if (node[key]) relationNames(node[key], depth + 1, acc);
  }
  return acc;
}

/** 값이 하나뿐인 관계 (제작자 등). */
const relationName = (node) => relationNames(node)[0] ?? null;

/**
 * Strapi 리치텍스트는 [{ type, children: [{ type: 'text', text }] }] 모양이다.
 * AI 가 읽을 수 있게 문단 단위 평문으로 편다.
 */
function flattenRichText(node, depth = 0) {
  if (!node || depth > 8) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) {
    return node.map((n) => flattenRichText(n, depth + 1)).filter(Boolean).join('\n');
  }
  if (typeof node !== 'object') return '';
  if (typeof node.text === 'string') return node.text;
  if (Array.isArray(node.children)) {
    return node.children.map((c) => flattenRichText(c, depth + 1)).join('');
  }
  return '';
}

/** 원본 필드가 어떻게 생겼는지 한 줄로 요약한다. 정규화가 놓친 필드를 찾기 위한 것. */
function describe(value, depth = 0) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') {
    const s = value.length > 44 ? `${value.slice(0, 44)}…` : value;
    return `"${s}"`;
  }
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) {
    return value.length && depth < 2 ? `[${value.length}개: ${describe(value[0], depth + 1)}]` : `[${value.length}개]`;
  }
  const keys = Object.keys(value);
  if (depth >= 2) return `{${keys.slice(0, 4).join(', ')}${keys.length > 4 ? ', …' : ''}}`;
  // data/attributes 는 Strapi 의 껍데기라 한 겹 벗겨야 내용이 보인다.
  if (keys.length <= 2 && (keys.includes('data') || keys.includes('attributes'))) {
    return `{${keys[0]}: ${describe(value[keys[0]], depth + 1)}}`;
  }
  return `{${keys.slice(0, 6).join(', ')}${keys.length > 6 ? ', …' : ''}}`;
}

const pick = (rec, keys) => {
  for (const k of keys) {
    if (rec[k] !== undefined && rec[k] !== null && rec[k] !== '') return rec[k];
  }
  return null;
};

// 마켓플레이스는 카테고리·스타일·등급을 한 태그 필드에 섞어서 준다.
// 사이드바에 실제로 있는 이름만 카테고리로 인정하고 나머지는 따로 분류한다.
const CATEGORY_NAMES = new Set([
  '상품', '리뷰', '프로모션/혜택',
  '헤더', '푸터', '메뉴/검색',
  '메인 배너', '띠배너', '갤러리', '정보/소개/FAQ', '게시판/블로그',
  '인스타그램', '폼', '지도', '팝업',
]);

// 블록 이름 끝의 (Natural) 표기와 태그로 동시에 나타나는 톤 이름.
// Clam 은 Calm 의 오타로 보이지만 원본을 함부로 고치지 않고 그대로 둔다.
const STYLE_NAMES = new Set([
  'natural', 'fresh', 'calm', 'bubble', 'healthy', 'luminous', 'pop', 'soft', 'clear', 'clam',
]);

// 식스샵 프로 공식 파트너가 만든 블록에 붙는 태그. 요금제와는 무관하다.
// 품질 신호로 쓸 수 있어 따로 표시해 둔다.
const PARTNER_TAG = '프리미어';

const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/** 블록 이름 끝의 (Natural), (Calm) 같은 톤 표기를 떼어낸다. */
function splitStyle(name) {
  if (typeof name !== 'string') return { baseName: null, style: null };
  const m = name.match(/^(.*?)\s*\(([A-Za-z][A-Za-z0-9 ]*)\)\s*$/);
  if (!m) return { baseName: name.trim(), style: null };

  // 괄호 안이 톤 이름일 때만 스타일로 본다. (Fresh) 는 맞고 (business) 는 아니다.
  const inner = m[2].trim();
  return STYLE_NAMES.has(inner.toLowerCase())
    ? { baseName: m[1].trim(), style: titleCase(inner) }
    : { baseName: name.trim(), style: null };
}

function normalizeBlock(rec, categoryHint) {
  const name = pick(rec, ['name', 'title', 'blockName']);
  if (!name) return null;

  const tags = relationNames(
    pick(rec, ['blockCategories', 'blockCategory', 'block_category', 'categories', 'category', 'tags']),
  );
  if (categoryHint) tags.push(categoryHint);

  const categories = [...new Set(tags.filter((t) => CATEGORY_NAMES.has(t)))];
  const styleTags = tags.filter((t) => STYLE_NAMES.has(t.toLowerCase()));
  const otherTags = [...new Set(
    tags.filter((t) => !CATEGORY_NAMES.has(t) && !STYLE_NAMES.has(t.toLowerCase())),
  )];

  const fromName = splitStyle(name);
  const { thumbnail, imageUrl } = findImages(rec);

  return {
    blockId: pick(rec, ['blockId', 'block_id', 'documentId', 'uid', 'id']),
    name,
    baseName: fromName.baseName,
    // 태그로 붙은 톤이 이름에서 뽑은 것보다 믿을 만하다.
    style: styleTags.length ? titleCase(styleTags[0]) : fromName.style,
    categories,
    officialPartner: tags.includes(PARTNER_TAG),
    tags: otherTags,
    author: relationName(pick(rec, ['partner', 'author', 'creator', 'maker', 'brand'])),
    thumbnail,
    imageUrl,
    // 실제로 열리는 데모 페이지. 블록을 눈으로 확인하거나 캡처할 때 쓴다.
    previewUrl: pick(rec, ['preview', 'demo', 'previewUrl', 'previewURL', 'demoUrl']),
    // 블록이 무슨 일을 하는지 적힌 글. AI 가 블록을 고를 때 가장 크게 참고한다.
    summary: pick(rec, ['summary', 'desc']) ?? null,
    description: flattenRichText(rec.description) || null,
    order: pick(rec, ['order']),
  };
}

/** 어떤 카테고리를 보던 중에 받은 응답인지 URL 에서 추측한다. */
function categoryHintFromUrl(url) {
  const m = decodeURIComponent(url).match(
    /filters\[[^\]]*(?:blockCategory|category)[^\]]*\][^=]*=([^&]+)/i,
  );
  return m ? m[1] : null;
}

async function main() {
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(path.join(CAPTURED, 'manifest.json'), 'utf8'));
  } catch {
    console.error(`\n수집 결과가 없습니다. 먼저 npm run capture 를 실행하세요.`);
    console.error(`찾은 위치: ${CAPTURED}/manifest.json\n`);
    process.exit(1);
  }

  const blocks = new Map();
  const categories = new Map();
  const fieldSamples = new Map();   // 원본에 실제로 있는 필드 → 값의 생김새
  let blockFiles = 0;
  let categoryFiles = 0;
  let sampleBlock = null;
  let sampleCategory = null;
  let reportedTotal = null;

  for (const res of manifest.responses) {
    const isBlocks = /\/api\/blocks\b/.test(res.url);
    const isCategories = /\/api\/block-categories\b/.test(res.url);
    if (!isBlocks && !isCategories) continue;

    let payload;
    try {
      payload = JSON.parse(await fs.readFile(path.join(CAPTURED, 'api', res.file), 'utf8'));
    } catch {
      console.warn(`  건너뜀 (읽기 실패): ${res.file}`);
      continue;
    }

    const records = extractRecords(payload);
    if (!records.length) continue;

    if (isCategories) {
      categoryFiles++;
      sampleCategory ??= records[0];
      for (const rec of records) {
        const name = relationName(rec);
        if (!name) continue;
        categories.set(name, {
          id: pick(rec, ['id', 'documentId', 'categoryId']),
          name,
          slug: pick(rec, ['slug', 'key']),
          order: pick(rec, ['order', 'sort', 'rank']),
        });
      }
      continue;
    }

    blockFiles++;
    sampleBlock ??= records[0];
    reportedTotal ??= payload?.meta?.pagination?.total ?? null;
    const hint = categoryHintFromUrl(res.url);

    for (const rec of records) {
      // 값이 들어있는 필드를 우선 기록한다. 빈 값만 본 필드는 나중에 덮인다.
      for (const [k, v] of Object.entries(rec)) {
        const isEmpty = v === null || v === undefined || v === '';
        if (!fieldSamples.has(k) || (fieldSamples.get(k) === 'null' && !isEmpty)) {
          fieldSamples.set(k, describe(v));
        }
      }

      const block = normalizeBlock(rec, hint);
      if (!block?.blockId) continue;

      const existing = blocks.get(block.blockId);
      if (existing) {
        // 같은 블록이 여러 응답에 나온다. 배열은 합치고, 나머지는 빈 값만 채운다.
        for (const [k, v] of Object.entries(block)) {
          if (Array.isArray(v)) {
            existing[k] = [...new Set([...(existing[k] ?? []), ...v])];
          } else if (typeof v === 'boolean') {
            // 태그를 일부만 담은 응답이 있으므로 한 번이라도 참이면 참으로 둔다.
            existing[k] = Boolean(existing[k]) || v;
          } else if (existing[k] == null && v != null) {
            existing[k] = v;
          }
        }
      } else {
        blocks.set(block.blockId, block);
      }
    }
  }

  const all = [...blocks.values()].sort((a, b) =>
    (a.categories[0] ?? '').localeCompare(b.categories[0] ?? '') || a.name.localeCompare(b.name),
  );

  const byCategory = {};
  const byStyle = {};
  const byTag = {};
  for (const b of all) {
    // 한 블록이 여러 카테고리에 속할 수 있어 합계가 블록 수보다 클 수 있다.
    for (const c of b.categories.length ? b.categories : ['(미분류)']) {
      byCategory[c] = (byCategory[c] ?? 0) + 1;
    }
    if (b.style) byStyle[b.style] = (byStyle[b.style] ?? 0) + 1;
    for (const t of b.tags) byTag[t] = (byTag[t] ?? 0) + 1;
  }

  await fs.mkdir(DATA, { recursive: true });
  await fs.writeFile(
    path.join(DATA, 'sixshop-blocks.json'),
    JSON.stringify(
      {
        source: 'marketplace.sixshop.io/api/blocks (Strapi)',
        builtAt: new Date().toISOString(),
        counts: {
          blocks: all.length,
          categories: categories.size,
          officialPartner: all.filter((b) => b.officialPartner).length,
          byCategory,
          byStyle,
          byTag,
        },
        categories: [...categories.values()],
        blocks: all,
        // 정규화가 놓친 필드가 없는지 확인하려고 원본 레코드를 하나씩 남긴다.
        _fields: Object.fromEntries([...fieldSamples].sort()),
        _reportedTotal: reportedTotal,
        _sampleRawBlock: sampleBlock,
        _sampleRawCategory: sampleCategory,
      },
      null,
      2,
    ),
  );

  const missing = {
    thumbnail: all.filter((b) => !b.thumbnail).length,
    category: all.filter((b) => !b.categories.length).length,
    style: all.filter((b) => !b.style).length,
    author: all.filter((b) => !b.author).length,
    summary: all.filter((b) => !b.summary).length,
    previewUrl: all.filter((b) => !b.previewUrl).length,
  };

  console.log(`\n블록 응답 ${blockFiles}건, 카테고리 응답 ${categoryFiles}건을 읽었습니다.`);
  const partnerCount = all.filter((b) => b.officialPartner).length;
  console.log(
    `\n블록 ${all.length}개, 카테고리 ${categories.size}개, 공식 파트너 블록 ${partnerCount}개\n`,
  );

  console.log('카테고리별:');
  for (const [k, v] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(4)}  ${k}`);
  }

  if (Object.keys(byStyle).length) {
    console.log('\n스타일별:');
    for (const [k, v] of Object.entries(byStyle).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(v).padStart(4)}  ${k}`);
    }
  }

  const tags = Object.entries(byTag).sort((a, b) => b[1] - a[1]);
  if (tags.length) {
    console.log('\n그 밖의 태그 (카테고리도 스타일도 아닌 것):');
    for (const [k, v] of tags.slice(0, 15)) console.log(`  ${String(v).padStart(4)}  ${k}`);
  }

  if (reportedTotal != null && reportedTotal !== all.length) {
    console.log(`\n※ API 는 전체 ${reportedTotal}개라고 하는데 ${all.length}개만 모였습니다.`);
  }

  const gaps = Object.entries(missing).filter(([, v]) => v > 0);
  if (gaps.length) {
    console.log('\n비어있는 필드:');
    for (const [k, v] of gaps) console.log(`  ${String(v).padStart(4)}  ${k}`);

    // 어떤 필드가 실제로 있는지 보여준다. 이름을 몰라 못 읽은 필드를 여기서 찾는다.
    console.log('\n원본 레코드에 있는 필드:');
    for (const [k, v] of [...fieldSamples].sort()) {
      console.log(`  ${k.padEnd(22)} ${v}`);
    }
  }

  console.log(`\n저장: ${path.relative(ROOT, path.join(DATA, 'sixshop-blocks.json'))}`);
  console.log('이 파일 하나만 보내주시면 됩니다. 계정 정보는 들어있지 않습니다.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
