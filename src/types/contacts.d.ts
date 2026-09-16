// Minimal ambient typing for the Contacts Picker API (navigator.contacts) — Chrome/Android only,
// secure-context, and not in TS's default DOM lib.
interface ContactInfo {
  name?: string[];
  tel?: string[];
}

interface ContactsManager {
  select(properties: string[], options?: { multiple?: boolean }): Promise<ContactInfo[]>;
}

interface Navigator {
  contacts?: ContactsManager;
}
