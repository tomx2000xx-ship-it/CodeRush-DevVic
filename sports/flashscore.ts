type D1Like = { prepare(sql: string): any; batch(statements: any[]): Promise<any> };
export type FlashscoreEnv = { DB: D1Like };

type FlashscoreMatch = {
  id?: string; start_time?: string; date?: string; status?: string; stage?: string;
  home_score?: number | null; away_score?: number | null;
  home?: { id?: string; name?: string; short_name?: string; logo?: string };
  away?: { id?: string; name?: string; short_name?: string; logo?: string };
};
type FlashscoreCompetition = {
  competition?: { id?: string; name?: string; logo?: string; country?: { name?: string } };
  matches?: FlashscoreMatch[];
};
type Snapshot = {
  competitions?: FlashscoreCompetition[];
  odds?: Record<string, any>;
  details?: Record<string, { summary?: any; statistics?: any }>;
  verification?: Record<string, { details?: any; summary?: any }>;
};

const nowIso = () => new Date().toISOString();
const hashInt = (value: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
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
const isFinal = (code: string) => ["FT", "AET", "PEN", "AWD", "WO"].includes(code);
const isLive = (code: string) => ["1H", "HT", "2H", "ET", "P", "LIVE"].includes(code);

async function writeBatches(db: D1Like, statements: any[]): Promise<void> {
  for (let offset = 0; offset < statements.length; offset += 50) await db.batch(statements.slice(offset, offset + 50));
}

function verifiedFinal(match: FlashscoreMatch, code: string, verification: any): { home: number; away: number } | null {
  if (!isFinal(code) || !verification?.details || !verification?.summary) return null;
  const home = scoreValue(match.home_score), away = scoreValue(match.away_score);
  const dh = scoreValue(verification.details.home_score), da = scoreValue(verification.details.away_score);
  const sh = scoreValue(verification.summary.home_score), sa = scoreValue(verification.summary.away_score);
  if (home === null || away === null || dh === null || da === null || sh === null || sa === null) return null;
  return home === dh && away === da && home === sh && away === sa ? { home, away } : null;
}

function oddsStatements(db: D1Like, fixtureId: string, matchId: string, kickoffMs: number, odds: any): any[] {
  const now = Date.now();
  if (kickoffMs <= now || kickoffMs > now + 90 * 60 * 1000) return [];
  const markets = Array.isArray(odds?.markets) ? odds.markets : [];
  const statements: any[] = [], snapshotAt = nowIso();
  for (const market of markets) {
    if (String(market.bet_type || "").toUpperCase() !== "HOME_DRAW_AWAY" ||
        String(market.bet_scope || "").toUpperCase() !== "FULL_TIME") continue;
    const bookmaker = market.bookmaker || {};
    const rawId = Number(bookmaker.id);
    const bookmakerId = Number.isSafeInteger(rawId) && rawId > 0 ? rawId : hashInt(String(bookmaker.name || "Unknown bookmaker"));
    const bookmakerName = String(bookmaker.name || "Bookmaker");
    for (const selection of market.selections || []) {
      const key = String(selection.selection || "").toLowerCase();
      const outcome = key === "home" ? "home" : key === "draw" ? "draw" : key === "away" ? "away" : null;
      const odd = Number(selection.value);
      if (!outcome || !Number.isFinite(odd) || odd <= 1) continue;
      statements.push(db.prepare(`
        INSERT OR IGNORE INTO sports_odds
          (fixture_id,bookmaker_id,bookmaker_name,market_id,market_name,outcome_key,outcome_name,odd,handicap,suspended,updated_at)
        VALUES (?,?,?,1,'Match Winner',?,?,?,'0',?,?)
      `).bind(fixtureId,bookmakerId,bookmakerName,outcome,
        outcome === "home" ? "Home win" : outcome === "draw" ? "Draw" : "Away win",
        odd,selection.is_active === false ? 1 : 0,snapshotAt));
    }
  }
  return statements;
}

export async function ingestFlashscoreSnapshot(env: FlashscoreEnv, payload: Snapshot): Promise<{ fixtures: number; odds: number; live: number; final: number; verified: number }> {
  const now = nowIso(), fixtures: any[] = [], statements: any[] = [];
  const oddsStatementsToWrite: any[] = [];
  let live = 0, final = 0, verified = 0;
  for (const group of payload.competitions || []) {
    const competition = group.competition || {};
    for (const match of group.matches || []) {
      const home = match.home || {}, away = match.away || {};
      const kickoff = match.start_time || (match.date ? match.date + "T00:00:00.000Z" : "");
      const kickoffMs = Date.parse(kickoff);
      if (!match.id || !home.name || !away.name || !Number.isFinite(kickoffMs)) continue;
      const status = statusCode(String(match.status || ""),String(match.stage || ""));
      const homeScore = scoreValue(match.home_score), awayScore = scoreValue(match.away_score);
      const verification = verifiedFinal(match,status,payload.verification?.[match.id]);
      if (isLive(status)) live++;
      if (isFinal(status)) final++;
      if (verification) verified++;
      const detail = payload.details?.[match.id] || {};
      const raw = {
        source:"flashscore",sourceMatchId:match.id,
        teams:{home:{id:home.id,logo:home.logo},away:{id:away.id,logo:away.logo}},
        league:{id:competition.id,logo:competition.logo},
        sourceMatch:match,
        flashscoreSummary:detail.summary||null,
        flashscoreStatistics:detail.statistics||null,
      };
      const fixtureId = "fs-" + match.id;
      fixtures.push(fixtureId);
      statements.push(env.DB.prepare(`
        INSERT INTO sports_fixtures
          (id,league_id,league_name,country,season,kickoff,status_short,status_long,elapsed,
           home_team,away_team,home_code,away_code,home_score,away_score,result_home_score,
           result_away_score,result_checked_at,is_live,updated_at,raw_json)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET
          league_id=excluded.league_id,league_name=excluded.league_name,country=excluded.country,
          season=excluded.season,kickoff=excluded.kickoff,status_short=excluded.status_short,
          status_long=excluded.status_long,home_team=excluded.home_team,away_team=excluded.away_team,
          home_code=excluded.home_code,away_code=excluded.away_code,home_score=excluded.home_score,
          away_score=excluded.away_score,
          result_home_score=COALESCE(excluded.result_home_score,sports_fixtures.result_home_score),
          result_away_score=COALESCE(excluded.result_away_score,sports_fixtures.result_away_score),
          result_checked_at=COALESCE(excluded.result_checked_at,sports_fixtures.result_checked_at),
          is_live=excluded.is_live,updated_at=excluded.updated_at,raw_json=excluded.raw_json
      `).bind(fixtureId,hashInt(String(competition.name||"Football")+"|"+String(competition.country?.name||"")),
        String(competition.name||"Football"),String(competition.country?.name||""),new Date(kickoffMs).getUTCFullYear(),
        new Date(kickoffMs).toISOString(),status,String(match.stage||match.status||"Scheduled"),null,
        String(home.name),String(away.name),String(home.short_name||""),String(away.short_name||""),
        homeScore,awayScore,verification?.home??null,verification?.away??null,verification?now:null,
        isLive(status)?1:0,now,JSON.stringify(raw)));
      oddsStatementsToWrite.push(...oddsStatements(env.DB,fixtureId,match.id,kickoffMs,payload.odds?.[match.id]));
    }
  }
  await writeBatches(env.DB,statements);
  if (oddsStatementsToWrite.length) await writeBatches(env.DB,oddsStatementsToWrite);
  await env.DB.prepare(`
    INSERT INTO sports_source_sync_state(provider,last_success_at,last_attempt_at,last_error,datasets_loaded,fixtures_loaded,updated_at)
    VALUES ('flashscore',?,?,NULL,1,?,?)
    ON CONFLICT(provider) DO UPDATE SET last_success_at=excluded.last_success_at,
      last_attempt_at=excluded.last_attempt_at,last_error=NULL,datasets_loaded=1,
      fixtures_loaded=excluded.fixtures_loaded,updated_at=excluded.updated_at
  `).bind(now,now,fixtures.length,now).run();
  return {fixtures:fixtures.length,odds:oddsStatementsToWrite.length,live,final,verified};
}
