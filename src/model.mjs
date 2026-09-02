/**
 * 모델 호출을 한 곳으로 모은다.
 *
 * 단계마다 스키마를 강제해 구조화된 결과만 받는다. 블록 목록은 모든 단계에
 * 똑같이 들어가므로 캐시 구간에 두고, 단계마다 달라지는 지시만 뒤에 붙인다.
 * 프롬프트 캐시는 앞부분이 한 바이트라도 다르면 깨지므로 순서를 고정한다.
 */

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

export const MODEL_ID = 'claude-opus-5';

/** API 오류를 그대로 보여주면 무슨 일인지 알 수 없다. 흔한 것은 풀어서 쓴다. */
function explain(err) {
  const raw = err?.message ?? String(err);

  if (err?.status === 401) return '인증에 실패했습니다. ANTHROPIC_API_KEY 를 확인하세요.';
  if (err?.status === 429) return '요청이 한도를 넘었습니다. 잠시 뒤 이어서 만들기를 누르세요.';
  if (/credit balance is too low/i.test(raw)) {
    return 'API 크레딧이 부족합니다. 콘솔에서 충전한 뒤 이어서 만들기를 누르면 멈춘 지점부터 계속합니다.';
  }
  if (err?.status >= 500) return '모델 쪽 일시적인 오류입니다. 이어서 만들기를 다시 눌러 보세요.';
  return raw;
}

export function createModel({ verbose = false } = {}) {
  const client = new Anthropic();
  const usage = { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

  return {
    usage,

    /**
     * @param {object}   opts
     * @param {string}   opts.stage      단계 이름 (로그용)
     * @param {string}   opts.role       역할과 규칙. 매 단계 동일해야 캐시가 산다.
     * @param {string}   [opts.shared]   블록 목록처럼 크고 안 변하는 자료
     * @param {string}   opts.task       이번 단계에서 할 일
     * @param {object}   opts.schema     zod 스키마
     */
    async generate({ stage, role, shared, task, schema, effort = 'high' }) {
      const system = [{ type: 'text', text: role }];
      if (shared) {
        // 마지막 캐시 구간. 이 뒤로 오는 단계별 지시는 캐시 대상이 아니다.
        system.push({ type: 'text', text: shared, cache_control: { type: 'ephemeral' } });
      }

      const started = Date.now();
      let res;
      try {
        res = await client.messages.parse({
          model: MODEL_ID,
          max_tokens: 16000,
          thinking: { type: 'adaptive' },
          output_config: { effort, format: zodOutputFormat(schema) },
          system,
          messages: [{ role: 'user', content: task }],
        });
      } catch (err) {
        throw new Error(`[${stage}] ${explain(err)}`);
      }

      if (res?.stop_reason === 'refusal') {
        throw new Error(`[${stage}] 모델이 응답을 거절했습니다: ${res.stop_details?.category ?? '사유 불명'}`);
      }
      if (!res.parsed_output) {
        throw new Error(`[${stage}] 구조화 출력을 파싱하지 못했습니다.`);
      }

      usage.calls++;
      usage.input += res.usage.input_tokens ?? 0;
      usage.output += res.usage.output_tokens ?? 0;
      usage.cacheRead += res.usage.cache_read_input_tokens ?? 0;
      usage.cacheWrite += res.usage.cache_creation_input_tokens ?? 0;

      if (verbose) {
        const secs = ((Date.now() - started) / 1000).toFixed(1);
        const cached = res.usage.cache_read_input_tokens ?? 0;
        console.error(
          `  ${stage} — ${secs}초, 출력 ${res.usage.output_tokens} 토큰` +
            (cached ? `, 캐시에서 ${cached} 토큰` : ''),
        );
      }

      return res.parsed_output;
    },
  };
}

/** 대략적인 비용. 요금은 바뀌므로 참고용으로만 쓴다. */
export function estimateCost(usage) {
  const IN = 5 / 1_000_000;
  const OUT = 25 / 1_000_000;
  return (
    usage.input * IN +
    usage.cacheWrite * IN * 1.25 +
    usage.cacheRead * IN * 0.1 +
    usage.output * OUT
  );
}
