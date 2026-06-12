import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { 
  useListChannels, 
  useGetChannelStats, 
  useSyncChannels,
  useAddChannel,
  getListChannelsQueryKey,
  getGetChannelStatsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { formatBytes, formatRelativeDate, formatAbsoluteDate } from "@/lib/format";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

import { 
  Search, 
  RefreshCw, 
  Folder, 
  FileText, 
  HardDrive,
  Database,
  Loader2,
  ChevronRight,
  Plus,
  Link as LinkIcon
} from "lucide-react";

export default function ChannelsPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [type, setType] = useState<string>("all");
  const [sort, setSort] = useState<string>("title");
  const [order, setOrder] = useState<string>("asc");
  const [isSyncing, setIsSyncing] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [channelLink, setChannelLink] = useState("");

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // If syncing, poll aggressively
  const refetchInterval = isSyncing ? 3000 : false;

  const queryParams = {
    search: debouncedSearch || undefined,
    type: type !== "all" ? type : undefined,
    sort,
    order,
    page_size: 100
  };

  const { data: channelsData, isLoading } = useListChannels(queryParams, { query: { refetchInterval } });
  const { data: stats } = useGetChannelStats({ query: { refetchInterval } });
  const syncChannels = useSyncChannels();
  const addChannel = useAddChannel();

  const handleAddChannel = () => {
    if (!channelLink.trim()) return;
    addChannel.mutate(
      { data: { link: channelLink.trim() } },
      {
        onSuccess: (channel) => {
          toast({
            title: "Channel added",
            description: `"${channel.title}" has been added to your list.`,
          });
          queryClient.invalidateQueries({ queryKey: getListChannelsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetChannelStatsQueryKey() });
          setChannelLink("");
          setAddDialogOpen(false);
          setLocation(`/channels/${channel.id}`);
        },
        onError: (err: any) => {
          toast({
            title: "Failed to add channel",
            description: err?.data?.detail || err?.message || "Could not find or access that channel.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleSync = () => {
    setIsSyncing(true);
    syncChannels.mutate(undefined, {
      onSuccess: () => {
        toast({
          title: "Sync started",
          description: "Fetching your channels from Telegram. This may take a minute.",
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

  // Stop polling if we see channels or a recent sync time change
  useEffect(() => {
    if (isSyncing && channelsData?.channels && channelsData.channels.length > 0) {
      // Assuming a completed sync adds channels or updates last_sync
      // In a real app we might need a dedicated status endpoint, but we'll use a timeout or data presence here
      const timer = setTimeout(() => setIsSyncing(false), 10000);
      return () => clearTimeout(timer);
    }
  }, [channelsData, isSyncing]);

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="border-b border-border bg-card px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-card-foreground">Channels & Groups</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse and manage files across your Telegram chats
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setAddDialogOpen(true)}
            data-testid="button-add-channel"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Channel
          </Button>
          <Button onClick={handleSync} disabled={isSyncing} data-testid="button-sync-channels" variant={channelsData?.channels.length === 0 ? "default" : "outline"}>
            {isSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {isSyncing ? "Syncing..." : "Sync from Telegram"}
          </Button>
        </div>
      </div>

      <div className="p-6 flex-1 overflow-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                <Folder className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground font-medium">Total Channels</p>
                <p className="text-2xl font-bold">{stats?.total_channels || 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground font-medium">Files Indexed</p>
                <p className="text-2xl font-bold">{stats?.total_files || 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                <HardDrive className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground font-medium">Total Size</p>
                <p className="text-2xl font-bold">{formatBytes(stats?.total_size || 0)}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="bg-card border border-border rounded-lg shadow-sm flex flex-col h-full min-h-[400px]">
          <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search channels..." 
                className="pl-9" 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-search-channels"
              />
            </div>
            <div className="flex gap-2">
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="channel">Channels</SelectItem>
                  <SelectItem value="group">Groups</SelectItem>
                  <SelectItem value="supergroup">Supergroups</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={`${sort}-${order}`} onValueChange={(val) => {
                const [s, o] = val.split('-');
                setSort(s);
                setOrder(o);
              }}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="title-asc">Name (A-Z)</SelectItem>
                  <SelectItem value="title-desc">Name (Z-A)</SelectItem>
                  <SelectItem value="file_count-desc">Most Files</SelectItem>
                  <SelectItem value="total_size-desc">Largest Size</SelectItem>
                  <SelectItem value="last_sync-desc">Recently Synced</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10 shadow-sm">
                <TableRow>
                  <TableHead className="w-[300px]">Channel Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Members</TableHead>
                  <TableHead className="text-right">Files</TableHead>
                  <TableHead className="text-right">Size</TableHead>
                  <TableHead className="text-right">Last Sync</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24 ml-auto" /></TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  ))
                ) : channelsData?.channels.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-64 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <Database className="h-12 w-12 text-muted-foreground opacity-20 mb-4" />
                        <h3 className="text-lg font-medium">No channels found</h3>
                        <p className="text-sm text-muted-foreground max-w-md mt-1">
                          {search || type !== "all" 
                            ? "Try adjusting your search or filters." 
                            : "You haven't synced any channels yet. Click 'Sync from Telegram' to get started."}
                        </p>
                        {(!search && type === "all") && (
                          <Button onClick={handleSync} disabled={isSyncing} className="mt-4" data-testid="button-empty-sync">
                            {isSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                            Sync Now
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  channelsData?.channels.map((channel) => (
                    <TableRow key={channel.id} className="group cursor-pointer hover:bg-muted/50 transition-colors">
                      <TableCell className="font-medium">
                        <Link href={`/channels/${channel.id}`} className="flex items-center gap-2 outline-none focus:ring-2 focus:ring-primary rounded-sm p-1 -m-1" data-testid={`link-channel-${channel.id}`}>
                          <div className="h-8 w-8 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            {channel.title.charAt(0).toUpperCase()}
                          </div>
                          <span className="truncate block" title={channel.title}>
                            {channel.title}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {channel.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {channel.member_count?.toLocaleString() || "-"}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {channel.file_count?.toLocaleString() || "-"}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatBytes(channel.total_size)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help border-b border-dashed border-muted-foreground/30">
                              {formatRelativeDate(channel.last_sync)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {formatAbsoluteDate(channel.last_sync)}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="text-right pr-4">
                        <Link href={`/channels/${channel.id}`} tabIndex={-1}>
                          <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
      <Dialog open={addDialogOpen} onOpenChange={(open) => { setAddDialogOpen(open); if (!open) setChannelLink(""); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LinkIcon className="h-5 w-5 text-primary" />
              Add Channel by Link
            </DialogTitle>
            <DialogDescription>
              Paste a Telegram channel or group link. Works with public channels — they don't need to be in your chat list.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="channel-link">Channel URL or username</Label>
              <Input
                id="channel-link"
                placeholder="https://t.me/channel_name  or  @username"
                value={channelLink}
                onChange={(e) => setChannelLink(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddChannel(); }}
                data-testid="input-channel-link"
                autoFocus
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Accepted formats: <code className="bg-muted px-1 rounded text-xs">https://t.me/username</code>, <code className="bg-muted px-1 rounded text-xs">@username</code>, or just <code className="bg-muted px-1 rounded text-xs">username</code>
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} data-testid="button-cancel-add-channel">
              Cancel
            </Button>
            <Button
              onClick={handleAddChannel}
              disabled={!channelLink.trim() || addChannel.isPending}
              data-testid="button-confirm-add-channel"
            >
              {addChannel.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Looking up...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Channel
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
