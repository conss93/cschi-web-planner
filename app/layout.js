import './globals.css';

export const metadata = {
  title: '웹사이트 기획 에이전트',
  description: '상담 메모로 식스샵 기반 웹사이트 기획서를 만든다',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <head>
        {/*
          애플 기기에서는 SF Pro 와 Apple SD Gothic Neo 가 그대로 잡힌다.
          그 외 환경을 위한 대체 글꼴만 받아 온다. 굵기는 300/400/600/700 만
          쓰고 500 은 쓰지 않는다.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&family=Noto+Sans+KR:wght@300;400;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
