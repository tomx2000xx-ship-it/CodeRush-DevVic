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
  TRONGRID_API_KEY?: string;
  ETHEREUM_RPC_URL?: string;
  BSC_RPC_URL?: string;
}

const APP_URL = "https://coderush-devvic.tomx2000xx.workers.dev";
const WEBHOOK_URL = APP_URL + "/api/telegram/webhook";

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function withSecurityHeaders(response:Response):Response{
 const headers=new Headers(response.headers);
 headers.set("x-content-type-options","nosniff");
 headers.set("x-frame-options","DENY");
 headers.set("referrer-policy","no-referrer");
 headers.set("permissions-policy","camera=(), microphone=(), geolocation=(), payment=()");
 headers.set("content-security-policy","frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
 headers.set("strict-transport-security","max-age=31536000");
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

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
  const commands=[{command:"start",description:"Open CodeRush"},{command:"notifications",description:"Manage Telegram alerts"},{command:"help",description:"Show bot commands"},{command:"stop",description:"Unsubscribe from bot messages"}];
  const register=async()=>{try{await fetch("https://api.telegram.org/bot"+token+"/setMyCommands",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({commands})});}catch{}};
  if (info.result?.url === WEBHOOK_URL) { await register(); return { configured: true }; }
  const setResponse = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: WEBHOOK_URL, secret_token: secret, allowed_updates: ["message"], drop_pending_updates: false }),
  });
  const result = await setResponse.json() as { ok?: boolean; description?: string };
  if(setResponse.ok&&result.ok){await register();return {configured:true};}
  return { configured: false, detail: result.description || "Telegram rejected setWebhook" };
}

const welcomeText = [
  "✅ مرحباً بك في CodeRush — ساحة الرياضة الرقمية!", "",
  "⚽ اكتشف تجربة رياضية تفاعلية تجمع بين شغف كرة القدم ومتابعة المباريات واستكشاف تفاصيلها.", "",
  "📊 تابع المواجهات، استكشف الاحتمالات، وجرّب أدوات CodeRush في بيئة تجريبية مصممة لتمنحك تجربة ممتعة وسهلة.", "",
  "استخدم CodeRush بمسؤولية، وتأكد من أهلية الاستخدام والقوانين المحلية قبل المشاركة.", "",
  "👋 أهلاً بك، ونتمنى لك تجربة ممتعة!"
].join("\n");

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
  `).bind(String(chatId), String(user.id), user.username || null, user.first_name || null, user.last_name || null, ownCode, referrer && referrer !== ownCode ? referrer : null, payload || null).run();  await env.DB.prepare("INSERT INTO notification_preferences(user_id,in_app_enabled,telegram_enabled,updated_at) VALUES(?,1,1,?) ON CONFLICT(user_id) DO UPDATE SET telegram_enabled=1,updated_at=excluded.updated_at").bind(String(user.id),isoNow()).run();
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
    await env.DB.prepare("INSERT INTO notification_preferences(user_id,in_app_enabled,telegram_enabled,updated_at) VALUES(?,1,0,?) ON CONFLICT(user_id) DO UPDATE SET telegram_enabled=0,updated_at=excluded.updated_at").bind(String(message.from?.id||""),isoNow()).run();
    await telegram(env, "sendMessage", { chat_id: chatId, text: "تم إيقاف رسائل CodeRush. أرسل /start للاشتراك مجدداً." });
  } else if (/^\/notifications(?:@\w+)?(?:\s+(on|off))?$/i.test(text)) {
    const mode=text.match(/\s+(on|off)$/i)?.[1]?.toLowerCase();
    if(mode==="on"){
      await env.DB.prepare("UPDATE telegram_subscribers SET status='active',opted_out=0,last_seen_at=? WHERE chat_id=?").bind(isoNow(),String(chatId)).run();
      await env.DB.prepare("INSERT INTO notification_preferences(user_id,in_app_enabled,telegram_enabled,updated_at) VALUES(?,1,1,?) ON CONFLICT(user_id) DO UPDATE SET telegram_enabled=1,updated_at=excluded.updated_at").bind(String(message.from?.id||""),isoNow()).run();
    }else if(mode==="off")await env.DB.prepare("INSERT INTO notification_preferences(user_id,in_app_enabled,telegram_enabled,updated_at) VALUES(?,1,0,?) ON CONFLICT(user_id) DO UPDATE SET telegram_enabled=0,updated_at=excluded.updated_at").bind(String(message.from?.id||""),isoNow()).run();
    await telegram(env,"sendMessage",{chat_id:chatId,text:mode==="off"?"Telegram notifications are paused. Send /notifications on to resume.":mode==="on"?"Telegram notifications are enabled.":"Use /notifications on or /notifications off to manage alerts."});
  } else if (/^\/help(?:@\w+)?$/i.test(text)) {
    await telegram(env,"sendMessage",{chat_id:chatId,text:"CodeRush commands:\n/start — Open CodeRush\n/notifications on — Enable alerts\n/notifications off — Pause alerts\n/stop — Unsubscribe from bot messages\n/help — Show this help"});
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
  const totalRow = await env.DB.prepare("SELECT COUNT(*) AS total FROM telegram_subscribers WHERE status='active' AND opted_out=0").first<{ total: number }>();
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
function sameOrigin(request:Request):boolean{const origin=request.headers.get("origin");if(!origin)return false;try{return new URL(origin).origin===new URL(request.url).origin}catch{return false}}
async function newAdminSession(request:Request,env:Env,id:string):Promise<Response>{const token=hex(crypto.getRandomValues(new Uint8Array(32)).buffer),hash=await sha256(token),expires=new Date(Date.now()+43200000).toISOString();await env.DB.prepare("INSERT INTO user_sessions(token_hash,user_id,expires_at,user_agent) VALUES(?,?,?,?)").bind(hash,id,expires,(request.headers.get("user-agent")||"").slice(0,300)||null).run();return new Response(JSON.stringify({ok:true}),{headers:{"content-type":"application/json","cache-control":"no-store","set-cookie":sessionCookie(token)}})}
async function adminSetup(request:Request,env:Env):Promise<Response>{if(!sameOrigin(request))return json({ok:false,error:"Invalid origin"},403);if(await adminCount(env))return json({ok:false,error:"Initial setup is already complete. Sign in instead."},409);let b:{email?:string;password?:string;name?:string};try{b=await request.json()}catch{return json({ok:false,error:"Invalid request"},400)}const email=(b.email||"").trim().toLowerCase(),pass=b.password||"",name=(b.name||"Super Administrator").trim().slice(0,60);if(!validAdminEmail(email))return json({ok:false,error:"Enter a valid email."},400);if(!validAdminPassword(pass))return json({ok:false,error:"Password must be at least 12 characters and include letters and numbers."},400);const id="admin_"+crypto.randomUUID(),salt=hex(crypto.getRandomValues(new Uint8Array(16)).buffer),hash=await adminPasswordHash(pass,salt);try{await env.DB.batch([env.DB.prepare("INSERT INTO users(id,display_name,role,status) VALUES(?,?,'admin','active')").bind(id,name||"Super Administrator"),env.DB.prepare("INSERT INTO admin_accounts(user_id,email,password_hash,password_salt,is_super_admin) SELECT ?,?,?,?,1 WHERE NOT EXISTS(SELECT 1 FROM admin_accounts)").bind(id,email,hash,salt)])}catch{return json({ok:false,error:"Setup has already been claimed or the email is already registered. Please sign in."},409)}const row=await env.DB.prepare("SELECT user_id FROM admin_accounts WHERE user_id=? AND is_super_admin=1").bind(id).first();if(!row){await env.DB.prepare("DELETE FROM users WHERE id=?").bind(id).run();return json({ok:false,error:"Another administrator completed setup first. Please sign in."},409)}await recordAuthEvent(env,id,"admin_super_setup",request);return newAdminSession(request,env,id)}
async function adminLogin(request:Request,env:Env):Promise<Response>{
 if(!sameOrigin(request))return json({ok:false,error:"Invalid origin"},403);
 if(!(request.headers.get("content-type")||"").toLowerCase().includes("application/json"))return json({ok:false,error:"Content-Type must be application/json."},415);
 let body:{email?:string;password?:string};try{body=await request.json() as typeof body}catch{return json({ok:false,error:"Invalid request"},400)}
 const email=(body.email||"").trim().toLowerCase(),pass=body.password||"";
 if(!validAdminEmail(email)||pass.length>128)return json({ok:false,error:"Invalid email or password."},401);
 const clientKeyHash=await sha256("CodeRush admin login rate key:"+String(request.headers.get("CF-Connecting-IP")||"unknown"));
 const [emailAttempts,ipAttempts]=await Promise.all([
  env.DB.prepare("SELECT COUNT(*) AS n FROM admin_login_attempts WHERE email=? AND success=0 AND created_at>datetime('now','-15 minutes')").bind(email).first<any>(),
  env.DB.prepare("SELECT COUNT(*) AS n FROM admin_login_attempts WHERE client_key_hash=? AND success=0 AND created_at>datetime('now','-15 minutes')").bind(clientKeyHash).first<any>()
 ]);
 if(Number(emailAttempts?.n||0)>=5||Number(ipAttempts?.n||0)>=15)return json({ok:false,error:"Too many sign-in attempts. Please wait 15 minutes before trying again."},429);
 const account=await env.DB.prepare("SELECT a.user_id,a.password_hash,a.password_salt,u.status FROM admin_accounts a JOIN users u ON u.id=a.user_id WHERE a.email=? COLLATE NOCASE").bind(email).first<any>();
 const computed=account?await adminPasswordHash(pass,account.password_salt):await adminPasswordHash(pass||"invalid-password","00112233445566778899aabbccddeeff");
 const valid=!!account&&account.status==="active"&&constantTimeEqual(computed,account.password_hash);
 await env.DB.prepare("INSERT INTO admin_login_attempts(id,email,success,client_key_hash) VALUES(?,?,?,?)").bind(crypto.randomUUID(),email,valid?1:0,clientKeyHash).run();
 await env.DB.prepare("DELETE FROM admin_login_attempts WHERE created_at<datetime('now','-30 days')").run();
 if(!valid){await recordAuthEvent(env,account?.user_id||null,"admin_login_rejected",request);return json({ok:false,error:"Invalid email or password."},401)}
 await env.DB.prepare("DELETE FROM admin_login_attempts WHERE email=? AND success=0").bind(email).run();
 await recordAuthEvent(env,account!.user_id,"admin_login_success",request);
 return newAdminSession(request,env,account!.user_id);
}
async function adminUsers(request:Request,env:Env):Promise<Response>{const s=await currentSession(request,env);if(!s||s.user.role!=="admin")return json({ok:false,error:"Administrator login required"},401);const actor=await env.DB.prepare("SELECT is_super_admin FROM admin_accounts WHERE user_id=?").bind(s.user.id).first();if(!actor)return json({ok:false,error:"Administrator login required"},401);if(request.method==="GET"){const r=await env.DB.prepare("SELECT a.email,a.is_super_admin,a.created_at,u.display_name FROM admin_accounts a JOIN users u ON u.id=a.user_id ORDER BY a.is_super_admin DESC,a.created_at").all();return json({ok:true,admins:r.results||[]})}if(!sameOrigin(request))return json({ok:false,error:"Invalid origin"},403);let b:{email?:string;password?:string;name?:string};try{b=await request.json()}catch{return json({ok:false,error:"Invalid request"},400)}const email=(b.email||"").trim().toLowerCase(),pass=b.password||"",name=(b.name||"Administrator").trim().slice(0,60);if(!validAdminEmail(email))return json({ok:false,error:"Enter a valid email."},400);if(!validAdminPassword(pass))return json({ok:false,error:"Password must be at least 12 characters and include letters and numbers."},400);const id="admin_"+crypto.randomUUID(),salt=hex(crypto.getRandomValues(new Uint8Array(16)).buffer),hash=await adminPasswordHash(pass,salt);try{await env.DB.batch([env.DB.prepare("INSERT INTO users(id,display_name,role,status) VALUES(?,?,'admin','active')").bind(id,name||"Administrator"),env.DB.prepare("INSERT INTO admin_accounts(user_id,email,password_hash,password_salt,is_super_admin) VALUES(?,?,?, ?,0)").bind(id,email,hash,salt),env.DB.prepare("INSERT INTO admin_audit_logs(id,admin_user_id,action,target_type,target_id,metadata_json) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),s.user.id,"admin_created","admin",id,JSON.stringify({email}))])}catch{return json({ok:false,error:"Could not create account. That email may already be in use."},409)}return json({ok:true},201)}
async function adminNotificationsHtml():Response{
 const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CodeRush · Telegram notifications</title><style>*{box-sizing:border-box}body{margin:0;background:#141619;color:#f7f7f5;font:15px system-ui;padding:24px}.wrap{max-width:900px;margin:auto}.card{background:#20252b;border:1px solid #343b44;border-radius:14px;padding:20px;margin:16px 0}.muted{color:#aeb6c0}textarea{width:100%;min-height:130px;background:#141619;color:white;border:1px solid #48515c;border-radius:9px;padding:12px;font:inherit}button,a{display:inline-block;border:0;border-radius:8px;padding:12px 18px;background:#b92332;color:white;font-weight:700;text-decoration:none;cursor:pointer;margin-top:10px}.stats{display:flex;gap:12px;flex-wrap:wrap}.stat{background:#141619;padding:14px;border-radius:9px;min-width:130px}.row{padding:12px 0;border-bottom:1px solid #343b44}.ok{color:#32b879}.err{color:#ff8790}</style><main class="wrap"><h1>CodeRush · Telegram notifications</h1><p class="muted">Super Admin broadcast centre. Messages are queued and delivered in small batches; you can leave this page while delivery continues.</p><a href="/admin">← Admin dashboard</a><section class="card"><h2>Audience</h2><div id="stats" class="stats">Loading subscriber totals…</div></section><section class="card"><h2>New broadcast</h2><p class="muted">Send a text message to all active subscribers who have not opted out. Maximum 4,096 characters.</p><textarea id="message" maxlength="4096" placeholder="Write your CodeRush update…"></textarea><button id="send">Queue broadcast</button><p id="status" class="muted"></p></section><section class="card"><h2>Broadcast history</h2><div id="history" class="muted">Loading…</div></section></main><script>async function api(method,body){const r=await fetch('/api/admin/telegram',{method:method,credentials:'same-origin',headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw Error(d.error||'Request failed');return d}function esc(v){return String(v||'').replace(/[&<>\"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]})}async function refresh(){try{const d=await api('GET');document.getElementById('stats').innerHTML=[['Total',d.subscribers.total],['Reachable',d.subscribers.reachable],['Opted out',d.subscribers.optedOut],['Blocked',d.subscribers.blocked]].map(x=>'<div class="stat"><b>'+x[1]+'</b><br><small>'+x[0]+'</small></div>').join('');document.getElementById('history').innerHTML=(d.jobs||[]).map(j=>'<div class="row"><b>'+esc(j.status.toUpperCase())+'</b> · '+j.sent_count+'/'+j.total_count+' sent · '+j.failed_count+' failed · '+esc(j.created_at)+'<br><small>'+esc(j.message.slice(0,220))+'</small></div>').join('')||'No broadcasts yet.'}catch(e){document.getElementById('status').textContent=e.message}}document.getElementById('send').onclick=async function(){const text=document.getElementById('message').value.trim();if(!text)return;this.disabled=true;try{const d=await api('POST',{text:text});document.getElementById('status').textContent='Broadcast queued: '+d.totalQueued+' subscribers.';document.getElementById('message').value='';await refresh()}catch(e){document.getElementById('status').textContent=e.message}finally{this.disabled=false}};refresh();setInterval(refresh,5000);</script></html>`;
 return new Response(html,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
}


async function handleAdminUserManagement(request:Request,env:Env):Promise<Response>{
 const session=await currentSession(request,env);
 if(!session||session.user.role!=="admin")return json({ok:false,error:"Administrator access required"},403);
 const actor=await env.DB.prepare("SELECT is_super_admin FROM admin_accounts WHERE user_id=?").bind(session.user.id).first<any>();
 if(!actor)return json({ok:false,error:"Administrator access required"},403);
 if(request.method==="GET"){
  const term=(new URL(request.url).searchParams.get("q")||"").trim().slice(0,80);
  const pattern="%"+term.replace(/[\\%_]/g,"\\async function handleAdminOverview(request:Request,env:Env):Promise<Response>{")+"%";
  const rows=await env.DB.prepare(`SELECT u.id,u.display_name,u.telegram_username,u.first_name,u.last_name,u.status,u.created_at,u.last_login_at,
    COALESCE((SELECT SUM(l.available_delta_units) FROM wallet_ledger_entries l WHERE l.user_id=u.id),0)+COALESCE((SELECT SUM(c.amount_units) FROM wallet_referral_credits c WHERE c.user_id=u.id),0) AS available_units,
    COALESCE((SELECT SUM(l.reserved_delta_units) FROM wallet_ledger_entries l WHERE l.user_id=u.id),0) AS reserved_units,
    (SELECT COUNT(*) FROM bet_tickets b WHERE b.user_id=u.id) AS bet_count,
    (SELECT COUNT(*) FROM wallet_transactions w WHERE w.user_id=u.id) AS wallet_tx_count
   FROM users u WHERE u.role='user' AND (?='' OR u.id LIKE ? ESCAPE '\\' OR COALESCE(u.display_name,'') LIKE ? ESCAPE '\\' OR COALESCE(u.telegram_username,'') LIKE ? ESCAPE '\\')
   ORDER BY u.created_at DESC LIMIT 50`).bind(term,pattern,pattern,pattern).all<any>();
  return json({ok:true,isSuperAdmin:Number(actor.is_super_admin)===1,users:rows.results||[]});
 }
 if(Number(actor.is_super_admin)!==1)return json({ok:false,error:"Super Admin access required"},403);
 if(!sameOrigin(request))return json({ok:false,error:"Invalid origin"},403);
 let body:{userId?:unknown;status?:unknown};try{body=await request.json() as typeof body}catch{return json({ok:false,error:"Invalid request"},400)}
 const userId=String(body.userId||""),status=String(body.status||"");
 if(!userId||!["active","suspended"].includes(status))return json({ok:false,error:"Choose a valid user and account status."},400);
 const target=await env.DB.prepare("SELECT id,role,status FROM users WHERE id=?").bind(userId).first<any>();
 if(!target||target.role!=="user")return json({ok:false,error:"User account not found."},404);
 if(target.status===status)return json({ok:true,status});
 await env.DB.prepare("UPDATE users SET status=?,updated_at=? WHERE id=? AND role='user'").bind(status,isoNow(),userId).run();
 if(status==="suspended")await env.DB.prepare("UPDATE user_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL").bind(isoNow(),userId).run();
 await env.DB.prepare("INSERT INTO admin_audit_logs(id,admin_user_id,action,target_type,target_id,metadata_json) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),session.user.id,status==="suspended"?"user_suspended":"user_reactivated","user",userId,JSON.stringify({previousStatus:target.status,newStatus:status,sessionRevocation:status==="suspended"})).run();
 return json({ok:true,status});
}
async function handleAdminOverview(request:Request,env:Env):Promise<Response>{
 const session=await currentSession(request,env);
 if(!session||session.user.role!=="admin")return json({ok:false,error:"Administrator access required"},403);
 const account=await env.DB.prepare("SELECT is_super_admin FROM admin_accounts WHERE user_id=?").bind(session.user.id).first<any>();
 if(!account)return json({ok:false,error:"Administrator access required"},403);
 const [users,bets,wallet,telegramStats,referrals,provider,networkRows,recentUsers,recentWallet,recentBets,audit,delivery]=await Promise.all([
  env.DB.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active,SUM(CASE WHEN status<>'active' THEN 1 ELSE 0 END) AS inactive,SUM(CASE WHEN created_at>=datetime('now','-24 hours') THEN 1 ELSE 0 END) AS new24h FROM users WHERE role='user'").first<any>(),
  env.DB.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) AS open_count,SUM(CASE WHEN status='won' THEN 1 ELSE 0 END) AS won,SUM(CASE WHEN status='lost' THEN 1 ELSE 0 END) AS lost,SUM(CASE WHEN status='void' THEN 1 ELSE 0 END) AS voided,COALESCE(SUM(CASE WHEN status='open' THEN stake ELSE 0 END),0) AS open_stake FROM bet_tickets").first<any>(),
  env.DB.prepare("SELECT (SELECT COUNT(*) FROM wallet_transactions WHERE type='deposit') AS deposits,(SELECT COUNT(*) FROM wallet_transactions WHERE type='deposit' AND status IN ('pending_review','processing')) AS pending_deposits,(SELECT COUNT(*) FROM wallet_transactions WHERE type='withdrawal') AS withdrawals,(SELECT COUNT(*) FROM wallet_transactions WHERE type='withdrawal' AND status IN ('pending_review','processing')) AS pending_withdrawals,(SELECT COUNT(*) FROM wallet_transactions WHERE type='withdrawal' AND status='completed') AS completed_withdrawals,(SELECT COALESCE(SUM(COALESCE((SELECT SUM(l.available_delta_units) FROM wallet_ledger_entries l WHERE l.account_id=a.id),0)+COALESCE((SELECT SUM(b.available_delta_units) FROM wallet_balance_entries b WHERE b.account_id=a.id),0)+COALESCE((SELECT SUM(c.amount_units) FROM wallet_referral_credits c WHERE c.account_id=a.id),0)),0) FROM wallet_accounts a) AS available_units,(SELECT COALESCE(SUM(reserved_delta_units),0) FROM wallet_ledger_entries) AS reserved_units").first<any>(),
  env.DB.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN status='active' AND opted_out=0 THEN 1 ELSE 0 END) AS reachable,SUM(CASE WHEN opted_out=1 THEN 1 ELSE 0 END) AS opted_out,SUM(CASE WHEN status='blocked' THEN 1 ELSE 0 END) AS blocked FROM telegram_subscribers").first<any>(),
  env.DB.prepare("SELECT COUNT(*) AS registrations,(SELECT COUNT(*) FROM referral_qualifications) AS qualified,(SELECT COUNT(*) FROM wallet_referral_credits) AS awards,COALESCE((SELECT SUM(amount_units) FROM wallet_referral_credits),0) AS award_units FROM referral_accounts WHERE referred_by_user_id IS NOT NULL").first<any>(),
  env.DB.prepare("SELECT s.last_fixtures_sync,s.last_live_sync,s.last_odds_sync,s.last_error,d.http_status,d.provider_error,d.created_at AS diagnostic_at FROM sports_sync_state s LEFT JOIN api_football_diagnostics d ON d.id=(SELECT id FROM api_football_diagnostics ORDER BY created_at DESC LIMIT 1) WHERE s.provider='api-football'").first<any>(),
  env.DB.prepare("SELECT n.network_code,n.network_name,n.deposit_address,n.deposits_enabled,n.withdrawals_enabled,n.monitor_enabled,m.last_checked_at,m.last_success_at,m.last_error FROM wallet_networks n LEFT JOIN wallet_monitor_state m ON m.network_code=n.network_code ORDER BY n.network_code").all<any>(),
  env.DB.prepare("SELECT id,display_name,telegram_username,status,created_at,last_login_at FROM users WHERE role='user' ORDER BY created_at DESC LIMIT 8").all<any>(),
  env.DB.prepare("SELECT t.id,t.user_id,u.display_name,t.type,t.status,t.amount_units,t.asset,t.network_code,t.created_at FROM wallet_transactions t LEFT JOIN users u ON u.id=t.user_id ORDER BY t.created_at DESC LIMIT 8").all<any>(),
  env.DB.prepare("SELECT t.id,t.user_id,u.display_name,t.status,t.stake,t.combined_odds,t.created_at,t.settled_at FROM bet_tickets t LEFT JOIN users u ON u.id=t.user_id ORDER BY t.created_at DESC LIMIT 8").all<any>(),
  env.DB.prepare("SELECT a.action,a.target_type,a.target_id,a.metadata_json,a.created_at,u.display_name AS admin_name FROM admin_audit_logs a LEFT JOIN users u ON u.id=a.admin_user_id ORDER BY a.created_at DESC LIMIT 12").all<any>(),
  env.DB.prepare("SELECT (SELECT COUNT(*) FROM telegram_broadcast_jobs WHERE status IN ('queued','sending')) AS broadcasts_pending,(SELECT COUNT(*) FROM telegram_notification_outbox WHERE status IN ('pending','sending')) AS notifications_pending,(SELECT COUNT(*) FROM telegram_notification_outbox WHERE status='failed') AS notifications_failed").first<any>()
 ]);
 const walletSettingsRow=await walletSettings(env);
 return json({ok:true,generatedAt:isoNow(),isSuperAdmin:Number(account.is_super_admin)===1,
  users:{total:Number(users?.total||0),active:Number(users?.active||0),inactive:Number(users?.inactive||0),new24h:Number(users?.new24h||0)},
  bets:{total:Number(bets?.total||0),open:Number(bets?.open_count||0),won:Number(bets?.won||0),lost:Number(bets?.lost||0),voided:Number(bets?.voided||0),openStake:Number(bets?.open_stake||0)},
  wallet:{enabled:Number(walletSettingsRow?.enabled||0)===1,deposits:Number(wallet?.deposits||0),pendingDeposits:Number(wallet?.pending_deposits||0),withdrawals:Number(wallet?.withdrawals||0),pendingWithdrawals:Number(wallet?.pending_withdrawals||0),completedWithdrawals:Number(wallet?.completed_withdrawals||0),availableUnits:Number(wallet?.available_units||0),reservedUnits:Number(wallet?.reserved_units||0)},
  telegram:{total:Number(telegramStats?.total||0),reachable:Number(telegramStats?.reachable||0),optedOut:Number(telegramStats?.opted_out||0),blocked:Number(telegramStats?.blocked||0),broadcastsPending:Number(delivery?.broadcasts_pending||0),notificationsPending:Number(delivery?.notifications_pending||0),notificationsFailed:Number(delivery?.notifications_failed||0)},
  referrals:{registrations:Number(referrals?.registrations||0),qualified:Number(referrals?.qualified||0),awards:Number(referrals?.awards||0),awardUnits:Number(referrals?.award_units||0)},
  provider:provider||null,networks:networkRows.results||[],recentUsers:recentUsers.results||[],recentWallet:recentWallet.results||[],recentBets:recentBets.results||[],audit:(audit.results||[]).map((x:any)=>({...x,metadata: x.metadata_json?(()=>{try{return JSON.parse(x.metadata_json)}catch{return null}})():null}))
 });
}
async function adminHtml(env:Env):Promise<Response>{const setup=(await adminCount(env))===0;const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CodeRush Admin</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#141619;color:#f7f7f5;font:15px system-ui;display:grid;place-items:center;padding:20px}.box{width:min(100%,470px);background:#20252b;border:1px solid #343b44;border-radius:18px;padding:28px}.brand{color:#e14a58;font-weight:800;letter-spacing:2px}.muted,small{color:#aeb6c0;line-height:1.5}label{display:block;margin:14px 0 6px;color:#cbd0d6}input{width:100%;padding:13px;border-radius:9px;border:1px solid #48515c;background:#141619;color:white;font:inherit}button{width:100%;padding:13px;margin-top:16px;border:0;border-radius:9px;background:#b92332;color:white;font:inherit;font-weight:700}button.alt{background:#343b44}.msg{color:#ffb7bd;margin-top:12px}.hidden{display:none}.row{padding:12px 0;border-bottom:1px solid #343b44;display:flex;justify-content:space-between;gap:10px}.tag{color:#6fdbab;font-size:12px}</style><body><main class="box"><div class="brand">CODERUSH · ADMIN</div><section id="auth"><h1>${setup?"Register the first Super Admin":"Administrator sign in"}</h1><p class="muted">${setup?"The first account registered becomes the permanent Super Admin.":"Sign in with your administrator email and password."}</p>${setup?'<label>Name</label><input id="name" autocomplete="name">':""}<label>Email address</label><input id="email" type="email" autocomplete="username"><label>Password</label><input id="password" type="password" autocomplete="${setup?"new-password":"current-password"}">${setup?'<label>Confirm password</label><input id="confirm" type="password">':""}<button id="submit">${setup?"Create Super Admin":"Sign in"}</button><div class="msg" id="msg"></div></section><section id="dash" class="hidden"><h1>Admin dashboard</h1><section class="card" style="background:#141619;border:1px solid #343b44;border-radius:12px;padding:16px;margin:18px 0"><h2>Platform overview</h2><p class="muted">Live figures from the production database. Empty activity is shown as zero; no sample data is generated.</p><button class="alt" id="overviewRefresh">Refresh overview</button><div id="overviewUpdated" class="muted" style="margin:8px 0"></div><div id="overviewCards" class="stats"></div><h3>Platform services</h3><div id="overviewServices" class="muted"></div><h3>Recent users</h3><div id="overviewUsers" class="muted"></div><h3>User account management</h3><p class="muted">Search real registered users. Super Admin can suspend or reactivate a user; suspending revokes their active sessions. Wallet balances are read-only here and can only change through audited ledger transactions.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><input id="userSearch" placeholder="Search name, Telegram username or user ID" style="flex:1;min-width:180px"><button class="alt" id="userSearchButton" style="width:auto;margin:0">Search users</button></div><div id="managedUsers" class="muted"></div><h3>Recent wallet activity</h3><div id="overviewWallet" class="muted"></div><h3>Recent betting activity</h3><div id="overviewBets" class="muted"></div><h3>Admin audit trail</h3><div id="overviewAudit" class="muted"></div><div id="overviewError" class="msg"></div></section><p class="muted">Create and manage additional administrator logins.</p><p><a href="/admin/notifications" style="color:#ff8790">Open Telegram broadcast centre →</a></p><div id="list"></div><h3>Crypto wallet operations</h3><p class="muted">USDT wallet controls. Deposits are monitored automatically on supported networks and credited after confirmation. Withdrawals remain manual: approve, send externally, then record the payout transaction hash. Keep the global switch OFF until the owner has supplied and verified the official deposit addresses.</p><label><input id="walletEnabled" type="checkbox" style="width:auto"> Enable live USDT wallet</label><h4>USDT · TRON / TRC20</h4><label>Deposit address</label><input id="walletTrcAddress"><label><input id="walletTrcDeposits" type="checkbox" style="width:auto"> Enable deposits</label><label><input id="walletTrcWithdrawals" type="checkbox" style="width:auto"> Enable withdrawals</label><h4>USDT · Ethereum / ERC20</h4><label>Deposit address</label><input id="walletEthAddress"><label><input id="walletEthDeposits" type="checkbox" style="width:auto"> Enable deposits</label><label><input id="walletEthWithdrawals" type="checkbox" style="width:auto"> Enable withdrawals</label><h4>BNB Smart Chain / BEP20</h4><p class="muted">Disabled until the exact USD₮ contract on BNB Smart Chain is confirmed. Tether lists BNB Smart Chain as a protocol, but its current page does not provide a USD₮ contract address for it.</p><label>Deposit address (locked)</label><input id="walletBscAddress" disabled><label><input id="walletBscDeposits" type="checkbox" style="width:auto" disabled> Deposits unavailable</label><label><input id="walletBscWithdrawals" type="checkbox" style="width:auto" disabled> Withdrawals unavailable</label><button id="walletSave">Save wallet settings</button><div class="msg" id="walletMsg"></div><h3>Automatic deposit monitor status</h3><pre id="walletMonitorStatus" class="muted" style="white-space:pre-wrap"></pre><h3>Wallet transaction review</h3><button class="alt" id="walletRefresh">Refresh wallet queue</button><div id="walletQueue" class="muted"></div><h3>Referral programme</h3><p class="muted">Real referral registrations and qualifying actions. A referral qualifies after the invited user completes their first verified deposit or first settled winning/losing bet. Commission sharing: 10% / 5% / 3% of verified settled winning-bet profit. Credits are platform-funded and added to the referrer wallet.</p><div id="referralStats" class="muted"></div><label><input id="referralTracking" type="checkbox" style="width:auto"> Enable referral attribution tracking</label><label><input id="referralCommissionEnabled" type="checkbox" style="width:auto"> Enable 10% / 5% / 3% commission credits</label><p class="muted">Level 1: 10% · Level 2: 5% · Level 3: 3% of settled winning-bet profit. Platform-funded.</p><button id="referralSave">Save referral settings</button><div id="referralMsg" class="msg"></div><button class="alt" id="referralRefresh">Refresh referral activity</button><div id="referralRows" class="muted"></div><h4>Recent commission credits</h4><pre id="referralAwards" class="muted" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre><h3>Sports data</h3><p class="muted">Use your administrator session to refresh the football fixtures and available odds from API-Football.</p><button id="sync">Sync sports feed now</button><div class="msg" id="syncmsg"></div><h3>API-Football diagnostics</h3><p class="muted">Inspect the provider's actual HTTP status and quota headers. This does not send another provider request.</p><button id="probe">Run one-request API test</button><div class="msg" id="probemsg"></div><button class="alt" id="diag">Refresh diagnostics</button><pre id="diagdata" class="muted" style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:320px;overflow:auto;font-size:12px"></pre><h3>Create administrator</h3><label>Name</label><input id="newname"><label>Email</label><input id="newemail" type="email"><label>Temporary password</label><input id="newpass" type="password"><button id="create">Create admin login</button><div class="msg" id="dm"></div><button class="alt" id="logout">Sign out</button></section></main><script>const $=x=>document.getElementById(x),setup=${setup};async function call(url,data,method="POST"){const r=await fetch(url,{method,credentials:"same-origin",headers:data?{"content-type":"application/json"}:{},body:data?JSON.stringify(data):undefined});const j=await r.json();if(!r.ok)throw Error(j.error||"Request failed");return j}async function dashboard(){ $("auth").classList.add("hidden");$("dash").classList.remove("hidden");const j=await call("/api/admin/users",null,"GET");$("list").innerHTML=j.admins.map(a=>'<div class="row"><span>'+a.email+'<br><small>'+a.display_name+'</small></span><span class="tag">'+(a.is_super_admin?"SUPER ADMIN":"ADMIN")+'</span></div>').join("");await loadWalletSettings();await refreshWalletQueue();await loadReferralAdmin();await loadAdminOverview()}call("/api/admin/session",null,"GET").then(dashboard).catch(()=>{});$("submit").onclick=async()=>{try{if(setup&&$("password").value!==$("confirm").value)throw Error("Passwords do not match");await call(setup?"/api/admin/setup":"/api/admin/login",{email:$("email").value,password:$("password").value,name:setup?$("name").value:undefined});await dashboard()}catch(e){$("msg").textContent=e.message}};const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function searchManagedUsers(){try{const q=$("userSearch").value.trim(),d=await call("/api/admin/manage-users?q="+encodeURIComponent(q),null,"GET");$("managedUsers").innerHTML=d.users.length?d.users.map(u=>'<div class="row" style="display:block"><b>'+esc(u.display_name||u.id)+'</b> · '+esc(u.status)+'<br><small>'+esc(u.telegram_username||"No Telegram username")+' · '+esc(u.id)+' · joined '+esc(u.created_at)+' · last login '+esc(u.last_login_at||"never")+'</small><br><small>Available '+(Number(u.available_units)/1000000).toFixed(2)+' USDT · Reserved '+(Number(u.reserved_units)/1000000).toFixed(2)+' USDT · '+u.bet_count+' bets · '+u.wallet_tx_count+' wallet transactions</small>'+(d.isSuperAdmin?'<br><button class="alt" style="width:auto" data-user="'+esc(u.id)+'" data-status="'+(u.status==="active"?"suspended":"active")+'">'+(u.status==="active"?"Suspend account":"Reactivate account")+'</button>':"")+'</div>').join(""):"No matching user accounts.";document.querySelectorAll("[data-user]").forEach(b=>b.onclick=async()=>{if(!confirm((b.dataset.status==="suspended"?"Suspend":"Reactivate")+" this user account?"))return;try{await call("/api/admin/manage-users",{userId:b.dataset.user,status:b.dataset.status});await searchManagedUsers();await loadAdminOverview()}catch(e){$("overviewError").textContent=e.message}})}catch(e){$("managedUsers").textContent=e.message}}$("userSearchButton").onclick=searchManagedUsers;$("userSearch").addEventListener("keydown",e=>{if(e.key==="Enter")searchManagedUsers()});async function loadAdminOverview(){try{const d=await call("/api/admin/overview",null,"GET"),money=n=>(Number(n||0)/1000000).toFixed(2)+" USDT";$("overviewUpdated").textContent="Updated "+new Date(d.generatedAt).toLocaleString();const cards=[["Users",d.users.total],["Active users",d.users.active],["New users · 24h",d.users.new24h],["Open bets",d.bets.open],["All tickets",d.bets.total],["Open stake",Number(d.bets.openStake||0).toFixed(2)+" USDT"],["Wallet available",money(d.wallet.availableUnits)],["Wallet reserved",money(d.wallet.reservedUnits)],["Pending deposits",d.wallet.pendingDeposits],["Pending withdrawals",d.wallet.pendingWithdrawals],["Telegram reachable",d.telegram.reachable],["Referral registrations",d.referrals.registrations]];$("overviewCards").innerHTML=cards.map(x=>'<div class="stat"><b>'+esc(x[1])+'</b><br><small>'+esc(x[0])+'</small></div>').join("");const p=d.provider||{};$("overviewServices").innerHTML='<div class="row">Wallet: <b>'+(d.wallet.enabled?"Enabled":"Disabled")+'</b> · withdrawals are manual only</div><div class="row">API-Football: <b>'+(p.last_error?"Provider error recorded":p.last_fixtures_sync?"Sync timestamp recorded":"No successful sync recorded")+'</b> · last fixtures '+esc(p.last_fixtures_sync||"not recorded")+' · last live '+esc(p.last_live_sync||"not recorded")+' · last odds '+esc(p.last_odds_sync||"not recorded")+' · latest HTTP '+esc(p.http_status??"not recorded")+(p.provider_error?" · "+esc(p.provider_error):"")+'</div>'+d.networks.map(n=>'<div class="row">'+esc(n.network_name)+': monitoring '+(n.monitor_enabled?"on":"off")+' · deposits '+(n.deposits_enabled?"on":"off")+' · withdrawals '+(n.withdrawals_enabled?"on":"off")+' · last check '+esc(n.last_checked_at||"none")+(n.last_error?" · "+esc(n.last_error):"")+'</div>').join("")+'<div class="row">Telegram: '+d.telegram.reachable+' reachable / '+d.telegram.total+' total · pending broadcasts '+d.telegram.broadcastsPending+' · pending alerts '+d.telegram.notificationsPending+' · failed alerts '+d.telegram.notificationsFailed+'</div>';$("overviewUsers").innerHTML=d.recentUsers.length?d.recentUsers.map(u=>'<div class="row">'+esc(u.display_name||u.id)+' · '+esc(u.telegram_username||"no Telegram username")+' · '+esc(u.status)+' · '+esc(u.created_at)+'</div>').join(""):"No registered users yet.";$("overviewWallet").innerHTML=d.recentWallet.length?d.recentWallet.map(t=>'<div class="row">'+esc(t.display_name||t.user_id)+' · '+esc(t.type)+' · '+esc(t.status)+' · '+money(t.amount_units)+' · '+esc(t.network_code)+' · '+esc(t.created_at)+'</div>').join(""):"No wallet transactions recorded.";$("overviewBets").innerHTML=d.recentBets.length?d.recentBets.map(t=>'<div class="row">'+esc(t.display_name||t.user_id)+' · '+esc(t.status)+' · '+esc(t.stake)+' USDT @ '+esc(t.combined_odds)+' · '+esc(t.created_at)+'</div>').join(""):"No betting tickets recorded.";$("overviewAudit").innerHTML=d.audit.length?d.audit.map(a=>'<div class="row">'+esc(a.admin_name||"Admin")+' · '+esc(a.action)+' · '+esc(a.target_type||"")+' '+esc(a.target_id||"")+' · '+esc(a.created_at)+'</div>').join(""):"No admin actions recorded yet.";$("overviewError").textContent=""}catch(e){$("overviewError").textContent=e.message}}$("overviewRefresh").onclick=loadAdminOverview;async function loadWalletSettings(){try{const d=await call("/api/admin/wallet-settings",null,"GET");$("walletEnabled").checked=!!d.settings.enabled;const map={USDT_TRC20:["walletTrcAddress","walletTrcDeposits","walletTrcWithdrawals"],USDT_ERC20:["walletEthAddress","walletEthDeposits","walletEthWithdrawals"],USDT_BEP20:["walletBscAddress","walletBscDeposits","walletBscWithdrawals"]};for(const n of d.networks){const ids=map[n.network_code];if(ids){$(ids[0]).value=n.deposit_address||"";$(ids[1]).checked=!!n.deposits_enabled;$(ids[2]).checked=!!n.withdrawals_enabled}}$("walletMonitorStatus").textContent=d.networks.map(n=>n.network_name+" | automatic monitoring: "+(n.monitor_enabled?"enabled":"disabled")+" | readiness: "+(n.monitor_ready?"ready":(n.monitor_note||"not ready"))+" | last check: "+(n.last_checked_at||"not run")+" | last success: "+(n.last_success_at||"none")+" | error: "+(n.last_error||"none")).join("\n")}catch(e){$("walletMsg").textContent=e.message}}async function loadReferralAdmin(){try{const d=await call("/api/admin/referrals",null,"GET");$("referralTracking").checked=!!d.settings.tracking_enabled;$("referralCommissionEnabled").checked=!!d.settings.commission_enabled;$("referralStats").textContent="Registrations: "+d.totals.registrations+" · Qualified: "+d.totals.qualified+" · Referrers: "+d.totals.activeReferrers+" · Commission credits: "+(d.settings.commission_enabled?"enabled":"disabled")+" · Awards: "+d.totals.commissionCount+" · Paid: "+(Number(d.totals.commissionUnits)/1000000).toFixed(6)+" USDT";$("referralRows").innerHTML=d.referrals.length?d.referrals.map(r=>'<div class="row"><span>'+esc(r.referred_name||r.referred_user_id)+' invited by '+esc(r.referrer_name||r.referrer_id)+'<br><small>'+esc(r.referral_code)+' · '+esc(r.attributed_at||"")+"</small></span><span class=\"tag\">"+esc(r.qualifying_action||"REGISTERED")+"</span></div>").join(""):" <p>No referral registrations recorded yet.</p>";$("referralAwards").textContent=JSON.stringify((d.awards||[]).map(a=>({beneficiary:a.beneficiary_name||a.user_id,level:a.referral_level,rate:Number(a.rate_bps)/100,amountUSDT:(Number(a.amount_units)/1000000).toFixed(6),bet:a.source_ticket_id,createdAt:a.created_at})),null,2)}catch(e){$("referralMsg").textContent=e.message}}$("referralRefresh").onclick=loadReferralAdmin;$("referralSave").onclick=async()=>{try{await call("/api/admin/referrals",{trackingEnabled:$("referralTracking").checked,commissionEnabled:$("referralCommissionEnabled").checked});$("referralMsg").textContent="Referral settings saved.";await loadReferralAdmin()}catch(e){$("referralMsg").textContent=e.message}};async function refreshWalletQueue(){try{const d=await call("/api/admin/wallet-transactions",null,"GET");$("walletQueue").innerHTML=d.transactions.length?d.transactions.map(t=>'<div class="row" style="display:block"><b>'+esc(t.type.toUpperCase())+' · '+esc(t.status)+'</b><br>'+esc(t.display_name||t.user_id)+' · '+(Number(t.amount_units)/1000000).toFixed(2)+' USDT · '+esc(t.network_code)+'<br><small>TX: '+esc(t.tx_hash||t.destination_address||"—")+'</small><br><small>'+esc(t.chain_error||t.created_at)+'</small><div style="display:flex;gap:6px">'+(t.type==="withdrawal"?'<button data-wallet-id="'+esc(t.id)+'" data-wallet-action="approve" style="flex:1">Approve / Start manual payout</button>':"")+'<button class="alt" data-wallet-id="'+esc(t.id)+'" data-wallet-action="reject" style="flex:1">Reject</button>'+(t.type==="withdrawal"&&t.status==="processing"?'<button data-wallet-id="'+esc(t.id)+'" data-wallet-action="paid" style="flex:1">Record payout hash</button>':"")+'</div></div>').join(""):"<p>No wallet transactions yet.</p>"}catch(e){$("walletQueue").textContent=e.message}}$("walletSave").onclick=async()=>{try{$("walletSave").disabled=true;const networks=[{networkCode:"USDT_TRC20",depositAddress:$("walletTrcAddress").value,depositsEnabled:$("walletTrcDeposits").checked,withdrawalsEnabled:$("walletTrcWithdrawals").checked,monitorEnabled:true},{networkCode:"USDT_ERC20",depositAddress:$("walletEthAddress").value,depositsEnabled:$("walletEthDeposits").checked,withdrawalsEnabled:$("walletEthWithdrawals").checked,monitorEnabled:true},{networkCode:"USDT_BEP20",depositAddress:$("walletBscAddress").value,depositsEnabled:$("walletBscDeposits").checked,withdrawalsEnabled:$("walletBscWithdrawals").checked,monitorEnabled:false}];await call("/api/admin/wallet-settings",{enabled:$("walletEnabled").checked,networks});$("walletMsg").textContent="Wallet settings saved.";await loadWalletSettings()}catch(e){$("walletMsg").textContent=e.message}finally{$("walletSave").disabled=false}};
$("walletRefresh").onclick=refreshWalletQueue;
$("walletQueue").onclick=async e=>{const b=e.target.closest("button[data-wallet-id]");if(!b)return;try{b.disabled=true;let payoutTxHash;if(b.dataset.walletAction==="paid"){payoutTxHash=prompt("Enter the completed on-chain payout transaction hash");if(!payoutTxHash){b.disabled=false;return}}await call("/api/admin/wallet-transactions/"+encodeURIComponent(b.dataset.walletId),{action:b.dataset.walletAction,payoutTxHash});await refreshWalletQueue()}catch(err){alert(err.message);b.disabled=false}};
$("probe").onclick=async()=>{try{$("probe").disabled=true;$("probemsg").textContent="Sending exactly one API-Football request…";const p=await call("/api/admin/sports-probe",{});$("probemsg").textContent="Test succeeded. Fixtures returned: "+p.fixtures+"."}catch(e){$("probemsg").textContent=e.message}finally{$("probe").disabled=false}};$("diag").onclick=async()=>{try{$("diag").disabled=true;$("diagdata").textContent="Loading stored diagnostics…";const d=await call("/api/admin/sports-diagnostics",null,"GET");$("diagdata").textContent=JSON.stringify(d,null,2)}catch(e){$("diagdata").textContent=e.message}finally{$("diag").disabled=false}};$("sync").onclick=async()=>{try{$("sync").disabled=true;$("syncmsg").textContent="Syncing…";const result=await call("/api/sports/sync",{});$("syncmsg").textContent="Sync complete: "+result.fixtures+" fixtures, "+result.odds+" pre-match odds; "+result.liveFixtures+" live fixtures, "+result.liveOdds+" live odds."}catch(e){$("syncmsg").textContent=e.message}finally{$("sync").disabled=false}};$("create").onclick=async()=>{try{await call("/api/admin/users",{name:$("newname").value,email:$("newemail").value,password:$("newpass").value});$("dm").textContent="Admin account created.";await dashboard()}catch(e){$("dm").textContent=e.message}};$("logout").onclick=async()=>{await call("/api/auth/logout",{});location.reload()}</script></body></html>`;return new Response(html,{headers:{"content-type":"text/html;charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","content-security-policy":"default-src 'self';script-src 'unsafe-inline';style-src 'unsafe-inline';base-uri 'none';frame-ancestors 'none'"}})}
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
  const dataCheckString = Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => key + "=" + value).join("\n");
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
  const existingUser = await env.DB.prepare("SELECT id FROM users WHERE id=?").bind(userId).first<{id:string}>();
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
  if (!existingUser && user.role === "user") {
    const subscriber = await env.DB.prepare("SELECT referred_by FROM telegram_subscribers WHERE telegram_user_id=? AND referred_by IS NOT NULL ORDER BY first_seen_at ASC LIMIT 1").bind(userId).first<{referred_by:string}>();
    const suppliedCode = String(subscriber?.referred_by || "").trim();
    let referrer = await env.DB.prepare("SELECT r.user_id AS id FROM referral_accounts r JOIN users u ON u.id=r.user_id WHERE r.referral_code=? AND u.role='user' AND u.status='active'").bind(suppliedCode).first<{id:string}>();
    if (!referrer) {
      const legacy = /^u([0-9]+)$/.exec(suppliedCode);
      if (legacy) referrer = await env.DB.prepare("SELECT id FROM users WHERE id=? AND role='user' AND status='active'").bind(legacy[1]).first<{id:string}>();
    }
    if (referrer && referrer.id !== userId) {
      const existingReferrerAccount = await env.DB.prepare("SELECT user_id FROM referral_accounts WHERE user_id=?").bind(referrer.id).first();
      if (!existingReferrerAccount) await env.DB.prepare("INSERT OR IGNORE INTO referral_accounts(user_id,referral_code) VALUES(?,?)").bind(referrer.id,newReferralCode()).run();
      await env.DB.prepare("INSERT OR IGNORE INTO referral_accounts(user_id,referral_code,referred_by_user_id,attributed_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM referral_program_settings WHERE id=1 AND tracking_enabled=1)").bind(userId,newReferralCode(),referrer.id,isoNow()).run();
      await env.DB.prepare("INSERT INTO referral_audit_events(id,actor_user_id,event_type,subject_user_id,details_json) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM referral_accounts WHERE user_id=? AND referred_by_user_id=?)").bind(crypto.randomUUID(),referrer.id,"referral_attributed",userId,JSON.stringify({source:"telegram_start_payload"}),userId,referrer.id).run();
    }
  }
  await env.DB.prepare("INSERT OR IGNORE INTO referral_accounts(user_id,referral_code) VALUES(?,?)").bind(userId,newReferralCode()).run();
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
  score?: { fulltime?: { home: number | null; away: number | null } | null };
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
async function createUserNotification(env:Env,userId:string,eventKey:string,category:"bet"|"wallet"|"referral"|"system",titleEn:string,bodyEn:string,titleAr:string,bodyAr:string,deepLink:string):Promise<void>{
 const user=await env.DB.prepare("SELECT language FROM users WHERE id=? AND status='active'").bind(userId).first<{language:string}>();if(!user)return;
 const prefs=await env.DB.prepare("SELECT in_app_enabled,telegram_enabled FROM notification_preferences WHERE user_id=?").bind(userId).first<any>();
 const title=user.language==="AR"?titleAr:titleEn,body=user.language==="AR"?bodyAr:bodyEn,now=isoNow(),id=crypto.randomUUID();
 await env.DB.prepare("INSERT OR IGNORE INTO user_notifications(id,user_id,event_key,category,title,body,deep_link,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(id,userId,eventKey,category,title,body,deepLink,now).run();
 const notification=await env.DB.prepare("SELECT id FROM user_notifications WHERE event_key=?").bind(eventKey).first<{id:string}>();if(!notification||Number(prefs?.telegram_enabled??1)!==1)return;
 await env.DB.prepare("INSERT OR IGNORE INTO telegram_notification_outbox(id,notification_id,user_id,chat_id,message_text) SELECT ?,?,?,s.chat_id,? FROM telegram_subscribers s WHERE s.telegram_user_id=? AND s.status='active' AND s.opted_out=0 ORDER BY s.last_seen_at DESC LIMIT 1").bind(crypto.randomUUID(),notification.id,userId,title+"\n\n"+body,userId).run();
}
async function deliverTelegramNotificationOutbox(env:Env):Promise<void>{
 if(!env.TELEGRAM_BOT_TOKEN)return;const now=isoNow();
 const rows=await env.DB.prepare("SELECT id,chat_id,message_text,attempts FROM telegram_notification_outbox WHERE (status='pending' AND datetime(next_attempt_at)<=datetime(?)) OR (status='sending' AND datetime(locked_until)<=datetime(?)) ORDER BY created_at LIMIT 15").bind(now,now).all<any>();
 for(const row of rows.results||[]){
  const lock=await env.DB.prepare("UPDATE telegram_notification_outbox SET status='sending',locked_until=?,attempts=attempts+1 WHERE id=? AND ((status='pending' AND datetime(next_attempt_at)<=datetime(?)) OR (status='sending' AND datetime(locked_until)<=datetime(?)))").bind(new Date(Date.now()+60000).toISOString(),row.id,now,now).run();if(Number(lock.meta?.changes||0)!==1)continue;
  try{await telegram(env,"sendMessage",{chat_id:row.chat_id,text:row.message_text,disable_web_page_preview:true});await env.DB.prepare("UPDATE telegram_notification_outbox SET status='sent',sent_at=?,locked_until=NULL,last_error=NULL WHERE id=? AND status='sending'").bind(isoNow(),row.id).run();}
  catch(error){const detail=(error instanceof Error?error.message:String(error)).slice(0,500),attempts=Number(row.attempts||0)+1,blocked=/blocked|deactivated|chat not found|bot was blocked/i.test(detail),terminal=blocked||attempts>=8,delay=Math.min(21600,30*Math.pow(2,Math.min(attempts,10)));await env.DB.prepare("UPDATE telegram_notification_outbox SET status=?,next_attempt_at=?,locked_until=NULL,last_error=? WHERE id=? AND status='sending'").bind(terminal?"failed":"pending",new Date(Date.now()+delay*1000).toISOString(),detail,row.id).run();if(blocked)await env.DB.prepare("UPDATE telegram_subscribers SET status='blocked',last_error=? WHERE chat_id=?").bind(detail,row.chat_id).run();}
  await sleep(40);
 }
}
async function handleNotifications(request:Request,env:Env):Promise<Response>{
 const session=await currentSession(request,env);if(!session)return json({ok:false,error:"Authentication required"},401);
 if(request.method==="GET"){
  await env.DB.prepare("INSERT OR IGNORE INTO notification_preferences(user_id) VALUES(?)").bind(session.user.id).run();
  const [items,prefs,unread]=await Promise.all([env.DB.prepare("SELECT id,category,title,body,deep_link,created_at,read_at FROM user_notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100").bind(session.user.id).all<any>(),env.DB.prepare("SELECT in_app_enabled,telegram_enabled FROM notification_preferences WHERE user_id=?").bind(session.user.id).first<any>(),env.DB.prepare("SELECT COUNT(*) AS total FROM user_notifications WHERE user_id=? AND read_at IS NULL").bind(session.user.id).first<any>()]);
  const enabled=Number(prefs?.in_app_enabled??1)===1;return json({ok:true,notifications:enabled?(items.results||[]):[],unreadCount:enabled?Number(unread?.total||0):0,preferences:{inAppEnabled:enabled,telegramEnabled:Number(prefs?.telegram_enabled??1)===1}});
 }
 if(!sameOrigin(request))return json({ok:false,error:"Invalid origin"},403);let body:any;try{body=await request.json()}catch{return json({ok:false,error:"Invalid request body"},400)}
 if(request.method==="POST"){if(body.markAll===true)await env.DB.prepare("UPDATE user_notifications SET read_at=? WHERE user_id=? AND read_at IS NULL").bind(isoNow(),session.user.id).run();else if(typeof body.id==="string")await env.DB.prepare("UPDATE user_notifications SET read_at=? WHERE id=? AND user_id=? AND read_at IS NULL").bind(isoNow(),body.id,session.user.id).run();else return json({ok:false,error:"Provide an id or markAll=true."},400);return json({ok:true});}
 if(request.method==="PATCH"){if(typeof body.inAppEnabled!=="boolean"||typeof body.telegramEnabled!=="boolean")return json({ok:false,error:"Preferences must be boolean values."},400);await env.DB.prepare("INSERT INTO notification_preferences(user_id,in_app_enabled,telegram_enabled,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET in_app_enabled=excluded.in_app_enabled,telegram_enabled=excluded.telegram_enabled,updated_at=excluded.updated_at").bind(session.user.id,body.inAppEnabled?1:0,body.telegramEnabled?1:0,isoNow()).run();return json({ok:true,preferences:{inAppEnabled:body.inAppEnabled,telegramEnabled:body.telegramEnabled}});}
 return json({ok:false,error:"Method not allowed"},405);
}
async function handleAdminTelegram(request:Request,env:Env):Promise<Response>{
 const session=await currentSession(request,env);if(!session||session.user.role!=="admin")return json({ok:false,error:"Administrator access required"},403);const admin=await env.DB.prepare("SELECT is_super_admin FROM admin_accounts WHERE user_id=?").bind(session.user.id).first<any>();if(!admin)return json({ok:false,error:"Administrator access required"},403);
 if(request.method==="GET"){const [stats,history,delivery]=await Promise.all([env.DB.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN status='active' AND opted_out=0 THEN 1 ELSE 0 END) AS reachable,SUM(CASE WHEN opted_out=1 THEN 1 ELSE 0 END) AS opted_out,SUM(CASE WHEN status='blocked' THEN 1 ELSE 0 END) AS blocked FROM telegram_subscribers").first<any>(),env.DB.prepare("SELECT id,message,sent_count,failed_count,blocked_count,status,total_count,created_at FROM telegram_broadcast_jobs ORDER BY created_at DESC LIMIT 20").all<any>(),env.DB.prepare("SELECT SUM(CASE WHEN status IN ('pending','sending') THEN 1 ELSE 0 END) AS pending,SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed FROM telegram_notification_outbox").first<any>() ]);return json({ok:true,subscribers:{total:Number(stats?.total||0),reachable:Number(stats?.reachable||0),optedOut:Number(stats?.opted_out||0),blocked:Number(stats?.blocked||0)},delivery:{pending:Number(delivery?.pending||0),failed:Number(delivery?.failed||0)},jobs:history.results||[]});}
 if(Number(admin.is_super_admin)!==1)return json({ok:false,error:"Super Admin access required"},403);if(!sameOrigin(request))return json({ok:false,error:"Invalid origin"},403);let body:any;try{body=await request.json()}catch{return json({ok:false,error:"Invalid request body"},400)}
 const message=String(body.text||"").trim();if(!message||message.length>4096)return json({ok:false,error:"Message must contain 1–4096 characters."},400);const count=await env.DB.prepare("SELECT COUNT(*) AS total FROM telegram_subscribers WHERE status='active' AND opted_out=0").first<any>();const total=Number(count?.total||0);if(!total)return json({ok:false,error:"No active Telegram subscribers are available."},409);const id=crypto.randomUUID();
 await env.DB.prepare("INSERT INTO telegram_broadcast_jobs(id,created_by,message,audience,status,total_count,created_at) VALUES(?,?,?,'all_active','queued',?,?)").bind(id,session.user.id,message,total,isoNow()).run();return json({ok:true,broadcastId:id,totalQueued:total,status:"queued"},202);
}
async function deliverTelegramBroadcastJobs(env:Env):Promise<void>{
 if(!env.TELEGRAM_BOT_TOKEN)return;const jobs=await env.DB.prepare("SELECT * FROM telegram_broadcast_jobs WHERE status IN ('queued','sending') ORDER BY created_at LIMIT 1").all<any>();
 for(const job of jobs.results||[]){await env.DB.prepare("UPDATE telegram_broadcast_jobs SET status='sending',started_at=COALESCE(started_at,?) WHERE id=? AND status IN ('queued','sending')").bind(isoNow(),job.id).run();
  const recipients=await env.DB.prepare("SELECT chat_id FROM telegram_subscribers WHERE status='active' AND opted_out=0 AND chat_id>? ORDER BY chat_id LIMIT 20").bind(job.last_chat_id||"").all<{chat_id:string}>();let sent=0,failed=0,blocked=0;
  for(const recipient of recipients.results||[]){try{await telegram(env,"sendMessage",{chat_id:recipient.chat_id,text:job.message,disable_web_page_preview:true});sent++;}catch(error){const detail=(error instanceof Error?error.message:String(error)).slice(0,500);if(/blocked|deactivated|chat not found/i.test(detail)){blocked++;await env.DB.prepare("UPDATE telegram_subscribers SET status='blocked',last_error=? WHERE chat_id=?").bind(detail,recipient.chat_id).run();}else failed++;}await sleep(40);}
  const last=recipients.results?.[recipients.results.length-1]?.chat_id||null;await env.DB.prepare("UPDATE telegram_broadcast_jobs SET sent_count=sent_count+?,failed_count=failed_count+?,blocked_count=blocked_count+?,last_chat_id=COALESCE(?,last_chat_id),status=CASE WHEN ? IS NULL THEN 'completed' ELSE 'sending' END,completed_at=CASE WHEN ? IS NULL THEN ? ELSE completed_at END WHERE id=?").bind(sent,failed,blocked,last,last,last,isoNow(),job.id).run();break;
 }
}
const isoNow = () => new Date().toISOString();
const dayString = (date: Date) => date.toISOString().slice(0, 10);
function fixtureIsLive(status: string): boolean {
  return ["1H","HT","2H","ET","BT","P","LIVE"].includes(status);
}
function fixtureSettlementScore(item:ApiFootballFixture):{home:number|null;away:number|null}{
  const status=item.fixture.status.short;
  const fulltime=item.score?.fulltime;
  if(status==="AET"||status==="PEN")return {home:fulltime?.home??null,away:fulltime?.away??null};
  if(["FT","AWD","WO"].includes(status))return {home:fulltime?.home??item.goals.home,away:fulltime?.away??item.goals.away};
  return {home:null,away:null};
}
async function storeFootballFixtures(env: Env, fixtures: ApiFootballFixture[]): Promise<number> {
  if (!fixtures.length) return 0;
  const now = isoNow();
  const statements = fixtures.map(item => {
    const result=fixtureSettlementScore(item);
    return env.DB.prepare(`
    INSERT INTO sports_fixtures
      (id,league_id,league_name,country,season,kickoff,status_short,status_long,elapsed,home_team,away_team,home_code,away_code,home_score,away_score,result_home_score,result_away_score,is_live,updated_at,raw_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      league_id=excluded.league_id,league_name=excluded.league_name,country=excluded.country,season=excluded.season,
      kickoff=excluded.kickoff,status_short=excluded.status_short,status_long=excluded.status_long,elapsed=excluded.elapsed,
      home_team=excluded.home_team,away_team=excluded.away_team,home_code=excluded.home_code,away_code=excluded.away_code,
      home_score=excluded.home_score,away_score=excluded.away_score,result_home_score=excluded.result_home_score,
      result_away_score=excluded.result_away_score,is_live=excluded.is_live,
      updated_at=excluded.updated_at,raw_json=excluded.raw_json
  `).bind(
    String(item.fixture.id),item.league.id,item.league.name,item.league.country||null,item.league.season||null,
    item.fixture.date,item.fixture.status.short,item.fixture.status.long,item.fixture.status.elapsed,
    item.teams.home.name,item.teams.away.name,item.teams.home.code||null,item.teams.away.code||null,
    item.goals.home,item.goals.away,result.home,result.away,fixtureIsLive(item.fixture.status.short)?1:0,now,JSON.stringify(item)
  );
  });
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
      json_extract(f.raw_json,'$.teams.home.logo') AS home_logo,json_extract(f.raw_json,'$.teams.away.logo') AS away_logo,json_extract(f.raw_json,'$.league.logo') AS league_logo,
      f.home_score,f.away_score,o.bookmaker_name,o.outcome_key,o.odd,o.suspended,o.updated_at AS odds_updated_at
    FROM sports_fixtures f LEFT JOIN sports_odds o ON o.fixture_id=f.id AND o.market_id=1
    WHERE substr(f.kickoff,1,10)>=? AND substr(f.kickoff,1,10)<=?
    ORDER BY f.kickoff ASC
  `).bind(from,to).all<Record<string,unknown>>();
  const map=new Map<string,Record<string,unknown>>();
  for(const row of rows.results||[]){
    let item=map.get(String(row.id));
    if(!item){item={id:String(row.id),league:String(row.league_name),country:row.country||"",kickoff:row.kickoff,home:String(row.home_team),away:String(row.away_team),homeCode:row.home_code||"",awayCode:row.away_code||"",homeLogo:row.home_logo||null,awayLogo:row.away_logo||null,leagueLogo:row.league_logo||null,status:String(row.status_short),minute:row.elapsed,live:fixtureIsLive(String(row.status_short)),completed:["FT","AET","PEN","AWD","WO","CANC"].includes(String(row.status_short)),score:row.home_score===null||row.away_score===null?null:String(row.home_score)+" : "+String(row.away_score),odds:[null,null,null],bookmaker:null,oddsUpdatedAt:null};map.set(String(row.id),item);}
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
function publicTicket(row:any,selections:any[]){return {id:row.id,status:row.status,ticketType:row.ticket_type,stake:Number(row.stake),combinedOdds:Number(row.combined_odds),potential:Number(row.potential_return),settledOdds:row.settled_odds===null||row.settled_odds===undefined?null:Number(row.settled_odds),settledReturn:row.settled_return===null||row.settled_return===undefined?null:Number(row.settled_return),settledAt:row.settled_at||null,createdAt:row.created_at,selections:selections.map(s=>({id:s.id,fixtureId:s.fixture_id,fixture:s.home_team+" vs "+s.away_team,league:s.league_name,outcome:s.outcome_name,odd:Number(s.odd),resultStatus:s.result_status||"pending",resultScore:s.result_home_score===null||s.result_home_score===undefined||s.result_away_score===null||s.result_away_score===undefined?null:String(s.result_home_score)+" - "+String(s.result_away_score),resultFixtureStatus:s.result_fixture_status||null}))};}
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
  return json({ok:false,error:"Bet placement is temporarily unavailable. Live USDT wallet staking and payout settlement must be completed before real-money tickets can be accepted."},503);
}
async function handleBetList(request:Request,env:Env):Promise<Response>{
  const session=await currentSession(request,env);
  if(!session)return json({ok:false,error:"Authentication required"},401);
  const limit=Math.min(50,Math.max(1,Number(new URL(request.url).searchParams.get("limit"))||25));
  const rows=await env.DB.prepare("SELECT * FROM bet_tickets WHERE user_id=? ORDER BY created_at DESC LIMIT ?").bind(session.user.id,limit).all<any>();
  const tickets=rows.results||[];
  const grouped=new Map<string,any[]>();
  if(tickets.length){
    const placeholders=tickets.map(()=>"?").join(",");
    const picks=await env.DB.prepare("SELECT * FROM bet_ticket_selections WHERE ticket_id IN ("+placeholders+") ORDER BY ticket_id,selection_index").bind(...tickets.map(t=>t.id)).all<any>();
    for(const pick of picks.results||[]){const list=grouped.get(pick.ticket_id)||[];list.push(pick);grouped.set(pick.ticket_id,list);}
  }
  const [aggregate,recent]=await Promise.all([
    env.DB.prepare(`SELECT
      SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) AS open_count,
      SUM(CASE WHEN status='won' THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN status='lost' THEN 1 ELSE 0 END) AS losses,
      SUM(CASE WHEN status='void' THEN 1 ELSE 0 END) AS voids,
      COALESCE(SUM(CASE WHEN status IN ('won','lost','void') THEN COALESCE(settled_return,0)-stake ELSE 0 END),0) AS net_result,
      COALESCE(MAX(CASE WHEN status='won' THEN COALESCE(settled_return,0) ELSE 0 END),0) AS best_return
      FROM bet_tickets WHERE user_id=?`).bind(session.user.id).first<any>(),
    env.DB.prepare("SELECT status FROM bet_tickets WHERE user_id=? AND status IN ('won','lost','void') ORDER BY settled_at DESC,created_at DESC LIMIT 100").bind(session.user.id).all<any>()
  ]);
  let winStreak=0;for(const item of recent.results||[]){if(item.status!=="won")break;winStreak++;}
  const wins=Number(aggregate?.wins||0),losses=Number(aggregate?.losses||0);
  const summary={openCount:Number(aggregate?.open_count||0),settledCount:wins+losses+Number(aggregate?.voids||0),wins,losses,voids:Number(aggregate?.voids||0),netResult:Number(aggregate?.net_result||0),bestReturn:Number(aggregate?.best_return||0),winStreak,accuracy:wins+losses?Math.round(wins/(wins+losses)*100):0};
  return json({ok:true,bets:tickets.map(ticket=>publicTicket(ticket,grouped.get(ticket.id)||[])),summary});
}
type BetSettlementFixtureRow={id:string;kickoff:string;status_short:string;result_home_score:number|null;result_away_score:number|null;result_checked_at:string|null};
function settledSelectionResult(outcomeKey:string,fixture:BetSettlementFixtureRow):"won"|"lost"|"void"|null{
  const status=fixture.status_short;
  if(status==="CANC")return "void";
  const kickoff=Date.parse(fixture.kickoff),age=Number.isFinite(kickoff)?Date.now()-kickoff:-1;
  if(status==="ABD")return age>=24*60*60*1000?"void":null;
  if(["PST","SUSP","INT"].includes(status))return age>=48*60*60*1000?"void":null;
  if(!["FT","AET","PEN","AWD","WO"].includes(status))return null;
  const home=fixture.result_home_score,away=fixture.result_away_score;
  if(home===null||away===null){
    if(status==="AWD"||status==="WO")return "void";
    return null;
  }
  const actual=home>away?"home":home<away?"away":"draw";
  return actual===outcomeKey?"won":"lost";
}
async function settleStoredTicket(env:Env,ticketId:string,checkedAt:string):Promise<{selectionUpdates:number;ticketStatus:string|null}>{
  const ticket=await env.DB.prepare("SELECT * FROM bet_tickets WHERE id=?").bind(ticketId).first<any>();
  if(!ticket)return {selectionUpdates:0,ticketStatus:null};
  const rows=await env.DB.prepare(`
    SELECT s.*,f.kickoff,f.status_short,f.result_home_score AS fixture_home_score,
      f.result_away_score AS fixture_away_score,f.result_checked_at AS fixture_result_checked_at
    FROM bet_ticket_selections s JOIN sports_fixtures f ON f.id=s.fixture_id
    WHERE s.ticket_id=? ORDER BY s.selection_index
  `).bind(ticketId).all<any>();
  const picks=rows.results||[];
  const now=isoNow(),statements:D1PreparedStatement[]=[];
  const outcomes:string[]=[];
  let selectionUpdates=0;
  for(const pick of picks){
    let result=pick.result_status||"pending";
    const fixture:BetSettlementFixtureRow={id:pick.fixture_id,kickoff:pick.kickoff,status_short:pick.status_short,result_home_score:pick.fixture_home_score,result_away_score:pick.fixture_away_score,result_checked_at:pick.fixture_result_checked_at};
    if(result==="pending"&&fixture.result_checked_at){
      const computed=settledSelectionResult(pick.outcome_key,fixture);
      if(computed){
        result=computed;selectionUpdates++;
        statements.push(env.DB.prepare("UPDATE bet_ticket_selections SET result_status=?,result_home_score=?,result_away_score=?,result_fixture_status=?,result_checked_at=?,settled_at=? WHERE id=? AND result_status='pending'").bind(result,fixture.result_home_score,fixture.result_away_score,fixture.status_short,fixture.result_checked_at,now,pick.id));
        statements.push(env.DB.prepare("INSERT OR IGNORE INTO bet_settlement_events(id,event_key,ticket_id,selection_id,event_type,previous_status,new_status,details_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),"selection:"+pick.id,ticketId,pick.id,"selection_result","pending",result,JSON.stringify({fixtureId:pick.fixture_id,home:pick.home_team,away:pick.away_team,homeScore:fixture.result_home_score,awayScore:fixture.result_away_score,fixtureStatus:fixture.status_short,outcome:pick.outcome_key,odd:Number(pick.odd)}),now));
      }
    }
    outcomes.push(result);
  }
  let finalStatus:string|null=null;
  if(ticket.status==="open"){
    const hasLoss=outcomes.includes("lost"),hasPending=outcomes.includes("pending"),hasWin=outcomes.includes("won");
    if(hasLoss)finalStatus="lost";
    else if(!hasPending)finalStatus=hasWin?"won":"void";
    if(finalStatus){
      const settledOdds=Number(picks.filter((p:any,i:number)=>(outcomes[i]||p.result_status)==="won").reduce((product:number,p:any)=>product*Number(p.odd),1).toFixed(6));
      const settledReturn=finalStatus==="won"?Number((Number(ticket.stake)*settledOdds).toFixed(2)):finalStatus==="void"?Number(ticket.stake):0;
      statements.push(env.DB.prepare("UPDATE bet_tickets SET status=?,settled_odds=?,settled_return=?,settled_at=?,updated_at=? WHERE id=? AND status='open'").bind(finalStatus,settledOdds,settledReturn,now,now,ticketId));
      statements.push(env.DB.prepare("INSERT OR IGNORE INTO bet_settlement_events(id,event_key,ticket_id,selection_id,event_type,previous_status,new_status,details_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),"ticket:"+ticketId,ticketId,null,"ticket_settled","open",finalStatus,JSON.stringify({stake:Number(ticket.stake),settledOdds,settledReturn,selectionResults:outcomes}),now));
    }
  }
  if(statements.length)await env.DB.batch(statements);
  if(finalStatus==="won"||finalStatus==="lost")await recordReferralQualification(env,ticket.user_id,"first_bet",ticketId);
  if(finalStatus==="won"||ticket.status==="won")await awardReferralCommissions(env,ticketId);
  if(finalStatus){
    const settled=await env.DB.prepare("SELECT stake,settled_return FROM bet_tickets WHERE id=?").bind(ticketId).first<any>();
    const profit=Math.max(0,Number(settled?.settled_return||0)-Number(settled?.stake||0));
    await createUserNotification(env,ticket.user_id,"bet-settled:"+ticketId,"bet","Bet settled: "+finalStatus.toUpperCase(),"Ticket "+ticketId+" has settled. "+(finalStatus==="won"?"Profit: "+profit.toFixed(2)+" USDT.":finalStatus==="lost"?"The ticket was settled as a loss.":"The ticket was voided and stake returned."),"تمت تسوية الرهان","تمت تسوية التذكرة "+ticketId+". "+(finalStatus==="won"?"الربح: "+profit.toFixed(2)+" USDT.":finalStatus==="lost"?"تمت تسوية الرهان كخسارة.":"تم إلغاء الرهان وإرجاع قيمة المشاركة."),"/bets");
  }
  return {selectionUpdates,ticketStatus:finalStatus};
}
async function refreshAndSettleBetResults(env:Env):Promise<{checkedFixtures:number;selectionUpdates:number;ticketsSettled:number}>{
  const now=isoNow(),cutoff=new Date(Date.now()-110*60*1000).toISOString();
  const due=await env.DB.prepare(`
    SELECT DISTINCT f.id
    FROM bet_ticket_selections s
    JOIN bet_tickets t ON t.id=s.ticket_id
    JOIN sports_fixtures f ON f.id=s.fixture_id
    WHERE s.result_status='pending' AND datetime(f.kickoff)<=datetime(?)
      AND (f.result_checked_at IS NULL OR datetime(f.result_checked_at)<=datetime(?))
    ORDER BY CASE WHEN f.result_checked_at IS NULL THEN 0 ELSE 1 END,f.result_checked_at ASC,f.kickoff ASC
    LIMIT 20
  `).bind(now,cutoff).all<{id:string}>();
  const fixtureIds=(due.results||[]).map(row=>row.id);
  if(!fixtureIds.length)return {checkedFixtures:0,selectionUpdates:0,ticketsSettled:0};
  const response=await apiFootball<ApiFootballFixture>(env,"fixtures?ids="+fixtureIds.join("-"));
  await storeFootballFixtures(env,response.response||[]);
  const checkedAt=isoNow();
  await env.DB.batch(fixtureIds.map(id=>env.DB.prepare("UPDATE sports_fixtures SET result_checked_at=? WHERE id=?").bind(checkedAt,id)));
  const placeholders=fixtureIds.map(()=>"?").join(",");
  const affected=await env.DB.prepare("SELECT DISTINCT ticket_id FROM bet_ticket_selections WHERE result_status='pending' AND fixture_id IN ("+placeholders+")").bind(...fixtureIds).all<{ticket_id:string}>();
  let selectionUpdates=0,ticketsSettled=0;
  for(const row of affected.results||[]){
    const result=await settleStoredTicket(env,row.ticket_id,checkedAt);
    selectionUpdates+=result.selectionUpdates;
    if(result.ticketStatus)ticketsSettled++;
  }
  return {checkedFixtures:fixtureIds.length,selectionUpdates,ticketsSettled};
}
async function handleBetSettlementDiagnostics(request:Request,env:Env):Promise<Response>{
  const session=await currentSession(request,env);
  if(!session||session.user.role!=="admin")return json({ok:false,error:"Administrator access required"},403);
  const [pending,counts,events]=await Promise.all([
    env.DB.prepare("SELECT COUNT(DISTINCT s.fixture_id) AS fixtures FROM bet_ticket_selections s JOIN sports_fixtures f ON f.id=s.fixture_id WHERE s.result_status='pending' AND datetime(f.kickoff)<=datetime(?)").bind(isoNow()).first<any>(),
    env.DB.prepare("SELECT status,COUNT(*) AS total FROM bet_tickets GROUP BY status").all<any>(),
    env.DB.prepare("SELECT e.id,e.event_type,e.previous_status,e.new_status,e.details_json,e.created_at,t.id AS ticket_id FROM bet_settlement_events e JOIN bet_tickets t ON t.id=e.ticket_id ORDER BY e.created_at DESC LIMIT 30").all<any>()
  ]);
  return json({ok:true,pendingResultFixtures:Number(pending?.fixtures||0),ticketCounts:counts.results||[],recentEvents:(events.results||[]).map((e:any)=>({...e,details:JSON.parse(e.details_json)}))});
}


const USDT_SCALE = 1_000_000;
const WALLET_NETWORKS = ["USDT_TRC20","USDT_ERC20","USDT_BEP20"] as const;
type WalletNetworkCode = typeof WALLET_NETWORKS[number];
function parseUsdtUnits(value: unknown): number | null {
  const raw=String(value??"").trim();
  if(!/^\\d{1,9}(?:\\.\\d{1,6})?$/.test(raw))return null;
  const [whole,fraction=""]=raw.split(".");
  const units=Number(whole)*USDT_SCALE+Number((fraction+"000000").slice(0,6));
  return Number.isSafeInteger(units)&&units>0?units:null;
}
function walletAddressValid(network:WalletNetworkCode,address:string):boolean {
  if(network==="USDT_TRC20")return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}
function walletHashValid(value:string):boolean{return /^(?:0x)?[a-fA-F0-9]{64}$/.test(value);}
async function walletAccount(env:Env,userId:string):Promise<any>{
  await env.DB.prepare("INSERT OR IGNORE INTO wallet_accounts(id,user_id,asset) VALUES(?,?,'USDT')").bind("wa_"+userId,userId).run();
  return await env.DB.prepare("SELECT id,user_id,asset FROM wallet_accounts WHERE user_id=? AND asset='USDT'").bind(userId).first<any>();
}
async function walletSettings(env:Env):Promise<any>{
  return await env.DB.prepare("SELECT enabled,min_deposit_units,max_deposit_units,min_withdrawal_units,max_withdrawal_units FROM wallet_settings WHERE id=1").first<any>();
}
async function walletBalanceSnapshot(env:Env,accountId:string):Promise<{available_units:number;reserved_units:number}>{
  const row=await env.DB.prepare("SELECT COALESCE((SELECT SUM(available_delta_units) FROM wallet_ledger_entries WHERE account_id=?),0)+COALESCE((SELECT SUM(available_delta_units) FROM wallet_balance_entries WHERE account_id=?),0)+COALESCE((SELECT SUM(amount_units) FROM wallet_referral_credits WHERE account_id=?),0) AS available_units,COALESCE((SELECT SUM(reserved_delta_units) FROM wallet_ledger_entries WHERE account_id=?),0)+COALESCE((SELECT SUM(reserved_delta_units) FROM wallet_balance_entries WHERE account_id=?),0) AS reserved_units").bind(accountId,accountId,accountId,accountId,accountId).first<any>();
  return {available_units:Number(row?.available_units||0),reserved_units:Number(row?.reserved_units||0)};
}

const USDT_TRANSFER_TOPIC="ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const USDT_CONTRACTS={USDT_TRC20:"TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",USDT_ERC20:"0xdac17f958d2ee523a2206206994597c13d831ec7",USDT_BEP20:"0x55d398326f99059ff775485246999027b3197955"} as const;
type DepositCheck={state:"pending"|"verified"|"failed"|"mismatch";blockNumber:number|null;confirmations:number|null;amountUnits:number|null;fromAddress:string|null;error?:string};
async function rpcJson<T>(url:string,method:string,params:unknown[]):Promise<T>{
 const response=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})});
 if(!response.ok)throw new Error("Blockchain RPC HTTP "+response.status);
 const body=await response.json() as {result?:T;error?:{message?:string}};
 if(body.error)throw new Error(body.error.message||"Blockchain RPC returned an error");
 return body.result as T;
}
async function base58ToHexPayload(address:string):Promise<string>{
 const alphabet="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";let value=0n;
 for(const ch of address){const n=alphabet.indexOf(ch);if(n<0)throw new Error("Invalid TRON address");value=value*58n+BigInt(n)}
 let hex=value.toString(16);if(hex.length%2)hex="0"+hex;
 const bytes=hex.match(/.{2}/g)?.map(x=>parseInt(x,16))||[];
 for(const ch of address){if(ch!=="1")break;bytes.unshift(0)}
 if(bytes.length!==25)throw new Error("Invalid TRON address length");
 const payload=new Uint8Array(bytes.slice(0,21)),first=await crypto.subtle.digest("SHA-256",payload),second=await crypto.subtle.digest("SHA-256",first),checksum=Array.from(new Uint8Array(second).slice(0,4));
 if(checksum.some((value,index)=>value!==bytes[21+index]))throw new Error("TRON address checksum is invalid");
 return Array.from(payload).map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function verifyEvmDeposit(tx:any,network:any):Promise<DepositCheck>{
 const isEth=tx.network_code==="USDT_ERC20",rpcUrl=tx.rpcUrl as string,expectedChain=isEth?"0x1":"0x38";
 const chainId=await rpcJson<string>(rpcUrl,"eth_chainId",[]);
 if(chainId.toLowerCase()!==expectedChain)return {state:"mismatch",blockNumber:null,confirmations:null,amountUnits:null,fromAddress:null,error:"RPC endpoint returned the wrong chain ID."};
 const receipt=await rpcJson<any>(rpcUrl,"eth_getTransactionReceipt",["0x"+String(tx.tx_hash).replace(/^0x/i,"")]);
 if(!receipt)return {state:"pending",blockNumber:null,confirmations:null,amountUnits:null,fromAddress:null,error:"Transaction receipt is not available yet."};
 const blockNumber=Number(BigInt(receipt.blockNumber||"0x0"));
 if(receipt.status!=="0x1")return {state:"failed",blockNumber,confirmations:0,amountUnits:null,fromAddress:null,error:"The blockchain transaction failed."};
 const latest=Number(BigInt(await rpcJson<string>(rpcUrl,"eth_blockNumber",[])));
 const confirmations=Math.max(0,latest-blockNumber+1),required=isEth?12:15;
 const token=USDT_CONTRACTS[tx.network_code as keyof typeof USDT_CONTRACTS].toLowerCase();
 const destination=String(network.deposit_address||"").toLowerCase().replace(/^0x/,"");
 let total=0n,from:string|null=null;
 for(const log of receipt.logs||[]){
  if(String(log.address||"").toLowerCase()!==token)continue;
  const topics=(log.topics||[]).map((x:string)=>String(x).toLowerCase().replace(/^0x/,""));
  if(topics[0]!==("0x"+USDT_TRANSFER_TOPIC)||topics.length<3||topics[2].slice(-40)!==destination)continue;
  total+=BigInt(log.data||"0x0");if(!from)from="0x"+topics[1].slice(-40);
 }
 if(total===0n)return {state:"mismatch",blockNumber,confirmations,amountUnits:null,fromAddress:null,error:"No supported USDT transfer to the configured deposit address was found."};
 const decimals=isEth?6:18,divisor=10n**BigInt(decimals-6);
 if(total%divisor!==0n)return {state:"mismatch",blockNumber,confirmations,amountUnits:null,fromAddress:from,error:"Transfer precision is smaller than the wallet ledger supports."};
 const amountUnits=Number(total/divisor);
 if(!Number.isSafeInteger(amountUnits)||amountUnits<=0)return {state:"mismatch",blockNumber,confirmations,amountUnits:null,fromAddress:from,error:"Invalid on-chain USDT amount."};
 if(confirmations<required)return {state:"pending",blockNumber,confirmations,amountUnits,fromAddress:from,error:"Waiting for "+required+" confirmations."};
 return {state:"verified",blockNumber,confirmations,amountUnits,fromAddress:from};
}
async function verifyTronDeposit(tx:any,network:any,env:Env):Promise<DepositCheck>{
 const response=await fetch("https://api.trongrid.io/walletsolidity/gettransactioninfobyid",{method:"POST",headers:{"content-type":"application/json",...(env.TRONGRID_API_KEY?{"TRON-PRO-API-KEY":env.TRONGRID_API_KEY}:{})},body:JSON.stringify({value:String(tx.tx_hash).replace(/^0x/i,"")})});
 if(response.status===404)return {state:"pending",blockNumber:null,confirmations:null,amountUnits:null,fromAddress:null,error:"Waiting for the confirmed TRON transaction."};
 if(!response.ok)throw new Error("TronGrid HTTP "+response.status);
 const info=await response.json() as any;
 if(!info||!info.id||!info.blockNumber)return {state:"pending",blockNumber:null,confirmations:null,amountUnits:null,fromAddress:null,error:"Transaction is not solidified on TRON yet."};
 if(info.receipt?.result&&info.receipt.result!=="SUCCESS")return {state:"failed",blockNumber:Number(info.blockNumber),confirmations:1,amountUnits:null,fromAddress:null,error:"The TRON smart-contract transaction failed."};
 const [tokenPayload,destinationPayload]=await Promise.all([base58ToHexPayload(USDT_CONTRACTS.USDT_TRC20),base58ToHexPayload(String(network.deposit_address))]);
 const token=tokenPayload.slice(-40),destination=destinationPayload.slice(-40);
 let total=0n,from:string|null=null;
 for(const log of info.log||[]){
  const contract=String(log.address||"").toLowerCase().replace(/^41/,"");
  const topics=(log.topics||[]).map((x:string)=>String(x).toLowerCase().replace(/^0x/,""));
  if(contract!==token||topics[0]!==USDT_TRANSFER_TOPIC||topics.length<3||topics[2].slice(-40)!==destination)continue;
  total+=BigInt("0x"+String(log.data||"0"));if(!from)from=topics[1].slice(-40);
 }
 if(total===0n)return {state:"mismatch",blockNumber:Number(info.blockNumber),confirmations:1,amountUnits:null,fromAddress:null,error:"No USDT TRC20 transfer to the configured deposit address was found."};
 const amountUnits=Number(total);
 if(!Number.isSafeInteger(amountUnits)||amountUnits<=0)return {state:"mismatch",blockNumber:Number(info.blockNumber),confirmations:1,amountUnits:null,fromAddress:from,error:"Invalid on-chain USDT amount."};
 return {state:"verified",blockNumber:Number(info.blockNumber),confirmations:1,amountUnits,fromAddress:from};
}
async function monitorPendingWalletDeposits(env:Env):Promise<void>{
 const scanStarted=isoNow();
 await env.DB.prepare("UPDATE wallet_monitor_state SET last_checked_at=?,updated_at=?").bind(scanStarted,scanStarted).run();
 const rows=await env.DB.prepare("SELECT t.*,COALESCE(t.deposit_address_snapshot,n.deposit_address) AS deposit_address,n.monitor_enabled FROM wallet_transactions t JOIN wallet_networks n ON n.network_code=t.network_code WHERE t.type='deposit' AND t.status IN ('pending_review','processing') AND n.monitor_enabled=1 ORDER BY t.created_at ASC LIMIT 10").all<any>();
 for(const tx of rows.results||[]){
  const network={deposit_address:tx.deposit_address};
  try{
   if(!tx.deposit_address||!tx.monitor_enabled)throw new Error("Automatic monitoring is not configured for this network.");
   const rpcTx={...tx,rpcUrl:tx.network_code==="USDT_ERC20"?(env.ETHEREUM_RPC_URL||"https://ethereum-rpc.publicnode.com"):(env.BSC_RPC_URL||"https://bsc-rpc.publicnode.com")};
   const check=tx.network_code==="USDT_TRC20"?await verifyTronDeposit(tx,network,env):await verifyEvmDeposit(rpcTx,network);
   const checkedAt=isoNow();
   if(check.state==="verified"){
    if(check.amountUnits!==Number(tx.amount_units)){
     const message="On-chain amount ("+check.amountUnits+") does not match submitted amount ("+tx.amount_units+"). Manual review required.";
     await env.DB.prepare("UPDATE wallet_transactions SET chain_block_number=?,chain_confirmations=?,chain_amount_units=?,chain_from_address=?,chain_error=?,monitor_attempts=monitor_attempts+1,updated_at=? WHERE id=? AND status IN ('pending_review','processing')").bind(check.blockNumber,check.confirmations,check.amountUnits,check.fromAddress,message,checkedAt,tx.id).run();
    }else{
     await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO wallet_balance_entries(id,account_id,user_id,entry_type,source_id,event_key,available_delta_units,reserved_delta_units) SELECT ?,?,?, 'deposit_credit',?,?,?,0 WHERE EXISTS(SELECT 1 FROM wallet_transactions WHERE id=? AND type='deposit' AND status IN ('pending_review','processing') AND amount_units=?)").bind(crypto.randomUUID(),tx.account_id,tx.user_id,tx.id,"deposit:"+tx.id,check.amountUnits,tx.id,check.amountUnits),
      env.DB.prepare("UPDATE wallet_transactions SET status='completed',chain_block_number=?,chain_confirmations=?,chain_amount_units=?,chain_from_address=?,chain_verified_at=?,chain_error=NULL,monitor_attempts=monitor_attempts+1,updated_at=? WHERE id=? AND status IN ('pending_review','processing') AND EXISTS(SELECT 1 FROM wallet_ledger_entries WHERE transaction_id=? AND entry_type='deposit_credit')").bind(check.blockNumber,check.confirmations,check.amountUnits,check.fromAddress,checkedAt,checkedAt,tx.id,tx.id),
      env.DB.prepare("INSERT INTO wallet_audit_events(id,transaction_id,actor_user_id,event_type,details_json) SELECT ?,?,NULL,'deposit_auto_credited',? WHERE EXISTS(SELECT 1 FROM wallet_ledger_entries WHERE transaction_id=? AND entry_type='deposit_credit') AND NOT EXISTS(SELECT 1 FROM wallet_audit_events WHERE transaction_id=? AND event_type='deposit_auto_credited')").bind(crypto.randomUUID(),tx.id,JSON.stringify({networkCode:tx.network_code,blockNumber:check.blockNumber,confirmations:check.confirmations,amountUnits:check.amountUnits,fromAddress:check.fromAddress}),tx.id,tx.id)
     ]);
     await recordReferralQualification(env,tx.user_id,"first_deposit",tx.id);
     await createUserNotification(env,tx.user_id,"deposit-credited:"+tx.id,"wallet","Deposit confirmed","Your "+(Number(tx.amount_units)/USDT_SCALE).toFixed(2)+" USDT deposit has been verified and credited.","تم تأكيد الإيداع","تم التحقق من إيداعك بقيمة "+(Number(tx.amount_units)/USDT_SCALE).toFixed(2)+" USDT وإضافته إلى محفظتك.","/wallet");
    }
   }else if(check.state==="failed"){
    await env.DB.prepare("UPDATE wallet_transactions SET status='rejected',chain_block_number=?,chain_confirmations=?,chain_error=?,monitor_attempts=monitor_attempts+1,updated_at=? WHERE id=? AND status IN ('pending_review','processing')").bind(check.blockNumber,check.confirmations,check.error||"Blockchain transaction failed",checkedAt,tx.id).run();
   }else{
    await env.DB.prepare("UPDATE wallet_transactions SET status=CASE WHEN status='pending_review' THEN 'processing' ELSE status END,chain_block_number=COALESCE(?,chain_block_number),chain_confirmations=?,chain_amount_units=?,chain_from_address=?,chain_error=?,monitor_attempts=monitor_attempts+1,updated_at=? WHERE id=? AND status IN ('pending_review','processing')").bind(check.blockNumber,check.confirmations,check.amountUnits,check.fromAddress,check.error||null,checkedAt,tx.id).run();
   }
   await env.DB.prepare("INSERT INTO wallet_monitor_state(network_code,last_checked_at,last_success_at,last_error,checked_count,updated_at) VALUES(?,?,?,NULL,1,?) ON CONFLICT(network_code) DO UPDATE SET last_checked_at=excluded.last_checked_at,last_success_at=excluded.last_success_at,last_error=NULL,checked_count=wallet_monitor_state.checked_count+1,updated_at=excluded.updated_at").bind(tx.network_code,checkedAt,checkedAt,checkedAt).run();
  }catch(error){
   const checkedAt=isoNow(),message=(error instanceof Error?error.message:"Blockchain verification failed").slice(0,400);
   await env.DB.prepare("UPDATE wallet_transactions SET chain_error=?,monitor_attempts=monitor_attempts+1,updated_at=? WHERE id=? AND status IN ('pending_review','processing')").bind(message,checkedAt,tx.id).run();
   await env.DB.prepare("INSERT INTO wallet_monitor_state(network_code,last_checked_at,last_error,checked_count,updated_at) VALUES(?,?,?,1,?) ON CONFLICT(network_code) DO UPDATE SET last_checked_at=excluded.last_checked_at,last_error=excluded.last_error,checked_count=wallet_monitor_state.checked_count+1,updated_at=excluded.updated_at").bind(tx.network_code,checkedAt,message,checkedAt).run();
   console.error("Wallet deposit monitor error",tx.network_code,tx.id,message);
  }
 }
}

function newReferralCode():string{return 'CR'+hex(crypto.getRandomValues(new Uint8Array(8)).buffer).toUpperCase();}
async function recordReferralQualification(env:Env,referredUserId:string,action:"first_deposit"|"first_bet",sourceId:string):Promise<void>{
  const source=action==="first_deposit"
    ? await env.DB.prepare("SELECT t.id FROM wallet_transactions t JOIN wallet_ledger_entries l ON l.transaction_id=t.id AND l.entry_type='deposit_credit' WHERE t.id=? AND t.user_id=? AND t.type='deposit' AND t.status='completed'").bind(sourceId,referredUserId).first<{id:string}>()
    : await env.DB.prepare("SELECT id FROM bet_tickets WHERE id=? AND user_id=? AND status IN ('won','lost') AND settled_at IS NOT NULL").bind(sourceId,referredUserId).first<{id:string}>();
  if(!source)return;
  const id=crypto.randomUUID(),at=isoNow();
  const inserted=await env.DB.prepare("INSERT OR IGNORE INTO referral_qualifications(id,referred_user_id,referrer_user_id,qualifying_action,source_id,qualified_at) SELECT ?,ra.user_id,ra.referred_by_user_id,?,?,? FROM referral_accounts ra WHERE ra.user_id=? AND ra.referred_by_user_id IS NOT NULL AND EXISTS(SELECT 1 FROM referral_program_settings WHERE id=1 AND tracking_enabled=1)").bind(id,action,sourceId,at,referredUserId).run();
  if(Number(inserted.meta?.changes||0)===1)await env.DB.prepare("INSERT INTO referral_audit_events(id,actor_user_id,event_type,subject_user_id,details_json) VALUES(?,NULL,'referral_qualified',?,?)").bind(crypto.randomUUID(),referredUserId,JSON.stringify({action,sourceId,qualifiedAt:at})).run();
}
async function awardReferralCommissions(env:Env,ticketId:string):Promise<void>{
  const ticket=await env.DB.prepare("SELECT id,user_id,stake,settled_return,status,settled_at FROM bet_tickets WHERE id=?").bind(ticketId).first<any>();
  if(!ticket||ticket.status!=="won"||!ticket.settled_at)return;
  const profitUnits=Math.max(0,Math.round((Number(ticket.settled_return)-Number(ticket.stake))*USDT_SCALE));
  if(!Number.isSafeInteger(profitUnits)||profitUnits<=0)return;
  const settings=await env.DB.prepare("SELECT commission_enabled,level1_rate_bps,level2_rate_bps,level3_rate_bps FROM referral_program_settings WHERE id=1").first<any>();
  if(!settings||Number(settings.commission_enabled)!==1)return;
  const rates=[Number(settings.level1_rate_bps),Number(settings.level2_rate_bps),Number(settings.level3_rate_bps)];
  let ancestor:string|null=ticket.user_id;
  for(let level=1;level<=3;level++){
    const parent=await env.DB.prepare("SELECT referred_by_user_id FROM referral_accounts WHERE user_id=?").bind(ancestor).first<{referred_by_user_id:string|null}>();
    ancestor=parent?.referred_by_user_id||null;if(!ancestor)break;
    const rate=rates[level-1];if(!Number.isInteger(rate)||rate<=0||rate>10000)continue;
    const amount=Math.floor(profitUnits*rate/10000);if(amount<=0)continue;
    const account=await walletAccount(env,ancestor);
    const inserted=await env.DB.prepare(`INSERT OR IGNORE INTO wallet_referral_credits
      (id,account_id,user_id,source_ticket_id,referred_user_id,referral_level,rate_bps,profit_units,amount_units)
      SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM bet_tickets WHERE id=? AND status='won' AND settled_at IS NOT NULL)
      AND EXISTS(SELECT 1 FROM referral_program_settings WHERE id=1 AND commission_enabled=1)`)
      .bind(crypto.randomUUID(),account.id,ancestor,ticket.id,ticket.user_id,level,rate,profitUnits,amount,ticket.id).run();
    if(Number(inserted.meta?.changes||0)===1)await env.DB.prepare("INSERT INTO referral_audit_events(id,actor_user_id,event_type,subject_user_id,details_json) VALUES(?,NULL,'referral_commission_credited',?,?)").bind(crypto.randomUUID(),ancestor,JSON.stringify({ticketId:ticket.id,referredUserId:ticket.user_id,level,rateBps:rate,profitUnits,amountUnits:amount})).run();
      await createUserNotification(env,ancestor,"referral-commission:"+ticket.id+":"+level,"referral","Referral commission credited","You received "+(amount/USDT_SCALE).toFixed(6)+" USDT from a Level "+level+" referral.","تمت إضافة عمولة إحالة","تمت إضافة "+(amount/USDT_SCALE).toFixed(6)+" USDT من إحالة المستوى "+level+".","/friends");
  }
}
async function handleReferralMe(request:Request,env:Env):Promise<Response>{
  const session=await currentSession(request,env);if(!session)return json({ok:false,error:"Authentication required"},401);
  await env.DB.prepare("INSERT OR IGNORE INTO referral_accounts(user_id,referral_code) VALUES(?,?)").bind(session.user.id,newReferralCode()).run();
  const [account,counts,earnings,history,settings]=await Promise.all([
    env.DB.prepare("SELECT referral_code FROM referral_accounts WHERE user_id=?").bind(session.user.id).first<{referral_code:string}>(),
    env.DB.prepare("SELECT COUNT(*) AS registrations,SUM(CASE WHEN q.referred_user_id IS NOT NULL THEN 1 ELSE 0 END) AS qualified FROM referral_accounts r LEFT JOIN referral_qualifications q ON q.referred_user_id=r.user_id WHERE r.referred_by_user_id=?").bind(session.user.id).first<any>(),
    env.DB.prepare("SELECT COALESCE(SUM(amount_units),0) AS total_units,COUNT(*) AS awards FROM wallet_referral_credits WHERE user_id=?").bind(session.user.id).first<any>(),
    env.DB.prepare("SELECT c.id,c.amount_units,c.profit_units,c.referral_level,c.rate_bps,c.created_at,c.source_ticket_id,u.display_name AS referred_name FROM wallet_referral_credits c LEFT JOIN users u ON u.id=c.referred_user_id WHERE c.user_id=? ORDER BY c.created_at DESC LIMIT 50").bind(session.user.id).all<any>(),
    env.DB.prepare("SELECT commission_enabled FROM referral_program_settings WHERE id=1").first<any>()
  ]);
  return json({ok:true,referralCode:account?.referral_code||("u"+session.user.id),stats:{registrations:Number(counts?.registrations||0),qualified:Number(counts?.qualified||0)},qualificationRule:"first_verified_deposit_or_first_settled_bet",commissionRates:{level1:10,level2:5,level3:3},commissionEnabled:Number(settings?.commission_enabled||0)===1,earnings:{totalUnits:Number(earnings?.total_units||0),awards:Number(earnings?.awards||0)},history:history.results||[]});
}
async function handleAdminReferrals(request:Request,env:Env):Promise<Response>{
  const session=await currentSession(request,env);if(!session||session.user.role!=="admin")return json({ok:false,error:"Administrator access required"},403);
  const admin=await env.DB.prepare("SELECT is_super_admin FROM admin_accounts WHERE user_id=?").bind(session.user.id).first<any>();if(!admin)return json({ok:false,error:"Administrator access required"},403);
  if(request.method==="POST"){
    if(Number(admin.is_super_admin)!==1)return json({ok:false,error:"Super Admin access required"},403);
    if(!sameOrigin(request))return json({ok:false,error:"Invalid origin"},403);
    let body:{trackingEnabled?:unknown;commissionEnabled?:unknown};try{body=await request.json() as typeof body}catch{return json({ok:false,error:"Invalid request"},400)}
    if(typeof body.trackingEnabled!=="boolean"||typeof body.commissionEnabled!=="boolean")return json({ok:false,error:"Both referral settings must be boolean values."},400);
    await env.DB.prepare("UPDATE referral_program_settings SET tracking_enabled=?,commission_enabled=?,updated_by=?,updated_at=? WHERE id=1").bind(body.trackingEnabled?1:0,body.commissionEnabled?1:0,session.user.id,isoNow()).run();
    await env.DB.prepare("INSERT INTO referral_audit_events(id,actor_user_id,event_type,subject_user_id,details_json) VALUES(?,?,'referral_program_settings_changed',NULL,?)").bind(crypto.randomUUID(),session.user.id,JSON.stringify({trackingEnabled:body.trackingEnabled,commissionEnabled:body.commissionEnabled,rates:{level1:10,level2:5,level3:3}})).run();
  }
  const [settings,totals,rows,awards]=await Promise.all([
    env.DB.prepare("SELECT tracking_enabled,commission_enabled,level1_rate_bps,level2_rate_bps,level3_rate_bps,updated_at FROM referral_program_settings WHERE id=1").first<any>(),
    env.DB.prepare("SELECT COUNT(*) AS registrations,SUM(CASE WHEN q.referred_user_id IS NOT NULL THEN 1 ELSE 0 END) AS qualified,COUNT(DISTINCT r.referred_by_user_id) AS active_referrers,(SELECT COUNT(*) FROM wallet_referral_credits) AS commission_count,(SELECT COALESCE(SUM(amount_units),0) FROM wallet_referral_credits) AS commission_units FROM referral_accounts r LEFT JOIN referral_qualifications q ON q.referred_user_id=r.user_id WHERE r.referred_by_user_id IS NOT NULL").first<any>(),
    env.DB.prepare("SELECT r.referral_code,r.referred_by_user_id AS referrer_id,ref.display_name AS referrer_name,r.user_id AS referred_user_id,u.display_name AS referred_name,r.attributed_at,q.qualifying_action,q.qualified_at FROM referral_accounts r JOIN users u ON u.id=r.user_id LEFT JOIN users ref ON ref.id=r.referred_by_user_id LEFT JOIN referral_qualifications q ON q.referred_user_id=r.user_id WHERE r.referred_by_user_id IS NOT NULL ORDER BY r.attributed_at DESC LIMIT 100").all<any>(),
    env.DB.prepare("SELECT c.id,c.user_id,c.referred_user_id,c.source_ticket_id,c.referral_level,c.rate_bps,c.profit_units,c.amount_units,c.created_at,u.display_name AS beneficiary_name FROM wallet_referral_credits c LEFT JOIN users u ON u.id=c.user_id ORDER BY c.created_at DESC LIMIT 100").all<any>()
  ]);
  return json({ok:true,settings,totals:{registrations:Number(totals?.registrations||0),qualified:Number(totals?.qualified||0),activeReferrers:Number(totals?.active_referrers||0),commissionCount:Number(totals?.commission_count||0),commissionUnits:Number(totals?.commission_units||0)},referrals:rows.results||[],awards:awards.results||[]});
}
async function handleWalletGet(request:Request,env:Env):Promise<Response>{
  const session=await currentSession(request,env);
  if(!session)return json({ok:false,error:"Sign in through Telegram to access your wallet."},401);
  const account=await walletAccount(env,session.user.id),settings=await walletSettings(env);
  const [balance,networks,transactions,referralRewards]=await Promise.all([
    walletBalanceSnapshot(env,account.id),
    env.DB.prepare("SELECT network_code,asset,network_name,CASE WHEN deposits_enabled=1 AND (SELECT enabled FROM wallet_settings WHERE id=1)=1 THEN deposit_address ELSE NULL END AS deposit_address,deposits_enabled,withdrawals_enabled,monitor_enabled FROM wallet_networks ORDER BY network_code").all<any>(),
    env.DB.prepare("SELECT id,type,status,amount_units,asset,network_code,tx_hash,destination_address,payout_tx_hash,chain_confirmations,chain_error,chain_verified_at,created_at,updated_at FROM wallet_transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 50").bind(session.user.id).all<any>(),
    env.DB.prepare("SELECT id,amount_units,referral_level,rate_bps,source_ticket_id,created_at FROM wallet_referral_credits WHERE user_id=? ORDER BY created_at DESC LIMIT 50").bind(session.user.id).all<any>()
  ]);
  return json({ok:true,wallet:{enabled:!!settings?.enabled,asset:"USD",scale:USDT_SCALE,availableUnits:Number(balance?.available_units||0),reservedUnits:Number(balance?.reserved_units||0),minDepositUnits:Number(settings?.min_deposit_units||0),maxDepositUnits:Number(settings?.max_deposit_units||0),minWithdrawalUnits:Number(settings?.min_withdrawal_units||0),maxWithdrawalUnits:Number(settings?.max_withdrawal_units||0),networks:networks.results||[],transactions:transactions.results||[],referralRewards:referralRewards.results||[]}});
}
async function handleWalletDeposit(request:Request,env:Env):Promise<Response>{
  const session=await currentSession(request,env);
  if(!session)return json({ok:false,error:"Authentication required"},401);
  if(!sameOrigin(request))return json({ok:false,error:"Invalid origin"},403);
  if(!(request.headers.get("content-type")||"").toLowerCase().includes("application/json"))return json({ok:false,error:"Content-Type must be application/json."},415);
  let body:{amount?:unknown;networkCode?:unknown;txHash?:unknown;idempotencyKey?:unknown};
  try{body=await request.json() as typeof body}catch{return json({ok:false,error:"Invalid deposit request."},400)}
  const units=parseUsdtUnits(body.amount),networkCode=String(body.networkCode||"") as WalletNetworkCode,txHash=String(body.txHash||"").trim().replace(/^0x/i,"").toLowerCase(),key=String(body.idempotencyKey||"");
  if(!units||!WALLET_NETWORKS.includes(networkCode)||!walletHashValid(txHash)||!/^[A-Za-z0-9_-]{16,80}$/.test(key))return json({ok:false,error:"Enter a valid USDT amount, supported network, 64-character transaction hash and request key."},400);
  const settings=await walletSettings(env),network=await env.DB.prepare("SELECT * FROM wallet_networks WHERE network_code=?").bind(networkCode).first<any>();
  if(!settings?.enabled||!network?.deposits_enabled||!network.deposit_address)return json({ok:false,error:"Crypto deposits are not enabled for this network yet."},503);
  if(!network.monitor_enabled)return json({ok:false,error:"Automatic deposit verification is not enabled for this network yet."},503);
  if(networkCode==="USDT_TRC20"&&!env.TRONGRID_API_KEY)return json({ok:false,error:"TRON deposits are not available until the TRONGRID_API_KEY Cloudflare secret is configured."},503);
  if(units<Number(settings.min_deposit_units)||units>Number(settings.max_deposit_units))return json({ok:false,error:"Deposit amount is outside the configured limits."},400);
  const prior=await env.DB.prepare("SELECT id,type,status,amount_units,asset,network_code,tx_hash,created_at FROM wallet_transactions WHERE user_id=? AND idempotency_key=?").bind(session.user.id,key).first<any>();
  if(prior)return json({ok:true,duplicate:true,transaction:prior});
  const account=await walletAccount(env,session.user.id),id=crypto.randomUUID();
  try{
    await env.DB.prepare("INSERT INTO wallet_transactions(id,account_id,user_id,type,status,amount_units,asset,network_code,tx_hash,idempotency_key,deposit_address_snapshot) VALUES(?,?,?,'deposit','pending_review',?,'USDT',?,?,?,?)").bind(id,account.id,session.user.id,units,networkCode,txHash,key,network.deposit_address).run();
  }catch{
    const duplicate=await env.DB.prepare("SELECT id,type,status,amount_units,asset,network_code,tx_hash,created_at FROM wallet_transactions WHERE user_id=? AND idempotency_key=?").bind(session.user.id,key).first<any>();
    if(duplicate)return json({ok:true,duplicate:true,transaction:duplicate});
    return json({ok:false,error:"This transaction hash has already been submitted or the request could not be saved."},409);
  }
  await env.DB.prepare("INSERT INTO wallet_audit_events(id,transaction_id,actor_user_id,event_type,details_json) VALUES(?,?,?,'deposit_submitted',?)").bind(crypto.randomUUID(),id,session.user.id,JSON.stringify({networkCode,amountUnits:units})).run();
  return json({ok:true,transaction:{id,type:"deposit",status:"processing",amount_units:units,asset:"USDT",network_code:networkCode,tx_hash:txHash},notice:"Deposit submitted. CodeRush automatically checks the transaction on the selected blockchain and credits your wallet after network confirmation."},201);
}
async function handleWalletWithdrawal(request:Request,env:Env):Promise<Response>{
  const session=await currentSession(request,env);
  if(!session)return json({ok:false,error:"Authentication required"},401);
  if(!sameOrigin(request))return json({ok:false,error:"Invalid origin"},403);
  if(!(request.headers.get("content-type")||"").toLowerCase().includes("application/json"))return json({ok:false,error:"Content-Type must be application/json."},415);
  let body:{amount?:unknown;networkCode?:unknown;destinationAddress?:unknown;idempotencyKey?:unknown};
  try{body=await request.json() as typeof body}catch{return json({ok:false,error:"Invalid withdrawal request."},400)}
  const units=parseUsdtUnits(body.amount),networkCode=String(body.networkCode||"") as WalletNetworkCode,address=String(body.destinationAddress||"").trim(),key=String(body.idempotencyKey||"");
  if(!units||!WALLET_NETWORKS.includes(networkCode)||!walletAddressValid(networkCode,address)||!/^[A-Za-z0-9_-]{16,80}$/.test(key))return json({ok:false,error:"Enter a valid USDT amount, supported network, destination address and request key."},400);
  const settings=await walletSettings(env),network=await env.DB.prepare("SELECT * FROM wallet_networks WHERE network_code=?").bind(networkCode).first<any>();
  if(!settings?.enabled||!network?.withdrawals_enabled)return json({ok:false,error:"Crypto withdrawals are not enabled for this network yet."},503);
  if(units<Number(settings.min_withdrawal_units)||units>Number(settings.max_withdrawal_units))return json({ok:false,error:"Withdrawal amount is outside the configured limits."},400);
  const prior=await env.DB.prepare("SELECT id,type,status,amount_units,asset,network_code,destination_address,created_at FROM wallet_transactions WHERE user_id=? AND idempotency_key=?").bind(session.user.id,key).first<any>();
  if(prior)return json({ok:true,duplicate:true,transaction:prior});
  const account=await walletAccount(env,session.user.id),id=crypto.randomUUID();
  try{
    await env.DB.prepare("INSERT INTO wallet_transactions(id,account_id,user_id,type,status,amount_units,asset,network_code,destination_address,idempotency_key) VALUES(?,?,?,'withdrawal','pending_review',?,'USDT',?,?,?)").bind(id,account.id,session.user.id,units,networkCode,address,key).run();
  }catch{
    const duplicate=await env.DB.prepare("SELECT id,type,status,amount_units,asset,network_code,destination_address,created_at FROM wallet_transactions WHERE user_id=? AND idempotency_key=?").bind(session.user.id,key).first<any>();
    if(duplicate)return json({ok:true,duplicate:true,transaction:duplicate});
    return json({ok:false,error:"The withdrawal request could not be saved."},409);
  }
  const reserve=await env.DB.prepare(`INSERT INTO wallet_ledger_entries(id,account_id,user_id,transaction_id,entry_type,available_delta_units,reserved_delta_units)
    SELECT ?,?,?,?,'withdrawal_reserve',?,? WHERE (COALESCE((SELECT SUM(available_delta_units) FROM wallet_ledger_entries WHERE account_id=?),0)+COALESCE((SELECT SUM(available_delta_units) FROM wallet_balance_entries WHERE account_id=?),0)+COALESCE((SELECT SUM(amount_units) FROM wallet_referral_credits WHERE account_id=?),0))>=?`)
    .bind(crypto.randomUUID(),account.id,session.user.id,id,-units,units,account.id,account.id,account.id,units).run();
  if(Number(reserve.meta?.changes||0)!==1){
    await env.DB.prepare("DELETE FROM wallet_transactions WHERE id=? AND status='pending_review'").bind(id).run();
    return json({ok:false,error:"Insufficient available USDT balance."},409);
  }
  await env.DB.prepare("INSERT INTO wallet_audit_events(id,transaction_id,actor_user_id,event_type,details_json) VALUES(?,?,?,'withdrawal_submitted',?)").bind(crypto.randomUUID(),id,session.user.id,JSON.stringify({networkCode,amountUnits:units})).run();
  await createUserNotification(env,session.user.id,"withdrawal-submitted:"+id,"wallet","Withdrawal request received","Your "+(units/USDT_SCALE).toFixed(2)+" USDT withdrawal request is awaiting manual review.","تم استلام طلب السحب","طلب السحب بقيمة "+(units/USDT_SCALE).toFixed(2)+" USDT بانتظار المراجعة اليدوية.","/wallet");
  return json({ok:true,transaction:{id,type:"withdrawal",status:"pending_review",amount_units:units,asset:"USDT",network_code:networkCode,destination_address:address},notice:"Withdrawal request received. The amount is reserved while an administrator reviews it; no payout has been sent yet."},201);
}
async function walletAdminSession(request:Request,env:Env):Promise<{id:string}|null>{
  const session=await currentSession(request,env);
  if(!session||session.user.role!=="admin")return null;
  const admin=await env.DB.prepare("SELECT user_id,is_super_admin FROM admin_accounts WHERE user_id=?").bind(session.user.id).first<any>();
  return admin&&Number(admin.is_super_admin)===1?{id:session.user.id}:null;
}
async function handleWalletAdminSettings(request:Request,env:Env):Promise<Response>{
  const admin=await walletAdminSession(request,env);if(!admin)return json({ok:false,error:"Administrator access required"},403);
  if(request.method==="GET"){
    const [settings,networks]=await Promise.all([walletSettings(env),env.DB.prepare("SELECT n.network_code,n.network_name,n.deposit_address,n.deposits_enabled,n.withdrawals_enabled,n.monitor_enabled,s.last_checked_at,s.last_success_at,s.last_error,s.checked_count FROM wallet_networks n LEFT JOIN wallet_monitor_state s ON s.network_code=n.network_code ORDER BY n.network_code").all<any>()]);
    return json({ok:true,settings,networks:(networks.results||[]).map((n:any)=>({...n,monitor_ready:n.network_code==="USDT_TRC20"?!!env.TRONGRID_API_KEY:n.network_code==="USDT_ERC20",monitor_note:n.network_code==="USDT_TRC20"&&!env.TRONGRID_API_KEY?"TRONGRID_API_KEY secret is not configured":n.network_code==="USDT_BEP20"?"USDT contract confirmation required":null}))});
  }
  if(!sameOrigin(request))return json({ok:false,error:"Invalid origin"},403);
  let body:{enabled?:unknown;networks?:Array<{networkCode?:unknown;depositAddress?:unknown;depositsEnabled?:unknown;withdrawalsEnabled?:unknown;monitorEnabled?:unknown}>};
  try{body=await request.json() as typeof body}catch{return json({ok:false,error:"Invalid wallet settings."},400)}
  if(typeof body.enabled!=="boolean"||!Array.isArray(body.networks)||body.networks.length!==3)return json({ok:false,error:"Wallet settings must include the global switch and all three USDT networks."},400);
  const statements:any[]=[env.DB.prepare("UPDATE wallet_settings SET enabled=?,updated_by=?,updated_at=? WHERE id=1").bind(body.enabled?1:0,admin.id,isoNow())];
  for(const item of body.networks){
    const code=String(item.networkCode||"") as WalletNetworkCode,address=String(item.depositAddress||"").trim();
    if(!WALLET_NETWORKS.includes(code)||(address&&!walletAddressValid(code,address))||typeof item.depositsEnabled!=="boolean"||typeof item.withdrawalsEnabled!=="boolean"||(item.monitorEnabled!==undefined&&typeof item.monitorEnabled!=="boolean"))return json({ok:false,error:"A network address or switch is invalid."},400);
    if(item.depositsEnabled&&!address)return json({ok:false,error:"A deposit address is required before enabling deposits on a network."},400);
    const monitorEnabled=code==="USDT_BEP20"?0:(item.monitorEnabled===false?0:1),depositsEnabled=code==="USDT_BEP20"?0:(item.depositsEnabled?1:0),withdrawalsEnabled=code==="USDT_BEP20"?0:(item.withdrawalsEnabled?1:0);
    statements.push(env.DB.prepare("UPDATE wallet_networks SET deposit_address=?,deposits_enabled=?,withdrawals_enabled=?,monitor_enabled=?,updated_by=?,updated_at=? WHERE network_code=?").bind(code==="USDT_BEP20"?null:(address||null),depositsEnabled,withdrawalsEnabled,monitorEnabled,admin.id,isoNow(),code));
  }
  await env.DB.batch(statements);
  await env.DB.prepare("INSERT INTO admin_audit_logs(id,admin_user_id,action,target_type,target_id,metadata_json) VALUES(?,?,?,'wallet','global',?)").bind(crypto.randomUUID(),admin.id,"wallet_settings_updated",JSON.stringify({enabled:body.enabled,networks:body.networks.map(n=>({networkCode:n.networkCode,depositsEnabled:n.depositsEnabled,withdrawalsEnabled:n.withdrawalsEnabled}))})).run();
  return json({ok:true});
}
async function handleWalletAdminTransactions(request:Request,env:Env):Promise<Response>{
  const admin=await walletAdminSession(request,env);if(!admin)return json({ok:false,error:"Administrator access required"},403);
  if(request.method==="GET"){
    const rows=await env.DB.prepare("SELECT t.id,t.user_id,u.display_name,u.telegram_username,t.type,t.status,t.amount_units,t.asset,t.network_code,t.tx_hash,t.destination_address,t.payout_tx_hash,t.created_at,t.updated_at,t.review_note FROM wallet_transactions t JOIN users u ON u.id=t.user_id WHERE t.status IN ('pending_review','processing') ORDER BY CASE WHEN t.status='pending_review' THEN 0 WHEN t.status='processing' THEN 1 ELSE 2 END,t.created_at DESC LIMIT 100").all<any>();
    return json({ok:true,transactions:rows.results||[]});
  }
  if(!sameOrigin(request))return json({ok:false,error:"Invalid origin"},403);
  let body:{action?:unknown;payoutTxHash?:unknown;note?:unknown};
  try{body=await request.json() as typeof body}catch{return json({ok:false,error:"Invalid review request."},400)}
  const id=decodeURIComponent(new URL(request.url).pathname.split("/").pop()||""),action=String(body.action||""),note=String(body.note||"").slice(0,500);
  const tx=await env.DB.prepare("SELECT * FROM wallet_transactions WHERE id=?").bind(id).first<any>();
  if(!tx)return json({ok:false,error:"Wallet transaction not found."},404);
  if(tx.type==="deposit"){
    if(action==="approve")return json({ok:false,error:"Deposit credits are issued only by the automatic blockchain verifier after confirming the token contract, destination, amount and network finality."},409);
    if(action==="reject"){
      const r=await env.DB.prepare("UPDATE wallet_transactions SET status='rejected',reviewed_by=?,reviewed_at=?,review_note=?,updated_at=? WHERE id=? AND type='deposit' AND status IN ('pending_review','processing')").bind(admin.id,isoNow(),note,isoNow(),id).run();
      if(Number(r.meta?.changes||0)!==1)return json({ok:false,error:"Only uncredited deposits can be rejected."},409);
    }else return json({ok:false,error:"Deposit action must be reject; verified deposits are credited automatically."},400);
  }else{
    if(action==="approve"){
      const r=await env.DB.prepare("UPDATE wallet_transactions SET status='processing',reviewed_by=?,reviewed_at=?,review_note=?,updated_at=? WHERE id=? AND type='withdrawal' AND status='pending_review'").bind(admin.id,isoNow(),note,isoNow(),id).run();
      if(Number(r.meta?.changes||0)!==1&&tx.status!=="processing")return json({ok:false,error:"Only pending withdrawals can be approved."},409);
    }else if(action==="reject"){
      const r=await env.DB.prepare("UPDATE wallet_transactions SET status='rejected',reviewed_by=?,reviewed_at=?,review_note=?,updated_at=? WHERE id=? AND type='withdrawal' AND status IN ('pending_review','processing')").bind(admin.id,isoNow(),note,isoNow(),id).run();
      if(Number(r.meta?.changes||0)!==1&&tx.status!=="rejected")return json({ok:false,error:"This withdrawal can no longer be rejected."},409);
      await env.DB.prepare("INSERT OR IGNORE INTO wallet_ledger_entries(id,account_id,user_id,transaction_id,entry_type,available_delta_units,reserved_delta_units) SELECT ?,?,?,?,'withdrawal_release',?,? WHERE EXISTS(SELECT 1 FROM wallet_transactions WHERE id=? AND status='rejected')").bind(crypto.randomUUID(),tx.account_id,tx.user_id,tx.id,tx.amount_units,-tx.amount_units,tx.id).run();
    }else if(action==="paid"){
      const payoutHash=String(body.payoutTxHash||"").trim().replace(/^0x/i,"").toLowerCase();
      if(!walletHashValid(payoutHash))return json({ok:false,error:"Enter the 64-character blockchain payout transaction hash."},400);
      if(tx.status==="completed"){if(tx.payout_tx_hash===payoutHash)return json({ok:true,transaction:tx});return json({ok:false,error:"This withdrawal is already completed with a different payout hash."},409)}if(tx.status!=="processing")return json({ok:false,error:"Approve the withdrawal before marking it paid."},409);
      await env.DB.prepare("UPDATE wallet_transactions SET payout_tx_hash=?,updated_at=? WHERE id=? AND status IN ('processing','completed')").bind(payoutHash,isoNow(),id).run();
      await env.DB.prepare("INSERT OR IGNORE INTO wallet_ledger_entries(id,account_id,user_id,transaction_id,entry_type,available_delta_units,reserved_delta_units) SELECT ?,?,?,?,'withdrawal_paid',0,? WHERE EXISTS(SELECT 1 FROM wallet_transactions WHERE id=? AND status IN ('processing','completed') AND payout_tx_hash=?)").bind(crypto.randomUUID(),tx.account_id,tx.user_id,tx.id,-tx.amount_units,tx.id,payoutHash).run();
      await env.DB.prepare("UPDATE wallet_transactions SET status='completed',reviewed_by=?,reviewed_at=?,updated_at=? WHERE id=? AND status='processing' AND payout_tx_hash=?").bind(admin.id,isoNow(),isoNow(),id,payoutHash).run();
    }else return json({ok:false,error:"Withdrawal action must be approve, reject or paid."},400);
  }
  await env.DB.prepare("INSERT INTO wallet_audit_events(id,transaction_id,actor_user_id,event_type,details_json) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),id,admin.id,"admin_"+action,JSON.stringify({note,payoutTxHash:body.payoutTxHash||null})).run();
  const updated=await env.DB.prepare("SELECT id,type,status,amount_units,asset,network_code,tx_hash,destination_address,payout_tx_hash,updated_at FROM wallet_transactions WHERE id=?").bind(id).first<any>();
  if(tx.type==="deposit"&&updated?.status==="rejected"&&tx.status!=="rejected")await createUserNotification(env,tx.user_id,"deposit-rejected:"+id,"wallet","Deposit requires attention","Your submitted deposit could not be verified. Please review the transaction details or contact support.","الإيداع يحتاج إلى مراجعة","تعذر التحقق من الإيداع المرسل. يرجى مراجعة بيانات المعاملة أو التواصل مع الدعم.","/wallet");
  if(tx.type==="withdrawal"&&updated?.status!==tx.status){
    const state=updated.status==="processing"?"approved":updated.status==="rejected"?"rejected":updated.status==="completed"?"paid":String(updated.status),amount=(Number(tx.amount_units)/USDT_SCALE).toFixed(2);
    await createUserNotification(env,tx.user_id,"withdrawal-status:"+id+":"+updated.status,"wallet","Withdrawal "+state,"Your "+amount+" USDT withdrawal request is now "+state+". "+(updated.status==="completed"?"The manual payout has been recorded.":updated.status==="rejected"?"The request was rejected and reserved funds were released.":"An administrator approved the request; payout remains manual."),"تحديث حالة السحب","تم تحديث طلب السحب بقيمة "+amount+" USDT إلى الحالة: "+state+".","/wallet");
  }
  return json({ok:true,transaction:updated});
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await (async (): Promise<Response> => {
    const url = new URL(request.url);
    const unsafeMethod=["POST","PUT","PATCH","DELETE"].includes(request.method.toUpperCase());
    const originExempt=url.pathname==="/api/telegram/webhook"||url.pathname==="/api/telegram/broadcast";
    if(unsafeMethod&&!originExempt&&!sameOrigin(request))return json({ok:false,error:"Invalid or missing request origin"},403);
    if(unsafeMethod&&!(request.headers.get("content-type")||"").toLowerCase().includes("application/json"))return json({ok:false,error:"Content-Type must be application/json."},415);
    const declaredLength=Number(request.headers.get("content-length")||0),bodyLimit=url.pathname==="/api/telegram/webhook"?1048576:65536;
    if(declaredLength>bodyLimit)return json({ok:false,error:"Request body is too large."},413);

    if (url.pathname === "/admin" && request.method === "GET") return adminHtml(env);
    if (url.pathname === "/admin/notifications" && request.method === "GET") return adminNotificationsHtml();
    if (url.pathname === "/api/auth/telegram" && request.method === "POST") return handleTelegramAuth(request, env);
    if (url.pathname === "/api/auth/session" && request.method === "GET") return handleAuthSession(request, env);
    if (url.pathname === "/api/auth/logout" && request.method === "POST") return handleLogout(request, env);
    if (url.pathname === "/api/notifications" && (request.method === "GET" || request.method === "POST" || request.method === "PATCH")) return handleNotifications(request,env);
    if (url.pathname === "/api/admin/telegram" && (request.method === "GET" || request.method === "POST")) return handleAdminTelegram(request,env);
    if (url.pathname === "/api/admin/setup-status" && request.method === "GET") return json({ok:true,setupRequired:(await adminCount(env))===0});
    if (url.pathname === "/api/admin/setup" && request.method === "POST") return adminSetup(request,env);
    if (url.pathname === "/api/admin/login" && request.method === "POST") return adminLogin(request,env);
    if (url.pathname === "/api/admin/users" && (request.method === "GET" || request.method === "POST")) return adminUsers(request,env);
    if (url.pathname === "/api/admin/session" && request.method === "GET") return handleAdminSession(request, env);
    if (url.pathname === "/api/referrals/me" && request.method === "GET") return handleReferralMe(request,env);
    if (url.pathname === "/api/admin/referrals" && (request.method === "GET" || request.method === "POST")) return handleAdminReferrals(request,env);
    if (url.pathname === "/api/admin/overview" && request.method === "GET") return handleAdminOverview(request,env);
    if (url.pathname === "/api/admin/manage-users" && (request.method === "GET" || request.method === "POST")) return handleAdminUserManagement(request,env);
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
    if (url.pathname === "/api/wallet" && request.method === "GET") return handleWalletGet(request,env);
    if (url.pathname === "/api/wallet/deposits" && request.method === "POST") return handleWalletDeposit(request,env);
    if (url.pathname === "/api/wallet/withdrawals" && request.method === "POST") return handleWalletWithdrawal(request,env);
    if (url.pathname === "/api/admin/wallet-settings" && (request.method === "GET" || request.method === "POST")) return handleWalletAdminSettings(request,env);
    if (url.pathname === "/api/admin/wallet-transactions" && request.method === "GET") return handleWalletAdminTransactions(request,env);
    if (url.pathname.startsWith("/api/admin/wallet-transactions/") && request.method === "POST") return handleWalletAdminTransactions(request,env);
    if (url.pathname === "/api/bets/quote" && request.method === "POST") return handleBetQuote(request, env);
    if (url.pathname === "/api/bets" && request.method === "POST") return handleBetCreate(request, env);
    if (url.pathname === "/api/bets" && request.method === "GET") return handleBetList(request, env);
    if (url.pathname === "/api/admin/bet-settlements" && request.method === "GET") return handleBetSettlementDiagnostics(request, env);
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
        const update=await request.json() as {update_id?:number;message?:TelegramMessage};
        if(Number.isSafeInteger(update.update_id)){const exists=await env.DB.prepare("SELECT update_id FROM telegram_command_events WHERE update_id=?").bind(String(update.update_id)).first<any>();if(exists)return json({ok:true,duplicate:true});}
        await processUpdate(update,env);
        if(Number.isSafeInteger(update.update_id))await env.DB.prepare("INSERT OR IGNORE INTO telegram_command_events(update_id,telegram_user_id,command) VALUES(?,?,?)").bind(String(update.update_id),String(update.message?.from?.id||"")||null,(update.message?.text||"").slice(0,64)||"message").run();
        return json({ok:true});
      } catch (error) {
        console.error("Telegram webhook processing failed", error);
        return json({ ok: false, error: "Unable to process Telegram update" }, 500);
      }
    }

    if (url.pathname.startsWith("/api/")) return json({ ok: false, error: "API route not found" }, 404);
    return env.ASSETS.fetch(request);
    })().catch(error=>{console.error("Unhandled CodeRush request failure",error);return json({ok:false,error:"Internal server error"},500)});
    return withSecurityHeaders(response);
  },
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    if (controller.cron === "* * * * *") { await deliverTelegramNotificationOutbox(env); await deliverTelegramBroadcastJobs(env); return; }
    if (controller.cron === "*/5 * * * *") {
      await monitorPendingWalletDeposits(env);
      return;
    }
    if (!env.API_FOOTBALL_KEY) return;
    try {
      if (controller.cron === "*/30 * * * *") {
        await syncFootballLive(env);
      } else if (controller.cron === "0 */2 * * *") {
        await refreshAndSettleBetResults(env);
      } else if (controller.cron === "15 0 * * *") {
        await env.DB.prepare("DELETE FROM user_sessions WHERE expires_at<datetime('now','-7 days') OR revoked_at<datetime('now','-30 days')").run();
        await env.DB.prepare("DELETE FROM admin_login_attempts WHERE created_at<datetime('now','-30 days')").run();
        await syncFootballRange(env, dayString(new Date()), dayString(new Date()));
      }
    } catch (error) {
      const message=error instanceof Error?error.message:"Scheduled sports refresh failed";
      await env.DB.prepare("INSERT INTO sports_sync_state(provider,last_error,updated_at) VALUES ('api-football',?,?) ON CONFLICT(provider) DO UPDATE SET last_error=excluded.last_error,updated_at=excluded.updated_at").bind(message.slice(0,500),isoNow()).run();
      console.error("Scheduled API-Football refresh failed", message);
    }
  },
} satisfies ExportedHandler<Env>;
