const http=require('http');const crypto=require('crypto');const {Pool}=require('pg');
const PORT=Number(process.env.PORT||10000),DB=process.env.DATABASE_URL;
if(!DB){console.error('DATABASE_URL is not set');process.exit(1)}
const pool=new Pool({connectionString:DB,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
const MAX={post:5000,msg:5000,bio:1000,job:5000};
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
const attr=esc,int=v=>{const n=Number(v);return Number.isInteger(n)&&n>0?n:null},trim=(v,n)=>String(v??'').trim().slice(0,n),hash=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
const token=n=>crypto.randomBytes(n||32).toString('hex');

function cookies(req){const o={};for(const x of (req.headers.cookie||'').split(';')){const i=x.indexOf('=');if(i>0)o[x.slice(0,i).trim()]=decodeURIComponent(x.slice(i+1).trim());}return o}
function body(req,limit=2e6){return new Promise((ok,no)=>{let s='';req.on('data',c=>{s+=c;if(s.length>limit){no(new Error('body too large'));req.destroy()}});req.on('end',()=>ok(new URLSearchParams(s)));req.on('error',no)})}
function send(res,status,content,type='text/html; charset=utf-8'){res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store'});res.end(content)}
function red(res,to,c=''){const h={Location:to};if(c)h['Set-Cookie']=c;res.writeHead(302,h);res.end()}
function page(title,content,u=null){const nav=u?`<nav class="bottom"><a href="/">🏠<small>خانه</small></a><a href="/explore">🔎<small>کاوش</small></a><a href="/new-post">➕<small>پست</small></a><a href="/messages">💬<small>پیام</small></a><a href="/profile">👤<small>پروفایل</small></a></nav>`:'';return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>
*{box-sizing:border-box}body{margin:0;background:#f0f2f5;color:#202124;font-family:Tahoma,Arial,sans-serif}.app{max-width:760px;margin:auto;min-height:100vh;background:#fff;padding-bottom:${u?'80px':'20px'}}header{position:sticky;top:0;z-index:20;background:#fff;border-bottom:1px solid #ddd;padding:12px 15px;display:flex;justify-content:space-between;align-items:center}.logo{font-weight:900}.top{display:flex;gap:6px;overflow:auto;padding:8px 12px}.top a{white-space:nowrap;background:#f5f6f8;border-radius:10px;padding:7px 9px;font-size:12px}.content{padding:12px}.card,.job{background:#fff;border:1px solid #e0e4e8;border-radius:16px;padding:14px;margin-bottom:12px;box-shadow:0 2px 8px #00000008}.head{display:flex;gap:10px;align-items:center}.avatar{width:52px;height:52px;border-radius:50%;background:#222;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;overflow:hidden;flex:none}.avatar img{width:100%;height:100%;object-fit:cover}.name{font-weight:900}.email,.small{font-size:12px;color:#777;margin-top:3px}.text{white-space:pre-wrap;word-break:break-word;line-height:1.9;margin:12px 0}.stats,.actions{display:flex;gap:7px;flex-wrap:wrap;align-items:center}.stats{font-size:13px;color:#666}.actions{margin-top:10px}button,.btn{border:0;border-radius:10px;padding:10px 13px;background:#202124;color:#fff;cursor:pointer;font-size:14px}.full{width:100%;margin-top:7px}.like{background:#e91e63}.green{background:#087f23}.danger{background:#b00020}.blue{background:#1976d2}.notice{background:#fff7df;padding:10px;border-radius:10px;margin-bottom:10px}.error{color:#b00020}.success{color:#087f23}.empty{text-align:center;color:#777;padding:30px 10px}input,textarea,select{width:100%;padding:11px;margin:6px 0;border:1px solid #ccd2d9;border-radius:10px;font:inherit;background:#fff}textarea{min-height:110px;resize:vertical}.postimg,.video{width:100%;max-height:520px;object-fit:contain;border-radius:12px;margin-top:8px}.comment{background:#f5f6f8;border-radius:11px;padding:9px;margin-top:7px}.badge{display:inline-block;padding:4px 8px;border-radius:20px;background:#eef3ff;color:#2455c3;font-size:11px}.bottom{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:760px;height:65px;background:#fff;border-top:1px solid #ddd;display:flex;justify-content:space-around;align-items:center;z-index:50}.bottom a{text-align:center;font-size:21px}.bottom small{display:block;font-size:10px}@media(max-width:480px){.content{padding:9px}.card{border-radius:13px}}
</style></head><body><div class="app"><header><div class="logo">📱 MySocial</div><b>${esc(title)}</b></header>${u?`<div class="top"><a href="/notifications">🔔 اعلان</a><a href="/stories">📖 استوری</a><a href="/reels">🎬 Reels</a><a href="/jobs">💼 کار</a><a href="/account">⚙️ امکانات</a><a href="/logout">🚪 خروج</a></div>`:''}<main class="content">${content}</main></div>${nav}<script>function theme(){document.body.classList.toggle('dark');localStorage.dark=document.body.classList.contains('dark')}if(localStorage.dark==='true')document.body.classList.add('dark')</script></body></html>`}
const html=(res,s,t,c,u)=>send(res,s,page(t,c,u));
async function q(sql,p=[]){return pool.query(sql,p)}
async function col(t,c,d){await q(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS ${c} ${d}`)}

async function tables(){
await q(`CREATE TABLE IF NOT EXISTS users(id SERIAL PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL)`);
await col('users','bio','TEXT DEFAULT \'\'');await col('users','avatar_url','TEXT');await col('users','is_verified','BOOLEAN DEFAULT FALSE');await col('users','account_type','TEXT DEFAULT \'personal\'');
await q(`CREATE TABLE IF NOT EXISTS sessions(session_id TEXT PRIMARY KEY,user_id INT REFERENCES users(id) ON DELETE CASCADE,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
await q(`CREATE TABLE IF NOT EXISTS posts(id SERIAL PRIMARY KEY,user_id INT REFERENCES users(id) ON DELETE CASCADE,content TEXT NOT NULL DEFAULT '',image_url TEXT,media_type TEXT DEFAULT 'image',location TEXT,archived BOOLEAN DEFAULT FALSE,pinned BOOLEAN DEFAULT FALSE,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
await q(`CREATE TABLE IF NOT EXISTS likes(id SERIAL PRIMARY KEY,post_id INT REFERENCES posts(id) ON DELETE CASCADE,user_id INT REFERENCES users(id) ON DELETE CASCADE,UNIQUE(post_id,user_id))`);
await q(`CREATE TABLE IF NOT EXISTS comments(id SERIAL PRIMARY KEY,post_id INT REFERENCES posts(id) ON DELETE CASCADE,user_id INT REFERENCES users(id) ON DELETE CASCADE,comment TEXT NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
await q(`CREATE TABLE IF NOT EXISTS follows(id SERIAL PRIMARY KEY,follower_id INT REFERENCES users(id) ON DELETE CASCADE,following_id INT REFERENCES users(id) ON DELETE CASCADE,UNIQUE(follower_id,following_id))`);
await q(`CREATE TABLE IF NOT EXISTS follow_requests(id SERIAL PRIMARY KEY,requester_id INT REFERENCES users(id) ON DELETE CASCADE,target_id INT REFERENCES users(id) ON DELETE CASCADE,status TEXT DEFAULT 'pending',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,UNIQUE(requester_id,target_id))`);
await q(`CREATE TABLE IF NOT EXISTS bookmarks(id SERIAL PRIMARY KEY,post_id INT REFERENCES posts(id) ON DELETE CASCADE,user_id INT REFERENCES users(id) ON DELETE CASCADE,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,UNIQUE(post_id,user_id))`);
await q(`CREATE TABLE IF NOT EXISTS collections(id SERIAL PRIMARY KEY,user_id INT REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,UNIQUE(user_id,name))`);
await q(`CREATE TABLE IF NOT EXISTS collection_items(collection_id INT REFERENCES collections(id) ON DELETE CASCADE,post_id INT REFERENCES posts(id) ON DELETE CASCADE,PRIMARY KEY(collection_id,post_id))`);
await q(`CREATE TABLE IF NOT EXISTS blocked_users(id SERIAL PRIMARY KEY,blocker_id INT REFERENCES users(id) ON DELETE CASCADE,blocked_id INT REFERENCES users(id) ON DELETE CASCADE,UNIQUE(blocker_id,blocked_id))`);
await q(`CREATE TABLE IF NOT EXISTS mutes(user_id INT REFERENCES users(id) ON DELETE CASCADE,muted_id INT REFERENCES users(id) ON DELETE CASCADE,PRIMARY KEY(user_id,muted_id))`);
await q(`CREATE TABLE IF NOT EXISTS restrictions(user_id INT REFERENCES users(id) ON DELETE CASCADE,restricted_id INT REFERENCES users(id) ON DELETE CASCADE,PRIMARY KEY(user_id,restricted_id))`);
await q(`CREATE TABLE IF NOT EXISTS close_friends(user_id INT REFERENCES users(id) ON DELETE CASCADE,friend_id INT REFERENCES users(id) ON DELETE CASCADE,PRIMARY KEY(user_id,friend_id))`);
await q(`CREATE TABLE IF NOT EXISTS user_settings(user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,is_private BOOLEAN DEFAULT FALSE,message_policy TEXT DEFAULT 'everyone',mention_policy TEXT DEFAULT 'everyone',tag_policy TEXT DEFAULT 'everyone',show_activity BOOLEAN DEFAULT TRUE,allow_story_replies BOOLEAN DEFAULT TRUE,notifications_enabled BOOLEAN DEFAULT TRUE,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
await q(`CREATE TABLE IF NOT EXISTS messages(id SERIAL PRIMARY KEY,sender_id INT REFERENCES users(id) ON DELETE CASCADE,receiver_id INT REFERENCES users(id) ON DELETE CASCADE,message TEXT NOT NULL,read_at TIMESTAMP,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
await q(`CREATE TABLE IF NOT EXISTS notifications(id SERIAL PRIMARY KEY,user_id INT REFERENCES users(id) ON DELETE CASCADE,actor_id INT REFERENCES users(id) ON DELETE SET NULL,type TEXT NOT NULL,post_id INT REFERENCES posts(id) ON DELETE CASCADE,message TEXT NOT NULL,is_read BOOLEAN DEFAULT FALSE,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
await q(`CREATE TABLE IF NOT EXISTS reports(id SERIAL PRIMARY KEY,reporter_id INT REFERENCES users(id) ON DELETE CASCADE,reported_user_id INT REFERENCES users(id) ON DELETE SET NULL,post_id INT REFERENCES posts(id) ON DELETE SET NULL,reason TEXT NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
await q(`CREATE TABLE IF NOT EXISTS stories(id SERIAL PRIMARY KEY,user_id INT REFERENCES users(id) ON DELETE CASCADE,media_url TEXT,text TEXT DEFAULT '',media_type TEXT DEFAULT 'image',expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP+INTERVAL '24 hours'),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
await q(`CREATE TABLE IF NOT EXISTS story_views(story_id INT REFERENCES stories(id) ON DELETE CASCADE,user_id INT REFERENCES users(id) ON DELETE CASCADE,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(story_id,user_id))`);
await q(`CREATE TABLE IF NOT EXISTS story_reactions(story_id INT REFERENCES stories(id) ON DELETE CASCADE,user_id INT REFERENCES users(id) ON DELETE CASCADE,reaction TEXT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(story_id,user_id))`);
await q(`CREATE TABLE IF NOT EXISTS highlights(id SERIAL PRIMARY KEY,user_id INT REFERENCES users(id) ON DELETE CASCADE,title TEXT NOT NULL,cover_url TEXT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
await q(`CREATE TABLE IF NOT EXISTS highlight_items(highlight_id INT REFERENCES highlights(id) ON DELETE CASCADE,story_id INT REFERENCES stories(id) ON DELETE CASCADE,PRIMARY KEY(highlight_id,story_id))`);
await q(`CREATE TABLE IF NOT EXISTS reels(id SERIAL PRIMARY KEY,user_id INT REFERENCES users(id) ON DELETE CASCADE,media_url TEXT NOT NULL,caption TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
await q(`CREATE TABLE IF NOT EXISTS reel_likes(reel_id INT REFERENCES reels(id) ON DELETE CASCADE,user_id INT REFERENCES users(id) ON DELETE CASCADE,PRIMARY KEY(reel_id,user_id))`);
await q(`CREATE TABLE IF NOT EXISTS reel_comments(id SERIAL PRIMARY KEY,reel_id INT REFERENCES reels(id) ON DELETE CASCADE,user_id INT REFERENCES users(id) ON DELETE CASCADE,comment TEXT NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
await q(`CREATE TABLE IF NOT EXISTS reel_views(id SERIAL PRIMARY KEY,reel_id INT REFERENCES reels(id) ON DELETE CASCADE,user_id INT REFERENCES users(id) ON DELETE SET NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
await q(`CREATE TABLE IF NOT EXISTS shares(id SERIAL PRIMARY KEY,user_id INT REFERENCES users(id) ON DELETE CASCADE,post_id INT REFERENCES posts(id) ON DELETE CASCADE,reel_id INT REFERENCES reels(id) ON DELETE CASCADE,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
await q(`CREATE TABLE IF NOT EXISTS post_views(id SERIAL PRIMARY KEY,post_id INT REFERENCES posts(id) ON DELETE CASCADE,user_id INT REFERENCES users(id) ON DELETE SET NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
await q(`CREATE TABLE IF NOT EXISTS hashtags(id SERIAL PRIMARY KEY,tag TEXT UNIQUE NOT NULL)`);
await q(`CREATE TABLE IF NOT EXISTS hashtag_posts(hashtag_id INT REFERENCES hashtags(id) ON DELETE CASCADE,post_id INT REFERENCES posts(id) ON DELETE CASCADE,PRIMARY KEY(hashtag_id,post_id))`);
await q(`CREATE TABLE IF NOT EXISTS hashtag_reels(hashtag_id INT REFERENCES hashtags(id) ON DELETE CASCADE,reel_id INT REFERENCES reels(id) ON DELETE CASCADE,PRIMARY KEY(hashtag_id,reel_id))`);
await q(`CREATE TABLE IF NOT EXISTS jobs(id SERIAL PRIMARY KEY,user_id INT REFERENCES users(id) ON DELETE CASCADE,title TEXT NOT NULL,city TEXT NOT NULL,salary TEXT NOT NULL,description TEXT NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
await q(`CREATE TABLE IF NOT EXISTS call_signals(id SERIAL PRIMARY KEY,caller_id INT REFERENCES users(id) ON DELETE CASCADE,receiver_id INT REFERENCES users(id) ON DELETE CASCADE,call_id TEXT NOT NULL,type TEXT NOT NULL,payload TEXT NOT NULL,consumed BOOLEAN DEFAULT FALSE,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
await q(`CREATE TABLE IF NOT EXISTS profile_visits(id SERIAL PRIMARY KEY,profile_id INT REFERENCES users(id) ON DELETE CASCADE,visitor_id INT REFERENCES users(id) ON DELETE SET NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
await q(`CREATE TABLE IF NOT EXISTS ads(id SERIAL PRIMARY KEY,user_id INT REFERENCES users(id) ON DELETE CASCADE,title TEXT NOT NULL,body TEXT DEFAULT '',media_url TEXT,target_url TEXT,budget NUMERIC(14,2) DEFAULT 0,spent NUMERIC(14,2) DEFAULT 0,status TEXT DEFAULT 'draft',starts_at TIMESTAMP,ends_at TIMESTAMP,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
await q(`CREATE TABLE IF NOT EXISTS ad_events(id SERIAL PRIMARY KEY,ad_id INT REFERENCES ads(id) ON DELETE CASCADE,user_id INT REFERENCES users(id) ON DELETE SET NULL,event_type TEXT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
await q(`CREATE TABLE IF NOT EXISTS creator_accounts(user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,balance NUMERIC(14,2) DEFAULT 0,lifetime_earned NUMERIC(14,2) DEFAULT 0,enabled BOOLEAN DEFAULT TRUE,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
await q(`CREATE TABLE IF NOT EXISTS creator_transactions(id SERIAL PRIMARY KEY,user_id INT REFERENCES users(id) ON DELETE CASCADE,type TEXT,amount NUMERIC(14,2),description TEXT,status TEXT DEFAULT 'completed',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
await q(`CREATE TABLE IF NOT EXISTS creator_payouts(id SERIAL PRIMARY KEY,user_id INT REFERENCES users(id) ON DELETE CASCADE,amount NUMERIC(14,2),status TEXT DEFAULT 'pending',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
await q(`CREATE TABLE IF NOT EXISTS creator_subscriptions(id SERIAL PRIMARY KEY,creator_id INT REFERENCES users(id) ON DELETE CASCADE,subscriber_id INT REFERENCES users(id) ON DELETE CASCADE,amount NUMERIC(14,2) DEFAULT 0,status TEXT DEFAULT 'active',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,UNIQUE(creator_id,subscriber_id))`);
await q(`CREATE TABLE IF NOT EXISTS subscription_plans(id SERIAL PRIMARY KEY,creator_id INT REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,price NUMERIC(14,2) NOT NULL,description TEXT DEFAULT '',active BOOLEAN DEFAULT TRUE,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
await q(`CREATE TABLE IF NOT EXISTS verification_requests(id SERIAL PRIMARY KEY,user_id INT REFERENCES users(id) ON DELETE CASCADE,status TEXT DEFAULT 'pending',note TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
await q(`CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC)`);
await q(`CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id,created_at DESC)`);
console.log('Database ready')
}

async function session(req){const sid=cookies(req).sessionId;if(!sid)return null;const r=await q(`SELECT u.id,u.name,u.email,u.bio,u.avatar_url,u.is_verified,u.account_type FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.session_id=$1`,[sid]);return r.rows[0]||null}
async function note(uid,actor,type,post,msg){if(uid&&uid!==actor)await q(`INSERT INTO notifications(user_id,actor_id,type,post_id,message) VALUES($1,$2,$3,$4,$5)`,[uid,actor,type,post||null,msg])}
async function blocked(a,b){const r=await q(`SELECT 1 FROM blocked_users WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)`,[a,b]);return !!r.rows.length}
function avatar(u){return u&&u.avatar_url?`<div class="avatar"><img src="${attr(u.avatar_url)}"></div>`:`<div class="avatar">${esc(String(u?.name||'?').charAt(0))}</div>`}

async function postCard(p,u){return `<article class="card"><div class="head"><a href="/user?id=${p.user_id}">${avatar(p)}</a><div><div class="name">${esc(p.name)} ${p.is_verified?'✅':''}</div><div class="email">${esc(p.email||'')}</div></div></div>${p.location?`<div class="small">📍 ${esc(p.location)}</div>`:''}<div class="text">${esc(p.content)}</div>${p.image_url?(p.media_type==='video'?`<video controls playsinline class="postimg" src="${attr(p.image_url)}"></video>`:`<img class="postimg" src="${attr(p.image_url)}" alt="پست">`):''}<div class="stats">❤️ ${p.like_count||0} · 💬 ${p.comment_count||0} · 🔗 ${p.share_count||0} · 👀 ${p.view_count||0}</div><div class="actions"><a href="/like?post=${p.id}"><button class="like">${p.liked?'💔 لغو لایک':'❤️ لایک'}</button></a><a href="/post?id=${p.id}"><button>💬 نظرها</button></a><a href="/bookmark?post=${p.id}"><button>🔖 ${p.bookmarked?'ذخیره‌شده':'ذخیره'}</button></a><a href="/share?post=${p.id}"><button>🔗 اشتراک</button></a>${Number(p.user_id)===Number(u.id)?`<a href="/pin?id=${p.id}"><button>📌 ${p.pinned?'برداشتن سنجاق':'سنجاق'}</button></a><a href="/archive?id=${p.id}"><button>🗄️ ${p.archived?'بازگردانی':'آرشیو'}</button></a>`:`<a href="/report?post=${p.id}"><button>🚩 گزارش</button></a>`}</div><div class="small">${new Date(p.created_at).toLocaleString('fa-IR')}</div></article>`}

async function feed(u,where='',params=[]){
const sql=`SELECT p.*,u.name,u.email,u.avatar_url,u.is_verified,(SELECT COUNT(*) FROM likes WHERE post_id=p.id)::int like_count,(SELECT COUNT(*) FROM comments WHERE post_id=p.id)::int comment_count,(SELECT COUNT(*) FROM shares WHERE post_id=p.id)::int share_count,(SELECT COUNT(*) FROM post_views WHERE post_id=p.id)::int view_count,EXISTS(SELECT 1 FROM likes l WHERE l.post_id=p.id AND l.user_id=$1) liked,EXISTS(SELECT 1 FROM bookmarks b WHERE b.post_id=p.id AND b.user_id=$1) bookmarked FROM posts p JOIN users u ON u.id=p.user_id WHERE p.archived=FALSE AND NOT EXISTS(SELECT 1 FROM blocked_users b WHERE (b.blocker_id=$1 AND b.blocked_id=p.user_id) OR (b.blocker_id=p.user_id AND b.blocked_id=$1)) AND NOT EXISTS(SELECT 1 FROM mutes m WHERE m.user_id=$1 AND m.muted_id=p.user_id) ${where} ORDER BY p.pinned DESC,p.created_at DESC LIMIT 50`;
return q(sql,[u.id,...params])
}

const server=http.createServer(async(req,res)=>{
try{
const url=new URL(req.url,'http://localhost'),path=url.pathname,u=await session(req);

if(req.method==='GET'&&path==='/'){
if(!u){html(res,200,'خوش آمدید',`<div class="card"><h1>MySocial 📱</h1><p>یک شبکه اجتماعی کامل برای پست، استوری، Reels، پیام، تماس و درآمدزایی.</p><a href="/signup"><button class="full blue">ثبت‌نام</button></a><a href="/login"><button class="full">ورود</button></a></div>`);return}
const r=await feed(u);
let c=`<div class="card"><div class="head">${avatar(u)}<div><div class="name">خوش آمدی ${esc(u.name)} ${u.is_verified?'✅':''}</div><div class="small">${esc(u.email)}</div></div></div><div class="actions"><a href="/stories"><button>📖 استوری</button></a><a href="/reels"><button>🎬 Reels</button></a><a href="/new-post"><button class="green">➕ پست</button></a></div></div>`;
c+=r.rows.length?await Promise.all(r.rows.map(x=>postCard(x,u))).then(a=>a.join('')):`<div class="card empty">هنوز پستی نیست.</div>`;
html(res,200,'خانه',c,u);return
}

if(path==='/signup'&&req.method==='GET'){html(res,200,'ثبت‌نام',`<div class="card"><form method="POST"><input name="name" maxlength="100" placeholder="نام" required><input name="email" type="email" placeholder="ایمیل" required><input name="password" type="password" minlength="6" placeholder="رمز عبور" required><button class="full blue">ثبت‌نام</button></form></div>`);return}

if(path==='/signup'&&req.method==='POST'){
const d=await body(req),name=trim(d.get('name'),100),email=trim(d.get('email'),200).toLowerCase(),pw=String(d.get('password')||'');
if(!name||!email||pw.length<6){html(res,400,'خطا','<div class="card error">اطلاعات ثبت‌نام کامل نیست.</div>');return}
try{const r=await q(`INSERT INTO users(name,email,password) VALUES($1,$2,$3) RETURNING id`,[name,email,hash(pw)]);await q(`INSERT INTO user_settings(user_id) VALUES($1) ON CONFLICT DO NOTHING`,[r.rows[0].id]);red(res,'/login')}
catch(e){html(res,400,'خطا','<div class="card error">این ایمیل قبلاً ثبت شده است.</div>')}
return
}

if(path==='/login'&&req.method==='GET'){html(res,200,'ورود',`<div class="card"><form method="POST"><input name="email" type="email" placeholder="ایمیل" required><input name="password" type="password" placeholder="رمز عبور" required><button class="full">ورود</button></form></div>`);return}

if(path==='/login'&&req.method==='POST'){
const d=await body(req),email=trim(d.get('email'),200).toLowerCase(),pw=String(d.get('password')||'');
const r=await q(`SELECT id FROM users WHERE email=$1 AND password=$2`,[email,hash(pw)]);
if(!r.rows.length){html(res,401,'خطا','<div class="card error">ایمیل یا رمز عبور اشتباه است.</div>');return}
const sid=token(32);await q(`INSERT INTO sessions(session_id,user_id) VALUES($1,$2)`,[sid,r.rows[0].id]);
red(res,'/','sessionId='+sid+'; HttpOnly; Path=/; SameSite=Lax');return
}

if(!u){red(res,'/login');return}

if(path==='/logout'){
const sid=cookies(req).sessionId;if(sid)await q(`DELETE FROM sessions WHERE session_id=$1`,[sid]);
red(res,'/','sessionId=; Max-Age=0; HttpOnly; Path=/; SameSite=Lax');return
}

if(path==='/new-post'&&req.method==='GET'){
html(res,200,'پست جدید',`<div class="card"><form method="POST"><textarea name="content" maxlength="5000" placeholder="چه چیزی می‌خواهی منتشر کنی؟" required></textarea><input name="image_url" maxlength="4000" placeholder="لینک عکس یا ویدئو (اختیاری)"><select name="media_type"><option value="image">عکس</option><option value="video">ویدئو</option></select><input name="location" maxlength="200" placeholder="مکان اختیاری"><button class="full green">📤 انتشار</button></form></div>`,u);return
}

if(path==='/new-post'&&req.method==='POST'){
const d=await body(req),content=trim(d.get('content'),MAX.post),image=trim(d.get('image_url'),4000),type=d.get('media_type')==='video'?'video':'image',loc=trim(d.get('location'),200);
if(!content){html(res,400,'خطا','<div class="card error">متن پست خالی است.</div>',u);return}
const r=await q(`INSERT INTO posts(user_id,content,image_url,media_type,location) VALUES($1,$2,$3,$4,$5) RETURNING id`,[u.id,content,image||null,type,loc||null]);
for(const tag of (content.match(/#[\p{L}\p{N}_]+/gu)||[]).map(x=>x.slice(1).toLowerCase())){
const h=await q(`INSERT INTO hashtags(tag) VALUES($1) ON CONFLICT(tag) DO UPDATE SET tag=EXCLUDED.tag RETURNING id`,[tag]);
await q(`INSERT INTO hashtag_posts(hashtag_id,post_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[h.rows[0].id,r.rows[0].id])
}
red(res,'/');return
}

if(path==='/like'){
const id=int(url.searchParams.get('post'));
if(id){
const r=await q(`SELECT user_id FROM posts WHERE id=$1`,[id]);
if(r.rows.length){
const x=await q(`SELECT 1 FROM likes WHERE post_id=$1 AND user_id=$2`,[id,u.id]);
if(x.rows.length)await q(`DELETE FROM likes WHERE post_id=$1 AND user_id=$2`,[id,u.id]);
else{await q(`INSERT INTO likes(post_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[id,u.id]);await note(r.rows[0].user_id,u.id,'like',id,`${u.name} پست شما را پسندید.`)}
}}
red(res,'/');return
}

if(path==='/bookmark'){
const id=int(url.searchParams.get('post'));
if(id){
const x=await q(`SELECT 1 FROM bookmarks WHERE post_id=$1 AND user_id=$2`,[id,u.id]);
if(x.rows.length)await q(`DELETE FROM bookmarks WHERE post_id=$1 AND user_id=$2`,[id,u.id]);
else await q(`INSERT INTO bookmarks(post_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[id,u.id])
}
red(res,'/');return
}

if(path==='/share'){
const id=int(url.searchParams.get('post'));
if(id)await q(`INSERT INTO shares(user_id,post_id) VALUES($1,$2)`,[u.id,id]);
red(res,`/post?id=${id}`);return
}

if(path==='/post'){
const id=int(url.searchParams.get('id'));
const r=await q(`SELECT p.*,u.name,u.email,u.avatar_url,u.is_verified FROM posts p JOIN users u ON u.id=p.user_id WHERE p.id=$1`,[id]);
if(!r.rows.length){html(res,404,'پست','<div class="card empty">پست پیدا نشد.</div>',u);return}
await q(`INSERT INTO post_views(post_id,user_id) VALUES($1,$2)`,[id,u.id]);
const p=r.rows[0],c=await q(`SELECT c.*,u.name FROM comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=$1 ORDER BY c.created_at`,[id]);
let comments=c.rows.map(x=>`<div class="comment"><b>${esc(x.name)}</b><div>${esc(x.comment)}</div></div>`).join('')||'<div class="empty">هنوز نظری نیست.</div>';
html(res,200,'پست',`<div class="card"><div class="head">${avatar(p)}<div><div class="name">${esc(p.name)}</div></div></div><div class="text">${esc(p.content)}</div>${p.image_url?(p.media_type==='video'?`<video controls class="postimg" src="${attr(p.image_url)}"></video>`:`<img class="postimg" src="${attr(p.image_url)}">`):''}<div class="actions"><a href="/like?post=${id}"><button class="like">❤️ لایک</button></a>${p.user_id===u.id?`<a href="/delete-post?id=${id}"><button class="danger">🗑 حذف</button></a>`:`<a href="/report?post=${id}"><button>🚩 گزارش</button></a>`}</div></div><div class="card"><h3>💬 نظرات</h3>${comments}<form method="POST" action="/comment"><input type="hidden" name="post_id" value="${id}"><textarea name="comment" maxlength="2000" required placeholder="نظر خود را بنویس..."></textarea><button class="full">ارسال</button></form></div>`,u);return
}

if(path==='/comment'&&req.method==='POST'){
const d=await body(req),id=int(d.get('post_id')),text=trim(d.get('comment'),2000);
if(id&&text){const r=await q(`SELECT user_id FROM posts WHERE id=$1`,[id]);await q(`INSERT INTO comments(post_id,user_id,comment) VALUES($1,$2,$3)`,[id,u.id,text]);if(r.rows.length)await note(r.rows[0].user_id,u.id,'comment',id,`${u.name} روی پست شما نظر داد.`)}
red(res,`/post?id=${id}`);return
}

if(path==='/delete-post'){
const id=int(url.searchParams.get('id'));if(id)await q(`DELETE FROM posts WHERE id=$1 AND user_id=$2`,[id,u.id]);red(res,'/');return
}

if(path==='/search'){
const s=trim(url.searchParams.get('q'),255);
const users=await q(`SELECT id,name,email,avatar_url,is_verified FROM users WHERE name ILIKE $1 OR email ILIKE $1 ORDER BY id DESC LIMIT 50`,[`%${s}%`]);
const posts=await q(`SELECT p.*,u.name,u.email,u.avatar_url,u.is_verified,(SELECT COUNT(*) FROM likes l WHERE l.post_id=p.id)::int like_count,(SELECT COUNT(*) FROM comments c WHERE c.post_id=p.id)::int comment_count,(SELECT COUNT(*) FROM shares sh WHERE sh.post_id=p.id)::int share_count,(SELECT COUNT(*) FROM post_views v WHERE v.post_id=p.id)::int view_count FROM posts p JOIN users u ON u.id=p.user_id WHERE p.content ILIKE $1 AND NOT EXISTS(SELECT 1 FROM blocked_users b WHERE (b.blocker_id=$2 AND b.blocked_id=p.user_id) OR (b.blocker_id=p.user_id AND b.blocked_id=$2)) ORDER BY p.created_at DESC LIMIT 50`,[`%${s}%`,u.id]);
const jobs=await q(`SELECT j.*,x.name FROM jobs j JOIN users x ON x.id=j.user_id WHERE j.title ILIKE $1 OR j.city ILIKE $1 OR j.description ILIKE $1 ORDER BY j.created_at DESC LIMIT 50`,[`%${s}%`]);
let c=`<div class="card"><form><input name="q" value="${attr(s)}" placeholder="نام، پست، شغل، شهر یا هشتگ"><button class="full">🔎 جستجو</button></form></div><h3>👥 کاربران</h3>`;
c+=users.rows.map(x=>`<div class="card"><div class="head">${avatar(x)}<div><div class="name">${esc(x.name)} ${x.is_verified?'✅':''}</div><div class="email">${esc(x.email)}</div></div></div><a href="/user?id=${x.id}"><button class="full">پروفایل</button></a></div>`).join('')||'<div class="card empty">کاربری پیدا نشد.</div>';
c+='<h3>📝 پست‌ها</h3>'+((await Promise.all(posts.rows.map(x=>postCard(x,u)))).join('')||'<div class="card empty">پستی پیدا نشد.</div>');
c+='<h3>💼 کارها</h3>'+jobs.rows.map(j=>`<div class="job"><b>${esc(j.title)}</b><div>📍 ${esc(j.city)}</div><div>💰 ${esc(j.salary)}</div><div class="text">${esc(j.description)}</div><div class="small">${esc(j.name)}</div></div>`).join('')||'<div class="card empty">آگهی‌ای پیدا نشد.</div>';
html(res,200,'جستجو',c,u);return
}

if(path==='/user'){
const id=int(url.searchParams.get('id'))||u.id;
const r=await q(`SELECT id,name,email,bio,avatar_url,is_verified,account_type FROM users WHERE id=$1`,[id]);
if(!r.rows.length){html(res,404,'کاربر','<div class="card empty">کاربر پیدا نشد.</div>',u);return}
const p=r.rows[0];if(id!==u.id)await q(`INSERT INTO profile_visits(profile_id,visitor_id) VALUES($1,$2)`,[id,u.id]);
const [fo,fr,following]=await Promise.all([q(`SELECT COUNT(*) c FROM follows WHERE following_id=$1`,[id]),q(`SELECT COUNT(*) c FROM follows WHERE follower_id=$1`,[id]),q(`SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2`,[u.id,id])]);
let act=id===u.id?`<a href="/settings"><button>⚙️ تنظیمات</button></a>`:`<a href="/follow?id=${id}"><button class="blue">${following.rows.length?'✓ دنبال می‌کنید':'➕ دنبال کردن'}</button></a><a href="/chat?id=${id}"><button>💬 پیام</button></a><a href="/mute?id=${id}"><button>🔇 بی‌صدا</button></a><a href="/restrict?id=${id}"><button>🚫 Restrict</button></a><a href="/block?id=${id}"><button class="danger">مسدود</button></a>`;
const ps=await feed(u,`AND p.user_id=$2`,[id]);
let c=`<div class="card"><div class="head">${avatar(p)}<div><div class="name">${esc(p.name)} ${p.is_verified?'✅':''}</div><div class="email">${esc(p.email)}</div><div class="small">${esc(p.bio||'')}</div></div></div><div class="stats" style="margin-top:10px">👥 دنبال‌کننده ${fo.rows[0].c} · دنبال‌شونده ${fr.rows[0].c} · نوع حساب ${esc(p.account_type||'personal')}</div><div class="actions">${act}</div></div>`;
c+=ps.rows.length?await Promise.all(ps.rows.map(x=>postCard(x,u))).then(a=>a.join('')):'<div class="card empty">هنوز پستی ندارد.</div>';
html(res,200,'پروفایل',c,u);return
}

if(path==='/follow'){
const id=int(url.searchParams.get('id'));
if(id&&id!==u.id){
if((await q(`SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2`,[u.id,id])).rows.length)await q(`DELETE FROM follows WHERE follower_id=$1 AND following_id=$2`,[u.id,id]);
else{
const p=await q(`SELECT COALESCE(s.is_private,FALSE) private FROM users x LEFT JOIN user_settings s ON s.user_id=x.id WHERE x.id=$1`,[id]);
if(p.rows[0]?.private){await q(`INSERT INTO follow_requests(requester_id,target_id) VALUES($1,$2) ON CONFLICT(requester_id,target_id) DO UPDATE SET status='pending'`,[u.id,id]);await note(id,u.id,'follow_request',null,`${u.name} درخواست دنبال کردن شما را فرستاد.`)}
else{await q(`INSERT INTO follows(follower_id,following_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[u.id,id]);await note(id,u.id,'follow',null,`${u.name} شما را دنبال کرد.`)}
}}
red(res,`/user?id=${id}`);return
}

if(path==='/block'||path==='/mute'||path==='/restrict'||path==='/close-friend'){
const id=int(url.searchParams.get('id'));const map={block:['blocked_users','blocker_id','blocked_id'],mute:['mutes','user_id','muted_id'],restrict:['restrictions','user_id','restricted_id'],'close-friend':['close_friends','user_id','friend_id']}[path.slice(1)];
if(id&&id!==u.id){const x=await q(`SELECT 1 FROM ${map[0]} WHERE ${map[1]}=$1 AND ${map[2]}=$2`,[u.id,id]);if(x.rows.length)await q(`DELETE FROM ${map[0]} WHERE ${map[1]}=$1 AND ${map[2]}=$2`,[u.id,id]);else await q(`INSERT INTO ${map[0]}(${map[1]},${map[2]}) VALUES($1,$2) ON CONFLICT DO NOTHING`,[u.id,id])}
red(res,`/user?id=${id}`);return
}

if(path==='/messages'&&req.method==='GET'){
const r=await q(`SELECT u.id,u.name,u.email,u.avatar_url,MAX(m.created_at) last_at,(SELECT m2.message FROM messages m2 WHERE (m2.sender_id=$1 AND m2.receiver_id=u.id) OR (m2.sender_id=u.id AND m2.receiver_id=$1) ORDER BY m2.created_at DESC LIMIT 1) last_message,(SELECT COUNT(*) FROM messages m3 WHERE m3.sender_id=u.id AND m3.receiver_id=$1 AND m3.read_at IS NULL)::int unread FROM users u JOIN messages m ON (m.sender_id=u.id AND m.receiver_id=$1) OR (m.sender_id=$1 AND m.receiver_id=u.id) WHERE u.id<>$1 AND NOT EXISTS(SELECT 1 FROM blocked_users b WHERE (b.blocker_id=$1 AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=$1)) GROUP BY u.id ORDER BY last_at DESC`,[u.id]);
const c=`<div class="card"><h2>💬 پیام‌ها</h2><a href="/search"><button>🔎 پیدا کردن کاربر</button></a></div>`+(r.rows.map(x=>`<div class="card"><div class="head">${avatar(x)}<div><div class="name">${esc(x.name)} ${x.unread?`<span class="badge">${x.unread} جدید</span>`:''}</div><div class="small">${esc(x.last_message||'')}</div></div></div><a href="/chat?id=${x.id}"><button class="full">💬 گفتگو</button></a></div>`).join('')||'<div class="card empty">هنوز گفتگویی ندارید.</div>');
html(res,200,'پیام‌ها',c,u);return
}

if(path==='/chat'&&req.method==='GET'){
const id=int(url.searchParams.get('id'));if(!id||id===u.id){red(res,'/messages');return}
if(await blocked(u.id,id)){html(res,403,'مسدود','<div class="card error">امکان گفتگو وجود ندارد.</div>',u);return}
const other=await q(`SELECT id,name,email,bio,avatar_url FROM users WHERE id=$1`,[id]);if(!other.rows.length){red(res,'/messages');return}
await q(`UPDATE messages SET read_at=CURRENT_TIMESTAMP WHERE sender_id=$1 AND receiver_id=$2 AND read_at IS NULL`,[id,u.id]);
const m=await q(`SELECT m.*,x.name FROM messages m JOIN users x ON x.id=m.sender_id WHERE (m.sender_id=$1 AND m.receiver_id=$2) OR (m.sender_id=$2 AND m.receiver_id=$1) ORDER BY m.created_at ASC LIMIT 500`,[u.id,id]);
const c=`<div class="card"><div class="head">${avatar(other.rows[0])}<div><div class="name">${esc(other.rows[0].name)}</div><div class="small">${esc(other.rows[0].email)}</div></div></div><div class="actions"><a href="/call?user=${id}&mode=audio"><button>📞 تماس صوتی</button></a><a href="/call?user=${id}&mode=video"><button>📹 تماس تصویری</button></a></div></div>`+m.rows.map(x=>`<div class="comment"><b>${esc(x.name)}</b><div>${esc(x.message)}</div><div class="small">${new Date(x.created_at).toLocaleString('fa-IR')}</div></div>`).join('')+`<div class="card"><form method="POST" action="/chat"><input type="hidden" name="receiver_id" value="${id}"><textarea name="message" maxlength="5000" required placeholder="پیام..."></textarea><button class="full">📤 ارسال</button></form></div>`;
html(res,200,'گفتگو',c,u);return
}

if(path==='/chat'&&req.method==='POST'){
const d=await body(req),id=int(d.get('receiver_id')),msg=trim(d.get('message'),MAX.msg);
if(id&&msg&&!await blocked(u.id,id)){await q(`INSERT INTO messages(sender_id,receiver_id,message) VALUES($1,$2,$3)`,[u.id,id,msg]);await note(id,u.id,'message',null,`${u.name} برای شما پیام فرستاد.`)}
red(res,id?`/chat?id=${id}`:'/messages');return
}

if(path==='/notifications'){
const r=await q(`SELECT n.*,x.name actor_name,x.avatar_url FROM notifications n LEFT JOIN users x ON x.id=n.actor_id WHERE n.user_id=$1 ORDER BY n.created_at DESC LIMIT 100`,[u.id]);
await q(`UPDATE notifications SET is_read=TRUE WHERE user_id=$1`,[u.id]);
html(res,200,'اعلان‌ها',r.rows.map(n=>`<div class="card">🔔 <b>${esc(n.actor_name||'سیستم')}</b><div>${esc(n.message)}</div><div class="small">${new Date(n.created_at).toLocaleString('fa-IR')}</div></div>`).join('')||'<div class="card empty">اعلانی ندارید.</div>',u);return
}

if(path==='/stories'&&req.method==='GET'){
await q(`DELETE FROM stories WHERE expires_at<CURRENT_TIMESTAMP`);
const r=await q(`SELECT s.*,x.name,x.email,x.avatar_url,(SELECT COUNT(*) FROM story_views v WHERE v.story_id=s.id)::int views,EXISTS(SELECT 1 FROM story_views v2 WHERE v2.story_id=s.id AND v2.user_id=$1) viewed FROM stories s JOIN users x ON x.id=s.user_id WHERE s.expires_at>CURRENT_TIMESTAMP AND NOT EXISTS(SELECT 1 FROM blocked_users b WHERE (b.blocker_id=$1 AND b.blocked_id=s.user_id) OR (b.blocker_id=s.user_id AND b.blocked_id=$1)) ORDER BY s.created_at DESC LIMIT 100`,[u.id]);
const c=`<div class="card"><h2>📖 استوری</h2><form method="POST"><input name="media_url" maxlength="4000" placeholder="لینک عکس/ویدئو"><select name="media_type"><option value="image">عکس</option><option value="video">ویدئو</option></select><textarea name="text" maxlength="1000" placeholder="متن استوری"></textarea><button class="full green">➕ انتشار</button></form></div>`+r.rows.map(s=>`<div class="card"><div class="head">${avatar(s)}<div class="name">${esc(s.name)}</div></div>${s.media_url?(s.media_type==='video'?`<video controls class="postimg" src="${attr(s.media_url)}"></video>`:`<img class="postimg" src="${attr(s.media_url)}">`):''}<div class="text">${esc(s.text)}</div><div class="stats">👀 ${s.views}</div><div class="actions"><a href="/story-view?id=${s.id}"><button>👀 مشاهده</button></a><a href="/story-react?id=${s.id}&reaction=❤️"><button>❤️</button></a><a href="/story-react?id=${s.id}&reaction=😂"><button>😂</button></a></div></div>`).join('')||'<div class="card empty">استوری فعالی نیست.</div>';
html(res,200,'استوری‌ها',c,u);return
}

if(path==='/stories'&&req.method==='POST'){
const d=await body(req),media=trim(d.get('media_url'),4000),type=d.get('media_type')==='video'?'video':'image',text=trim(d.get('text'),1000);
if(!media&&!text){html(res,400,'خطا','<div class="card error">استوری باید متن یا رسانه داشته باشد.</div>',u);return}
await q(`INSERT INTO stories(user_id,media_url,media_type,text) VALUES($1,$2,$3,$4)`,[u.id,media||null,type,text]);red(res,'/stories');return
}

if(path==='/story-view'){const id=int(url.searchParams.get('id'));if(id)await q(`INSERT INTO story_views(story_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[id,u.id]);red(res,'/stories');return}
if(path==='/story-react'){const id=int(url.searchParams.get('id')),reaction=trim(url.searchParams.get('reaction'),20);if(id)await q(`INSERT INTO story_reactions(story_id,user_id,reaction) VALUES($1,$2,$3) ON CONFLICT(story_id,user_id) DO UPDATE SET reaction=EXCLUDED.reaction`,[id,u.id,reaction||'❤️']);red(res,'/stories');return}

if(path==='/reels'&&req.method==='GET'){
const r=await q(`SELECT r.*,x.name,x.avatar_url,(SELECT COUNT(*) FROM reel_likes l WHERE l.reel_id=r.id)::int likes,(SELECT COUNT(*) FROM reel_comments c WHERE c.reel_id=r.id)::int comments,(SELECT COUNT(*) FROM reel_views v WHERE v.reel_id=r.id)::int views,EXISTS(SELECT 1 FROM reel_likes l2 WHERE l2.reel_id=r.id AND l2.user_id=$1) liked FROM reels r JOIN users x ON x.id=r.user_id WHERE NOT EXISTS(SELECT 1 FROM blocked_users b WHERE (b.blocker_id=$1 AND b.blocked_id=r.user_id) OR (b.blocker_id=r.user_id AND b.blocked_id=$1)) ORDER BY r.created_at DESC LIMIT 100`,[u.id]);
const c=`<div class="card"><h2>🎬 Reels</h2><form method="POST"><input name="media_url" maxlength="4000" placeholder="لینک ویدئو" required><textarea name="caption" maxlength="3000" placeholder="کپشن"></textarea><button class="full green">🎬 انتشار</button></form></div>`+r.rows.map(x=>`<article class="card"><div class="head">${avatar(x)}<div class="name">${esc(x.name)}</div></div><video controls playsinline class="postimg" src="${attr(x.media_url)}"></video><div class="text">${esc(x.caption)}</div><div class="stats">❤️ ${x.likes} · 💬 ${x.comments} · 👀 ${x.views}</div><div class="actions"><a href="/reel-like?id=${x.id}"><button class="like">${x.liked?'💔 لغو':'❤️ لایک'}</button></a><a href="/reel?id=${x.id}"><button>💬 نظرها</button></a><a href="/reel-share?id=${x.id}"><button>🔗 اشتراک</button></a></div></article>`).join('')||'<div class="card empty">Reels خالی است.</div>';
html(res,200,'Reels',c,u);return
}

if(path==='/reels'&&req.method==='POST'){
const d=await body(req),media=trim(d.get('media_url'),4000),cap=trim(d.get('caption'),3000);if(media)await q(`INSERT INTO reels(user_id,media_url,caption) VALUES($1,$2,$3)`,[u.id,media,cap]);red(res,'/reels');return
}

if(path==='/reel-like'){
const id=int(url.searchParams.get('id'));if(id){const x=await q(`SELECT 1 FROM reel_likes WHERE reel_id=$1 AND user_id=$2`,[id,u.id]);if(x.rows.length)await q(`DELETE FROM reel_likes WHERE reel_id=$1 AND user_id=$2`,[id,u.id]);else await q(`INSERT INTO reel_likes(reel_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[id,u.id])}red(res,'/reels');return
}

if(path==='/reel-share'){
const id=int(url.searchParams.get('id'));if(id)await q(`INSERT INTO shares(user_id,reel_id) VALUES($1,$2)`,[u.id,id]);red(res,'/reels');return
}

if(path==='/reel'){
const id=int(url.searchParams.get('id'));const r=await q(`SELECT r.*,x.name FROM reels r JOIN users x ON x.id=r.user_id WHERE r.id=$1`,[id]);
if(!r.rows.length){html(res,404,'Reels','<div class="card empty">ویدئو پیدا نشد.</div>',u);return}
await q(`INSERT INTO reel_views(reel_id,user_id) VALUES($1,$2)`,[id,u.id]);
const c=await q(`SELECT c.*,x.name FROM reel_comments c JOIN users x ON x.id=c.user_id WHERE c.reel_id=$1 ORDER BY c.created_at`,[id]);
html(res,200,'ویدئو',`<div class="card"><b>${esc(r.rows[0].name)}</b><video controls class="postimg" src="${attr(r.rows[0].media_url)}"></video><div class="text">${esc(r.rows[0].caption)}</div></div><div class="card"><h3>💬 نظرات</h3>${c.rows.map(x=>`<div class="comment"><b>${esc(x.name)}</b><div>${esc(x.comment)}</div></div>`).join('')||'<div class="empty">هنوز نظری نیست.</div>'}<form method="POST" action="/reel-comment"><input type="hidden" name="reel_id" value="${id}"><textarea name="comment" maxlength="2000" required></textarea><button class="full">ارسال</button></form></div>`,u);return
}

if(path==='/reel-comment'&&req.method==='POST'){
const d=await body(req),id=int(d.get('reel_id')),c=trim(d.get('comment'),2000);if(id&&c)await q(`INSERT INTO reel_comments(reel_id,user_id,comment) VALUES($1,$2,$3)`,[id,u.id,c]);red(res,`/reel?id=${id}`);return
}

if(path==='/explore'){
const r=await feed(u);html(res,200,'کاوش',`<div class="card"><h2>🌍 کاوش</h2><a href="/hashtags"><button>#️⃣ هشتگ‌ها</button></a></div>`+(await Promise.all(r.rows.map(x=>postCard(x,u)))).join(''),u);return
}

if(path==='/hashtags'){
const r=await q(`SELECT h.tag,(SELECT COUNT(*) FROM hashtag_posts p WHERE p.hashtag_id=h.id)::int posts,(SELECT COUNT(*) FROM hashtag_reels x WHERE x.hashtag_id=h.id)::int reels FROM hashtags h ORDER BY h.tag LIMIT 100`);
html(res,200,'هشتگ‌ها',`<div class="card"><form><input name="tag" placeholder="#هشتگ"><button class="full">جستجو</button></form></div>`+r.rows.map(x=>`<div class="card"><a href="/hashtag?tag=${encodeURIComponent(x.tag)}"><b>#${esc(x.tag)}</b></a><div class="small">${x.posts} پست · ${x.reels} Reels</div></div>`).join(''),u);return
}

if(path==='/hashtag'){
const tag=trim(url.searchParams.get('tag'),100).replace(/^#/,'').toLowerCase();
const r=await q(`SELECT p.*,x.name,x.email,x.avatar_url,x.is_verified,(SELECT COUNT(*) FROM likes l WHERE l.post_id=p.id)::int like_count,(SELECT COUNT(*) FROM comments c WHERE c.post_id=p.id)::int comment_count,(SELECT COUNT(*) FROM shares s WHERE s.post_id=p.id)::int share_count,(SELECT COUNT(*) FROM post_views v WHERE v.post_id=p.id)::int view_count FROM hashtag_posts hp JOIN hashtags h ON h.id=hp.hashtag_id JOIN posts p ON p.id=hp.post_id JOIN users x ON x.id=p.user_id WHERE h.tag=$1 ORDER BY p.created_at DESC LIMIT 100`,[tag]);
html(res,200,'هشتگ',`<div class="card"><h2>#${esc(tag)}</h2></div>`+(await Promise.all(r.rows.map(x=>postCard(x,u)))).join('')||'<div class="card empty">پستی نیست.</div>',u);return
}

if(path==='/saved'||path==='/bookmarks'){
const r=await q(`SELECT p.*,x.name,x.email,x.avatar_url,x.is_verified,(SELECT COUNT(*) FROM likes l WHERE l.post_id=p.id)::int like_count,(SELECT COUNT(*) FROM comments c WHERE c.post_id=p.id)::int comment_count,(SELECT COUNT(*) FROM shares s WHERE s.post_id=p.id)::int share_count,(SELECT COUNT(*) FROM post_views v WHERE v.post_id=p.id)::int view_count,TRUE bookmarked FROM bookmarks b JOIN posts p ON p.id=b.post_id JOIN users x ON x.id=p.user_id WHERE b.user_id=$1 ORDER BY b.created_at DESC`,[u.id]);
html(res,200,'ذخیره‌ها',(await Promise.all(r.rows.map(x=>postCard(x,u)))).join('')||'<div class="card empty">پستی ذخیره نکرده‌اید.</div>',u);return
}

if(path==='/collections'&&req.method==='GET'){
const r=await q(`SELECT c.*,COUNT(i.post_id)::int items FROM collections c LEFT JOIN collection_items i ON i.collection_id=c.id WHERE c.user_id=$1 GROUP BY c.id ORDER BY c.created_at DESC`,[u.id]);
html(res,200,'مجموعه‌ها',`<div class="card"><form method="POST"><input name="name" maxlength="100" placeholder="نام مجموعه" required><button class="full">➕ ساخت</button></form></div>`+r.rows.map(x=>`<div class="card"><b>📚 ${esc(x.name)}</b><div class="small">${x.items} پست</div><a href="/collection?id=${x.id}"><button>مشاهده</button></a></div>`).join('')||'<div class="card empty">مجموعه‌ای ندارید.</div>',u);return
}

if(path==='/collections'&&req.method==='POST'){
const d=await body(req),name=trim(d.get('name'),100);if(name)await q(`INSERT INTO collections(user_id,name) VALUES($1,$2) ON CONFLICT DO NOTHING`,[u.id,name]);red(res,'/collections');return
}

if(path==='/collection'){
const id=int(url.searchParams.get('id'));const c=await q(`SELECT * FROM collections WHERE id=$1 AND user_id=$2`,[id,u.id]);
if(!c.rows.length){html(res,404,'مجموعه','<div class="card empty">مجموعه پیدا نشد.</div>',u);return}
const r=await q(`SELECT p.*,x.name FROM collection_items i JOIN posts p ON p.id=i.post_id JOIN users x ON x.id=p.user_id WHERE i.collection_id=$1 ORDER BY p.created_at DESC`,[id]);
html(res,200,'مجموعه',`<div class="card"><h2>📚 ${esc(c.rows[0].name)}</h2></div>`+r.rows.map(x=>`<div class="card"><b>${esc(x.name)}</b><div class="text">${esc(x.content)}</div></div>`).join('')||'<div class="card empty">خالی است.</div>',u);return
}

if(path==='/archive'||path==='/pin'){
const id=int(url.searchParams.get('id'));const field=path==='/archive'?'archived':'pinned';
if(id)await q(`UPDATE posts SET ${field}=NOT COALESCE(${field},FALSE) WHERE id=$1 AND user_id=$2`,[id,u.id]);
red(res,'/profile');return
}

if(path==='/archived'){
const r=await q(`SELECT p.*,x.name FROM posts p JOIN users x ON x.id=p.user_id WHERE p.user_id=$1 AND p.archived=TRUE ORDER BY p.created_at DESC`,[u.id]);
html(res,200,'آرشیو',r.rows.map(x=>`<div class="card"><b>${esc(x.name)}</b><div class="text">${esc(x.content)}</div><a href="/archive?id=${x.id}"><button>↩️ بازگردانی</button></a></div>`).join('')||'<div class="card empty">آرشیو خالی است.</div>',u);return
}

if(path==='/jobs'&&req.method==='GET'){
const s=trim(url.searchParams.get('q'),255),r=s?await q(`SELECT j.*,x.name FROM jobs j JOIN users x ON x.id=j.user_id WHERE j.title ILIKE $1 OR j.city ILIKE $1 OR j.description ILIKE $1 ORDER BY j.created_at DESC LIMIT 100`,[`%${s}%`]):await q(`SELECT j.*,x.name FROM jobs j JOIN users x ON x.id=j.user_id ORDER BY j.created_at DESC LIMIT 100`);
html(res,200,'کاریابی',`<div class="card"><form><input name="q" value="${attr(s)}" placeholder="شغل یا شهر"><button class="full">🔎 جستجو</button></form><a href="/new-job"><button class="full green">➕ ثبت آگهی</button></a></div>`+r.rows.map(j=>`<div class="job"><b>${esc(j.title)}</b><div>📍 ${esc(j.city)}</div><div>💰 ${esc(j.salary)}</div><div class="text">${esc(j.description)}</div><div class="small">${esc(j.name)}</div>${j.user_id===u.id?`<a href="/delete-job?id=${j.id}"><button class="danger">حذف</button></a>`:''}</div>`).join('')||'<div class="card empty">آگهی‌ای نیست.</div>',u);return
}

if(path==='/new-job'&&req.method==='GET'){
html(res,200,'ثبت آگهی',`<div class="card"><form method="POST"><input name="title" maxlength="200" placeholder="عنوان شغل" required><input name="city" maxlength="100" placeholder="شهر" required><input name="salary" maxlength="200" placeholder="حقوق" required><textarea name="description" maxlength="5000" required placeholder="توضیحات"></textarea><button class="full green">انتشار</button></form></div>`,u);return
}

if(path==='/new-job'&&req.method==='POST'){
const d=await body(req),a=trim(d.get('title'),200),b=trim(d.get('city'),100),c=trim(d.get('salary'),200),x=trim(d.get('description'),5000);
if(a&&b&&c&&x)await q(`INSERT INTO jobs(user_id,title,city,salary,description) VALUES($1,$2,$3,$4,$5)`,[u.id,a,b,c,x]);red(res,'/jobs');return
}

if(path==='/delete-job'){
const id=int(url.searchParams.get('id'));if(id)await q(`DELETE FROM jobs WHERE id=$1 AND user_id=$2`,[id,u.id]);red(res,'/jobs');return
}

if(path==='/report'&&req.method==='GET'){
const post=int(url.searchParams.get('post')),uid=int(url.searchParams.get('user'));
html(res,200,'گزارش',`<div class="card"><form method="POST"><input type="hidden" name="post_id" value="${post||''}"><input type="hidden" name="reported_user_id" value="${uid||''}"><textarea name="reason" maxlength="1000" required placeholder="دلیل گزارش"></textarea><button class="full danger">🚩 ارسال گزارش</button></form></div>`,u);return
}

if(path==='/report'&&req.method==='POST'){
const d=await body(req),post=int(d.get('post_id')),uid=int(d.get('reported_user_id')),reason=trim(d.get('reason'),1000);
if(reason&&(post||uid))await q(`INSERT INTO reports(reporter_id,reported_user_id,post_id,reason) VALUES($1,$2,$3,$4)`,[u.id,uid||null,post||null,reason]);
html(res,200,'گزارش ثبت شد','<div class="card success">گزارش شما ثبت شد ✅<a href="/"><button class="full">خانه</button></a></div>',u);return
}

if(path==='/settings'&&req.method==='GET'){
const r=await q(`SELECT * FROM user_settings WHERE user_id=$1`,[u.id]),s=r.rows[0]||{};
html(res,200,'تنظیمات',`<div class="card"><div class="head">${avatar(u)}<div><div class="name">${esc(u.name)}</div><div class="small">${esc(u.email)}</div></div></div><form method="POST"><input name="name" maxlength="100" value="${attr(u.name)}" required><textarea name="bio" maxlength="1000" placeholder="درباره من">${esc(u.bio||'')}</textarea><label><input type="checkbox" name="private" ${s.is_private?'checked':''}> حساب خصوصی</label><label><input type="checkbox" name="activity" ${s.show_activity!==false?'checked':''}> نمایش فعالیت</label><label><input type="checkbox" name="notify" ${s.notifications_enabled!==false?'checked':''}> اعلان‌ها</label><select name="account_type"><option value="personal">شخصی</option><option value="creator">سازنده</option><option value="business">کسب‌وکار</option></select><button class="full">💾 ذخیره</button></form></div><div class="card"><div class="menu"><a href="/password"><button>🔐 تغییر رمز</button></a><a href="/privacy"><button>🛡️ حریم خصوصی</button></a><a href="/analytics"><button>📊 آمار</button></a><a href="/creator"><button>💰 درآمدزایی</button></a><a href="/ads"><button>📢 تبلیغات</button></a><a href="/subscriptions"><button>⭐ اشتراک‌ها</button></a></div></div>`,u);return
}

if(path==='/settings'&&req.method==='POST'){
const d=await body(req),name=trim(d.get('name'),100),bio=trim(d.get('bio'),1000),type=['personal','creator','business'].includes(d.get('account_type'))?d.get('account_type'):'personal';
if(name)await q(`UPDATE users SET name=$1,bio=$2,account_type=$3 WHERE id=$4`,[name,bio,type,u.id]);
await q(`INSERT INTO user_settings(user_id,is_private,show_activity,notifications_enabled) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET is_private=EXCLUDED.is_private,show_activity=EXCLUDED.show_activity,notifications_enabled=EXCLUDED.notifications_enabled,updated_at=CURRENT_TIMESTAMP`,[u.id,d.has('private'),d.has('activity'),d.has('notify')]);
red(res,'/settings');return
}

if(path==='/privacy'){
if(req.method==='GET'){
const r=await q(`SELECT * FROM user_settings WHERE user_id=$1`,[u.id]),s=r.rows[0]||{};
html(res,200,'حریم خصوصی',`<div class="card"><form method="POST"><label><input type="checkbox" name="private" ${s.is_private?'checked':''}> حساب خصوصی</label><label><input type="checkbox" name="story" ${s.allow_story_replies!==false?'checked':''}> پاسخ استوری</label><select name="messages"><option value="everyone">پیام از همه</option><option value="followers" ${s.message_policy==='followers'?'selected':''}>فقط دنبال‌کنندگان</option></select><button class="full">ذخیره</button></form></div>`,u);return}
const d=await body(req);
await q(`INSERT INTO user_settings(user_id,is_private,allow_story_replies,message_policy) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET is_private=EXCLUDED.is_private,allow_story_replies=EXCLUDED.allow_story_replies,message_policy=EXCLUDED.message_policy,updated_at=CURRENT_TIMESTAMP`,[u.id,d.has('private'),d.has('story'),d.get('messages')==='followers'?'followers':'everyone']);
red(res,'/privacy');return
}

if(path==='/password'){
if(req.method==='GET'){html(res,200,'تغییر رمز',`<div class="card"><form method="POST"><input name="old" type="password" placeholder="رمز فعلی" required><input name="nw" type="password" minlength="6" placeholder="رمز جدید" required><button class="full">تغییر رمز</button></form></div>`,u);return}
const d=await body(req),old=String(d.get('old')||''),nw=String(d.get('nw')||''),r=await q(`SELECT password FROM users WHERE id=$1`,[u.id]);
if(!r.rows.length||hash(old)!==r.rows[0].password||nw.length<6){html(res,400,'خطا','<div class="card error">رمز فعلی اشتباه است یا رمز جدید کوتاه است.</div>',u);return}
await q(`UPDATE users SET password=$1 WHERE id=$2`,[hash(nw),u.id]);await q(`DELETE FROM sessions WHERE user_id=$1`,[u.id]);
html(res,200,'موفق','<div class="card success">رمز تغییر کرد. دوباره وارد شوید.</div>');return
}

if(path==='/analytics'){
const [p,r,f,v,l,c]=await Promise.all([
q(`SELECT COUNT(*) n FROM posts WHERE user_id=$1`,[u.id]),
q(`SELECT COUNT(*) n FROM reels WHERE user_id=$1`,[u.id]),
q(`SELECT COUNT(*) n FROM follows WHERE following_id=$1`,[u.id]),
q(`SELECT COUNT(*) n FROM profile_visits WHERE profile_id=$1`,[u.id]),
q(`SELECT COALESCE(SUM(like_count),0) n FROM (SELECT COUNT(*) like_count FROM likes WHERE post_id IN(SELECT id FROM posts WHERE user_id=$1) GROUP BY post_id)x`,[u.id]),
q(`SELECT COUNT(*) n FROM stories WHERE user_id=$1`,[u.id])
]);
html(res,200,'آمار',`<div class="card"><h2>📊 داشبورد حرفه‌ای</h2><div class="stats">📝 پست ${p.rows[0].n} · 🎬 Reels ${r.rows[0].n} · 👥 دنبال‌کننده ${f.rows[0].n} · 👀 بازدید پروفایل ${v.rows[0].n} · ❤️ لایک ${l.rows[0].n} · 📖 استوری ${c.rows[0].n}</div></div>`,u);return
}

if(path==='/ads'){
if(req.method==='GET'){
const r=await q(`SELECT a.*,(SELECT COUNT(*) FROM ad_events e WHERE e.ad_id=a.id AND e.event_type='impression') impressions,(SELECT COUNT(*) FROM ad_events e WHERE e.ad_id=a.id AND e.event_type='click') clicks FROM ads a WHERE a.user_id=$1 ORDER BY a.created_at DESC`,[u.id]);
html(res,200,'تبلیغات',`<div class="card"><h2>📢 مدیریت تبلیغات</h2><p class="small">این بخش مدیریت کمپین و ثبت رویداد است. پرداخت واقعی باید به درگاه قانونی متصل شود.</p><form method="POST"><input name="title" maxlength="200" placeholder="عنوان تبلیغ" required><textarea name="body" maxlength="2000" placeholder="متن"></textarea><input name="media_url" maxlength="4000" placeholder="لینک رسانه"><input name="target_url" maxlength="4000" placeholder="لینک مقصد"><input name="budget" type="number" min="0" step="0.01" placeholder="بودجه"><button class="full green">➕ ساخت کمپین</button></form></div>`+r.rows.map(a=>`<div class="card"><b>${esc(a.title)}</b><div>${esc(a.body)}</div><div class="stats">👁 ${a.impressions} · 🖱 ${a.clicks} · بودجه ${a.budget} · ${esc(a.status)}</div><div class="actions"><a href="/ad-toggle?id=${a.id}"><button>${a.status==='active'?'⏸ توقف':'▶️ فعال'}</button></a><a href="/ad-delete?id=${a.id}"><button class="danger">حذف</button></a></div></div>`).join('')||'<div class="card empty">کمپینی ندارید.</div>',u);return
}
const d=await body(req),title=trim(d.get('title'),200),b=trim(d.get('body'),2000),media=trim(d.get('media_url'),4000),target=trim(d.get('target_url'),4000),budget=Math.max(0,Number(d.get('budget')||0));
if(title)await q(`INSERT INTO ads(user_id,title,body,media_url,target_url,budget) VALUES($1,$2,$3,$4,$5,$6)`,[u.id,title,b,media||null,target||null,budget]);red(res,'/ads');return
}

if(path==='/ad-toggle'){
const id=int(url.searchParams.get('id'));if(id)await q(`UPDATE ads SET status=CASE WHEN status='active' THEN 'paused' ELSE 'active' END WHERE id=$1 AND user_id=$2`,[id,u.id]);red(res,'/ads');return
}

if(path==='/ad-delete'){
const id=int(url.searchParams.get('id'));if(id)await q(`DELETE FROM ads WHERE id=$1 AND user_id=$2`,[id,u.id]);red(res,'/ads');return
}

if(path==='/ad-click'){
const id=int(url.searchParams.get('id')),r=await q(`SELECT target_url FROM ads WHERE id=$1 AND status='active'`,[id]);
if(r.rows.length){await q(`INSERT INTO ad_events(ad_id,user_id,event_type) VALUES($1,$2,'click')`,[id,u.id]);red(res,r.rows[0].target_url||'/ads')}else red(res,'/');return
}

if(path==='/creator'){
if(req.method==='GET'){
await q(`INSERT INTO creator_accounts(user_id) VALUES($1) ON CONFLICT DO NOTHING`,[u.id]);
const a=await q(`SELECT * FROM creator_accounts WHERE user_id=$1`,[u.id]),t=await q(`SELECT * FROM creator_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30`,[u.id]),p=await q(`SELECT * FROM creator_payouts WHERE user_id=$1 ORDER BY created_at DESC`,[u.id]);
html(res,200,'درآمدزایی',`<div class="card"><h2>💰 مرکز درآمدزایی</h2><div class="stats">موجودی ${a.rows[0].balance} · کل درآمد ${a.rows[0].lifetime_earned}</div><p class="small">دفتر حساب داخلی است و برای پرداخت واقعی نیاز به درگاه و احراز هویت پرداخت دارد.</p><form method="POST" action="/creator-earn"><input name="amount" type="number" min="0.01" step="0.01" placeholder="مبلغ درآمد"><input name="description" maxlength="200" placeholder="توضیح"><button class="full green">ثبت درآمد</button></form><form method="POST" action="/creator-payout"><input name="amount" type="number" min="0.01" step="0.01" placeholder="مبلغ برداشت"><button class="full">💸 درخواست برداشت</button></form></div><div class="card"><h3>تراکنش‌ها</h3>${t.rows.map(x=>`<div class="comment">${esc(x.type)} · ${x.amount} · ${esc(x.description||'')}</div>`).join('')||'بدون تراکنش'}</div><div class="card"><h3>برداشت‌ها</h3>${p.rows.map(x=>`<div class="comment">${x.amount} · ${esc(x.status)}</div>`).join('')||'بدون درخواست'}</div>`,u);return
}
}

if(path==='/creator-earn'&&req.method==='POST'){
const d=await body(req),a=Number(d.get('amount')||0),desc=trim(d.get('description'),200);
if(a>0){await q(`INSERT INTO creator_accounts(user_id,balance,lifetime_earned) VALUES($1,$2,$2) ON CONFLICT(user_id) DO UPDATE SET balance=creator_accounts.balance+$2,lifetime_earned=creator_accounts.lifetime_earned+$2,updated_at=CURRENT_TIMESTAMP`,[u.id,a]);await q(`INSERT INTO creator_transactions(user_id,type,amount,description) VALUES($1,'earning',$2,$3)`,[u.id,a,desc])}
red(res,'/creator');return
}

if(path==='/creator-payout'&&req.method==='POST'){
const d=await body(req),a=Number(d.get('amount')||0),r=await q(`SELECT balance FROM creator_accounts WHERE user_id=$1`,[u.id]);
if(a>0&&r.rows[0]&&Number(r.rows[0].balance)>=a){await q(`UPDATE creator_accounts SET balance=balance-$1 WHERE user_id=$2`,[a,u.id]);await q(`INSERT INTO creator_payouts(user_id,amount) VALUES($1,$2)`,[u.id,a]);await q(`INSERT INTO creator_transactions(user_id,type,amount,description,status) VALUES($1,'payout',$2,'درخواست برداشت','pending')`,[u.id,-a])}
red(res,'/creator');return
}

if(path==='/subscriptions'){
if(req.method==='GET'){
const plans=await q(`SELECT p.*,x.name creator_name FROM subscription_plans p JOIN users x ON x.id=p.creator_id WHERE p.active=TRUE ORDER BY p.created_at DESC LIMIT 100`);
html(res,200,'اشتراک‌ها',`<div class="card"><h2>⭐ اشتراک سازندگان</h2><form method="POST"><input name="name" maxlength="100" placeholder="نام پلن" required><input name="price" type="number" min="0" step="0.01" placeholder="قیمت ماهانه" required><textarea name="description" maxlength="500" placeholder="توضیحات"></textarea><button class="full green">➕ ساخت پلن</button></form></div>`+plans.rows.map(p=>`<div class="card"><b>⭐ ${esc(p.name)}</b><div>${esc(p.description)}</div><div>💰 ${p.price}</div><div class="small">سازنده: ${esc(p.creator_name)}</div><a href="/subscribe?plan=${p.id}"><button class="full">اشتراک</button></a></div>`).join('')||'<div class="card empty">پلنی وجود ندارد.</div>',u);return
}
const d=await body(req),name=trim(d.get('name'),100),price=Math.max(0,Number(d.get('price')||0)),desc=trim(d.get('description'),500);
if(name)await q(`INSERT INTO subscription_plans(creator_id,name,price,description) VALUES($1,$2,$3,$4)`,[u.id,name,price,desc]);red(res,'/subscriptions');return
}

if(path==='/subscribe'){
const plan=int(url.searchParams.get('plan'));const r=await q(`SELECT * FROM subscription_plans WHERE id=$1 AND active=TRUE`,[plan]);
if(!r.rows.length||r.rows[0].creator_id===u.id){red(res,'/subscriptions');return}
await q(`INSERT INTO creator_subscriptions(creator_id,subscriber_id,amount) VALUES($1,$2,$3) ON CONFLICT(creator_id,subscriber_id) DO UPDATE SET amount=EXCLUDED.amount,status='active'`,[r.rows[0].creator_id,u.id,r.rows[0].price]);
await note(r.rows[0].creator_id,u.id,'subscription',null,`${u.name} مشترک شما شد.`);
html(res,200,'اشتراک فعال شد','<div class="card success">اشتراک داخلی فعال شد ✅</div>',u);return
}

if(path==='/verify'){
if(req.method==='GET'){html(res,200,'تأیید حساب',`<div class="card"><p>درخواست نشان تأیید حساب ثبت می‌شود و نیازمند بررسی مدیر است.</p><form method="POST"><textarea name="note" maxlength="1000" placeholder="توضیح"></textarea><button class="full blue">درخواست تأیید</button></form></div>`,u);return}
const d=await body(req);await q(`INSERT INTO verification_requests(user_id,note) VALUES($1,$2)`,[u.id,trim(d.get('note'),1000)]);html(res,200,'درخواست ثبت شد','<div class="card success">درخواست تأیید ثبت شد ✅</div>',u);return
}

if(path==='/follow-requests'){
const r=await q(`SELECT f.id,x.id requester_id,x.name,x.email FROM follow_requests f JOIN users x ON x.id=f.requester_id WHERE f.target_id=$1 AND f.status='pending' ORDER BY f.created_at DESC`,[u.id]);
html(res,200,'درخواست‌ها',r.rows.map(x=>`<div class="card"><b>${esc(x.name)}</b><div class="actions"><a href="/follow-request-action?id=${x.id}&action=accept"><button class="green">قبول</button></a><a href="/follow-request-action?id=${x.id}&action=reject"><button class="danger">رد</button></a></div></div>`).join('')||'<div class="card empty">درخواستی ندارید.</div>',u);return
}

if(path==='/follow-request-action'){
const id=int(url.searchParams.get('id')),a=url.searchParams.get('action')==='accept'?'accept':'reject',r=await q(`SELECT requester_id FROM follow_requests WHERE id=$1 AND target_id=$2 AND status='pending'`,[id,u.id]);
if(r.rows.length){if(a==='accept')await q(`INSERT INTO follows(follower_id,following_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[r.rows[0].requester_id,u.id]);await q(`UPDATE follow_requests SET status=$1 WHERE id=$2`,[a,id])}
red(res,'/follow-requests');return
}

if(path==='/account'){
html(res,200,'مرکز امکانات',`<div class="card menu"><a href="/profile"><button>👤 پروفایل</button></a><a href="/stories"><button>📖 استوری</button></a><a href="/highlights"><button>⭐ هایلایت</button></a><a href="/reels"><button>🎬 Reels</button></a><a href="/explore"><button>🌍 کاوش</button></a><a href="/hashtags"><button>#️⃣ هشتگ</button></a><a href="/collections"><button>📚 مجموعه‌ها</button></a><a href="/archived"><button>🗄️ آرشیو</button></a><a href="/follow-requests"><button>👥 درخواست‌های فالو</button></a><a href="/analytics"><button>📊 آمار</button></a><a href="/ads"><button>📢 تبلیغات</button></a><a href="/creator"><button>💰 درآمدزایی</button></a><a href="/subscriptions"><button>⭐ اشتراک</button></a><a href="/verify"><button>✅ تأیید حساب</button></a><a href="/privacy"><button>🛡️ حریم خصوصی</button></a></div>`,u);return
}

if(path==='/highlights'){
if(req.method==='GET'){
const h=await q(`SELECT * FROM highlights WHERE user_id=$1 ORDER BY created_at DESC`,[u.id]);
html(res,200,'هایلایت',`<div class="card"><form method="POST"><input name="title" maxlength="100" placeholder="نام هایلایت" required><input name="story_id" type="number" placeholder="شناسه استوری اختیاری"><button class="full">➕ ساخت</button></form></div>`+h.rows.map(x=>`<div class="card">⭐ ${esc(x.title)} <a href="/highlight?id=${x.id}"><button>مشاهده</button></a></div>`).join('')||'<div class="card empty">هایلایتی ندارید.</div>',u);return
}
const d=await body(req),title=trim(d.get('title'),100),sid=int(d.get('story_id'));
if(title){const r=await q(`INSERT INTO highlights(user_id,title) VALUES($1,$2) RETURNING id`,[u.id,title]);if(sid)await q(`INSERT INTO highlight_items(highlight_id,story_id) SELECT $1,id FROM stories WHERE id=$2 AND user_id=$3 ON CONFLICT DO NOTHING`,[r.rows[0].id,sid,u.id])}
red(res,'/highlights');return
}

if(path==='/highlight'){
const id=int(url.searchParams.get('id')),h=await q(`SELECT * FROM highlights WHERE id=$1 AND user_id=$2`,[id,u.id]);
if(!h.rows.length){html(res,404,'هایلایت','<div class="card empty">پیدا نشد.</div>',u);return}
const r=await q(`SELECT s.* FROM highlight_items i JOIN stories s ON s.id=i.story_id WHERE i.highlight_id=$1 ORDER BY s.created_at DESC`,[id]);
html(res,200,'هایلایت',`<div class="card"><h2>⭐ ${esc(h.rows[0].title)}</h2></div>`+r.rows.map(x=>`<div class="card">${x.media_url?(x.media_type==='video'?`<video controls class="postimg" src="${attr(x.media_url)}"></video>`:`<img class="postimg" src="${attr(x.media_url)}">`):''}<div class="text">${esc(x.text)}</div></div>`).join('')||'<div class="card empty">خالی است.</div>',u);return
}

if(path==='/call'&&req.method==='GET'){
const peer=int(url.searchParams.get('user')),mode=url.searchParams.get('mode')==='video'?'video':'audio';
if(!peer||peer===u.id){red(res,'/calls');return}
const r=await q(`SELECT id,name FROM users WHERE id=$1`,[peer]);
if(!r.rows.length||await blocked(u.id,peer)){html(res,403,'تماس','<div class="card error">امکان تماس وجود ندارد.</div>',u);return}
const cid=token(16);
const js=`<script>
const peerId=${peer},callId=${JSON.stringify(cid)},mode=${JSON.stringify(mode)};
let pc=null,stream=null,closed=false,polling=false;
async function signal(t,p){const r=await fetch('/call-signal',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({receiver_id:String(peerId),call_id:callId,type:t,payload:JSON.stringify(p||{})})});if(!r.ok)throw Error('signal')}
async function media(){stream=await navigator.mediaDevices.getUserMedia({audio:true,video:mode==='video'});local.srcObject=stream}
async function peer(){pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]});stream?.getTracks().forEach(t=>pc.addTrack(t,stream));pc.ontrack=e=>{if(e.streams[0])remote.srcObject=e.streams[0]};pc.onicecandidate=e=>e.candidate&&signal('ice',e.candidate).catch(()=>{})}
async function start(){try{status.textContent='درخواست دسترسی...';await media();await peer();const o=await pc.createOffer();await pc.setLocalDescription(o);await signal('offer',o);status.textContent='در انتظار پاسخ...';poll()}catch(e){status.textContent='دسترسی به میکروفن یا دوربین ممکن نیست.'}}
async function accept(o){await media();await peer();await pc.setRemoteDescription(new RTCSessionDescription(o));const a=await pc.createAnswer();await pc.setLocalDescription(a);await signal('answer',a);status.textContent='تماس برقرار است.'}
async function poll(){if(closed||polling)return;polling=true;try{const r=await fetch('/call-signals?call_id='+encodeURIComponent(callId),{cache:'no-store'});if(r.ok)for(const x of await r.json()){let p={};try{p=JSON.parse(x.payload||'{}')}catch{}if(x.type==='offer'&&!pc)await accept(p);else if(x.type==='answer'&&pc)await pc.setRemoteDescription(new RTCSessionDescription(p));else if(x.type==='ice'&&pc)await pc.addIceCandidate(new RTCIceCandidate(p)).catch(()=>{})}}catch(e){}finally{polling=false;if(!closed)setTimeout(poll,1000)}}
function hangup(){closed=true;stream?.getTracks().forEach(t=>t.stop());pc?.close();location.href='/user?id='+peerId}
</script>`;
html(res,200,mode==='video'?'تماس تصویری':'تماس صوتی',`<div class="card"><h2>📞 تماس با ${esc(r.rows[0].name)}</h2><p id="status">آماده تماس...</p><video id="remote" class="video" autoplay playsinline></video><video id="local" class="video" autoplay muted playsinline></video><div class="actions"><button onclick="start()">▶️ شروع</button><button class="danger" onclick="hangup()">⛔ پایان</button></div></div>${js}`,u);return
}

if(path==='/calls'){
html(res,200,'تماس',`<div class="card"><h2>📞 تماس صوتی و تصویری</h2><p>برای تماس از پروفایل یا گفتگو استفاده کنید.</p><a href="/search"><button class="full">🔎 پیدا کردن کاربر</button></a></div>`,u);return
}

if(path==='/call-signal'&&req.method==='POST'){
const d=await body(req),receiver=int(d.get('receiver_id')),cid=trim(d.get('call_id'),100),type=trim(d.get('type'),20),payload=String(d.get('payload')||'');
if(!receiver||receiver===u.id||!cid||!['offer','answer','ice'].includes(type)||payload.length>500000||await blocked(u.id,receiver)){send(res,403,JSON.stringify({ok:false}),'application/json');return}
await q(`INSERT INTO call_signals(caller_id,receiver_id,call_id,type,payload) VALUES($1,$2,$3,$4,$5)`,[u.id,receiver,cid,type,payload]);
send(res,200,JSON.stringify({ok:true}),'application/json');return
}

if(path==='/call-signals'&&req.method==='GET'){
const cid=trim(url.searchParams.get('call_id'),100);
const r=await q(`SELECT id,type,payload FROM call_signals WHERE receiver_id=$1 AND call_id=$2 AND consumed=FALSE ORDER BY id LIMIT 50`,[u.id,cid]);
if(r.rows.length)await q(`UPDATE call_signals SET consumed=TRUE WHERE id=ANY($1::int[])`,[r.rows.map(x=>x.id)]);
send(res,200,JSON.stringify(r.rows),'application/json');return
}

html(res,404,'404','<div class="card empty"><h2>404</h2><a href="/"><button>🏠 خانه</button></a></div>',u)

}catch(e){
console.error('SERVER ERROR:',e);
if(!res.headersSent)html(res,500,'خطای سرور','<div class="card error"><h2>خطای داخلی سرور</h2><p>لطفاً دوباره تلاش کنید.</p></div>')
}});

async function start(){
try{
await tables();
await q('SELECT 1');
server.listen(PORT,'0.0.0.0',()=>console.log(`Server running on port ${PORT}`))
}catch(e){
console.error('STARTUP ERROR:',e);
process.exit(1)
}}

process.on('SIGTERM',async()=>{await pool.end();process.exit(0)});
process.on('SIGINT',async()=>{await pool.end();process.exit(0)});
start();
