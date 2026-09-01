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

/** Strapi 미디어 필드는 중첩이 깊고 버전마다 달라서, 안에서 URL 을 찾아 꺼낸다. */
function mediaUrl(node, depth = 0) {
  if (!node || depth > 5) return null;
  if (typeof node === 'string') {
    return /^https?:\/\/|^\//.test(node) && /\.(png|jpe?g|webp|gif|avif|svg)/i.test(node)
      ? node
      : null;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = mediaUrl(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== 'object') return null;

  if (typeof node.url === 'string') return node.url;
  for (const key of ['data', 'attributes', 'formats', 'medium', 'large', 'small', 'thumbnail']) {
    if (node[key]) {
      const found = mediaUrl(node[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
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

  return {
    blockId: pick(rec, ['blockId', 'block_id', 'documentId', 'uid', 'id']),
    name,
    baseName: fromName.baseName,
    // 태그로 붙은 톤이 이름에서 뽑은 것보다 믿을 만하다.
    style: styleTags.length ? titleCase(styleTags[0]) : fromName.style,
    categories,
    officialPartner: tags.includes(PARTNER_TAG),
    tags: otherTags,
    author: relationName(pick(rec, ['author', 'creator', 'maker', 'partner', 'brand'])),
    thumbnail: mediaUrl(
      pick(rec, ['thumbnail', 'thumb', 'previewImage', 'previewImageUrl', 'image', 'cover', 'media']),
    ),
    previewUrl: pick(rec, ['previewUrl', 'previewURL', 'demoUrl', 'url', 'slug']),
    description: pick(rec, ['description', 'summary', 'desc']),
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
  let blockFiles = 0;
  let categoryFiles = 0;
  let sampleBlock = null;
  let sampleCategory = null;

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
    const hint = categoryHintFromUrl(res.url);

    for (const rec of records) {
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

  const gaps = Object.entries(missing).filter(([, v]) => v > 0);
  if (gaps.length) {
    console.log('\n비어있는 필드:');
    for (const [k, v] of gaps) console.log(`  ${String(v).padStart(4)}  ${k}`);
    console.log('  → 원본 모양을 봐야 합니다. 파일 안 _sampleRawBlock 을 확인하세요.');
  }

  console.log(`\n저장: ${path.relative(ROOT, path.join(DATA, 'sixshop-blocks.json'))}`);
  console.log('이 파일 하나만 보내주시면 됩니다. 계정 정보는 들어있지 않습니다.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
