/**
 * 파이프라인 자체 점검. 모델을 부르지 않는다.
 *
 * 가짜 모델이 단계마다 정해진 답을 돌려주되, 그 답을 실제 스키마로 검사한다.
 * 스키마와 화면이 어긋나면 여기서 걸린다. 없는 blockId 를 섞어 넣어
 * 검증 단계가 그것을 걸러내는지도 함께 본다.
 *
 * 실행: npm run test:pipeline
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { loadCatalog } from '../../src/catalog-file.mjs';
import { renderBlockMenu, renderStyleTable } from '../../src/catalog.mjs';
import { runPipeline } from '../../src/pipeline.mjs';
import { renderPlan } from '../../src/render.mjs';
import { nextStage, pendingPageStages, assemble, findDuplicates } from '../../lib/runner.mjs';
import { toBriefText, parseBriefText, missingRequired } from '../../lib/brief-form.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const FAKE_ID = '00000000-없는-블록-0000-000000000000';

let failures = 0;
const check = (label, ok) => {
  console.log(`  ${ok ? '통과' : '실패'}  ${label}`);
  if (!ok) failures++;
};

/** 카탈로그에서 조건에 맞는 블록 하나를 고른다. */
const pick = (catalog, category, style) =>
  catalog.blocks.find((b) => b.categories.includes(category) && b.style === style) ??
  catalog.blocks.find((b) => b.categories.includes(category));

function makeFakeModel(catalog) {
  const style = 'Calm';
  const seen = [];

  const header = pick(catalog, '헤더', style);
  const banner = pick(catalog, '메인 배너', style);
  const form = pick(catalog, '폼', style);
  const footer = pick(catalog, '푸터', style);

  return {
    seen,
    usage: { calls: 0 },

    async generate({ stage, role, shared, task, schema }) {
      seen.push({ stage, role, shared, task });

      let value;
      if (stage === '브리프 정리') {
        value = {
          companyName: '테스트 세무법인',
          industry: '지역 세무법인',
          region: '미확인',
          scale: '세무사 2명, 직원 3명',
          existingChannels: '블로그만 운영 중',
          primaryGoal: '상담 문의 접수',
          targetCustomer: '미확인',
          topQuestions: ['비용이 얼마인가', '기장 전환은 어떻게 하나', '상담은 얼마나 걸리나'],
          toneWords: ['전문적인', '신뢰감 있는', '차분한'],
          avoidTone: '화려한',
          budget: '200만원대',
          deadline: '미확인',
          regulated: '세무·회계',
          assumptions: [{ field: 'region', value: '지역 기반', basis: '메모에서 추정' }],
          openQuestions: [{ question: '주력 고객층은?', why: '첫 화면 문구와 서비스 순서가 바뀝니다' }],
        };
      } else if (stage === '전략과 톤') {
        value = {
          positioning: '맡겨도 되는 사람들이라는 확신을 주는 것이 이 사이트의 일입니다.',
          singleGoal: '상담 문의 1건',
          audience: '개인사업자와 소상공인',
          trustMaterials: [{ title: '세무사 실명 공개', detail: '얼굴과 약력을 함께 싣습니다' }],
          style,
          styleRationale: `${style} 계열이 필요한 영역을 빠짐없이 덮습니다.`,
          styleRunnerUp: 'Natural 은 블록이 적어 중간에 계열을 섞어야 합니다.',
        };
      } else if (stage === '사이트맵') {
        value = {
          menu: ['홈', '소개', '서비스', '상담'],
          menuNote: '메뉴는 4개로 제한합니다.',
          pageCountRationale: '서비스가 하나라 상세를 따로 두지 않고 홈에 넣었습니다.',
          pages: [
            { slug: '/', title: '홈', goal: '30초 안에 문의까지', summary: '요약 페이지', inMenu: true,
              covers: ['서비스 요약'], avoid: ['문의 폼 — 상담 안내 페이지가 맡음'] },
            { slug: '/contact', title: '상담 안내', goal: '문의 제출', summary: '문의 페이지', inMenu: true,
              covers: ['문의 폼'], avoid: ['서비스 상세 — 홈이 맡음'] },
          ],
        };
      } else if (stage.startsWith('페이지 구성')) {
        const isHome = stage.includes('홈');
        value = {
          sections: [
            { purpose: '전역 헤더', blockId: header.blockId, note: '로고와 메뉴', copy: '', needsCustomTone: false },
            isHome
              ? { purpose: '첫 화면', blockId: banner.blockId, note: '사무실 실사진', copy: '설명부터 다릅니다', needsCustomTone: false }
              : { purpose: '상담 절차', blockId: FAKE_ID, note: '없는 블록이라 걸러져야 함', copy: '', needsCustomTone: true },
            { purpose: '상담 문의', blockId: form.blockId, note: '동의 체크박스 필수', copy: '', needsCustomTone: false },
            { purpose: '칼럼 목록', blockId: '', note: '식스샵 기본 게시판', copy: '', needsCustomTone: false },
            { purpose: '푸터', blockId: footer.blockId, note: '사업자 정보', copy: '', needsCustomTone: false },
          ],
        };
      } else if (stage === '기능과 유의점') {
        value = {
          features: [{ level: '필수', title: '문의 접수', detail: '게시판과 시트에 동시 저장' }],
          production: [{ mark: '전용', title: '블록 설명은 쇼핑몰 기준입니다. ', detail: '서비스로 바꿔 읽어야 합니다.' }],
          assetsToCollect: ['세무사 프로필 사진'],
          budgetNote: '예산 안에서 무리가 없습니다.',
        };
      } else if (stage === '기술 검토') {
        value = { technical: [{ area: '속도', items: ['첫 화면 이미지는 200KB 이하로 압축'] }] };
      } else {
        throw new Error(`모르는 단계: ${stage}`);
      }

      // 스키마와 어긋나면 여기서 터진다. 그게 이 점검의 핵심이다.
      return schema.parse(value);
    },
  };
}

async function main() {
  const catalog = await loadCatalog();

  console.log('\n─── 카탈로그 ───');
  check(`블록 ${catalog.blocks.length}개 로드`, catalog.blocks.length > 100);
  check('스타일 계열 목록 확보', catalog.styles.includes('Calm'));
  check('스타일 커버리지 표 생성', renderStyleTable(catalog).includes('Calm'));

  const full = renderBlockMenu(catalog);
  const calmOnly = renderBlockMenu(catalog, { style: 'Calm' });
  check('톤을 정하면 목록이 줄어듦', calmOnly.length < full.length);
  check('다른 계열 블록은 목록에서 빠짐', !calmOnly.includes('(Fresh)'));
  check('스타일 없는 커뮤니티 블록은 남음', calmOnly.includes('스타일없음'));

  console.log('\n─── 파이프라인 ───');
  const model = makeFakeModel(catalog);
  const plan = await runPipeline({ model, catalog, briefText: '테스트 메모', onStage: () => {} });

  check('단계가 순서대로 실행됨', model.seen[0].stage === '브리프 정리' && model.seen[1].stage === '전략과 톤');
  check('페이지 2개 생성', plan.pages.length === 2);

  const roles = new Set(model.seen.map((s) => s.role));
  check('역할 문자열이 모든 단계에서 동일 (캐시 조건)', roles.size === 1);

  const shared = model.seen.filter((s) => s.shared).map((s) => s.shared);
  check('블록 목록을 쓰는 단계가 여럿', shared.length >= 3);
  check('그 블록 목록이 전부 동일 (캐시 조건)', new Set(shared).size === 1);

  console.log('\n─── 검증 ───');
  check('없는 blockId 를 걸러냄', plan.problems.length === 1 && plan.problems[0].includes(FAKE_ID));
  const ids = plan.pages.flatMap((p) => p.sections.map((s) => s.blockId)).filter(Boolean);
  check('남은 blockId 는 전부 실재함', ids.every((id) => catalog.byId.has(id)));
  check('블록 이름이 채워짐', plan.pages[0].sections[0].blockName?.length > 0);
  check('식스샵 기본 기능 자리는 남음', plan.pages[0].sections.some((s) => !s.blockId));
  check('블록 수 집계가 맞음', plan.counts.blocks === ids.length);

  console.log('\n─── 화면 ───');
  const html = renderPlan(plan);
  check('제목에 상호가 들어감', html.includes('테스트 세무법인 웹사이트 기획서'));
  check('블록 이름이 화면에 나옴', html.includes(plan.pages[0].sections[0].blockName));
  check('기본 기능 자리를 따로 표시', html.includes('식스샵 기본 기능'));
  check('확인할 질문이 실림', html.includes('주력 고객층은?'));
  check('페이지 수의 근거가 실림', html.includes('페이지를 이렇게 나눈 이유'));
  check('기술 검토 섹션이 있음', html.includes('기술 검토'));
  check('밝은 테마 색이 정의됨', html.includes(':root{--paper:'));
  check('어두운 테마도 정의됨', html.includes('prefers-color-scheme:dark'));
  check('본문 배경을 직접 칠함', html.includes('background:var(--paper)'));

  console.log('\n─── 상담 폼 ───');
  const filled = {
    companyName: '청새공조',
    industry: '공조기 제작업체',
    region: '전국',
    primaryGoal: '상담·문의 접수',
    targetCustomer: '기업 총무·시설 담당자',
    toneWords: '전문적인, 신뢰감 있는',
    neededFunctions: ['문의 폼', '지도'],
    regulatedIndustry: ['해당 없음'],
    rawNotes: '사이트가 아예 없고 블로그만 운영 중',
  };

  const text = toBriefText(filled);
  check('상호가 텍스트에 들어감', text.includes('상호: 청새공조'));
  check('여러 개 고른 항목은 쉼표로 합쳐짐', text.includes('필요한 기능: 문의 폼, 지도'));
  check('못 채운 필수 항목을 따로 적음', text.includes('상담에서 확인하지 못한 항목'));

  const back = parseBriefText(text);
  check('되돌린 값에 상호가 살아 있음', back.companyName === '청새공조');
  check('여러 개 고른 항목이 배열로 복원됨', JSON.stringify(back.neededFunctions) === JSON.stringify(['문의 폼', '지도']));
  check('자유 메모가 살아 있음', back.rawNotes?.includes('블로그만 운영'));
  check(
    '채웠던 항목이 하나도 사라지지 않음',
    Object.keys(filled).every((k) => back[k] !== undefined && String(back[k]).length > 0),
  );
  check('되돌린 값을 다시 텍스트로 만들면 같음', toBriefText(back) === text);
  check('빈 값으로도 안 터짐', typeof toBriefText({}) === 'string' && missingRequired({}).length > 0);

  console.log('\n─── 동시 실행 ───');
  const arch = { pages: [{ title: 'A' }, { title: 'B' }, { title: 'C' }] };

  // 아직 아무 페이지도 안 끝난 상태
  let state = { brief: {}, strategy: {}, architecture: arch, pages: [] };
  check('남은 페이지 3개를 모두 내놓음', pendingPageStages(state).length === 3);
  check('다음 단계는 첫 페이지', nextStage(state).key === 'page:0');

  // 2번이 0번보다 먼저 끝난 상황
  state = { ...state, pages: [{ index: 2, title: 'C', sections: [] }] };
  const pending = pendingPageStages(state);
  check('끝난 페이지는 다시 요청하지 않음', !pending.some((p) => p.key === 'page:2'));
  check('남은 것은 0번과 1번', pending.map((p) => p.key).join() === 'page:0,page:1');

  // 전부 끝났지만 순서가 뒤섞인 상태
  state = {
    ...state,
    pages: [
      { index: 2, title: 'C', sections: [] },
      { index: 0, title: 'A', sections: [] },
      { index: 1, title: 'B', sections: [] },
    ],
  };
  check('페이지가 다 차면 유의점으로 넘어감', nextStage(state).key === 'advisories');
  check(
    '완성 순서와 무관하게 사이트맵 순서로 정렬',
    assemble(state).pages.map((p) => p.title).join() === 'A,B,C',
  );

  console.log('\n─── 전역 요소 ───');
  // 헤더와 푸터가 두 페이지에 똑같이 들어간 상태
  const withGlobals = {
    brief: { companyName: '테스트', budget: '미확인', industry: '', region: '', scale: '',
      existingChannels: '', primaryGoal: '', targetCustomer: '', toneWords: [], avoidTone: '',
      deadline: '', regulated: '', assumptions: [], openQuestions: [] },
    strategy: { positioning: '', singleGoal: '', audience: '', trustMaterials: [],
      style: 'Calm', styleRationale: '', styleRunnerUp: '' },
    architecture: { menu: [], menuNote: '', pages: [] },
    advisories: { features: [], production: [], assetsToCollect: [], budgetNote: '', technical: [] },
    pages: [
      { index: 0, title: 'A', sections: [
        { purpose: '헤더', blockId: 'h1', needsCustomTone: false },
        { purpose: '본문 A', blockId: 'x1', needsCustomTone: true },
        { purpose: '푸터', blockId: 'f1', needsCustomTone: false },
      ] },
      { index: 1, title: 'B', sections: [
        { purpose: '헤더', blockId: 'h1', needsCustomTone: false },
        { purpose: '본문 B', blockId: 'x1', needsCustomTone: true },
        { purpose: '푸터', blockId: 'f1', needsCustomTone: false },
      ] },
    ],
  };
  const built = assemble(withGlobals);
  check('맨 위·맨 아래 공통 블록만 전역으로 뺌', built.globals.map((g) => g.blockId).sort().join() === 'f1,h1');
  check('여러 페이지에 나오는 본문 블록은 전역이 아님', built.pages.every((p) => p.sections.length === 1));
  check('블록 종류는 3종 (헤더·본문·푸터)', built.counts.blocks === 3);
  check('배치 횟수는 4회', built.counts.placements === 4);
  check('톤 커스텀은 종류로 세어 1종', built.counts.customTone === 1);
  check('페이지 수는 그대로 2개', built.counts.pages === 2);

  check('본문에 겹친 블록만 중복으로 잡음', built.duplicates.length === 1);
  check('헤더·푸터는 중복에서 빠짐', !built.duplicates.join().includes('헤더'));
  check('중복에 어느 페이지인지 적힘', built.duplicates[0]?.includes('본문 A'));

  const gHtml = renderPlan(built);
  check('화면에 전 페이지 공통 묶음이 나옴', gHtml.includes('전 페이지 공통'));
  check('헤더가 화면에 한 번만 나옴', (gHtml.match(/>헤더 /g) ?? []).length === 1);

  state = { ...state, advisories: { features: [] } };
  check('유의점 다음은 기술 검토', nextStage(state).key === 'technical');
  state = { ...state, technical: [{ area: '속도', items: [] }] };
  check('기술 검토까지 끝나면 완료', nextStage(state) === null);
  check('기술 검토가 유의점에 합쳐짐', assemble(state).advisories.technical.length === 1);

  const outDir = path.join(ROOT, 'out', 'selftest');
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'plan.html'), html);

  console.log(failures === 0 ? '\n전부 통과\n' : `\n실패 ${failures}건\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
