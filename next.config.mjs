/** @type {import('next').NextConfig} */
export default {
  // 카탈로그 JSON 을 import 로 번들에 포함시킨다.
  outputFileTracingIncludes: {
    '/api/plans/**': ['./data/**'],
  },
};
