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
import { splitGlobals, summarize, workloadNote } from '../src/counts.mjs';

// 세는 일은 src/counts.mjs 한 곳에서 한다. 화면과 API 는 여기서 가져다 쓴다.
export { summarize };
import {
  stageBrief,
  stageStrategy,
  stageArchitecture,
  stageReview,
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
  if (!data.review) return { key: 'review', label: '마케팅·UX 검토' };

  const pending = pendingPageStages(data);
  if (pending.length) {
    const total = data.architecture.pages.length;
    return { ...pending[0], progress: `${total - pending.length + 1}/${total}` };
  }

  if (!data.advisories) return { key: 'advisories', label: '기능과 유의점' };
  if (!data.technical) return { key: 'technical', label: '기술 검토' };
  return null;
}

/** 그 단계의 결과가 이미 저장돼 있는지. 끊긴 요청을 다시 보낼 때 쓴다. */
export function alreadyDone(data, key) {
  if (key.startsWith('page:')) {
    const index = Number(key.slice(5));
    return (data.pages ?? []).some((p) => p.index === index);
  }
  return Boolean(data[key]);
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

  if (key === 'review') {
    const review = await stageReview(model, {
      brief: data.brief,
      strategy: data.strategy,
      architecture: data.architecture,
    });
    return { patch: { review }, usage: model.usage };
  }

  if (key.startsWith('page:')) {
    const index = Number(key.slice(5));
    const page = data.architecture.pages[index];
    if (!page) throw new Error(`${index}번 페이지가 사이트맵에 없습니다.`);

    const result = await stagePage(model, {
      catalog: catalog(),
      brief: data.brief,
      strategy: data.strategy,
      review: data.review,
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
 * 페이지들이 서로를 모른 채 동시에 만들어지므로 같은 블록이 여러 페이지에
 * 겹칠 수 있다. 사이트맵 단계에서 범위를 갈라 막고 있지만 완전하지는 않아,
 * 남은 중복은 눈에 띄게 적어 둔다. 전역 요소는 중복이 아니다.
 */
export function findDuplicates(pages) {
  const seen = new Map();
  for (const page of pages) {
    for (const s of page.sections ?? []) {
      if (!s.blockId) continue;
      if (!seen.has(s.blockId)) seen.set(s.blockId, { name: s.blockName ?? s.blockId, where: [] });
      seen.get(s.blockId).where.push(`${page.title} / ${s.purpose}`);
    }
  }
  return [...seen.values()]
    .filter((v) => v.where.length > 1)
    .map((v) => `${v.name} — ${v.where.join(' · ')}`);
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
    duplicates: findDuplicates(pages),
    advisories: data.advisories
      ? { ...data.advisories, technical: data.technical ?? [] }
      : data.advisories,
    counts: summarize({ ...data, pages: ordered }),
  };
}
