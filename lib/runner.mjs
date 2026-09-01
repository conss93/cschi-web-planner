/**
 * 웹에서는 한 요청에 한 단계만 돌린다.
 *
 * 기획서 하나를 만드는 데 1분 안팎이 걸리는데 서버리스 함수는 그만큼 오래
 * 붙들 수 없다. 대신 저장된 상태를 보고 다음 단계를 정해 그것만 실행하고
 * 결과를 저장한다. 화면이 끝날 때까지 반복해 부른다.
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
  validate,
} from '../src/pipeline.mjs';

let catalogCache = null;
const catalog = () => (catalogCache ??= buildCatalog(rawCatalog));

/** 저장된 상태를 보고 지금 해야 할 일을 정한다. 끝났으면 null. */
export function nextStage(data) {
  if (!data.brief) return { key: 'brief', label: '브리프 정리' };
  if (!data.strategy) return { key: 'strategy', label: '전략과 톤' };
  if (!data.architecture) return { key: 'architecture', label: '사이트맵' };

  const done = data.pages?.length ?? 0;
  const total = data.architecture.pages.length;
  if (done < total) {
    return {
      key: `page:${done}`,
      label: `페이지 구성 · ${data.architecture.pages[done].title}`,
      progress: `${done + 1}/${total}`,
    };
  }

  if (!data.advisories) return { key: 'advisories', label: '기능과 유의점' };
  return null;
}

function summarize(data) {
  const pages = data.pages ?? [];
  return {
    pages: pages.length,
    blocks: pages.reduce((n, p) => n + p.sections.filter((s) => s.blockId).length, 0),
    customTone: pages.reduce((n, p) => n + p.sections.filter((s) => s.needsCustomTone).length, 0),
  };
}

/** 다음 한 단계를 실행하고 갱신된 상태를 돌려준다. */
export async function runNextStage(data) {
  const stage = nextStage(data);
  if (!stage) return { data, stage: null, done: true };

  const model = createModel();
  const next = { ...data };

  if (stage.key === 'brief') {
    next.brief = await stageBrief(model, { briefText: data.briefText });
  } else if (stage.key === 'strategy') {
    next.strategy = await stageStrategy(model, { catalog: catalog(), brief: next.brief });
    // 톤이 정해졌으니 이후 단계는 그 계열과 커뮤니티 블록만 후보로 본다.
    next.blockMenu = renderBlockMenu(catalog(), { style: next.strategy.style });
  } else if (stage.key === 'architecture') {
    next.architecture = await stageArchitecture(model, { brief: next.brief, strategy: next.strategy });
    next.pages = [];
    next.problems = [];
  } else if (stage.key.startsWith('page:')) {
    const index = Number(stage.key.slice(5));
    const page = next.architecture.pages[index];
    const result = await stagePage(model, {
      catalog: catalog(),
      brief: next.brief,
      strategy: next.strategy,
      page,
      blockMenu: next.blockMenu,
    });

    const composed = { ...page, ...result };
    const problems = validate([composed], catalog());
    next.pages = [...(next.pages ?? []), composed];
    next.problems = [...(next.problems ?? []), ...problems];
  } else if (stage.key === 'advisories') {
    next.advisories = await stageAdvisories(model, {
      brief: next.brief,
      strategy: next.strategy,
      pages: next.pages,
      blockMenu: next.blockMenu,
    });
    next.generatedAt = new Date().toISOString();
  }

  next.counts = summarize(next);

  return {
    data: next,
    stage,
    done: nextStage(next) === null,
    usage: model.usage,
  };
}
