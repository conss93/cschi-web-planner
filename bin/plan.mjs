#!/usr/bin/env node
/**
 * 상담 메모를 넣으면 기획서를 만든다.
 *
 *   npm run plan -- examples/brief-tax-firm.txt
 *   npm run plan -- examples/brief-tax-firm.txt --out out/plans/세무법인
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { loadCatalog } from '../src/catalog.mjs';
import { createModel, estimateCost } from '../src/model.mjs';
import { runPipeline } from '../src/pipeline.mjs';
import { renderPlan } from '../src/render.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

function parseArgs(argv) {
  const args = { file: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') args.out = argv[++i];
    else if (!args.file) args.file = argv[i];
  }
  return args;
}

async function main() {
  const { file, out } = parseArgs(process.argv.slice(2));

  if (!file) {
    console.error(`사용법: npm run plan -- <상담메모파일> [--out 저장경로]

상담 메모는 그냥 텍스트 파일이면 됩니다. 형식은 자유이고,
data/brief-form.json 의 항목을 채워 두면 결과가 정확해집니다.`);
    process.exit(1);
  }

  const briefText = await fs.readFile(path.resolve(file), 'utf8');
  const catalog = await loadCatalog();
  console.error(`블록 ${catalog.blocks.length}개, 스타일 계열 ${catalog.styles.length}종을 읽었습니다.\n`);

  const model = createModel({ verbose: true });

  const started = Date.now();
  const plan = await runPipeline({
    model,
    catalog,
    briefText,
    onStage: (name) => console.error(`▶ ${name}`),
  });

  const dir = path.resolve(out ?? path.join(ROOT, 'out', 'plans', plan.brief.companyName || 'plan'));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'plan.json'), JSON.stringify(plan, null, 2));
  await fs.writeFile(path.join(dir, 'plan.html'), renderPlan(plan));

  const secs = ((Date.now() - started) / 1000).toFixed(0);
  console.error(`\n완료 — ${secs}초, 호출 ${model.usage.calls}회, 약 $${estimateCost(model.usage).toFixed(2)}`);
  console.error(
    `페이지 ${plan.counts.pages}개 · 블록 ${plan.counts.blocks}개 · 톤 커스텀 ${plan.counts.customTone}건`,
  );

  if (plan.problems.length) {
    console.error(`\n걸러낸 항목 ${plan.problems.length}건:`);
    for (const p of plan.problems) console.error(`  ${p}`);
  }

  console.error(`\n저장: ${path.relative(ROOT, dir)}/plan.html`);
}

main().catch((err) => {
  console.error(`\n실패: ${err.message}`);
  if (err.status === 401) {
    console.error('ANTHROPIC_API_KEY 를 설정하거나 ant auth login 으로 로그인하세요.');
  }
  process.exit(1);
});
