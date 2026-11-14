/**
 * R4-01 / ATT-04: Time utilities strictly bound to Africa/Nairobi timezone.
 * Prevents UTC midnight skew where new Date().toISOString() after 9 PM EAT
 * incorrectly returns the next calendar day.
 */

/**
 * Returns the current date in Africa/Nairobi as a YYYY-MM-DD string.
 * Uses 'en-CA' locale which natively and reliably formats as YYYY-MM-DD.
 */
export function getNairobiDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Returns the current absolute time.
 * WARNING: JavaScript Date objects always store UTC internally.
 * For accurate time comparisons (e.g., period start/end), construct
 * the Date with an explicit +03:00 offset:
 * `new Date(\`${nairobiDate}T${timeStr}+03:00\`)`
 */
export function getNairobiNow(): Date {
  return new Date();
}
