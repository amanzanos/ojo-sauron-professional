import { useState } from 'react';
import {
  BatteryWarning, CalendarClock, Car, Compass, Footprints, MapPinned,
  MonitorUp, QrCode, ScanFace, Smile, SunMoon, X
} from 'lucide-react';
import { CompassPanel } from './tools/CompassPanel';
import { StepsPanel } from './tools/StepsPanel';
import { DrivingModePanel } from './tools/DrivingModePanel';
import { GeofencePanel } from './tools/GeofencePanel';
import { PatrolSchedulePanel } from './tools/PatrolSchedulePanel';
import { QrLocationPanel } from './tools/QrLocationPanel';
import { ScreenRecordPanel } from './tools/ScreenRecordPanel';
import { BatteryAlertPanel } from './tools/BatteryAlertPanel';
import { ToggleToolPanel } from './tools/ToggleToolPanel';
import { FaceGreetingPanel } from './tools/FaceGreetingPanel';

type ToolKey = 'compass' | 'steps' | 'driving' | 'geofences' | 'patrol' | 'qr' | 'screen' | 'battery' | 'brightness' | 'mood' | 'face';

interface ToolDef {
  key: ToolKey;
  icon: typeof Compass;
  label: string;
}

const TOOLS: ToolDef[] = [
  { key: 'compass', icon: Compass, label: 'Brújula' },
  { key: 'steps', icon: Footprints, label: 'Pasos' },
  { key: 'driving', icon: Car, label: 'Conducción' },
  { key: 'geofences', icon: MapPinned, label: 'Recordatorios' },
  { key: 'patrol', icon: CalendarClock, label: 'Patrulla' },
  { key: 'qr', icon: QrCode, label: 'QR ubicación' },
  { key: 'screen', icon: MonitorUp, label: 'Grabar pantalla' },
  { key: 'battery', icon: BatteryWarning, label: 'Batería' },
  { key: 'brightness', icon: SunMoon, label: 'Luz ambiente' },
  { key: 'mood', icon: Smile, label: 'Espejo de ánimo' },
  { key: 'face', icon: ScanFace, label: 'Saludo con cara' }
];

interface DrivingProps { enabled: boolean; driving: boolean; speedKmh?: number; start: () => void; stop: () => void }
interface GeofenceWatcherProps { enabled: boolean; start: () => void; stop: () => void }
interface BatteryProps { supported: boolean; enabled: boolean; level?: number; start: () => void; stop: () => void }

interface ToolsHubProps {
  driving: DrivingProps;
  geofenceWatcher: GeofenceWatcherProps;
  battery: BatteryProps;
}

export function ToolsHub({ driving, geofenceWatcher, battery }: ToolsHubProps) {
  const [active, setActive] = useState<ToolKey>();
  const activeDef = TOOLS.find((t) => t.key === active);

  return (
    <div className="tools">
      <div className="tools-grid">
        {TOOLS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.key} className="tool-tile" onClick={() => setActive(t.key)}>
              <Icon size={22} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {activeDef && (
        <div className="tool-panel-overlay" onClick={() => setActive(undefined)}>
          <div className="tool-panel" onClick={(e) => e.stopPropagation()}>
            <div className="tool-panel-head">
              <h3><activeDef.icon size={16} /> {activeDef.label}</h3>
              <button className="icon-btn" onClick={() => setActive(undefined)}><X size={18} /></button>
            </div>
            {active === 'compass' && <CompassPanel />}
            {active === 'steps' && <StepsPanel />}
            {active === 'driving' && (
              <DrivingModePanel enabled={driving.enabled} driving={driving.driving} speedKmh={driving.speedKmh} onStart={driving.start} onStop={driving.stop} />
            )}
            {active === 'geofences' && (
              <GeofencePanel watcherEnabled={geofenceWatcher.enabled} onStart={geofenceWatcher.start} onStop={geofenceWatcher.stop} />
            )}
            {active === 'patrol' && <PatrolSchedulePanel />}
            {active === 'qr' && <QrLocationPanel />}
            {active === 'screen' && <ScreenRecordPanel />}
            {active === 'battery' && (
              <BatteryAlertPanel supported={battery.supported} enabled={battery.enabled} level={battery.level} onStart={battery.start} onStop={battery.stop} />
            )}
            {active === 'brightness' && (
              <ToggleToolPanel flag="autoBrightness" description="Ajusta un poco el brillo/contraste de la cámara según la luz que detecta el sensor ambiente." requiresCamera />
            )}
            {active === 'mood' && (
              <ToggleToolPanel flag="moodMirror" description="De vez en cuando comenta en voz alta cómo te ve (cansado, animado...) y puede ofrecerte abrir música acorde." requiresCamera />
            )}
            {active === 'face' && <FaceGreetingPanel />}
          </div>
        </div>
      )}
    </div>
  );
}
