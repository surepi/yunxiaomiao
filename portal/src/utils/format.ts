export function priceYuan(fen: number): string {
  return (fen / 100).toFixed(2);
}

export function daysText(hours: number): string {
  const days = Math.round(hours / 24);
  return days > 0 ? `${days} 天` : `${hours} 小时`;
}

export function formatDateTime(ms: number): string {
  if (!ms) return "-";
  return new Date(ms).toLocaleString();
}

export function daysLeft(ms: number): number {
  if (!ms) return 0;
  return Math.ceil((ms - Date.now()) / 86400000);
}

export function expireCountdown(ms: number): string {
  if (!ms) return "-";
  const diff = ms - Date.now();
  if (diff <= 0) return "已到期";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `剩余 ${days} 天 ${hours} 小时`;
  const minutes = Math.floor((diff % 3600000) / 60000);
  return `剩余 ${hours} 小时 ${minutes} 分`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}
