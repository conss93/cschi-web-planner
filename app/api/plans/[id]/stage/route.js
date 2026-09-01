import { NextResponse } from 'next/server';
import { getPlan, savePlan } from '../../../../../lib/db.mjs';
import { runNextStage, nextStage } from '../../../../../lib/runner.mjs';

// 모델 호출 한 번에 최대 1분 남짓 걸린다. 한 요청은 한 단계만 돌린다.
export const maxDuration = 120;

export async function POST(request, { params }) {
  const { id } = await params;
  const plan = await getPlan(id);
  if (!plan) return NextResponse.json({ error: '없는 기획서입니다.' }, { status: 404 });

  const pending = nextStage(plan.data);
  if (!pending) {
    return NextResponse.json({ done: true, stage: null, data: plan.data });
  }

  await savePlan(id, { status: 'running', stage: pending.label });

  try {
    const result = await runNextStage(plan.data);
    await savePlan(id, {
      data: result.data,
      status: result.done ? 'done' : 'running',
      stage: result.done ? '' : (nextStage(result.data)?.label ?? ''),
      company: result.data.brief?.companyName,
    });
    return NextResponse.json({
      done: result.done,
      stage: result.stage,
      next: nextStage(result.data),
      counts: result.data.counts,
    });
  } catch (err) {
    await savePlan(id, { status: 'error', error: err.message });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
