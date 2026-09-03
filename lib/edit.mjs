/**
 * 손으로 고친 페이지 구성을 받아 저장할 수 있는 모양으로 다듬는다.
 *
 * 화면에서 온 값을 그대로 믿지 않는다. 블록 정보는 카탈로그에서 다시 붙이고,
 * 목록에 없는 블록은 걸러 낸다. 페이지 자체는 사이트맵이 정한 것만 남기고
 * 제목·주소도 사이트맵 값을 쓴다. 편집 화면은 자리를 만지는 곳이지 페이지를
 * 새로 만드는 곳이 아니다.
 */

import { validate, FILL } from '../src/pipeline.mjs';

const text = (v, max) => String(v ?? '').slice(0, max);

/** 한 페이지에 둘 수 있는 자리 수. 실수로 거대한 배열이 올라오는 것만 막는다. */
const MAX_SECTIONS = 40;

export function normalizePages(data, incoming, catalog) {
  const sitemap = data.architecture?.pages ?? [];
  const byIndex = new Map((data.pages ?? []).map((p) => [p.index, p]));

  const pages = (Array.isArray(incoming) ? incoming : [])
    .filter((p) => byIndex.has(p.index))
    .map((p) => ({
      ...byIndex.get(p.index),
      ...(sitemap[p.index] ?? {}),
      index: p.index,
      sections: (Array.isArray(p.sections) ? p.sections : [])
        .slice(0, MAX_SECTIONS)
        .map((s) => {
          // 모르는 값이 오면 blockId 로 판단한다. 옛 기획서에는 fill 이 없다.
          const fill = FILL.includes(s.fill)
            ? s.fill
            : s.blockId
              ? '마켓플레이스 블록'
              : '식스샵 기본 기능';
          return {
            purpose: text(s.purpose, 200),
            fill,
            blockId: fill === '마켓플레이스 블록' ? text(s.blockId, 120) : '',
            note: text(s.note, 2000),
            copy: text(s.copy, 4000),
            needsCustomTone: Boolean(s.needsCustomTone),
          };
        }),
    }))
    .sort((a, b) => a.index - b.index);

  // validate 가 카탈로그에서 이름·계열·공식파트너·미리보기를 다시 붙이고,
  // 없는 블록이 든 자리는 빼면서 무엇을 뺐는지 알려 준다.
  const problems = validate(pages, catalog);
  return { pages, problems };
}
