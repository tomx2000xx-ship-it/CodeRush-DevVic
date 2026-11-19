type D1Statement = any;
type D1DatabaseLike = { prepare(sql: string): any; batch(statements: any[]): Promise<any> };
type OpenFootballMatch = {
  date?: string; time?: string; round?: string;
  team1?: string; team2?: string;
  score?: { ft?: [number | null, number | null] };
};
type Dataset = { name?: string; matches?: OpenFootballMatch[] };

const DATASETS = [
  { path: "2026-27/en.1.json", country: "England", league: "Premier League", code: "en1" },
  { path: "2026-27/en.2.json", country: "England", league: "Championship", code: "en2" },
  { path: "2026-27/de.1.json", country: "Germany", league: "Bundesliga", code: "de1" },
  { path: "2026-27/es.1.json", country: "Spain", league: "La Liga", code: "es1" },
  { path: "2026-27/it.1.json", country: "Italy", league: "Serie A", code: "it1" },
  { path: "2026-27/fr.1.json", country: "France", league: "Ligue 1", code: "fr1" },
  { path: "2026-27/nl.1.json", country: "Netherlands", league: "Eredivisie", code: "nl1" },
  { path: "2026-27/pt.1.json", country: "Portugal", league: "Primeira Liga", code: "pt1" },
] as const;

const SOURCE = "openfootball";
const BASE = "https://raw.githubusercontent.com/openfootball/football.json/master/";
const isoNow = () => new Date().toISOString();

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
const LEAGUE_TIME_ZONES: Record<string, string> = {
  England: "Europe/London", Germany: "Europe/Berlin", Spain: "Europe/Madrid",
  Italy: "Europe/Rome", France: "Europe/Paris", Netherlands: "Europe/Amsterdam",
  Portugal: "Europe/Lisbon",
};
function kickoff(match: OpenFootballMatch, country: string): string {
  const date = match.date || "";
  if (!validDate(date)) return "";
  const time = match.time || "";
  if (!/^\d{2}:\d{2}$/.test(time)) return date;
  const zone = LEAGUE_TIME_ZONES[country];
  if (!zone) return date;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let utc = target;
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(utc));
    const get = (key: string) => Number(parts.find(part => part.type === key)?.value || 0);
    const represented = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
    utc += target - represented;
  }
  return new Date(utc).toISOString();
}
function parseScore(match: OpenFootballMatch): [number | null, number | null] {
  const score = match.score?.ft;
  if (!Array.isArray(score) || score.length !== 2) return [null, null];
  const home = score[0], away = score[1];
  return [Number.isInteger(home) && Number(home) >= 0 ? Number(home) : null,
          Number.isInteger(away) && Number(away) >= 0 ? Number(away) : null];
}
async function loadDataset(path: string): Promise<Dataset> {
  const response = await fetch(BASE + path, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10000),
    cf: { cacheTtl: 1800, cacheEverything: true },
  });
  if (!response.ok) throw new Error("OpenFootball dataset " + path + " returned HTTP " + response.status);
  const data = await response.json() as Dataset;
  if (!Array.isArray(data.matches)) throw new Error("OpenFootball dataset " + path + " has an invalid schema");
  return data;
}

export async function syncOpenFootballFixtures(db: D1DatabaseLike): Promise<{ fetched: number; stored: number; datasets: number; errors: string[] }> {
  const cutoff = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  let fetched = 0, stored = 0, datasets = 0;
  const errors: string[] = [];
  const statements: D1Statement[] = [];
  for (let offset = 0; offset < DATASETS.length; offset += 4) {
    const group = DATASETS.slice(offset, offset + 4);
    const results = await Promise.all(group.map(async item => {
      try { return { item, data: await loadDataset(item.path) }; }
      catch (error) { errors.push(item.path + ": " + (error instanceof Error ? error.message : "fetch failed")); return null; }
    }));
    for (const result of results) {
      if (!result) continue;
      datasets++;
      const { item, data } = result;
      for (const match of data.matches || []) {
        if (!match.team1 || !match.team2) continue;
        const date = match.date || "";
        if (!validDate(date) || date < cutoff || date > horizon) continue;
        fetched++;
        const id = "of-" + stableHash([item.code, date, match.team1, match.team2].join("|"));
        const [homeScore, awayScore] = parseScore(match);
        const completed = homeScore !== null && awayScore !== null;
        const status = completed ? "FT" : "NS";
        const raw = JSON.stringify({
          source: SOURCE, sourcePath: item.path, sourceMatch: match,
          fixture: { id, date: kickoff(match, item.country), status: { short: status, long: completed ? "Match Finished" : "Not Started", elapsed: null } },
          league: { id: parseInt(stableHash(item.code), 16), name: item.league, country: item.country, season: Number(date.slice(0, 4)) },
          teams: { home: { name: match.team1 }, away: { name: match.team2 } },
          goals: { home: homeScore, away: awayScore },
          score: { fulltime: { home: homeScore, away: awayScore } },
        });
        statements.push(db.prepare(`
          INSERT INTO sports_fixtures
            (id,league_id,league_name,country,season,kickoff,status_short,status_long,elapsed,home_team,away_team,
             home_score,away_score,result_home_score,result_away_score,is_live,updated_at,raw_json)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET
            league_name=excluded.league_name,country=excluded.country,season=excluded.season,
            kickoff=excluded.kickoff,
            status_short=CASE WHEN sports_fixtures.status_short IN ('1H','HT','2H','ET','PEN','LIVE') THEN sports_fixtures.status_short ELSE excluded.status_short END,
            status_long=CASE WHEN sports_fixtures.status_short IN ('1H','HT','2H','ET','PEN','LIVE') THEN sports_fixtures.status_long ELSE excluded.status_long END,
            home_score=COALESCE(excluded.home_score,sports_fixtures.home_score),
            away_score=COALESCE(excluded.away_score,sports_fixtures.away_score),
            result_home_score=COALESCE(excluded.result_home_score,sports_fixtures.result_home_score),
            result_away_score=COALESCE(excluded.result_away_score,sports_fixtures.result_away_score),
            updated_at=excluded.updated_at,raw_json=excluded.raw_json
        `).bind(
          id, parseInt(stableHash(item.code), 16), item.league, item.country, Number(date.slice(0, 4)),
          kickoff(match, item.country), status, completed ? "Match Finished" : "Not Started", null, match.team1, match.team2,
          homeScore, awayScore, homeScore, awayScore, 0, isoNow(), raw
        ));
      }
    }
  }
  for (let i = 0; i < statements.length; i += 80) {
    await db.batch(statements.slice(i, i + 80));
    stored += Math.min(80, statements.length - i);
  }
  return { fetched, stored, datasets, errors: errors.slice(0, 20) };
}

export const OPENFOOTBALL_SOURCE = "https://github.com/openfootball/football.json";
