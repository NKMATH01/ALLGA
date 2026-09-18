import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Link } from 'wouter';
import { fetchReportSummary } from '../lib/reportClient';
import { ReportReadingView } from '../components/ReportReadingView';
import { ThemeToggle } from '../components/ui/theme-toggle';

export default function WebReportPage({ reportId }: { reportId: string }) {
  const report = useQuery({ queryKey: ['web-report', reportId], queryFn: () => fetchReportSummary(reportId), retry: false });
  return <div className="min-h-[100dvh] bg-surface text-ink">
    <header className="sticky top-0 z-20 border-b border-line bg-surface">
      <div className="mx-auto flex min-h-16 max-w-5xl items-center justify-between gap-2 px-4 sm:px-8">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-medium"><ArrowLeft className="h-4 w-4" />성적 화면</Link>
        <div className="flex items-center gap-1"><ThemeToggle />{report.data && <a href={`/api/reports/${encodeURIComponent(reportId)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium hover:bg-surface-subtle">인쇄용 전체<ExternalLink className="h-4 w-4" /></a>}</div>
      </div>
    </header>
    {report.isLoading ? <p role="status" className="px-5 py-20 text-center text-ink-secondary">학습 보고서를 불러오는 중입니다.</p> : report.isError ? <div role="alert" className="mx-auto max-w-lg px-5 py-20"><h1 className="text-2xl font-semibold">보고서를 열 수 없습니다</h1><p className="mt-4 leading-7 text-ink-secondary">보고서가 아직 준비되지 않았거나 이 계정에서 볼 수 없는 보고서입니다. 연결 상태와 로그인 계정을 확인해 주세요.</p><button onClick={() => report.refetch()} className="mt-6 min-h-11 rounded-lg bg-action px-5 text-action-text">다시 시도</button></div> : report.data && <>
      <nav aria-label="보고서 목차" className="mx-auto flex max-w-4xl flex-wrap gap-2 px-5 pt-6 sm:px-10">
        {[['report-overview', '핵심 분석'], ['report-areas', '영역별 결과'], ['report-next', '학습 제안']].map(([id, label]) => <a key={id} href={`#${id}`} className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm text-ink-secondary hover:bg-surface-subtle">{label}</a>)}
      </nav><ReportReadingView summary={report.data} />
    </>}
  </div>;
}
