'use client';

/**
 * 디자인 지침 화면.
 *
 * 식스샵 프로 → 블록 추가 → AI 블록 생성 → 스타일 참조 → 디자인 지침 추가
 * 에 붙여넣는 문서다. 그래서 이 화면에서 제일 중요한 버튼은 "전체 복사" 다.
 *
 * 색은 값만 적어 두면 어떤 색인지 알 수 없으므로 실제로 칠해 보여준다.
 * 대비가 모자란 조합은 코드가 재서 위에 띄운다.
 */

import { useEffect, useState, use } from 'react';

function Copy({ text, label = '복사' }) {
  const [done, setDone] = useState(false);
  if (!text) return null;
  return (
    <button
      type="button"
      className="icon copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        } catch {
          // 브라우저가 막아 둔 경우. 글은 화면에 있으니 직접 긁으면 된다.
        }
      }}
    >
      {done ? '복사함' : label}
    </button>
  );
}

const ROLE = {
  primary: '누를 수 있는 것',
  primaryHover: '마우스를 올렸을 때',
  ink: '본문 글자',
  inkMuted: '보조 설명',
  hairline: '경계선',
  canvas: '바탕',
  surface: '한 겹 올라온 면',
  onPrimary: '강조색 위 글자',
};

export default function GuidelinePage({ params }) {
  const { id } = use(params);
  const [body, setBody] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/plans/${id}/guideline`)
      .then(async (r) => {
        const json = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(json.error ?? '디자인 지침을 찾지 못했습니다.');
        return json;
      })
      .then(setBody)
      .catch((err) => setError(err.message));
  }, [id]);

  if (error) {
    return (
      <div className="shell">
        <header className="topbar">
          <h1>디자인 지침</h1>
          <nav><a className="btn ghost" href={`/plans/${id}`}>기획서로</a></nav>
        </header>
        <p className="notice">{error}</p>
      </div>
    );
  }

  if (!body) return <div className="shell"><p style={{ paddingTop: 40 }}>불러오는 중…</p></div>;

  const { guideline: g, company, contrastProblems, markdown, theme, themeText } = body;
  const t = g.typography;

  return (
    <div className="shell">
      <header className="topbar">
        <h1>{company || '기획서'} · 디자인 지침</h1>
        <nav>
          <a className="btn ghost" href={`/plans/${id}`}>기획서로</a>
          <a className="btn ghost" href={`/plans/${id}/pack`}>콘텐츠 팩</a>
          <a className="btn ghost" href={`/api/plans/${id}/guideline?format=md`}>MD 내려받기</a>
          <Copy text={markdown} label="전체 복사" />
        </nav>
      </header>

      <p className="notice">
        식스샵 프로에서 <strong>블록 추가 → AI 블록 생성 → 스타일 참조 → 디자인 지침 추가</strong>
        를 열고, 이름에 <code>{g.name}</code> 을 넣고 <strong>전체 복사</strong>한 내용을 붙여넣으세요.
        그 뒤로 만드는 AI 블록이 이 기준을 따릅니다.
      </p>

      {contrastProblems.length > 0 && (
        <div className="notice warnbox">
          <strong>읽기 어려운 색 조합 {contrastProblems.length}건</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {contrastProblems.map((p) => <li key={p}>{p}</li>)}
          </ul>
          <p style={{ margin: '12px 0 0' }}>
            숫자로 잰 값입니다. 쓰기 전에 색을 고치세요. 우리가 임의로 바꾸지는 않습니다.
          </p>
        </div>
      )}

      <section className="pack-section">
        <h2>{g.name}</h2>
        <p style={{ maxWidth: '66ch', color: 'var(--muted)' }}>{g.description}</p>
        <p style={{ color: 'var(--faint)', fontSize: 14 }}>{g.mood.join(' · ')}</p>
      </section>

      {theme && (
        <section className="pack-section">
          <div className="page-bar">
            <h2 style={{ margin: 0 }}>식스샵 테마 설정에 넣을 값</h2>
            <Copy text={themeText} label="전체 복사" />
          </div>
          <p style={{ color: 'var(--muted)', maxWidth: '64ch' }}>
            아래 지침과 <strong>같은 값</strong>을 설정 화면의 칸 이름으로 바꿔 놓은
            것입니다. 여기에 넣으면 마켓플레이스 블록까지 한 번에 맞춰집니다.
          </p>

          <h3>색상 · 색상 구성 {theme.schemes.length}개</h3>
          <ul className="plain-list">
            {theme.schemes.map((s, i) => (
              <li key={s.name}>
                <strong>구성 {i + 1} · {s.name}</strong> — 배경 <code>{s.background}</code> /
                {' '}글자 <code>{s.text}</code> / 강조 <code>{s.accent}</code>
                <span style={{ color: 'var(--faint)' }}> — {s.use}</span>
              </li>
            ))}
          </ul>

          <h3>글자</h3>
          <ul className="plain-list">
            <li>기본 글자 크기 — <code>{theme.baseFontSize}px</code></li>
            <li>
              제목 글꼴 — {theme.headingFont.family} /{' '}
              <code>{theme.headingFont.weightName}</code>
            </li>
            <li>
              본문 글꼴 — {theme.bodyFont.family} / <code>{theme.bodyFont.weightName}</code>
            </li>
          </ul>

          <h3>버튼 · 애니메이션</h3>
          <ul className="plain-list">
            <li>버튼 모양 — <code>{theme.buttonShape ?? '지침에 없음'}</code></li>
            <li>애니메이션 유형 — <code>{theme.animation ?? '지침에 없음'}</code></li>
          </ul>

          {theme.notInTheme.length > 0 && (
            <>
              <h3>테마에 넣을 칸이 없는 값</h3>
              <p style={{ color: 'var(--muted)', maxWidth: '64ch' }}>
                아래는 설정 화면에 칸이 없습니다. 마켓플레이스 블록에는 자동으로
                걸리지 않고, 콘텐츠 팩의 <strong>AI 수정 프롬프트</strong>가 자리마다
                날라 줍니다.
              </p>
              <ul className="plain-list">
                {theme.notInTheme.map((x) => <li key={x}>{x}</li>)}
              </ul>
            </>
          )}
        </section>
      )}

      <section className="pack-section">
        <h2>색</h2>
        <ul className="swatches">
          {Object.entries(g.colors).map(([k, v]) => (
            <li key={k}>
              <span className="chipcolor" style={{ background: v }} />
              <span className="cname">{k}</span>
              <span className="cval">{v}</span>
              <span className="crole">{ROLE[k] ?? ''}</span>
              <Copy text={v} label="복사" />
            </li>
          ))}
        </ul>
      </section>

      <section className="pack-section">
        <h2>글자</h2>
        <ul className="checkoff" style={{ listStyle: 'none' }}>
          <li style={{ gridTemplateColumns: '1fr' }}>
            본문 — {t.bodyFont} {t.bodySize}px / 굵기 {t.bodyWeight} / 행간 {t.bodyLineHeight}
            {' / '}자간 {t.bodyLetterSpacing}
          </li>
          {t.scale.map((x) => (
            <li key={x.role} style={{ gridTemplateColumns: '1fr' }}>
              {x.role} — {t.headingFont} {x.size}px / 굵기 {x.weight}
            </li>
          ))}
          <li style={{ gridTemplateColumns: '1fr' }}>
            쓰는 굵기는 {t.weights.join(' · ')} 뿐입니다. 그 사이 값은 쓰지 않습니다.
          </li>
        </ul>
      </section>

      <section className="pack-section">
        <h2>모서리와 간격</h2>
        <p className="packmeta">
          모서리 — {Object.entries(g.rounded).map(([k, v]) => `${k} ${v}px`).join(' · ')}
        </p>
        <p className="packmeta">
          간격 — {Object.entries(g.spacing).map(([k, v]) => `${k} ${v}px`).join(' · ')}
        </p>
      </section>

      <section className="pack-section">
        <h2>구성 요소</h2>
        <ul className="checkoff" style={{ listStyle: 'none' }}>
          {g.components.map((c) => (
            <li key={c.name} style={{ gridTemplateColumns: '1fr' }}>
              {/* li 가 grid 라 자식이 둘이면 줄이 갈린다. 한 덩어리로 넣는다. */}
              <span><strong>{c.name}</strong> — {c.spec}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="pack-section">
        <h2>이렇게 하지 않습니다</h2>
        <p style={{ color: 'var(--muted)', maxWidth: '62ch' }}>
          이 목록이 이 문서의 핵심입니다. AI가 만든 티는 절제가 없어서 납니다.
        </p>
        <ul className="plain-list">{g.donts.map((d) => <li key={d}>{d}</li>)}</ul>

        <h2>이렇게 합니다</h2>
        <ul className="plain-list">{g.dos.map((d) => <li key={d}>{d}</li>)}</ul>
      </section>
    </div>
  );
}
