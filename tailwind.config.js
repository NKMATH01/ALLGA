/** @type {import('tailwindcss').Config} */
/*
 * 색은 전부 client/src/index.css 의 CSS 변수(DESIGN.md 2장 3계층 토큰)를 참조한다.
 * 이 파일에는 hex 리터럴이 없다.
 *
 * 이름 규칙
 *   surface-* / ink-* / line-* / action-* : 시맨틱 계층 (컴포넌트가 쓰는 것)
 *   fn-*                                  : 기능 계층 (등급/상태 전용, 브랜드 독립)
 *   navy-* / brass-*                      : 브랜드 원색. 시맨틱으로 표현되지 않는 경우에만
 *   background/foreground/primary/...     : 기존 shadcn 이름 별칭. 신규 토큰으로 재배선
 */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    './client/index.html',
    './client/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Pretendard Variable',
          'Pretendard',
          '-apple-system',
          'Apple SD Gothic Neo',
          'Noto Sans KR',
          'Malgun Gothic',
          'system-ui',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'Cascadia Mono', 'Consolas', 'D2Coding', 'monospace'],
      },
      colors: {
        /* --- 시맨틱 계층 --- */
        surface: {
          DEFAULT: 'var(--surface)',
          sunken: 'var(--surface-sunken)',
          raised: 'var(--surface-raised)',
          inverse: 'var(--surface-inverse)',
          subtle: 'var(--surface-subtle)',
        },
        ink: {
          DEFAULT: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary: 'var(--text-tertiary)',
          inverse: 'var(--text-on-inverse)',
          'inverse-muted': 'var(--text-on-inverse-muted)',
        },
        line: {
          DEFAULT: 'var(--border)',
          strong: 'var(--border-strong)',
          subtle: 'var(--border-subtle)',
          inverse: 'var(--border-inverse)',
        },
        action: {
          DEFAULT: 'var(--action)',
          hover: 'var(--action-hover)',
          active: 'var(--action-active)',
          text: 'var(--action-text)',
          subtle: 'var(--action-subtle)',
          'subtle-hover': 'var(--action-subtle-hover)',
        },
        /* 브라스. 화면당 최대 2곳 (DESIGN.md 1.3) */
        accent: {
          DEFAULT: 'var(--accent)',
          strong: 'var(--accent-strong)',
          surface: 'var(--accent-surface)',
        },

        /* --- 기능 계층 (브랜드 독립) --- */
        fn: {
          success: 'var(--fn-success)',
          'success-surface': 'var(--fn-success-surface)',
          'success-border': 'var(--fn-success-border)',
          warning: 'var(--fn-warning)',
          'warning-surface': 'var(--fn-warning-surface)',
          'warning-border': 'var(--fn-warning-border)',
          error: 'var(--fn-error)',
          'error-surface': 'var(--fn-error-surface)',
          'error-border': 'var(--fn-error-border)',
          info: 'var(--fn-info)',
          'info-surface': 'var(--fn-info-surface)',
          'info-border': 'var(--fn-info-border)',
        },

        /* --- 브랜드 원색 스케일 --- */
        navy: {
          50: 'var(--navy-50)',
          100: 'var(--navy-100)',
          200: 'var(--navy-200)',
          300: 'var(--navy-300)',
          400: 'var(--navy-400)',
          500: 'var(--navy-500)',
          600: 'var(--navy-600)',
          700: 'var(--navy-700)',
          800: 'var(--navy-800)',
          900: 'var(--navy-900)',
          950: 'var(--navy-950)',
        },
        brass: {
          300: 'var(--brass-300)',
          400: 'var(--brass-400)',
          500: 'var(--brass-500)',
          600: 'var(--brass-600)',
          700: 'var(--brass-700)',
        },

        /* --- 기존 shadcn 이름 별칭 (신규 토큰으로 재배선) --- */
        border: 'var(--border)',
        input: 'var(--border-strong)',
        ring: 'var(--focus-ring)',
        background: 'var(--surface-sunken)',
        foreground: 'var(--text-primary)',
        primary: {
          DEFAULT: 'var(--action)',
          foreground: 'var(--action-text)',
        },
        secondary: {
          DEFAULT: 'var(--action-subtle)',
          foreground: 'var(--text-primary)',
        },
        destructive: {
          DEFAULT: 'var(--fn-error)',
          foreground: 'var(--surface)',
        },
        muted: {
          DEFAULT: 'var(--surface-subtle)',
          foreground: 'var(--text-secondary)',
        },
        popover: {
          DEFAULT: 'var(--surface-raised)',
          foreground: 'var(--text-primary)',
        },
        card: {
          DEFAULT: 'var(--surface)',
          foreground: 'var(--text-primary)',
        },
      },
      borderRadius: {
        /* DESIGN.md 4.3: 6 / 10 / 14 세 단계. rounded-2xl, rounded-3xl 로 카드를
           부풀리는 기존 사용은 전역에서 14px 로 클램프된다. */
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-lg)',
        '2xl': 'var(--radius-lg)',
        '3xl': 'var(--radius-lg)',
      },
      boxShadow: {
        /* DESIGN.md 4.4 / 9.1: 그림자는 3단계, 네이비 틴트. shadow-xl, shadow-2xl 클램프 */
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-lg)',
        '2xl': 'var(--shadow-lg)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
