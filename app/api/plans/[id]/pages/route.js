/**
 * 손으로 고친 페이지 구성을 저장한다.
 * 다듬는 규칙은 lib/edit.mjs 에 있다.
 */

import { NextResponse } from 'next/server';
import rawCatalog from '../../../../../data/sixshop-blocks.json' with { type: 'json' };
import { buildCatalog } from '../../../../../src/catalog.mjs';
import { getPlan, savePlan } from '../../../../../lib/db.mjs';
import { normalizePages } from '../../../../../lib/edit.mjs';
import { summarize } from '../../../../../lib/runner.mjs';

let cache = null;
const catalog = () => (cache ??= buildCatalog(rawCatalog));

export async function PUT(request, { params }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  if (!Array.isArray(body.pages)) {
    return NextResponse.json({ error: '페이지 목록이 없습니다.' }, { status: 400 });
  }

  const plan = await getPlan(id);
  if (!plan) return NextResponse.json({ error: '없는 기획서입니다.' }, { status: 404 });

  const { pages, problems } = normalizePages(plan.data, body.pages, catalog());
  const data = { ...plan.data, pages, problems, editedAt: new Date().toISOString() };
  const counts = summarize(data);

  await savePlan(id, { data: { ...data, counts } });

  // 카탈로그로 다시 채운 값(블록 이름·계열·공식파트너)을 화면이 그대로 받는다.
  return NextResponse.json({ ok: true, pages, counts, problems });
}
