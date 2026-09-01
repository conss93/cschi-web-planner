/**
 * 카탈로그를 파일에서 읽는다.
 *
 * CLI 와 점검용. 웹에서는 JSON 을 import 해 번들에 넣으므로 이 모듈을 쓰지
 * 않는다. 분리해 두지 않으면 번들러가 파일 읽기 코드를 서버 함수에 끌고 간다.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { buildCatalog } from './catalog.mjs';

export async function loadCatalog(file) {
  const target = file ?? path.resolve(import.meta.dirname, '../data/sixshop-blocks.json');
  return buildCatalog(JSON.parse(await fs.readFile(target, 'utf8')));
}
