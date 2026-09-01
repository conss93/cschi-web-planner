import Link from 'next/link';
import { listPlans, initSchema } from '../lib/db.mjs';

export const dynamic = 'force-dynamic';

const STATUS = { draft: '대기', running: '생성 중', done: '완료', error: '실패' };

export default async function HomePage() {
  let plans = [];
  let error = null;

  try {
    await initSchema();
    plans = await listPlans();
  } catch (err) {
    error = err.message;
  }

  return (
    <div className="shell">
      <header className="topbar">
        <h1>웹사이트 기획 에이전트</h1>
        <nav>
          <Link className="btn" href="/new">새 기획서</Link>
        </nav>
      </header>

      {error && <p className="notice">{error}</p>}

      {!error && plans.length === 0 && (
        <p style={{ color: 'var(--muted)' }}>
          아직 만든 기획서가 없습니다. 상담 내용을 넣어 첫 기획서를 만들어 보세요.
        </p>
      )}

      <ul className="rows">
        {plans.map((plan) => (
          <li key={plan.id}>
            <div>
              <Link className="title" href={`/plans/${plan.id}`}>
                {plan.company || '(상호 미확인)'}
              </Link>
              <div className="meta">
                {new Date(plan.created_at).toLocaleDateString('ko-KR')}
                {plan.counts ? ` · 페이지 ${plan.counts.pages} · 블록 ${plan.counts.blocks}` : ''}
                {plan.stage ? ` · ${plan.stage}` : ''}
              </div>
            </div>
            <span className={`pill ${plan.status === 'done' ? 'done' : plan.status === 'error' ? 'error' : ''}`}>
              {STATUS[plan.status] ?? plan.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
