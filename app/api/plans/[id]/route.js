import { NextResponse } from 'next/server';
import { getPlan, deletePlan } from '../../../../lib/db.mjs';
import { assemble } from '../../../../lib/runner.mjs';

export async function GET(request, { params }) {
  const { id } = await params;
  const plan = await getPlan(id);
  if (!plan) return NextResponse.json({ error: '없는 기획서입니다.' }, { status: 404 });

  // 편집 화면은 다듬기 전 상태가 필요하다. assemble 은 헤더·푸터를 페이지에서
  // 빼내 전역으로 올리는데, 편집은 그 원본 자리를 그대로 만져야 한다.
  const raw = new URL(request.url).searchParams.get('raw') === '1';
  return NextResponse.json({ ...plan, data: raw ? plan.data : assemble(plan.data) });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  await deletePlan(id);
  return NextResponse.json({ ok: true });
}
