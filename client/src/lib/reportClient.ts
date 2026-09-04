import { api } from './api';

/*
  보고서 생성은 서버에서 큐로 처리된다(동시 2건, attempt 단위 잠금).
  POST /reports/generate/:attemptId 는 즉시 202 + { status } 로 돌아오므로
  클라이언트는 완료될 때까지 폴링해야 한다.

  세 화면(학생 AIReportButton, 학부모 대시보드, 지점 대시보드)이 같은 흐름을
  쓰므로 여기 한 곳에 둔다.
*/

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 90000;

export interface ReportRef {
  reportId: string;
  htmlContent?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 서버가 생성 실패로 표시한 보고서. 네트워크 오류와 구분하기 위해 따로 둔다. */
export class ReportGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportGenerationError';
  }
}

/**
 * 응답의 status 로 폴링을 어떻게 이어갈지 정한다. 네트워크와 무관한 순수 함수다.
 *   ready   : 보고서를 열 수 있다
 *   waiting : 아직 생성 중이므로 폴링을 계속한다
 *   failed  : 서버가 실패로 표시했다. 폴링 타임아웃까지 끌지 않고 즉시 알린다
 * status 가 없는 구버전 응답은 행 존재 여부로만 판단하던 예전 규칙을 따른다.
 */
export function resolveReportPollState(
  status: unknown,
  hasReportRow: boolean
): 'ready' | 'waiting' | 'failed' {
  if (status === 'completed') return 'ready';
  if (status === 'failed') return 'failed';
  if (status === 'processing') return 'waiting';
  return hasReportRow ? 'ready' : 'waiting';
}

/**
 * 이미 생성된 보고서를 찾는다. 아직 생성 중이면 null(폴링 계속),
 * 실패했으면 서버가 남긴 사유로 즉시 던진다(폴링 타임아웃으로 끌지 않는다, R-2).
 */
async function findExisting(attemptId: string): Promise<ReportRef | null> {
  try {
    const res = await api.get(`/reports/attempt/${attemptId}`);
    const report = res.data?.data;
    if (!report) return null;

    const state = resolveReportPollState(report.status, Boolean(report.id));
    if (state === 'failed') {
      throw new ReportGenerationError(
        report.failureReason || '보고서 생성에 실패했습니다. 다시 시도해주세요.'
      );
    }
    if (state === 'waiting') return null;

    return { reportId: report.id, htmlContent: report.htmlContent };
  } catch (error: any) {
    if (error instanceof ReportGenerationError) throw error;
    if (error.response?.status === 404) return null;
    throw error;
  }
}

/**
 * 보고서를 확보한다. 없으면 생성을 요청하고 완료될 때까지 폴링한다.
 * onProgress 로 진행 상태를 알려 버튼 문구를 바꿀 수 있게 한다.
 */
export async function ensureReport(
  attemptId: string,
  onProgress?: (stage: 'checking' | 'generating' | 'done') => void
): Promise<ReportRef> {
  onProgress?.('checking');

  const existing = await findExisting(attemptId);
  if (existing) {
    onProgress?.('done');
    return existing;
  }

  // 큐에 적재. 이미 진행 중이면 서버가 같은 작업을 가리키므로 중복 호출이 아니다.
  await api.post(`/reports/generate/${attemptId}`);
  onProgress?.('generating');

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const found = await findExisting(attemptId);
    if (found) {
      onProgress?.('done');
      return found;
    }
  }

  throw new Error('보고서 생성이 예상보다 오래 걸리고 있습니다. 잠시 후 다시 시도해주세요.');
}

/*
  브라우저는 사용자 제스처가 살아 있는 동안의 window.open 만 허용한다.
  ensureReport 를 await 한 뒤에 열면 제스처와 분리돼 새 탭이 조용히 차단된다
  (학부모 데스크톱에서 재현됨). 그래서 클릭 핸들러의 동기 구간에서 이 함수로
  빈 창을 먼저 잡아 두고, 내용은 나중에 주입한다.
*/
export function openReportWindowSync(): Window | null {
  const win = window.open('', '_blank');
  if (win) {
    // 색·스타일은 넣지 않는다. 보고서 HTML 이 곧 이 문서를 통째로 덮어쓴다.
    win.document.write('보고서를 준비하는 중…');
  }
  return win;
}

/**
 * 데스크톱: 전체 보고서 HTML 을 새 창으로 연다.
 * `win` 을 받으면 클릭 시점에 미리 열어 둔 그 창을 쓴다(팝업 차단 회피).
 * 없으면 예전처럼 여기서 열되, 차단되면 그대로 에러를 던진다.
 */
export async function openFullReport(ref: ReportRef, win?: Window | null): Promise<void> {
  let html = ref.htmlContent;

  if (!html) {
    const res = await api.get(`/reports/attempt/${ref.reportId}`);
    html = res.data?.data?.htmlContent;
  }

  const target = win ?? window.open('', '_blank');
  if (!target) {
    throw new Error('팝업이 차단되어 보고서를 열 수 없습니다. 브라우저의 팝업 차단을 해제해주세요.');
  }

  if (html) {
    // 미리 열어 둔 창에는 대기 문구가 들어 있으므로 open() 으로 문서를 비우고 다시 쓴다.
    target.document.open();
    target.document.write(html);
    target.document.close();
  } else {
    // htmlContent 를 손에 들고 있지 않으면 서버가 직접 서빙하는 주소로 보낸다
    target.location.href = `/api/reports/${ref.reportId}`;
  }
}

export interface ReportSummary {
  reportId: string;
  attemptId: string;
  generatedAt: string;
  verdict: {
    grade: number | null;
    rawScore: number | null;
    rawScoreMax: number | null;
    percentile: number | null;
    studentName: string | null;
    examDate: string | null;
    overallReference: { available: boolean; low: number | null; high: number | null; mid: number | null } | null;
  };
  abnormal: Array<{
    name: string;
    kind: 'category' | 'difficulty';
    studentRate: number;
    low: number;
    high: number;
    direction: 'below' | 'above';
  }>;
  keyFinding: string | null;
  recommendations: Array<{ title: string; detail: string | null }>;
}

export async function fetchReportSummary(reportId: string): Promise<ReportSummary> {
  const res = await api.get(`/reports/${reportId}/summary`);
  return res.data.data as ReportSummary;
}

/** 모바일 여부. 뷰포트 768 미만이면 요약 뷰를 먼저 보여준다. */
export function prefersSummaryView(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < 768;
}
