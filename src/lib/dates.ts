/** Today as YYYY-MM-DD on this device's own clock. toISOString() gives yesterday's date in Lagos before 1am. */
export function localDate(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
