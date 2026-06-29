import type { CSSProperties } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useHudStore } from './store';

const root: CSSProperties = {
  position: 'fixed',
  inset: 0,
  pointerEvents: 'none',
  color: '#dbe7ee',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  textTransform: 'uppercase',
};

const lower: CSSProperties = {
  position: 'absolute',
  left: 18,
  right: 18,
  bottom: 16,
  display: 'grid',
  gridTemplateColumns: 'minmax(220px, 340px) minmax(160px, 1fr) minmax(160px, 240px)',
  gap: 14,
  alignItems: 'end',
};

const panel: CSSProperties = {
  background: 'rgba(5, 7, 10, 0.72)',
  border: '1px solid rgba(127, 210, 255, 0.18)',
  padding: '10px 12px',
  boxSizing: 'border-box',
};

const label: CSSProperties = {
  color: '#78909d',
  fontSize: 10,
  letterSpacing: 1,
};

const value: CSSProperties = {
  color: '#eef7fb',
  fontSize: 16,
  letterSpacing: 0,
};

function clampPercent(v: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(v) ? v : 0));
}

function Bar(props: { name: string; value: number; color: string }) {
  const pct = clampPercent(props.value);
  return (
    <div style={{ display: 'grid', gap: 5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <span style={label}>{props.name}</span>
        <span style={label}>{Math.round(pct)}</span>
      </div>
      <div style={{ height: 7, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: props.color }} />
      </div>
    </div>
  );
}

export function HudRoot() {
  const hud = useHudStore(
    useShallow((s) => ({
      health: s.health,
      battery: s.battery,
      resolve: s.resolve,
      ammoMag: s.ammoMag,
      ammoReserve: s.ammoReserve,
      objective: s.objective,
      status: s.status,
      backend: s.backend,
      drawCalls: s.drawCalls,
      gpuMs: s.gpuMs,
    })),
  );

  return (
    <div className="sl-hud" data-testid="sl-hud" style={root}>
      <div style={lower}>
        <div style={{ ...panel, display: 'grid', gap: 9 }}>
          <Bar name="health" value={hud.health} color="#d44d42" />
          <Bar name="resolve" value={hud.resolve} color="#7fd2ff" />
          <Bar name="battery" value={hud.battery} color="#d8c65a" />
        </div>
        <div style={panel}>
          <div style={label}>objective</div>
          <div style={{ ...value, marginTop: 5 }}>{hud.objective}</div>
        </div>
        <div style={{ ...panel, display: 'grid', gap: 6 }}>
          <div>
            <div style={label}>ammo</div>
            <div style={value}>{hud.ammoMag} / {hud.ammoReserve}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <span style={label}>{hud.status ?? 'idle'}</span>
            <span style={label}>
              {hud.backend ?? 'render'}{typeof hud.drawCalls === 'number' ? ` · ${hud.drawCalls} draws` : ''}
              {typeof hud.gpuMs === 'number' ? ` · ${hud.gpuMs.toFixed(1)}ms` : ''}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
