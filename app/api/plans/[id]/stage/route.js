import { NextResponse } from 'next/server';
import { getPlan, savePlan, appendPage } from '../../../../../lib/db.mjs';
import { runStage, nextStage, pendingPageStages, summarize, assemble } from '../../../../../lib/runner.mjs';

// 무료 플랜은 60초에서 잘린다. 단계를 그 안에 들어오도록 나눠 두었다.
export const maxDuration = 60;

export async function POST(request, { params }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const plan = await getPlan(id);
  if (!plan) return NextResponse.json({ error: '없는 기획서입니다.' }, { status: 404 });

  // 화면이 페이지들을 동시에 요청하므로 어느 단계인지 명시할 수 있다.
  const key = body.stage ?? nextStage(plan.data)?.key ?? null;
  if (!key) {
    return NextResponse.json({ done: true, stage: null, counts: plan.data.counts ?? null });
  }

  try {
    const result = await runStage(plan.data, key);

    if (result.page) {
      // 동시에 끝난 페이지들이 서로를 지우지 않도록 한 문장으로 이어 붙인다.
      await appendPage(id, result.page, result.problems);
    } else {
      const data = { ...plan.data, ...result.patch };
      await savePlan(id, { data: { ...data, counts: summarize(data) }, company: data.brief?.companyName });
    }

    const after = await getPlan(id);
    const remaining = nextStage(after.data);
    const done = remaining === null;

    await savePlan(id, { status: done ? 'done' : 'running', stage: done ? '' : (remaining.label ?? '') });

    console.log(
      `[${id}] ${key} — 출력 ${result.usage.output} 토큰, 캐시에서 ${result.usage.cacheRead} 토큰`,
    );

    return NextResponse.json({
      done,
      ran: key,
      next: remaining,
      pending: pendingPageStages(after.data),
      counts: assemble(after.data).counts,
    });
  } catch (err) {
    await savePlan(id, { status: 'error', error: `${key}: ${err.message}` });
    return NextResponse.json({ error: `${key} 단계에서 실패했습니다 — ${err.message}` }, { status: 500 });
  }
}
