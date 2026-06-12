import { useState, useEffect } from "react";
import { useListDownloads, useCancelDownload, getListDownloadsQueryKey } from "@workspace/api-client-react";
import { Download, X, Play, AlertCircle, CheckCircle2, Loader2, ArrowDownToLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatBytes, formatRelativeDate } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";

export function DownloadsPanel({ triggerClassName }: { triggerClassName?: string }) {
  const [open, setOpen] = useState(false);
  const { data: downloads } = useListDownloads({ query: { enabled: open, refetchInterval: 1500 } });
  const cancelDownload = useCancelDownload();
  const queryClient = useQueryClient();

  const handleCancel = (jobId: string) => {
    cancelDownload.mutate({ jobId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDownloadsQueryKey() });
      }
    });
  };

  const activeDownloads = downloads?.filter(d => d.status === 'pending' || d.status === 'running') || [];
  const activeCount = activeDownloads.length;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" className={triggerClassName} data-testid="button-open-downloads">
          <div className="relative flex items-center justify-center">
            <ArrowDownToLine className="h-4 w-4" />
            {activeCount > 0 && (
              <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-primary flex items-center justify-center text-[8px] font-bold text-primary-foreground">
                {activeCount}
              </span>
            )}
          </div>
          <span>Downloads</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md flex flex-col p-0 border-l border-border">
        <SheetHeader className="p-4 border-b border-border bg-muted/30">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <ArrowDownToLine className="h-5 w-5 text-primary" />
            Downloads
          </SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1 p-4">
          <div className="flex flex-col gap-4">
            {(!downloads || downloads.length === 0) ? (
              <div className="text-center py-12 text-muted-foreground flex flex-col items-center">
                <Download className="h-12 w-12 mb-4 opacity-20" />
                <p className="text-sm font-medium">No downloads yet</p>
                <p className="text-xs mt-1">Files you download will appear here.</p>
              </div>
            ) : (
              downloads.map((job) => (
                <div key={job.job_id} className="border border-border rounded-lg p-3 bg-card shadow-sm flex flex-col gap-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0 pr-4">
                      <h4 className="text-sm font-medium truncate" title={job.job_id}>
                        Channel {job.channel_id} Archive
                      </h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatRelativeDate(job.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {job.status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                      {job.status === 'pending' && <Loader2 className="h-4 w-4 text-muted-foreground" />}
                      {job.status === 'completed' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                      {job.status === 'failed' && <AlertCircle className="h-4 w-4 text-destructive" />}
                      {job.status === 'cancelled' && <X className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>

                  {job.status === 'running' && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs font-medium">
                        <span>{formatBytes(job.downloaded_size)} / {formatBytes(job.total_size)}</span>
                        <span>{job.total_size > 0 ? Math.round((job.downloaded_size / job.total_size) * 100) : 0}%</span>
                      </div>
                      <Progress value={job.total_size > 0 ? (job.downloaded_size / job.total_size) * 100 : 0} className="h-1.5" />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{job.downloaded_files} / {job.total_files} files</span>
                        {job.failed_files > 0 && <span className="text-destructive">{job.failed_files} failed</span>}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 mt-1">
                    {(job.status === 'pending' || job.status === 'running') && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleCancel(job.job_id)}>
                        Cancel
                      </Button>
                    )}
                    {job.status === 'completed' && job.download_url && (
                      <Button size="sm" className="h-7 text-xs" asChild>
                        <a href={job.download_url} target="_blank" rel="noopener noreferrer" download>
                          <Download className="h-3 w-3 mr-1.5" />
                          Download Zip
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
