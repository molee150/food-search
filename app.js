/* ================= Supabase 初始化 ================= */
const SUPABASE_URL = "https://zovgliilgcmwtcrsaiie.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvdmdsaWlsZ2Ntd3RjcnNhaWllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxNDc3NDUsImV4cCI6MjExMDcyMzc0NX0.X_r3WgKykmCt7WayBbkNjaUXKhTYtLOeBOJx2VA50oU";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ================= 常量 ================= */
const TASTE_COLORS = {
  "酸":{bg:"#e6f4ea",fg:"#1e8e3e",icon:"🍋"},
  "甜":{bg:"#fde7f0",fg:"#c2185b",icon:"🍬"},
  "苦":{bg:"#f3ece4",fg:"#6d4c2f",icon:"☕"},
  "辣":{bg:"#fdecea",fg:"#d93025",icon:"🌶️"},
  "麻":{bg:"#f3e5f5",fg:"#7b1fa2",icon:"⚡"},
  "咸":{bg:"#e8f0fe",fg:"#1a73e8",icon:"🧂"},
  "鲜":{bg:"#fef3e0",fg:"#e8710a",icon:"🦐"},
};
const tastes = Object.keys(TASTE_COLORS);
const CAT_ICONS = {主菜:"🍽️",主食:"🍚",小吃:"🥟",甜品:"🍰",汤羹:"🥣",沙拉:"🥗",饮品:"🍹"};
const cats = Object.keys(CAT_ICONS);

/* ================= 全局状态 ================= */
let foods = [];
let regionsByCountry = {};
let profilesMap = {};
let currentUser = null;
let currentProfile = null;
let currentView = "home";
let currentThread = null;
let currentAdminTab = "foods";
let selectedTastes = [];
let replyParent = null;
let likedSet = new Set();
let authMode = "login";
const filter = { country:null, region:null, tastes:new Set(), cats:new Set(), search:"" };

const $ = id => document.getElementById(id);

/* ================= 工具 ================= */
function tasteBadge(t){ const c=TASTE_COLORS[t]||{bg:"#eee",fg:"#555",icon:""}; return `<span class="taste" style="background:${c.bg};color:${c.fg}">${c.icon} ${t}</span>`; }
function timeAgo(ts){ const d=new Date(ts),now=new Date(); const s=Math.floor((now-d)/1000); if(s<60)return "刚刚"; if(s<3600)return Math.floor(s/60)+"分钟前"; if(s<86400)return Math.floor(s/3600)+"小时前"; return Math.floor(s/86400)+"天前"; }
function openModal(id){ $(id).classList.add("show"); document.body.style.overflow="hidden"; }
function closeModal(id){ $(id).classList.remove("show"); document.body.style.overflow=""; }

/* ================= 视图路由 ================= */
function enterSite(){ $("view-cover").classList.remove("active"); $("app").classList.remove("hidden"); showView("home"); }
function showView(name){
  currentView = name;
  document.querySelectorAll("#app .view").forEach(v=>v.classList.remove("active"));
  const el = $("view-"+name); if(el) el.classList.add("active");
  document.querySelectorAll(".navtab").forEach(t=>t.classList.toggle("on", t.dataset.view===name));
  window.scrollTo(0,0);
  if(name==="home"){ if(!foods.length) loadFoods(); else renderFoods(); }
  if(name==="photos") loadPhotos();
  if(name==="videos") loadVideos();
  if(name==="forum") loadForum();
  if(name==="upload") buildUploadSelects();
  if(name==="admin"){ if(currentProfile && currentProfile.role==="admin") loadAdmin(); else showView("home"); }
}

/* ================= 数据加载 ================= */
async function loadFoods(){
  const { data } = await supabase.from("foods").select("*").eq("status","published");
  foods = data || [];
  foods.sort((a,b)=>{
    if(a.country==="中国" && b.country!=="中国") return -1;
    if(b.country==="中国" && a.country!=="中国") return 1;
    return a.country.localeCompare(b.country,"zh") || a.name.localeCompare(b.name,"zh");
  });
  buildRegionsMap(); buildFilters(); buildUploadSelects(); renderFoods();
}
function buildRegionsMap(){
  regionsByCountry = {};
  foods.forEach(f=>{ if(f.region){ (regionsByCountry[f.country]=regionsByCountry[f.country]||[]); if(!regionsByCountry[f.country].includes(f.region)) regionsByCountry[f.country].push(f.region); } });
}
async function loadProfiles(){
  const { data } = await supabase.from("profiles").select("id,username,avatar_url,role,email");
  profilesMap = {}; (data||[]).forEach(p=>profilesMap[p.id]=p);
}
async function loadLikes(){
  likedSet.clear();
  if(!currentUser) return;
  const { data } = await supabase.from("likes").select("target_type,target_id").eq("user_id",currentUser.id);
  (data||[]).forEach(l=>likedSet.add(l.target_type+":"+l.target_id));
}

/* ================= 筛选 ================= */
function matches(f){
  if(filter.search){ const q=filter.search.toLowerCase(); const hay=[f.name,f.name_en||"",f.country,f.region||"",f.category,f.description||"",(f.ingredients||[]).join(" ")].join(" ").toLowerCase(); if(!hay.includes(q)) return false; }
  if(filter.country && f.country!==filter.country) return false;
  if(filter.region && f.region!==filter.region) return false;
  if(filter.tastes.size && !(f.tastes||[]).some(t=>filter.tastes.has(t))) return false;
  if(filter.cats.size && !filter.cats.has(f.category)) return false;
  return true;
}
function buildFilters(){
  const countries=[...new Set(foods.map(f=>f.country))];
  countries.sort((a,b)=>a==="中国"?-1:b==="中国"?1:a.localeCompare(b,"zh"));
  $("countryChips").innerHTML = countries.map(c=>`<button class="chip${filter.country===c?' on':''}" onclick="selectCountry('${c}')">${c}</button>`).join("");
  buildRegionChips();
  $("tasteChips").innerHTML = tastes.map(t=>`<button class="chip${filter.tastes.has(t)?' on':''}" onclick="toggleTaste('${t}')">${TASTE_COLORS[t].icon} ${t}</button>`).join("");
  $("catChips").innerHTML = cats.map(c=>`<button class="chip${filter.cats.has(c)?' on':''}" onclick="toggleCat('${c}')">${CAT_ICONS[c]} ${c}</button>`).join("");
}
function buildRegionChips(){
  if(!filter.country){ $("regionGroup").style.display="none"; return; }
  const regions = regionsByCountry[filter.country]||[];
  if(!regions.length){ $("regionGroup").style.display="none"; return; }
  $("regionGroup").style.display="flex";
  $("regionChips").innerHTML = `<button class="chip${!filter.region?' on':''}" onclick="selectRegion(null)">全部</button>` + regions.map(r=>`<button class="chip${filter.region===r?' on':''}" onclick="selectRegion('${r}')">${r}</button>`).join("");
}
function selectCountry(c){ filter.country = c; filter.region = null; buildFilters(); renderFoods(); }
function selectRegion(r){ filter.region = r; buildRegionChips(); renderFoods(); }
function toggleTaste(t){ filter.tastes.has(t)?filter.tastes.delete(t):filter.tastes.add(t); buildFilters(); renderFoods(); }
function toggleCat(c){ filter.cats.has(c)?filter.cats.delete(c):filter.cats.add(c); buildFilters(); renderFoods(); }
function resetFilters(){ filter.country=null; filter.region=null; filter.tastes.clear(); filter.cats.clear(); filter.search=""; $("searchInput").value=""; $("sClear").style.display="none"; buildFilters(); renderFoods(); }
function clearSearch(){ filter.search=""; $("searchInput").value=""; $("sClear").style.display="none"; renderFoods(); }
function randomFood(){ const list=foods.filter(matches); if(!list.length)return; openFood(list[Math.floor(Math.random()*list.length)].id); }

function renderFoods(){
  const list = foods.filter(matches);
  $("foodCount").innerHTML = `找到 <b>${list.length}</b> 道菜`;
  $("foodGrid").innerHTML = list.map(f=>`
    <article class="card fcard" onclick="openFood('${f.id}')">
      <div class="fthumb"><span>${f.emoji}</span><span class="country">${f.country}${f.region?' · '+f.region:''}</span></div>
      <div class="fbody">
        <div class="fname">${f.name}</div>
        ${f.name_en?`<div class="fnameEn">${f.name_en}</div>`:''}
        <div class="tags">${(f.tastes||[]).map(tasteBadge).join('')}</div>
        <div class="fmeta"><span>${CAT_ICONS[f.category]||''} ${f.category}</span><span>⏱ ${f.time||''}</span><span>🔥 ${f.difficulty||''}</span></div>
        <div class="fdesc">${f.description||''}</div>
        <div class="fmore">查看做法 →</div>
      </div>
    </article>`).join("");
  $("foodEmpty").style.display = list.length?"none":"block";
}

function openFood(id){
  const f = foods.find(x=>x.id===id); if(!f) return;
  $("fmThumb").innerHTML = `<span>${f.emoji}</span>`;
  $("fmBody").innerHTML = `
    <h2>${f.name}</h2>
    <div class="fm-sub">${f.name_en||''} · ${f.country}${f.region?' · '+f.region:''}</div>
    <div class="fm-tags">${(f.tastes||[]).map(tasteBadge).join('')}<span class="taste" style="background:#f1ede8;color:#8a7d72">${CAT_ICONS[f.category]||''} ${f.category}</span></div>
    <p class="fm-desc">${f.description||''}</p>
    <div class="fm-meta"><span>⏱ ${f.time||''}</span><span>🔥 难度：${f.difficulty||''}</span></div>
    <h4>所需食材</h4><ul class="ing">${(f.ingredients||[]).map(i=>`<li>${i}</li>`).join('')}</ul>
    <h4>做法步骤</h4><ol class="steps">${(f.steps||[]).map(s=>`<li>${s}</li>`).join('')}</ol>
    ${f.tip?`<div class="fm-tip">💡 ${f.tip}</div>`:''}`;
  openModal("foodModal");
}
function closeFood(){ closeModal("foodModal"); }

/* ================= 认证 ================= */
function openAuth(){ $("authError").textContent=""; openModal("authModal"); }
function closeAuth(){ closeModal("authModal"); }
function switchAuth(mode){
  authMode = mode;
  $("tabLogin").classList.toggle("on", mode==="login");
  $("tabRegister").classList.toggle("on", mode==="register");
  $("authTitle").textContent = mode==="login"?"登录":"注册";
  $("usernameField").style.display = mode==="register"?"flex":"none";
  $("authSubmit").textContent = mode==="login"?"登录":"注册";
  $("authError").textContent = "";
}
async function submitAuth(e){
  e.preventDefault();
  const email = $("authEmail").value.trim();
  const password = $("authPassword").value;
  const username = $("authUsername").value.trim();
  $("authError").textContent = "";
  try{
    if(authMode==="register"){
      const { data, error } = await supabase.auth.signUp({ email, password, options:{ data:{ username } } });
      if(error) throw error;
      if(data.session){ closeAuth(); await refreshAuth(); }
      else { $("authError").textContent = "注册成功！请前往邮箱点击确认链接后再登录。"; }
    }else{
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if(error) throw error;
      closeAuth(); await refreshAuth();
    }
  }catch(err){ $("authError").textContent = err.message; }
}
async function logout(){ await supabase.auth.signOut(); currentUser=null; currentProfile=null; await refreshAuth(); showView("home"); }

async function refreshAuth(){
  const { data:{ user } } = await supabase.auth.getUser();
  currentUser = user;
  currentProfile = null;
  if(user){
    const { data } = await supabase.from("profiles").select("*").eq("id",user.id).single();
    currentProfile = data;
  }
  $("authBtn").style.display = user?"none":"";
  $("userBox").classList.toggle("hidden", !user);
  if(user){ $("userName").textContent = currentProfile?.username || user.email; }
  const isAdmin = currentProfile?.role==="admin";
  $("adminBadge").classList.toggle("hidden", !isAdmin);
  document.querySelectorAll(".admin-only").forEach(el=>el.style.display = isAdmin?"":"none");
  $("uploadLoginTip").classList.toggle("hidden", !!user);
  $("uploadForm").classList.toggle("hidden", !user);
  $("photoForm").classList.toggle("hidden", !user);
  await loadLikes();
  if(currentView==="photos") loadPhotos();
  if(currentView==="videos") loadVideos();
  if(currentView==="admin"){ if(isAdmin) loadAdmin(); else showView("home"); }
  if(currentView==="forum") loadForum();
}

/* ================= 上传美食 ================= */
function buildUploadSelects(){
  const cs = document.querySelector('#uploadForm select[name=country]');
  if(!cs) return;
  const countries=[...new Set(foods.map(f=>f.country))];
  countries.sort((a,b)=>a==="中国"?-1:b==="中国"?1:a.localeCompare(b,"zh"));
  cs.innerHTML = countries.map(c=>`<option>${c}</option>`).join("");
  updateUploadRegions();
  renderTastePick();
}
function updateUploadRegions(){
  const cs = document.querySelector('#uploadForm select[name=country]');
  const rs = document.querySelector('#uploadForm select[name=region]');
  if(!cs || !rs) return;
  const regions = regionsByCountry[cs.value]||[];
  rs.innerHTML = `<option value="">（无）</option>` + regions.map(r=>`<option>${r}</option>`).join("");
}
function renderTastePick(){
  $("tastePick").innerHTML = tastes.map(t=>`<button type="button" class="chip${selectedTastes.includes(t)?' on':''}" onclick="togglePickTaste('${t}')">${TASTE_COLORS[t].icon} ${t}</button>`).join("");
}
function togglePickTaste(t){ const i=selectedTastes.indexOf(t); i>=0?selectedTastes.splice(i,1):selectedTastes.push(t); renderTastePick(); }

async function submitFood(e){
  e.preventDefault();
  if(!currentUser){ openAuth(); return; }
  const fd = new FormData(e.target);
  const name = (fd.get("name")||"").trim();
  const ingredients = (fd.get("ingredients")||"").split("\n").map(s=>s.trim()).filter(Boolean);
  const steps = (fd.get("steps")||"").split("\n").map(s=>s.trim()).filter(Boolean);
  if(!name || !ingredients.length || !steps.length){ alert("请填写菜名、食材和做法"); return; }
  let cover_url = null;
  const coverFile = fd.get("cover");
  if(coverFile && coverFile.size){
    const path = currentUser.id+"/"+Date.now()+"-"+coverFile.name;
    const { error: upErr } = await supabase.storage.from("covers").upload(path, coverFile);
    if(upErr){ alert("封面上传失败："+upErr.message); return; }
    cover_url = supabase.storage.from("covers").getPublicUrl(path).data.publicUrl;
  }
  const row = {
    name, name_en: (fd.get("name_en")||"").trim() || null, country: fd.get("country"),
    region: fd.get("region") || null, tastes: selectedTastes, category: fd.get("category"),
    emoji: fd.get("emoji") || "🍽️", difficulty: fd.get("difficulty"), time: fd.get("time"),
    description: fd.get("desc")||"", ingredients, steps, tip: fd.get("tip")||"",
    cover_url, status:"published", created_by: currentUser.id
  };
  const { error } = await supabase.from("foods").insert(row);
  if(error){ alert("发布失败："+error.message); return; }
  alert("发布成功！");
  e.target.reset(); selectedTastes=[]; renderTastePick(); updateUploadRegions();
  await loadFoods(); showView("home");
}

/* ================= 晒照片 ================= */
async function loadPhotos(){
  const { data } = await supabase.from("photos").select("*").order("created_at",{ascending:false});
  await loadProfiles();
  $("photoFeed").innerHTML = (data||[]).map(p=>{
    const u = profilesMap[p.user_id]||{};
    return `<div class="pitem">
      <img src="${p.image_url}" alt="" loading="lazy" onerror="this.parentElement.style.display='none'">
      <div class="pinfo">
        <div class="puser">👤 ${u.username||"用户"}</div>
        ${p.caption?`<div class="pcap">${p.caption}</div>`:''}
        <div class="pactions"><button class="like-btn ${likedSet.has('photo:'+p.id)?'liked':''}" onclick="toggleLike('photo','${p.id}')">❤ ${p.likes_count||0}</button></div>
      </div>
    </div>`;
  }).join("");
  $("photoEmpty").style.display = (data&&data.length)?"none":"block";
}
async function submitPhoto(e){
  e.preventDefault();
  if(!currentUser){ openAuth(); return; }
  const file = $("photoFile").files[0];
  if(!file){ alert("请选择图片"); return; }
  const caption = $("photoCaption").value.trim();
  const path = currentUser.id+"/"+Date.now()+"-"+file.name;
  const { error: upErr } = await supabase.storage.from("photos").upload(path, file);
  if(upErr){ alert("上传失败："+upErr.message); return; }
  const image_url = supabase.storage.from("photos").getPublicUrl(path).data.publicUrl;
  const { error } = await supabase.from("photos").insert({ user_id:currentUser.id, image_url, caption });
  if(error){ alert("保存失败："+error.message); return; }
  $("photoForm").reset(); loadPhotos();
}

/* ================= 点赞 ================= */
async function toggleLike(type, id){
  if(!currentUser){ openAuth(); return; }
  const key = type+":"+id;
  if(likedSet.has(key)){
    await supabase.from("likes").delete().eq("user_id",currentUser.id).eq("target_type",type).eq("target_id",id);
    likedSet.delete(key);
  }else{
    const { error } = await supabase.from("likes").insert({ user_id:currentUser.id, target_type:type, target_id:id });
    if(error){ alert(error.message); return; }
    likedSet.add(key);
  }
  if(currentView==="photos") loadPhotos();
  if(currentView==="videos") loadVideos();
}

/* ================= 视频 ================= */
function parseEmbed(url){
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/);
  if(yt) return `<iframe src="https://www.youtube.com/embed/${yt[1]}" allowfullscreen loading="lazy"></iframe>`;
  const bili = url.match(/bilibili\.com\/video\/(BV[\w]+)/);
  if(bili) return `<iframe src="//player.bilibili.com/player.html?bvid=${bili[1]}&autoplay=0" allowfullscreen loading="lazy"></iframe>`;
  if(/\.mp4(\?|$)/i.test(url)) return `<video src="${url}" controls></video>`;
  return `<div style="display:grid;place-items:center;height:100%;padding:10px;text-align:center"><a href="${url}" target="_blank" style="color:#fff">点击打开视频 ↗</a></div>`;
}
async function loadVideos(){
  const { data } = await supabase.from("videos").select("*").order("created_at",{ascending:false});
  await loadProfiles();
  $("videoFeed").innerHTML = (data||[]).map(v=>{
    const u = profilesMap[v.user_id]||{};
    const player = v.video_url ? `<video src="${v.video_url}" controls></video>` : (v.embed_url ? parseEmbed(v.embed_url) : `<div style="color:#888;display:grid;place-items:center;height:100%">无视频源</div>`);
    return `<div class="vcard">
      <div class="vframe">${player}</div>
      <div class="vbody">
        <div class="vtitle">${v.title}</div>
        ${v.description?`<div class="vdesc">${v.description}</div>`:''}
        <div class="vuser">by ${u.username||"用户"} · ${timeAgo(v.created_at)}</div>
        <div class="pactions"><button class="like-btn ${likedSet.has('video:'+v.id)?'liked':''}" onclick="toggleLike('video','${v.id}')">❤ ${v.likes_count||0}</button></div>
      </div>
    </div>`;
  }).join("");
  $("videoEmpty").style.display = (data&&data.length)?"none":"block";
}
function openVideoForm(){ $("videoForm").classList.toggle("hidden"); }
async function submitVideo(e){
  e.preventDefault();
  if(!currentUser){ openAuth(); return; }
  const fd = new FormData(e.target);
  const title = (fd.get("title")||"").trim();
  const link = (fd.get("link")||"").trim();
  const file = fd.get("file");
  let embed_url=null, video_url=null;
  if(link){
    if(/\.mp4(\?|$)/i.test(link)) video_url = link;
    else if(/youtube|bilibili|youtu\.be/i.test(link)) embed_url = link;
    else { alert("暂只支持 B站、YouTube 或 .mp4 直链"); return; }
  }else if(file && file.size){
    const path = currentUser.id+"/"+Date.now()+"-"+file.name;
    const { error: upErr } = await supabase.storage.from("videos").upload(path, file);
    if(upErr){ alert("上传失败："+upErr.message); return; }
    video_url = supabase.storage.from("videos").getPublicUrl(path).data.publicUrl;
  }else{ alert("请填写视频链接或选择文件"); return; }
  const { error } = await supabase.from("videos").insert({ user_id:currentUser.id, title, description:fd.get("desc")||"", embed_url, video_url });
  if(error){ alert("发布失败："+error.message); return; }
  alert("视频发布成功！");
  e.target.reset(); openVideoForm(); loadVideos();
}

/* ================= 讨论区 ================= */
async function loadForum(){
  const { data } = await supabase.from("discussions").select("*").order("created_at",{ascending:false});
  await loadProfiles();
  $("forumList").innerHTML = (data||[]).map(d=>{
    const u = profilesMap[d.user_id]||{};
    return `<div class="ditem" onclick="openThread('${d.id}')">
      <div class="dtitle">${d.title}</div>
      <div class="dmeta"><span>👤 ${u.username||"用户"}</span><span>🕒 ${timeAgo(d.created_at)}</span></div>
      ${d.content?`<div class="dcontent">${d.content.slice(0,80)}${d.content.length>80?"…":""}</div>`:''}
    </div>`;
  }).join("");
  $("forumEmpty").style.display = (data&&data.length)?"none":"block";
}
function openNewPost(){
  if(!currentUser){ openAuth(); return; }
  const title = prompt("帖子标题：");
  if(!title || !title.trim()) return;
  const content = prompt("内容（可选）：") || "";
  supabase.from("discussions").insert({ user_id:currentUser.id, title:title.trim(), content }).then(({error})=>{
    if(error){ alert("发帖失败："+error.message); return; }
    loadForum();
  });
}
async function openThread(id){
  const { data: d } = await supabase.from("discussions").select("*").eq("id",id).single();
  if(!d) return;
  const { data: comments } = await supabase.from("comments").select("*").eq("discussion_id",id).order("created_at",{ascending:true});
  await loadProfiles();
  currentThread = d; replyParent = null;
  const u = profilesMap[d.user_id]||{};
  const all = comments||[];
  const renderC = (c)=>{
    const cu = profilesMap[c.user_id]||{};
    const children = all.filter(r=>r.parent_id===c.id);
    return `<div class="comment${c.parent_id?' reply':''}">
      <div class="c-user">${cu.username||"用户"} <span class="c-time">${timeAgo(c.created_at)}</span></div>
      <div class="c-content">${c.content}</div>
      <span class="reply" onclick="replyTo('${c.id}')">回复</span>
      ${children.map(renderC).join('')}
    </div>`;
  };
  const top = all.filter(c=>!c.parent_id);
  $("threadBody").innerHTML = `<div class="thread-body">
    <div class="t-title">${d.title}</div>
    <div class="dmeta" style="color:#8a7d72;font-size:12px">👤 ${u.username||"用户"} · ${timeAgo(d.created_at)}</div>
    <div class="t-content">${d.content||""}</div>
    <h4 style="font-size:15px;font-weight:800;margin:16px 0 10px">评论（${all.length}）</h4>
    <div>${top.map(renderC).join('') || '<p style="color:#8a7d72">还没有评论，来抢沙发</p>'}</div>
    <div class="comment-form">
      <input id="commentInput" placeholder="写评论…">
      <button class="btn btn-primary" onclick="submitComment()">发送</button>
    </div>
  </div>`;
  openModal("threadModal");
}
function closeThread(){ closeModal("threadModal"); }
function replyTo(id){ replyParent = id; const inp=$("commentInput"); if(inp){ inp.placeholder="回复…"; inp.focus(); } }
async function submitComment(){
  if(!currentUser){ openAuth(); return; }
  const inp = $("commentInput"); if(!inp) return;
  const content = inp.value.trim(); if(!content) return;
  const { error } = await supabase.from("comments").insert({ discussion_id:currentThread.id, user_id:currentUser.id, parent_id:replyParent, content });
  if(error){ alert("评论失败："+error.message); return; }
  openThread(currentThread.id);
}

/* ================= 后台管理 ================= */
async function loadAdmin(){ renderAdminTab(currentAdminTab); }
async function renderAdminTab(tab){
  const content = $("adminContent");
  content.innerHTML = '<p style="color:#8a7d72">加载中…</p>';
  await loadProfiles();
  if(tab==="foods"){
    const { data } = await supabase.from("foods").select("*").order("created_at",{ascending:false});
    content.innerHTML = (data||[]).map(f=>`<div class="arow">
      <div class="atitle">${f.emoji} ${f.name} <span class="asub">${f.status==="published"?"✅已发布":"⏸已下架"}</span></div>
      <div class="asub">${f.country}${f.region?" · "+f.region:""}</div>
      <button class="btn-danger" onclick="toggleFoodStatus('${f.id}','${f.status}')">${f.status==="published"?"下架":"恢复"}</button>
      <button class="btn-danger" onclick="delFood('${f.id}')">删除</button>
    </div>`).join("");
  }else if(tab==="photos"){
    const { data } = await supabase.from("photos").select("*").order("created_at",{ascending:false});
    content.innerHTML = (data||[]).map(p=>`<div class="arow"><div class="atitle">📷 ${profilesMap[p.user_id]?.username||"用户"}</div><div class="asub">${p.caption||""}</div><button class="btn-danger" onclick="delPhoto('${p.id}')">删除</button></div>`).join("");
  }else if(tab==="videos"){
    const { data } = await supabase.from("videos").select("*").order("created_at",{ascending:false});
    content.innerHTML = (data||[]).map(v=>`<div class="arow"><div class="atitle">🎥 ${v.title}</div><div class="asub">${profilesMap[v.user_id]?.username||"用户"}</div><button class="btn-danger" onclick="delVideo('${v.id}')">删除</button></div>`).join("");
  }else if(tab==="discussions"){
    const { data } = await supabase.from("discussions").select("*").order("created_at",{ascending:false});
    content.innerHTML = (data||[]).map(d=>`<div class="arow"><div class="atitle">💬 ${d.title}</div><div class="asub">${profilesMap[d.user_id]?.username||"用户"}</div><button class="btn-danger" onclick="delDiscussion('${d.id}')">删除</button></div>`).join("");
  }else if(tab==="users"){
    const { data } = await supabase.from("profiles").select("*").order("created_at",{ascending:false});
    content.innerHTML = (data||[]).map(p=>`<div class="arow"><div class="atitle">👤 ${p.username||p.email||"用户"} <span class="asub">${p.role}</span></div><div class="asub">${p.email||""}</div></div>`).join("");
  }
}
async function toggleFoodStatus(id, status){ const ns = status==="published"?"pending":"published"; await supabase.from("foods").update({status:ns}).eq("id",id); renderAdminTab("foods"); loadFoods(); }
async function delFood(id){ if(!confirm("确定删除这道菜？"))return; await supabase.from("foods").delete().eq("id",id); renderAdminTab("foods"); loadFoods(); }
async function delPhoto(id){ if(!confirm("确定删除？"))return; await supabase.from("photos").delete().eq("id",id); renderAdminTab("photos"); }
async function delVideo(id){ if(!confirm("确定删除？"))return; await supabase.from("videos").delete().eq("id",id); renderAdminTab("videos"); }
async function delDiscussion(id){ if(!confirm("确定删除？"))return; await supabase.from("discussions").delete().eq("id",id); renderAdminTab("discussions"); }

/* ================= 事件绑定 ================= */
function bindEvents(){
  $("searchInput").addEventListener("input",e=>{ filter.search=e.target.value.trim(); $("sClear").style.display = filter.search?"block":"none"; renderFoods(); });
  document.querySelector("#uploadForm select[name=country]").addEventListener("change", updateUploadRegions);
  $("adminTabs").addEventListener("click",e=>{
    const b=e.target.closest(".chip"); if(!b) return;
    currentAdminTab=b.dataset.atab;
    document.querySelectorAll("#adminTabs .chip").forEach(c=>c.classList.toggle("on",c===b));
    renderAdminTab(currentAdminTab);
  });
  ["authModal","foodModal","threadModal"].forEach(id=>{
    $(id).addEventListener("click",e=>{ if(e.target===$(id)) closeModal(id); });
  });
  document.addEventListener("keydown",e=>{ if(e.key==="Escape"){ ["authModal","foodModal","threadModal"].forEach(closeModal); } });
}

/* ================= 启动 ================= */
supabase.auth.onAuthStateChange((event,session)=>{ refreshAuth(); });
async function init(){
  bindEvents();
  await loadFoods();
  await refreshAuth();
}
init();
