import { NextResponse } from 'next/server';
import { createPlan, listPlans, initSchema } from '../../../lib/db.mjs';

export async function GET() {
  await initSchema();
  return NextResponse.json({ plans: await listPlans() });
}

export async function POST(request) {
  const { briefText, form } = await request.json().catch(() => ({}));
  if (!briefText?.trim()) {
    return NextResponse.json({ error: '상담 내용을 입력해 주세요.' }, { status: 400 });
  }
  await initSchema();
  // 폼에 채운 값을 그대로 남겨 둔다. 나중에 빈칸을 마저 채워 다시 만들 수 있다.
  const plan = await createPlan(briefText.trim(), form ?? null);
  return NextResponse.json(plan, { status: 201 });
}
