/**
 * 블록 카탈로그를 읽고, 모델에게 보여줄 형태로 다듬는다.
 *
 * 230개를 통째로 넘기면 프롬프트가 길어지지만, 설명글까지 읽고 고르는 것과
 * 이름만 보고 고르는 것은 결과가 다르다. 대신 이 목록은 매 요청 똑같이
 * 들어가므로 프롬프트 캐시에 얹어 비용을 회수한다.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

export async function loadCatalog(file = path.join(ROOT, 'data', 'sixshop-blocks.json')) {
  const raw = JSON.parse(await fs.readFile(file, 'utf8'));
  const blocks = raw.blocks.filter((b) => b.blockId && b.name);

  const byId = new Map(blocks.map((b) => [b.blockId, b]));

  const styles = [...new Set(blocks.map((b) => b.style).filter(Boolean))].sort();
  const categories = [...new Set(blocks.flatMap((b) => b.categories))].sort();

  /** 어떤 스타일 계열이 어떤 카테고리를 덮는지. 톤을 하나로 통일할 수 있는지 판단하는 근거. */
  const coverage = {};
  for (const style of styles) {
    coverage[style] = {
      count: blocks.filter((b) => b.style === style).length,
      categories: [
        ...new Set(blocks.filter((b) => b.style === style).flatMap((b) => b.categories)),
      ].sort(),
    };
  }

  return { blocks, byId, styles, categories, coverage, source: raw.source };
}

/** 한 블록을 한 줄로. 설명글은 고르는 근거라 살리되 길이는 제한한다. */
function line(b) {
  const parts = [
    b.blockId,
    `| ${b.name}`,
    b.categories.length ? `| ${b.categories.join('·')}` : '| 분류없음',
    b.style ? `| ${b.style}` : '| 스타일없음',
  ];
  if (b.officialPartner) parts.push('| 공식파트너');
  const summary = (b.summary ?? '').replace(/\s+/g, ' ').trim();
  if (summary) parts.push(`\n    ${summary.slice(0, 180)}`);
  return parts.join(' ');
}

/**
 * 모델에게 넘길 블록 목록.
 * style 을 주면 그 계열과 스타일 없는 커뮤니티 블록만 남긴다. 계열을 정한
 * 뒤에는 다른 계열을 보여줄 이유가 없고, 목록이 짧을수록 선택이 정확해진다.
 */
export function renderBlockMenu(catalog, { style = null } = {}) {
  const pool = style
    ? catalog.blocks.filter((b) => b.style === style || !b.style)
    : catalog.blocks;

  const grouped = new Map();
  for (const b of pool) {
    for (const c of b.categories.length ? b.categories : ['분류없음']) {
      if (!grouped.has(c)) grouped.set(c, []);
      grouped.get(c).push(b);
    }
  }

  const sections = [...grouped.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([category, list]) => {
      const rows = list
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((b) => `  ${line(b)}`)
        .join('\n');
      return `### ${category} (${list.length}개)\n${rows}`;
    });

  return `사용 가능한 블록 ${pool.length}개\n\n${sections.join('\n\n')}`;
}

/** 스타일 계열별 커버리지 요약. 톤을 고르는 단계에서 쓴다. */
export function renderStyleTable(catalog) {
  return Object.entries(catalog.coverage)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([style, v]) => `- ${style}: 블록 ${v.count}개 · 덮는 영역 ${v.categories.join(', ')}`)
    .join('\n');
}
