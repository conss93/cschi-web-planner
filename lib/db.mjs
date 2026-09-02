/**
 * 기획서 저장소. Neon Postgres 를 HTTP 로 부른다.
 *
 * 서버리스에서는 연결을 오래 붙들 수 없어 커넥션 풀 대신 HTTP 드라이버를 쓴다.
 * 기획 결과는 구조가 자주 바뀌므로 통째로 jsonb 에 넣고, 목록 화면에서 필요한
 * 것만 컬럼으로 뽑아 둔다.
 */

import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';

let cached = null;

export function sql() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL 이 설정되지 않았습니다. Neon 연결 문자열을 넣어 주세요.');
  }
  cached ??= neon(process.env.DATABASE_URL);
  return cached;
}

export async function initSchema() {
  const q = sql();
  await q`
    CREATE TABLE IF NOT EXISTS plans (
      id           TEXT PRIMARY KEY,
      company      TEXT NOT NULL DEFAULT '',
      brief_text   TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'draft',
      stage        TEXT NOT NULL DEFAULT '',
      error        TEXT,
      data         JSONB NOT NULL DEFAULT '{}'::jsonb,
      share_token  TEXT NOT NULL UNIQUE,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  await q`CREATE INDEX IF NOT EXISTS plans_created_idx ON plans (created_at DESC)`;
}

const id = () => crypto.randomBytes(9).toString('base64url');

export async function createPlan(briefText, form = null) {
  const q = sql();
  const planId = id();
  // 공유 링크는 로그인 없이 열리므로 추측할 수 없을 만큼 길어야 한다.
  const shareToken = crypto.randomBytes(24).toString('base64url');
  await q`
    INSERT INTO plans (id, brief_text, share_token, data)
    VALUES (${planId}, ${briefText}, ${shareToken}, ${JSON.stringify({ briefText, form })})`;
  return { id: planId, shareToken };
}

export async function listPlans() {
  return sql()`
    SELECT id, company, status, stage, share_token, created_at,
           data->'counts' AS counts
    FROM plans ORDER BY created_at DESC LIMIT 100`;
}

export async function getPlan(planId) {
  const rows = await sql()`SELECT * FROM plans WHERE id = ${planId}`;
  return rows[0] ?? null;
}

export async function getPlanByToken(token) {
  const rows = await sql()`SELECT * FROM plans WHERE share_token = ${token}`;
  return rows[0] ?? null;
}

export async function savePlan(planId, { data, status, stage, company, error }) {
  return sql()`
    UPDATE plans SET
      data       = COALESCE(${data ? JSON.stringify(data) : null}::jsonb, data),
      status     = COALESCE(${status ?? null}, status),
      stage      = COALESCE(${stage ?? null}, stage),
      company    = COALESCE(${company ?? null}, company),
      error      = ${error ?? null},
      updated_at = now()
    WHERE id = ${planId}`;
}

/**
 * 완성된 페이지 하나를 이어 붙인다.
 *
 * 페이지들은 동시에 만들어지므로, 각자 읽어서 통째로 덮어쓰면 나중에 끝난
 * 것이 앞선 것을 지운다. 한 문장 안에서 이어 붙이면 행 잠금이 순서를
 * 정리해 주므로 어느 것도 사라지지 않는다.
 *
 * 같은 번호의 페이지가 이미 있으면 넣지 않는다. 응답이 오는 길에 끊겨
 * 화면이 같은 단계를 다시 요청해도 페이지가 두 번 들어가지 않는다.
 */
export async function appendPage(planId, page, problems = []) {
  return sql()`
    UPDATE plans SET
      data = jsonb_set(
        jsonb_set(
          data,
          '{pages}',
          COALESCE(data->'pages', '[]'::jsonb) || ${JSON.stringify([page])}::jsonb
        ),
        '{problems}',
        COALESCE(data->'problems', '[]'::jsonb) || ${JSON.stringify(problems)}::jsonb
      ),
      updated_at = now()
    WHERE id = ${planId}
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(data->'pages', '[]'::jsonb)) AS existing
        WHERE (existing->>'index')::int = ${page.index}
      )`;
}

export async function deletePlan(planId) {
  return sql()`DELETE FROM plans WHERE id = ${planId}`;
}
