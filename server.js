require("dotenv").config();
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const UPLOAD_DIR = path.join(ROOT, "uploads");
const MAX_UPLOAD_MB = Math.max(5, Number(process.env.MAX_UPLOAD_MB || 30));
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "pallavi.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
 email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'artist', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS releases (
 id INTEGER PRIMARY KEY AUTOINCREMENT, artist_id INTEGER NOT NULL,
 title TEXT NOT NULL, primary_artist TEXT NOT NULL, language TEXT NOT NULL,
 release_date TEXT, audio_file TEXT NOT NULL, cover_file TEXT NOT NULL,
 notes TEXT, status TEXT NOT NULL DEFAULT 'Pending', admin_note TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(artist_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS cid_requests (
 id INTEGER PRIMARY KEY AUTOINCREMENT, artist_id INTEGER NOT NULL,
 release_id INTEGER, track_title TEXT NOT NULL, rights_confirmed INTEGER NOT NULL DEFAULT 0,
 evidence_note TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Pending', admin_note TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(artist_id) REFERENCES users(id), FOREIGN KEY(release_id) REFERENCES releases(id)
);
CREATE TABLE IF NOT EXISTS royalties (
 id INTEGER PRIMARY KEY AUTOINCREMENT, artist_id INTEGER NOT NULL,
 period TEXT NOT NULL, platform TEXT NOT NULL, amount_cents INTEGER NOT NULL DEFAULT 0,
 currency TEXT NOT NULL DEFAULT 'INR', reference_note TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(artist_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS payout_requests (
 id INTEGER PRIMARY KEY AUTOINCREMENT, artist_id INTEGER NOT NULL,
 amount_cents INTEGER NOT NULL, method TEXT NOT NULL, payout_details TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'Requested', admin_note TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(artist_id) REFERENCES users(id)
);
`);

const adminEmail = (process.env.ADMIN_EMAIL || "admin@pallavidigitalmedia.com").toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD || "ChangeThisPasswordBeforeStarting123!";
if (!db.prepare("SELECT id FROM users WHERE email=?").get(adminEmail)) {
  db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'admin')")
    .run("Pallavi Digital Media Admin", adminEmail, bcrypt.hashSync(adminPassword, 12));
  console.log("Created admin account:", adminEmail);
  if (!process.env.ADMIN_PASSWORD) console.warn("Set ADMIN_PASSWORD in .env before production use.");
}

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: false, limit: "40kb" }));
app.use(express.json({ limit: "40kb" }));
app.use(session({
 store: new SQLiteStore({ db: "sessions.sqlite", dir: DATA_DIR }),
 secret: process.env.SESSION_SECRET || "development-only-change-this-secret",
 resave: false, saveUninitialized: false,
 cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 8*60*60*1000 }
}));

function esc(v="") { return String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function money(cents, currency="INR") {
  try { return new Intl.NumberFormat("en-IN",{style:"currency",currency}).format((Number(cents)||0)/100); }
  catch { return "₹" + ((Number(cents)||0)/100).toFixed(2); }
}
function token(req) { if(!req.session.csrf) req.session.csrf=crypto.randomBytes(24).toString("hex"); return req.session.csrf; }
function csrf(req) { return `<input type="hidden" name="_csrf" value="${token(req)}">`; }
function layout(title, body, user=null, notice="") {
  const nav = user ? `<a href="/dashboard">Dashboard</a>${user.role==="admin"?'<a href="/admin">Admin</a>':'<a href="/releases/new">Upload Song</a><a href="/content-id">Content ID</a><a href="/royalties">Royalties</a><a href="/payments">Payments</a>'}
    <form method="post" action="/logout" class="inline">${csrf(reqProxy(user))}<button class="navbtn">Log out</button></form>` : `<a href="/login">Login</a><a href="/register">Artist Registration</a>`;
  // csrf token is added below by replacing placeholder when a request-specific page is rendered.
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | Pallavi Digital Media</title><link rel="stylesheet" href="/style.css"></head><body>
  <header><a class="brand" href="/">PALLAVI <span>DIGITAL MEDIA</span><small>ARTIST & MUSIC PORTAL</small></a><nav>${nav}</nav></header>
  <main>${notice?`<div class="notice">${esc(notice)}</div>`:""}${body}</main><footer>© ${new Date().getFullYear()} Pallavi Digital Media · Artist Portal</footer></body></html>`;
  return html;
}
// Layout uses request-independent navigation except the logout token, set with a simple proxy token.
let csrfForNav = "";
function reqProxy(user) { return { session: { csrf: csrfForNav } }; }
function render(req,res,title,body,notice="") { csrfForNav = req.session.csrf || (req.session.csrf=crypto.randomBytes(24).toString("hex")); res.send(layout(title,body,req.session.user||null,notice)); }
function auth(req,res,next){ if(!req.session.user) return res.redirect("/login"); next(); }
function admin(req,res,next){ if(!req.session.user||req.session.user.role!=="admin") return res.status(403).send("Admin access required."); next(); }
function verifyCsrf(req,res,next) {
  if(req.method==="POST" && req.path!=="/login" && req.path!=="/register" && req.path!=="/releases") {
    if(!req.body || !req.body._csrf || req.body._csrf!==req.session.csrf) return res.status(403).send("Security check failed. Refresh and try again.");
  }
  next();
}
app.use(verifyCsrf);
app.get("/style.css",(req,res)=>res.type("text/css").send(fs.readFileSync(path.join(ROOT,"style.css"),"utf8")));

// Protect uploaded assets behind login. Only the artist who uploaded a release and admins can access them.
app.get("/asset/:filename", auth, (req,res) => {
 const file = path.basename(req.params.filename);
 const row = db.prepare("SELECT artist_id FROM releases WHERE audio_file=? OR cover_file=?").get(file,file);
 if(!row) return res.status(404).send("File not found.");
 if(req.session.user.role!=="admin" && row.artist_id!==req.session.user.id) return res.status(403).send("Access denied.");
 const full=path.join(UPLOAD_DIR,file);
 if(!fs.existsSync(full)) return res.status(404).send("File not found.");
 res.sendFile(full);
});

app.get("/",(req,res)=>{
 const body=`<section class="hero"><p class="eyebrow">MUSIC • ARTISTS • RELEASE MANAGEMENT</p><h1>Your music journey,<br><span>managed in one place.</span></h1><p class="lead">Pallavi Digital Media gives artists one place to submit music, follow internal release review, request Content ID assessment and view royalty records.</p><div class="actions">${req.session.user?'<a class="button" href="/dashboard">Open dashboard</a>':'<a class="button" href="/register">Register as an artist</a><a class="button secondary" href="/login">Login</a>'}</div></section>
 <section class="grid"><article class="card"><h3>Artist Portal</h3><p>Submit song details, audio and artwork for review.</p></article><article class="card"><h3>Admin Review</h3><p>Review releases and Content ID requests.</p></article><article class="card"><h3>Royalty & Payments</h3><p>View admin-entered royalty statements and request payouts.</p></article></section>
 <p class="disclaimer"><b>Important:</b> This portal tracks internal requests. It does not automatically deliver songs to streaming platforms or grant YouTube Content ID. Authorized distributor agreements, platform eligibility, actual royalty data and a payment provider are still required.</p>`;
 render(req,res,"Home",body);
});
app.get("/register",(req,res)=>render(req,res,"Artist Registration",`<section class="form-card"><h1>Artist Registration</h1><p>Create your artist account.</p><form method="post" action="/register"><label>Artist / Contact Name<input name="name" maxlength="80" required></label><label>Email<input type="email" name="email" maxlength="160" required></label><label>Password<input type="password" name="password" minlength="12" required autocomplete="new-password"><small>At least 12 characters.</small></label><button class="button">Create account</button></form><p>Already registered? <a href="/login">Login</a></p></section>`));
app.post("/register",async(req,res)=>{
 const name=String(req.body.name||"").trim(),email=String(req.body.email||"").trim().toLowerCase(),password=String(req.body.password||"");
 if(name.length<2||name.length>80||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<12||password.length>200) return res.status(400).send("Enter a valid name/email and a password of at least 12 characters.");
 try { const result=db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'artist')").run(name,email,await bcrypt.hash(password,12)); req.session.regenerate(err=>{if(err)return res.status(500).send("Session error.");req.session.user={id:Number(result.lastInsertRowid),name,email,role:"artist"};req.session.csrf=crypto.randomBytes(24).toString("hex");res.redirect("/dashboard");}); }
 catch(e){if(String(e.message).includes("UNIQUE"))return res.status(409).send("That email is already registered. <a href='/login'>Login</a>");console.error(e);res.status(500).send("Registration failed.");}
});
app.get("/login",(req,res)=>render(req,res,"Login",`<section class="form-card"><h1>Login</h1><form method="post" action="/login"><label>Email<input type="email" name="email" required autocomplete="username"></label><label>Password<input type="password" name="password" required autocomplete="current-password"></label><button class="button">Login</button></form><p>New artist? <a href="/register">Register</a></p></section>`));
app.post("/login",async(req,res)=>{
 const email=String(req.body.email||"").trim().toLowerCase(),password=String(req.body.password||"");
 const row=db.prepare("SELECT * FROM users WHERE email=?").get(email);
 if(!row||!(await bcrypt.compare(password,row.password_hash)))return res.status(401).send("Login unsuccessful. Check your email/password and try again.");
 req.session.regenerate(err=>{if(err)return res.status(500).send("Session error.");req.session.user={id:row.id,name:row.name,email:row.email,role:row.role};req.session.csrf=crypto.randomBytes(24).toString("hex");res.redirect("/dashboard");});
});
app.post("/logout",auth,(req,res)=>req.session.destroy(()=>res.redirect("/")));

const storage=multer.diskStorage({destination:(req,file,cb)=>cb(null,UPLOAD_DIR),filename:(req,file,cb)=>cb(null,`${Date.now()}-${crypto.randomBytes(8).toString("hex")}${path.extname(file.originalname).toLowerCase()}`)});
const upload=multer({storage,limits:{fileSize:MAX_UPLOAD_MB*1024*1024,files:2},fileFilter:(req,file,cb)=>{
 const audio=["audio/mpeg","audio/wav","audio/x-wav","audio/flac","audio/mp4","audio/aac","audio/x-aac"];
 const image=["image/jpeg","image/png","image/webp"];
 const ok=file.fieldname==="audio"?audio.includes(file.mimetype):file.fieldname==="cover"?image.includes(file.mimetype):false;
 cb(ok?null:new Error("Unsupported file type. Audio: MP3/WAV/FLAC/AAC/M4A; cover: JPG/PNG/WebP."),ok);
}});
app.get("/dashboard",auth,(req,res)=>{
 const u=req.session.user;
 if(u.role==="admin")return res.redirect("/admin");
 const releases=db.prepare("SELECT * FROM releases WHERE artist_id=? ORDER BY id DESC").all(u.id);
 const total=db.prepare("SELECT COALESCE(SUM(amount_cents),0) AS total FROM royalties WHERE artist_id=?").get(u.id).total;
 const pending=db.prepare("SELECT COUNT(*) n FROM payout_requests WHERE artist_id=? AND status IN ('Requested','Under review')").get(u.id).n;
 const rows=releases.map(r=>`<tr><td>${esc(r.title)}<small>${esc(r.language)}</small></td><td>${esc(r.primary_artist)}</td><td><span class="status ${r.status.toLowerCase()}">${esc(r.status)}</span></td><td>${esc(r.created_at)}</td><td>${esc(r.admin_note||"—")}</td></tr>`).join("");
 render(req,res,"Artist Dashboard",`<div class="page-heading"><div><p class="eyebrow">ARTIST DASHBOARD</p><h1>Hello, ${esc(u.name)}</h1><p>Manage your music submissions and royalty records.</p></div><a class="button" href="/releases/new">+ Submit a song</a></div>
 <section class="stats"><div class="stat"><span>Total submissions</span><strong>${releases.length}</strong></div><div class="stat"><span>Royalty recorded</span><strong>${money(total)}</strong></div><div class="stat"><span>Open payout requests</span><strong>${pending}</strong></div></section>
 <section class="card"><h2>Your releases</h2><div class="table-wrap"><table><thead><tr><th>Release</th><th>Artist</th><th>Status</th><th>Submitted</th><th>Admin note</th></tr></thead><tbody>${rows||"<tr><td colspan='5'>No releases submitted yet.</td></tr>"}</tbody></table></div></section>
 <p class="disclaimer">An internal “Approved” status does not mean the track has been delivered to stores. Royalty totals appear only after an admin enters verified statements from the distributor.</p>`);
});
app.get("/releases/new",auth,(req,res)=>{
 if(req.session.user.role!=="artist")return res.redirect("/admin");
 render(req,res,"Submit a Song",`<section class="form-card wide"><h1>Submit a song</h1><p>Only submit music and artwork you own or are authorized to distribute.</p><form method="post" action="/releases" enctype="multipart/form-data">${csrf(req)}
 <label>Song / Album Title<input name="title" maxlength="120" required></label><label>Primary Artist Name<input name="primary_artist" maxlength="120" required></label><label>Language<input name="language" maxlength="60" placeholder="Bhojpuri, Hindi..." required></label><label>Planned Release Date<input type="date" name="release_date"></label>
 <label>Audio file (MP3/WAV/FLAC/AAC/M4A, max ${MAX_UPLOAD_MB} MB)<input type="file" name="audio" accept=".mp3,.wav,.flac,.aac,.m4a,audio/*" required></label><label>Cover artwork (JPG/PNG/WebP)<input type="file" name="cover" accept=".jpg,.jpeg,.png,.webp,image/*" required></label><label>Notes for admin<textarea name="notes" rows="3" maxlength="1000"></textarea></label><button class="button">Submit for review</button></form></section>`);
});
app.post("/releases",auth,(req,res)=>{
 if(req.session.user.role!=="artist")return res.redirect("/admin");
 upload.fields([{name:"audio",maxCount:1},{name:"cover",maxCount:1}])(req,res,err=>{
  if(err)return res.status(400).send(`Upload error: ${esc(err.message)} <a href="/releases/new">Try again</a>`);
  const audio=req.files?.audio?.[0],cover=req.files?.cover?.[0];
  if(!req.body._csrf||req.body._csrf!==req.session.csrf){for(const f of [audio,cover])if(f)fs.unlink(f.path,()=>{});return res.status(403).send("Security check failed. Refresh and try again.");}
  const title=String(req.body.title||"").trim(),artist=String(req.body.primary_artist||"").trim(),language=String(req.body.language||"").trim();
  if(!audio||!cover||!title||!artist||!language||title.length>120||artist.length>120||language.length>60){for(const f of [audio,cover])if(f)fs.unlink(f.path,()=>{});return res.status(400).send("Required details missing or too long. <a href='/releases/new'>Try again</a>");}
  db.prepare("INSERT INTO releases(artist_id,title,primary_artist,language,release_date,audio_file,cover_file,notes) VALUES(?,?,?,?,?,?,?,?)")
   .run(req.session.user.id,title,artist,language,req.body.release_date||null,audio.filename,cover.filename,String(req.body.notes||"").slice(0,1000));
  res.redirect("/dashboard");
 });
});

app.get("/content-id",auth,(req,res)=>{
 if(req.session.user.role!=="artist")return res.redirect("/admin");
 const releases=db.prepare("SELECT id,title FROM releases WHERE artist_id=? ORDER BY id DESC").all(req.session.user.id);
 const opts=releases.map(r=>`<option value="${r.id}">${esc(r.title)}</option>`).join("");
 const rows=db.prepare("SELECT * FROM cid_requests WHERE artist_id=? ORDER BY id DESC").all(req.session.user.id).map(r=>`<tr><td>${esc(r.track_title)}</td><td><span class="status ${r.status.toLowerCase().replaceAll(" ","-")}">${esc(r.status)}</span></td><td>${esc(r.admin_note||"—")}</td><td>${esc(r.created_at)}</td></tr>`).join("");
 render(req,res,"Content ID Requests",`<div class="page-heading"><div><p class="eyebrow">RIGHTS MANAGEMENT</p><h1>YouTube Content ID request</h1><p>Request a review of your track's eligibility and rights.</p></div></div>
 <section class="form-card wide"><h2>Submit request</h2><form method="post" action="/content-id">${csrf(req)}<label>Linked release (optional)<select name="release_id"><option value="">Choose a release</option>${opts}</select></label><label>Track title<input name="track_title" maxlength="120" required></label><label>Rights / eligibility information<textarea name="evidence_note" rows="4" maxlength="2000" placeholder="Describe ownership, exclusive rights, samples, beats, licences, and any other relevant details." required></textarea></label><label class="check"><input type="checkbox" name="rights_confirmed" value="yes" required> I confirm I control or am authorized to manage the relevant exclusive rights and that the information is accurate.</label><button class="button">Submit request</button></form></section>
 <section class="card"><h2>Your requests</h2><div class="table-wrap"><table><thead><tr><th>Track</th><th>Status</th><th>Admin note</th><th>Submitted</th></tr></thead><tbody>${rows||"<tr><td colspan='4'>No Content ID requests yet.</td></tr>"}</tbody></table></div></section>
 <p class="disclaimer">This is a request-tracking workflow only. It does not activate Content ID. Access requires YouTube eligibility and an authorized Content ID partner; submitted tracks may not qualify.</p>`);
});
app.post("/content-id",auth,(req,res)=>{
 if(req.session.user.role!=="artist")return res.redirect("/admin");
 const title=String(req.body.track_title||"").trim(),note=String(req.body.evidence_note||"").trim(),rid=req.body.release_id?Number(req.body.release_id):null;
 if(title.length<1||title.length>120||note.length<5||note.length>2000||req.body.rights_confirmed!=="yes")return res.status(400).send("Please complete the form and confirm rights.");
 if(rid&&!db.prepare("SELECT id FROM releases WHERE id=? AND artist_id=?").get(rid,req.session.user.id))return res.status(400).send("Invalid linked release.");
 db.prepare("INSERT INTO cid_requests(artist_id,release_id,track_title,rights_confirmed,evidence_note) VALUES(?,?,?,?,?)").run(req.session.user.id,rid,title,1,note);
 res.redirect("/content-id");
});

app.get("/royalties",auth,(req,res)=>{
 if(req.session.user.role!=="artist")return res.redirect("/admin");
 const rows=db.prepare("SELECT * FROM royalties WHERE artist_id=? ORDER BY period DESC,id DESC").all(req.session.user.id);
 const total=rows.reduce((s,r)=>s+r.amount_cents,0);
 const trs=rows.map(r=>`<tr><td>${esc(r.period)}</td><td>${esc(r.platform)}</td><td>${money(r.amount_cents,r.currency)}</td><td>${esc(r.reference_note||"—")}</td></tr>`).join("");
 render(req,res,"Royalty Reports",`<div class="page-heading"><div><p class="eyebrow">ROYALTY REPORTING</p><h1>Your royalty statements</h1><p>Only verified records entered by your admin are shown.</p></div></div><section class="stats"><div class="stat"><span>Recorded total</span><strong>${money(total)}</strong></div><div class="stat"><span>Statement lines</span><strong>${rows.length}</strong></div><div class="stat"><span>Currency</span><strong>INR</strong></div></section><section class="card"><div class="table-wrap"><table><thead><tr><th>Period</th><th>Platform</th><th>Amount</th><th>Reference / note</th></tr></thead><tbody>${trs||"<tr><td colspan='4'>No royalty statements recorded yet.</td></tr>"}</tbody></table></div></section><p class="disclaimer">This page does not calculate streaming royalties automatically. Amounts must be imported or entered from your authorized distributor's statements.</p>`);
});
app.get("/payments",auth,(req,res)=>{
 if(req.session.user.role!=="artist")return res.redirect("/admin");
 const total=db.prepare("SELECT COALESCE(SUM(amount_cents),0) total FROM royalties WHERE artist_id=?").get(req.session.user.id).total;
 const payouts=db.prepare("SELECT * FROM payout_requests WHERE artist_id=? ORDER BY id DESC").all(req.session.user.id);
 const trs=payouts.map(p=>`<tr><td>${money(p.amount_cents)}</td><td>${esc(p.method)}</td><td>${esc(p.status)}</td><td>${esc(p.admin_note||"—")}</td><td>${esc(p.created_at)}</td></tr>`).join("");
 render(req,res,"Payment Requests",`<div class="page-heading"><div><p class="eyebrow">PAYOUTS</p><h1>Payment requests</h1><p>Request a payout from recorded royalties.</p></div></div><section class="card"><p><b>Total royalty records:</b> ${money(total)}. This is not necessarily the available balance; actual payout eligibility depends on your agreement and verified accounting.</p></section>
 <section class="form-card wide"><h2>New payout request</h2><form method="post" action="/payments">${csrf(req)}<label>Amount (INR)<input type="number" name="amount" min="1" max="1000000" step="0.01" required></label><label>Payment method<select name="method" required><option value="UPI">UPI</option><option value="Bank transfer">Bank transfer</option></select></label><label>Payment details<textarea name="payout_details" rows="3" maxlength="500" placeholder="UPI ID or bank payout details. Only provide details needed for payout." required></textarea></label><button class="button">Request payment</button></form></section>
 <section class="card"><h2>Your payout requests</h2><div class="table-wrap"><table><thead><tr><th>Amount</th><th>Method</th><th>Status</th><th>Admin note</th><th>Date</th></tr></thead><tbody>${trs||"<tr><td colspan='5'>No payout requests yet.</td></tr>"}</tbody></table></div></section>
 <p class="disclaimer">Submitting a request does not send money automatically. Admin must verify the statement and manually process payment or connect an approved payment provider.</p>`);
});
app.post("/payments",auth,(req,res)=>{
 if(req.session.user.role!=="artist")return res.redirect("/admin");
 const amount=Number(req.body.amount),method=String(req.body.method||""),details=String(req.body.payout_details||"").trim();
 if(!Number.isFinite(amount)||amount<1||amount>1000000||!["UPI","Bank transfer"].includes(method)||details.length<3||details.length>500)return res.status(400).send("Please check payment request details.");
 db.prepare("INSERT INTO payout_requests(artist_id,amount_cents,method,payout_details) VALUES(?,?,?,?)").run(req.session.user.id,Math.round(amount*100),method,details);
 res.redirect("/payments");
});

app.get("/admin",auth,admin,(req,res)=>{
 const u=req.session.user;
 const artists=db.prepare("SELECT id,name,email,created_at FROM users WHERE role='artist' ORDER BY id DESC").all();
 const releases=db.prepare("SELECT r.*,u.name artist_name,u.email artist_email FROM releases r JOIN users u ON u.id=r.artist_id ORDER BY r.id DESC").all();
 const cids=db.prepare("SELECT c.*,u.name artist_name FROM cid_requests c JOIN users u ON u.id=c.artist_id ORDER BY c.id DESC").all();
 const payouts=db.prepare("SELECT p.*,u.name artist_name,u.email artist_email FROM payout_requests p JOIN users u ON u.id=p.artist_id ORDER BY p.id DESC").all();
 const artistOpts=artists.map(a=>`<option value="${a.id}">${esc(a.name)} — ${esc(a.email)}</option>`).join("");
 const releaseRows=releases.map(r=>`<tr><td>${esc(r.title)}<small>${esc(r.primary_artist)} · ${esc(r.language)} · ${esc(r.release_date||"No date")}</small></td><td>${esc(r.artist_name)}<small>${esc(r.artist_email)}</small></td><td><a href="/asset/${encodeURIComponent(r.audio_file)}" target="_blank" rel="noopener">Audio</a> · <a href="/asset/${encodeURIComponent(r.cover_file)}" target="_blank" rel="noopener">Cover</a></td><td><span class="status ${r.status.toLowerCase()}">${esc(r.status)}</span></td><td><form method="post" action="/admin/release/${r.id}" class="review-form">${csrf(req)}<select name="status"><option ${r.status==="Pending"?"selected":""}>Pending</option><option ${r.status==="Approved"?"selected":""}>Approved</option><option ${r.status==="Rejected"?"selected":""}>Rejected</option></select><input name="admin_note" maxlength="500" placeholder="Review note" value="${esc(r.admin_note||"")}"><button class="button small">Save</button></form></td></tr>`).join("");
 const cidRows=cids.map(c=>`<tr><td>${esc(c.track_title)}<small>${esc(c.evidence_note)}</small></td><td>${esc(c.artist_name)}</td><td>${c.rights_confirmed?"Yes":"No"}</td><td><span class="status">${esc(c.status)}</span></td><td><form method="post" action="/admin/cid/${c.id}" class="review-form">${csrf(req)}<select name="status"><option ${c.status==="Pending"?"selected":""}>Pending</option><option ${c.status==="Under review"?"selected":""}>Under review</option><option ${c.status==="Approved for partner review"?"selected":""}>Approved for partner review</option><option ${c.status==="Rejected"?"selected":""}>Rejected</option></select><input name="admin_note" maxlength="500" placeholder="Note" value="${esc(c.admin_note||"")}"><button class="button small">Save</button></form></td></tr>`).join("");
 const payoutRows=payouts.map(p=>`<tr><td>${esc(p.artist_name)}<small>${esc(p.artist_email)}</small></td><td>${money(p.amount_cents)}</td><td>${esc(p.method)}<small>${esc(p.payout_details)}</small></td><td><span class="status">${esc(p.status)}</span></td><td><form method="post" action="/admin/payout/${p.id}" class="review-form">${csrf(req)}<select name="status"><option ${p.status==="Requested"?"selected":""}>Requested</option><option ${p.status==="Under review"?"selected":""}>Under review</option><option ${p.status==="Paid"?"selected":""}>Paid</option><option ${p.status==="Rejected"?"selected":""}>Rejected</option></select><input name="admin_note" maxlength="500" placeholder="Payment reference / note" value="${esc(p.admin_note||"")}"><button class="button small">Save</button></form></td></tr>`).join("");
 const body=`<div class="page-heading"><div><p class="eyebrow">ADMIN CONSOLE</p><h1>Platform management</h1><p>Review releases, Content ID requests, royalties and payouts.</p></div></div>
 <section class="stats"><div class="stat"><span>Artists</span><strong>${artists.length}</strong></div><div class="stat"><span>Releases</span><strong>${releases.length}</strong></div><div class="stat"><span>Pending payouts</span><strong>${payouts.filter(p=>["Requested","Under review"].includes(p.status)).length}</strong></div></section>
 <section class="card"><h2>Release review</h2><div class="table-wrap"><table><thead><tr><th>Release</th><th>Artist</th><th>Files</th><th>Status</th><th>Update</th></tr></thead><tbody>${releaseRows||"<tr><td colspan='5'>No releases yet.</td></tr>"}</tbody></table></div></section>
 <section class="card"><h2>YouTube Content ID requests</h2><div class="table-wrap"><table><thead><tr><th>Track / rights note</th><th>Artist</th><th>Rights confirmed</th><th>Status</th><th>Update</th></tr></thead><tbody>${cidRows||"<tr><td colspan='5'>No Content ID requests.</td></tr>"}</tbody></table></div><p class="disclaimer">Admin review here does not grant Content ID access.</p></section>
 <section class="card"><h2>Record royalty statement</h2><form method="post" action="/admin/royalty" class="admin-inline">${csrf(req)}<label>Artist<select name="artist_id" required>${artistOpts}</select></label><label>Period<input name="period" placeholder="2026-09" pattern="\\d{4}-\\d{2}" required></label><label>Platform<input name="platform" placeholder="Spotify / YouTube Music" maxlength="80" required></label><label>Amount (INR)<input name="amount" type="number" min="0" step="0.01" required></label><label>Statement note<input name="reference_note" maxlength="300" placeholder="Statement reference"></label><button class="button">Add statement</button></form></section>
 <section class="card"><h2>Royalty statements</h2><div class="table-wrap"><table><thead><tr><th>Artist</th><th>Period</th><th>Platform</th><th>Amount</th><th>Note</th></tr></thead><tbody>${db.prepare("SELECT r.*,u.name artist_name FROM royalties r JOIN users u ON u.id=r.artist_id ORDER BY r.id DESC").all().map(r=>`<tr><td>${esc(r.artist_name)}</td><td>${esc(r.period)}</td><td>${esc(r.platform)}</td><td>${money(r.amount_cents,r.currency)}</td><td>${esc(r.reference_note||"—")}</td></tr>`).join("")||"<tr><td colspan='5'>No royalty statements recorded.</td></tr>"}</tbody></table></div></section>
 <section class="card"><h2>Payment requests</h2><div class="table-wrap"><table><thead><tr><th>Artist</th><th>Amount</th><th>Method / details</th><th>Status</th><th>Update</th></tr></thead><tbody>${payoutRows||"<tr><td colspan='5'>No payment requests.</td></tr>"}</tbody></table></div><p class="disclaimer">Mark a payout Paid only after the actual transfer is complete. Do not store bank passwords, OTPs or card PINs here.</p></section>`;
 render(req,res,"Admin",body);
});
app.post("/admin/release/:id",auth,admin,(req,res)=>{
 const id=Number(req.params.id),status=String(req.body.status||""),note=String(req.body.admin_note||"").slice(0,500);
 if(!Number.isInteger(id)||!["Pending","Approved","Rejected"].includes(status))return res.status(400).send("Invalid release update.");
 db.prepare("UPDATE releases SET status=?,admin_note=? WHERE id=?").run(status,note,id);res.redirect("/admin");
});
app.post("/admin/cid/:id",auth,admin,(req,res)=>{
 const id=Number(req.params.id),status=String(req.body.status||""),note=String(req.body.admin_note||"").slice(0,500);
 if(!Number.isInteger(id)||!["Pending","Under review","Approved for partner review","Rejected"].includes(status))return res.status(400).send("Invalid request update.");
 db.prepare("UPDATE cid_requests SET status=?,admin_note=? WHERE id=?").run(status,note,id);res.redirect("/admin");
});
app.post("/admin/royalty",auth,admin,(req,res)=>{
 const artistId=Number(req.body.artist_id),period=String(req.body.period||""),platform=String(req.body.platform||"").trim(),amount=Number(req.body.amount),note=String(req.body.reference_note||"").slice(0,300);
 if(!db.prepare("SELECT id FROM users WHERE id=? AND role='artist'").get(artistId)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)||!platform||platform.length>80||!Number.isFinite(amount)||amount<0||amount>100000000)return res.status(400).send("Invalid royalty statement details.");
 db.prepare("INSERT INTO royalties(artist_id,period,platform,amount_cents,currency,reference_note) VALUES(?,?,?,?, 'INR', ?)").run(artistId,period,platform,Math.round(amount*100),note);res.redirect("/admin");
});
app.post("/admin/payout/:id",auth,admin,(req,res)=>{
 const id=Number(req.params.id),status=String(req.body.status||""),note=String(req.body.admin_note||"").slice(0,500);
 if(!Number.isInteger(id)||!["Requested","Under review","Paid","Rejected"].includes(status))return res.status(400).send("Invalid payout update.");
 db.prepare("UPDATE payout_requests SET status=?,admin_note=? WHERE id=?").run(status,note,id);res.redirect("/admin");
});
app.get("/health",(req,res)=>res.json({ok:true}));
app.use((err,req,res,next)=>{console.error(err);res.status(500).send("Something went wrong. Please try again.");});
app.listen(PORT,()=>console.log(`Pallavi Digital Media running at http://localhost:${PORT}`));
