type D1Like = {
  prepare(sql: string): any;
  batch(statements: any[]): Promise<any>;
};

export type FlashscoreEnv = {
  DB: D1Like;
  FLASHSCORE_SCRAPER: DurableObjectNamespace;
};

type FlashscoreMatch = {
  id?: string;
  start_time?: string;
  date?: string;
  status?: string;
  stage?: string;
  home_score?: number | null;
  away_score?: number | null;
  home?: { id?: string; name?: string; short_name?: string; logo?: string };
  away?: { id?: string; name?: string; short_name?: string; logo?: string };
};
type FlashscoreCompetition = {
  competition?: { id?: string; name?: string; country?: { name?: string } };
  matches?: FlashscoreMatch[];
};

const nowIso = () => new Date().toISOString();
const hashInt = (value: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) & 0x7fffffff || 1;
};
const scoreValue = (value: unknown): number | null =>
  Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;

function statusCode(status: string, stage: string): string {
  const value = (stage + " " + status).toLowerCase();
  if (value.includes("walkover")) return "WO";
  if (value.includes("awarded")) return "AWD";
  if (value.includes("after penalties")) return "PEN";
  if (value.includes("penalties") || value.includes("penalty shootout")) return "P";
  if (value.includes("after extra time")) return "AET";
  if (value.includes("extra time")) return "ET";
  if (value.includes("half time") || value.includes("halftime")) return "HT";
  if (value.includes("1st half") || value.includes("first half")) return "1H";
  if (value.includes("2nd half") || value.includes("second half")) return "2H";
  if (value.includes("abandoned")) return "ABD";
  if (value.includes("postponed")) return "PST";
  if (value.includes("cancelled") || value.includes("canceled")) return "CANC";
  if (value.includes("interrupted")) return "INT";
  if (value.includes("suspended")) return "SUSP";
  if (value.includes("finished") || value.includes("ended") || value.includes("full time")) return "FT";
  if (value.includes("live") || value.includes("in progress")) return "LIVE";
  return "NS";
}
function isFinal(code: string): boolean {
  return ["FT", "AET", "PEN", "AWD", "WO"].includes(code);
}
function isLive(code: string): boolean {
  return ["1H", "HT", "2H", "ET", "PEN", "LIVE"].includes(code);
}
function normalizeMatch(match: FlashscoreMatch, group: FlashscoreCompetition, now: string) {
  const competition = group.competition || {};
  const home = match.home || {}, away = match.away || {};
  const kickoff = match.start_time || (match.date ? match.date + "T00:00:00.000Z" : "");
  const kickoffMs = Date.parse(kickoff);
  if (!match.id || !home.name || !away.name || !Number.isFinite(kickoffMs)) return null;
  const status = statusCode(String(match.status || ""), String(match.stage || ""));
  const homeScore = scoreValue(match.home_score), awayScore = scoreValue(match.away_score);
  const final = isFinal(status) && homeScore !== null && awayScore !== null;
  const id = "fs-" + match.id;
  const raw = {
    source: "flashscore",
    sourceMatchId: match.id,
    teams: { home: { id: home.id, logo: home.logo }, away: { id: away.id, logo: away.logo } },
    league: { id: competition.id, logo: null },
    sourceMatch: match,
  };
  return {
    id,
    sourceId: match.id,
    leagueId: hashInt(String(competition.name || "Football") + "|" + String(competition.country?.name || "")),
    league: String(competition.name || "Football"),
    country: String(competition.country?.name || ""),
    kickoff: new Date(kickoffMs).toISOString(),
    season: new Date(kickoffMs).getUTCFullYear(),
    status,
    statusLong: String(match.stage || match.status || "Scheduled"),
    elapsed: null as number | null,
    home: String(home.name),
    away: String(away.name),
    homeCode: String(home.short_name || ""),
    awayCode: String(away.short_name || ""),
    homeScore,
    awayScore,
    resultHome: final ? homeScore : null,
    resultAway: final ? awayScore : null,
    resultCheckedAt: final ? now : null,
    live: isLive(status),
    rawJson: JSON.stringify(raw),
    kickoffMs,
  };
}

async function scraperRequest<T>(env: FlashscoreEnv, path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL("http://container" + path);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await env.FLASHSCORE_SCRAPER.getByName("primary").fetch(new Request(url));
  if (!response.ok) throw new Error("Flashscore scraper " + path + " returned HTTP " + response.status);
  return await response.json() as T;
}

async function writeBatches(db: D1Like, statements: any[]): Promise<void> {
  for (let offset = 0; offset < statements.length; offset += 50) {
    await db.batch(statements.slice(offset, offset + 50));
  }
}

async function storeOdds(env: FlashscoreEnv, match: { id: string; sourceId: string; kickoffMs: number }): Promise<number> {
  const now = Date.now();
  if (match.kickoffMs <= now || match.kickoffMs > now + 6 * 60 * 60 * 1000) return 0;
  const existing = await env.DB.prepare("SELECT 1 AS found FROM sports_odds WHERE fixture_id=? AND market_id=1 LIMIT 1").bind(match.id).first();
  if (existing) return 0;

  const payload = await scraperRequest<any>(env, "/matches/odds", {
    match: match.sourceId, bet_type: "home-draw-away", bet_scope: "full-time", geo: "NG",
  });
  const statements: any[] = [];
  const snapshotAt = nowIso();
  for (const market of payload.markets || []) {
    if (String(market.bet_type || "").toUpperCase() !== "HOME_DRAW_AWAY" ||
        String(market.bet_scope || "").toUpperCase() !== "FULL_TIME") continue;
    const bookmaker = market.bookmaker || {};
    const rawBookmakerId = Number(bookmaker.id);
    const bookmakerId = Number.isSafeInteger(rawBookmakerId) && rawBookmakerId > 0
      ? rawBookmakerId : hashInt(String(bookmaker.name || "Unknown bookmaker"));
    const bookmakerName = String(bookmaker.name || "Bookmaker");
    for (const selection of market.selections || []) {
      const key = String(selection.selection || "").toLowerCase();
      const outcomeKey = key === "home" ? "home" : key === "draw" ? "draw" : key === "away" ? "away" : null;
      const odd = Number(selection.value);
      if (!outcomeKey || !Number.isFinite(odd) || odd <= 1) continue;
      statements.push(env.DB.prepare(`
        INSERT OR IGNORE INTO sports_odds
          (fixture_id,bookmaker_id,bookmaker_name,market_id,market_name,outcome_key,outcome_name,odd,handicap,suspended,updated_at)
        VALUES (?,?,?,1,'Match Winner',?,?,?,'0',?,?)
      `).bind(match.id, bookmakerId, bookmakerName, outcomeKey,
        outcomeKey === "home" ? "Home win" : outcomeKey === "draw" ? "Draw" : "Away win",
        odd, selection.is_active === false ? 1 : 0, snapshotAt));
    }
  }
  if (statements.length) await writeBatches(env.DB, statements);
  return statements.length;
}

export async function syncFlashscoreDay(env: FlashscoreEnv, date: string): Promise<{ fixtures: number; odds: number; live: number; final: number }> {
  const payload = await scraperRequest<any>(env, "/matches", {
    sport: "football", date, timezone: "Africa/Lagos",
  });
  const now = nowIso();
  const fixtures: ReturnType<typeof normalizeMatch>[] = [];
  for (const group of (payload.competitions || []) as FlashscoreCompetition[]) {
    for (const match of group.matches || []) {
      const normalized = normalizeMatch(match, group, now);
      if (normalized) fixtures.push(normalized);
    }
  }
  const statements = fixtures.map(item => env.DB.prepare(`
    INSERT INTO sports_fixtures
      (id,league_id,league_name,country,season,kickoff,status_short,status_long,elapsed,
       home_team,away_team,home_code,away_code,home_score,away_score,result_home_score,
       result_away_score,result_checked_at,is_live,updated_at,raw_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      league_id=excluded.league_id,league_name=excluded.league_name,country=excluded.country,
      season=excluded.season,kickoff=excluded.kickoff,status_short=excluded.status_short,
      status_long=excluded.status_long,elapsed=excluded.elapsed,home_team=excluded.home_team,
      away_team=excluded.away_team,home_code=excluded.home_code,away_code=excluded.away_code,
      home_score=excluded.home_score,away_score=excluded.away_score,
      result_home_score=COALESCE(excluded.result_home_score,sports_fixtures.result_home_score),
      result_away_score=COALESCE(excluded.result_away_score,sports_fixtures.result_away_score),
      result_checked_at=COALESCE(excluded.result_checked_at,sports_fixtures.result_checked_at),
      is_live=excluded.is_live,updated_at=excluded.updated_at,raw_json=excluded.raw_json
  `).bind(item!.id,item!.leagueId,item!.league,item!.country,item!.season,item!.kickoff,item!.status,
    item!.statusLong,item!.elapsed,item!.home,item!.away,item!.homeCode,item!.awayCode,item!.homeScore,
    item!.awayScore,item!.resultHome,item!.resultAway,item!.resultCheckedAt,item!.live?1:0,now,item!.rawJson));
  await writeBatches(env.DB, statements);

  let odds = 0;
  const nowMs = Date.now();
  for (const item of fixtures) {
    if (item && item.kickoffMs > nowMs && item.kickoffMs <= nowMs + 6 * 60 * 60 * 1000) {
      try { odds += await storeOdds(env, item); }
      catch (error) { console.error("Flashscore odds snapshot failed", item.id, error instanceof Error ? error.message : "unknown"); }
    }
  }
  return {
    fixtures: fixtures.length,
    odds,
    live: fixtures.filter(item => item?.live).length,
    final: fixtures.filter(item => item && isFinal(item.status)).length,
  };
}

export async function flashscoreProxy(env: FlashscoreEnv, path: string, params: Record<string, string> = {}): Promise<Response> {
  const payload = await scraperRequest<unknown>(env, path, params);
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
