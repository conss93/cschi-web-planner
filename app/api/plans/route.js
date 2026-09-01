import { NextResponse } from 'next/server';
import { createPlan, listPlans, initSchema } from '../../../lib/db.mjs';

export async function GET() {
  await initSchema();
  return NextResponse.json({ plans: await listPlans() });
}

export async function POST(request) {
  const { briefText } = await request.json().catch(() => ({}));
  if (!briefText?.trim()) {
    return NextResponse.json({ error: '상담 내용을 입력해 주세요.' }, { status: 400 });
  }
  await initSchema();
  const plan = await createPlan(briefText.trim());
  return NextResponse.json(plan, { status: 201 });
}
