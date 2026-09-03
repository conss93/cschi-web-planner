/**
 * 기획 생성 파이프라인.
 *
 * 한 번에 다 시키지 않고 단계로 쪼갠다. 단계마다 스키마가 다르고, 앞 단계의
 * 결론이 뒤 단계의 입력이 된다. 페이지 구성은 페이지끼리 독립이라 동시에 돌린다.
 */

import { z } from 'zod';
import { renderBlockMenu, renderStyleTable } from './catalog.mjs';
import { summarize, workloadNote } from './counts.mjs';

/* ── 모든 단계가 공유하는 역할과 규칙 ──────────────────────────────
   매 호출 동일한 문자열이어야 프롬프트 캐시가 산다. 여기에 날짜나 요청별
   값을 섞지 말 것. */

const ROLE = `당신은 웹사이트 제작 외주를 맡은 기획자입니다.
식스샵 프로로 사이트를 만듭니다.

한 자리를 채우는 길은 셋입니다.

- **마켓플레이스 블록** — 주어진 목록에서 고릅니다. 가장 빠르고 결과가
  예측됩니다. 웬만하면 이쪽입니다.
- **AI 블록** — 식스샵의 AI 블록 생성 기능으로 새로 만듭니다. 원하는 구성을
  글로 적으면 블록과 설정 패널까지 만들어 줍니다. 마땅한 블록이 없거나,
  있는 블록을 억지로 전용해야 할 때 씁니다.
- **식스샵 기본 기능** — 게시판 운영, 폼 응답 저장처럼 화면이 아니라 기능
  자체가 필요한 자리.

반드시 지킬 것:

1. 마켓플레이스 블록을 쓸 때는 주어진 목록에 있는 것만 씁니다.
   blockId 를 지어내지 마세요.
2. 블록 설명글은 전부 쇼핑몰 기준으로 쓰여 있습니다. "상품"을 그 업종의
   서비스로, "컬렉션"을 서비스 분류로 바꿔 읽으세요. 이름이 안 맞는다고
   넘기면 쓸 수 있는 블록을 놓칩니다.
3. 억지로 전용하지 마세요. 인물 소개나 게시판 목록처럼 마켓플레이스에
   맞는 블록이 없는 자리는, 엉뚱한 블록을 끌어다 쓰는 대신 AI 블록으로
   만드는 편이 낫습니다. 다만 AI 블록은 매번 결과가 조금씩 달라 손이 더
   가므로, 마땅한 블록이 있으면 그것을 먼저 씁니다.
4. 게시판 글 목록을 실제로 운영하는 것은 화면이 아니라 기능입니다.
   식스샵 기본 게시판으로 처리한다고 적으세요.
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
/**
 * 아래 개수를 스키마에 넣을 때 **하한만** 넣는다.
 *
 * 모자란 것과 넘치는 것은 성격이 다르다. 모바일 항목이 빈 배열로 오면
 * 문서에서 그 묶음이 통째로 빠지므로 결과를 못 쓴다 — 그건 다시 받아야 한다.
 * 반대로 한 개 더 온 것은 못 쓸 결과가 아니라 그냥 긴 것이다. 그런데
 * 상한까지 스키마에 박아 두면 파싱이 실패해 **단계 전체가 죽는다.** 실제로
 * 모바일 항목이 5개 와서 검토 단계가 통째로 날아갔다. 부른 값은 이미 치른
 * 뒤였다. 그래서 상한은 CAPS 로 옮겨, 받은 뒤에 잘라 낸다.
 */
const ReviewSchema = z.object({
  market: z.object({
    // 남들 다 하는 말. 여기 걸리면 문구를 다시 쓴다.
    sameness: z.array(z.string()).min(3),
    wedge: z.object({ claim: z.string(), evidence: z.string() }),
    // 하고 싶은 주장인데 뒷받침할 자료가 없는 것. 받아야 할 자료가 된다.
    proofGaps: z.array(z.object({ claim: z.string(), need: z.string() })).min(2),
    // 문의 직전의 망설임과 그것을 푸는 자리.
    objections: z
      .array(z.object({ doubt: z.string(), answerAt: z.string(), how: z.string() }))
      .min(3),
  }),
  ux: z.object({
    entries: z
      .array(z.object({ from: z.string(), expects: z.string(), firstScreen: z.string() }))
      .min(1),
    flows: z
      .array(z.object({ name: z.string(), steps: z.array(z.string()), friction: z.string() }))
      .min(2),
    dropoffs: z
      .array(z.object({ where: z.string(), why: z.string(), fix: z.string() }))
      .min(2),
    mobile: z.array(z.string()).min(2),
  }),
});

/** 검토에서 자를 상한. 프롬프트에 적은 개수와 같아야 한다. */
const REVIEW_CAPS = {
  'market.sameness': 5,
  'market.proofGaps': 5,
  'market.objections': 5,
  'ux.entries': 4,
  'ux.flows': 3,
  'ux.dropoffs': 4,
  'ux.mobile': 4,
};

/**
 * 상한을 넘겨 온 목록을 잘라 낸다.
 *
 * 앞에서부터 남긴다. 모델은 중요한 것을 먼저 쓰므로 뒤가 덜 아깝다.
 */
export function capLists(obj, caps) {
  for (const [path, max] of Object.entries(caps)) {
    const keys = path.split('.');
    const last = keys.pop();
    const holder = keys.reduce((o, k) => o?.[k], obj);
    const list = holder?.[last];
    if (Array.isArray(list) && list.length > max) holder[last] = list.slice(0, max);
  }
  return obj;
}

export async function stageReview(model, { brief, strategy, architecture }) {
  const review = await model.generate({
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

## 네 목록에 같은 이야기를 나눠 담지 마세요

한 가지 사실(예: 드립커피 취급 여부)은 **가장 잘 맞는 목록 한 곳에만** 씁니다.

- 방문자가 망설이는 질문이면 → objections
- 우리가 하고 싶은 말인데 자료가 없으면 → proofGaps
- 화면 구성 때문에 나가 버리는 자리면 → dropoffs

같은 사실을 세 곳에 나눠 쓰면 읽는 사람에게는 같은 말 세 번입니다.
다른 목록에서 이미 다룬 것은 되풀이하지 말고, 정말 다른 각도일 때만
한 줄로 참조하세요.

## UI·UX 전문가로서

entries — 유입 경로별로 봅니다. 브리프의 현재 채널을 먼저 보세요. 그 경로로
온 사람이 무엇을 기대하는지(expects), 첫 화면이 무엇을 해내야 하는지
(firstScreen). 경로가 하나뿐이면 하나만 쓰세요. 있지도 않은 광고나 채널을
지어내지 마세요.

flows — 주요 흐름 2~3개. steps 는 실제 페이지 이름으로 이어 쓰세요.
friction 에 그 흐름에서 걸리는 지점 하나.

dropoffs — 방문자가 나가 버리는 지점 2~4개. where 는 페이지나 자리 이름,
why 는 나가는 이유, fix 는 구성으로 막는 방법.

mobile — 모바일에서 특히 다르게 봐야 할 것 2~4개. **반드시 채우세요.**
화면이 좁아진다는 일반론 말고, 이 사이트의 이 내용에서 무엇이 문제가
되는지 쓰세요. 주력 고객이 어떤 기기로 들어오는지부터 보세요.

전체에서, 어느 업종에나 해당하는 말은 쓰지 마세요. 브리프와 사이트맵에
있는 사실에서만 끌어내세요.

--- 브리프 ---
${JSON.stringify(brief, null, 1)}

--- 전략 ---
${JSON.stringify(strategy, null, 1)}

--- 사이트맵 ---
${JSON.stringify(architecture, null, 1)}`,
  });

  // 개수를 넘겨 왔다고 단계를 죽이지 않는다. 앞에서부터 남기고 자른다.
  return capLists(review, REVIEW_CAPS);
}

/* ── 5단계: 페이지별 섹션 구성 ────────────────────────────────── */

/** 한 자리를 무엇으로 채우는가. 셋 중 하나다. */
export const FILL = ['마켓플레이스 블록', 'AI 블록', '식스샵 기본 기능'];

const PageSchema = z.object({
  sections: z.array(
    z.object({
      purpose: z.string(),
      fill: z.enum(FILL),
      // 마켓플레이스 블록일 때만 채운다. 나머지는 빈 문자열.
      blockId: z.string(),
      note: z.string(),
      copy: z.string(),
      needsCustomTone: z.boolean(),
      // AI 블록으로 만들 자리의 배치 지시. 나머지 자리는 전부 빈 문자열이다.
      // 색·모서리·글자 크기는 여기 적지 않는다. 디자인 지침에 이미 있고,
      // 프롬프트를 조립할 때 코드가 그 값을 넣는다.
      ai: z.object({
        layout: z.string(),
        media: z.string(),
        mobile: z.string(),
        interaction: z.string(),
      }),
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
- 자리마다 fill 로 무엇으로 채울지 고릅니다.
  · "마켓플레이스 블록" — blockId 를 위 목록에서 고릅니다. 웬만하면 이쪽.
  · "AI 블록" — 맞는 블록이 없어 새로 만들 자리. blockId 는 빈 문자열.
    note 에 **무엇을 만들 것인지** 한두 문장으로 적고, ai 의 네 칸을 채우세요.
    이 값들이 그대로 식스샵 AI 블록 입력칸에 들어갑니다.
  · "식스샵 기본 기능" — 게시판 운영, 폼 응답 저장처럼 화면이 아니라 기능이
    필요한 자리. blockId 는 빈 문자열.
- AI 블록은 한 페이지에 2개를 넘기지 마세요. 매번 결과가 달라 손이 갑니다.
  맞는 블록이 있는데도 AI 블록을 고르면 공정만 늘어납니다.
- 섹션은 5~10개. 헤더로 시작해 푸터로 끝냅니다. 넘기지 마세요.
- **화면에 실제로 보이는 자리만** 씁니다. 촬영 목록이나 일정 메모 같은
  제작 관리용 항목은 섹션이 아닙니다. 그런 것은 note 에 적거나, 이 단계에서
  빼고 제작 유의점 단계에 맡기세요. 섹션 하나는 곧 조립할 블록 하나입니다.
- 같은 목적의 자리를 두 번 만들지 마세요.
- blockId 는 위 목록에 있는 것만. 식스샵 기본 기능으로 처리할 섹션은 빈 문자열.
- purpose 는 그 자리가 하는 일(예: "핵심 서비스 3종"). 블록 이름을 그대로 쓰지 마세요.
- note 는 그 블록을 고른 이유나 제작 시 주의점 한두 문장.
- copy 안에서 **대괄호는 버튼에만** 씁니다. [메뉴 보기] 처럼 누르는 자리만
  대괄호로 감쌉니다. 이 표기를 세어 조립할 때 링크를 걸 목록을 만듭니다.
  아직 안 정해진 값은 대괄호 말고 소괄호로 (확인 필요) 라고 쓰거나 ○○ 로
  비워 두세요. [확인 필요] 나 [메뉴명 1] 처럼 쓰면 그것이 버튼으로 세어집니다.
  "버튼:" 이라고 적어 두는 것으로는 세어지지 않습니다. 대괄호로 감싸세요.
- copy 는 그 섹션에 들어갈 실제 문구 예시. 문구가 필요 없는 섹션은 빈 문자열.
  브리프에 없는 수치나 실적은 넣지 마세요.
  검토의 sameness 에 걸린 표현은 쓰지 마세요. 남들 다 하는 말이라 쓰나 마납니다.
- ai 는 **AI 블록 자리에만** 채웁니다. 나머지 자리는 네 칸 모두 빈 문자열.
  · layout — 화면에서 무엇이 어디에 놓이는지. 좌우 비율이나 열 수까지.
    (예: "왼쪽 사진 40%, 오른쪽 이름·직함·소개 60%. 인물 3명을 세로로 반복")
  · media — 필요한 그림과 비율. 없으면 빈 문자열.
    (예: "인물 사진 3장, 3:4 세로") 픽셀 수는 모르니 쓰지 마세요.
  · mobile — 모바일에서 어떻게 접히는지. (예: "사진 위, 글 아래 한 줄로")
  · interaction — 링크·버튼이 하는 일과 움직임. 움직임은 없으면 없다고 씁니다.
    (예: "카드를 누르면 상세로. 나타나는 효과는 넣지 않음")
  색·글꼴·모서리 값은 ai 에 적지 마세요. 디자인 지침이 따로 정하고,
  프롬프트를 만들 때 그 값이 자동으로 들어갑니다. 여기 또 적으면 어긋납니다.
- needsCustomTone 은 그 자리가 ${strategy.style} 계열과 색·여백을 맞추는
  손질이 필요하면 true. 계열 밖 마켓플레이스 블록이 그렇고, AI 블록도
  디자인 지침을 물려도 한 번은 맞춰 봐야 하므로 대개 true 입니다.

--- 브리프 ---
${JSON.stringify(brief, null, 1)}

--- 전략 ---
${JSON.stringify(strategy, null, 1)}
${review ? `
--- 마케팅·UX 검토 ---
이 페이지에서 풀어야 할 망설임, 이 페이지가 걸린 이탈 지점, 유입별 첫 화면
요구를 반영하세요. 다른 페이지 몫은 그 페이지에 맡기고 여기서는 다루지 않습니다.

검토가 **자리의 앞뒤 순서를 지정했으면 그대로 따르세요.** "A 를 B 보다 위에",
"C 를 지도 바로 다음에" 같은 지시가 flows 와 dropoffs 에 들어 있습니다.
그 순서를 지키려고 검토를 먼저 돌린 것이므로, 어길 거면 note 에 이유를
적으세요.

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

  // 작업량은 우리가 세어 문장으로 건넨다. 모델에게 세게 하면 본문과 어긋난다.
  // 실제로 톤 커스텀 8종인데 "개별 조정 비용이 들지 않는다"고 쓴 적이 있다.
  const workload = workloadNote(summarize({ pages }));

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

budgetNote 는 예산이 맞는지, 초과 요인이 무엇인지 두세 문장. 아래 작업량은
이미 세어 둔 사실이니 **그대로 전제로 삼으세요.** 숫자를 다시 세지 말고,
숫자와 어긋나는 말도 쓰지 마세요. 특히 색·여백을 손봐야 하는 자리가 있는데
"개별 조정 비용이 들지 않는다"고 쓰면 문서 안에서 앞뒤가 맞지 않습니다.

--- 이 구성의 작업량 (이미 센 값) ---
${workload}

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
      // fill 이 없는 것은 이 기능이 생기기 전에 만든 기획서다. blockId 로 읽는다.
      s.fill ??= s.blockId ? '마켓플레이스 블록' : '식스샵 기본 기능';

      // 배치 지시는 AI 블록 자리에만 있다. 다른 자리에 남아 있으면 프롬프트가
      // 아닌 곳에 쓰일 일이 없는데도 문서에 새어 나온다.
      if (s.fill !== 'AI 블록') delete s.ai;

      if (s.fill !== '마켓플레이스 블록') {
        // 블록을 안 쓰는 자리에 blockId 가 남아 있으면 집계가 틀어진다.
        s.blockId = '';
        s.blockName = null;
        s.blockStyle = null;
        s.officialPartner = false;
        s.thumbnail = null;
        s.previewUrl = null;
        return true;
      }

      const block = s.blockId ? catalog.byId.get(s.blockId) : null;
      if (!block) {
        // 마켓플레이스 블록이라 해 놓고 없는 것을 골랐다. 자리를 지우면 그
        // 자리에 필요했던 내용까지 사라지므로, AI 블록으로 돌려 살려 둔다.
        problems.push(
          `${page.title} / ${s.purpose}: 없는 블록 ${s.blockId || '(비어 있음)'} — AI 블록으로 돌림`,
        );
        s.fill = 'AI 블록';
        s.blockId = '';
        s.blockName = null;
        s.blockStyle = null;
        s.officialPartner = false;
        s.thumbnail = null;
        s.previewUrl = null;
        s.needsCustomTone = true;
        return true;
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

/* ── 8단계: 디자인 지침 ───────────────────────────────────────── */

/**
 * 식스샵 "디자인 지침" 에 그대로 붙여넣는 문서를 만든다.
 *
 * AI 블록 생성에 이것을 물리면 블록마다 제각각 나오지 않는다. 값은 고정
 * 키로 받는다. 자유롭게 이름을 짓게 두면 문서마다 구조가 달라져 붙여넣을
 * 수 없다.
 *
 * 색 대비는 코드가 잰다(src/guideline.mjs). 모델에게 "읽히게 하라" 고
 * 말해 두되, 실제로 읽히는지는 숫자로 확인한다.
 */
const HEX = z.string().regex(/^#[0-9a-fA-F]{6}$/, '#rrggbb 형식이어야 합니다');

const GuidelineSchema = z.object({
  // 식스샵 지침 목록에 뜰 이름. 짧은 영문 슬러그.
  name: z.string(),
  description: z.string(),
  mood: z.array(z.string()).min(3),

  colors: z.object({
    primary: HEX,
    primaryHover: HEX,
    ink: HEX,
    inkMuted: HEX,
    hairline: HEX,
    canvas: HEX,
    surface: HEX,
    onPrimary: HEX,
  }),

  typography: z.object({
    bodyFont: z.string(),
    headingFont: z.string(),
    // 본문 크기는 목록이 아니라 값이라 잘라 낼 수 없다. 벗어나면 코드가
    // 가까운 쪽으로 당긴다. 40px 본문 하나 때문에 단계를 죽일 이유가 없다.
    bodySize: z.number(),
    bodyWeight: z.number(),
    bodyLineHeight: z.number(),
    bodyLetterSpacing: z.string(),
    scale: z
      .array(z.object({ role: z.string(), size: z.number(), weight: z.number() }))
      .min(3),
    weights: z.array(z.number()).min(2),
  }),

  rounded: z.object({ sm: z.number(), md: z.number(), lg: z.number(), pill: z.number() }),
  spacing: z.object({
    xs: z.number(), sm: z.number(), md: z.number(),
    lg: z.number(), xl: z.number(), section: z.number(),
  }),

  components: z.array(z.object({ name: z.string(), spec: z.string() })).min(4),
  dos: z.array(z.string()).min(4),
  donts: z.array(z.string()).min(5),
});

/** 지침에서 자를 상한. 프롬프트에 적은 개수와 같아야 한다. */
const GUIDELINE_CAPS = {
  mood: 5,
  'typography.scale': 5,
  'typography.weights': 4,
  components: 7,
  dos: 6,
  donts: 8,
};

/** 본문 글자 크기의 상하한. 이 밖으로 나오면 당긴다. */
const BODY_SIZE = { min: 14, max: 20 };

export async function stageGuideline(model, { brief, strategy, review }) {
  const guideline = await model.generate({
    stage: '디자인 지침',
    role: ROLE,
    schema: GuidelineSchema,
    task: `식스샵 AI 블록에 물릴 디자인 지침을 만드세요.

이 문서는 AI 블록을 만들 때마다 참조됩니다. 여기 적힌 값 밖으로 나가지
않게 하는 것이 목적입니다.

## 이 문서에서 가장 중요한 것은 donts 입니다

생성형 도구가 만든 화면에서 "AI 가 만든 티" 가 나는 이유는 절제가 없어서
입니다. 그라디언트를 넣고, 그림자를 겹치고, 굵기를 다섯 단계 쓰고, 색을
여섯 개 씁니다. 무엇을 하지 말지가 적혀 있어야 그게 멈춥니다.

donts 는 5~8개. 각 줄에 **무엇을 하지 말지와 왜 그런지**를 함께 쓰세요.
"그라디언트를 쓰지 않는다 — 배경은 단색이고 분위기는 사진이 만든다" 처럼요.
이 사이트의 톤에서 실제로 어긋나는 것을 고르세요. 일반론은 빼십시오.

dos 는 4~6개. 반드시 지켜야 눈에 띄게 달라지는 것만 쓰세요.

## 색

강조색(primary)은 **하나**입니다. 누를 수 있는 것은 전부 이 색이고, 그
밖의 것에는 쓰지 않습니다. primaryHover 는 그 색의 약간 짙거나 옅은 변형
이지 다른 색이 아닙니다.

읽을 수 있어야 합니다. 본문 글자(ink)와 바탕(canvas)의 명도 차이가 충분히
나야 하고, 강조색 위에 얹는 글자(onPrimary)도 마찬가지입니다. 옅은 회색
글자를 흰 바탕에 놓는 조합이 가장 흔한 실수입니다.

## 글자

한글 사이트입니다. 실제로 한글이 지원되는 글꼴을 고르세요. 확실하지 않으면
프리텐다드나 노토 산스 KR 처럼 널리 쓰이는 것을 씁니다.

weights 는 이 사이트에서 쓸 굵기 전부입니다. 2~4개로 제한하세요. 굵기가
많을수록 어수선해집니다. 그 사이 값은 쓰지 않는다고 donts 에 적으세요.

bodyLetterSpacing 은 "-0.01em" 이나 "0" 처럼 단위를 붙인 문자열입니다.

## 모서리와 간격

각각 정해진 단계만 씁니다. 그 사이의 임의 숫자를 쓰지 않는 것이 통일감의
대부분입니다. pill 은 9999 로 두세요.

## 구성 요소

components 는 4~7개. 이 사이트에 실제로 있는 것만 쓰세요(예: 주 버튼,
보조 버튼, 카드, 입력칸, 상단 내비). spec 에는 배경색·글자색·모서리·여백을
위에서 정한 값으로 적습니다.

## 톤의 근거

브리프의 톤 단어와 피할 인상, 전략의 포지셔닝에서 끌어내세요. 업종과
주력 고객이 다르면 지침도 달라야 합니다. 어느 사이트에나 맞는 지침은
아무 일도 하지 않습니다.

--- 브리프 ---
${JSON.stringify(brief, null, 1)}

--- 전략 ---
${JSON.stringify(strategy, null, 1)}
${review ? `
--- 마케팅·UX 검토 ---
${JSON.stringify(review, null, 1)}` : ''}`,
  });

  capLists(guideline, GUIDELINE_CAPS);
  const size = guideline.typography?.bodySize;
  if (typeof size === 'number') {
    guideline.typography.bodySize = Math.min(BODY_SIZE.max, Math.max(BODY_SIZE.min, size));
  }
  return guideline;
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

  onStage('디자인 지침');
  const guideline = await stageGuideline(model, { brief, strategy, review });

  return {
    generatedAt: new Date().toISOString(),
    brief,
    strategy,
    architecture,
    review,
    pages,
    advisories,
    guideline,
    problems,
    // 세는 일은 counts.mjs 한 곳에서 한다. 여기서 따로 세면 웹 화면과
    // 어긋난 숫자가 나온다.
    counts: summarize({ pages }),
  };
}
