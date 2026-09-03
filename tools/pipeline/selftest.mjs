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
import { renderBlockMenu, renderStyleTable, blockLabel, previewUrls } from '../../src/catalog.mjs';
import { runPipeline, stageReview, stageGuideline } from '../../src/pipeline.mjs';
import { renderPlan } from '../../src/render.mjs';
import { nextStage, pendingPageStages, assemble, findDuplicates, summarize } from '../../lib/runner.mjs';
import { normalizePages } from '../../lib/edit.mjs';
import { buildPack, packMarkdown, packCsv, IMAGE_CATEGORIES } from '../../src/pack.mjs';
import { guidelineMarkdown, checkContrast } from '../../src/guideline.mjs';
import { contrast } from '../../src/color.mjs';
import { splitGlobals } from '../../src/counts.mjs';
import { createModel } from '../../src/model.mjs';
import { z } from 'zod';
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
      seen.push({ stage, role, shared, task, schema });
      if (stage === '마케팅·UX 검토') {
        reviewSchemaAccepts = (v) => schema.safeParse(v).success;
      }

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
      } else if (stage === '마케팅·UX 검토') {
        value = {
          market: {
            sameness: ['믿을 수 있는 파트너', '고객 만족을 최우선으로', '풍부한 경험'],
            wedge: {
              claim: '세무사가 직접 상담합니다',
              evidence: '브리프의 규모 항목 — 세무사 2명에 직원 3명이라 직접 응대가 가능합니다',
            },
            proofGaps: [
              { claim: '빠른 회신', need: '실제 평균 회신 시간' },
              { claim: '기장 이관이 간단하다', need: '실제 이관 절차와 소요 일수' },
            ],
            objections: [
              { doubt: '비용이 얼마나 나올지 모르겠다', answerAt: '상담 안내', how: '구간을 밝힙니다' },
              { doubt: '지금 세무사를 바꿔도 되나', answerAt: '홈', how: '이관 절차를 세 단계로 보입니다' },
              { doubt: '연락하면 영업당하는 것 아닌가', answerAt: '상담 안내', how: '상담 범위를 먼저 적습니다' },
            ],
          },
          ux: {
            entries: [{ from: '블로그', expects: '글을 쓴 사람이 누구인지', firstScreen: '세무사 실명과 얼굴' }],
            flows: [
              { name: '문의까지', steps: ['홈', '상담 안내'], friction: '전화번호가 푸터에만 있음' },
              { name: '비용 확인', steps: ['홈', '상담 안내'], friction: '구간이 첫 화면에 안 보임' },
            ],
            dropoffs: [
              { where: '홈 첫 화면', why: '무슨 일을 하는지 안 보임', fix: '한 줄로 먼저 답합니다' },
              { where: '상담 안내 폼', why: '입력 항목이 많음', fix: '이름·연락처·내용만 받습니다' },
            ],
            mobile: ['전화 버튼이 한 손에 닿는 위치인지', '표로 짠 비용 구간이 가로로 밀리지 않는지'],
          },
        };
      } else if (stage.startsWith('페이지 구성')) {
        const isHome = stage.includes('홈');
        // AI 블록이 아닌 자리의 ai 는 네 칸 모두 빈 문자열이다.
        const noSpec = { layout: '', media: '', mobile: '', interaction: '' };
        value = {
          sections: [
            { purpose: '전역 헤더', fill: '마켓플레이스 블록', blockId: header.blockId,
              note: '로고와 메뉴', copy: '', needsCustomTone: false, ai: noSpec },
            isHome
              ? { purpose: '첫 화면', fill: '마켓플레이스 블록', blockId: banner.blockId,
                  note: '사무실 실사진', copy: '설명부터 다릅니다', needsCustomTone: false,
                  ai: { layout: '지워져야 한다', media: '', mobile: '', interaction: '' } }
              : { purpose: '상담 절차', fill: '마켓플레이스 블록', blockId: FAKE_ID,
                  note: '없는 블록이라 AI 블록으로 돌아가야 함', copy: '', needsCustomTone: true,
                  ai: noSpec },
            { purpose: '세무사 소개', fill: 'AI 블록', blockId: '',
              note: '맡길 사람이 누구인지 보여 주는 자리',
              copy: '김청새 세무사\n[상담 신청]', needsCustomTone: true,
              ai: {
                layout: '왼쪽 얼굴 사진 40%, 오른쪽 이름·약력 60%. 인물 2명을 세로로 반복',
                media: '인물 사진 2장, 3:4 세로',
                mobile: '사진 위, 글 아래 한 줄로',
                interaction: '카드를 누르면 상세로. 나타나는 효과는 넣지 않음',
              } },
            { purpose: '상담 문의', fill: '마켓플레이스 블록', blockId: form.blockId,
              note: '동의 체크박스 필수', copy: '', needsCustomTone: false, ai: noSpec },
            { purpose: '칼럼 목록', fill: '식스샵 기본 기능', blockId: '',
              note: '식스샵 기본 게시판', copy: '', needsCustomTone: false, ai: noSpec },
            { purpose: '푸터', fill: '마켓플레이스 블록', blockId: footer.blockId,
              note: '사업자 정보', copy: '', needsCustomTone: false, ai: noSpec },
          ],
        };
      } else if (stage === '기능과 유의점') {
        value = {
          features: [{ level: '필수', title: '문의 접수', detail: '게시판과 시트에 동시 저장' }],
          production: [{ mark: '전용', title: '블록 설명은 쇼핑몰 기준입니다. ', detail: '서비스로 바꿔 읽어야 합니다.' }],
          assetsToCollect: ['세무사 프로필 사진'],
          budgetNote: '예산 안에서 무리가 없습니다.',
        };
      } else if (stage === '디자인 지침') {
        value = {
          name: 'tax-firm-quiet',
          description: '읽는 사람이 판단에 필요한 것만 남기고 나머지를 덜어낸 화면.',
          mood: ['차분한', '정확한', '군더더기 없는'],
          colors: {
            primary: '#1f4e79', primaryHover: '#173c5c',
            ink: '#1a1a1a', inkMuted: '#5a5a5a', hairline: '#e2e2e2',
            canvas: '#ffffff', surface: '#f7f7f8', onPrimary: '#ffffff',
          },
          typography: {
            bodyFont: '프리텐다드', headingFont: '프리텐다드',
            bodySize: 16, bodyWeight: 400, bodyLineHeight: 1.7, bodyLetterSpacing: '-0.01em',
            scale: [
              { role: 'display', size: 36, weight: 700 },
              { role: 'title', size: 24, weight: 700 },
              { role: 'caption', size: 13, weight: 400 },
            ],
            weights: [400, 700],
          },
          rounded: { sm: 4, md: 8, lg: 16, pill: 9999 },
          spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 40, section: 72 },
          components: [
            { name: '주 버튼', spec: '배경 primary, 글자 onPrimary, 모서리 sm, 여백 12px 20px' },
            { name: '보조 버튼', spec: '배경 canvas, 테두리 hairline, 글자 ink, 모서리 sm' },
            { name: '카드', spec: '배경 surface, 테두리 hairline, 모서리 md, 안여백 lg' },
            { name: '입력칸', spec: '배경 canvas, 테두리 hairline, 모서리 sm, 높이 44px' },
          ],
          dos: [
            '누를 수 있는 것은 전부 primary 한 색으로 표시합니다.',
            '본문은 16px 400 으로 고정하고 강조는 굵기 700 으로만 냅니다.',
            '경계는 hairline 선으로 냅니다.',
            '표와 목록의 세로 간격을 lg 로 통일합니다.',
          ],
          donts: [
            '그라디언트를 쓰지 않습니다 — 배경은 단색이고, 신뢰는 여백이 만듭니다.',
            '그림자를 쓰지 않습니다 — 경계는 선으로 냅니다.',
            '굵기 400·700 밖의 값을 쓰지 않습니다 — 그 사이 값은 흐릿해 보입니다.',
            '강조색 말고 다른 색을 강조에 쓰지 않습니다 — 색이 늘면 어디를 눌러야 할지 흐려집니다.',
            '모서리를 정해진 네 단계 밖의 값으로 두지 않습니다 — 블록마다 달라 보입니다.',
          ],
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

/** 검토 스키마가 이 값을 받아들이는지. 개수 제한이 실제로 걸리는지 본다. */
let reviewSchemaAccepts = () => false;

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
  check('식스샵 기본 기능 자리는 남음',
    plan.pages[0].sections.some((s) => s.fill === '식스샵 기본 기능'));
  // 블록 "종류" 는 서로 다른 blockId 의 수다. 같은 헤더가 두 페이지에 있어도
  // 만드는 일은 한 번이므로 한 종으로 센다. 배치 횟수는 따로 센다.
  check('블록 종류 집계가 맞음', plan.counts.blocks === new Set(ids).size);
  check('배치 횟수는 종류보다 많음', plan.counts.placements > plan.counts.blocks);
  check('CLI 와 웹이 같은 방식으로 셈',
    JSON.stringify(plan.counts) === JSON.stringify(summarize({ pages: plan.pages })));

  /* ── 한 자리를 채우는 세 가지 길 ─────────────────────────── */

  const slots = plan.pages.flatMap((p) => p.sections);
  check('세 가지가 모두 쓰임',
    new Set(slots.map((s) => s.fill)).size === 3);
  check('마켓플레이스 블록만 blockId 를 가짐',
    slots.every((s) => (s.fill === '마켓플레이스 블록') === Boolean(s.blockId)));

  const ai = slots.filter((s) => s.fill === 'AI 블록');
  check('AI 블록 자리가 남음', ai.length >= 1);
  check('AI 블록에는 무엇을 만들지 적혀 있음', ai.every((s) => s.note.length > 10));
  check('AI 블록은 블록 종류로 세지 않음',
    plan.counts.blocks === new Set(ids).size);

  // 없는 블록을 고른 자리는 지우지 않고 AI 블록으로 돌린다. 그 자리에 필요했던
  // 내용까지 사라지면 안 되기 때문이다.
  const turned = slots.find((s) => s.purpose === '상담 절차');
  check('없는 블록을 고른 자리는 지우지 않고 AI 블록으로 돌림',
    turned?.fill === 'AI 블록' && turned.blockId === '');
  check('돌린 자리는 톤 손질이 필요한 것으로 표시됨', turned?.needsCustomTone === true);

  // 배치 지시는 AI 블록 자리에만 남는다. 다른 자리에 있으면 쓰이지도 않으면서
  // 문서에만 새어 나온다.
  const aiSection = slots.find((s) => s.purpose === '세무사 소개');
  const marketSection = slots.find((s) => s.purpose === '첫 화면');
  check('AI 블록 자리의 배치 지시가 남음', aiSection?.ai?.layout.includes('왼쪽 얼굴 사진'));
  check('마켓플레이스 자리의 배치 지시는 지워짐', marketSection?.ai === undefined);

  console.log('\n─── 화면 ───');
  const html = renderPlan(plan);
  check('제목에 상호가 들어감', html.includes('테스트 세무법인 웹사이트 기획서'));
  check('블록 이름이 화면에 나옴', html.includes(plan.pages[0].sections[0].blockName));
  check('기본 기능 자리를 따로 표시', html.includes('식스샵 기본 기능'));
  // AI 블록 자리는 미리보기가 없다. 어떤 모양인지 글로라도 있어야 한다.
  check('AI 블록 자리의 배치가 기획서에도 보임', html.includes('배치 왼쪽 얼굴 사진'));
  check('마켓플레이스 자리에는 배치 줄이 없음', !html.includes('배치 지워져야 한다'));
  check('확인할 질문이 실림', html.includes('주력 고객층은?'));
  check('페이지 수의 근거가 실림', html.includes('페이지를 이렇게 나눈 이유'));
  check('기술 검토 섹션이 있음', html.includes('기술 검토'));
  check('AI 블록 자리가 문서에 따로 표시됨', html.includes('AI 블록으로 제작'));
  check('AI 블록 표시가 무엇인지 문서가 설명함', html.includes('AI 블록으로 새로 만드는'));

  check('검토 섹션이 실림', html.includes('이 업종에서 이미 닳은 말'));
  check('닳은 표현이 그대로 나옴', html.includes('고객 만족을 최우선으로'));
  check('우리만 할 수 있는 말과 근거가 함께 나옴',
    html.includes('세무사가 직접 상담합니다') && html.includes('세무사 2명에 직원 3명'));
  check('망설임과 푸는 자리가 표로 나옴', html.includes('문의 직전의 망설임'));
  check('유입별 첫 화면이 나옴', html.includes('어디서 들어와 무엇을 기대하는가'));
  check('흐름이 화살표로 이어짐', html.includes('홈 → 상담 안내'));
  check('이탈 지점이 나옴', html.includes('이탈이 나는 자리'));
  check('모바일 항목이 나옴', html.includes('모바일에서 다르게 볼 것'));
  check('검토가 들어가면 사이트맵이 04 로 밀림', html.includes('>04</span>사이트맵'));

  // 검토 결과가 페이지 단계 프롬프트에 실제로 들어가야 한다.
  const pageTasks = model.seen.filter((x) => x.stage.startsWith('페이지 구성')).map((x) => x.task);
  check('페이지 단계가 검토 결과를 받음', pageTasks.every((t) => t.includes('마케팅·UX 검토')));
  check('닳은 표현을 쓰지 말라는 지시가 붙음', pageTasks.every((t) => t.includes('sameness')));
  check('검토가 사이트맵 뒤 페이지 앞에서 돎',
    model.seen.findIndex((x) => x.stage === '마케팅·UX 검토') >
      model.seen.findIndex((x) => x.stage === '사이트맵') &&
    model.seen.findIndex((x) => x.stage === '마케팅·UX 검토') <
      model.seen.findIndex((x) => x.stage.startsWith('페이지 구성')));

  // 개수 상한·하한이 실제로 걸리는지. 지시로만 두면 지켜지지 않았다.
  const reviewTask = model.seen.find((x) => x.stage === '마케팅·UX 검토');
  const tooMany = {
    ...plan.review,
    ux: { ...plan.review.ux, mobile: ['가', '나', '다', '라', '마'] },
  };
  const tooFew = { ...plan.review, ux: { ...plan.review.ux, mobile: ['하나만'] } };
  const none = { ...plan.review, ux: { ...plan.review.ux, mobile: [] } };

  // 모자란 것은 못 쓰는 결과라 다시 받아야 한다. 하한은 스키마에 남긴다.
  check('모바일 항목이 비면 통과하지 못함', !reviewSchemaAccepts(none));
  check('모바일 항목이 하나뿐이어도 통과하지 못함', !reviewSchemaAccepts(tooFew));
  check('알맞은 개수는 통과함', reviewSchemaAccepts(plan.review));

  // 넘치는 것은 못 쓰는 결과가 아니라 그냥 긴 것이다. 여기서 파싱을 실패시키면
  // 이미 값을 치른 호출이 통째로 날아간다. 실제로 그렇게 검토 단계가 죽었다.
  check('모바일 항목이 다섯이어도 통과함', reviewSchemaAccepts(tooMany));
  check('망설임 여섯 개도 통과함', reviewSchemaAccepts({
    ...plan.review,
    market: {
      ...plan.review.market,
      objections: Array.from({ length: 6 }, (_, i) => ({
        doubt: `망설임 ${i}`, answerAt: '홈', how: '풉니다',
      })),
    },
  }));

  // 대신 단계가 받은 뒤에 자른다. 이 배선이 실제로 걸려 있는지 본다.
  const longReview = await stageReview(
    {
      generate: async () => ({
        market: {
          sameness: ['가', '나', '다', '라', '마', '바'],
          wedge: { claim: 'x', evidence: 'y' },
          proofGaps: Array.from({ length: 7 }, (_, i) => ({ claim: `주장 ${i}`, need: '자료' })),
          objections: Array.from({ length: 6 }, (_, i) => ({
            doubt: `망설임 ${i}`, answerAt: '홈', how: '풉니다',
          })),
        },
        ux: {
          entries: Array.from({ length: 6 }, (_, i) => ({
            from: `유입 ${i}`, expects: 'x', firstScreen: 'y',
          })),
          flows: Array.from({ length: 5 }, (_, i) => ({
            name: `흐름 ${i}`, steps: ['홈'], friction: 'x',
          })),
          dropoffs: Array.from({ length: 6 }, (_, i) => ({ where: `${i}`, why: 'x', fix: 'y' })),
          mobile: ['가', '나', '다', '라', '마'],
        },
      }),
    },
    { brief: {}, strategy: {}, architecture: {} },
  );
  check('넘겨 온 모바일 항목을 넷으로 자름', longReview.ux.mobile.length === 4);
  check('앞에서부터 남김', longReview.ux.mobile.join() === '가,나,다,라');
  check('망설임도 다섯으로 자름', longReview.market.objections.length === 5);
  check('남들 다 하는 말도 다섯으로 자름', longReview.market.sameness.length === 5);
  check('자료 부족도 다섯으로 자름', longReview.market.proofGaps.length === 5);
  check('유입은 넷으로 자름', longReview.ux.entries.length === 4);
  check('흐름은 셋으로 자름', longReview.ux.flows.length === 3);
  check('이탈 지점은 넷으로 자름', longReview.ux.dropoffs.length === 4);
  check('자른 결과는 스키마를 다시 통과함', reviewSchemaAccepts(longReview));

  check('한 사실을 여러 목록에 나눠 쓰지 말라는 지시가 있음',
    reviewTask.task.includes('가장 잘 맞는 목록 한 곳에만'));
  check('모바일을 반드시 채우라는 지시가 있음', reviewTask.task.includes('반드시 채우세요'));
  check('페이지 단계가 화면에 보이는 자리만 쓰게 지시함',
    pageTasks.every((t) => t.includes('화면에 실제로 보이는 자리만')));
  check('페이지 단계가 검토의 순서 지정을 따르게 지시함',
    pageTasks.every((t) => t.includes('자리의 앞뒤 순서를 지정했으면')));

  // 검토가 없는 옛 기획서도 그대로 열려야 한다.
  const old = renderPlan({ ...plan, review: undefined });
  check('검토 없는 옛 기획서도 열림', old.includes('>03</span>사이트맵'));
  check('그때는 검토 섹션이 없음', !old.includes('이 업종에서 이미 닳은 말'));
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

  // 사이트맵까지만 나온 상태 — 페이지보다 검토가 먼저다
  check(
    '사이트맵 다음은 마케팅·UX 검토',
    nextStage({ brief: {}, strategy: {}, architecture: arch }).key === 'review',
  );

  // 아직 아무 페이지도 안 끝난 상태
  let state = { brief: {}, strategy: {}, architecture: arch, review: {}, pages: [] };
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

  // 헤더 위에 공지 띠배너가 한 줄 오는 구성이 흔하다. 맨 위 한 자리만 보면
  // 헤더가 페이지마다 두 번째로 밀려 전역에서 빠지고, 배치 횟수가 부푼다.
  // 실제 기획서에서 헤더만 5회로 세어졌다.
  const notch = (title, top) => ({
    index: title.charCodeAt(0), title,
    sections: [
      ...top,
      { purpose: '헤더', blockId: 'h1' },
      { purpose: `본문 ${title}`, blockId: `x${title}` },
      { purpose: `본문 둘 ${title}`, blockId: `y${title}` },
      { purpose: '푸터', blockId: 'f1' },
    ],
  });
  const banded = splitGlobals([
    notch('A', [{ purpose: '공지 띠', blockId: 'n1' }]),
    notch('B', []),
    notch('C', []),
  ]);
  check('띠배너에 밀린 헤더도 전역으로 잡힘',
    banded.globals.map((g) => g.blockId).sort().join() === 'f1,h1');
  check('한 페이지에만 있는 띠배너는 전역이 아님',
    banded.pages[0].sections.some((s) => s.blockId === 'n1'));
  check('전역을 뺀 자리에 본문이 남음',
    banded.pages[1].sections.map((s) => s.blockId).join() === 'xB,yB');
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
  check('기술 검토 다음은 디자인 지침', nextStage(state).key === 'guideline');
  check('기술 검토가 유의점에 합쳐짐', assemble(state).advisories.technical.length === 1);
  state = { ...state, guideline: { name: 'x' } };
  check('디자인 지침까지 끝나면 완료', nextStage(state) === null);

  /* ── 섹션 편집: 화면에서 온 값을 다듬는 규칙 ──────────────── */

  const real = pick(catalog, '헤더') ?? catalog.blocks[0];
  const other = catalog.blocks.find((b) => b.blockId !== real.blockId);
  const before = {
    architecture: { pages: [{ title: '홈', slug: 'home' }, { title: '소개', slug: 'about' }] },
    pages: [
      { index: 0, title: '홈', slug: 'home', sections: [
        { purpose: '헤더', blockId: real.blockId, note: '', copy: '', needsCustomTone: false },
        { purpose: '본문', blockId: other.blockId, note: '', copy: '', needsCustomTone: false },
      ] },
      { index: 1, title: '소개', slug: 'about', sections: [] },
    ],
  };

  // 순서를 뒤집고, 없는 블록을 하나 넣고, 사이트맵에 없는 페이지를 끼워 본다.
  const edited = normalizePages(
    before,
    [
      { index: 1, sections: [{ purpose: '새 자리', blockId: FAKE_ID }] },
      { index: 0, sections: [
        { purpose: '본문', blockId: other.blockId, needsCustomTone: true },
        { purpose: '헤더', blockId: real.blockId },
        { purpose: '기본 기능', blockId: '' },
      ] },
      { index: 99, sections: [{ purpose: '몰래 넣은 페이지', blockId: real.blockId }] },
    ],
    catalog,
  );

  check('편집 결과는 사이트맵 순서로 되돌아옴', edited.pages.map((p) => p.index).join() === '0,1');
  check('사이트맵에 없는 페이지는 버림', edited.pages.every((p) => p.index !== 99));
  check('바꾼 자리 순서가 그대로 남음', edited.pages[0].sections[0].purpose === '본문');
  check('없는 블록을 넣으면 AI 블록으로 돌아감',
    edited.pages[1].sections[0]?.fill === 'AI 블록' && !edited.pages[1].sections[0].blockId);
  check('무엇이 어긋났는지 알려 줌', edited.problems.length === 1 && edited.problems[0].includes(FAKE_ID));
  check('블록 이름을 카탈로그에서 다시 붙임', edited.pages[0].sections[1].blockName === real.name);
  check('블록 없는 자리(식스샵 기본 기능)는 살아남음', edited.pages[0].sections[2].blockId === '');
  check('페이지 제목·주소는 사이트맵 값을 씀', edited.pages[0].slug === 'home');
  check('손으로 켠 톤 커스텀이 남음', edited.pages[0].sections[0].needsCustomTone === true);

  const editedCounts = summarize({ ...before, pages: edited.pages });
  // 블록 없는 자리(식스샵 기본 기능)는 마켓플레이스 배치가 아니므로 세지 않는다.
  check('편집 뒤 집계가 다시 계산됨', editedCounts.placements === 2 && editedCounts.pages === 2);
  check('블록 없는 자리는 배치로 세지 않음', editedCounts.blocks === 2);

  const overflow = normalizePages(
    before,
    [{ index: 0, sections: Array.from({ length: 60 }, () => ({ purpose: 'x', blockId: real.blockId })) }],
    catalog,
  );
  check('한 페이지 자리 수에 상한이 있음', overflow.pages[0].sections.length === 40);

  // 손으로 채우는 법을 바꾼 경우
  const switched = normalizePages(
    before,
    [{ index: 0, sections: [
      { purpose: '직원 소개', fill: 'AI 블록', blockId: real.blockId, note: '얼굴과 이름' },
      { purpose: '게시판', fill: '식스샵 기본 기능', blockId: real.blockId, note: '' },
      { purpose: '이상한 값', fill: '없는값', blockId: real.blockId, note: '' },
    ] }],
    catalog,
  );
  check('AI 블록으로 바꾸면 blockId 가 지워짐',
    switched.pages[0].sections[0].fill === 'AI 블록' && switched.pages[0].sections[0].blockId === '');
  check('기본 기능으로 바꿔도 blockId 가 지워짐',
    switched.pages[0].sections[1].blockId === '');
  check('모르는 값이 오면 blockId 를 보고 정함',
    switched.pages[0].sections[2].fill === '마켓플레이스 블록');
  check('블록을 안 쓰는 자리는 배치로 세지 않음',
    summarize({ ...before, pages: switched.pages }).placements === 1);

  // 편집 화면은 배치 지시를 만지지 않는다. 한 번 저장했다고 프롬프트가
  // 사라지면 AI 블록 자리를 다시 짜야 한다.
  const kept = normalizePages(
    before,
    [{ index: 0, sections: [
      { purpose: '직원 소개', fill: 'AI 블록', blockId: '', note: '고침',
        ai: { layout: '왼쪽 사진 40%', media: '3:4 세로', mobile: '위아래로', interaction: '없음' } },
      { purpose: '헤더', fill: '마켓플레이스 블록', blockId: real.blockId,
        ai: { layout: '남으면 안 됨', media: '', mobile: '', interaction: '' } },
    ] }],
    catalog,
  );
  check('편집해도 AI 블록의 배치 지시가 남음',
    kept.pages[0].sections[0].ai?.layout === '왼쪽 사진 40%');
  check('편집 뒤에도 마켓플레이스 자리에는 배치 지시가 없음',
    kept.pages[0].sections[1].ai === undefined);

  /* ── 콘텐츠 팩 ────────────────────────────────────────────── */

  const banner = pick(catalog, '메인 배너');   // 그림이 있어야 차는 자리
  // 블록 하나가 분류를 여럿 달고 있어서, 그림 분류가 하나도 없는 것을 골라야 한다.
  const textOnly = catalog.blocks.find(
    (b) => b.categories.length && !b.categories.some((c) => IMAGE_CATEGORIES.has(c)),
  );

  const packData = {
    pages: [
      { index: 1, title: '메뉴', slug: 'menu', sections: [
        { purpose: '메뉴 묶음', blockId: textOnly.blockId, note: '',
          copy: '이런 메뉴는 어떠세요\n(메뉴명 1 / 가격)\n※ 가격은 고객사 확정 자료를 받아 반영합니다.',
          needsCustomTone: true },
      ] },
      { index: 0, title: '홈', slug: 'home', sections: [
        { purpose: '메인 비주얼', blockId: banner.blockId, note: '사진 보강 필요',
          copy: '조용히 앉아 커피 한 잔.\n[메뉴 보기]', needsCustomTone: false },
        { purpose: '공지 게시판', blockId: '', note: '식스샵 기본 게시판으로 처리',
          copy: '', needsCustomTone: false },
      ] },
    ],
  };

  const pack = buildPack(packData, catalog);

  check('팩은 사이트맵 순서로 나옴', pack.pages.map((p) => p.index).join() === '0,1');
  check('페이지마다 자리가 순서대로 매겨짐', pack.pages[0].sections.map((s) => s.at).join() === '1,2');
  check('그림이 필요한 자리를 분류로 알아냄', pack.pages[0].sections[0].needsImage === true);
  check('글만으로 되는 자리는 이미지 필요가 아님', pack.pages[1].sections[0].needsImage === false);
  check('문구 속 [버튼] 표기를 뽑아냄', pack.pages[0].sections[0].buttons.join() === '메뉴 보기');

  // 대괄호가 버튼 표기와 "아직 안 정해진 값" 두 가지로 쓰이고 있었다.
  // 그대로 두면 '확인 필요' 나 '버튼' 이라는 글자가 버튼으로 세어지고,
  // AI 블록 프롬프트가 그것을 버튼으로 만들라고 시킨다.
  const brackets = buildPack(
    { pages: [{ index: 0, title: '홈', sections: [
      { purpose: '이것저것', fill: '마켓플레이스 블록', blockId: textOnly.blockId, note: '',
        copy: '[메뉴 보기]\n[확인 필요]\n[버튼] 오시는 길 보기\n[메뉴명 1] / [원두명] / [산지]\n[대표 메뉴명 확인 필요]\n수원 ○○구 ○○로' },
    ] }] },
    catalog,
  );
  check('진짜 버튼만 남음', brackets.pages[0].sections[0].buttons.join() === '메뉴 보기');
  check('버튼이 아닌 대괄호는 문구에 그대로 있음',
    brackets.pages[0].sections[0].copy.includes('[확인 필요]'));
  check('버튼 개수 집계도 같이 맞음', brackets.summary.buttons === 1);
  check('확정 자료를 기다리는 자리를 표시함', pack.pages[1].sections[0].pending === true);
  check('다 정해진 자리는 미확정이 아님', pack.pages[0].sections[0].pending === false);
  check('메모에 적힌 미확정도 잡아냄', buildPack(
    { pages: [{ index: 0, title: 'x', sections: [{ purpose: 'y', blockId: textOnly.blockId, note: '확인 필요', copy: '' }] }] },
    catalog,
  ).pages[0].sections[0].pending === true);
  check('블록 없는 자리도 남고 기본 기능으로 셈', pack.summary.basic === 1);
  check('블록 종류는 둘', pack.summary.blocks === 2);
  check('집계가 맞음', pack.summary.slots === 3 && pack.summary.images === 1 && pack.summary.tone === 1);

  check('이름에 이미 붙은 계열을 또 붙이지 않음', blockLabel('카드 배너 (Calm)', 'Calm') === '카드 배너 (Calm)');
  check('이름에 계열이 없으면 붙여 줌', blockLabel('띠배너', 'Fresh') === '띠배너 (Fresh)');
  check('계열 없는 블록은 그대로', blockLabel('드롭 텍스트', null) === '드롭 텍스트');
  check('공식 파트너 표시를 뒤에 붙임', blockLabel('카드 배너 (Calm)', 'Calm', true).endsWith('★'));
  check('미리보기 주소가 둘이면 갈라 줌',
    previewUrls('https://a.example\nhttps://b.example').length === 2);
  check('미리보기 주소가 없으면 빈 목록', previewUrls(null).length === 0);

  const twoUrls = catalog.blocks.filter((b) => previewUrls(b.previewUrl).length > 1);
  check('실제 카탈로그에도 주소 둘인 블록이 있음', twoUrls.length > 0);
  check('갈라 낸 주소가 전부 온전함',
    twoUrls.flatMap((b) => previewUrls(b.previewUrl)).every((u) => !/\s/.test(u)));

  const md = packMarkdown(pack, { company: '청새카페', style: 'Calm', assets: ['메뉴 사진'] });
  check('마크다운에 상호가 들어감', md.includes('청새카페 콘텐츠 팩'));
  check('마크다운에 자료 목록이 체크박스로 들어감', md.includes('- [ ] 메뉴 사진'));
  check('마크다운에 blockId 가 들어감', md.includes(banner.blockId));
  check('마크다운이 문구를 그대로 담음', md.includes('조용히 앉아 커피 한 잔.'));
  check('마크다운이 규격을 지어내지 않는다고 밝힘', md.includes('마켓플레이스 자료에 없습니다'));
  check('블록 없는 자리는 마켓플레이스 블록이 아니라고 적힘', md.includes('마켓플레이스 블록 아님'));

  // 콘텐츠 팩도 세 가지를 갈라 보여야 한다.
  const threeWay = buildPack(
    { pages: [{ index: 0, title: '홈', sections: [
      { purpose: '배너', fill: '마켓플레이스 블록', blockId: banner.blockId, note: '', copy: '' },
      { purpose: '직원 소개', fill: 'AI 블록', blockId: '', note: '좌측 사진 우측 이름', copy: '' },
      { purpose: '게시판', fill: '식스샵 기본 기능', blockId: '', note: '', copy: '' },
    ] }] },
    catalog,
  );
  check('AI 블록 자리를 따로 셈', threeWay.summary.ai === 1 && threeWay.summary.basic === 1);
  check('AI 블록은 마켓플레이스 블록 종류에 안 들어감', threeWay.summary.blocks === 1);
  check('AI 블록 자리의 이름표가 AI 블록임', threeWay.pages[0].sections[1].label === 'AI 블록');

  const threeMd = packMarkdown(threeWay, { company: '테스트' });
  check('마크다운이 AI 블록으로 만든다고 밝힘', threeMd.includes('새로 만듭니다'));
  check('마크다운에 AI 블록 자리 수가 나옴', threeMd.includes('AI 블록으로 만들 자리 1'));
  check('AI 블록 자리에 무엇을 만들지가 실림', threeMd.includes('좌측 사진 우측 이름'));

  const threeCsv = packCsv(threeWay);
  check('CSV 에 채우는법 열이 있음', threeCsv.split('\r\n')[0].includes('채우는법'));
  check('CSV 에 AI 블록이 적힘', threeCsv.includes('AI 블록'));

  const csv = packCsv(pack);
  const csvRows = csv.trimEnd().split('\r\n');
  check('CSV 는 머리글 한 줄에 자리마다 한 줄', csvRows.length === 4);
  check('CSV 는 엑셀이 한글을 읽도록 BOM 으로 시작', csv.startsWith('﻿'));
  check('CSV 가 줄바꿈 든 문구를 따옴표로 감쌈', csv.includes('"조용히 앉아 커피 한 잔.\n[메뉴 보기]"'));

  const quoted = packCsv({
    pages: [{ title: '홈', sections: [
      { at: 1, purpose: '따옴표 "안" 쓰기', copy: 'a,b', buttons: [], previews: [], label: '블록' },
    ] }],
  });
  check('CSV 가 따옴표와 쉼표를 제대로 감쌈', quoted.includes('"따옴표 ""안"" 쓰기"') && quoted.includes('"a,b"'));

  /* ── AI 블록 프롬프트 ─────────────────────────────────────── */

  const gl = plan.guideline;
  const spec = {
    layout: '왼쪽 사진 40%, 오른쪽 이름·약력 60%',
    media: '인물 사진 2장, 3:4 세로',
    mobile: '사진 위, 글 아래 한 줄로',
    interaction: '카드를 누르면 상세로. 나타나는 효과는 넣지 않음',
  };
  const promptData = {
    guideline: gl,
    pages: [{ index: 0, title: '소개', slug: 'about', sections: [
      { purpose: '배너', fill: '마켓플레이스 블록', blockId: banner.blockId, note: '', copy: '' },
      { purpose: '세무사 소개', fill: 'AI 블록', blockId: '', note: '맡길 사람을 보여 주는 자리',
        copy: '김청새 세무사\n[상담 신청]', ai: spec },
      { purpose: '칼럼 목록', fill: 'AI 블록', blockId: '', note: '지시 없이 목적만 있는 자리', copy: '' },
    ] }] };
  const withPrompt = buildPack(promptData, catalog, { company: '청새세무법인' });
  const [, aiSlot, thinSlot] = withPrompt.pages[0].sections;

  check('마켓플레이스 블록 자리에는 프롬프트가 없음',
    withPrompt.pages[0].sections[0].prompt === undefined);
  check('AI 블록 자리에 프롬프트가 붙음', typeof aiSlot.prompt === 'string' && aiSlot.prompt.length > 0);
  check('프롬프트가 무엇을 만들지로 시작함', aiSlot.prompt.startsWith('세무사 소개 섹션을 만들어 주세요.'));
  check('프롬프트에 배치가 들어감', aiSlot.prompt.includes('왼쪽 사진 40%'));
  check('프롬프트에 이미지 비율이 들어감', aiSlot.prompt.includes('3:4 세로'));
  check('프롬프트에 모바일에서 접히는 모양이 들어감', aiSlot.prompt.includes('사진 위, 글 아래'));
  check('프롬프트에 상호와 페이지가 들어감',
    aiSlot.prompt.includes('청새세무법인') && aiSlot.prompt.includes('소개 페이지'));
  check('프롬프트가 문구를 그대로 담음', aiSlot.prompt.includes('김청새 세무사'));
  check('프롬프트가 문구를 바꾸지 말라고 못박음', aiSlot.prompt.includes('늘리거나 바꾸지 마세요'));
  check('프롬프트가 버튼을 따로 알려 줌', aiSlot.prompt.includes('버튼: 상담 신청'));
  // [ ] 는 우리 문서의 버튼 표기다. 그대로 두면 대괄호까지 화면에 찍힌다.
  check('문구에서 버튼 표기의 대괄호를 텀', !aiSlot.prompt.includes('[상담 신청]'));
  check('버튼 글자 자체는 문구에 남음', aiSlot.prompt.includes('\n상담 신청\n'));

  // 버튼이 아닌 대괄호는 괄호째 남긴다. 괄호를 떼면 '확인 필요' 가 진짜
  // 넣을 글자처럼 보인다.
  const holder = buildPack(
    { guideline: gl, pages: [{ index: 0, title: '홈', sections: [
      { purpose: '안내', fill: 'AI 블록', blockId: '', note: '',
        copy: '담당자: [확인 필요]\n[문의 남기기]', ai: spec },
    ] }] },
    catalog,
    { company: 'x' },
  ).pages[0].sections[0];
  check('미정 자리는 대괄호를 남김', holder.prompt.includes('담당자: [확인 필요]'));
  check('그 옆의 진짜 버튼은 괄호를 텀', holder.prompt.includes('\n문의 남기기\n'));
  check('미정 자리를 버튼으로 세지 않음', holder.buttons.join() === '문의 남기기');

  // 줄 앞의 "제목:" "설명:" 은 역할 표시지 화면에 찍을 글자가 아니다.
  check('역할 표시를 찍지 말라고 일러 줌', aiSlot.prompt.includes('화면에 찍지 마세요'));

  // 어느 값이 버튼이고 카드인지는 지침의 구성 요소가 정한다. 프롬프트가
  // 다시 정하면 두 문서가 어긋난다.
  check('모서리는 쓸 수 있는 값만 알려 줌',
    aiSlot.prompt.includes(`모서리: ${gl.rounded.sm}·${gl.rounded.md}·${gl.rounded.lg}px`));
  check('모서리에 역할을 배정하지 않음', !aiSlot.prompt.includes('버튼 4px'));
  check('pill 은 숫자로 적지 않음', !aiSlot.prompt.includes('9999'));

  // 색은 코드가 지침에서 가져온다. 모델이 프롬프트에 따로 적으면 어긋난다.
  check('프롬프트의 색이 지침 값 그대로임', aiSlot.prompt.includes(gl.colors.primary));
  check('프롬프트에 금지 규칙이 들어감', aiSlot.prompt.includes(gl.donts[0]));
  check('금지 규칙을 다 싣지는 않음',
    gl.donts.length > 4 && !aiSlot.prompt.includes(gl.donts[4]));
  check('프롬프트가 어느 지침을 물릴지 알려 줌', aiSlot.prompt.includes(`「${gl.name}」`));

  // AI 블록은 분류가 없어 이미지 필요가 늘 꺼져 있었다. 사진이 필요한
  // 자리가 촬영 준비에서 통째로 빠진다.
  check('배치 지시에 이미지가 있으면 이미지 필요로 셈', aiSlot.needsImage === true);
  check('이미지 없는 AI 블록은 이미지 필요가 아님', thinSlot.needsImage === false);
  check('AI 블록의 이미지도 집계에 들어감', withPrompt.summary.images === 2);
  check('무슨 그림이 필요한지 목록에 보임',
    packMarkdown(withPrompt, {}).includes('- 이미지: 인물 사진 2장, 3:4 세로'));

  check('배치 지시가 있으면 얇은 프롬프트가 아님', aiSlot.thinPrompt === false);
  check('목적만 있는 자리는 얇다고 표시함', thinSlot.thinPrompt === true);
  check('얇은 것도 프롬프트는 나옴', thinSlot.prompt.includes('칼럼 목록 섹션을 만들어 주세요.'));
  check('문구가 없으면 지어내지 말라고 적힘', thinSlot.prompt.includes('자리 표시용으로'));
  check('얇은 프롬프트를 세어 알려 줌', withPrompt.summary.thinPrompts === 1);
  check('지침이 있다고 표시함', withPrompt.summary.guideline === true);

  // 지침이 아직 없는 기획서. 색을 지어내면 그대로 잘못 만들어진다.
  const noGuide = buildPack({ ...promptData, guideline: null }, catalog, { company: 'x' });
  const noGuideSlot = noGuide.pages[0].sections[1];
  check('지침이 없으면 색 줄이 빠짐', !noGuideSlot.prompt.includes('- 색:'));
  check('지침이 없어도 배치는 남음', noGuideSlot.prompt.includes('왼쪽 사진 40%'));
  check('지침이 없다고 표시함', noGuide.summary.guideline === false);

  const promptMd = packMarkdown(withPrompt, { company: '청새세무법인' });
  check('마크다운에 프롬프트가 실림', promptMd.includes('AI 블록 프롬프트'));
  check('마크다운이 스타일 참조를 일러 줌', promptMd.includes('스타일 참조에 디자인 지침'));
  check('마크다운이 얇은 프롬프트를 짚어 줌', promptMd.includes('넣기 전에 손보세요'));

  const promptCsv = packCsv(withPrompt);
  check('CSV 에 AI프롬프트 열이 있음', promptCsv.split('\r\n')[0].endsWith('AI프롬프트'));
  check('CSV 프롬프트 칸이 따옴표로 감싸짐', promptCsv.includes('"세무사 소개 섹션을 만들어 주세요.'));

  /* ── 디자인 지침 ─────────────────────────────────────────── */

  const g = plan.guideline;
  check('디자인 지침이 만들어짐', Boolean(g?.name));
  check('디자인 지침이 마지막 단계에서 돎',
    model.seen.at(-1).stage === '디자인 지침');
  check('완성 시각이 찍힘', Boolean(plan.generatedAt));

  check('읽을 수 있는 색 조합에는 문제가 없음', checkContrast(g).length === 0);

  // 흰 바탕에 옅은 회색 글자 — 가장 흔한 실수. 반드시 걸려야 한다.
  const unreadable = {
    ...g,
    colors: { ...g.colors, ink: '#bbbbbb', inkMuted: '#dddddd', onPrimary: '#88aacc' },
  };
  const found = checkContrast(unreadable);
  check('안 읽히는 글자색을 잡아냄', found.length >= 3);
  check('얼마나 모자란지 숫자로 알려 줌', found.some((x) => /\d\.\d:1/.test(x)));
  check('색 값이 틀린 것도 잡아냄',
    checkContrast({ colors: { ...g.colors, ink: '파랑' } }).some((x) => x.includes('읽을 수 없습니다')));

  check('대비비 계산이 맞음', Math.round(contrast('#000000', '#ffffff')) === 21);
  check('같은 색은 대비가 1', contrast('#123456', '#123456') === 1);

  const gmd = guidelineMarkdown(g, { company: '테스트 세무법인' });
  check('지침이 식스샵 형식(YAML 머리말)으로 나옴', gmd.startsWith('---\nversion: alpha'));
  check('머리말에 colors 가 들어감', gmd.includes('colors:\n  primary: "#1f4e79"'));
  check('머리말에 rounded·spacing 이 들어감',
    gmd.includes('rounded:\n  sm: 4px') && gmd.includes('spacing:\n  xs: 4px'));
  check('머리말이 닫힘', gmd.includes('---\n\n# 테스트 세무법인 디자인 지침'));

  // 모델이 크기 단계를 display·h2·h3·body·caption 으로 내놓으면 body 가 두 번
  // 들어가 YAML 에서 뒤엣것이 앞엣것을 덮는다. 실제 지침 파일이 그랬다.
  const dup = guidelineMarkdown({
    ...g,
    typography: {
      ...g.typography,
      scale: [
        { role: 'display', size: 34, weight: 600 },
        { role: 'body', size: 99, weight: 900 },
        { role: 'caption', size: 13, weight: 400 },
      ],
    },
  }, {});
  const head = dup.slice(0, dup.indexOf('\n---', 4));
  check('머리말에 같은 열쇠가 두 번 들어가지 않음',
    (head.match(/^ {2}body:$/gm) ?? []).length === 1);
  check('앞서 적은 본문 값이 덮이지 않음', head.includes(`fontSize: ${g.typography.bodySize}px`));
  check('겹치지 않는 단계는 그대로 남음', head.includes('  caption:'));

  // 설명에 콜론이 하나만 있어도 머리말이 깨진다.
  const colon = guidelineMarkdown({ ...g, description: '기준: 판단에 필요한 것만' }, {});
  check('설명을 따옴표로 감쌈', colon.includes('description: "기준: 판단에 필요한 것만"'));
  check('하지 말 것이 실림', gmd.includes('이렇게 하지 않습니다'));
  check('금지 규칙에 이유가 붙어 있음', g.donts.every((d) => d.includes('—')));
  check('글꼴을 확인하라고 적혀 있음', gmd.includes('식스샵에서 실제로 쓸 수 있는지'));

  // 지침도 같다. 넘겨 온 것은 자르고, 본문 크기는 범위 안으로 당긴다.
  const longGuideline = await stageGuideline(
    {
      generate: async () => ({
        ...g,
        mood: ['가', '나', '다', '라', '마', '바'],
        typography: {
          ...g.typography,
          bodySize: 40,
          weights: [100, 200, 300, 400, 700],
          scale: Array.from({ length: 7 }, (_, i) => ({ role: `${i}`, size: 20, weight: 400 })),
        },
        components: Array.from({ length: 9 }, (_, i) => ({ name: `${i}`, spec: 'x' })),
        dos: Array.from({ length: 8 }, (_, i) => `해야 할 것 ${i}`),
        donts: Array.from({ length: 12 }, (_, i) => `하지 말 것 ${i}`),
      }),
    },
    { brief: {}, strategy: {}, review: {} },
  );
  check('지침의 분위기를 다섯으로 자름', longGuideline.mood.length === 5);
  check('구성 요소를 일곱으로 자름', longGuideline.components.length === 7);
  check('금지 규칙을 여덟으로 자름', longGuideline.donts.length === 8);
  check('해야 할 것을 여섯으로 자름', longGuideline.dos.length === 6);
  check('굵기를 넷으로 자름', longGuideline.typography.weights.length === 4);
  check('본문 크기는 잘라 낼 수 없으니 범위로 당김', longGuideline.typography.bodySize === 20);

  const tinyBody = await stageGuideline(
    { generate: async () => ({ ...g, typography: { ...g.typography, bodySize: 9 } }) },
    { brief: {}, strategy: {}, review: {} },
  );
  check('너무 작은 본문 크기도 당김', tinyBody.typography.bodySize === 14);

  /* ── 스키마에 안 맞는 답이 왔을 때 ────────────────────────── */

  // 하한은 잘라서 못 고친다. 그런데 매번 같은 답이 오는 것도 아니다.
  // 한 번 더 부르면 대개 통과하므로, 사람이 다시 누르게 두지 않는다.
  const OkSchema = z.object({ ok: z.boolean() });
  const miss = () => Object.assign(new Error(
    'Failed to parse structured output: [ { "code": "too_small", "path": [ "ux", "mobile" ] } ]',
  ), { status: 200 });

  let tries = 0;
  const flaky = createModel({
    client: { messages: { parse: async () => {
      if (++tries === 1) throw miss();
      return { parsed_output: { ok: true }, usage: {} };
    } } },
  });
  const recovered = await flaky.generate({ stage: '검토', role: 'r', task: 't', schema: OkSchema });
  check('스키마에 안 맞으면 한 번 다시 부름', tries === 2 && recovered.ok === true);

  let always = 0;
  const broken = createModel({
    client: { messages: { parse: async () => { always++; throw miss(); } } },
  });
  const brokenErr = await broken
    .generate({ stage: '검토', role: 'r', task: 't', schema: OkSchema })
    .then(() => null, (e) => e);
  check('두 번 다 안 맞으면 그때는 멈춤', always === 2 && brokenErr instanceof Error);
  check('멈출 때 어느 단계인지 알려 줌', brokenErr.message.startsWith('[검토]'));

  // 크레딧 부족이나 인증 실패는 다시 불러도 같다. 값만 두 번 치른다.
  let paid = 0;
  const noCredit = createModel({
    client: { messages: { parse: async () => {
      paid++;
      throw Object.assign(new Error('Your credit balance is too low'), { status: 400 });
    } } },
  });
  const creditErr = await noCredit
    .generate({ stage: '검토', role: 'r', task: 't', schema: OkSchema })
    .then(() => null, (e) => e);
  check('크레딧 부족은 다시 부르지 않음', paid === 1);
  check('크레딧 부족은 무엇을 해야 하는지 알려 줌', creditErr.message.includes('충전'));

  const badMd = guidelineMarkdown(unreadable, {});
  check('안 읽히는 조합은 문서에도 적힘', badMd.includes('확인이 필요한 색 조합'));
  check('읽히는 조합에는 그 묶음이 없음', !gmd.includes('확인이 필요한 색 조합'));

  const outDir = path.join(ROOT, 'out', 'selftest');
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'pack.md'), md);
  await fs.writeFile(path.join(outDir, 'DESIGN.md'), gmd);
  await fs.writeFile(path.join(outDir, 'plan.html'), html);

  console.log(failures === 0 ? '\n전부 통과\n' : `\n실패 ${failures}건\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
