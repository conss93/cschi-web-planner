/**
 * 콘텐츠 팩. 화면에서 읽거나(json) 파일로 내려받는다(md·csv).
 */

import { NextResponse } from 'next/server';
import rawCatalog from '../../../../../data/sixshop-blocks.json' with { type: 'json' };
import { buildCatalog } from '../../../../../src/catalog.mjs';
import { buildPack, packMarkdown, packCsv } from '../../../../../src/pack.mjs';
import { getPlan } from '../../../../../lib/db.mjs';

let cache = null;
const catalog = () => (cache ??= buildCatalog(rawCatalog));

/** 파일 이름에 쓸 수 없는 글자를 턴다. 한글은 그대로 둔다. */
const safeName = (s) => (s || '기획서').replace(/[\\/:*?"<>|]/g, '').slice(0, 60);

export async function GET(request, { params }) {
  const { id } = await params;
  const format = new URL(request.url).searchParams.get('format') ?? 'json';

  const plan = await getPlan(id);
  if (!plan) return NextResponse.json({ error: '없는 기획서입니다.' }, { status: 404 });

  const pack = buildPack(plan.data, catalog(), { company: plan.company });

  if (format === 'json') {
    return NextResponse.json({
      pack,
      company: plan.company,
      style: plan.data.strategy?.style ?? null,
      assets: plan.data.advisories?.assetsToCollect ?? [],
    });
  }

  const meta = {
    company: plan.company,
    style: plan.data.strategy?.style ?? null,
    assets: plan.data.advisories?.assetsToCollect ?? [],
  };
  const name = `${safeName(plan.company)} 콘텐츠 팩`;

  if (format === 'md') {
    return new NextResponse(packMarkdown(pack, meta), {
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`${name}.md`)}`,
      },
    });
  }

  if (format === 'csv') {
    return new NextResponse(packCsv(pack), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`${name}.csv`)}`,
      },
    });
  }

  return NextResponse.json({ error: '모르는 형식입니다.' }, { status: 400 });
}
