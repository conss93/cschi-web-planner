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

export async function createPlan(briefText) {
  const q = sql();
  const planId = id();
  // 공유 링크는 로그인 없이 열리므로 추측할 수 없을 만큼 길어야 한다.
  const shareToken = crypto.randomBytes(24).toString('base64url');
  await q`
    INSERT INTO plans (id, brief_text, share_token, data)
    VALUES (${planId}, ${briefText}, ${shareToken}, ${JSON.stringify({ briefText })})`;
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

export async function deletePlan(planId) {
  return sql()`DELETE FROM plans WHERE id = ${planId}`;
}
