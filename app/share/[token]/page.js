import { getPlanByToken } from '../../../lib/db.mjs';
import { renderPlan } from '../../../src/render.mjs';
import { assemble } from '../../../lib/runner.mjs';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { token } = await params;
  const plan = await getPlanByToken(token).catch(() => null);
  return { title: plan?.company ? `${plan.company} 웹사이트 기획서` : '기획서' };
}

export default async function SharePage({ params }) {
  const { token } = await params;
  const plan = await getPlanByToken(token).catch(() => null);

  if (!plan || plan.status !== 'done') {
    return (
      <div className="shell">
        <p style={{ paddingTop: 80 }}>
          아직 준비되지 않았거나 없는 링크입니다.
        </p>
      </div>
    );
  }

  return (
    <div className="shell">
      <div dangerouslySetInnerHTML={{ __html: renderPlan(assemble(plan.data), { standalone: false }) }} />
    </div>
  );
}
