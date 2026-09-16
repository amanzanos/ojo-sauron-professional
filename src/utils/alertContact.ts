import type { AlertContact } from '../types/citizen';

const KEY = 'weros.alertContact.v1';

export function loadAlertContact(): AlertContact | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AlertContact) : undefined;
  } catch {
    return undefined;
  }
}

export function saveAlertContact(contact: AlertContact): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(contact));
  } catch (err) {
    console.error('No se pudo guardar el contacto de emergencia', err);
  }
}

/** Digits-and-leading-plus only, as required by the wa.me deep-link format. */
export function sanitizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}
