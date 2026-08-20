# 올가 미수등 시스템 디자인 헌법

입시 국어 학원의 시험·성적 관리 프로그램을 위한 단일 디자인 규범입니다. 이 문서는 취향의 기록이 아니라 구속력 있는 규칙이며, 새 화면을 만들거나 기존 화면을 고칠 때 여기 적힌 토큰과 문법만 사용합니다.

기준 구현: `reference/work-report-mockup.html`. 문서와 구현이 어긋나면 이 문서가 우선하고, 구현을 고칩니다.

---

## 1. 철학과 북극성

### 1.1 북극성

> **학부모가 화면을 캡처해 카톡으로 보냈을 때, 학원이 신뢰할 만한 곳으로 보일 것.**

이 프로그램의 화면은 대부분 학생의 성적이라는 민감한 정보를 다룹니다. 화면이 들뜨고 화려하면 데이터의 무게가 가벼워 보이고, 지나치게 삭막하면 학원이 성의 없어 보입니다. 목표는 **차분한 권위**입니다.

### 1.2 이원화 원칙 (二元化)

색은 두 개의 역할로 나뉘며, 역할을 넘나들지 않습니다.

| 계열 | 역할 | 쓰는 곳 | 절대 쓰지 않는 곳 |
|---|---|---|---|
| **네이비** | 구조와 권위 | 사이드바, 헤더, 주 버튼, 표 머리, 활성 내비, 포커스 링 | 성취의 강조, 상태 표시 |
| **브라스** | 성취와 강조 | 최고 기록, 등급 상승폭, 화면의 단 하나뿐인 핵심 CTA | 배경 면, 구조선, 일반 버튼, 아이콘 기본색, 상태 표시 |

**네이비는 그릇이고, 브라스는 그릇에 담긴 성취입니다.** 네이비가 넓은 면과 구조를 맡기 때문에, 브라스는 좁고 드물게 등장할 때만 성취로 읽힙니다.

### 1.3 브라스 2곳 규칙 (강제)

> **한 화면(뷰포트 아닌 라우트 단위)에 브라스는 최대 2곳까지만 등장한다.**

- 2곳을 세는 단위는 "시각적으로 인지되는 브라스 덩어리"입니다. 숫자 하나 + 그 숫자에 붙은 단위/화살표는 1곳으로 셉니다.
- 3곳째가 필요하다고 느껴지면, 그것은 브라스가 부족한 게 아니라 **화면의 초점이 흐린 것**입니다. 우선순위를 다시 정하고 2곳으로 줄입니다.
- 표의 셀, 리스트의 반복 항목에는 브라스를 쓰지 않습니다. 반복되는 순간 강조가 아니라 장식이 됩니다.
- 예외: 인쇄용 보고서 지면(10장)은 지면당 2곳으로 셉니다.

### 1.4 금지 목록

이 프로젝트에서 다음은 예외 없이 금지합니다.

- **그라디언트 배경 전면 금지.** `bg-gradient-*`, `linear-gradient`로 칠한 카드, 헤더, 버튼, 사이드바 모두 해당. 색은 단색 면과 1px 선으로만 구분합니다.
- **화면마다 다른 아이덴티티 색.** 현재 로그인/전체관리자는 오렌지레드, 지점은 인디고블루, 학생은 퍼플로 갈라져 있습니다. 전부 네이비로 통합합니다(9장).
- **텍스트 그라디언트** (`bg-clip-text text-transparent`).
- **네온 글로우, 컬러 그림자** (`shadow-blue-500` 류). 그림자는 네이비 틴트의 중성 그림자만.
- **이모지.** 학부모에게 전달되는 문서형 화면이므로 텍스트와 아이콘으로만 표현합니다.
- **em-dash(U+2014), en-dash(U+2013).** 하이픈(-)만 사용합니다. 이 문서가 두 문자를 코드포인트로만 적는 이유도 같습니다. 코드와 문서 모두 `grep`으로 0건이 확인되어야 합니다.
- **원색 채도의 큰 면.** 빨강/초록 배경 카드로 상태를 표현하지 않습니다. 상태는 뱃지와 1px 테두리로.

---

## 2. 컬러 토큰 (3계층)

계층은 아래로만 참조합니다. **컴포넌트는 2계층과 3계층만 참조하고, 1계층 브랜드 스케일을 직접 쓰지 않습니다.** 1계층은 2계층을 정의하기 위해서만 존재합니다.

```
① 브랜드 원색 스케일 (navy, brass)
        ↓ 참조
② 시맨틱 토큰 (surface, text, border, action)   ③ 기능 토큰 (success/warning/error/info)
        ↓ 참조                                          ↓ 참조
              컴포넌트 / 화면
```

③ 기능 계층은 ①을 참조하지 않습니다. **브랜드 색이 네이비에서 무엇으로 바뀌더라도 기능색의 의미와 값은 그대로 유지되어야 합니다.** 등급, 합격 여부, 오류는 브랜드의 문제가 아니라 의미의 문제이기 때문입니다.

### 2.1 ① 브랜드 계층

```css
:root {
  /* 네이비: 구조와 권위 */
  --navy-50:  #F4F6FA;
  --navy-100: #E6EBF4;
  --navy-200: #C9D4E7;
  --navy-300: #A3B4D3;
  --navy-400: #7189B5;
  --navy-500: #4C6595;
  --navy-600: #354C78;
  --navy-700: #27395C;
  --navy-800: #1B2942;   /* 헤더, 사이드바 기본 */
  --navy-900: #131E31;
  --navy-950: #0C1421;   /* 야간 모드 캔버스 */

  /* 브라스: 성취와 강조 */
  --brass-300: #E3C88E;
  --brass-400: #D4B26A;  /* 어두운 면 위의 브라스 텍스트 */
  --brass-500: #C09A4E;  /* 브라스 기준색, 면과 선 */
  --brass-600: #A07F3B;  /* 큰 텍스트(18px+) 전용 */
  --brass-700: #7D622C;  /* 밝은 면 위의 본문 크기 브라스 텍스트 */
}
```

**브라스 명도 규칙 (접근성).** 흰 면 위에서 `--brass-500`, `--brass-600`은 본문 크기 텍스트로 쓸 수 없습니다(대비 4.5:1 미달). 밝은 면 위 텍스트는 `--brass-700`(대비 5.8:1), 어두운 면 위 텍스트는 `--brass-400`(navy-800 대비 7.2:1)을 씁니다. `--brass-500`은 면, 선, 큰 숫자(24px 이상)에만.

### 2.2 ② 시맨틱 계층 (라이트 기준)

```css
:root {
  /* 면 */
  --surface:          #FFFFFF;   /* 카드, 패널 */
  --surface-sunken:   var(--navy-50);   /* 앱 캔버스 */
  --surface-raised:   #FFFFFF;   /* 모달, 팝오버, 드롭다운 */
  --surface-inverse:  var(--navy-800);  /* 헤더, 사이드바 */
  --surface-subtle:   var(--navy-100);  /* 표 머리, 비활성 탭 */

  /* 글자 */
  --text-primary:     var(--navy-900);
  --text-secondary:   var(--navy-600);
  --text-tertiary:    var(--navy-400);  /* 캡션, 단위, 보조 라벨 */
  --text-on-inverse:  #FFFFFF;
  --text-on-inverse-muted: var(--navy-200);
  --text-accent:      var(--brass-700); /* 성취 텍스트, 2곳 규칙 적용 */

  /* 선 */
  --border:           var(--navy-200);  /* 기본 구획선 */
  --border-strong:    var(--navy-300);  /* 표 바깥선, 입력 테두리 */
  --border-subtle:    var(--navy-100);  /* 리스트 행 구분선 */
  --border-inverse:   var(--navy-700);

  /* 액션 */
  --action:           var(--navy-800);
  --action-hover:     var(--navy-700);
  --action-active:    var(--navy-900);
  --action-text:      #FFFFFF;
  --action-subtle:    var(--navy-100);
  --action-subtle-hover: var(--navy-200);
  --focus-ring:       var(--navy-500);

  /* 강조 (브라스, 2곳 규칙 적용 대상) */
  --accent:           var(--brass-500);
  --accent-strong:    var(--brass-700);
  --accent-surface:   #FBF6EA;   /* 브라스 계열의 아주 옅은 면 */

  /* 그림자 (네이비 틴트, 중성 검정 금지) */
  --shadow-sm: 0 1px 2px rgba(19, 30, 49, 0.06);
  --shadow-md: 0 2px 8px rgba(19, 30, 49, 0.08);
  --shadow-lg: 0 8px 24px rgba(19, 30, 49, 0.12);
}
```

### 2.3 ③ 기능 계층 (브랜드 독립)

```css
:root {
  --fn-success:         #1D7A4C;
  --fn-success-surface: #E8F4EE;
  --fn-success-border:  #A8D4BE;

  --fn-warning:         #8F5A00;
  --fn-warning-surface: #FBF1DF;
  --fn-warning-border:  #E0C48A;

  --fn-error:           #B3261E;
  --fn-error-surface:   #FCEDEC;
  --fn-error-border:    #E9B4B0;

  --fn-info:            #0F6E7A;
  --fn-info-surface:    #E6F2F4;
  --fn-info-border:     #9FCBD2;
}
```

네 색 모두 흰 면 위 대비 5:1 이상입니다.

**info를 청록으로 잡은 이유:** 파랑 계열 info는 네이비 구조색과 혼동됩니다. 사용자가 "이 파랑이 구조인가 상태인가"를 판단해야 하는 순간 이원화가 무너지므로, info는 네이비에서 확실히 떨어진 청록으로 고정합니다.

### 2.4 등급 색 규칙 (1 ~ 9등급)

등급은 성적이지 시스템 상태가 아닙니다. 따라서 **등급에는 `--fn-error`를 쓰지 않습니다.** error는 시스템 오류와 파괴적 동작에만 남겨둡니다.

| 등급 | 의미 라벨 | 토큰 |
|---|---|---|
| 1 ~ 2 | 우수 | `--fn-success` 계열 |
| 3 ~ 4 | 양호 | `--fn-info` 계열 |
| 5 ~ 6 | 보통 | `--text-secondary` + `--border` (무채색) |
| 7 ~ 9 | 보완 필요 | `--fn-warning` 계열 |

등급 뱃지는 항상 `면(-surface) + 1px 테두리(-border) + 글자(기본색)` 3종 세트로 구성하며, 원색 배경에 흰 글자를 쓰지 않습니다. 7~9등급에 빨강을 쓰지 않는 것은 미학이 아니라 정책입니다. 학생에게 보이는 화면이기 때문입니다.

---

## 3. 타이포그래피

### 3.1 서체 스택

```css
--font-sans: "Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo",
             "Noto Sans KR", "Malgun Gothic", system-ui, sans-serif;
--font-mono: "JetBrains Mono", "Cascadia Mono", Consolas, "D2Coding", monospace;
```

Pretendard를 1순위로 두되 **웹폰트를 @import로 불러오지 않습니다.** 로컬 설치본을 쓰고 없으면 시스템 한글 폰트로 자연 강등합니다. 현재 프로젝트에는 `font-family` 선언 자체가 없어 브라우저 기본 고딕으로 렌더되고 있으므로, `client/src/index.css`의 `body`에 위 스택을 지정하는 것이 마이그레이션 1순위 작업입니다.

### 3.2 스케일

| 이름 | 크기 | 행간 | 자간 | 굵기 | 용도 |
|---|---|---|---|---|---|
| `display` | 32px | 1.25 | -0.02em | 700 | 보고서 지면 제목 |
| `h1` | 24px | 1.30 | -0.015em | 700 | 화면 제목 |
| `h2` | 20px | 1.35 | -0.01em | 600 | 섹션 제목 |
| `h3` | 16px | 1.40 | -0.005em | 600 | 카드 제목, 패널 제목 |
| `body` | 15px | 1.60 | 0 | 400 | 본문 |
| `body-sm` | 13px | 1.55 | 0 | 400 | 표 셀, 보조 설명 |
| `caption` | 12px | 1.45 | 0.01em | 500 | 라벨, 단위, 각주 |
| `overline` | 11px | 1.40 | 0.08em | 600 | 통계 카드 라벨 (대문자 변환은 한글에 적용 안 됨) |
| `metric-lg` | 36px | 1.00 | -0.03em | 700 | 통계 카드 주 수치 |
| `metric-md` | 28px | 1.05 | -0.025em | 700 | 표 안 강조 수치 |

### 3.3 숫자 규칙

- **모든 숫자에 `font-variant-numeric: tabular-nums`를 적용합니다.** 점수, 등급, 인원, 날짜가 표와 카드에서 세로로 정렬되어야 합니다. 전역 `body`에 걸고 예외를 두지 않습니다.
- 점수와 단위는 크기를 분리합니다. `89` 는 `metric-lg`, `점` 은 `caption` + `--text-tertiary`. 단위가 수치와 같은 크기로 커지면 수치가 안 읽힙니다.
- 등급은 `2등급`처럼 항상 단위를 붙여 표기합니다. 숫자만 두면 점수와 혼동됩니다.

### 3.4 한글 조판

- `word-break: keep-all`을 전역 적용합니다. 없으면 "강남고등학교"가 줄 끝에서 "강남고등학" / "교"로 쪼개집니다.
- 함께 `overflow-wrap: anywhere`를 걸어 긴 식별자(`올가국어_둔산점`)가 좁은 칸을 넘치지 않게 합니다.
- 본문 최대 폭 `70ch`. 보고서 지면은 `62ch`.
- 굵기는 400 / 600 / 700 세 단계만 씁니다. 500은 쓰지 않습니다(한글 폰트에서 600과 구분되지 않습니다).

---

## 4. 간격과 레이아웃

### 4.1 4px 스케일

```
--space-1: 4px    --space-5: 20px   --space-10: 40px
--space-2: 8px    --space-6: 24px   --space-12: 48px
--space-3: 12px   --space-7: 28px   --space-16: 64px
--space-4: 16px   --space-8: 32px   --space-20: 80px
```

4의 배수가 아닌 값은 쓰지 않습니다. 유일한 예외는 1px 선과 옵티컬 보정용 홀수 패딩(버튼 세로 9px 등)이며, 이 경우 주석으로 이유를 남깁니다.

### 4.2 골격 규격

| 요소 | 값 |
|---|---|
| 콘텐츠 최대 폭 | 1280px (`--container-max`) |
| 콘텐츠 좌우 패딩 | 데스크톱 32px / 태블릿 24px / 모바일 16px |
| 사이드바 폭 (펼침) | 264px |
| 사이드바 폭 (접힘) | 72px, 아이콘만 |
| 헤더 높이 | 64px (고정, 초과 금지) |
| 카드 내부 패딩 | 24px (통계 카드 20px) |
| 카드 사이 간격 | 16px |
| 섹션 사이 간격 | 32px |

### 4.3 모서리 반경

```
--radius-sm: 6px    입력, 뱃지, 작은 버튼
--radius-md: 10px   버튼, 카드
--radius-lg: 14px   모달, 큰 패널
--radius-full: 999px  아바타, 상태 점(오직 이 둘)
```

이 4단계 외의 값은 쓰지 않습니다. 특히 `rounded-2xl`(16px) `rounded-3xl`(24px)로 카드를 부풀리지 않습니다. 현재 코드에 `rounded-2xl`이 다수 있으며 전부 `--radius-md`로 내립니다.

### 4.4 표면 위계

| 층 | 배경 | 테두리 | 그림자 |
|---|---|---|---|
| 캔버스 | `--surface-sunken` | 없음 | 없음 |
| 카드 | `--surface` | `1px --border` | `--shadow-sm` |
| 팝오버/드롭다운 | `--surface-raised` | `1px --border` | `--shadow-md` |
| 모달 | `--surface-raised` | 없음 | `--shadow-lg` |

**테두리와 그림자를 둘 다 강하게 쓰지 않습니다.** 카드는 테두리로 구분하고 그림자는 거의 없게, 떠 있는 요소는 그림자로 구분합니다.

---

## 5. 컴포넌트 문법

### 5.1 버튼

| 종류 | 배경 | 글자 | 테두리 | 용도 |
|---|---|---|---|---|
| 주 (primary) | `--action` | `--action-text` | 없음 | 화면당 1개 원칙 |
| 보조 (secondary) | `--surface` | `--text-primary` | `1px --border-strong` | 취소, 부가 동작 |
| 조용한 (quiet) | 투명 | `--text-secondary` | 없음 | 표 안 인라인 동작 |
| 위험 (danger) | `--surface` | `--fn-error` | `1px --fn-error-border` | 삭제, 초기화 |
| 강조 (accent) | `--accent` | `--navy-900` | 없음 | **화면의 유일한 핵심 CTA에만.** 브라스 2곳 예산에서 1곳 차감 |

- 크기: 기본 높이 40px / 좌우 패딩 16px / `--radius-md` / `body` 크기 600 굵기.
- 작은 버튼 32px, 큰 버튼 48px. 세 가지 외 없음.
- 위험 버튼을 빨간 배경으로 만들지 않습니다. 실수 유발 대신 테두리로 경고합니다.
- `:hover`는 배경 한 단계 이동, `:active`는 `transform: scale(0.98)`. `:focus-visible`은 `outline: 2px solid var(--focus-ring); outline-offset: 2px`.
- 라벨은 한 줄. 2줄로 접히면 라벨을 줄입니다.

### 5.2 카드

**통계 카드**
```
[ 라벨 (overline, --text-tertiary) ]
[ 수치 (metric-lg) + 단위 (caption) ]
[ 각주 (caption, --text-secondary) ]
```
- 배경 `--surface`, 테두리 `1px --border`, 반경 `--radius-md`, 패딩 20px.
- 아이콘을 넣지 않습니다. 4개가 나란히 놓일 때 아이콘은 수치의 스캔을 방해합니다.
- 값이 없을 때는 `0`이 아니라 `배정 없음`처럼 상태를 문장으로 씁니다. 크기는 `h3`, 색은 `--text-tertiary`.
- 브라스를 쓰는 통계 카드는 **최대 1개**이며, 상단에 `3px --accent` 규칙선을 얹고 수치를 `--accent-strong`으로 칠합니다. 배경은 칠하지 않습니다.

**목록 카드**
- 행 사이는 `1px --border-subtle`. 카드 안 마지막 행에는 구분선을 넣지 않습니다.
- 행 전체가 클릭 가능하면 `:hover`에 `--surface-subtle` 배경만 줍니다. 이동/확대 금지.

### 5.3 뱃지

- 구조: `면(-surface) + 1px 테두리(-border) + 글자(기본색)`, 반경 `--radius-sm`, 패딩 `4px 8px`, `caption` 크기 600 굵기.
- 등급 뱃지는 2.4절 매핑을 따릅니다. 색만으로 의미를 전달하지 않도록 **숫자와 단위를 항상 함께 표기**합니다(`2등급`).
- 상태 점(`●`)을 뱃지 앞에 붙이지 않습니다.

### 5.4 표

- 머리: 배경 `--surface-subtle`, 글자 `caption` 600 `--text-secondary`, 아래 `1px --border-strong`.
- 본문 행: 아래 `1px --border-subtle`, 마지막 행 없음. **행마다 위아래 두 줄을 긋지 않습니다.**
- 세로 줄(column border) 없음. 정렬로 열을 구분합니다.
- 숫자 열은 우측 정렬 + tabular-nums, 텍스트 열은 좌측 정렬. 가운데 정렬 금지.
- 셀 패딩 `12px 16px`. 좌우 끝 셀은 바깥쪽 패딩을 0으로 두어 표가 카드 안에서 정렬되게 합니다.
- 줄무늬(zebra) 배경 금지. 행이 많으면 `:hover` 하이라이트로 해결합니다.
- 모바일에서 표는 가로 스크롤 컨테이너(`overflow-x:auto`)에 넣되, **스크롤이 생기는 표에는 첫 열을 `position: sticky`로 고정**합니다. 현재 코드는 42곳에서 `overflow-x-auto`만 쓰고 고정 열이 없어 스크롤 시 어떤 학생의 행인지 사라집니다.

### 5.5 폼 입력

- 라벨은 **항상 입력 위에** 둡니다. placeholder를 라벨로 쓰지 않습니다.
- 입력: 높이 40px, 패딩 `0 12px`, 테두리 `1px --border-strong`, 반경 `--radius-sm`, 배경 `--surface`.
- placeholder 색은 `--text-tertiary`. 그보다 옅게 두지 않습니다.
- 도움말은 입력 아래 `caption` `--text-secondary`. 오류는 같은 자리에 `--fn-error`로 교체하고, 입력 테두리를 `--fn-error-border`로 바꿉니다.
- 오류를 색으로만 알리지 않습니다. 반드시 문장이 함께 나타납니다.
- 필수 표시는 라벨 뒤 `*`가 아니라 선택 항목에 `(선택)`을 붙이는 방식으로 합니다.

### 5.6 모달

- 배경 가림막 `rgba(19, 30, 49, 0.48)`, 패널 `--surface-raised`, 반경 `--radius-lg`, 그림자 `--shadow-lg`, 최대 폭 560px.
- 헤더는 제목(`h2`) + 닫기 버튼. 헤더 배경을 칠하지 않습니다.
- 동작 버튼은 오른쪽 아래, 순서는 `보조 → 주`.
- 열릴 때 첫 포커스는 패널이나 첫 입력으로. `Esc`로 닫힙니다.

### 5.7 토스트

- 우측 하단, 폭 360px, `--surface-raised`, `1px --border`, `--shadow-md`.
- 상태는 왼쪽 `3px` 세로 규칙선으로만 표현합니다(`--fn-success` / `--fn-error` / `--fn-info`). 패널 전체를 상태색으로 칠하지 않습니다.
- 성공 3초, 오류는 자동으로 사라지지 않고 닫기 버튼을 둡니다.

---

## 6. 야간 모드

### 6.1 전략

`[data-theme="dark"]`를 문서 루트에 붙여 토큰만 교체합니다. 컴포넌트 CSS는 라이트와 완전히 동일하며, 다크 전용 클래스를 만들지 않습니다.

현재 프로젝트는 `tailwind.config.js`가 `darkMode: ['class']`, `client/src/index.css`가 `.dark` 선택자를 쓰고 있습니다. 마이그레이션 기간에는 두 선택자를 함께 지정합니다.

```css
[data-theme="dark"], .dark { /* 토큰 재정의 */ }
```

`prefers-color-scheme`으로 자동 전환하지 않습니다. 성적 화면은 상담 중 함께 보는 경우가 많아, 사용자가 명시적으로 고른 모드가 유지되어야 합니다.

### 6.2 다크 토큰

```css
[data-theme="dark"] {
  /* 표면 사다리: 캔버스가 가장 어둡고 위로 올라올수록 밝아진다 */
  --surface:          var(--navy-800);   /* 카드 */
  --surface-sunken:   var(--navy-950);   /* 캔버스 */
  --surface-raised:   var(--navy-700);   /* 모달, 팝오버 */
  --surface-inverse:  var(--navy-900);   /* 헤더, 사이드바 */
  --surface-subtle:   var(--navy-700);

  --text-primary:     #EEF2F8;
  --text-secondary:   var(--navy-200);
  --text-tertiary:    var(--navy-300);
  --text-on-inverse:  #EEF2F8;
  --text-on-inverse-muted: var(--navy-300);
  --text-accent:      var(--brass-400);

  --border:           var(--navy-600);
  --border-strong:    var(--navy-500);
  --border-subtle:    var(--navy-700);
  --border-inverse:   var(--navy-700);

  --action:           var(--navy-100);
  --action-hover:     #FFFFFF;
  --action-active:    var(--navy-200);
  --action-text:      var(--navy-900);
  --action-subtle:    var(--navy-700);
  --action-subtle-hover: var(--navy-600);
  --focus-ring:       var(--navy-300);

  --accent:           var(--brass-400);
  --accent-strong:    var(--brass-300);
  --accent-surface:   #2A2314;

  --fn-success:         #4FBF85;
  --fn-success-surface: #12301F;
  --fn-success-border:  #2C6E4A;
  --fn-warning:         #D9A441;
  --fn-warning-surface: #33270D;
  --fn-warning-border:  #7A5C1E;
  --fn-error:           #F0837C;
  --fn-error-surface:   #35191A;
  --fn-error-border:    #7E3B39;
  --fn-info:            #4FC2CF;
  --fn-info-surface:    #102E33;
  --fn-info-border:     #2A6068;

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.5);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.6);
}
```

**다크에서 뒤집히는 것:** 주 버튼은 밝은 면 + 어두운 글자가 됩니다(어두운 배경 위 어두운 버튼은 사라지므로). 라이트에서 헤더는 캔버스보다 어두웠지만, 다크에서는 표면 사다리를 따라 캔버스(`--navy-950`)보다 한 단계 밝은 `--navy-900`이 됩니다. 다크에서 헤더를 캔버스와 같은 값으로 두면 구조가 배경에 녹아 사라지므로, "더 어둡게"가 아니라 **"한 단계 위로"**가 규칙입니다.

**다크에서 유지되는 것:** 브라스는 여전히 화면당 2곳입니다. 어두운 배경에서 브라스가 더 잘 보이므로 늘리고 싶어지지만, 늘리면 이원화가 무너집니다.

### 6.3 적용 대상

| 화면 | 야간 모드 |
|---|---|
| 지점 대시보드, 전체관리자 대시보드 | **필수.** 야간 근무가 실제로 발생하는 화면 |
| 학생 대시보드 | 필수 |
| 로그인 | 필수 |
| 내부 업무 보고서 화면 (강사가 화면으로 보는 성취 보고서) | 필수. 기준 구현 `reference/work-report-mockup.html`이 이 경우 |
| 학부모 배포본 보고서 (인쇄/PDF로 내보내는 최종본) | **제공하지 않음.** 배포 산출물이므로 라이트 고정, 10.3절 인쇄 규칙이 지배 |

---

## 7. 반응형

### 7.1 브레이크포인트

```
sm   640px    큰 휴대폰 가로
md   768px    태블릿 세로 / 데스크톱 레이아웃 시작점
lg  1024px    노트북
xl  1280px    콘텐츠 최대 폭 도달
```

### 7.2 사이드바: 모바일에서 오버레이 드로어로 전환 (강제)

**현재 상태(결함).** 세 대시보드의 `<aside>`는 폭만 바꾸는 인라인 요소입니다.

- `client/src/pages/AdminDashboard.tsx:1334` : `sidebarOpen ? 'w-64' : 'w-20'`
- `client/src/pages/BranchDashboard.tsx:1895` : `sidebarOpen ? 'w-64' : 'w-20'`
- `client/src/pages/StudentDashboard.tsx:988` : `sidebarOpen ? 'w-72' : 'w-0'`

세 곳 모두 `md:` 계열 분기가 없습니다. 그 결과 375px 화면에서 사이드바가 문서 흐름 안에 남아 본문 폭을 264~288px 잠식하고, 본문은 90px 남짓한 칸에 갇혀 표와 카드가 무너집니다. 이것이 현재 앱의 모바일 붕괴 원인입니다.

**규정.**

| 뷰포트 | 사이드바 동작 |
|---|---|
| `>= 768px` | 문서 흐름 안 고정 기둥. 펼침 264px / 접힘 72px |
| `< 768px` | **흐름에서 완전히 제거하고 오버레이 드로어로 전환** |

`< 768px`에서 지켜야 할 것:

1. 사이드바는 `position: fixed; inset-block: 0; left: 0; width: 264px; z-index: 40`, 닫힌 상태는 `transform: translateX(-100%)`.
2. 본문은 사이드바 폭에 대한 `margin-left`를 갖지 않습니다. 항상 `width: 100%`.
3. 열릴 때 `rgba(19,30,49,0.48)` 가림막을 깔고, 가림막 클릭과 `Esc`로 닫힙니다.
4. 열린 동안 `body`에 스크롤 잠금.
5. 헤더 왼쪽에 메뉴 버튼(44x44px 이상)을 노출합니다.
6. 드로어 전환은 `transform` 200ms만. 폭(`width`) 애니메이션은 레이아웃을 재계산하므로 금지.

### 7.3 그 밖의 붕괴 규칙

- 통계 카드 4열 → `md` 2열 → `sm` 1열.
- 2단 패널(차트 + 분포) → `md` 미만 세로 스택.
- 표는 5.4절대로 가로 스크롤 + 첫 열 고정.
- 터치 타깃 최소 44x44px. 표 안 인라인 버튼도 예외 없습니다.
- 모바일에서 어떤 화면도 가로 스크롤이 생기면 안 됩니다(`document.documentElement.scrollWidth <= viewport`). 이것은 릴리스 게이트입니다.

---

## 8. 모션

강도는 3단계 중 낮은 쪽에 고정합니다. **성적 화면에서 움직임은 정보를 방해합니다.**

### 8.1 허용

| 대상 | 속성 | 시간 | 이징 |
|---|---|---|---|
| hover 상태 | `background-color`, `border-color`, `color` | 150ms | `ease-out` |
| active 눌림 | `transform: scale(0.98)` | 100ms | `ease-out` |
| 드로어/모달 열림 | `transform`, `opacity` | 200ms | `cubic-bezier(0.32, 0.72, 0, 1)` |
| 토스트 등장 | `transform`, `opacity` | 200ms | 동일 |

### 8.2 금지

- 자동 재생 애니메이션 전부(펄스, 시머, 무한 루프, 카운트업 숫자).
- 스크롤 연동 등장 애니메이션. 데이터는 즉시 읽혀야 합니다.
- `width`, `height`, `top`, `left` 애니메이션. `transform`과 `opacity`만.
- 200ms를 넘는 UI 전환.
- 차트 그리기 애니메이션. SVG는 완성된 상태로 렌더합니다.

### 8.3 감소 모션

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

자동 애니메이션이 애초에 없으므로 이 블록은 hover 전이만 제거합니다. 그래도 명시적으로 넣습니다.

---

## 9. 마이그레이션 매핑표

`client/src/pages/*.tsx` 실사용 클래스를 조사해 작성했습니다(백업 파일 `*.backup`, `*_old.tsx` 제외). 조사 시점 현황: 그라디언트 사용 `bg-gradient-to-*` **118곳**(로그인 4, 전체관리자 26, 지점 30, 학생 58), 원시 hex는 `#fff` 4곳뿐이고 나머지는 전부 Tailwind 팔레트 유틸리티입니다.

### 9.1 전역 우선 규칙

| 현재 | 대체 | 비고 |
|---|---|---|
| `bg-gradient-to-r`, `bg-gradient-to-br`, `bg-gradient-to-b` (118곳) | 단색 `bg-[var(--surface-inverse)]` 또는 `bg-[var(--surface)]` | 그라디언트 전면 폐지. `via-*` 중간 정지점은 그냥 삭제 |
| `bg-clip-text text-transparent` (로고 텍스트) | `text-[var(--text-primary)]` | 텍스트 그라디언트 폐지 |
| `rounded-2xl`, `rounded-3xl` | `rounded-[var(--radius-md)]` | 10px로 통일 |
| `shadow-xl`, `shadow-2xl` | `shadow-[var(--shadow-md)]` | 카드에는 `--shadow-sm` |
| `shadow-blue-500` (BranchDashboard) | `shadow-[var(--shadow-md)]` | 컬러 그림자 폐지 |
| `backdrop-blur-md` (헤더 3곳) | 제거, 불투명 `--surface-inverse` | 스크롤 중 GPU 재도색 비용 |
| 폰트 선언 없음 (`tailwind.config.js`에 `fontFamily` 미설정) | `body { font-family: var(--font-sans) }` | 3.1절 |

### 9.2 페이지 아이덴티티 색 통합

**LoginPage + AdminDashboard (현재 오렌지레드 계열)**

| 현재 | 대체 |
|---|---|
| `bg-gradient-to-br from-orange-400 via-red-500 to-pink-500` (로그인 배경, L34) | `bg-[var(--surface-sunken)]` |
| `bg-gradient-to-r from-orange-500 to-red-600` (주 버튼, 5곳) | `bg-[var(--action)] text-[var(--action-text)]` |
| `bg-gradient-to-br from-orange-500 to-red-600` (로고 타일, 5곳) | `bg-[var(--surface-inverse)]` |
| `hover:from-orange-600 hover:to-red-700` | `hover:bg-[var(--action-hover)]` |
| `from-orange-50 to-red-50` (옅은 면, 7곳) | `bg-[var(--surface-subtle)]` |
| `border-orange-100` (사이드바/헤더 경계, 4곳) | `border-[var(--border)]` |
| `border-orange-500`, `ring-orange-500` (입력 포커스, 각 3곳) | `outline-[var(--focus-ring)]` |
| `text-orange-600`, `text-orange-500` | `text-[var(--text-secondary)]` |
| `bg-white/80` (헤더 L1403) | `bg-[var(--surface-inverse)]` + 흰 글자 |

**BranchDashboard (현재 인디고블루 계열)**

| 현재 | 대체 |
|---|---|
| `bg-gradient-to-r from-blue-500 to-indigo-600` (주 버튼, 5곳) | `bg-[var(--action)]` |
| `bg-gradient-to-r from-blue-50 to-indigo-50` (패널 머리, 7곳) | `bg-[var(--surface-subtle)]` |
| `bg-gray-900` (사이드바 L1895) | `bg-[var(--surface-inverse)]` |
| `border-gray-800` (사이드바 경계) | `border-[var(--border-inverse)]` |
| `text-indigo-600`, `bg-indigo-50`, `border-indigo-300` | `--text-secondary` / `--surface-subtle` / `--border-strong` |
| `bg-gradient-to-r from-emerald-50 to-teal-50` | `bg-[var(--fn-success-surface)]` (실제 성공 의미일 때만) |
| `text-teal-600`, `ring-teal-300`, `bg-teal-50` | `--fn-info` 계열 |
| `border-blue-100` (헤더 L1964) | `border-[var(--border-inverse)]` |

**StudentDashboard (현재 퍼플 계열, 그라디언트 58곳으로 최다)**

| 현재 | 대체 |
|---|---|
| `bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800` (사이드바 L988) | `bg-[var(--surface-inverse)]` |
| `bg-gradient-to-r from-purple-600 via-purple-700 to-indigo-700` (히어로 패널, 2곳) | `bg-[var(--surface-inverse)]` |
| `bg-gradient-to-r from-purple-600 to-indigo-600` (주 버튼/패널 머리, 4곳) | `bg-[var(--action)]` |
| `bg-gradient-to-br from-purple-500 to-indigo-600` (아바타 타일, 4곳) | `bg-[var(--surface-inverse)]` |
| `bg-gradient-to-br from-red-500 to-pink-600` (통계 아이콘 타일, 3곳) | 타일 자체 삭제 (5.2절: 통계 카드에 아이콘 없음) |
| `bg-gradient-to-br from-green-400 to-emerald-500` (성취 원, 3곳) | `bg-[var(--fn-success-surface)]` + `text-[var(--fn-success)]` |
| `bg-gradient-to-r from-orange-500 to-amber-500` (최고 기록 강조, 2곳) | **`--accent` 계열.** 브라스 2곳 예산의 1곳 |
| `text-purple-600` (15곳), `text-purple-200` (13곳) | `--text-secondary` / `--text-on-inverse-muted` |
| `bg-purple-50`, `border-purple-100~500` | `--surface-subtle` / `--border` |
| `text-indigo-200` (등급 라벨 L1777) | `--text-on-inverse-muted` |

### 9.3 중립 회색 → 시맨틱 토큰

| 현재 | 대체 | 사용량 |
|---|---|---|
| `text-gray-900`, `text-gray-800` | `text-[var(--text-primary)]` | 61곳 |
| `text-gray-700` | `text-[var(--text-primary)]` | 155곳 (최다) |
| `text-gray-600`, `text-gray-500` | `text-[var(--text-secondary)]` | 82곳 |
| `text-gray-400`, `text-gray-300` | `text-[var(--text-tertiary)]` | 34곳 |
| `border-gray-100` | `border-[var(--border-subtle)]` | 30곳 |
| `border-gray-200`, `border-gray-300` | `border-[var(--border)]` | 27곳 |
| `bg-gray-50` | `bg-[var(--surface-sunken)]` | 18곳 |
| `bg-gray-100`, `bg-gray-200` | `bg-[var(--surface-subtle)]` | 10곳 |
| `bg-gray-900`, `bg-gray-800` | `bg-[var(--surface-inverse)]` | 3곳 |
| `divide-gray-200` | `divide-[var(--border-subtle)]` | 1곳 |

### 9.4 상태색 → 기능 계층

| 현재 | 대체 | 조건 |
|---|---|---|
| `text-green-600`, `text-green-700`, `text-emerald-600` | `text-[var(--fn-success)]` | 실제 성공/상승 의미일 때만 |
| `bg-green-50`, `bg-emerald-50`, `bg-green-100` | `bg-[var(--fn-success-surface)]` | |
| `border-green-200`, `border-green-300`, `border-green-400` | `border-[var(--fn-success-border)]` | |
| `text-red-600`, `text-red-700`, `text-red-500` | `text-[var(--fn-error)]` | 시스템 오류/삭제만. 낮은 등급에는 금지(2.4절) |
| `bg-red-50`, `bg-red-100` | `bg-[var(--fn-error-surface)]` | |
| `bg-red-500`, `bg-red-600` (지점 대시보드 실면) | `bg-[var(--surface)]` + `text-[var(--fn-error)]` + `border-[var(--fn-error-border)]` | 5.1절 위험 버튼 |
| `text-yellow-700/800`, `bg-yellow-50/100`, `border-yellow-200` | `--fn-warning` 계열 | |
| `text-blue-600`, `bg-blue-50`, `border-blue-200/300` | 구조면 `--surface-subtle`, 정보면 `--fn-info` 계열 | **사용처를 하나씩 판별해야 함.** 현재 파랑이 구조와 정보 양쪽에 섞여 있음 |
| `text-orange-700`, `bg-orange-100` (학생 화면 상태 표시) | `--fn-warning` 계열 | |

### 9.5 구조적 결손 (색 치환이 아닌 신규 작업)

| 항목 | 현재 | 조치 |
|---|---|---|
| 등급 뱃지 | 헬퍼 함수 없음. `StudentDashboard.tsx:1778`에서 `{grade}등급`을 `text-2xl font-bold` 평문으로 출력 | 2.4절 매핑을 구현한 `<GradeBadge grade={n} />` 신설 |
| 사이드바 모바일 | `md:` 분기 없음 (3개 파일) | 7.2절 드로어로 교체 |
| 표 첫 열 고정 | `overflow-x-auto` 42곳, sticky 열 0곳 | 5.4절 적용 |
| 폰트 | 선언 없음 | 3.1절 스택을 `index.css`에 지정 |
| 다크 토큰 | `index.css`에 shadcn 기본값(`--primary: 210 100% 50%`)만 있고 화면이 참조하지 않음 | 2장, 6.2절 토큰으로 교체 |
| 숫자 정렬 | `tabular-nums` 미적용 | 3.3절 전역 적용 |
| `#fff` 리터럴 4곳 | 하드코딩 | `var(--surface)` 또는 `var(--text-on-inverse)` |

**권장 순서:** 9.1 전역 규칙 → 9.3 중립 회색(기계적 치환, 위험 낮음) → 9.2 페이지별 아이덴티티 → 9.4 상태색(판별 필요) → 9.5 구조 작업.

---

## 10. 보고서 지면 문법

학부모에게 전달되는 성취 보고서 화면 전용 규칙입니다. 앱 UI가 아니라 **문서**로 취급합니다.

### 10.1 톤

- 대시보드가 "조작하는 화면"이라면 보고서 지면은 "읽는 지면"입니다. 버튼, 탭, 드롭다운을 최소화하고 인쇄 버튼 정도만 둡니다.
- 강사가 화면으로 보는 업무 보고서는 야간 모드를 지원하고, 학부모에게 나가는 배포본은 인쇄 규칙(10.3절)이 지배합니다. 인쇄 시점에는 토큰이 잉크/종이 값으로 교체되므로 다크로 보던 화면을 그대로 인쇄해도 흰 지면이 나옵니다.
- 본문 폭 `62ch`, 지면 최대 폭 `840px`, 좌우 여백 최소 40px.
- 제목은 `display`, 섹션은 `h2`. 화면 제목보다 한 단계 크게 잡아 문서의 격을 만듭니다.
- 문장체를 씁니다. "89점"이 아니라 "재응시에서 89점을 받아 29점 올랐습니다."

### 10.2 지면 요소

| 요소 | 규칙 |
|---|---|
| 머리글 | `--surface-inverse` 네이비 띠. 학생명, 소속, 기준일. 높이 최소 96px |
| 요약 수치 | 통계 카드 4개. 5.2절 따름 |
| 추이 그래프 | 인라인 SVG. 색은 `--text-primary` 선 + `--accent` 강조점 |
| 표 | 5.4절 따름. 지면에서는 머리 배경을 `--surface-subtle`로 유지 |
| 뱃지 | 등급만. 2.4절 매핑 |
| 강조 | 브라스 지면당 2곳 (최고 기록 1곳 + 핵심 수치 1곳) |
| 맺음 | 학원명과 지점, 발행일. 서명란은 두지 않습니다 |

### 10.3 인쇄 규칙 (@media print)

```css
@media print {
  @page { size: A4; margin: 16mm; }

  html, body { background: #FFFFFF; }
  nav, .no-print, button { display: none; }

  /* 잉크 절약: 네이비 면은 흰 바탕 + 굵은 규칙선으로 대체 */
  .report-header {
    background: #FFFFFF;
    color: #000000;
    border-bottom: 2px solid #000000;
  }

  /* 카드 그림자 제거, 테두리는 유지 */
  .card { box-shadow: none; border: 1px solid #999999; }

  /* 조각나면 안 되는 것 */
  table, figure, .stat-card { break-inside: avoid; }
  h2 { break-after: avoid; }

  /* 링크 URL을 지면에 노출하지 않음 */
  a[href]::after { content: none; }
}
```

추가 규칙:

- 인쇄 시 브라스 강조는 **색이 아니라 굵기와 규칙선으로 대체**합니다. 흑백 프린터에서 브라스는 중간 회색이 되어 강조로 읽히지 않습니다.
- 배경색 인쇄(`print-color-adjust: exact`)를 강제하지 않습니다. 기본 설정 프린터에서도 읽히는 지면이어야 합니다.
- 그래프는 선과 라벨만으로 값을 읽을 수 있어야 합니다. 색으로만 구분되는 계열을 만들지 않습니다.
- 2페이지를 넘기지 않는 것을 기본 목표로 합니다.

---

## 부록. 화면 체크리스트

새 화면을 내보내기 전에 전부 확인합니다.

- [ ] 브라스가 정확히 2곳 이하인가
- [ ] 그라디언트가 0곳인가
- [ ] 색이 전부 토큰 참조인가 (hex는 `:root`와 `[data-theme="dark"]`에만)
- [ ] 등급 표시에 `--fn-error`를 쓰지 않았는가
- [ ] 숫자에 tabular-nums가 걸려 있는가
- [ ] 375px에서 가로 스크롤이 없는가
- [ ] 375px에서 사이드바가 오버레이 드로어인가
- [ ] 표에 가로 스크롤이 생긴다면 첫 열이 고정인가
- [ ] 라이트/다크 양쪽에서 열어 보았는가
- [ ] 자동 애니메이션이 0개인가
- [ ] 터치 타깃이 44px 이상인가
- [ ] 오류를 색이 아니라 문장으로도 알리는가
- [ ] em-dash와 이모지가 0개인가
