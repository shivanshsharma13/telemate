import { format, formatDistanceToNow } from "date-fns";

export function formatBytes(bytes: number | null | undefined, decimals = 2) {
  if (bytes === null || bytes === undefined || !+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function formatRelativeDate(dateStr: string | null | undefined) {
  if (!dateStr) return 'Never';
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch (e) {
    return 'Invalid Date';
  }
}

export function formatAbsoluteDate(dateStr: string | null | undefined) {
  if (!dateStr) return 'Unknown';
  try {
    return format(new Date(dateStr), "MMM d, yyyy HH:mm");
  } catch (e) {
    return 'Invalid Date';
  }
}
