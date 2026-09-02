/**
 * 기획 결과(JSON)를 읽기 좋은 HTML 한 장으로 만든다.
 * 고객에게 그대로 보내거나 인쇄해 쓸 수 있는 형태.
 */

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** 섹션의 성격을 보고 미니 와이어프레임 모양을 고른다. */
function shape(section) {
  const t = `${section.purpose} ${section.blockName ?? ''}`;
  if (/헤더|네비|메뉴|띠배너|공지/.test(t)) return 'bar';
  if (/푸터|하단/.test(t)) return 'foot';
  if (/지도|오시는|위치/.test(t)) return 'map';
  if (/폼|문의|상담 신청|접수/.test(t)) return 'form';
  if (/배너|첫 화면|히어로|메인/.test(t)) return 'hero';
  if (/카드|서비스|특징|3종|프로필|소개/.test(t)) return 'cards';
  if (/숫자|실적|통계|성과/.test(t)) return 'stats';
  if (/이미지\+텍스트|좌우|나란히|비교/.test(t)) return 'split';
  return 'list';
}

const WF_PARTS = { bar: 1, foot: 2, map: 1, form: 3, hero: 2, cards: 3, stats: 3, split: 2, list: 3 };

const wireframe = (section) => {
  const s = shape(section);
  return `<span class="wf" data-shape="${s}" aria-hidden="true">${'<i></i>'.repeat(WF_PARTS[s])}</span>`;
};

function chip(section) {
  if (!section.blockId) return '<span class="chip basic"><span class="dot"></span>식스샵 기본 기능</span>';
  const cls = section.blockStyle ? 'chip' : 'chip community';
  const star = section.officialPartner ? ' ★' : '';
  return `<span class="${cls}"><span class="dot"></span>${esc(section.blockName)}${star}</span>`;
}

const sectionRow = (section, i) => `
  <li>
    <span class="ord">${String(i + 1).padStart(2, '0')}</span>
    ${wireframe(section)}
    <div>
      <p class="slot-title">${esc(section.purpose)} ${chip(section)}${
        section.needsCustomTone ? '<span class="warn">톤 커스텀</span>' : ''
      }</p>
      ${section.note ? `<p class="slot-note">${esc(section.note)}</p>` : ''}
      ${section.copy ? `<p class="slot-copy">${esc(section.copy).replace(/\n/g, '<br>')}</p>` : ''}
    </div>
  </li>`;

const pageBlock = (page) => `
  <div class="page-head">
    <h3>${esc(page.title)}</h3>
    <span class="path">${esc(page.slug)}</span>
    <span class="goal">${esc(page.goal)}</span>
  </div>
  <ol class="strip">${page.sections.map(sectionRow).join('')}</ol>`;

/** 모든 페이지에 같은 모습으로 들어가는 자리. 한 번만 보여주고 한 번만 센다. */
const globalsBlock = (globals) =>
  !globals?.length
    ? ''
    : `<div class="page-head">
    <h3>전 페이지 공통</h3>
    <span class="path">모든 페이지</span>
    <span class="goal">한 번 만들어 모든 페이지에 씁니다</span>
  </div>
  <ol class="strip">${globals.map(sectionRow).join('')}</ol>`;

/**
 * @param {object} plan
 * @param {object} [opts]
 * @param {boolean} [opts.standalone] 한 장짜리 파일로 쓸 때는 true.
 *   웹 화면 안에 끼워 넣을 때는 false 로 두어 문서 제목을 중복시키지 않는다.
 */
export function renderPlan(plan, { standalone = true } = {}) {
  const { brief, strategy, architecture, pages, advisories, counts } = plan;

  return `${standalone ? `<title>${esc(brief.companyName)} 웹사이트 기획서</title>\n` : ''}<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@500;700&family=IBM+Plex+Sans+KR:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{--paper:#F4F6F8;--surface:#FFF;--surface-2:#EDF1F4;--ink:#14202C;--muted:#5B6B7C;--faint:#8494A3;
--rule:#D7DEE5;--rule-soft:#E6EBEF;--seal:#9B2C22;--seal-bg:#F6E9E6;--slate:#35566E;--slate-bg:#E4ECF2;
--serif:"Noto Serif KR",serif;--sans:"IBM Plex Sans KR","Apple SD Gothic Neo",system-ui,sans-serif;
--mono:"IBM Plex Mono",ui-monospace,monospace;color-scheme:light}
@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){--paper:#11171D;--surface:#171F27;
--surface-2:#1E2831;--ink:#E7ECF1;--muted:#97A6B4;--faint:#6F7F8E;--rule:#2A353F;--rule-soft:#212B34;
--seal:#E2857A;--seal-bg:#33211F;--slate:#8FB2CB;--slate-bg:#1D2A34;color-scheme:dark}}
:root[data-theme="dark"]{--paper:#11171D;--surface:#171F27;--surface-2:#1E2831;--ink:#E7ECF1;--muted:#97A6B4;
--faint:#6F7F8E;--rule:#2A353F;--rule-soft:#212B34;--seal:#E2857A;--seal-bg:#33211F;--slate:#8FB2CB;
--slate-bg:#1D2A34;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);font-size:15px;line-height:1.75}
.wrap{max-width:1060px;margin:0 auto;padding:0 24px 96px}
.masthead{border-bottom:2px solid var(--ink);padding:56px 0 20px}
.eyebrow{font-family:var(--mono);font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin:0 0 18px}
h1{font-family:var(--serif);font-weight:700;font-size:clamp(28px,4.4vw,44px);line-height:1.22;letter-spacing:-.02em;text-wrap:balance;margin:0 0 14px}
.standfirst{font-size:16.5px;color:var(--muted);max-width:62ch;margin:0}
.factbar{display:flex;flex-wrap:wrap;border:1px solid var(--rule);border-radius:3px;background:var(--surface);margin-top:28px;overflow:hidden}
.fact{flex:1 1 140px;padding:13px 18px;border-right:1px solid var(--rule-soft)}
.fact:last-child{border-right:0}
.fact dt{font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--faint);margin:0 0 3px}
.fact dd{margin:0;font-size:14.5px;font-weight:500;font-variant-numeric:tabular-nums}
section{padding-top:46px}
h2{font-family:var(--serif);font-weight:700;font-size:25px;letter-spacing:-.015em;margin:0 0 6px;padding-bottom:12px;
border-bottom:1px solid var(--rule);display:flex;align-items:baseline;gap:12px}
h2 .num{font-family:var(--mono);font-size:13px;font-weight:500;color:var(--seal)}
h3{font-weight:600;font-size:16px;margin:30px 0 10px}
p{margin:0 0 14px;max-width:66ch}
.lead{color:var(--muted)}
table{width:100%;border-collapse:collapse;font-size:14px}
.scroller{overflow-x:auto;margin-top:14px}
th,td{text-align:left;padding:9px 14px 9px 0;border-bottom:1px solid var(--rule-soft);vertical-align:top}
th{font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--faint);
font-weight:500;border-bottom-color:var(--rule);white-space:nowrap}
.chip{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:500;padding:2px 9px;border-radius:2px;
background:var(--slate-bg);color:var(--slate);white-space:nowrap}
.chip.community{background:var(--surface-2);color:var(--muted)}
.chip.basic{background:var(--seal-bg);color:var(--seal)}
.chip .dot{width:5px;height:5px;border-radius:50%;background:currentColor;flex:none}
.warn{font-family:var(--mono);font-size:10px;letter-spacing:.06em;color:var(--seal);border:1px solid var(--seal);
border-radius:2px;padding:1px 5px}
.wf{width:46px;height:30px;border:1px solid var(--rule);border-radius:2px;background:var(--surface-2);display:flex;
flex:none;padding:3px;gap:2px;overflow:hidden}
.wf i{background:var(--rule);border-radius:1px;display:block}
.wf[data-shape="bar"]{padding:11px 4px}.wf[data-shape="bar"] i{flex:1;height:100%}
.wf[data-shape="hero"]{flex-direction:column;justify-content:center;align-items:center;gap:3px}
.wf[data-shape="hero"] i:nth-child(1){width:60%;height:5px;background:var(--slate)}
.wf[data-shape="hero"] i:nth-child(2){width:40%;height:3px}
.wf[data-shape="cards"] i{flex:1;height:100%}
.wf[data-shape="stats"]{align-items:center}.wf[data-shape="stats"] i{flex:1;height:11px}
.wf[data-shape="split"] i:nth-child(1){flex:1.1;height:100%}
.wf[data-shape="split"] i:nth-child(2){flex:1;height:100%;background:var(--rule-soft)}
.wf[data-shape="list"]{flex-direction:column;justify-content:center;gap:3px}
.wf[data-shape="list"] i{width:100%;height:4px}
.wf[data-shape="form"]{flex-direction:column;gap:3px}
.wf[data-shape="form"] i{width:100%;height:6px}
.wf[data-shape="form"] i:nth-child(3){width:42%;background:var(--slate)}
.wf[data-shape="map"]{padding:0}
.wf[data-shape="map"] i{flex:1;height:100%;background:repeating-linear-gradient(45deg,var(--rule) 0 3px,transparent 3px 7px)}
.wf[data-shape="foot"]{flex-direction:column;justify-content:flex-end;gap:3px}
.wf[data-shape="foot"] i:nth-child(1){width:100%;height:9px}
.wf[data-shape="foot"] i:nth-child(2){width:55%;height:3px}
.page-head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-top:34px;padding-bottom:9px;border-bottom:1px solid var(--rule)}
.page-head h3{margin:0;font-size:17px}
.page-head .path{font-family:var(--mono);font-size:12px;color:var(--faint)}
.page-head .goal{margin-left:auto;font-size:13px;color:var(--muted)}
ol.strip{list-style:none;margin:0;padding:0}
ol.strip>li{display:grid;grid-template-columns:26px 46px minmax(0,1fr);gap:14px;align-items:start;padding:13px 0;
border-bottom:1px solid var(--rule-soft)}
.ord{font-family:var(--mono);font-size:12px;color:var(--faint);padding-top:6px;font-variant-numeric:tabular-nums}
.slot-title{font-weight:600;font-size:14.5px;margin:0 0 4px;display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.slot-note{margin:0;font-size:13.5px;color:var(--muted);max-width:62ch}
.slot-copy{margin:6px 0 0;font-size:13.5px;font-family:var(--serif);padding-left:12px;border-left:2px solid var(--rule);max-width:58ch}
.flag{display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;padding:14px 16px;background:var(--seal-bg);
border-left:3px solid var(--seal);border-radius:0 3px 3px 0;margin-bottom:12px}
.flag .mark{font-family:var(--mono);font-size:10.5px;letter-spacing:.08em;color:var(--seal);font-weight:500;
padding-top:3px;white-space:nowrap}
.flag p{margin:0;font-size:14px;max-width:none}
.flag strong{display:block;margin-bottom:4px}
ul.plain{margin:0 0 14px;padding-left:19px;max-width:66ch}
ul.plain li{margin-bottom:6px}
ul.plain li::marker{color:var(--faint)}
.checklist{list-style:none;margin:0;padding:0}
.checklist li{display:grid;grid-template-columns:auto minmax(0,1fr);gap:11px;padding:10px 0;
border-bottom:1px solid var(--rule-soft);font-size:14px}
.tag{font-family:var(--mono);font-size:10px;letter-spacing:.08em;padding:2px 7px;border-radius:2px;
background:var(--surface-2);color:var(--muted);height:fit-content;margin-top:2px;white-space:nowrap}
.tag.must{background:var(--seal-bg);color:var(--seal)}
.sitemap>ul{list-style:none;margin:16px 0 0;padding:0}
.sitemap>ul>li{display:grid;grid-template-columns:118px minmax(0,1fr);gap:16px;padding:11px 0;
border-bottom:1px solid var(--rule-soft);align-items:baseline}
.slug{font-family:var(--mono);font-size:12.5px;color:var(--slate)}
.label{font-weight:600;font-size:14.5px}
.sub{margin:3px 0 0;font-size:13px;color:var(--muted)}
.card{background:var(--surface);border:1px solid var(--rule);border-radius:3px;padding:18px 20px}
.grid2{display:grid;gap:14px;grid-template-columns:1fr}
@media(min-width:720px){.grid2{grid-template-columns:1fr 1fr}}
footer.colophon{margin-top:64px;padding-top:18px;border-top:2px solid var(--ink);font-size:13px;color:var(--muted);
display:flex;flex-wrap:wrap;gap:8px 24px}
.mono{font-family:var(--mono);font-size:12px;color:var(--faint)}
</style>

<div class="wrap">
<header class="masthead">
  <p class="eyebrow">웹사이트 제작 기획서 · 초안</p>
  <h1>${esc(brief.companyName)} 웹사이트 기획서</h1>
  <p class="standfirst">${esc(strategy.positioning)}</p>
  <dl class="factbar">
    <div class="fact"><dt>페이지</dt><dd>${counts.pages}</dd></div>
    <div class="fact"><dt>블록 종류</dt><dd>${counts.blocks}종</dd></div>
    <div class="fact"><dt>배치 횟수</dt><dd>${counts.placements ?? counts.blocks}회</dd></div>
    <div class="fact"><dt>디자인 톤</dt><dd>${esc(strategy.style)} 계열</dd></div>
    <div class="fact"><dt>톤 커스텀</dt><dd>${counts.customTone}종</dd></div>
    <div class="fact"><dt>예산</dt><dd>${esc(brief.budget)}</dd></div>
  </dl>
</header>

<section>
  <h2><span class="num">01</span>브리프</h2>
  <div class="scroller"><table><tbody>
    <tr><th>업종</th><td>${esc(brief.industry)}</td></tr>
    <tr><th>지역</th><td>${esc(brief.region)}</td></tr>
    <tr><th>규모</th><td>${esc(brief.scale)}</td></tr>
    <tr><th>현재 채널</th><td>${esc(brief.existingChannels)}</td></tr>
    <tr><th>목적</th><td>${esc(brief.primaryGoal)}</td></tr>
    <tr><th>주력 고객</th><td>${esc(brief.targetCustomer)}</td></tr>
    <tr><th>톤</th><td>${esc(brief.toneWords.join(', '))} / 피할 것: ${esc(brief.avoidTone)}</td></tr>
    <tr><th>오픈 희망</th><td>${esc(brief.deadline)}</td></tr>
    <tr><th>광고 규정</th><td>${esc(brief.regulated)}</td></tr>
  </tbody></table></div>

  ${
    brief.assumptions.length
      ? `<h3>메모에서 추정한 것</h3><ul class="plain">${brief.assumptions
          .map((a) => `<li><strong>${esc(a.field)}</strong> — ${esc(a.value)} <span class="mono">(${esc(a.basis)})</span></li>`)
          .join('')}</ul>`
      : ''
  }

  <h3>계약 전에 확인해야 할 것</h3>
  <ul class="plain">${brief.openQuestions
    .map((q) => `<li><strong>${esc(q.question)}</strong> — ${esc(q.why)}</li>`)
    .join('')}</ul>
</section>

<section>
  <h2><span class="num">02</span>전략</h2>
  <div class="grid2">
    <div class="card"><h3 style="margin-top:0">단일 목표</h3><p class="slot-note">${esc(strategy.singleGoal)}</p></div>
    <div class="card"><h3 style="margin-top:0">주력 고객</h3><p class="slot-note">${esc(strategy.audience)}</p></div>
  </div>
  <h3>신뢰의 재료</h3>
  <ul class="plain">${strategy.trustMaterials
    .map((t) => `<li><strong>${esc(t.title)}</strong> — ${esc(t.detail)}</li>`)
    .join('')}</ul>
  <h3>디자인 톤: ${esc(strategy.style)} 계열</h3>
  <p>${esc(strategy.styleRationale)}</p>
  <p class="lead">${esc(strategy.styleRunnerUp)}</p>
</section>

<section>
  <h2><span class="num">03</span>사이트맵</h2>
  <div class="sitemap"><ul>${architecture.pages
    .map(
      (p) => `<li><span class="slug">${esc(p.slug)}</span><div><span class="label">${esc(p.title)}</span>
      <p class="sub">${esc(p.summary)}</p></div></li>`,
    )
    .join('')}</ul></div>
  <h3>메뉴 구조</h3>
  <p class="lead">${esc(architecture.menu.join(' · '))}</p>
  <p class="lead">${esc(architecture.menuNote)}</p>
</section>

<section>
  <h2><span class="num">04</span>페이지 구성</h2>
  <p class="lead">각 줄이 하나의 블록입니다. ★는 식스샵 공식 파트너 블록,
  회색 칩은 스타일 계열이 없는 커뮤니티 블록입니다.</p>
  ${globalsBlock(plan.globals)}
  ${pages.map(pageBlock).join('')}
</section>

<section>
  <h2><span class="num">05</span>기능</h2>
  <ul class="checklist">${advisories.features
    .map(
      (f) => `<li><span class="tag${f.level === '필수' ? ' must' : ''}">${esc(f.level)}</span>
      <div><strong>${esc(f.title)}</strong> — ${esc(f.detail)}</div></li>`,
    )
    .join('')}</ul>
</section>

<section>
  <h2><span class="num">06</span>제작 유의점</h2>
  ${advisories.production
    .map(
      (c) => `<div class="flag"><span class="mark">${esc(c.mark)}</span>
    <p><strong>${esc(c.title)}</strong>${esc(c.detail)}</p></div>`,
    )
    .join('')}
  <h3>고객사에서 받아야 할 자료</h3>
  <ul class="plain">${advisories.assetsToCollect.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
  <h3>예산 검토</h3>
  <p>${esc(advisories.budgetNote)}</p>
</section>

<section>
  <h2><span class="num">07</span>기술 검토</h2>
  ${advisories.technical
    .map(
      (t) => `<h3>${esc(t.area)}</h3><ul class="plain">${t.items
        .map((i) => `<li>${esc(i)}</li>`)
        .join('')}</ul>`,
    )
    .join('')}
</section>

<footer class="colophon">
  <span>${esc(brief.companyName)} 웹사이트 기획서 · 초안</span>
  <span class="mono">식스샵 프로 마켓플레이스 블록 기준</span>
  <span class="mono">지정 블록 ${counts.blocks} · 커스텀 ${counts.customTone}</span>
</footer>
</div>`;
}
