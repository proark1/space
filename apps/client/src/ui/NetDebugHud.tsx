import type { CSSProperties } from 'react';
import { useNet } from './store';

const OVERLAY: CSSProperties = {
  position: 'fixed',
  top: 12,
  left: 12,
  width: 210,
  background: 'rgba(7,10,14,0.92)',
  border: '1px solid #1c2530',
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 11.5,
  lineHeight: 1.6,
  color: '#9fb0c0',
  zIndex: 10,
};

function Row(props: { label: string; value: string | number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: '#5a6675' }}>{props.label}</span>
      <span style={{ color: '#cdd8e2' }}>{props.value}</span>
    </div>
  );
}

export function NetDebugHud() {
  const { showDebug, stats, isHost } = useNet();
  if (!showDebug) return null;
  const dash = '—';
  return (
    <div style={OVERLAY}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, color: '#7c8aa0', letterSpacing: 1 }}>
        <span>NET DEBUG</span>
        <span>{isHost ? 'HOST' : 'CLIENT'}</span>
      </div>
      <Row label="rtt" value={stats ? `${stats.rttMs} ms` : dash} />
      <Row label="loss" value={stats ? `${stats.lossPct}%` : dash} />
      <Row label="snap" value={stats ? `${stats.snapshotHz}/s · ${stats.snapshotBytesAvg}B` : dash} />
      <Row label="input" value={stats ? `${stats.inputHz}/s` : dash} />
      <Row label="tick drift" value={stats ? `${stats.tickDriftMs} ms` : dash} />
      <Row label="ice pair" value={stats ? stats.selectedPair : dash} />
      <Row label="buffered" value={stats ? stats.bufferedSnapshots : dash} />
      <div style={{ marginTop: 6, color: '#3f4a57', textAlign: 'right' }}>~ to hide</div>
    </div>
  );
}
