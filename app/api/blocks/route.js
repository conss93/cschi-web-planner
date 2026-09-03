/**
 * 블록 고르기 창에 넘길 목록.
 *
 * 카탈로그 원본은 350KB 라 화면에 통째로 내려보내지 않는다. 고르는 데 필요한
 * 것만 추려 보내고, 톤 계열이 정해져 있으면 그 계열과 커뮤니티 블록만 남긴다.
 */

import { NextResponse } from 'next/server';
import rawCatalog from '../../../data/sixshop-blocks.json' with { type: 'json' };
import { buildCatalog } from '../../../src/catalog.mjs';

let cache = null;
const catalog = () => (cache ??= buildCatalog(rawCatalog));

export async function GET(request) {
  const style = new URL(request.url).searchParams.get('style');

  const pool = style
    ? catalog().blocks.filter((b) => b.style === style || !b.style)
    : catalog().blocks;

  const blocks = pool.map((b) => ({
    blockId: b.blockId,
    name: b.name,
    style: b.style ?? null,
    categories: b.categories,
    officialPartner: b.officialPartner,
    thumbnail: b.thumbnail ?? null,
    previewUrl: b.previewUrl ?? null,
    summary: (b.summary ?? '').replace(/\s+/g, ' ').slice(0, 200),
  }));

  // 계열 블록을 먼저, 그 안에서 공식 파트너를 먼저 보여준다.
  blocks.sort(
    (a, b) =>
      Number(Boolean(b.style)) - Number(Boolean(a.style)) ||
      Number(b.officialPartner) - Number(a.officialPartner) ||
      a.name.localeCompare(b.name, 'ko'),
  );

  return NextResponse.json({
    blocks,
    categories: [...new Set(blocks.flatMap((b) => b.categories))].sort(),
  });
}
