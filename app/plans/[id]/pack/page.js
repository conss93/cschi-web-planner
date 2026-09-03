'use client';

/**
 * 콘텐츠 팩 화면. 식스샵에서 조립하면서 옆에 띄워 두고 쓴다.
 *
 * 여기서 제일 많이 하는 일은 문구를 복사해 블록에 붙이는 것이라, 자리마다
 * 복사 버튼을 둔다. 기획서 본문은 왜 그렇게 만드는지를 설명하는 곳이고
 * 여기는 무엇을 넣는지만 있는 곳이다.
 */

import { useEffect, useState, use } from 'react';

function Copy({ text, label = '문구 복사' }) {
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
          // 브라우저가 막아 둔 경우. 글은 화면에 그대로 있으니 직접 긁으면 된다.
        }
      }}
    >
      {done ? '복사함' : label}
    </button>
  );
}

export default function PackPage({ params }) {
  const { id } = use(params);
  const [body, setBody] = useState(null);
  const [error, setError] = useState('');
  const [onlyTodo, setOnlyTodo] = useState(false);

  useEffect(() => {
    fetch(`/api/plans/${id}/pack`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('기획서를 찾지 못했습니다.'))))
      .then(setBody)
      .catch((err) => setError(err.message));
  }, [id]);

  if (error) {
    return (
      <div className="shell">
        <header className="topbar">
          <h1>콘텐츠 팩</h1>
          <nav><a className="btn ghost" href="/">목록</a></nav>
        </header>
        <p className="notice">{error}</p>
      </div>
    );
  }

  if (!body) return <div className="shell"><p style={{ paddingTop: 40 }}>불러오는 중…</p></div>;

  const { pack, company, style, assets } = body;
  const n = pack.summary;

  const keep = (s) => !onlyTodo || s.pending || s.needsImage || s.needsCustomTone;
  const allCopy = pack.pages
    .flatMap((p) => p.sections.filter((s) => s.copy).map((s) => `[${p.title} ${s.at}. ${s.purpose}]\n${s.copy}`))
    .join('\n\n');

  return (
    <div className="shell">
      <header className="topbar">
        <h1>{company || '기획서'} · 콘텐츠 팩</h1>
        <nav>
          <a className="btn ghost" href={`/plans/${id}`}>기획서로</a>
          <a className="btn ghost" href={`/plans/${id}/canvas`}>캔버스</a>
          <a className="btn ghost" href={`/api/plans/${id}/pack?format=csv`}>CSV</a>
          <a className="btn" href={`/api/plans/${id}/pack?format=md`}>마크다운 내려받기</a>
        </nav>
      </header>

      <div className="packbar">
        <dl className="tally">
          <div><dt>페이지</dt><dd>{n.pages}</dd></div>
          <div><dt>자리</dt><dd>{n.slots}</dd></div>
          <div><dt>블록</dt><dd>{n.blocks}종</dd></div>
          <div><dt>AI 블록</dt><dd>{n.ai}</dd></div>
          <div><dt>이미지 필요</dt><dd>{n.images}</dd></div>
          <div><dt>톤 커스텀</dt><dd>{n.tone}</dd></div>
          <div><dt>자료 미확정</dt><dd>{n.pending}</dd></div>
        </dl>
        <div className="packtools">
          <label className="tonebox">
            <input type="checkbox" checked={onlyTodo} onChange={(e) => setOnlyTodo(e.target.checked)} />
            손이 더 가는 자리만
          </label>
          <Copy text={allCopy} label="전체 문구 복사" />
        </div>
      </div>

      <p className="notice">
        이미지 규격(가로·세로 픽셀)은 마켓플레이스 자료에 없습니다. 블록마다 다르므로
        각 자리의 <strong>미리보기</strong>를 열어 직접 확인하세요.
        {style ? ` 이 사이트는 ${style} 계열로 짰습니다.` : ''}
      </p>

      {n.ai > 0 && (
        <p className="notice">
          {n.guideline ? (
            <>
              AI 블록 자리 {n.ai}개에 프롬프트를 붙여 두었습니다. 식스샵에서{' '}
              <strong>스타일 참조에 디자인 지침을 물린 상태로</strong> 넣으세요.
            </>
          ) : (
            <>
              디자인 지침이 아직 없어 프롬프트에 색·모서리 값이 빠져 있습니다.{' '}
              <a href={`/plans/${id}/guideline`}>지침</a>을 먼저 만드는 편이 낫습니다.
            </>
          )}
          {n.thinPrompts > 0 && ` 이 중 ${n.thinPrompts}개는 배치 지시 없이 만든 얇은 프롬프트라 손봐야 합니다.`}
        </p>
      )}

      {assets?.length > 0 && (
        <section className="pack-section">
          <h2>고객사에서 받아야 할 자료</h2>
          <ul className="checkoff">
            {assets.map((a) => (
              <li key={a}>
                <input type="checkbox" />
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pack.pages.map((page) => {
        const shown = page.sections.filter(keep);
        if (!shown.length) return null;

        return (
          <section className="pack-section" key={page.index}>
            <div className="page-bar">
              <h2 style={{ margin: 0 }}>{page.title}</h2>
              <span className="path">{page.slug}</span>
              <span className="count">자리 {page.sections.length}개</span>
            </div>

            <ol className="packlist">
              {shown.map((s) => (
                <li key={s.at}>
                  <div className="ord">{String(s.at).padStart(2, '0')}</div>

                  <div className="packbody">
                    <div className="packhead">
                      <strong>{s.purpose}</strong>
                      {s.needsImage && <span className="mark img">이미지 필요</span>}
                      {s.needsCustomTone && <span className="mark tone">톤 커스텀</span>}
                      {s.pending && <span className="mark todo">자료 미확정</span>}
                    </div>

                    <div className="packblock">
                      {s.blockId ? (
                        <>
                          <span className="bname">{s.label}</span>
                          {s.previews.map((url, i, all) => (
                            <a key={url} href={url} target="_blank" rel="noreferrer">
                              {all.length > 1 ? `미리보기 ${i + 1}` : '미리보기'}
                            </a>
                          ))}
                          <Copy text={s.blockId} label="blockId 복사" />
                        </>
                      ) : s.fill === 'AI 블록' ? (
                        <span className="bname ai">AI 블록으로 제작 — 맞는 마켓플레이스 블록 없음</span>
                      ) : (
                        <span className="bname basic">식스샵 기본 기능 — 마켓플레이스 블록 아님</span>
                      )}
                    </div>

                    {s.buttons.length > 0 && (
                      <p className="packmeta">버튼 — {s.buttons.join(' · ')}</p>
                    )}
                    {s.note && <p className="packmeta">{s.note}</p>}

                    {s.copy && (
                      <div className="packcopy">
                        <pre>{s.copy}</pre>
                        <Copy text={s.copy} />
                      </div>
                    )}

                    {s.prompt && (
                      <details className="aiprompt">
                        <summary>
                          AI 블록 프롬프트
                          {s.thinPrompt && <span className="mark todo">손봐야 함</span>}
                        </summary>
                        <div className="packcopy">
                          <pre>{s.prompt}</pre>
                          <Copy text={s.prompt} label="프롬프트 복사" />
                        </div>
                      </details>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
