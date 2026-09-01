import { NextResponse } from 'next/server';
import { getPlan, deletePlan } from '../../../../lib/db.mjs';

export async function GET(request, { params }) {
  const { id } = await params;
  const plan = await getPlan(id);
  if (!plan) return NextResponse.json({ error: '없는 기획서입니다.' }, { status: 404 });
  return NextResponse.json(plan);
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  await deletePlan(id);
  return NextResponse.json({ ok: true });
}
