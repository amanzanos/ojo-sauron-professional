import { useState } from 'react';
import type { ToolFlag } from '../../utils/toolPrefs';
import { isToolEnabled, setToolEnabled } from '../../utils/toolPrefs';

interface ToggleToolPanelProps {
  flag: ToolFlag;
  description: string;
  requiresCamera?: boolean;
}

export function ToggleToolPanel({ flag, description, requiresCamera }: ToggleToolPanelProps) {
  const [enabled, setEnabled] = useState(() => isToolEnabled(flag));

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    setToolEnabled(flag, next);
  };

  return (
    <div className="tool-simple">
      <p className="tool-hint">{description}{requiresCamera ? ' Solo funciona mientras tienes abierta la pestaña Vigilancia con la cámara activa.' : ''}</p>
      <button className={`tool-toggle-btn ${enabled ? 'active' : ''}`} onClick={toggle}>
        {enabled ? 'Activado' : 'Desactivado'}
      </button>
    </div>
  );
}
