import { useEffect, useRef } from 'react';
import { FolderOpen, ScrollText } from 'lucide-react';
import { cn } from '@/kit/cn';
import { Button, EmptyState, PageHeader } from '@/kit/ui';
import { useApp } from '@/lib/useApp';
import { clock, levelLabel, levelTone } from '@/components/common';

export function LogPage() {
  const { log, call } = useApp();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [log.length]);
  return (
    <>
      <PageHeader title="Nhật ký" description="Từng bước tool đã làm trên OneMES" icon={<ScrollText />} actions={<Button variant="outline" size="sm" onClick={() => call('log:open')}><FolderOpen /> Thư mục</Button>} />
      <div className="scroll-thin min-h-0 flex-1 overflow-auto px-4 pb-4 sm:px-5" data-list="log">
        {!log.length ? (
          <EmptyState icon={<ScrollText />} title="Chưa có gì" text="Khi tool chạy, mọi thao tác sẽ được ghi ở đây." />
        ) : (
          <div className="space-y-1">
            {log.map((e, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-muted/40">
                <span className="w-[58px] shrink-0 pt-px text-[11px] tabular-nums text-muted-foreground">{clock(e.at)}</span>
                <span className={cn('shrink-0 rounded px-1.5 py-px text-[10px] font-bold', levelTone(e.level))}>{levelLabel[e.level]}</span>
                <span className="min-w-0 break-words">{e.msg}</span>
              </div>
            ))}
            <div ref={end} />
          </div>
        )}
      </div>
    </>
  );
}
