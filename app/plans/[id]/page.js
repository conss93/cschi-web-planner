'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { use } from 'react';
import { renderPlan } from '../../../src/render.mjs';

const STEPS = ['브리프 정리', '전략과 톤', '사이트맵', '페이지 구성', '기능과 유의점'];

/** 지금 도는 단계가 다섯 묶음 중 어디에 해당하는지. */
function stepIndex(label = '') {
  if (label.startsWith('페이지 구성')) return 3;
  const found = STEPS.indexOf(label);
  return found === -1 ? 0 : found;
}

export default function PlanPage({ params }) {
  const { id } = use(params);
  const [plan, setPlan] = useState(null);
  const [stage, setStage] = useState(null);
  const [error, setError] = useState('');
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

  // 한 요청에 한 단계씩. 끝날 때까지 이어서 부른다.
  const drive = useCallback(async () => {
    if (running.current) return;
    running.current = true;

    try {
      for (let guard = 0; guard < 40; guard++) {
        const res = await fetch(`/api/plans/${id}/stage`, { method: 'POST' });
        const body = await res.json().catch(() => ({}));

        if (!res.ok) {
          setError(body.error ?? '생성에 실패했습니다.');
          break;
        }
        setStage(body.next ?? null);
        if (body.done) break;
      }
    } finally {
      running.current = false;
      await load();
    }
  }, [id, load]);

  useEffect(() => {
    load().then((row) => {
      if (row && row.status !== 'done') {
        setStage({ label: row.stage || STEPS[0] });
        drive();
      }
    });
  }, [load, drive]);

  if (error) return <div className="shell"><p className="notice">{error}</p></div>;
  if (!plan) return <div className="shell"><p style={{ paddingTop: 40 }}>불러오는 중…</p></div>;

  const done = plan.status === 'done';
  const current = stepIndex(stage?.label ?? plan.stage);

  return (
    <div className="shell">
      <header className="topbar noprint">
        <h1>{plan.company || '기획서'}</h1>
        <nav>
          <a href="/">목록</a>
          {done && <a href={`/share/${plan.share_token}`} target="_blank" rel="noreferrer">공유 링크</a>}
          {done && <button className="btn ghost" onClick={() => print()}>인쇄 · PDF</button>}
        </nav>
      </header>

      {!done && (
        <div className="noprint">
          <p style={{ color: 'var(--muted)' }}>
            기획서를 만들고 있습니다. 1분 안팎 걸립니다. 이 창을 닫아도 이어서 진행됩니다.
          </p>
          <ul className="steps">
            {STEPS.map((label, i) => (
              <li key={label} data-state={i < current ? 'done' : i === current ? 'now' : 'todo'}>
                <span className="dot" />
                {label}
                {i === 3 && stage?.progress ? ` (${stage.progress})` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {done && (
        <>
          {plan.data.problems?.length > 0 && (
            <p className="notice noprint">
              실재하지 않는 블록 {plan.data.problems.length}건을 걸러냈습니다.
            </p>
          )}
          <div dangerouslySetInnerHTML={{ __html: renderPlan(plan.data, { standalone: false }) }} />
        </>
      )}
    </div>
  );
}
