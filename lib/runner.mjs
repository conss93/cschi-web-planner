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

export function summarize(data) {
  const pages = data.pages ?? [];
  return {
    pages: pages.length,
    blocks: pages.reduce((n, p) => n + p.sections.filter((s) => s.blockId).length, 0),
    customTone: pages.reduce((n, p) => n + p.sections.filter((s) => s.needsCustomTone).length, 0),
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
  const pages = [...(data.pages ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return {
    ...data,
    pages,
    advisories: data.advisories
      ? { ...data.advisories, technical: data.technical ?? [] }
      : data.advisories,
    counts: summarize({ ...data, pages }),
  };
}
