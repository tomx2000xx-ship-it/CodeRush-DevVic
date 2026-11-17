interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  DB: D1Database;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_BROADCAST_SECRET?: string;
  TELEGRAM_CHANNEL_URL?: string;
  TELEGRAM_GROUP_URL?: string;
  CODERUSH_ADMIN_TELEGRAM_IDS?: string;
  API_FOOTBALL_KEY?: string;
  API_FOOTBALL_BOOKMAKER_ID?: string;
}

const APP_URL = "https://coderush-devvic.tomx2000xx.workers.dev";
const WEBHOOK_URL = APP_URL + "/api/telegram/webhook";

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function webhookSecret(token: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(token), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("CodeRush Telegram webhook authentication v1"));
  return btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

async function telegram<T>(env: Env, method: string, payload?: Record<string, unknown>): Promise<T> {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("Telegram bot token is not configured");
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: payload ? "POST" : "GET",
    headers: payload ? { "content-type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const result = await response.json() as { ok?: boolean; result?: T; description?: string };
  if (!response.ok || !result.ok) throw new Error(result.description || `Telegram ${method} failed`);
  return result.result as T;
}

async function ensureWebhook(token: string): Promise<{ configured: boolean; detail?: string }> {
  const secret = await webhookSecret(token);
  const infoResponse = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  const info = await infoResponse.json() as { ok?: boolean; result?: { url?: string } };
  if (!infoResponse.ok || !info.ok) return { configured: false, detail: "Telegram getWebhookInfo request failed" };
  if (info.result?.url === WEBHOOK_URL) return { configured: true };
  const setResponse = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: WEBHOOK_URL, secret_token: secret, allowed_updates: ["message"], drop_pending_updates: false }),
  });
  const result = await setResponse.json() as { ok?: boolean; description?: string };
  return setResponse.ok && result.ok ? { configured: true } : { configured: false, detail: result.description || "Telegram rejected setWebhook" };
}

const welcomeText = [
  "✅ مرحباً بك في CodeRush — ساحة الرياضة الرقمية!", "",
  "⚽ اكتشف تجربة رياضية تفاعلية تجمع بين شغف كرة القدم ومتابعة المباريات واستكشاف تفاصيلها.", "",
  "📊 تابع المواجهات، استكشف الاحتمالات، وجرّب أدوات CodeRush في بيئة تجريبية مصممة لتمنحك تجربة ممتعة وسهلة.", "",
  "تنبيه: CodeRush حالياً نسخة تجريبية فقط. جميع الأرصدة والاحتمالات والأنشطة افتراضية، ولا توجد أموال حقيقية أو رهانات أو مدفوعات.", "",
  "👋 أهلاً بك، ونتمنى لك تجربة ممتعة!"
].join("\\n");

async function sendWelcome(chatId: number, env: Env) {
  const keyboard: Array<Array<Record<string, unknown>>> = [[{ text: "⚽ افتح CodeRush وابدأ الاستكشاف", web_app: { url: APP_URL } }]];
  if (env.TELEGRAM_CHANNEL_URL) keyboard.push([{ text: "💎 اشترك في قناتنا", url: env.TELEGRAM_CHANNEL_URL }]);
  if (env.TELEGRAM_GROUP_URL) keyboard.push([{ text: "👥 انضم إلى مجموعتنا", url: env.TELEGRAM_GROUP_URL }]);
  await telegram(env, "sendMessage", { chat_id: chatId, text: welcomeText, reply_markup: { inline_keyboard: keyboard }, disable_web_page_preview: true });
}

type TelegramMessage = {
  text?: string;
  write_access_allowed?: { from_request?: boolean };
  chat?: { id?: number };
  from?: { id?: number; username?: string; first_name?: string; last_name?: string };
};

async function saveSubscriber(message: TelegramMessage, payload: string, env: Env) {
  const chatId = message.chat?.id;
  const user = message.from;
  if (!chatId || !user?.id) return;
  const referrer = payload.startsWith("ref_") ? payload.slice(4).slice(0, 64) : null;
  const ownCode = `u${user.id}`;
  await env.DB.prepare(`
    INSERT INTO telegram_subscribers (chat_id, telegram_user_id, username, first_name, last_name, referral_code, referred_by, start_payload, status, opted_out, last_seen_at, last_error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
    ON CONFLICT(chat_id) DO UPDATE SET
      telegram_user_id=excluded.telegram_user_id, username=excluded.username, first_name=excluded.first_name,
      last_name=excluded.last_name, referred_by=COALESCE(telegram_subscribers.referred_by, excluded.referred_by),
      start_payload=excluded.start_payload, status='active', opted_out=0,
      last_seen_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), last_error=NULL
  `).bind(String(chatId), String(user.id), user.username || null, user.first_name || null, user.last_name || null, ownCode, referrer && referrer !== ownCode ? referrer : null, payload || null).run();
}

async function processUpdate(update: { message?: TelegramMessage }, env: Env) {
  const message = update.message;
  const chatId = message?.chat?.id;
  const text = message?.text || "";
  if (!message || !chatId) return;
  if (/^\/start(?:@\w+)?(?:\s+(.+))?$/.test(text)) {
    const payload = text.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/)?.[1] || "";
    await saveSubscriber(message, payload, env);
    await sendWelcome(chatId, env);
  } else if (/^\/(stop|unsubscribe)(?:@\w+)?$/.test(text)) {
    await env.DB.prepare("UPDATE telegram_subscribers SET opted_out=1, last_seen_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE chat_id=?").bind(String(chatId)).run();
    await telegram(env, "sendMessage", { chat_id: chatId, text: "تم إيقاف رسائل CodeRush. أرسل /start للاشتراك مجدداً." });
  }
}

async function requireAdmin(request: Request, env: Env): Promise<boolean> {
  if (!env.TELEGRAM_BROADCAST_SECRET) return false;
  const supplied = request.headers.get("authorization") || "";
  return constantTimeEqual(supplied, `Bearer ${env.TELEGRAM_BROADCAST_SECRET}`);
}

async function handleBroadcast(request: Request, env: Env): Promise<Response> {
  if (!(await requireAdmin(request, env))) return json({ ok: false, error: "Unauthorized" }, 401);
  const body = await request.json() as { text?: string; offset?: number; limit?: number };
  const text = (body.text || "").trim();
  if (!text || text.length > 4096) return json({ ok: false, error: "Message text must contain 1–4096 characters" }, 400);
  const offset = Math.max(0, Math.floor(Number(body.offset) || 0));
  const limit = Math.min(100, Math.max(1, Math.floor(Number(body.limit) || 100)));
  const totalRow = await env.DB.prepare("SELECT COUNT(*) AS total FROM telegram_subscribers WHERE status='active' AND opted_out=0 AND write_access_allowed=1").first<{ total: number }>();
  const total = Number(totalRow?.total || 0);
  const recipients = await env.DB.prepare("SELECT chat_id FROM telegram_subscribers WHERE status='active' AND opted_out=0 ORDER BY first_seen_at, chat_id LIMIT ? OFFSET ?").bind(limit, offset).all<{ chat_id: string }>();
  let sent = 0, failed = 0, blocked = 0;
  for (const recipient of recipients.results || []) {
    try {
      await telegram(env, "sendMessage", { chat_id: recipient.chat_id, text, disable_web_page_preview: true });
      sent++;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (/blocked|deactivated|chat not found/i.test(detail)) {
        blocked++;
        await env.DB.prepare("UPDATE telegram_subscribers SET status='blocked', last_error=? WHERE chat_id=?").bind(detail.slice(0, 500), recipient.chat_id).run();
      } else {
        failed++;
        await env.DB.prepare("UPDATE telegram_subscribers SET last_error=? WHERE chat_id=?").bind(detail.slice(0, 500), recipient.chat_id).run();
      }
    }
    await sleep(40);
  }
  const broadcastId = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO telegram_broadcasts (id, message, sent_count, failed_count, blocked_count) VALUES (?, ?, ?, ?, ?)")
    .bind(broadcastId, text, sent, failed, blocked).run();
  const processed = offset + (recipients.results?.length || 0);
  return json({ ok: true, broadcastId, totalEligible: total, offset, processed: recipients.results?.length || 0, sent, failed, blocked, nextOffset: processed < total ? processed : null });
}



async function adminPasswordHash(p:string,s:string):Promise<string>{const salt=new Uint8Array(s.match(/.{2}/g)!.map(x=>parseInt(x,16)));const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(p),"PBKDF2",false,["deriveBits"]);return hex(await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations:100000},key,256))}
const validAdminEmail=(e:string)=>e.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const validAdminPassword=(p:string)=>p.length>=12&&p.length<=128&&/[A-Za-z]/.test(p)&&/[0-9]/.test(p);
async function adminCount(env:Env):Promise<number>{const r=await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_accounts").first<{n:number}>();return Number(r?.n||0)}
function sameOrigin(request:Request):boolean{const o=request.headers.get("origin");return !o||o===new URL(request.url).origin}
async function newAdminSession(request:Request,env:Env,id:string):Promise<Response>{const token=hex(crypto.getRandomValues(new Uint8Array(32)).buffer),hash=await sha256(token),expires=new Date(Date.now()+43200000).toISOString();await env.DB.prepare("INSERT INTO user_sessions(token_hash,user_id,expires_at,user_agent) VALUES(?,?,?,?)").bind(hash,id,expires,(request.headers.get("user-agent")||"").slice(0,300)||null).run();return new Response(JSON.stringify({ok:true}),{headers:{"content-type":"application/json","cache-control":"no-store","set-cookie":sessionCookie(token)}})}
async function adminSetup(request:Request,env:Env):Promise<Response>{if(!sameOrigin(request))return json({ok:false,error:"Invalid origin"},403);if(await adminCount(env))return json({ok:false,error:"Initial setup is already complete. Sign in instead."},409);let b:{email?:string;password?:string;name?:string};try{b=await request.json()}catch{return json({ok:false,error:"Invalid request"},400)}const email=(b.email||"").trim().toLowerCase(),pass=b.password||"",name=(b.name||"Super Administrator").trim().slice(0,60);if(!validAdminEmail(email))return json({ok:false,error:"Enter a valid email."},400);if(!validAdminPassword(pass))return json({ok:false,error:"Password must be at least 12 characters and include letters and numbers."},400);const id="admin_"+crypto.randomUUID(),salt=hex(crypto.getRandomValues(new Uint8Array(16)).buffer),hash=await adminPasswordHash(pass,salt);try{await env.DB.batch([env.DB.prepare("INSERT INTO users(id,display_name,role,status) VALUES(?,?,'admin','active')").bind(id,name||"Super Administrator"),env.DB.prepare("INSERT INTO admin_accounts(user_id,email,password_hash,password_salt,is_super_admin) SELECT ?,?,?,?,1 WHERE NOT EXISTS(SELECT 1 FROM admin_accounts)").bind(id,email,hash,salt)])}catch{return json({ok:false,error:"Setup has already been claimed or the email is already registered. Please sign in."},409)}const row=await env.DB.prepare("SELECT user_id FROM admin_accounts WHERE user_id=? AND is_super_admin=1").bind(id).first();if(!row){await env.DB.prepare("DELETE FROM users WHERE id=?").bind(id).run();return json({ok:false,error:"Another administrator completed setup first. Please sign in."},409)}await recordAuthEvent(env,id,"admin_super_setup",request);return newAdminSession(request,env,id)}
async function adminLogin(request:Request,env:Env):Promise<Response>{if(!sameOrigin(request))return json({ok:false,error:"Invalid origin"},403);let b:{email?:string;password?:string};try{b=await request.json()}catch{return json({ok:false,error:"Invalid request"},400)}const email=(b.email||"").trim().toLowerCase(),pass=b.password||"";if(!validAdminEmail(email)||pass.length>128)return json({ok:false,error:"Invalid email or password."},401);const n=await env.DB.prepare("SELECT COUNT(*) n FROM admin_login_attempts WHERE email=? AND success=0 AND created_at>datetime('now','-15 minutes')").bind(email).first<{n:number}>();if(Number(n?.n||0)>=5)return json({ok:false,error:"Too many attempts. Wait 15 minutes."},429);const a=await env.DB.prepare("SELECT a.user_id,a.password_hash,a.password_salt,u.status FROM admin_accounts a JOIN users u ON u.id=a.user_id WHERE a.email=? COLLATE NOCASE").bind(email).first<{user_id:string;password_hash:string;password_salt:string;status:string}>();const computed=a?await adminPasswordHash(pass,a.password_salt):await adminPasswordHash(pass||"invalid-password","00112233445566778899aabbccddeeff");const valid=!!a&&a.status==="active"&&constantTimeEqual(computed,a.password_hash);await env.DB.prepare("INSERT INTO admin_login_attempts(id,email,success) VALUES(?,?,?)").bind(crypto.randomUUID(),email,valid?1:0).run();if(!valid){await recordAuthEvent(env,a?.user_id||null,"admin_login_rejected",request);return json({ok:false,error:"Invalid email or password."},401)}await env.DB.prepare("DELETE FROM admin_login_attempts WHERE email=? AND success=0").bind(email).run();await recordAuthEvent(env,a!.user_id,"admin_login_success",request);return newAdminSession(request,env,a!.user_id)}
async function adminUsers(request:Request,env:Env):Promise<Response>{const s=await currentSession(request,env);if(!s||s.user.role!=="admin")return json({ok:false,error:"Administrator login required"},401);const actor=await env.DB.prepare("SELECT is_super_admin FROM admin_accounts WHERE user_id=?").bind(s.user.id).first();if(!actor)return json({ok:false,error:"Administrator login required"},401);if(request.method==="GET"){const r=await env.DB.prepare("SELECT a.email,a.is_super_admin,a.created_at,u.display_name FROM admin_accounts a JOIN users u ON u.id=a.user_id ORDER BY a.is_super_admin DESC,a.created_at").all();return json({ok:true,admins:r.results||[]})}if(!sameOrigin(request))return json({ok:false,error:"Invalid origin"},403);let b:{email?:string;password?:string;name?:string};try{b=await request.json()}catch{return json({ok:false,error:"Invalid request"},400)}const email=(b.email||"").trim().toLowerCase(),pass=b.password||"",name=(b.name||"Administrator").trim().slice(0,60);if(!validAdminEmail(email))return json({ok:false,error:"Enter a valid email."},400);if(!validAdminPassword(pass))return json({ok:false,error:"Password must be at least 12 characters and include letters and numbers."},400);const id="admin_"+crypto.randomUUID(),salt=hex(crypto.getRandomValues(new Uint8Array(16)).buffer),hash=await adminPasswordHash(pass,salt);try{await env.DB.batch([env.DB.prepare("INSERT INTO users(id,display_name,role,status) VALUES(?,?,'admin','active')").bind(id,name||"Administrator"),env.DB.prepare("INSERT INTO admin_accounts(user_id,email,password_hash,password_salt,is_super_admin) VALUES(?,?,?, ?,0)").bind(id,email,hash,salt),env.DB.prepare("INSERT INTO admin_audit_logs(id,admin_user_id,action,target_type,target_id,metadata_json) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),s.user.id,"admin_created","admin",id,JSON.stringify({email}))])}catch{return json({ok:false,error:"Could not create account. That email may already be in use."},409)}return json({ok:true},201)}
async function adminHtml(env:Env):Promise<Response>{const setup=(await adminCount(env))===0;const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CodeRush Admin</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#141619;color:#f7f7f5;font:15px system-ui;display:grid;place-items:center;padding:20px}.box{width:min(100%,470px);background:#20252b;border:1px solid #343b44;border-radius:18px;padding:28px}.brand{color:#e14a58;font-weight:800;letter-spacing:2px}.muted,small{color:#aeb6c0;line-height:1.5}label{display:block;margin:14px 0 6px;color:#cbd0d6}input{width:100%;padding:13px;border-radius:9px;border:1px solid #48515c;background:#141619;color:white;font:inherit}button{width:100%;padding:13px;margin-top:16px;border:0;border-radius:9px;background:#b92332;color:white;font:inherit;font-weight:700}button.alt{background:#343b44}.msg{color:#ffb7bd;margin-top:12px}.hidden{display:none}.row{padding:12px 0;border-bottom:1px solid #343b44;display:flex;justify-content:space-between;gap:10px}.tag{color:#6fdbab;font-size:12px}</style><body><main class="box"><div class="brand">CODERUSH · ADMIN</div><section id="auth"><h1>${setup?"Register the first Super Admin":"Administrator sign in"}</h1><p class="muted">${setup?"The first account registered becomes the permanent Super Admin.":"Sign in with your administrator email and password."}</p>${setup?'<label>Name</label><input id="name" autocomplete="name">':""}<label>Email address</label><input id="email" type="email" autocomplete="username"><label>Password</label><input id="password" type="password" autocomplete="${setup?"new-password":"current-password"}">${setup?'<label>Confirm password</label><input id="confirm" type="password">':""}<button id="submit">${setup?"Create Super Admin":"Sign in"}</button><div class="msg" id="msg"></div></section><section id="dash" class="hidden"><h1>Admin dashboard</h1><p class="muted">Create and manage additional administrator logins.</p><div id="list"></div><h3>Sports data</h3><p class="muted">Use your administrator session to refresh the football fixtures and available odds from API-Football.</p><button id="sync">Sync sports feed now</button><div class="msg" id="syncmsg"></div><h3>API-Football diagnostics</h3><p class="muted">Inspect the provider's actual HTTP status and quota headers. This does not send another provider request.</p><button id="probe">Run one-request API test</button><div class="msg" id="probemsg"></div><button class="alt" id="diag">Refresh diagnostics</button><pre id="diagdata" class="muted" style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:320px;overflow:auto;font-size:12px"></pre><h3>Create administrator</h3><label>Name</label><input id="newname"><label>Email</label><input id="newemail" type="email"><label>Temporary password</label><input id="newpass" type="password"><button id="create">Create admin login</button><div class="msg" id="dm"></div><button class="alt" id="logout">Sign out</button></section></main><script>const $=x=>document.getElementById(x),setup=${setup};async function call(url,data,method="POST"){const r=await fetch(url,{method,credentials:"same-origin",headers:data?{"content-type":"application/json"}:{},body:data?JSON.stringify(data):undefined});const j=await r.json();if(!r.ok)throw Error(j.error||"Request failed");return j}async function dashboard(){ $("auth").classList.add("hidden");$("dash").classList.remove("hidden");const j=await call("/api/admin/users",null,"GET");$("list").innerHTML=j.admins.map(a=>'<div class="row"><span>'+a.email+'<br><small>'+a.display_name+'</small></span><span class="tag">'+(a.is_super_admin?"SUPER ADMIN":"ADMIN")+'</span></div>').join("")}call("/api/admin/session",null,"GET").then(dashboard).catch(()=>{});$("submit").onclick=async()=>{try{if(setup&&$("password").value!==$("confirm").value)throw Error("Passwords do not match");await call(setup?"/api/admin/setup":"/api/admin/login",{email:$("email").value,password:$("password").value,name:setup?$("name").value:undefined});await dashboard()}catch(e){$("msg").textContent=e.message}};$("probe").onclick=async()=>{try{$("probe").disabled=true;$("probemsg").textContent="Sending exactly one API-Football request…";const p=await call("/api/admin/sports-probe",{});$("probemsg").textContent="Test succeeded. Fixtures returned: "+p.fixtures+"."}catch(e){$("probemsg").textContent=e.message}finally{$("probe").disabled=false}};$("diag").onclick=async()=>{try{$("diag").disabled=true;$("diagdata").textContent="Loading stored diagnostics…";const d=await call("/api/admin/sports-diagnostics",null,"GET");$("diagdata").textContent=JSON.stringify(d,null,2)}catch(e){$("diagdata").textContent=e.message}finally{$("diag").disabled=false}};$("sync").onclick=async()=>{try{$("sync").disabled=true;$("syncmsg").textContent="Syncing…";const result=await call("/api/sports/sync",{});$("syncmsg").textContent="Sync complete: "+result.fixtures+" fixtures, "+result.odds+" pre-match odds; "+result.liveFixtures+" live fixtures, "+result.liveOdds+" live odds."}catch(e){$("syncmsg").textContent=e.message}finally{$("sync").disabled=false}};$("create").onclick=async()=>{try{await call("/api/admin/users",{name:$("newname").value,email:$("newemail").value,password:$("newpass").value});$("dm").textContent="Admin account created.";await dashboard()}catch(e){$("dm").textContent=e.message}};$("logout").onclick=async()=>{await call("/api/auth/logout",{});location.reload()}</script></body></html>`;return new Response(html,{headers:{"content-type":"text/html;charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","content-security-policy":"default-src 'self';script-src 'unsafe-inline';style-src 'unsafe-inline';base-uri 'none';frame-ancestors 'none'"}})}
type AuthUser = { id: string; telegram_username: string | null; first_name: string | null; last_name: string | null; display_name: string | null; language: string; role: string; status: string; created_at: string; last_login_at: string | null };
const SESSION_COOKIE = "cr_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, "0")).join("");
}
async function sha256(value: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}
async function hmacSha256(keyBytes: Uint8Array, value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}
async function validateTelegramInitData(initData: string, botToken: string): Promise<{ user: { id: number; username?: string; first_name?: string; last_name?: string }; authDate: number } | null> {
  if (!initData || initData.length > 8192) return null;
  const params = new URLSearchParams(initData);
  const suppliedHash = params.get("hash") || "";
  const authDate = Number(params.get("auth_date"));
  const rawUser = params.get("user");
  if (!/^[a-f0-9]{64}$/i.test(suppliedHash) || !Number.isInteger(authDate) || !rawUser) return null;
  const now = Math.floor(Date.now() / 1000);
  if (authDate > now + 60 || now - authDate > 3600) return null;
  params.delete("hash");
  params.delete("signature");
  const dataCheckString = Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => key + "=" + value).join("
");
  const secretKey = await hmacSha256(new TextEncoder().encode(botToken), "WebAppData");
  const expected = await hmacSha256(new Uint8Array(secretKey.match(/.{2}/g)!.map(pair => parseInt(pair, 16))), dataCheckString);
  if (!constantTimeEqual(expected.toLowerCase(), suppliedHash.toLowerCase())) return null;
  try {
    const user = JSON.parse(rawUser) as { id?: number; username?: string; first_name?: string; last_name?: string };
    if (!Number.isSafeInteger(user.id) || Number(user.id) <= 0) return null;
    return { user: { id: Number(user.id), username: user.username, first_name: user.first_name, last_name: user.last_name }, authDate };
  } catch { return null; }
}
function cookieValue(request: Request, name: string): string | null {
  const cookies = request.headers.get("cookie") || "";
  for (const part of cookies.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return null;
}
function sessionCookie(token: string): string {
  return SESSION_COOKIE + "=" + token + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + SESSION_SECONDS;
}
function clearSessionCookie(): string {
  return SESSION_COOKIE + "=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}
async function currentSession(request: Request, env: Env): Promise<{ tokenHash: string; user: AuthUser } | null> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(`
    SELECT u.id, u.telegram_username, u.first_name, u.last_name, u.display_name, u.language, u.role, u.status, u.created_at, u.last_login_at
    FROM user_sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? LIMIT 1
  `).bind(tokenHash, new Date().toISOString()).first<AuthUser>();
  if (!row || row.status !== "active") return null;
  return { tokenHash, user: row };
}
async function recordAuthEvent(env: Env, userId: string | null, event: string, request: Request): Promise<void> {
  await env.DB.prepare("INSERT INTO auth_events (id,user_id,event_type,user_agent) VALUES (?,?,?,?)")
    .bind(crypto.randomUUID(), userId, event, (request.headers.get("user-agent") || "").slice(0, 300) || null).run();
}
async function handleTelegramAuth(request: Request, env: Env): Promise<Response> {
  if (!env.TELEGRAM_BOT_TOKEN) return json({ ok: false, error: "Telegram authentication is not configured" }, 503);
  let body: { initData?: string };
  try { body = await request.json() as { initData?: string }; } catch { return json({ ok: false, error: "Invalid request body" }, 400); }
  const verified = await validateTelegramInitData(body.initData || "", env.TELEGRAM_BOT_TOKEN);
  if (!verified) {
    await recordAuthEvent(env, null, "telegram_auth_rejected", request);
    return json({ ok: false, error: "Telegram authentication data is invalid or expired. Reopen CodeRush from Telegram and try again." }, 401);
  }
  const tg = verified.user;
  const userId = String(tg.id);
  const adminIds = (env.CODERUSH_ADMIN_TELEGRAM_IDS || "").split(",").map(value => value.trim()).filter(Boolean);
  const assignedRole = adminIds.includes(userId) ? "admin" : "user";
  await env.DB.prepare(`
    INSERT INTO users (id,telegram_username,first_name,last_name,role,last_login_at)
    VALUES (?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(id) DO UPDATE SET
      telegram_username=excluded.telegram_username,
      first_name=excluded.first_name,
      last_name=excluded.last_name,
      role=CASE WHEN excluded.role='admin' THEN 'admin' ELSE users.role END,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      last_login_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
  `).bind(userId, tg.username || null, tg.first_name || null, tg.last_name || null, assignedRole).run();
  const user = await env.DB.prepare("SELECT id,telegram_username,first_name,last_name,display_name,language,role,status,created_at,last_login_at FROM users WHERE id=?").bind(userId).first<AuthUser>();
  if (!user || user.status !== "active") {
    await recordAuthEvent(env, userId, "login_blocked", request);
    return json({ ok: false, error: "This account is not active. Contact support." }, 403);
  }
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = hex(tokenBytes.buffer);
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  await env.DB.prepare("INSERT INTO user_sessions (token_hash,user_id,expires_at,user_agent) VALUES (?,?,?,?)")
    .bind(tokenHash, userId, expiresAt, (request.headers.get("user-agent") || "").slice(0, 300) || null).run();
  await recordAuthEvent(env, userId, "login_success", request);
  return new Response(JSON.stringify({ ok: true, user }), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "set-cookie": sessionCookie(token) }
  });
}
async function handleAuthSession(request: Request, env: Env): Promise<Response> {
  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, authenticated: false }, 401);
  await env.DB.prepare("UPDATE user_sessions SET last_seen_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE token_hash=?").bind(session.tokenHash).run();
  return json({ ok: true, authenticated: true, user: session.user });
}
async function handleAdminSession(request: Request, env: Env): Promise<Response> {
  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, error: "Authentication required" }, 401);
  if (session.user.role !== "admin") return json({ ok: false, error: "Administrator access required" }, 403);
  return json({ ok: true, admin: { id: session.user.id, displayName: session.user.display_name, role: session.user.role } });
}
async function handleLogout(request: Request, env: Env): Promise<Response> {
  const session = await currentSession(request, env);
  if (session) {
    await env.DB.prepare("UPDATE user_sessions SET revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE token_hash=?").bind(session.tokenHash).run();
    await recordAuthEvent(env, session.user.id, "logout", request);
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "set-cookie": clearSessionCookie() } });
}
async function handleProfileUpdate(request: Request, env: Env): Promise<Response> {
  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, error: "Authentication required" }, 401);
  let body: { displayName?: string; language?: string };
  try { body = await request.json() as { displayName?: string; language?: string }; } catch { return json({ ok: false, error: "Invalid request body" }, 400); }
  const displayName = (body.displayName || "").trim();
  const language = body.language === "EN" ? "EN" : body.language === "AR" ? "AR" : null;
  if (displayName.length < 2 || displayName.length > 60 || !language) return json({ ok: false, error: "Display name must be 2–60 characters and language must be AR or EN." }, 400);
  await env.DB.prepare("UPDATE users SET display_name=?,language=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?")
    .bind(displayName, language, session.user.id).run();
  const user = await env.DB.prepare("SELECT id,telegram_username,first_name,last_name,display_name,language,role,status,created_at,last_login_at FROM users WHERE id=?").bind(session.user.id).first<AuthUser>();
  return json({ ok: true, user });
}


type ApiFootballFixture = {
  fixture: { id: number; date: string; status: { short: string; long: string; elapsed: number | null } };
  league: { id: number; name: string; country: string; season: number };
  teams: { home: { name: string; code?: string | null }; away: { name: string; code?: string | null } };
  goals: { home: number | null; away: number | null };
};
type ApiFootballOdds = {
  fixture: { id: number };
  bookmakers: Array<{ id: number; name: string; bets: Array<{ id: number; name: string; values: Array<{ value: string; odd: string; handicap?: string | null; suspended?: boolean }> }> }>;
};
async function reserveApiFootballRequestSlot(env: Env): Promise<void> {
  // Keep CodeRush below the 100/day Free allowance with a 75-request safety ceiling.
  const utcDate = new Date().toISOString().slice(0, 10);
  const usage = await env.DB.prepare("INSERT INTO api_football_usage(utc_date,request_count) VALUES (?,1) ON CONFLICT(utc_date) DO UPDATE SET request_count=api_football_usage.request_count+1 WHERE api_football_usage.request_count < 75 RETURNING request_count").bind(utcDate).first<{request_count:number}>();
  if (!usage) throw new Error("CodeRush daily API-Football safety budget (75 requests) has been reached. Requests resume after 00:00 UTC.");
  // Shared atomic spacing across Worker instances.
  const slot = await env.DB.prepare("INSERT INTO api_football_rate_limit(id,next_allowed_at) VALUES (1,unixepoch()) ON CONFLICT(id) DO UPDATE SET next_allowed_at=MAX(api_football_rate_limit.next_allowed_at,unixepoch())+8 RETURNING next_allowed_at").first<{next_allowed_at:number}>();
  if (slot?.next_allowed_at) {
    const waitMs = slot.next_allowed_at * 1000 - Date.now();
    if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));
  }
}
async function apiFootball<T>(env: Env, path: string): Promise<{ response: T[]; paging?: { current: number; total: number } }> {
  if (!env.API_FOOTBALL_KEY) throw new Error("API_FOOTBALL_KEY is not configured");
  await reserveApiFootballRequestSlot(env);
  const endpoint = new URL(path, "https://v3.football.api-sports.io/");
  const response = await fetch(endpoint.toString(), {
    method: "GET",
    headers: { "x-apisports-key": env.API_FOOTBALL_KEY, "accept": "application/json" },
    cf: { cacheTtl: 0, cacheEverything: false }
  });
  const rate = {
    dailyLimit: response.headers.get("x-ratelimit-requests-limit"),
    dailyRemaining: response.headers.get("x-ratelimit-requests-remaining"),
    minuteLimit: response.headers.get("x-ratelimit-limit"),
    minuteRemaining: response.headers.get("x-ratelimit-remaining"),
    retryAfter: response.headers.get("retry-after")
  };
  let payload: { response?: T[]; errors?: unknown; paging?: { current: number; total: number } } = {};
  try {
    payload = await response.json() as typeof payload;
  } catch {
    payload = { errors: "Provider returned a non-JSON response" };
  }
  const hasErrors = !!payload.errors && (Array.isArray(payload.errors)
    ? payload.errors.length > 0
    : typeof payload.errors === "object"
      ? Object.keys(payload.errors as object).length > 0
      : String(payload.errors).length > 0);
  const providerError = hasErrors ? JSON.stringify(payload.errors) : null;
  await env.DB.prepare(`
    INSERT INTO api_football_diagnostics
      (id,endpoint,http_status,daily_limit,daily_remaining,minute_limit,minute_remaining,retry_after,provider_error)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).bind(
    crypto.randomUUID(), endpoint.pathname + endpoint.search, response.status,
    rate.dailyLimit, rate.dailyRemaining, rate.minuteLimit, rate.minuteRemaining,
    rate.retryAfter, providerError ? providerError.slice(0, 500) : null
  ).run();
  if (!response.ok) {
    if (response.status === 429 || /rate.?limit|too many requests|exceeded the limit/i.test(providerError || "")) {
      await env.DB.prepare(`
        INSERT INTO api_football_rate_limit(id,next_allowed_at)
        VALUES (1,unixepoch()+65)
        ON CONFLICT(id) DO UPDATE SET
          next_allowed_at=MAX(api_football_rate_limit.next_allowed_at,unixepoch()+65)
      `).run();
      throw new Error("API-Football rate limit reached. Provider response and rate-limit headers have been recorded for diagnosis. Pause Sync.");
    }
    throw new Error("API-Football " + endpoint.pathname + " returned HTTP " + response.status + (providerError ? ": " + providerError.slice(0, 200) : ""));
  }
  if (hasErrors) {
    if (/rate.?limit|too many requests|exceeded the limit/i.test(providerError || "")) {
      await env.DB.prepare(`
        INSERT INTO api_football_rate_limit(id,next_allowed_at)
        VALUES (1,unixepoch()+65)
        ON CONFLICT(id) DO UPDATE SET
          next_allowed_at=MAX(api_football_rate_limit.next_allowed_at,unixepoch()+65)
      `).run();
      throw new Error("API-Football rate limit reached. Provider response and rate-limit headers have been recorded for diagnosis. Pause Sync.");
    }
    throw new Error("API-Football " + endpoint.pathname + " rejected the request: " + (providerError || "").slice(0, 300));
  }
  return { response: payload.response || [], paging: payload.paging };
}
const isoNow = () => new Date().toISOString();
const dayString = (date: Date) => date.toISOString().slice(0, 10);
function fixtureIsLive(status: string): boolean {
  return ["1H","HT","2H","ET","BT","P","LIVE"].includes(status);
}
async function storeFootballFixtures(env: Env, fixtures: ApiFootballFixture[]): Promise<number> {
  if (!fixtures.length) return 0;
  const now = isoNow();
  const statements = fixtures.map(item => env.DB.prepare(`
    INSERT INTO sports_fixtures
      (id,league_id,league_name,country,season,kickoff,status_short,status_long,elapsed,home_team,away_team,home_code,away_code,home_score,away_score,is_live,updated_at,raw_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      league_id=excluded.league_id,league_name=excluded.league_name,country=excluded.country,season=excluded.season,
      kickoff=excluded.kickoff,status_short=excluded.status_short,status_long=excluded.status_long,elapsed=excluded.elapsed,
      home_team=excluded.home_team,away_team=excluded.away_team,home_code=excluded.home_code,away_code=excluded.away_code,
      home_score=excluded.home_score,away_score=excluded.away_score,is_live=excluded.is_live,
      updated_at=excluded.updated_at,raw_json=excluded.raw_json
  `).bind(
    String(item.fixture.id),item.league.id,item.league.name,item.league.country||null,item.league.season||null,
    item.fixture.date,item.fixture.status.short,item.fixture.status.long,item.fixture.status.elapsed,
    item.teams.home.name,item.teams.away.name,item.teams.home.code||null,item.teams.away.code||null,
    item.goals.home,item.goals.away,fixtureIsLive(item.fixture.status.short)?1:0,now,JSON.stringify(item)
  ));
  await env.DB.batch(statements);
  return fixtures.length;
}
async function storeFootballOdds(env: Env, entries: ApiFootballOdds[]): Promise<number> {
  let count=0;
  const configuredBookmaker=Number(env.API_FOOTBALL_BOOKMAKER_ID||0);
  const statements: D1PreparedStatement[]=[];
  for (const entry of entries) {
    const bookmaker = configuredBookmaker
      ? entry.bookmakers.find(item=>item.id===configuredBookmaker)
      : entry.bookmakers[0];
    if (!bookmaker) continue;
    for (const market of bookmaker.bets) {
      if (market.id !== 1) continue;
      for (const value of market.values) {
        const label=value.value.toLowerCase();
        const key=label.includes("home")? "home" : label.includes("draw")? "draw" : label.includes("away")? "away" : "";
        const odd=Number(value.odd);
        if (!key || !Number.isFinite(odd) || odd<=1) continue;
        statements.push(env.DB.prepare(`
          INSERT INTO sports_odds (fixture_id,bookmaker_id,bookmaker_name,market_id,market_name,outcome_key,outcome_name,odd,handicap,suspended,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(fixture_id,bookmaker_id,market_id,outcome_key,handicap) DO UPDATE SET
            bookmaker_name=excluded.bookmaker_name,market_name=excluded.market_name,outcome_name=excluded.outcome_name,
            odd=excluded.odd,suspended=excluded.suspended,updated_at=excluded.updated_at
        `).bind(String(entry.fixture.id),bookmaker.id,bookmaker.name,market.id,market.name,key,value.value,odd,value.handicap||"",value.suspended?1:0,isoNow()));
        count++;
      }
    }
  }
  for(let i=0;i<statements.length;i+=80) await env.DB.batch(statements.slice(i,i+80));
  return count;
}
async function syncFootballRange(env: Env, _from: string, _to: string): Promise<{fixtures:number;odds:number}> {
  // One request retrieves the next 100 fixtures instead of one request per day.
  const fixtureData=await apiFootball<ApiFootballFixture>(env,"fixtures?next=100");
  const fixtures=await storeFootballFixtures(env,fixtureData.response);
  // Only today's first odds page is fetched; no 10-page-per-day loops.
  const today=dayString(new Date());
  const oddsData=await apiFootball<ApiFootballOdds>(env,"odds?date="+today+"&bet=1&page=1");
  const odds=await storeFootballOdds(env,oddsData.response);
  await env.DB.prepare("INSERT INTO sports_sync_state(provider,last_fixtures_sync,last_odds_sync,last_error,updated_at) VALUES ('api-football',?,?,NULL,?) ON CONFLICT(provider) DO UPDATE SET last_fixtures_sync=excluded.last_fixtures_sync,last_odds_sync=excluded.last_odds_sync,last_error=NULL,updated_at=excluded.updated_at").bind(isoNow(),isoNow(),isoNow()).run();
  return {fixtures,odds};
}
async function syncFootballLive(env: Env): Promise<{fixtures:number;odds:number}> {
  // One request for live scores; live odds are not polled on every refresh.
  const live=await apiFootball<ApiFootballFixture>(env,"fixtures?live=all");
  const fixtures=await storeFootballFixtures(env,live.response);
  await env.DB.prepare("INSERT INTO sports_sync_state(provider,last_live_sync,last_error,updated_at) VALUES ('api-football',?,NULL,?) ON CONFLICT(provider) DO UPDATE SET last_live_sync=excluded.last_live_sync,last_error=NULL,updated_at=excluded.updated_at").bind(isoNow(),isoNow()).run();
  return {fixtures,odds:0};
}
async function handleSportsFixtures(request: Request, env: Env): Promise<Response> {
  if (!env.API_FOOTBALL_KEY) return json({ok:true,configured:false,provider:"API-Football",fixtures:[],message:"Sports data provider is not configured yet."});
  const url=new URL(request.url);
  const from=url.searchParams.get("from")||dayString(new Date());
  const to=url.searchParams.get("to")||dayString(new Date(Date.now()+7*86400000));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||to<from) return json({ok:false,error:"Invalid date range"},400);
  const rows=await env.DB.prepare(`
    SELECT f.id,f.league_name,f.country,f.kickoff,f.status_short,f.elapsed,f.home_team,f.away_team,f.home_code,f.away_code,
      f.home_score,f.away_score,o.bookmaker_name,o.outcome_key,o.odd,o.suspended,o.updated_at AS odds_updated_at
    FROM sports_fixtures f LEFT JOIN sports_odds o ON o.fixture_id=f.id AND o.market_id=1
    WHERE substr(f.kickoff,1,10)>=? AND substr(f.kickoff,1,10)<=?
    ORDER BY f.kickoff ASC
  `).bind(from,to).all<Record<string,unknown>>();
  const map=new Map<string,Record<string,unknown>>();
  for(const row of rows.results||[]){
    let item=map.get(String(row.id));
    if(!item){item={id:String(row.id),league:String(row.league_name),country:row.country||"",kickoff:row.kickoff,home:String(row.home_team),away:String(row.away_team),homeCode:row.home_code||"",awayCode:row.away_code||"",status:String(row.status_short),minute:row.elapsed,live:fixtureIsLive(String(row.status_short)),completed:["FT","AET","PEN"].includes(String(row.status_short)),score:row.home_score===null||row.away_score===null?null:String(row.home_score)+" : "+String(row.away_score),odds:[null,null,null],bookmaker:null,oddsUpdatedAt:null};map.set(String(row.id),item);}
    if(row.outcome_key==="home") (item.odds as (number|null)[])[0]=row.suspended?null:Number(row.odd);
    if(row.outcome_key==="draw") (item.odds as (number|null)[])[1]=row.suspended?null:Number(row.odd);
    if(row.outcome_key==="away") (item.odds as (number|null)[])[2]=row.suspended?null:Number(row.odd);
    if(row.bookmaker_name){item.bookmaker=row.bookmaker_name;item.oddsUpdatedAt=row.odds_updated_at;}
  }
  const state=await env.DB.prepare("SELECT last_fixtures_sync,last_live_sync,last_odds_sync,last_error FROM sports_sync_state WHERE provider='api-football'").first<Record<string,unknown>>();
  return new Response(JSON.stringify({ok:true,configured:true,provider:"API-Football",fixtures:Array.from(map.values()),sync:state}),{headers:{"content-type":"application/json; charset=utf-8","cache-control":"public, max-age=10, stale-while-revalidate=20","x-content-type-options":"nosniff"}});
}
async function handleSportsSync(request: Request, env: Env): Promise<Response> {
  const session=await currentSession(request,env);
  if(!session) return json({ok:false,error:"Authentication required"},401);
  if(session.user.role!=="admin") return json({ok:false,error:"Administrator access required"},403);
  if(!env.API_FOOTBALL_KEY) return json({ok:false,error:"API_FOOTBALL_KEY is not configured in Cloudflare."},503);
  const url=new URL(request.url);
  const from=url.searchParams.get("from")||dayString(new Date());
  const to=url.searchParams.get("to")||dayString(new Date(Date.now()+7*86400000));
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||to<from||(new Date(to).getTime()-new Date(from).getTime())>14*86400000) return json({ok:false,error:"Choose a valid date range of no more than 15 days."},400);
  try{
    const result=await syncFootballRange(env,from,to);
    const live=await syncFootballLive(env);
    return json({ok:true,provider:"API-Football",range:{from,to},...result,liveFixtures:live.fixtures,liveOdds:live.odds});
  }catch(error){
    const message=error instanceof Error?error.message:"Sports provider sync failed";
    await env.DB.prepare(`
      INSERT INTO sports_sync_state(provider,last_error,updated_at) VALUES ('api-football',?,?)
      ON CONFLICT(provider) DO UPDATE SET last_error=excluded.last_error,updated_at=excluded.updated_at
    `).bind(message.slice(0,500),isoNow()).run();
    return json({ok:false,error:message},502);
  }
}


type BetQuoteSelectionInput = { fixtureId?: unknown; outcome?: unknown };
type ValidatedBetSelection = {
  fixtureId:string; outcome:string; outcomeKey:string; fixture:string; league:string;
  homeTeam:string; awayTeam:string; odd:number; oddsUpdatedAt:string;
};
const BET_OUTCOME_KEYS: Record<string,string> = {
  "home win":"home", "home":"home", "1":"home",
  "draw":"draw", "x":"draw",
  "away win":"away", "away":"away", "2":"away"
};
async function validateBetSelections(env:Env, inputs:BetQuoteSelectionInput[]):Promise<{ok:true;selections:ValidatedBetSelection[];combinedOdds:number;validatedAt:string}|{ok:false;error:string;status:number}> {
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 20) return {ok:false,error:"A ticket must contain between 1 and 20 selections.",status:400};
  const seenFixtures=new Set<string>(), now=Date.now();
  const normalized:ValidatedBetSelection[]=[];
  for(const input of inputs){
    const fixtureId=typeof input.fixtureId==="string"?input.fixtureId.trim():"";
    const outcome=typeof input.outcome==="string"?input.outcome.trim():"";
    const outcomeKey=BET_OUTCOME_KEYS[outcome.toLowerCase()];
    if(!/^\d{1,20}$/.test(fixtureId)||!outcomeKey)return {ok:false,error:"One or more ticket selections are invalid.",status:400};
    if(seenFixtures.has(fixtureId))return {ok:false,error:"A ticket can contain only one outcome per match.",status:400};
    seenFixtures.add(fixtureId);
    const row=await env.DB.prepare(`
      SELECT f.id,f.home_team,f.away_team,f.league_name,f.kickoff,f.status_short,
             o.outcome_name,o.odd,o.suspended,o.updated_at AS odds_updated_at
      FROM sports_fixtures f
      LEFT JOIN sports_odds o ON o.fixture_id=f.id AND o.market_id=1 AND o.outcome_key=?
      WHERE f.id=? LIMIT 1
    `).bind(outcomeKey,fixtureId).first<{
      id:string;home_team:string;away_team:string;league_name:string;kickoff:string;status_short:string;
      outcome_name:string|null;odd:number|null;suspended:number|null;odds_updated_at:string|null
    }>();
    if(!row)return {ok:false,error:"A selected match is no longer available. Refresh the Match Centre.",status:409};
    const kickoff=Date.parse(row.kickoff);
    if(!Number.isFinite(kickoff)||kickoff<=now||!["NS","TBD"].includes(row.status_short))return {ok:false,error:"A selected match has started, finished, or is not open for selections.",status:409};
    if(row.odd===null||!Number.isFinite(Number(row.odd))||Number(row.odd)<=1||row.suspended)return {ok:false,error:"Odds are unavailable or suspended for one of your selections.",status:409};
    const updated=row.odds_updated_at?Date.parse(row.odds_updated_at):NaN;
    if(!Number.isFinite(updated)||now-updated>45*60*1000||updated>now+60*1000)return {ok:false,error:"The odds for a selected match are stale. Please wait for an updated price.",status:409};
    normalized.push({fixtureId:row.id,outcome:row.outcome_name||(outcomeKey==="home"?"Home win":outcomeKey==="draw"?"Draw":"Away win"),outcomeKey,fixture:row.home_team+" vs "+row.away_team,league:row.league_name,homeTeam:row.home_team,awayTeam:row.away_team,odd:Number(row.odd),oddsUpdatedAt:row.odds_updated_at!});
  }
  const combinedOdds=normalized.reduce((product,pick)=>product*pick.odd,1);
  if(!Number.isFinite(combinedOdds)||combinedOdds>1000000)return {ok:false,error:"The combined odds exceed the ticket limit.",status:422};
  return {ok:true,selections:normalized,combinedOdds,validatedAt:new Date(now).toISOString()};
}
function publicTicket(row:any,selections:any[]){return {id:row.id,status:row.status,ticketType:row.ticket_type,stake:Number(row.stake),combinedOdds:Number(row.combined_odds),potential:Number(row.potential_return),createdAt:row.created_at,selections:selections.map(s=>({id:s.id,fixtureId:s.fixture_id,fixture:s.home_team+" vs "+s.away_team,league:s.league_name,outcome:s.outcome_name,odd:Number(s.odd)}))};}
async function handleBetQuote(request:Request,env:Env):Promise<Response>{
  const session=await currentSession(request,env);
  if(!session)return json({ok:false,error:"Sign in through Telegram before validating a betting ticket."},401);
  let body:{selections?:BetQuoteSelectionInput[]};
  try{body=await request.json() as {selections?:BetQuoteSelectionInput[]};}catch{return json({ok:false,error:"Invalid ticket request."},400);}
  const result=await validateBetSelections(env,body.selections||[]);
  if(!result.ok)return json({ok:false,error:result.error},result.status);
  return json({ok:true,quote:{selections:result.selections.map(s=>({fixtureId:s.fixtureId,outcome:s.outcome,outcomeKey:s.outcomeKey,fixture:s.fixture,league:s.league,odd:s.odd,oddsUpdatedAt:s.oddsUpdatedAt})),selectionCount:result.selections.length,combinedOdds:result.combinedOdds,combinedOddsDisplay:result.combinedOdds.toFixed(2),validatedAt:result.validatedAt,expiresAt:new Date(Date.parse(result.validatedAt)+30000).toISOString(),market:"1X2"},notice:"This is an odds validation quote only. No bet has been placed and no balance has been changed."});
}
async function handleBetCreate(request:Request,env:Env):Promise<Response>{
  const session=await currentSession(request,env);
  if(!session)return json({ok:false,error:"Authentication required"},401);
  if(!sameOrigin(request))return json({ok:false,error:"Invalid origin"},403);
  if(!(request.headers.get("content-type")||"").toLowerCase().includes("application/json"))return json({ok:false,error:"Content-Type must be application/json."},415);
  let body:{selections?:BetQuoteSelectionInput[];stake?:unknown;idempotencyKey?:unknown};
  try{body=await request.json() as typeof body;}catch{return json({ok:false,error:"Invalid ticket request."},400);}
  const stake=Number(body.stake);
  if(!Number.isFinite(stake)||stake<1||stake>5000||Math.abs(Math.round(stake*100)-stake*100)>1e-8)return json({ok:false,error:"Stake must be between 1.00 and 5,000.00."},400);
  const idempotencyKey=typeof body.idempotencyKey==="string"?body.idempotencyKey.trim():"";
  if(!/^[A-Za-z0-9_-]{16,80}$/.test(idempotencyKey))return json({ok:false,error:"A valid ticket submission key is required."},400);
  const prior=await env.DB.prepare("SELECT * FROM bet_tickets WHERE user_id=? AND idempotency_key=?").bind(session.user.id,idempotencyKey).first<any>();
  if(prior){
    const priorPicks=await env.DB.prepare("SELECT * FROM bet_ticket_selections WHERE ticket_id=? ORDER BY selection_index").bind(prior.id).all<any>();
    return json({ok:true,duplicate:true,ticket:publicTicket(prior,priorPicks.results||[])},200);
  }
  const validated=await validateBetSelections(env,body.selections||[]);
  if(!validated.ok)return json({ok:false,error:validated.error},validated.status);
  const id=crypto.randomUUID(),potential=Number((stake*validated.combinedOdds).toFixed(2)),createdAt=new Date().toISOString();
  const statements=[env.DB.prepare("INSERT INTO bet_tickets(id,user_id,ticket_type,status,stake,combined_odds,potential_return,currency,selection_count,idempotency_key,quoted_at,created_at,updated_at) VALUES(?,?,'demo','open',?,?,?,'USD',?,?,?, ?,?)").bind(id,session.user.id,stake,validated.combinedOdds,potential,validated.selections.length,idempotencyKey,validated.validatedAt,createdAt,createdAt)];
  validated.selections.forEach((s,index)=>statements.push(env.DB.prepare("INSERT INTO bet_ticket_selections(id,ticket_id,selection_index,fixture_id,home_team,away_team,league_name,outcome_key,outcome_name,odd,odds_updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),id,index,s.fixtureId,s.homeTeam,s.awayTeam,s.league,s.outcomeKey,s.outcome,s.odd,s.oddsUpdatedAt)));
  try{await env.DB.batch(statements);}catch(error){
    const existing=await env.DB.prepare("SELECT * FROM bet_tickets WHERE user_id=? AND idempotency_key=?").bind(session.user.id,idempotencyKey).first<any>();
    if(!existing)throw error;
    const picks=await env.DB.prepare("SELECT * FROM bet_ticket_selections WHERE ticket_id=? ORDER BY selection_index").bind(existing.id).all<any>();
    return json({ok:true,duplicate:true,ticket:publicTicket(existing,picks.results||[])},200);
  }
  const ticket=await env.DB.prepare("SELECT * FROM bet_tickets WHERE id=? AND user_id=?").bind(id,session.user.id).first<any>();
  const picks=await env.DB.prepare("SELECT * FROM bet_ticket_selections WHERE ticket_id=? ORDER BY selection_index").bind(id).all<any>();
  return json({ok:true,ticket:publicTicket(ticket,picks.results||[]),notice:"Demo ticket stored securely. No real-money wager or wallet debit has occurred."},201);
}
async function handleBetList(request:Request,env:Env):Promise<Response>{
  const session=await currentSession(request,env);
  if(!session)return json({ok:false,error:"Authentication required"},401);
  const limit=Math.min(50,Math.max(1,Number(new URL(request.url).searchParams.get("limit"))||25));
  const rows=await env.DB.prepare("SELECT * FROM bet_tickets WHERE user_id=? ORDER BY created_at DESC LIMIT ?").bind(session.user.id,limit).all<any>();
  const tickets=rows.results||[];
  if(!tickets.length)return json({ok:true,bets:[]});
  const placeholders=tickets.map(()=>"?").join(",");
  const picks=await env.DB.prepare("SELECT * FROM bet_ticket_selections WHERE ticket_id IN ("+placeholders+") ORDER BY ticket_id,selection_index").bind(...tickets.map(t=>t.id)).all<any>();
  const grouped=new Map<string,any[]>();
  for(const pick of picks.results||[]){const list=grouped.get(pick.ticket_id)||[];list.push(pick);grouped.set(pick.ticket_id,list);}
  return json({ok:true,bets:tickets.map(ticket=>publicTicket(ticket,grouped.get(ticket.id)||[]))});
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/admin" && request.method === "GET") return adminHtml(env);
    if (url.pathname === "/api/auth/telegram" && request.method === "POST") return handleTelegramAuth(request, env);
    if (url.pathname === "/api/auth/session" && request.method === "GET") return handleAuthSession(request, env);
    if (url.pathname === "/api/auth/logout" && request.method === "POST") return handleLogout(request, env);
    if (url.pathname === "/api/admin/setup-status" && request.method === "GET") return json({ok:true,setupRequired:(await adminCount(env))===0});
    if (url.pathname === "/api/admin/setup" && request.method === "POST") return adminSetup(request,env);
    if (url.pathname === "/api/admin/login" && request.method === "POST") return adminLogin(request,env);
    if (url.pathname === "/api/admin/users" && (request.method === "GET" || request.method === "POST")) return adminUsers(request,env);
    if (url.pathname === "/api/admin/session" && request.method === "GET") return handleAdminSession(request, env);
    if (url.pathname === "/api/admin/sports-probe" && request.method === "POST") {
      const session = await currentSession(request, env);
      if (!session || session.user.role !== "admin") return json({ok:false,error:"Administrator access required"}, 403);
      if (!env.API_FOOTBALL_KEY) return json({ok:false,error:"API_FOOTBALL_KEY is not configured"},503);
      try {
        const today = dayString(new Date());
        const result = await apiFootball<ApiFootballFixture>(env,"fixtures?date="+today);
        return json({ok:true,fixtures:result.response.length,requestCount:1});
      } catch (error) {
        const message = error instanceof Error ? error.message : "API-Football test failed";
        return json({ok:false,error:message,requestCount:1},502);
      }
    }
    if (url.pathname === "/api/admin/sports-diagnostics" && request.method === "GET") {
      const session = await currentSession(request, env);
      if (!session || session.user.role !== "admin") return json({ok:false,error:"Administrator access required"}, 403);
      const diagnostics = await env.DB.prepare("SELECT endpoint,http_status,daily_limit,daily_remaining,minute_limit,minute_remaining,retry_after,provider_error,created_at FROM api_football_diagnostics ORDER BY created_at DESC LIMIT 20").all();
      const sync = await env.DB.prepare("SELECT last_fixtures_sync,last_live_sync,last_odds_sync,last_error,updated_at FROM sports_sync_state WHERE provider='api-football'").first();
      const limiter = await env.DB.prepare("SELECT next_allowed_at,datetime(next_allowed_at,'unixepoch') AS next_allowed_utc FROM api_football_rate_limit WHERE id=1").first();
      return json({ok:true,diagnostics:diagnostics.results||[],sync:sync||null,limiter:limiter||null});
    }
    if (url.pathname === "/api/bets/quote" && request.method === "POST") return handleBetQuote(request, env);
    if (url.pathname === "/api/bets" && request.method === "POST") return handleBetCreate(request, env);
    if (url.pathname === "/api/bets" && request.method === "GET") return handleBetList(request, env);
    if (url.pathname === "/api/profile" && request.method === "POST") return handleProfileUpdate(request, env);
    if (url.pathname === "/api/sports/fixtures" && request.method === "GET") return handleSportsFixtures(request, env);
    if (url.pathname === "/api/sports/sync" && request.method === "POST") return handleSportsSync(request, env);

    if (url.pathname === "/api/health" && request.method === "GET") {
      if (!env.TELEGRAM_BOT_TOKEN) return json({ ok: true, service: "coderush", runtime: "cloudflare-worker", telegramTokenConfigured: false, databaseConfigured: !!env.DB });
      const webhook = await ensureWebhook(env.TELEGRAM_BOT_TOKEN);
      return json({ ok: true, service: "coderush", runtime: "cloudflare-worker", telegramTokenConfigured: true, telegramWebhookConfigured: webhook.configured, databaseConfigured: !!env.DB, broadcastSecretConfigured: !!env.TELEGRAM_BROADCAST_SECRET, ...(webhook.detail ? { telegramWebhookDetail: webhook.detail } : {}) }, webhook.configured ? 200 : 502);
    }

    if (url.pathname === "/api/telegram/link" && request.method === "GET") {
      try {
        const me = await telegram<{ username: string }>(env, "getMe");
        const ref = (url.searchParams.get("ref") || "").trim();
        if (ref && !/^[a-zA-Z0-9_-]{1,64}$/.test(ref)) return json({ ok: false, error: "Invalid referral code" }, 400);
        const start = ref ? `ref_${ref}` : "";
        const link = `https://t.me/${me.username}${start ? `?start=${encodeURIComponent(start)}` : ""}`;
        return json({ ok: true, botUsername: me.username, botLink: `https://t.me/${me.username}`, referralLink: link, instruction: "Users must open the link and press Start before the bot can message them." });
      } catch (error) { return json({ ok: false, error: error instanceof Error ? error.message : "Unable to create Telegram link" }, 502); }
    }

    if (url.pathname === "/api/telegram/stats" && request.method === "GET") {
      if (!(await requireAdmin(request, env))) return json({ ok: false, error: "Unauthorized" }, 401);
      const stats = await env.DB.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status='active' AND opted_out=0 THEN 1 ELSE 0 END) AS reachable, SUM(CASE WHEN opted_out=1 THEN 1 ELSE 0 END) AS optedOut, SUM(CASE WHEN status='blocked' THEN 1 ELSE 0 END) AS blocked, SUM(CASE WHEN write_access_allowed=1 AND status='active' AND opted_out=0 THEN 1 ELSE 0 END) AS messageOptIns FROM telegram_subscribers").first();
      return json({ ok: true, subscribers: stats });
    }

    if (url.pathname === "/api/telegram/broadcast" && request.method === "POST") {
      try { return await handleBroadcast(request, env); }
      catch (error) { console.error("Telegram broadcast failed", error); return json({ ok: false, error: "Broadcast processing failed" }, 500); }
    }

    if (url.pathname === "/api/telegram/webhook" && request.method === "POST") {
      if (!env.TELEGRAM_BOT_TOKEN) return json({ ok: false, error: "Telegram bot token is not configured" }, 503);
      const expected = await webhookSecret(env.TELEGRAM_BOT_TOKEN);
      const supplied = request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
      if (!constantTimeEqual(supplied, expected)) return json({ ok: false, error: "Unauthorized" }, 401);
      try {
        await processUpdate(await request.json() as { message?: TelegramMessage }, env);
        return json({ ok: true });
      } catch (error) {
        console.error("Telegram webhook processing failed", error);
        return json({ ok: false, error: "Unable to process Telegram update" }, 500);
      }
    }

    if (url.pathname.startsWith("/api/")) return json({ ok: false, error: "API route not found" }, 404);
    return env.ASSETS.fetch(request);
  },
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    if (!env.API_FOOTBALL_KEY) return;
    try {
      if (controller.cron === "*/30 * * * *") {
        await syncFootballLive(env);
      } else if (controller.cron === "15 0 * * *") {
        await syncFootballRange(env, dayString(new Date()), dayString(new Date()));
      }
    } catch (error) {
      const message=error instanceof Error?error.message:"Scheduled sports refresh failed";
      await env.DB.prepare("INSERT INTO sports_sync_state(provider,last_error,updated_at) VALUES ('api-football',?,?) ON CONFLICT(provider) DO UPDATE SET last_error=excluded.last_error,updated_at=excluded.updated_at").bind(message.slice(0,500),isoNow()).run();
      console.error("Scheduled API-Football refresh failed", message);
    }
  },
} satisfies ExportedHandler<Env>;
