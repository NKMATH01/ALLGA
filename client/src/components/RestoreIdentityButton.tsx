import { useMutation } from '@tanstack/react-query';
import { Undo2 } from 'lucide-react';
import { api } from '../lib/api';
import { Button } from './ui/button';

/*
  impersonation 복귀 버튼.

  지점장이 학생·학부모 화면으로 전환하면 세션 역할이 바뀌어 원래 화면으로 돌아갈
  길이 없었다(과거 P-4: 재로그인해야 했다). 서버가 originalUser 를 보존하므로
  /auth/me 가 그것을 내려주면 이 버튼을 띄운다. 전환 중이 아니면 아무것도 그리지 않는다.

  복귀는 세션 자체를 갈아끼우므로 캐시 무효화보다 전체 리로드가 안전하다
  (열려 있던 학생용 쿼리 결과가 지점장 화면으로 새지 않는다).

  색: 무채색 아웃라인(DESIGN.md 5.1). 그린 강조는 주 동작에만 쓴다.
*/
export function RestoreIdentityButton({
  originalUser,
  className,
}: {
  originalUser?: { name?: string } | null;
  className?: string;
}) {
  const restoreMutation = useMutation({
    mutationFn: async () => {
      await api.post('/auth/impersonate/restore');
    },
    onSuccess: () => {
      window.location.reload();
    },
  });

  if (!originalUser) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      disabled={restoreMutation.isPending}
      onClick={() => restoreMutation.mutate()}
    >
      <Undo2 className="mr-2 h-4 w-4 flex-shrink-0" strokeWidth={1.5} />
      <span className="truncate">원래 계정으로 돌아가기</span>
    </Button>
  );
}

export default RestoreIdentityButton;
