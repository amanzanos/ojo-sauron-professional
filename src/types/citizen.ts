export type CitizenCategory = 'alerta' | 'robo' | 'accidente' | 'incendio' | 'disturbio' | 'ayuda' | 'sospechoso' | 'otro';

export const CITIZEN_CATEGORIES: Array<{ value: CitizenCategory; label: string; icon: string; color: string }> = [
  { value: 'alerta', label: 'Alerta SOS', icon: '🆘', color: '#ef4444' },
  { value: 'robo', label: 'Robo', icon: '🕵️', color: '#f97316' },
  { value: 'accidente', label: 'Accidente', icon: '🚧', color: '#f59e0b' },
  { value: 'incendio', label: 'Incendio', icon: '🔥', color: '#ef4444' },
  { value: 'disturbio', label: 'Disturbio', icon: '📢', color: '#a855f7' },
  { value: 'sospechoso', label: 'Actividad sospechosa', icon: '👀', color: '#60a5fa' },
  { value: 'ayuda', label: 'Necesito ayuda', icon: '🤝', color: '#22c55e' },
  { value: 'otro', label: 'Otro', icon: '📍', color: '#94a3b8' }
];

export function categoryMeta(category: CitizenCategory) {
  return CITIZEN_CATEGORIES.find((c) => c.value === category) ?? CITIZEN_CATEGORIES[CITIZEN_CATEGORIES.length - 1];
}

export interface CitizenEvent {
  id: string;
  category: CitizenCategory;
  title: string;
  description: string;
  lat: number;
  lng: number;
  createdAt: number;
  authorLabel: string;
}

export type NewCitizenEvent = Omit<CitizenEvent, 'id' | 'createdAt'>;

export interface AlertContact {
  name: string;
  phone: string;
}
