import { useCallback, useEffect, useState } from 'react';
import type { SessionInfo, Settings } from './bindings/backend';
import { api, errorText, resetSessionKey } from './lib/backend';
import { Home } from './components/Home';
import { GamePage } from './components/GamePage';
import { ChainBadge } from './components/ChainBadge';

export type Route = { page: 'home' } | { page: 'game'; id: bigint };

function parseRoute(): Route {
  const m = window.location.hash.match(/^#\/game\/(\d+)/);
  return m ? { page: 'game', id: BigInt(m[1]) } : { page: 'home' };
}

export function navigate(hash: string) {
  window.location.hash = hash;
}

export interface AppState {
  session: SessionInfo | null;
  settings: Settings | null;
  refreshSession: () => Promise<void>;
}

export function App() {
  const [route, setRoute] = useState<Route>(parseRoute);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => setRoute(parseRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      setSession(await api().whoami());
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [s] = await Promise.all([api().get_settings(), refreshSession()]);
        setSettings(s);
      } catch (e) {
        setError(errorText(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshSession]);

  const signOut = async () => {
    try {
      await api().sign_out();
    } catch {
      // The session key is dropped either way.
    }
    resetSessionKey();
    setSession(null);
    navigate('#/');
  };

  const state: AppState = { session, settings, refreshSession };

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/">
          <img src="/logo.png" alt="" /> TactiBall
        </a>
        {session?.team && (
          <div className="me">
            <span className="team-name">{session.team.name}</span>
            <ChainBadge chain={session.user.home_chain} settings={settings} />
            <span className="elo">{(Number(session.team.elo) / 100).toFixed(2)}</span>
          </div>
        )}
        {session && (
          <button className="link" onClick={signOut}>
            Sign out
          </button>
        )}
      </header>
      <main>
        {error && <div className="banner error">{error}</div>}
        {loading ? (
          <p className="muted center">Connecting to the Internet Computer…</p>
        ) : route.page === 'game' ? (
          <GamePage gameId={route.id} app={state} />
        ) : (
          <Home app={state} onSignedIn={setSession} />
        )}
      </main>
      <footer className="muted small center">TactiBall v2 preview · game logic runs in a canister on the Internet Computer</footer>
    </div>
  );
}
