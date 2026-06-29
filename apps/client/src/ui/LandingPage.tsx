import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import heroImage from '../assets/signal-lost-hero.png';
import { useNet } from './store';
import { NetDebugHud } from './NetDebugHud';

const PANIC_LINES = [
  'VESTA: Crew volume is now classified as a hostile beacon.',
  'Crew log: slipped with purpose, screamed with conviction.',
  'The Chorus heard the group chat and joined uninvited.',
  'Objective updated: stop calling the monster "bro".',
  'Battery carrier has fallen. Morale somehow improved.',
] as const;

const CLIP_CARDS = [
  {
    title: 'The Slip Heard Round Earth',
    tag: '0:08 wipe',
    copy: 'One flashlight, four opinions, and a wet floor with perfect comedic timing.',
  },
  {
    title: 'Whisper Meta Dies First',
    tag: 'voice bait',
    copy: 'The quiet player coughs. The ship answers in the same voice. Everyone votes to sprint.',
  },
  {
    title: 'Hero Button, Bad Button',
    tag: 'plot twist',
    copy: 'Restore comms to win. Discover that winning is exactly what the thing wanted.',
  },
] as const;

const FEATURES = [
  ['Sound Is The Monster', 'Talk to survive, whisper to hide, scream to become the dinner bell.'],
  ['Light Is Bait', 'Your flashlight saves your crew until it paints a runway for The Chorus.'],
  ['Co-op Goes Sideways', 'Every plan becomes slapstick when doors jam, batteries roll, and friends panic.'],
  ['One Signal Lies', 'The distress call never stopped. That does not mean anyone human is alive.'],
] as const;

const TICKER_ITEMS = [
  'EARTH CONTROL: bring her voice back',
  'VESTA: correction, one signal active',
  'CREW: who brought the cursed battery',
  'THE CHORUS: listening',
] as const;

const DEMO_URL = import.meta.env.VITE_LOOKDEV_DEMO_URL ?? 'http://127.0.0.1:8173/lobby?flow=1&auto=1';

function scrollToLobby(): void {
  document.getElementById('capsule-lobby')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function playDemo(): void {
  window.location.assign(DEMO_URL);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assetUrl(file: string): string {
  return /^(https?:|data:|blob:|\/)/.test(file) ? file : `/${file}`;
}

interface LandingArt {
  hero?: string;
  keyArt?: string;
}

// Landing art is published from /admin, which writes the files onto the asset
// server and exposes them through /api/manifest. We resolve it here at runtime
// (newest file per id wins) so saving art in the admin shows up on the next
// page load with no rebuild or redeploy. Falls back to the bundled hero.
function useLandingArt(): LandingArt {
  const [art, setArt] = useState<LandingArt>({});
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch('/api/manifest', { cache: 'no-store' });
        if (!response.ok) return;
        const payload: unknown = await response.json();
        const items = isRecord(payload) && Array.isArray(payload.items) ? payload.items : [];
        const newest = new Map<string, { file: string; at: string }>();
        for (const item of items) {
          if (!isRecord(item) || typeof item.id !== 'string' || typeof item.file !== 'string') continue;
          const at = typeof item.createdAt === 'string' ? item.createdAt : '';
          const current = newest.get(item.id);
          if (!current || at >= current.at) newest.set(item.id, { file: assetUrl(item.file), at });
        }
        if (active) setArt({ hero: newest.get('landing-hero')?.file, keyArt: newest.get('landing-key-art-clean')?.file });
      } catch {
        // Keep the bundled fallback art if the manifest is unavailable.
      }
    })();
    return () => { active = false; };
  }, []);
  return art;
}

export function LandingPage() {
  const { status, code, isHost, peers, log, host, join, leave, lostReason } = useNet();
  const art = useLandingArt();
  const heroSrc = art.hero ?? heroImage;
  const [draft, setDraft] = useState('');
  const [panicIndex, setPanicIndex] = useState(0);
  const [shakeKey, setShakeKey] = useState(0);
  const live = status !== 'idle' && status !== 'failed';
  const panicLine = PANIC_LINES[panicIndex] ?? PANIC_LINES[0];
  const artStyle = useMemo(() => ({ '--landing-art': `url(${heroSrc})` }) as CSSProperties, [heroSrc]);

  const startRoom = (): void => {
    host();
    scrollToLobby();
  };

  const joinRoom = (): void => {
    join(draft);
    scrollToLobby();
  };

  const panic = (): void => {
    setPanicIndex((current) => (current + 1) % PANIC_LINES.length);
    setShakeKey((current) => current + 1);
  };

  return (
    <main className="landing" style={artStyle}>
      <section className="hero" aria-label="Signal Lost landing page">
        <img className="hero__image" src={heroSrc} alt="" />
        <div className="hero__grain" aria-hidden="true" />
        <nav className="nav" aria-label="Primary">
          <a className="nav__brand" href="#top" aria-label="Signal Lost home">
            <span className="nav__mark" aria-hidden="true" />
            SIGNAL LOST
          </a>
          <div className="nav__links">
            <a href="#clips">Clips</a>
            <a href="#systems">Systems</a>
            <a href="#capsule-lobby">Lobby</a>
          </div>
          <button className="nav__cta" onClick={scrollToLobby}>Enter</button>
        </nav>

        <div className="hero__content" id="top">
          <p className="eyebrow">1-4 player co-op panic simulator</p>
          <h1>SIGNAL LOST</h1>
          <p className="hero__lede">
            A funny-scary space horror game where your voice is useful, your flashlight is
            incriminating, and the rescue signal is absolutely not asking nicely.
          </p>
          <div className="hero__actions" aria-label="Main actions">
            <button className="button button--primary" onClick={playDemo}>Play cold open</button>
            <button className="button button--ghost" onClick={startRoom}>Start a room</button>
            <button className="button button--ghost" onClick={scrollToLobby}>Join a crew</button>
            <button className="button button--danger" onClick={panic}>Panic button</button>
          </div>
          <div className="hero__readout" key={shakeKey}>
            <span className="hero__readout-label">Live channel</span>
            <span>{panicLine}</span>
          </div>
          <div className="hero__metrics" aria-label="Game highlights">
            <span><strong>87%</strong> fewer heroic decisions</span>
            <span><strong>4</strong> doomed contractors</span>
            <span><strong>1</strong> signal that lies</span>
          </div>
        </div>
      </section>

      <section className="panic-strip" aria-label="Ship status ticker">
        <div className="panic-strip__track">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}
        </div>
      </section>

      <section className="section section--clips" id="clips">
        <div className="section__intro">
          <p className="eyebrow">Built for group chat immortality</p>
          <h2>Every run manufactures a clip your friends will deny causing.</h2>
        </div>
        <div className="clip-grid">
          {CLIP_CARDS.map((clip, index) => (
            <article className={`clip-card clip-card--${index + 1}`} key={clip.title}>
              <div className="clip-card__still" aria-hidden="true" />
              <div className="clip-card__body">
                <span>{clip.tag}</span>
                <h3>{clip.title}</h3>
                <p>{clip.copy}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section section--systems" id="systems">
        <div className="section__intro">
          <p className="eyebrow">Scary systems, stupid outcomes</p>
          <h2>The ship is serious. Your crew is the problem.</h2>
        </div>
        <div className="feature-grid">
          {FEATURES.map(([title, copy]) => (
            <article className="feature-card" key={title}>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      {art.keyArt ? (
        <section className="section section--keyart" id="key-art">
          <div className="section__intro">
            <p className="eyebrow">Recovered transmission</p>
            <h2>Key art, straight off the salvage drive.</h2>
          </div>
          <figure className="key-art">
            <img src={art.keyArt} alt="SIGNAL LOST key art" loading="lazy" />
          </figure>
        </section>
      ) : null}

      <section className="section section--lobby" id="capsule-lobby">
        <div className="lobby-copy">
          <p className="eyebrow">Capsule lobby</p>
          <h2>Open a room before anyone has time to become sensible.</h2>
          <p>
            Host gets a room code. Friends bring poor judgment. The capsule launches once
            everyone pretends they are ready.
          </p>
        </div>
        <div className="lobby-panel" aria-live="polite">
          <div className="lobby-panel__top">
            <span>Room uplink</span>
            <strong className={`status status--${status}`}>{status}</strong>
          </div>

          {status === 'failed' ? (
            <div className="lobby-panel__body">
              <p className="lobby-panel__alert">{(lostReason ?? 'connection failed').toUpperCase()}</p>
              <button className="button button--ghost" onClick={leave}>Back to lobby</button>
            </div>
          ) : live ? (
            <div className="lobby-panel__body">
              <span className="lobby-panel__label">{isHost ? 'Share this code' : 'Joined room'}</span>
              <div className="room-code">{code}</div>
              <p>{peers.length ? `${peers.length} peer connected` : 'Waiting for a doomed friend.'}</p>
              <button className="button button--primary" onClick={playDemo}>Launch cold open</button>
              <button className="button button--danger" onClick={leave}>Leave room</button>
            </div>
          ) : (
            <div className="lobby-panel__body">
              <button className="button button--primary" onClick={playDemo}>Play local demo</button>
              <button className="button button--primary" onClick={startRoom}>Host game</button>
              <div className="join-row">
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value.toUpperCase())}
                  onKeyDown={(event) => { if (event.key === 'Enter') joinRoom(); }}
                  maxLength={6}
                  placeholder="K7M2QX"
                  aria-label="Room code"
                />
                <button className="button button--ghost" onClick={joinRoom}>Join</button>
              </div>
            </div>
          )}

          <div className="lobby-panel__log" aria-label="Connection log">
            {log.length === 0 ? <span>Awaiting first terrible decision.</span> : log.slice(-3).map((line, index) => <span key={`${line}-${index}`}>{line}</span>)}
          </div>
        </div>
      </section>

      <footer className="footer">
        <span>SIGNAL LOST</span>
        <span>Restore comms. Regret efficiently.</span>
      </footer>
      <NetDebugHud />
    </main>
  );
}
