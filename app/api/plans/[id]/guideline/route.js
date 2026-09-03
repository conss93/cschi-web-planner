/**
 * 디자인 지침. 화면에서 읽거나(json) 파일로 내려받는다(md).
 * 파일은 식스샵 "디자인 지침 추가" 에 그대로 붙여넣는 형식이다.
 */

import { NextResponse } from 'next/server';
import { getPlan } from '../../../../../lib/db.mjs';
import { guidelineMarkdown, checkContrast } from '../../../../../src/guideline.mjs';

const safeName = (s) => (s || '기획서').replace(/[\\/:*?"<>|]/g, '').slice(0, 60);

export async function GET(request, { params }) {
  const { id } = await params;
  const format = new URL(request.url).searchParams.get('format') ?? 'json';

  const plan = await getPlan(id);
  if (!plan) return NextResponse.json({ error: '없는 기획서입니다.' }, { status: 404 });

  const guideline = plan.data.guideline;
  if (!guideline) {
    return NextResponse.json({ error: '아직 디자인 지침이 없습니다.' }, { status: 404 });
  }

  if (format === 'md') {
    const name = `${safeName(plan.company)} 디자인 지침`;
    return new NextResponse(guidelineMarkdown(guideline, { company: plan.company }), {
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`${name}.md`)}`,
      },
    });
  }

  return NextResponse.json({
    guideline,
    company: plan.company,
    style: plan.data.strategy?.style ?? null,
    // 대비는 코드가 잰다. 모델 말만 믿으면 안 읽히는 조합이 그대로 나간다.
    contrastProblems: checkContrast(guideline),
    markdown: guidelineMarkdown(guideline, { company: plan.company }),
  });
}
