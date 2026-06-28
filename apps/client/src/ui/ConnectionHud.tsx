import { useState, type CSSProperties, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { ConnectionState } from '@sl/shared-types';
import { useNet } from './store';
import { NetDebugHud } from './NetDebugHud';

const STATUS_COLOR: Record<ConnectionState, string> = {
  idle: '#5a6675',
  signaling: '#d8a23a',
  connecting: '#d8a23a',
  connected: '#46c46a',
  reconnecting: '#d8a23a',
  failed: '#e0553e',
};

const PANEL: CSSProperties = {
  width: 420,
  maxWidth: '92vw',
  background: '#0c1015',
  border: '1px solid #1c2530',
  borderRadius: 12,
  padding: 20,
  boxSizing: 'border-box',
};

function Field(props: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, letterSpacing: 1, color: '#5a6675', marginBottom: 6 }}>
        {props.label.toUpperCase()}
      </div>
      {props.children}
    </div>
  );
}

export function ConnectionHud() {
  const { status, code, isHost, peers, log, host, join, leave, lostReason } = useNet();
  const [draft, setDraft] = useState('');
  const failed = status === 'failed';
  const live = status !== 'idle' && !failed;

  return (
    <>
      <div style={PANEL}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <span style={{ fontSize: 13, letterSpacing: 3, color: '#9fb0c0' }}>SIGNAL&nbsp;LOST · LINK</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: STATUS_COLOR[status] }} />
            <span style={{ color: STATUS_COLOR[status] }}>{status}</span>
          </span>
        </div>

        {failed ? (
          <Field label="connection">
            <div style={{ fontSize: 20, color: '#e0553e', marginBottom: 12 }}>
              {(lostReason ?? 'connection failed').toUpperCase()}
            </div>
            <button onClick={leave} style={btn('#9fb0c0')}>Back to menu</button>
          </Field>
        ) : !live ? (
          <>
            <Field label="host a room">
              <button onClick={host} style={btn('#46c46a')}>Host game</button>
            </Field>
            <Field label="or join with a code">
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === 'Enter') join(draft); }}
                  placeholder="K7M2QX"
                  maxLength={6}
                  style={input}
                />
                <button onClick={() => join(draft)} style={btn('#3a6ed8')}>Join</button>
              </div>
            </Field>
          </>
        ) : (
          <>
            <Field label={isHost ? 'your room code — share it' : 'joined room'}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 30, letterSpacing: 6, color: '#e7eef5' }}>{code}</span>
                <span style={{ fontSize: 12, color: '#5a6675' }}>{isHost ? 'HOST' : 'CLIENT'}</span>
              </div>
            </Field>
            <Field label={`peers connected (${peers.length})`}>
              <div style={{ fontSize: 12, color: peers.length ? '#9fb0c0' : '#5a6675' }}>
                {peers.length ? peers.map((p) => p.slice(0, 6)).join(' · ') : 'waiting for a peer…'}
              </div>
            </Field>
            <button onClick={leave} style={btn('#e0553e')}>Leave</button>
          </>
        )}

        <div style={{ marginTop: 18, borderTop: '1px solid #1c2530', paddingTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, letterSpacing: 1, color: '#5a6675' }}>LOG</span>
            <span style={{ fontSize: 10, color: '#3f4a57' }}>~ net debug</span>
          </div>
          <div style={{ fontSize: 11.5, lineHeight: 1.7, color: '#7c8aa0', maxHeight: 120, overflowY: 'auto' }}>
            {log.length === 0
              ? <span style={{ color: '#3f4a57' }}>—</span>
              : log.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </div>
      </div>
      <NetDebugHud />
    </>
  );
}

const input: CSSProperties = {
  flex: 1,
  background: '#070a0e',
  border: '1px solid #1c2530',
  borderRadius: 8,
  color: '#e7eef5',
  fontFamily: 'inherit',
  fontSize: 18,
  letterSpacing: 4,
  padding: '8px 12px',
};

function btn(accent: string): CSSProperties {
  return {
    background: 'transparent',
    border: `1px solid ${accent}`,
    color: accent,
    borderRadius: 8,
    padding: '9px 16px',
    fontFamily: 'inherit',
    fontSize: 13,
    cursor: 'pointer',
  };
}

export function mountHud(el: HTMLElement): void {
  window.addEventListener('keydown', (e) => {
    if (e.key === '`' || e.key === '~') useNet.getState().toggleDebug();
  });
  createRoot(el).render(<ConnectionHud />);
}
