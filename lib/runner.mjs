/**
 * 웹에서는 한 요청에 한 단계만 돌린다.
 *
 * 기획서 하나를 만드는 데 몇 분이 걸리는데 서버리스 함수는 그만큼 오래
 * 붙들 수 없다. 무료 플랜은 한 요청이 60초를 넘기면 잘린다. 그래서 단계를
 * 잘게 나누고, 서로 독립인 페이지들은 화면에서 동시에 요청한다.
 */

import rawCatalog from '../data/sixshop-blocks.json' with { type: 'json' };
import { buildCatalog, renderBlockMenu } from '../src/catalog.mjs';
import { createModel } from '../src/model.mjs';
import {
  stageBrief,
  stageStrategy,
  stageArchitecture,
  stagePage,
  stageAdvisories,
  stageTechnical,
  validate,
} from '../src/pipeline.mjs';

let catalogCache = null;
const catalog = () => (catalogCache ??= buildCatalog(rawCatalog));

/** 페이지 단계는 어느 것이든 동시에 돌 수 있다. */
export function pendingPageStages(data) {
  const total = data.architecture?.pages?.length ?? 0;
  const done = new Set((data.pages ?? []).map((p) => p.index));
  return Array.from({ length: total }, (_, i) => i)
    .filter((i) => !done.has(i))
    .map((i) => ({
      key: `page:${i}`,
      label: `페이지 구성 · ${data.architecture.pages[i].title}`,
    }));
}

/** 저장된 상태를 보고 지금 해야 할 일을 정한다. 끝났으면 null. */
export function nextStage(data) {
  if (!data.brief) return { key: 'brief', label: '브리프 정리' };
  if (!data.strategy) return { key: 'strategy', label: '전략과 톤' };
  if (!data.architecture) return { key: 'architecture', label: '사이트맵' };

  const pending = pendingPageStages(data);
  if (pending.length) {
    const total = data.architecture.pages.length;
    return { ...pending[0], progress: `${total - pending.length + 1}/${total}` };
  }

  if (!data.advisories) return { key: 'advisories', label: '기능과 유의점' };
  if (!data.technical) return { key: 'technical', label: '기술 검토' };
  return null;
}

/**
 * 모든 페이지에 같은 블록으로 들어가는 자리는 전역 요소다.
 * 헤더와 푸터가 대표적인데, 페이지마다 세면 블록 수가 부풀고 견적이 틀어진다.
 */
function splitGlobals(pages) {
  const usable = pages.filter((p) => p.sections?.length);
  if (usable.length < 2) return { globals: [], pages };

  // 자리까지 같아야 전역이다. 맨 위에 오는 헤더와 맨 아래 푸터가 그렇다.
  // 단순히 "모든 페이지에 있는 블록"으로 잡으면 문의 폼처럼 여러 페이지에
  // 반복되는 본문 블록까지 끌어올려 페이지 구성이 비어 버린다.
  const sameAt = (pick) => {
    const ids = usable.map((p) => pick(p.sections)?.blockId);
    return ids[0] && ids.every((id) => id === ids[0]) ? ids[0] : null;
  };

  const headId = sameAt((sections) => sections[0]);
  const footId = sameAt((sections) => sections[sections.length - 1]);
  const globalIds = new Set([headId, footId].filter(Boolean));
  if (!globalIds.size) return { globals: [], pages };

  const globals = [];
  const trimmed = pages.map((page) => ({
    ...page,
    sections: (page.sections ?? []).filter((s, i, all) => {
      const atEdge = i === 0 || i === all.length - 1;
      if (!atEdge || !globalIds.has(s.blockId)) return true;
      if (!globals.some((g) => g.blockId === s.blockId)) globals.push(s);
      return false;
    }),
  }));

  return { globals, pages: trimmed };
}

export function summarize(data) {
  const raw = data.pages ?? [];
  const { globals, pages } = splitGlobals(raw);

  const placed = [...globals, ...pages.flatMap((p) => p.sections)].filter((s) => s.blockId);
  const custom = placed.filter((s) => s.needsCustomTone);

  return {
    pages: raw.length,
    // 서로 다른 블록이 몇 종인지가 실제 작업량이다. 배치 횟수는 참고값.
    blocks: new Set(placed.map((s) => s.blockId)).size,
    placements: placed.length,
    globals: globals.length,
    customTone: new Set(custom.map((s) => s.blockId)).size,
    customPlacements: custom.length,
  };
}

/**
 * 지정한 단계 하나를 실행한다.
 *
 * 페이지 단계는 결과를 이어 붙여야 하므로 patch 대신 page 를 돌려준다.
 * 나머지는 저장할 조각(patch)을 돌려준다.
 */
export async function runStage(data, key) {
  const model = createModel();

  if (key === 'brief') {
    const brief = await stageBrief(model, { briefText: data.briefText });
    return { patch: { brief }, usage: model.usage };
  }

  if (key === 'strategy') {
    const strategy = await stageStrategy(model, { catalog: catalog(), brief: data.brief });
    // 톤이 정해졌으니 이후 단계는 그 계열과 커뮤니티 블록만 후보로 본다.
    const blockMenu = renderBlockMenu(catalog(), { style: strategy.style });
    return { patch: { strategy, blockMenu }, usage: model.usage };
  }

  if (key === 'architecture') {
    const architecture = await stageArchitecture(model, {
      brief: data.brief,
      strategy: data.strategy,
    });
    return { patch: { architecture, pages: [], problems: [] }, usage: model.usage };
  }

  if (key.startsWith('page:')) {
    const index = Number(key.slice(5));
    const page = data.architecture.pages[index];
    if (!page) throw new Error(`${index}번 페이지가 사이트맵에 없습니다.`);

    const result = await stagePage(model, {
      catalog: catalog(),
      brief: data.brief,
      strategy: data.strategy,
      page,
      blockMenu: data.blockMenu,
    });

    const composed = { ...page, ...result, index };
    const problems = validate([composed], catalog());
    return { page: composed, problems, usage: model.usage };
  }

  if (key === 'advisories') {
    const advisories = await stageAdvisories(model, {
      brief: data.brief,
      strategy: data.strategy,
      pages: data.pages,
      blockMenu: data.blockMenu,
    });
    return { patch: { advisories }, usage: model.usage };
  }

  if (key === 'technical') {
    const { technical } = await stageTechnical(model, {
      brief: data.brief,
      strategy: data.strategy,
      pages: data.pages,
      blockMenu: data.blockMenu,
    });
    return {
      patch: { technical, generatedAt: new Date().toISOString() },
      usage: model.usage,
    };
  }

  throw new Error(`모르는 단계: ${key}`);
}

/**
 * 화면에 넘기기 전에 다듬는다.
 * 페이지는 완성 순서대로 쌓이므로 사이트맵 순서로 되돌리고,
 * 기술 검토는 나중에 붙으므로 유의점 쪽에 합쳐 준다.
 */
export function assemble(data) {
  const ordered = [...(data.pages ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const { globals, pages } = splitGlobals(ordered);

  return {
    ...data,
    globals,
    pages,
    advisories: data.advisories
      ? { ...data.advisories, technical: data.technical ?? [] }
      : data.advisories,
    counts: summarize({ ...data, pages: ordered }),
  };
}
