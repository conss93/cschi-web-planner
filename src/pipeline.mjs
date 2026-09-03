/**
 * 기획 생성 파이프라인.
 *
 * 한 번에 다 시키지 않고 단계로 쪼갠다. 단계마다 스키마가 다르고, 앞 단계의
 * 결론이 뒤 단계의 입력이 된다. 페이지 구성은 페이지끼리 독립이라 동시에 돌린다.
 */

import { z } from 'zod';
import { renderBlockMenu, renderStyleTable } from './catalog.mjs';

/* ── 모든 단계가 공유하는 역할과 규칙 ──────────────────────────────
   매 호출 동일한 문자열이어야 프롬프트 캐시가 산다. 여기에 날짜나 요청별
   값을 섞지 말 것. */

const ROLE = `당신은 웹사이트 제작 외주를 맡은 기획자입니다.
식스샵 프로로 사이트를 만들며, 화면은 마켓플레이스 블록을 조립해 구성합니다.

반드시 지킬 것:

1. 블록은 주어진 목록에 있는 것만 씁니다. blockId 를 지어내지 마세요.
2. 블록 설명글은 전부 쇼핑몰 기준으로 쓰여 있습니다. "상품"을 그 업종의
   서비스로, "컬렉션"을 서비스 분류로 바꿔 읽으세요. 이름이 안 맞는다고
   넘기면 쓸 수 있는 블록을 놓칩니다.
3. 게시판·블로그 목록을 만드는 블록은 마켓플레이스에 없습니다. 필요하면
   식스샵 기본 게시판 기능으로 처리한다고 적고 blockId 는 비웁니다.
4. 인물 소개 전용 블록도 없습니다. 카드 배너나 이미지+텍스트를 전용하세요.
5. 브리프에 없는 사실을 지어내지 마세요. 모르면 가정임을 밝히거나 확인할
   질문으로 남깁니다. 특히 수치, 경력, 실적은 함부로 쓰지 않습니다.
6. 광고 규정이 있는 업종이면 성공률·보장·최고 같은 표현을 쓰지 않습니다.
7. 블록이 몇 개인지, 몇 곳에 쓰이는지 같은 숫자를 세어 쓰지 마세요.
   집계는 문서가 자동으로 넣습니다. 세어 쓰면 실제와 어긋납니다.
8. 헤더와 푸터처럼 모든 페이지에 똑같이 들어가는 자리는 한 번 만들어
   재사용합니다. 페이지마다 새로 만드는 작업이 아닙니다.
9. 한국어로 씁니다. 문장은 담백하게, 과장 없이.`;

/* ── 1단계: 브리프 정리 ───────────────────────────────────────── */

const BriefSchema = z.object({
  companyName: z.string(),
  industry: z.string(),
  region: z.string(),
  scale: z.string(),
  existingChannels: z.string(),
  primaryGoal: z.string(),
  targetCustomer: z.string(),
  topQuestions: z.array(z.string()),
  toneWords: z.array(z.string()),
  avoidTone: z.string(),
  budget: z.string(),
  deadline: z.string(),
  regulated: z.string(),
  assumptions: z.array(
    z.object({
      field: z.string(),
      value: z.string(),
      basis: z.string(),
    }),
  ),
  openQuestions: z.array(
    z.object({
      question: z.string(),
      why: z.string(),
    }),
  ),
});

export async function stageBrief(model, { briefText }) {
  return model.generate({
    stage: '브리프 정리',
    role: ROLE,
    effort: 'medium',
    schema: BriefSchema,
    task: `아래는 상담에서 받아 적은 내용입니다. 기획에 필요한 항목으로 정리하세요.

빈 항목은 "미확인" 으로 두고, 메모에서 추론할 수 있으면 채운 뒤 assumptions 에
무엇을 무슨 근거로 채웠는지 적으세요.

openQuestions 에는 계약 전에 확인해야 할 것을 적습니다. 각 질문마다 그 답이
기획의 무엇을 바꾸는지(why)를 함께 적으세요. 3~6개면 충분합니다.

--- 상담 메모 ---
${briefText}`,
  });
}

/* ── 2단계: 전략과 톤 ─────────────────────────────────────────── */

function strategySchema(styles) {
  return z.object({
    positioning: z.string(),
    singleGoal: z.string(),
    audience: z.string(),
    trustMaterials: z.array(z.object({ title: z.string(), detail: z.string() })),
    style: z.enum(styles),
    styleRationale: z.string(),
    styleRunnerUp: z.string(),
  });
}

export async function stageStrategy(model, { catalog, brief }) {
  return model.generate({
    stage: '전략과 톤',
    role: ROLE,
    schema: strategySchema(catalog.styles),
    task: `아래 브리프를 보고 전략을 세우고 디자인 톤 계열을 하나 고르세요.

positioning 은 이 사이트가 방문자에게 어떤 판단을 하게 만들어야 하는지 두세 문장.
singleGoal 은 방문자가 할 단 하나의 행동.
trustMaterials 는 그 판단을 뒷받침할 재료 3~5개.

style 은 아래 계열 중 하나입니다. 한 계열로 통일해야 블록마다 색과 여백을
손보는 작업이 사라져 예산 안에 들어옵니다. 필요한 영역을 빠짐없이 덮는
계열을 고르고, styleRationale 에 왜 그 계열인지, styleRunnerUp 에 차선과
그것을 고르지 않은 이유를 적으세요.

--- 스타일 계열별 커버리지 ---
${renderStyleTable(catalog)}

--- 브리프 ---
${JSON.stringify(brief, null, 1)}`,
  });
}

/* ── 3단계: 사이트맵 ──────────────────────────────────────────── */

const ArchitectureSchema = z.object({
  menu: z.array(z.string()),
  menuNote: z.string(),
  // 페이지 수는 정해진 값이 아니라 브리프에서 도출되는 결론이다.
  // 왜 이 수인지 적게 해 근거 없이 늘어나는 것을 막는다.
  pageCountRationale: z.string(),
  pages: z.array(
    z.object({
      slug: z.string(),
      title: z.string(),
      goal: z.string(),
      summary: z.string(),
      inMenu: z.boolean(),
      // 페이지들은 서로를 모른 채 동시에 만들어진다. 여기서 범위를 갈라
      // 두지 않으면 같은 내용이 여러 페이지에 겹쳐 들어간다.
      covers: z.array(z.string()),
      avoid: z.array(z.string()),
    }),
  ),
});

export async function stageArchitecture(model, { brief, strategy }) {
  return model.generate({
    stage: '사이트맵',
    role: ROLE,
    schema: ArchitectureSchema,
    task: `사이트 구조를 정하세요.

페이지 수에 정해진 답은 없습니다. 브리프가 정합니다. 다만 아무 자리나
페이지가 되지는 않습니다. **아래 넷을 모두 만족할 때만** 독립 페이지로 둡니다.

1. 방문자가 그 페이지를 찾는 뚜렷한 이유가 있다 — 메뉴에서 고르거나 검색해서 들어옴
2. 한 화면을 채우고도 남는 고유 내용이 있다 — 부족하면 다른 페이지의 한 섹션이다
3. 별도 주소를 가질 값어치가 있다 — 검색 유입, 광고 도착지, 링크 공유
4. 고객사가 그 페이지를 채우고 갱신할 수 있다 — 원고와 사진을 댈 사람이 있는가

하나라도 못 미치면 다른 페이지의 섹션으로 넣으세요. 특히 자주 묻는 질문은
대개 2번을 못 넘겨 독립 페이지가 될 이유가 약합니다.

페이지가 하나 늘면 원고 한 벌, 사진 한 묶음, 갱신 부담이 함께 늡니다.
원고를 제작 측이 쓰기로 돼 있으면 페이지마다 견적이 붙습니다. 반대로
서비스 종류가 뚜렷이 나뉘고 각각 검색 유입을 노린다면 나누는 편이 낫습니다.
예산·원고 주체·자료 보유 상황을 보고 정하세요.

pageCountRationale 에 **왜 이 페이지 수인지** 한두 문장으로 적으세요.
무엇을 독립 페이지로 올렸고 무엇을 섹션으로 내렸는지가 드러나야 합니다.

상단 메뉴는 5개를 넘기지 마세요. 페이지가 그보다 많으면 하위로 묶습니다.
개인정보처리방침처럼 푸터에서만 연결하는 페이지는 inMenu 를 false 로 둡니다.

각 페이지의 goal 은 그 페이지가 방문자에게서 얻어내야 할 것 한 줄입니다.

covers 와 avoid 가 이 단계에서 가장 중요합니다. 페이지는 서로를 모르는 채로
만들어지므로, 여기서 범위를 갈라 두지 않으면 같은 내용이 여러 페이지에
중복해서 들어갑니다.

- covers: 이 페이지가 맡는 내용. 다른 페이지에는 넣지 않습니다.
- avoid: 다른 페이지가 맡으므로 이 페이지에서는 다루지 않을 내용.
  어느 페이지가 맡는지 함께 적으세요. 예: "문의 폼 — 문의하기 페이지가 맡음"

아래 것들은 **한 페이지에만** 두고 나머지 페이지의 avoid 에 적으세요.
문의 폼 · 지도와 오시는 길 · 문의 이후 진행 절차 · 자주 묻는 질문 묶음.
다른 페이지에서는 그 페이지로 보내는 링크나 버튼만 둡니다.

--- 브리프 ---
${JSON.stringify(brief, null, 1)}

--- 전략 ---
${JSON.stringify(strategy, null, 1)}`,
  });
}

/* ── 4단계: 마케팅·UX 검토 ────────────────────────────────────── */

/**
 * 전략과 사이트맵은 "무엇을 만들까"를 정한다. 여기서는 두 가지를 더 본다.
 *
 * 하나는 브랜드 마케터의 눈이다. 이 업종 사이트가 다 하는 말을 그대로 쓰면
 * 아무 말도 안 한 것과 같다. 무엇을 피하고 무엇을 우리만 말할 수 있는지,
 * 문의 직전에 드는 망설임을 어디서 풀지를 정한다.
 *
 * 다른 하나는 UI·UX 의 눈이다. 어디서 들어와 무엇을 기대하고 어디서 나가는지.
 * 이건 사이트맵을 그린 다음에야 볼 수 있고, 페이지를 짜기 전에 알아야 한다.
 * 그래서 이 자리에 둔다.
 */
const ReviewSchema = z.object({
  market: z.object({
    // 남들 다 하는 말. 여기 걸리면 문구를 다시 쓴다.
    sameness: z.array(z.string()),
    wedge: z.object({ claim: z.string(), evidence: z.string() }),
    // 하고 싶은 주장인데 뒷받침할 자료가 없는 것. 받아야 할 자료가 된다.
    proofGaps: z.array(z.object({ claim: z.string(), need: z.string() })),
    // 문의 직전의 망설임과 그것을 푸는 자리.
    objections: z.array(
      z.object({ doubt: z.string(), answerAt: z.string(), how: z.string() }),
    ),
  }),
  ux: z.object({
    entries: z.array(
      z.object({ from: z.string(), expects: z.string(), firstScreen: z.string() }),
    ),
    flows: z.array(
      z.object({ name: z.string(), steps: z.array(z.string()), friction: z.string() }),
    ),
    dropoffs: z.array(z.object({ where: z.string(), why: z.string(), fix: z.string() })),
    mobile: z.array(z.string()),
  }),
});

export async function stageReview(model, { brief, strategy, architecture }) {
  return model.generate({
    stage: '마케팅·UX 검토',
    role: ROLE,
    schema: ReviewSchema,
    task: `사이트맵까지 나왔습니다. 페이지를 짜기 전에 두 관점으로 검토하세요.

## 브랜드 마케터로서

sameness — 이 업종 사이트가 하나같이 쓰는 말을 3~5개 적으세요. "믿을 수
있는", "최고의 서비스", "고객 만족" 같은 것들입니다. 여기 걸리는 표현은
쓰나 마나이므로 이후 문구에서 뺍니다. 이 업종에서 실제로 흔한 말을 쓰세요.

wedge — 이 고객만 할 수 있는 말 하나. evidence 에 브리프의 어느 사실에서
나왔는지 적으세요. 브리프에 근거가 없으면 지어내지 말고, claim 을
"아직 못 정함"으로 두고 evidence 에 무엇을 확인해야 하는지 적으세요.

proofGaps — 하고 싶은 주장인데 뒷받침할 자료가 아직 없는 것. need 에
고객사에서 무엇을 받아야 하는지 적으세요.

objections — 방문자가 문의 버튼 앞에서 머뭇거리는 이유 3~5개. answerAt 에
사이트맵의 어느 페이지에서 풀지, how 에 어떻게 푸는지 적으세요. 없는
페이지를 지어내지 마세요.

## UI·UX 전문가로서

entries — 유입 경로별로 봅니다. 브리프의 현재 채널을 먼저 보세요. 그 경로로
온 사람이 무엇을 기대하는지(expects), 첫 화면이 무엇을 해내야 하는지
(firstScreen). 경로가 하나뿐이면 하나만 쓰세요. 있지도 않은 광고나 채널을
지어내지 마세요.

flows — 주요 흐름 2~3개. steps 는 실제 페이지 이름으로 이어 쓰세요.
friction 에 그 흐름에서 걸리는 지점 하나.

dropoffs — 방문자가 나가 버리는 지점 2~4개. where 는 페이지나 자리 이름,
why 는 나가는 이유, fix 는 구성으로 막는 방법.

mobile — 모바일에서 특히 다르게 봐야 할 것 2~4개. 화면이 좁아진다는
일반론 말고, 이 사이트의 이 내용에서 무엇이 문제가 되는지 쓰세요.

전체에서, 어느 업종에나 해당하는 말은 쓰지 마세요. 브리프와 사이트맵에
있는 사실에서만 끌어내세요.

--- 브리프 ---
${JSON.stringify(brief, null, 1)}

--- 전략 ---
${JSON.stringify(strategy, null, 1)}

--- 사이트맵 ---
${JSON.stringify(architecture, null, 1)}`,
  });
}

/* ── 5단계: 페이지별 섹션 구성 ────────────────────────────────── */

const PageSchema = z.object({
  sections: z.array(
    z.object({
      purpose: z.string(),
      blockId: z.string(),
      note: z.string(),
      copy: z.string(),
      needsCustomTone: z.boolean(),
    }),
  ),
});

export async function stagePage(model, { catalog, brief, strategy, review, page, blockMenu }) {
  return model.generate({
    stage: `페이지 구성 · ${page.title}`,
    role: ROLE,
    shared: blockMenu,
    schema: PageSchema,
    task: `"${page.title}" 페이지(${page.slug})의 섹션을 위에서 아래 순서로 구성하세요.

이 페이지의 목표: ${page.goal}
${page.summary}

이 페이지가 맡는 것:
${(page.covers ?? []).map((c) => `- ${c}`).join('\n') || '- (지정 없음)'}

이 페이지에 넣지 말 것 — 다른 페이지가 맡습니다. 링크나 버튼으로만 연결하세요:
${(page.avoid ?? []).map((c) => `- ${c}`).join('\n') || '- (없음)'}

규칙:
- 섹션은 5~10개. 헤더로 시작해 푸터로 끝냅니다. 넘기지 마세요.
- 같은 목적의 자리를 두 번 만들지 마세요.
- blockId 는 위 목록에 있는 것만. 식스샵 기본 기능으로 처리할 섹션은 빈 문자열.
- purpose 는 그 자리가 하는 일(예: "핵심 서비스 3종"). 블록 이름을 그대로 쓰지 마세요.
- note 는 그 블록을 고른 이유나 제작 시 주의점 한두 문장.
- copy 는 그 섹션에 들어갈 실제 문구 예시. 문구가 필요 없는 섹션은 빈 문자열.
  브리프에 없는 수치나 실적은 넣지 마세요.
  검토의 sameness 에 걸린 표현은 쓰지 마세요. 남들 다 하는 말이라 쓰나 마납니다.
- needsCustomTone 은 그 블록이 ${strategy.style} 계열이 아니라서 색·여백을
  맞추는 커스텀이 필요하면 true.

--- 브리프 ---
${JSON.stringify(brief, null, 1)}

--- 전략 ---
${JSON.stringify(strategy, null, 1)}
${review ? `
--- 마케팅·UX 검토 ---
이 페이지에서 풀어야 할 망설임, 이 페이지가 걸린 이탈 지점, 유입별 첫 화면
요구를 반영하세요. 다른 페이지 몫은 그 페이지에 맡기고 여기서는 다루지 않습니다.

${JSON.stringify(review, null, 1)}` : ''}`,
  });
}

/* ── 6단계: 기능과 유의점 ─────────────────────────────────────── */

// 한 번에 다 받으면 출력이 길어 100초를 넘긴다. 서버리스 함수가 버티는
// 시간을 넘기므로 둘로 나눈다. 앞은 제작 진행, 뒤는 기술 점검.
const AdvisorySchema = z.object({
  features: z.array(
    z.object({
      level: z.enum(['필수', '권장', '선택']),
      title: z.string(),
      detail: z.string(),
    }),
  ),
  production: z.array(
    z.object({
      mark: z.string(),
      title: z.string(),
      detail: z.string(),
    }),
  ),
  assetsToCollect: z.array(z.string()),
  budgetNote: z.string(),
});

const TechnicalSchema = z.object({
  technical: z.array(
    z.object({
      area: z.string(),
      items: z.array(z.string()),
    }),
  ),
});

export async function stageAdvisories(model, { brief, strategy, pages, blockMenu }) {
  const used = pages.flatMap((p) =>
    p.sections.map((s) => `${p.title}: ${s.purpose}${s.needsCustomTone ? ' (톤 커스텀 필요)' : ''}`),
  );

  return model.generate({
    stage: '기능과 유의점',
    role: ROLE,
    shared: blockMenu,
    schema: AdvisorySchema,
    task: `이 사이트에 필요한 기능과, 제작자가 미리 알아야 할 것을 정리하세요.

features 는 필요한 기능. level 로 필수·권장·선택을 나눕니다.

production 은 제작 진행상 주의할 점 4~6개. mark 는 두세 글자 표찰
(예: 전용, 부재, 톤, 규정, 유입). 이 업종과 이 구성에서만 나오는 이야기를
쓰세요. 일반론은 빼십시오.

assetsToCollect 는 고객사에서 받아야 할 자료 목록.
budgetNote 는 예산이 맞는지, 초과 요인이 무엇인지 두세 문장.

--- 브리프 ---
${JSON.stringify(brief, null, 1)}

--- 전략 ---
${JSON.stringify(strategy, null, 1)}

--- 배치한 섹션들 ---
${used.join('\n')}`,
  });
}

/* ── 7단계: 기술 검토 ─────────────────────────────────────────── */

export async function stageTechnical(model, { brief, strategy, pages, blockMenu }) {
  const custom = pages.flatMap((p) =>
    p.sections.filter((s) => s.needsCustomTone).map((s) => `${p.title}: ${s.purpose}`),
  );

  return model.generate({
    stage: '기술 검토',
    role: ROLE,
    shared: blockMenu,
    schema: TechnicalSchema,
    task: `디자인·개발 관점에서 점검할 항목을 정리하세요.

area 별로 묶고 items 에 구체적인 실행 항목을 적습니다. 반응형, 속도, 글꼴,
접근성, 검색 노출, 폼, 측정과 인계를 다루되 **이 사이트에 해당하는 내용**으로
적으세요. 어느 사이트에나 해당하는 일반론은 빼십시오.

블록을 조립해 만드는 사이트라는 점을 감안하세요. 블록마다 자체 스크립트를
불러오고, 스타일 계열이 없는 커뮤니티 블록은 모바일 대응이 보장되지 않습니다.

--- 브리프 ---
${JSON.stringify(brief, null, 1)}

--- 톤 계열 ---
${strategy.style}

--- 톤 커스텀이 필요한 자리 ---
${custom.length ? custom.join('\n') : '없음'}`,
  });
}

/* ── 검증 ─────────────────────────────────────────────────────── */

/**
 * 모델이 없는 blockId 를 쓰면 기획서 전체가 못 쓰게 된다.
 * 목록에 없는 것은 걸러내고 무엇이 걸렸는지 남긴다.
 */
export function validate(pages, catalog) {
  const problems = [];

  for (const page of pages) {
    page.sections = page.sections.filter((s) => {
      if (!s.blockId) return true; // 식스샵 기본 기능으로 처리하는 자리
      const block = catalog.byId.get(s.blockId);
      if (!block) {
        problems.push(`${page.title} / ${s.purpose}: 없는 블록 ${s.blockId}`);
        return false;
      }
      s.blockName = block.name;
      s.blockStyle = block.style;
      s.officialPartner = block.officialPartner;
      s.thumbnail = block.thumbnail;
      s.previewUrl = block.previewUrl;
      return true;
    });
  }

  return problems;
}

/* ── 전체 실행 ────────────────────────────────────────────────── */

export async function runPipeline({ model, catalog, briefText, onStage = () => {} }) {
  onStage('브리프 정리');
  const brief = await stageBrief(model, { briefText });

  onStage('전략과 톤');
  const strategy = await stageStrategy(model, { catalog, brief });

  onStage('사이트맵');
  const architecture = await stageArchitecture(model, { brief, strategy });

  // 톤을 정한 뒤로는 그 계열과 커뮤니티 블록만 보여준다. 목록이 짧을수록
  // 선택이 정확하고, 이 문자열이 이후 모든 호출의 캐시 구간이 된다.
  const blockMenu = renderBlockMenu(catalog, { style: strategy.style });

  onStage('마케팅·UX 검토');
  const review = await stageReview(model, { brief, strategy, architecture });

  onStage(`페이지 구성 (${architecture.pages.length}개 동시 진행)`);
  const pages = await Promise.all(
    architecture.pages.map(async (page) => ({
      ...page,
      ...(await stagePage(model, { catalog, brief, strategy, review, page, blockMenu })),
    })),
  );

  const problems = validate(pages, catalog);

  onStage('기능과 유의점');
  const advisories = await stageAdvisories(model, { brief, strategy, pages, blockMenu });

  onStage('기술 검토');
  const technical = await stageTechnical(model, { brief, strategy, pages, blockMenu });
  advisories.technical = technical.technical;

  return {
    generatedAt: new Date().toISOString(),
    brief,
    strategy,
    architecture,
    review,
    pages,
    advisories,
    problems,
    counts: {
      pages: pages.length,
      blocks: pages.reduce((n, p) => n + p.sections.filter((s) => s.blockId).length, 0),
      customTone: pages.reduce((n, p) => n + p.sections.filter((s) => s.needsCustomTone).length, 0),
    },
  };
}
