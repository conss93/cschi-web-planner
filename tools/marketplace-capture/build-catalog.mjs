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

/** 관계 필드에서 사람이 읽을 이름을 꺼낸다 (카테고리, 제작자 등). */
function relationName(node, depth = 0) {
  if (!node || depth > 4) return null;
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) {
    const names = node.map((n) => relationName(n, depth + 1)).filter(Boolean);
    return names.length ? names.join(', ') : null;
  }
  if (typeof node !== 'object') return null;

  for (const key of ['name', 'title', 'label', 'displayName', 'nickname']) {
    if (typeof node[key] === 'string') return node[key];
  }
  for (const key of ['data', 'attributes']) {
    if (node[key]) {
      const found = relationName(node[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

const pick = (rec, keys) => {
  for (const k of keys) {
    if (rec[k] !== undefined && rec[k] !== null && rec[k] !== '') return rec[k];
  }
  return null;
};

/** 블록 이름 끝의 (Natural), (Calm) 같은 톤 표기를 떼어낸다. */
function splitStyle(name) {
  if (typeof name !== 'string') return { baseName: null, style: null };
  const m = name.match(/^(.*?)\s*\(([A-Za-z][A-Za-z0-9 ]*)\)\s*$/);
  return m
    ? { baseName: m[1].trim(), style: m[2].trim() }
    : { baseName: name.trim(), style: null };
}

function normalizeBlock(rec, categoryHint) {
  const name = pick(rec, ['name', 'title', 'blockName']);
  if (!name) return null;

  const { baseName, style } = splitStyle(name);
  const category =
    relationName(pick(rec, ['blockCategory', 'block_category', 'category', 'categories'])) ??
    categoryHint ??
    null;

  return {
    blockId: pick(rec, ['blockId', 'block_id', 'documentId', 'uid', 'id']),
    name,
    baseName,
    style,
    category,
    author: relationName(pick(rec, ['author', 'creator', 'maker', 'partner', 'brand'])),
    thumbnail: mediaUrl(pick(rec, ['thumbnail', 'thumb', 'previewImage', 'image', 'cover', 'media'])),
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
        // 카테고리를 좁혀 조회한 응답이 더 정확하므로, 비어있던 값만 채운다.
        for (const [k, v] of Object.entries(block)) {
          if (existing[k] == null && v != null) existing[k] = v;
        }
      } else {
        blocks.set(block.blockId, block);
      }
    }
  }

  const all = [...blocks.values()].sort((a, b) =>
    (a.category ?? '').localeCompare(b.category ?? '') || a.name.localeCompare(b.name),
  );

  const byCategory = {};
  const byStyle = {};
  for (const b of all) {
    byCategory[b.category ?? '(미분류)'] = (byCategory[b.category ?? '(미분류)'] ?? 0) + 1;
    if (b.style) byStyle[b.style] = (byStyle[b.style] ?? 0) + 1;
  }

  await fs.mkdir(DATA, { recursive: true });
  await fs.writeFile(
    path.join(DATA, 'sixshop-blocks.json'),
    JSON.stringify(
      {
        source: 'marketplace.sixshop.io/api/blocks (Strapi)',
        builtAt: new Date().toISOString(),
        counts: { blocks: all.length, categories: categories.size, byCategory, byStyle },
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
    category: all.filter((b) => !b.category).length,
    author: all.filter((b) => !b.author).length,
  };

  console.log(`\n블록 응답 ${blockFiles}건, 카테고리 응답 ${categoryFiles}건을 읽었습니다.`);
  console.log(`\n블록 ${all.length}개, 카테고리 ${categories.size}개\n`);

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
