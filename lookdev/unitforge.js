// UNIT FORGE — front/back/side views -> Tripo3D textured + auto-rigged 3D model.
// Shared by lookdev/admin.html (local full Forge) and lookdev/units_forge.html (the standalone /forge page).
// Talks only to /api/unit-image, /api/unit-model, /api/unit-rig, /api/unit-status, /api/unit-delete,
// /api/tripo-balance, /api/units — so it runs on either the lookdev serve.py or the prod static_server.py.
const $u = id => document.getElementById(id);
const TK = $u('tripokey'), GK = $u('unitgmkey'), balEl = $u('tripobal'), warnEl = $u('tripowarn');
TK.value = localStorage.getItem('tripoKey') || '';
GK.value = localStorage.getItem('gmKey') || '';        // shared with the hero panel
TK.onchange = () => localStorage.setItem('tripoKey', TK.value.trim());
GK.onchange = () => localStorage.setItem('gmKey', GK.value.trim());
const uhdrs = () => { const h = {'Content-Type':'application/json'};
  if (TK.value.trim()) h['x-tripo-key'] = TK.value.trim();
  if (GK.value.trim()) h['x-gemini-key'] = GK.value.trim(); return h; };
const fmt2 = b => b>=1048576 ? (b/1048576).toFixed(2)+' MB' : ((b||0)/1024).toFixed(1)+' KB';
const sleep = ms => new Promise(r=>setTimeout(r,ms));

const SEED = [
 {id:'unit-crew', name:'Rescue-suit crew', kind:'crew', rig:true,
  prompt:'A SIGNAL LOST rescue-suit astronaut crew member — a low-poly PS1-style game character. Bulky white-and-grey pressure suit, rounded helmet with a dark reflective visor, backpack life-support tanks, segmented reinforced chest and shoulder plates, one warm-amber team-colour accent stripe, heavy gloves and boots, hoses and straps, lightly scuffed and worn. Full body, neutral colours, game-ready.'},
 {id:'unit-captain', name:'Lost captain', kind:'crew', rig:true,
  prompt:'The derelict ship’s lost captain — a low-poly PS1-style game character in a battered grey-green flight suit and open utility vest, no helmet, gaunt weary face, short hair, faded mission patches, a holstered tool, exhausted and haunted. Full body, game-ready.'},
 {id:'unit-chorus', name:'THE CHORUS (monster)', kind:'monster', rig:true,
  prompt:'THE CHORUS — a sound-based mimic horror creature. Humanoid but subtly, deeply wrong: elongated and gaunt with too many joints, pale wet translucent skin, an over-wide vertical throat glowing faint bioluminescent teal, a sunken near-featureless face, long grasping limbs. More grounded and detailed than a low-poly world so it breaks the register and reads as scary. Full body, neutral standing pose, game-ready.'},
 {id:'unit-swarmer', name:'Swarmer', kind:'enemy', rig:true,
  prompt:'A fast many-limbed skittering alien swarmer — a low-poly PS1-style game enemy: hunched chitinous body, multiple thin scuttling legs, a cluster of small pale eyes, wet dark carapace with faint teal underglow, built to run on walls and ceilings. Full body, game-ready.'},
 {id:'unit-crate', name:'Supply crate', kind:'prop', rig:false,
  prompt:'A scuffed industrial sci-fi supply crate prop — low-poly, reinforced corners, hazard stripes, a faded cargo stencil, worn metal and matte plastic, a small amber status light. Game-ready prop.'},
];

let units = {};   // id -> merged {seed..., server meta}
async function loadUnits(){
  let server = {};
  try { const j = await (await fetch('/api/units')).json(); for (const m of (j.items||[])) server[m.id] = m; } catch(e){}
  units = {};
  for (const s of SEED) units[s.id] = {...s, ...(server[s.id]||{})};
  for (const id in server) if (!units[id]) units[id] = {id, name:id, kind:'custom', rig:true, ...server[id]};
  render();
}

const thumbBox = 'width:118px;height:150px;border:1px solid var(--line);border-radius:8px;background:#0c1117;display:grid;place-items:center;overflow:hidden';
const thumbImg = src => `<img src="${src}" style="width:100%;height:100%;object-fit:contain">`;
function thumb(u, view){ const url = u[view+'Url'];
  return url ? thumbImg(url) : `<span style="color:#54616d;font-size:10px;letter-spacing:1px">${view}</span>`; }
function modelTxt(u){ if (u.riggedUrl) return ['✓ rigged model','ok']; if (u.glbUrl) return ['✓ model ready','ok'];
  if (u.model_status==='running') return ['⏳ building…','']; return ['no model yet','']; }

function slot(u, view){ return `
  <div class="vslot" data-view="${view}">
    <div class="vthumb" style="${thumbBox}">${thumb(u,view)}</div>
    <div class="row" style="gap:6px;margin-top:6px;justify-content:center">
      <button class="gen vgen" data-view="${view}" style="padding:5px 9px">✨ ${view}</button>
      <label class="upbtn" title="upload ${view}" style="border:1px solid #2a3a48;border-radius:6px;padding:5px 9px;cursor:pointer">⤓<input type="file" accept="image/*" class="vup" data-view="${view}" hidden></label>
    </div>
  </div>`; }

function render(){
  const wrap = $u('unitlist'); wrap.innerHTML='';
  const list = Object.values(units);
  $u('unitcnt').textContent = list.filter(u=>u.glbUrl||u.riggedUrl).length+'/'+list.length+' modelled';
  for (const u of list){
    const el = document.createElement('div'); el.className='item'; el.dataset.id=u.id;
    if (u.glbUrl||u.riggedUrl) el.classList.add('done');
    const [mtxt, mcls] = modelTxt(u);
    const hasModel = !!(u.glbUrl||u.riggedUrl);
    el.innerHTML = `
      <div class="head"><span class="name">${u.name}</span><span class="tag">${u.kind}</span><span class="id">${u.id}</span></div>
      <label class="lbl">description (drives all 3 view generations)</label>
      <textarea class="uprompt">${u.prompt||''}</textarea>
      <div class="row" style="margin-top:6px"><button class="ugenall gen" style="padding:5px 10px">✨ Generate all 3 views</button><span class="stat" style="margin-left:8px;color:var(--mut)">front · back · side — all required for the model</span></div>
      <div class="row" style="align-items:flex-start;gap:12px;margin-top:10px">
        ${slot(u,'front')}${slot(u,'back')}${slot(u,'side')}
        <div style="flex:1;min-width:220px">
          <label class="lbl">3D model</label>
          <div class="row" style="gap:8px">
            <button class="ubuild">▸ Build 3D model</button>
            <label class="stat"><input type="checkbox" class="urig" ${u.rig?'checked':''}> auto-rig after</label>
          </div>
          <div class="row" style="gap:10px;margin-top:8px">
            <button class="urigbtn" ${hasModel?'':'disabled'}>⛺ Auto-rig now</button>
            <a class="uview" href="/model?id=${u.id}${u.riggedUrl?'&rig=1':''}" target="_blank" style="${hasModel?'':'display:none'}">View 3D ↗</a>
            <a class="udel" href="#" style="color:#54616d;font-size:11px">delete</a>
          </div>
          <div class="genbar ubar"><div class="genbarfill ubarfill"></div></div>
          <div class="stat ustat ${mcls}" style="margin-top:8px">${mtxt}</div>
          <div class="uprev" style="margin-top:8px"></div>
        </div>
      </div>`;
    wire(el, u); wrap.appendChild(el);
  }
}

function ustat(el, txt, cls){ const s=el.querySelector('.ustat'); s.textContent=txt; s.className='stat ustat '+(cls||''); }
function ubar(el, pct){ const bar=el.querySelector('.ubar'), fill=el.querySelector('.ubarfill');
  if (pct==null){ bar.classList.remove('on'); return; } bar.classList.add('on'); fill.style.width=Math.max(3,pct)+'%'; }
function setThumb(el, view, src){ el.querySelector(`.vslot[data-view="${view}"] .vthumb`).innerHTML = thumbImg(src); }
function bumpCount(){ const l=Object.values(units); $u('unitcnt').textContent=l.filter(u=>u.glbUrl||u.riggedUrl).length+'/'+l.length+' modelled'; }

async function genView(u, view, el){
  if (!GK.value.trim()){ ustat(el,'⚠ paste a Gemini key (or use ⤓ upload)','err'); return; }
  const prompt = el.querySelector('.uprompt').value.trim();
  if (!prompt){ ustat(el,'⚠ describe the unit first','err'); return; }
  const btn = el.querySelector(`.vgen[data-view="${view}"]`); btn.disabled=true;
  ustat(el, `✨ generating ${view} view… (20–40s)`+(view==='back'?' — using the front as reference':''), '');
  try{
    const j = await (await fetch('/api/unit-image',{method:'POST',headers:uhdrs(),
      body:JSON.stringify({id:u.id, view, prompt, name:u.name})})).json();
    if (!j.ok){ ustat(el,'✗ '+(j.error||'failed'),'err'); }
    else { setThumb(el, view, j.dataUrl||j.url); u[view+'Url']=j.url; ustat(el, `✓ ${view} view ready — ${fmt2(j.size)}`,'ok'); }
  }catch(e){ ustat(el,'✗ '+e.message,'err'); }
  btn.disabled=false;
}
function downscaleFile(file, max=1024){ return new Promise((res,rej)=>{ const img=new Image();
  img.onload=()=>{ let w=img.width,h=img.height; const s=Math.min(1,max/Math.max(w,h)); w=Math.max(1,Math.round(w*s)); h=Math.max(1,Math.round(h*s));
    const c=document.createElement('canvas'); c.width=w; c.height=h; c.getContext('2d').drawImage(img,0,0,w,h); res(c.toDataURL('image/png')); };
  img.onerror=rej; img.src=URL.createObjectURL(file); }); }
async function uploadView(u, view, file, el){
  ustat(el, `uploading ${view}…`, '');
  try{ const dataUrl = await downscaleFile(file, 1024);
    const j = await (await fetch('/api/unit-image',{method:'POST',headers:uhdrs(),
      body:JSON.stringify({id:u.id, view, name:u.name, prompt:el.querySelector('.uprompt').value.trim(), dataUrl})})).json();
    if (!j.ok){ ustat(el,'✗ '+(j.error||'failed'),'err'); }
    else { setThumb(el, view, dataUrl); u[view+'Url']=j.url; ustat(el, `✓ ${view} uploaded`,'ok'); }
  }catch(e){ ustat(el,'✗ '+e.message,'err'); }
}

async function pollTask(task_id, id, kind, el){
  for(;;){
    await sleep(3000);
    let j; try{ j = await (await fetch(`/api/unit-status?task_id=${encodeURIComponent(task_id)}&id=${encodeURIComponent(id)}&kind=${kind}`,{headers:uhdrs()})).json(); }
    catch(e){ continue; }   // transient network blip — keep polling
    if (!j.ok) return {ok:false, error:j.error||'status error'};
    if (typeof j.progress==='number') ubar(el, j.progress);
    if (j.rendered){ const pv=el.querySelector('.uprev'); if (pv && !pv.dataset.r){ pv.dataset.r='1';
      pv.innerHTML=`<img src="${j.rendered}" title="Tripo preview render" style="max-width:150px;border:1px solid var(--line);border-radius:6px">`; } }
    if (j.status==='success') return {ok:true, ...j};
    if (['failed','banned','expired','cancelled','unknown'].includes(j.status)) return {ok:false, error:'task '+j.status};
    ustat(el, `⏳ ${kind==='rig'?'rigging':'building'}… ${j.status}${j.progress!=null?' '+j.progress+'%':''}`, '');
  }
}
async function genAll(u, el){
  if (!GK.value.trim()){ ustat(el,'⚠ paste a Gemini key (or use ⤓ upload on each slot)','err'); return; }
  const btn=el.querySelector('.ugenall'); btn.disabled=true;
  for (const v of ['front','side','back']) await genView(u, v, el);   // front first so side/back reference it
  btn.disabled=false;
}
async function buildModel(u, el){
  if (!TK.value.trim()){ ustat(el,'⚠ paste your Tripo key first','err'); return; }
  const missing = ['front','back','side'].filter(v=>!u[v+'Url']);
  if (missing.length){ ustat(el,'⚠ all 3 views required — still missing: '+missing.join(', '),'err'); return; }
  const btn=el.querySelector('.ubuild'); btn.disabled=true; ubar(el,3); ustat(el,'submitting to Tripo…','');
  try{
    const j = await (await fetch('/api/unit-model',{method:'POST',headers:uhdrs(),body:JSON.stringify({id:u.id, name:u.name})})).json();
    if (!j.ok){ ustat(el,'✗ '+(j.error||'failed'),'err'); ubar(el,null); btn.disabled=false; return; }
    ustat(el,'⏳ building… queued','');
    const r = await pollTask(j.task_id, u.id, 'model', el); ubar(el,null);
    if (!r.ok){ ustat(el,'✗ '+r.error,'err'); }
    else { u.glbUrl=r.glb; ustat(el, `✓ model ready — ${fmt2(r.size)}`,'ok'); el.classList.add('done'); bumpCount();
      el.querySelector('.uview').style.display=''; el.querySelector('.uview').href='/model?id='+u.id;
      el.querySelector('.urigbtn').disabled=false;
      if (el.querySelector('.urig').checked) await rigModel(u, el); }
  }catch(e){ ustat(el,'✗ '+e.message,'err'); ubar(el,null); }
  btn.disabled=false;
}
async function rigModel(u, el){
  if (!TK.value.trim()){ ustat(el,'⚠ paste your Tripo key first','err'); return; }
  const btn=el.querySelector('.urigbtn'); btn.disabled=true; ubar(el,3); ustat(el,'submitting rig…','');
  try{
    const j = await (await fetch('/api/unit-rig',{method:'POST',headers:uhdrs(),body:JSON.stringify({id:u.id})})).json();
    if (!j.ok){ ustat(el,'✗ '+(j.error||'failed'),'err'); ubar(el,null); btn.disabled=false; return; }
    const r = await pollTask(j.task_id, u.id, 'rig', el); ubar(el,null);
    if (!r.ok){ ustat(el,'✗ '+r.error,'err'); }
    else { u.riggedUrl=r.glb; ustat(el,'✓ rigged model ready','ok');
      const v=el.querySelector('.uview'); v.href='/model?id='+u.id+'&rig=1'; v.style.display=''; }
  }catch(e){ ustat(el,'✗ '+e.message,'err'); ubar(el,null); }
  btn.disabled=false;
}
async function deleteUnit(u, el){
  if (!confirm('Delete “'+u.name+'” and its views + model?')) return;
  try{ await fetch('/api/unit-delete',{method:'POST',headers:uhdrs(),body:JSON.stringify({id:u.id})}); }catch(e){}
  if (SEED.some(s=>s.id===u.id)){ ['frontUrl','backUrl','glbUrl','riggedUrl','model_status','rig_status'].forEach(k=>delete u[k]); }
  else delete units[u.id];
  render();
}
function wire(el, u){
  el.querySelector('.ugenall').onclick=()=>genAll(u, el);
  el.querySelectorAll('.vgen').forEach(b=> b.onclick=()=>genView(u, b.dataset.view, el));
  el.querySelectorAll('.vup').forEach(inp=> inp.onchange=e=>{ const f=e.target.files&&e.target.files[0]; if(f) uploadView(u, inp.dataset.view, f, el); });
  el.querySelector('.ubuild').onclick=()=>buildModel(u, el);
  el.querySelector('.urigbtn').onclick=()=>rigModel(u, el);
  el.querySelector('.udel').onclick=e=>{ e.preventDefault(); deleteUnit(u, el); };
  el.querySelector('.uprompt').addEventListener('input', e=>{ u.prompt=e.target.value; });
}

async function checkBalance(){
  if (!TK.value.trim()){ balEl.textContent='balance — (no key)'; balEl.className='stat'; return; }
  balEl.textContent='checking…'; balEl.className='stat';
  try{ const j = await (await fetch('/api/tripo-balance',{headers:uhdrs()})).json();
    if (!j.ok){ balEl.textContent='✗ '+(j.error||'failed'); balEl.className='stat err'; return; }
    const bal=j.balance||0; balEl.textContent='balance: '+bal+' credits'; balEl.className='stat '+(bal>0?'ok':'err');
    if (bal<=0){ warnEl.style.display='block'; warnEl.innerHTML='⚠ Your Tripo balance is <b>0</b> — model generation will be rejected until you add credit at <a href="https://platform.tripo3d.ai" target="_blank">platform.tripo3d.ai</a>. Front/back views, the UI and the viewer all work now.'; }
    else warnEl.style.display='none';
  }catch(e){ balEl.textContent='✗ '+e.message; balEl.className='stat err'; }
}
$u('tripocheck').onclick=checkBalance;
$u('unitadd').onclick=()=>{ const name=prompt('Unit name?'); if(!name) return;
  const id=('unit-'+name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')).slice(0,40);
  if(units[id]){ alert('A unit with that id already exists.'); return; }
  units[id]={id, name, kind:'custom', rig:true, prompt:''}; render();
  document.querySelector(`#unitlist .item[data-id="${id}"] .uprompt`)?.focus(); };

loadUnits();
if (TK.value.trim()) checkBalance();
