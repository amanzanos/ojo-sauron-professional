const KEY = 'weros.lastGreetedDate.v1';

function todayLabel(): string {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, stable and locale-independent enough for a same-day check
}

export function shouldGreetToday(): boolean {
  try {
    return localStorage.getItem(KEY) !== todayLabel();
  } catch {
    return false;
  }
}

export function markGreetedToday(): void {
  try {
    localStorage.setItem(KEY, todayLabel());
  } catch {
    // ignore
  }
}
