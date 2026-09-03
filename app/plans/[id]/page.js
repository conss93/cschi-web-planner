'use client';

import { useCallback, useEffect, useRef, useState, use } from 'react';
import { renderPlan } from '../../../src/render.mjs';

const STEPS = [
  '브리프 정리', '전략과 톤', '사이트맵', '마케팅·UX 검토',
  '페이지 구성', '기능과 유의점', '기술 검토', '디자인 지침',
];

/** 지금 도는 단계가 여섯 묶음 중 어디에 해당하는지. */
function stepIndex(label = '') {
  if (label.startsWith('페이지 구성')) return 4;
  const found = STEPS.indexOf(label);
  return found === -1 ? 0 : found;
}

export default function PlanPage({ params }) {
  const { id } = use(params);
  const [plan, setPlan] = useState(null);
  const [stage, setStage] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/plans/${id}`);
    if (!res.ok) {
      setError('기획서를 찾지 못했습니다.');
      return null;
    }
    const row = await res.json();
    setPlan(row);
    return row;
  }, [id]);

  const drive = useCallback(async () => {
    if (running.current) return;
    running.current = true;

    // 서버가 우리 오류를 돌려준 게 아니라 중간에서 끊긴 경우. 시간 제한이나
    // 일시적인 네트워크 문제라 한 번은 다시 해 볼 값어치가 있다.
    const cutOff = (res) => !res || res.status === 504 || res.status === 502 || res.status === 503;

    const once = async (key) => {
      const res = await fetch(`/api/plans/${id}/stage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(key ? { stage: key } : {}),
      });
      const body = await res.json().catch(() => null);

      if (res.ok && body) return body;

      // 본문이 우리 JSON 이 아니면 서버 코드까지 닿지 못한 것이다.
      if (!body || typeof body.error !== 'string') {
        const err = new Error(
          res.status === 504
            ? '한 단계가 시간 제한을 넘겼습니다. 이어서 만들기를 누르면 멈춘 지점부터 계속합니다.'
            : `서버가 응답하지 않았습니다 (${res.status}). 이어서 만들기를 눌러 보세요.`,
        );
        err.retryable = cutOff(res);
        throw err;
      }
      throw new Error(body.error);
    };

    const step = async (key) => {
      try {
        return await once(key);
      } catch (err) {
        // fetch 자체가 실패한 경우(TypeError)도 한 번은 다시 해 본다.
        if (!err.retryable && err.name !== 'TypeError') throw err;
        await new Promise((r) => setTimeout(r, 2000));
        return once(key);
      }
    };

    try {
      for (let guard = 0; guard < 30; guard++) {
        const body = await step();
        setStage(body.next ?? null);
        if (body.done) break;

        // 페이지들은 서로 독립이라 동시에 요청한다. 다만 한꺼번에 다 보내면
        // 모델 쪽 한도에 걸려 오히려 느려지므로 세 개씩 끊어 보낸다.
        if (body.pending?.length) {
          const queue = [...body.pending];
          const total = queue.length;
          let left = total;
          setStage({ label: '페이지 구성', progress: `0/${total}` });

          const worker = async () => {
            for (let item = queue.shift(); item; item = queue.shift()) {
              await step(item.key);
              left--;
              setStage({ label: '페이지 구성', progress: `${total - left}/${total}` });
            }
          };
          await Promise.all(Array.from({ length: Math.min(3, total) }, worker));
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      running.current = false;
      await load();
    }
  }, [id, load]);

  useEffect(() => {
    load().then((row) => {
      if (!row || row.status === 'done') return;
      // 실패한 채로 두면 자동 재시도가 크레딧을 모르는 새 써 버린다.
      // 무엇 때문에 멈췄는지 보여주고 사람이 이어서 누르게 한다.
      if (row.status === 'error') {
        setError(row.error ?? '알 수 없는 이유로 멈췄습니다.');
        return;
      }
      setStage({ label: row.stage || STEPS[0] });
      drive();
    });
  }, [load, drive]);

  const resume = useCallback(() => {
    setError('');
    drive();
  }, [drive]);

  // 검토 단계가 생기기 전에 만든 기획서에 그 단계만 뒤늦게 붙인다.
  // 브리프·전략·사이트맵만 있으면 도는 단계라 한 번 부르면 끝난다.
  const addReview = useCallback(async () => {
    setBusy(true);
    setError('');
    const res = await fetch(`/api/plans/${id}/stage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stage: 'review' }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? '검토를 만들지 못했습니다.');
      setBusy(false);
      return;
    }
    await load();
    setBusy(false);
  }, [id, load]);

  // 같은 상담 내용으로 다시 만든다. 이전 기획서는 그대로 두어 비교할 수 있다.
  const regenerate = useCallback(async () => {
    if (!plan?.brief_text) return;
    setBusy(true);
    const res = await fetch('/api/plans', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ briefText: plan.brief_text }),
    });
    if (!res.ok) {
      setError('새로 만들지 못했습니다.');
      setBusy(false);
      return;
    }
    const created = await res.json();
    location.href = `/plans/${created.id}`;
  }, [plan]);

  if (!plan) return <div className="shell"><p style={{ paddingTop: 40 }}>불러오는 중…</p></div>;

  if (error) {
    const madePages = plan.data?.pages?.length ?? 0;
    return (
      <div className="shell">
        <header className="topbar">
          <h1>{plan.company || '기획서'}</h1>
          <nav><a className="btn ghost" href="/">목록</a></nav>
        </header>
        <p className="notice">{error}</p>
        <p style={{ color: 'var(--muted)' }}>
          {madePages > 0
            ? `여기까지 만든 내용은 남아 있습니다. 페이지 ${madePages}개까지 완성됐고, 이어서 만들면 멈춘 지점부터 계속합니다.`
            : '이어서 만들면 멈춘 지점부터 계속합니다.'}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" onClick={resume}>이어서 만들기</button>
          <button className="btn ghost" onClick={regenerate} disabled={busy}>
            {busy ? '만드는 중' : '처음부터 다시'}
          </button>
          <a className="btn ghost" href={`/new?from=${plan.id}`}>상담 내용 고치기</a>
        </div>
      </div>
    );
  }

  const done = plan.status === 'done';
  const current = stepIndex(stage?.label ?? plan.stage);

  return (
    <div className="shell">
      <header className="topbar noprint">
        <h1>{plan.company || '기획서'}</h1>
        <nav>
          <a className="btn ghost" href="/">목록</a>
          {done && <a className="btn ghost" href={`/plans/${plan.id}/canvas`}>캔버스</a>}
          {done && <a className="btn ghost" href={`/plans/${plan.id}/pack`}>콘텐츠 팩</a>}
          {done && plan.data.guideline && (
            <a className="btn ghost" href={`/plans/${plan.id}/guideline`}>디자인 지침</a>
          )}
          {done && <a className="btn ghost" href={`/plans/${plan.id}/edit`}>섹션 편집</a>}
          {done && (
            <a className="btn ghost" href={`/share/${plan.share_token}`} target="_blank" rel="noreferrer">
              공유 링크
            </a>
          )}
          {done && <button className="btn ghost" onClick={() => print()}>인쇄 · PDF</button>}
          {done && <a className="btn ghost" href={`/new?from=${plan.id}`}>상담 내용 고치기</a>}
          {done && (
            <button className="btn ghost" onClick={regenerate} disabled={busy}>
              {busy ? '만드는 중' : '같은 내용으로 다시'}
            </button>
          )}
        </nav>
      </header>

      {!done && (
        <div className="noprint">
          <p style={{ color: 'var(--muted)' }}>
            기획서를 만들고 있습니다. 2~3분 걸립니다. 이 창을 닫아도 이어서 진행됩니다.
          </p>
          <ul className="steps">
            {STEPS.map((label, i) => (
              <li key={label} data-state={i < current ? 'done' : i === current ? 'now' : 'todo'}>
                <span className="dot" />
                {label}
                {i === 4 && i === current && stage?.progress ? ` (${stage.progress})` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {done && !plan.data.review && (
        <div className="notice noprint">
          <p style={{ margin: '0 0 12px' }}>
            이 기획서는 마케팅·UX 검토가 생기기 전에 만든 것입니다.
            검토만 따로 붙일 수 있습니다. 다만 페이지 문구는 검토를 보지 못하고
            만들어진 것이라, 문구까지 반영하려면 같은 내용으로 다시 만들어야 합니다.
          </p>
          <button className="btn" onClick={addReview} disabled={busy}>
            {busy ? '검토하는 중' : '검토 붙이기'}
          </button>
        </div>
      )}

      {done && (
        <>
          {plan.data.problems?.length > 0 && (
            <p className="notice noprint">
              실재하지 않는 블록 {plan.data.problems.length}건을 걸러냈습니다.
            </p>
          )}
          {plan.data.duplicates?.length > 0 && (
            <details className="notice noprint">
              <summary>여러 페이지에 겹쳐 들어간 블록 {plan.data.duplicates.length}건</summary>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                {plan.data.duplicates.map((d) => <li key={d}>{d}</li>)}
              </ul>
            </details>
          )}
          <div dangerouslySetInnerHTML={{ __html: renderPlan(plan.data, { standalone: false }) }} />
        </>
      )}
    </div>
  );
}
