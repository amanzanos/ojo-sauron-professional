const PERMISSION_KEY = 'weros.notificationsEnabled.v1';

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationsEnabled(): boolean {
  return notificationsSupported() && Notification.permission === 'granted' && localStorage.getItem(PERMISSION_KEY) === '1';
}

export async function enableNotifications(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  const granted = permission === 'granted';
  if (granted) localStorage.setItem(PERMISSION_KEY, '1');
  return granted;
}

export function disableNotifications() {
  localStorage.removeItem(PERMISSION_KEY);
}

/**
 * Browser Notification, not a real push — it only fires while WEROS is open (even backgrounded in
 * a tab), not once the browser itself is fully closed. A true "closed app" push would need a
 * service worker + a push backend, which is a separate, bigger piece of infrastructure.
 */
export function notify(title: string, body: string) {
  if (!notificationsEnabled()) return;
  try {
    new Notification(title, { body, icon: undefined, tag: 'weros' });
  } catch (err) {
    console.error('No se pudo mostrar la notificación', err);
  }
}
