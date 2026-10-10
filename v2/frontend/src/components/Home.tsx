import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameSummary, GlobalStats, Lobby as LobbyData, SessionInfo, TeamView } from '../bindings/backend';
import { GameStatus } from '../bindings/backend';
import { api, errorText, ok } from '../lib/backend';
import { navigate, type AppState } from '../App';
import { SignIn } from './SignIn';
import { ChainBadge } from './ChainBadge';
import { CreateTeam } from './CreateTeam';

export function Home({ app, onSignedIn }: { app: AppState; onSignedIn: (s: SessionInfo) => void }) {
  const { session } = app;
  return (
    <div className="home">
      {!session && <SignIn settings={app.settings} onSignedIn={onSignedIn} />}
      {session && !session.team && <CreateTeam onCreated={app.refreshSession} />}
      {session?.team && <Lobby app={app} />}
      <Stats app={app} />
      <Leaderboard app={app} />
      <RecentGames />
    </div>
  );
}

function Lobby({ app }: { app: AppState }) {
  const [lobby, setLobby] = useState<LobbyData | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TeamView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const myTeam = app.session?.team;
  const lastActive = useRef<bigint | undefined>(myTeam?.active_game);

  const refresh = useCallback(async () => {
    try {
      const l = ok(await api().lobby());
      setLobby(l);
      // Jump into a game when one starts (e.g. our invite was accepted).
      if (l.active_game !== undefined && l.active_game !== lastActive.current) navigate(`#/game/${l.active_game}`);
      lastActive.current = l.active_game;
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        setResults((await api().search_teams(query, 8n)).filter((t) => t.id !== myTeam?.id));
      } catch {
        setResults([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, myTeam?.id]);

  const run = async (f: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await f();
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2>Play</h2>
      {lobby?.active_game !== undefined && (
        <p>
          You have a game in progress. <a href={`#/game/${lobby.active_game}`}>Open it</a>
        </p>
      )}
      <div className="row">
        {lobby?.in_queue ? (
          <>
            <span className="pulse">Looking for an opponent…</span>
            <button disabled={busy} onClick={() => run(async () => ok(await api().leave_queue()))}>
              Stop
            </button>
          </>
        ) : (
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const game = ok(await api().join_queue());
                if (game !== undefined) navigate(`#/game/${game}`);
              })
            }
          >
            Quick match
          </button>
        )}
      </div>

      {!!lobby?.incoming.length && (
        <>
          <h3>Invites for you</h3>
          {lobby.incoming.map((r) => (
            <div className="list-row" key={String(r.id)}>
              <TeamLabel team={r.from_team} app={app} />
              <div className="row">
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => run(async () => navigate(`#/game/${ok(await api().accept_game_request(r.id))}`))}
                >
                  Accept
                </button>
                <button disabled={busy} onClick={() => run(async () => ok(await api().cancel_game_request(r.id)))}>
                  Decline
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {!!lobby?.outgoing.length && (
        <>
          <h3>Your invite</h3>
          {lobby.outgoing.map((r) => (
            <div className="list-row" key={String(r.id)}>
              <span>
                Waiting for <TeamLabel team={r.to_team} app={app} />
              </span>
              <button disabled={busy} onClick={() => run(async () => ok(await api().cancel_game_request(r.id)))}>
                Cancel
              </button>
            </div>
          ))}
        </>
      )}

      <h3>Invite a team</h3>
      <input placeholder="Search by team name" value={query} onChange={(e) => setQuery(e.target.value)} />
      {results.map((t) => (
        <div className="list-row" key={String(t.id)}>
          <TeamLabel team={t} app={app} />
          <button disabled={busy || t.active_game !== undefined} onClick={() => run(async () => ok(await api().create_game_request(t.id)))}>
            {t.active_game !== undefined ? 'Playing' : 'Invite'}
          </button>
        </div>
      ))}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

export function TeamLabel({ team, app }: { team: { name: string; home_chain: string; elo?: bigint }; app: AppState }) {
  return (
    <span className="team-label">
      <strong>{team.name}</strong> <ChainBadge chain={team.home_chain} settings={app.settings} />
      {team.elo !== undefined && <span className="muted small"> {(Number(team.elo) / 100).toFixed(2)}</span>}
    </span>
  );
}

function Stats({ app }: { app: AppState }) {
  const [stats, setStats] = useState<GlobalStats | null>(null);
  useEffect(() => {
    api().global_stats().then(setStats).catch(() => setStats(null));
  }, []);
  if (!stats) return null;
  return (
    <section className="card stats">
      <div>
        <b>{String(stats.teams)}</b>
        <span>teams</span>
      </div>
      <div>
        <b>{String(stats.games)}</b>
        <span>games</span>
      </div>
      <div>
        <b>{String(stats.active_games)}</b>
        <span>live now</span>
      </div>
      <div>
        <b>{String(stats.goals)}</b>
        <span>goals</span>
      </div>
      {stats.teams_by_chain.map(([chain, n]) => (
        <div key={chain}>
          <b>{String(n)}</b>
          <ChainBadge chain={chain} settings={app.settings} />
        </div>
      ))}
    </section>
  );
}

function Leaderboard({ app }: { app: AppState }) {
  const [teams, setTeams] = useState<TeamView[]>([]);
  useEffect(() => {
    api().leaderboard(0n, 25n).then(setTeams).catch(() => setTeams([]));
  }, []);
  return (
    <section className="card">
      <h2>Leaderboard</h2>
      <p className="muted small">One pool for every chain.</p>
      <table className="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Team</th>
            <th>ELO</th>
            <th>W-D-L</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((t, i) => (
            <tr key={String(t.id)} className={t.id === app.session?.team?.id ? 'mine' : ''}>
              <td>{i + 1}</td>
              <td>
                <TeamLabel team={{ name: t.name, home_chain: t.home_chain }} app={app} />
              </td>
              <td>{(Number(t.elo) / 100).toFixed(2)}</td>
              <td>
                {String(t.wins)}-{String(t.draws)}-{String(t.losses)}
              </td>
            </tr>
          ))}
          {teams.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                No teams yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function RecentGames() {
  const [games, setGames] = useState<GameSummary[]>([]);
  useEffect(() => {
    api().recent_games(10).then(setGames).catch(() => setGames([]));
  }, []);
  if (games.length === 0) return null;
  return (
    <section className="card">
      <h2>Recent games</h2>
      {games.map((g) => (
        <a className="list-row" key={String(g.id)} href={`#/game/${g.id}`}>
          <span>
            {g.team1.name} <b>{g.score1}</b> : <b>{g.score2}</b> {g.team2.name}
          </span>
          <span className="muted small">{g.status === GameStatus.Active ? 'live' : g.status}</span>
        </a>
      ))}
    </section>
  );
}
