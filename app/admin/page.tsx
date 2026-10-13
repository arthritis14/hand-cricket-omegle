"use client";

import { useCallback, useEffect, useState } from "react";
import { adminSupabase, type AdminStats } from "@/lib/adminSupabase";

const REFRESH_MS = 30_000;

type View = "loading" | "signed-out" | "ready";

const PASSWORD_KEY = "hc-admin-password";

// Two sides of one real match are logged (one per player); a computer game
// has just one. This turns those rows back into whole games.
const matchesOf = (g: { started: number; computer: number }) =>
  g.computer + Math.round((g.started - g.computer) / 2);

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "-");

function ago(iso: string | null) {
  if (!iso) return "never";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export default function AdminPage() {
  const [view, setView] = useState<View>("loading");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Asks the database for the stats with this password. The database does the
  // checking (and the lockout after too many wrong tries); the password is
  // not in this code or the repo.
  const load = useCallback(async (pw: string, quiet = false) => {
    const { data, error: rpcError } = await adminSupabase.rpc("hc_admin_stats", { p_password: pw });
    if (rpcError) {
      if (!quiet) setError("Could not load the stats. Check your connection.");
      return false;
    }
    const reply = data as AdminStats | { error: string };
    if ("error" in reply) {
      if (reply.error === "locked") setError("Too many wrong tries. Wait 15 minutes and try again.");
      else if (!quiet) setError("Wrong password.");
      return false;
    }
    setError(null);
    setStats(reply);
    setView("ready");
    return true;
  }, []);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(PASSWORD_KEY);
    } catch {}
    if (!saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setView("signed-out");
      return;
    }
    void load(saved, true).then((ok) => {
      if (!ok) {
        try {
          localStorage.removeItem(PASSWORD_KEY);
        } catch {}
        setView("signed-out");
      }
    });
  }, [load]);

  useEffect(() => {
    if (view !== "ready") return;
    const id = setInterval(() => {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(PASSWORD_KEY);
      } catch {}
      if (saved && !document.hidden) void load(saved, true);
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [view, load]);

  const signIn = async () => {
    if (!password) return;
    setBusy(true);
    setError(null);
    const ok = await load(password);
    setBusy(false);
    if (ok) {
      try {
        localStorage.setItem(PASSWORD_KEY, password);
      } catch {}
      setPassword("");
    }
  };

  const signOut = () => {
    try {
      localStorage.removeItem(PASSWORD_KEY);
    } catch {}
    setStats(null);
    setView("signed-out");
  };

  return (
    <main className="adm">
      <style>{CSS}</style>
      <header className="adm-head">
        <h1>Admin</h1>
        {view === "ready" && (
          <span className="adm-who">
            <button onClick={signOut}>Sign out</button>
          </span>
        )}
      </header>

      {view === "loading" && <p className="adm-note">Loading…</p>}

      {view === "signed-out" && (
        <section className="adm-card adm-login">
          <h2>Sign in</h2>
          <input
            type="password"
            value={password}
            placeholder="Password"
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void signIn()}
          />
          <button className="adm-btn" onClick={signIn} disabled={busy}>
            {busy ? "Checking…" : "Open dashboard"}
          </button>
          {error && <p className="adm-err">{error}</p>}
        </section>
      )}

      {view === "ready" && stats && <Dashboard s={stats} error={error} />}
    </main>
  );
}

function Dashboard({ s, error }: { s: AdminStats; error: string | null }) {
  const m = (k: "d1" | "d7" | "d30" | "all") => matchesOf(s.games[k]);
  const finishedRate = pct(s.games.d30.finished, s.games.d30.started);
  const c = s.cohort_30d;
  const tracked = s.tracking_since ? new Date(s.tracking_since).toLocaleDateString() : null;
  const maxGames = Math.max(1, ...s.daily.map((d) => d.games));
  const maxSignups = Math.max(1, ...s.daily.map((d) => d.signups));
  const maxHour = Math.max(1, ...s.by_hour.map((h) => h.games));
  const modes = s.game_modes_30d;
  const realMatches30 = (modes.stranger ?? 0) + (modes.friend ?? 0);

  return (
    <>
      {error && <p className="adm-err">{error}</p>}
      <p className="adm-note">
        Updated {ago(s.generated_at)} · refreshes every 30 seconds · days are in India time
        {tracked
          ? ` · live activity tracking began ${tracked}, so active-player and game counts start from then`
          : " · live activity tracking starts when the first player opens the updated site"}
      </p>

      <h2 className="adm-h">Right now</h2>
      <div className="adm-grid">
        <Stat label="Online now" value={s.active.online} tone="lime" sub="page open, last 2.5 min" />
        <Stat label="Playing now" value={s.playing_now.total} tone="yellow"
          sub={`${s.playing_now.computer} vs computer · ${s.playing_now.stranger} stranger · ${s.playing_now.friend} friend`} />
      </div>

      <h2 className="adm-h">Players</h2>
      <Table
        head={["", "Today", "7 days", "30 days", "All time"]}
        rows={[
          ["New signups", s.signups.d1, s.signups.d7, s.signups.d30, s.players_total],
          ["Active players (opened the game)", s.active.d1, s.active.d7, s.active.d30, s.active.tracked],
          ["Players who played a game", s.players_who_played.d1, s.players_who_played.d7, s.players_who_played.d30, s.players_who_played.all],
        ]}
      />

      <h2 className="adm-h">Games</h2>
      <Table
        head={["", "Today", "7 days", "30 days", "All time"]}
        rows={[
          ["Games played", m("d1"), m("d7"), m("d30"), m("all")],
          ["Games finished (sides)", s.games.d1.finished, s.games.d7.finished, s.games.d30.finished, s.games.all.finished],
        ]}
      />
      <div className="adm-grid">
        <Stat label="Finish rate, 30 days" value={finishedRate} sub="games played to the last ball" />
        <Stat label="Vs computer, 30 days" value={s.games.d30.computer} sub={`${pct(s.games.d30.computer, m("d30") || 1)} of games`} />
        <Stat label="Vs a person, 30 days" value={realMatches30 ? Math.round(realMatches30 / 2) : 0}
          sub={`${Math.round((modes.friend ?? 0) / 2)} friend · ${Math.round((modes.stranger ?? 0) / 2)} stranger`} />
        <Stat label="Saved friend results" value={s.saved_friend_results.all} sub="scorecard rows, includes before tracking" />
      </div>

      <h2 className="adm-h">Are players sticking?</h2>
      <div className="adm-grid">
        <Stat label="Signed up (30d)" value={c.signed_up} />
        <Stat label="Played a game" value={pct(c.played, c.signed_up)} sub={`${c.played} of ${c.signed_up}`} />
        <Stat label="Came back later" value={pct(c.came_back, c.signed_up)} sub="returned 1+ day after signup" />
        <Stat label="Have a friend added" value={pct(s.players_with_friend, s.players_total)}
          sub={`${s.friendships.accepted} friendships · ${s.friendships.pending} pending`} />
      </div>

      <h2 className="adm-h">Last 30 days</h2>
      <Bars title="Games per day" data={s.daily.map((d) => ({ label: d.day, v: d.games }))} max={maxGames} color="var(--gc-blue)" />
      <Bars title="New signups per day" data={s.daily.map((d) => ({ label: d.day, v: d.signups }))} max={maxSignups} color="var(--gc-lime)" />
      <Bars title="Games by hour of day (India time)" data={s.by_hour.map((h) => ({ label: `${h.hour}:00`, v: h.games }))} max={maxHour} color="var(--gc-yellow)" />

      <div className="adm-two">
        <section>
          <h2 className="adm-h">Most active, 7 days</h2>
          <Table head={["Username", "Games"]} rows={s.top_players.map((p) => [p.username, p.games])} empty="No games logged yet" />
        </section>
        <section>
          <h2 className="adm-h">Newest players</h2>
          <Table
            head={["Username", "Name", "Joined", "Last seen"]}
            rows={s.recent_signups.map((p) => [p.username, p.name, ago(p.created_at), ago(p.last_seen)])}
          />
        </section>
      </div>
    </>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: number | string; sub?: string; tone?: "lime" | "yellow" }) {
  return (
    <div className="adm-card adm-stat" style={tone ? { background: `var(--gc-${tone})` } : undefined}>
      <span className="adm-label">{label}</span>
      <span className="adm-num">{value}</span>
      {sub && <span className="adm-sub">{sub}</span>}
    </div>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: (string | number)[][]; empty?: string }) {
  return (
    <div className="adm-card adm-scroll">
      <table>
        <thead>
          <tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={head.length}>{empty ?? "Nothing yet"}</td></tr>
          )}
          {rows.map((r, i) => (
            <tr key={i}>{r.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Bars({ title, data, max, color }: { title: string; data: { label: string; v: number }[]; max: number; color: string }) {
  return (
    <div className="adm-card">
      <span className="adm-label">{title}</span>
      <div className="adm-bars">
        {data.map((d, i) => (
          <div key={i} className="adm-bar" title={`${d.label}: ${d.v}`}>
            <div style={{ height: `${(d.v / max) * 100}%`, background: color }} />
          </div>
        ))}
      </div>
      <div className="adm-axis">
        <span>{data[0]?.label}</span>
        <span>peak {max}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

const CSS = `
.adm{max-width:960px;margin:0 auto;padding:24px 16px 64px;font-family:var(--font-ui);color:var(--gc-ink);background:var(--gc-cream);min-height:100vh}
.adm-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap}
.adm-head h1{font-family:var(--font-display);font-size:36px;text-transform:uppercase}
.adm-who{font-size:14px}.adm-who button{text-decoration:underline;font-weight:700}
.adm-h{font-family:var(--font-display);font-size:18px;text-transform:uppercase;margin:28px 0 10px}
.adm-note{font-size:13px;margin:8px 0;opacity:.75}
.adm-err{margin-top:10px;font-weight:700;color:var(--gc-loss)}
.adm-card{background:var(--gc-paper);border:var(--gc-b) solid var(--gc-ink);box-shadow:var(--gc-shadow-press);padding:14px;margin-bottom:12px}
.adm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.adm-grid .adm-card{margin-bottom:0}
.adm-stat{display:flex;flex-direction:column;gap:4px}
.adm-label{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
.adm-num{font-family:var(--font-num);font-size:38px;font-weight:700;line-height:1.1}
.adm-sub{font-size:12px;opacity:.75}
.adm-scroll{overflow-x:auto;padding:0}
.adm table{width:100%;border-collapse:collapse;font-size:14px}
.adm th,.adm td{padding:9px 12px;text-align:left;border-bottom:2px solid var(--gc-ink);white-space:nowrap}
.adm th:not(:first-child),.adm td:not(:first-child){font-family:var(--font-num)}
.adm tr:last-child td{border-bottom:0}
.adm-bars{display:flex;align-items:flex-end;gap:2px;height:110px;margin:10px 0 4px}
.adm-bar{flex:1;height:100%;display:flex;align-items:flex-end}
.adm-bar div{width:100%;min-height:1px;border:1px solid var(--gc-ink)}
.adm-axis{display:flex;justify-content:space-between;font-size:11px;opacity:.7}
.adm-two{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:0 16px}
.adm-login{max-width:420px;display:flex;flex-direction:column;gap:12px;margin-top:24px}
.adm-login h2{font-family:var(--font-display);text-transform:uppercase}
.adm-login input{border:var(--gc-b) solid var(--gc-ink);padding:10px;font-size:16px}
.adm-btn{background:var(--gc-lime);border:var(--gc-b) solid var(--gc-ink);box-shadow:var(--gc-shadow-press);padding:10px;font-weight:700}
.adm-btn:disabled{opacity:.6}
`;
