import { useState, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { 
  useGetChannel,
  useListChannelFiles,
  useGetChannelFileStats,
  useSyncChannelFiles,
  useCreateDownload,
  getListChannelFilesQueryKey,
  getGetChannelFileStatsQueryKey,
  getListDownloadsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { formatBytes, formatRelativeDate, formatAbsoluteDate } from "@/lib/format";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { 
  Search, 
  RefreshCw, 
  Download, 
  File, 
  ChevronLeft,
  Loader2,
  FileArchive,
  Image as ImageIcon,
  Video,
  Music,
  FileText,
  AlertCircle
} from "lucide-react";

function getFileIcon(mimeType: string, extension: string) {
  if (mimeType.startsWith('image/')) return <ImageIcon className="h-4 w-4 text-blue-500" />;
  if (mimeType.startsWith('video/')) return <Video className="h-4 w-4 text-purple-500" />;
  if (mimeType.startsWith('audio/')) return <Music className="h-4 w-4 text-yellow-500" />;
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension.toLowerCase())) return <FileArchive className="h-4 w-4 text-red-500" />;
  if (['pdf', 'doc', 'docx', 'txt'].includes(extension.toLowerCase())) return <FileText className="h-4 w-4 text-green-500" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

export default function ChannelFilesPage() {
  const [, params] = useRoute("/channels/:channelId");
  const channelId = params?.channelId ? parseInt(params.channelId, 10) : 0;

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [extension, setExtension] = useState<string>("all");
  const [sort, setSort] = useState<string>("date");
  const [order, setOrder] = useState<string>("desc");
  const [page, setPage] = useState(1);
  const [selectedFiles, setSelectedFiles] = useState<Set<number>>(new Set());
  const [isSyncing, setIsSyncing] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset selection when filters change
  useEffect(() => {
    setSelectedFiles(new Set());
    setPage(1);
  }, [debouncedSearch, extension, sort, order]);

  const queryParams = {
    search: debouncedSearch || undefined,
    extension: extension !== "all" ? extension : undefined,
    sort,
    order,
    page,
    page_size: 50
  };

  const refetchInterval = isSyncing ? 3000 : false;

  const { data: channel } = useGetChannel(channelId);
  const { data: stats } = useGetChannelFileStats(channelId, { query: { refetchInterval } });
  const { data: filesData, isLoading } = useListChannelFiles(channelId, queryParams, { query: { refetchInterval } });
  
  const syncFiles = useSyncChannelFiles();
  const createDownload = useCreateDownload();

  const handleSync = () => {
    setIsSyncing(true);
    syncFiles.mutate({ channelId }, {
      onSuccess: () => {
        toast({
          title: "File sync started",
          description: "Scanning channel for files. This may take a while for large channels.",
        });
      },
      onError: (err: any) => {
        setIsSyncing(false);
        toast({
          title: "Sync failed",
          description: err?.message || "Failed to start sync",
          variant: "destructive"
        });
      }
    });
  };

  useEffect(() => {
    if (isSyncing && stats?.synced) {
      const timer = setTimeout(() => setIsSyncing(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [stats, isSyncing]);

  const handleSelectAll = (checked: boolean) => {
    if (!filesData) return;
    if (checked) {
      setSelectedFiles(new Set(filesData.files.map(f => f.message_id)));
    } else {
      setSelectedFiles(new Set());
    }
  };

  const handleSelectOne = (messageId: number, checked: boolean) => {
    const newSet = new Set(selectedFiles);
    if (checked) {
      newSet.add(messageId);
    } else {
      newSet.delete(messageId);
    }
    setSelectedFiles(newSet);
  };

  const handleDownload = (all: boolean) => {
    const reqData = {
      channel_id: channelId,
      message_ids: all ? null : Array.from(selectedFiles),
      archive_name: `${channel?.title || 'channel'}_files.zip`
    };

    createDownload.mutate({ data: reqData }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDownloadsQueryKey() });
        setSelectedFiles(new Set());
        toast({
          title: "Download started",
          description: "Check the downloads panel to see progress.",
        });
      },
      onError: (err: any) => {
        toast({
          title: "Download failed",
          description: err?.message || "Failed to start download",
          variant: "destructive"
        });
      }
    });
  };

  const allSelected = filesData?.files.length > 0 && filesData.files.every(f => selectedFiles.has(f.message_id));
  const someSelected = selectedFiles.size > 0 && !allSelected;

  if (!channelId) {
    return <div className="p-8 text-center text-muted-foreground">Invalid channel ID</div>;
  }

  return (
    <div className="flex flex-col h-full bg-background relative">
      <div className="border-b border-border bg-card px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/channels" className="text-muted-foreground hover:text-foreground transition-colors p-1.5 -ml-1.5 rounded-md hover:bg-accent">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-card-foreground">
                {channel?.title || <Skeleton className="h-8 w-48" />}
              </h1>
              {channel && (
                <Badge variant="outline" className="text-xs font-normal">
                  {channel.type}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
              <span>{stats?.total_files.toLocaleString() || 0} files indexed</span>
              <span>•</span>
              <span>{formatBytes(stats?.total_size || 0)} total</span>
              {stats?.last_sync && (
                <>
                  <span>•</span>
                  <span>Synced {formatRelativeDate(stats.last_sync)}</span>
                </>
              )}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={handleSync} disabled={isSyncing} data-testid="button-sync-files">
            {isSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {isSyncing ? "Syncing..." : "Resync Files"}
          </Button>
          
          <div className="h-8 w-px bg-border mx-1 hidden md:block"></div>
          
          <Button 
            variant="secondary" 
            disabled={selectedFiles.size === 0} 
            onClick={() => handleDownload(false)}
            className="relative"
            data-testid="button-download-selected"
          >
            <Download className="mr-2 h-4 w-4" />
            Download Selected
            {selectedFiles.size > 0 && (
              <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-[10px] font-bold h-5 min-w-[20px] px-1 rounded-full flex items-center justify-center border-2 border-card shadow-sm">
                {selectedFiles.size}
              </span>
            )}
          </Button>
          
          <Button onClick={() => handleDownload(true)} disabled={stats?.total_files === 0} data-testid="button-download-all">
            <FileArchive className="mr-2 h-4 w-4" />
            Download All
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col p-6">
        <div className="bg-card border border-border rounded-lg shadow-sm flex flex-col h-full">
          <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-3 bg-muted/20">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search filenames..." 
                className="pl-9 bg-background" 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-search-files"
              />
            </div>
            <div className="flex gap-2">
              <Select value={extension} onValueChange={setExtension}>
                <SelectTrigger className="w-[140px] bg-background">
                  <SelectValue placeholder="All Extensions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Files</SelectItem>
                  {Object.entries(stats?.file_types || {}).map(([ext, count]) => (
                    <SelectItem key={ext} value={ext}>
                      .{ext.toUpperCase()} ({count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={`${sort}-${order}`} onValueChange={(val) => {
                const [s, o] = val.split('-');
                setSort(s);
                setOrder(o);
              }}>
                <SelectTrigger className="w-[160px] bg-background">
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date-desc">Newest First</SelectItem>
                  <SelectItem value="date-asc">Oldest First</SelectItem>
                  <SelectItem value="size-desc">Largest Size</SelectItem>
                  <SelectItem value="size-asc">Smallest Size</SelectItem>
                  <SelectItem value="filename-asc">Name (A-Z)</SelectItem>
                  <SelectItem value="filename-desc">Name (Z-A)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10 shadow-sm outline outline-1 outline-border">
                <TableRow>
                  <TableHead className="w-[40px] px-4">
                    <Checkbox 
                      checked={allSelected ? true : someSelected ? "indeterminate" : false}
                      onCheckedChange={handleSelectAll}
                      aria-label="Select all"
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                  <TableHead>Filename</TableHead>
                  <TableHead className="w-[100px]">Type</TableHead>
                  <TableHead className="text-right w-[120px]">Size</TableHead>
                  <TableHead className="text-right w-[150px]">Date Added</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell className="px-4"><Skeleton className="h-4 w-4" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-64" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : filesData?.files.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-64 text-center">
                      <div className="flex flex-col items-center justify-center">
                        {search || extension !== "all" ? (
                          <>
                            <Search className="h-12 w-12 text-muted-foreground opacity-20 mb-4" />
                            <h3 className="text-lg font-medium">No files match your search</h3>
                            <p className="text-sm text-muted-foreground max-w-md mt-1">
                              Try clearing your filters or searching for something else.
                            </p>
                            <Button 
                              variant="outline" 
                              className="mt-4" 
                              onClick={() => { setSearch(""); setExtension("all"); }}
                            >
                              Clear Filters
                            </Button>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="h-12 w-12 text-muted-foreground opacity-20 mb-4" />
                            <h3 className="text-lg font-medium">No files indexed</h3>
                            <p className="text-sm text-muted-foreground max-w-md mt-1">
                              {stats?.synced 
                                ? "This channel doesn't appear to have any files." 
                                : "We haven't indexed this channel yet. Click Resync to fetch files."}
                            </p>
                            {!stats?.synced && (
                              <Button onClick={handleSync} disabled={isSyncing} className="mt-4">
                                {isSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                Sync Files Now
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filesData?.files.map((file) => (
                    <TableRow 
                      key={file.message_id} 
                      className={`hover:bg-muted/50 transition-colors ${selectedFiles.has(file.message_id) ? 'bg-primary/5' : ''}`}
                    >
                      <TableCell className="px-4">
                        <Checkbox 
                          checked={selectedFiles.has(file.message_id)}
                          onCheckedChange={(checked) => handleSelectOne(file.message_id, !!checked)}
                          aria-label={`Select ${file.filename}`}
                          data-testid={`checkbox-file-${file.message_id}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium max-w-0">
                        <div className="flex items-center gap-3 truncate">
                          <div className="h-8 w-8 rounded bg-muted flex items-center justify-center shrink-0">
                            {getFileIcon(file.mime_type, file.extension)}
                          </div>
                          <span className="truncate" title={file.filename}>
                            {file.filename}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="uppercase text-[10px] font-bold">
                          {file.extension || '?'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground whitespace-nowrap">
                        {formatBytes(file.size)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground whitespace-nowrap">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help border-b border-dashed border-muted-foreground/30">
                              {formatRelativeDate(file.date)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {formatAbsoluteDate(file.date)}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          
          {/* Pagination Controls */}
          {filesData && filesData.total > filesData.page_size && (
            <div className="p-3 border-t border-border flex items-center justify-between bg-muted/20">
              <span className="text-xs text-muted-foreground">
                Showing {((page - 1) * filesData.page_size) + 1} to {Math.min(page * filesData.page_size, filesData.total)} of {filesData.total.toLocaleString()} files
              </span>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setPage(p => p + 1)}
                  disabled={page * filesData.page_size >= filesData.total}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
