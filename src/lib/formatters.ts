/**
 * Format a date to a time string (HH:MM AM/PM)
 */
export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Calculate and format duration between a start time and now
 */
export function calculateDuration(startTime: Date | string): string {
  const start = typeof startTime === 'string' ? new Date(startTime) : startTime;
  const now = new Date();
  const durationInMinutes = Math.floor((now.getTime() - start.getTime()) / (1000 * 60));
  return `${durationInMinutes}m`;
}

/**
 * Format a number as currency (₹)
 */
export function formatCurrency(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return `₹${num.toFixed(2)}`;
} 