const state = {
  token: sessionStorage.getItem('coopgestion_token') || '',
  user: JSON.parse(sessionStorage.getItem('coopgestion_user') || 'null'),
  view: sessionStorage.getItem('coopgestion_view') || '',
  poll: null,
};

const $ = (id) => document.getElementById(id);
const money = (n) => '$' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const dateOnly = (v) => String(v || '').slice(0,10);
const displayDate = (v) => {
  const d = dateOnly(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return '—';
  const [y,m,day] = d.split('-');
  return `${day}/${m}/${y}`;
};
const initials = (name) => String(name || 'U').trim().split(/\s+/).slice(0,2).map(x => x[0] || '').join('').toUpperCase();

function confirmDialog({ title, message, confirmText = 'Confirmar', cancelText = 'Cancelar', isDanger = false }) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'confirm-dialog';
    dialog.innerHTML = `
      <div class="dialog-body">
        <h3 style="margin-top:0">${esc(title || '¿Estás seguro?')}</h3>
        <p class="muted" style="margin:10px 0 18px;font-size:14px;line-height:1.5">${esc(message)}</p>
        <div style="display:flex;justify-content:flex-end;gap:10px">
          <button type="button" class="secondary" id="btn-dialog-cancel">${esc(cancelText)}</button>
          <button type="button" class="${isDanger ? 'danger' : 'primary'}" id="btn-dialog-confirm">${esc(confirmText)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);
    dialog.showModal();
    const cleanup = (res) => {
      dialog.close();
      dialog.remove();
      resolve(res);
    };
    dialog.querySelector('#btn-dialog-cancel').onclick = () => cleanup(false);
    dialog.querySelector('#btn-dialog-confirm').onclick = () => cleanup(true);
    dialog.oncancel = () => cleanup(false);
  });
}

const memberUiState={search:'',filter:'all',formOpen:false,reactivatingId:null,mono:{checked:false,valid:false,message:'Pendiente de verificación.'}};
const digitsOnly=v=>String(v||'').replace(/\D/g,'');
function formatCUIT(v){const d=digitsOnly(v).slice(0,11);if(d.length<=2)return d;if(d.length<=10)return d.slice(0,2)+'-'+d.slice(2);return d.slice(0,2)+'-'+d.slice(2,10)+'-'+d.slice(10)}
function resetMono(){memberUiState.mono={checked:false,valid:false,message:'Pendiente de verificación.'}}
async function extractPdfText(file){if(!window.pdfjsLib)throw new Error('No se pudo cargar PDF.js.');const data=await file.arrayBuffer();const pdf=await pdfjsLib.getDocument({data}).promise;const out=[];for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i);const c=await p.getTextContent();out.push(c.items.map(x=>x.str).join(' '))}return out.join('\n')}
async function verifyMemberPdf(){const file=$('member-monotributo')?.files?.[0],entered=digitsOnly($('member-cuit')?.value);if(entered.length!==11){notify('Ingresá primero un CUIT válido.','error');return}if(!file){notify('Adjuntá la constancia PDF.','error');return}try{const txt=await extractPdfText(file),low=txt.toLowerCase();const looks=low.includes('monotributo')||low.includes('monotributista')||low.includes('constancia de opcion')||low.includes('constancia de opción');const matches=digitsOnly(txt).includes(entered);memberUiState.mono={checked:true,valid:looks&&matches,message:looks&&matches?'✓ La constancia parece corresponder a monotributo y el CUIT coincide.':looks?'El PDF parece una constancia, pero el CUIT no coincide.':matches?'El CUIT coincide, pero no se identificó como constancia de monotributo.':'No se pudo validar la constancia ni hacer coincidir el CUIT.'};renderMonoResult();renderMemberValidation()}catch(err){memberUiState.mono={checked:true,valid:false,message:'No se pudo leer el PDF.'};renderMonoResult();renderMemberValidation();notify(err.message,'error')}}
function renderMonoResult(){const b=$('member-mono-result');if(!b)return;b.className='mono-result '+(memberUiState.mono.valid?'good':memberUiState.mono.checked?'bad':'pending');b.textContent=memberUiState.mono.message}
function getMemberFormState(members=[]){const fullName=$('member-name')?.value.trim()||'',dni=digitsOnly($('member-dni')?.value),cuit=digitsOnly($('member-cuit')?.value),email=$('member-email')?.value.trim()||'',cap=Number($('member-capital')?.value||0),integrated=Number($('member-initial')?.value||0),file=$('member-monotributo')?.files?.[0]||null,username=$('member-username')?.value.trim()||'',password=$('member-password')?.value||'',duplicate=members.find(m=>digitsOnly(m.cuit)===cuit||digitsOnly(m.dni)===dni);return{fullName,dni,cuit,email,cap,integrated,file,username,password,duplicate,nameOk:fullName.length>=3,dniOk:dni.length>=7,cuitOk:cuit.length===11,emailOk:/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),capitalOk:cap>0&&integrated>=cap*.05&&integrated<=cap,fileOk:!!file&&(file.type==='application/pdf'||/\.pdf$/i.test(file.name))&&file.size<=5*1024*1024,loginOk:username.length>=3&&password.length>=4,monoOk:memberUiState.mono.valid}}
function renderMemberValidation(){const ul=$('member-validation-list');if(!ul)return;const s=getMemberFormState(window.__adminMembers||[]);const isReact=!!memberUiState.reactivatingId;const items=isReact?[[s.fileOk,'Nueva constancia en PDF (máx. 5 MB)'],[s.monoOk,'Constancia verificada y CUIT coincidente']]:[[s.nameOk,'Nombre y apellido completos'],[s.dniOk,'DNI informado'],[s.cuitOk,'CUIT con 11 dígitos'],[s.emailOk,'Correo electrónico válido'],[s.capitalOk,'Aporte inicial entre 5% y 100%'],[s.fileOk,'Constancia en PDF (máx. 5 MB)'],[s.monoOk,'Constancia verificada y CUIT coincidente'],[s.loginOk,'Usuario y contraseña inicial configurados'],[!s.duplicate||(!s.duplicate.active&&!s.duplicate.verification_pending),'Sin DNI/CUIT duplicado activo o pendiente']];ul.innerHTML=items.map(([ok,t])=>`<li class="${ok?'good':'bad'}">${ok?'✓':'✕'} ${t}</li>`).join('');if($('minimum-contribution'))$('minimum-contribution').textContent=money(Math.round(s.cap*.05));if($('integrated-preview'))$('integrated-preview').textContent=money(s.integrated);if($('pending-preview'))$('pending-preview').textContent=money(Math.max(0,s.cap-s.integrated))}
function showMemberDetails(m){
  const roles=(m.roles||[]).length?m.roles:['Asociado'];
  const pending=Math.max(0,Number(m.capital_subscribed||0)-Number(m.capital_integrated||0));
  const docStatus=m.monotributo_stored?'PDF guardado en PostgreSQL':(m.monotributo_file?'Solo nombre histórico; sin contenido binario':'No cargada');
  document.body.insertAdjacentHTML('beforeend',`<dialog id="member-detail-dialog"><div class="dialog-body"><div class="section-head"><div><h2>${esc(m.full_name)}</h2><p class="muted">${esc(roles.join(' · '))}</p></div><button class="secondary" id="close-member-detail">Cerrar</button></div><div class="info-grid">${[['DNI',m.dni],['CUIT',m.cuit],['Correo',m.email||'—'],['Fecha de alta',displayDate(m.joined_on)],['Capital suscripto',money(m.capital_subscribed)],['Capital integrado',money(m.capital_integrated)],['Saldo pendiente',money(pending)],['Monotributo',m.monotributo_status],['Constancia',m.monotributo_file||'No cargada'],['Almacenamiento',docStatus],['Verificación automática',m.monotributo_auto_verified&&m.monotributo_cuit_matched?'PDF válido · CUIT coincidente':'Pendiente / no verificada']].map(([k,v])=>`<div class="info-item"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')}</div>${m.monotributo_stored?`<div class="actions"><button class="secondary" id="download-member-monotributo">Descargar constancia PDF</button></div>`:''}</div></dialog>`);
  const d=$('member-detail-dialog');
  $('close-member-detail').onclick=()=>d.close();
  $('download-member-monotributo')?.addEventListener('click',async()=>{try{await downloadMonotributo(m.id,m.monotributo_file)}catch(err){notify(err.message,'error')}});
  d.addEventListener('close',()=>d.remove(),{once:true});d.showModal();
}



async function fileToBase64(file){
  return await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'');
    reader.onerror=()=>reject(new Error('No se pudo leer el PDF para enviarlo al servidor.'));
    reader.readAsDataURL(file);
  });
}
async function downloadMonotributo(memberId,filename='constancia_monotributo.pdf'){
  const response=await fetch(`/api/members/${memberId}/monotributo`,{headers:{Authorization:`Bearer ${state.token}`}});
  if(!response.ok){let data=null;try{data=await response.json()}catch(_){};throw new Error(data?.error||`Error ${response.status}`)}
  const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=filename||'constancia_monotributo.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function notify(message, type='ok') {
  const box = $('status');
  box.textContent = message;
  box.className = 'status ' + (type === 'error' ? 'error' : 'ok');
  clearTimeout(notify.t);
  notify.t = setTimeout(() => { box.className='status'; box.textContent=''; }, 3500);
}

async function api(path, options={}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(path, { ...options, headers });
  if (response.status === 204) return null;
  let data = null;
  try { data = await response.json(); } catch (_) {}
  if (!response.ok) {
    if (response.status === 401) logout(false);
    throw new Error(data?.error || `Error ${response.status}`);
  }
  return data;
}

function setSession(token, user) {
  state.token = token;
  state.user = user;
  sessionStorage.setItem('coopgestion_token', token);
  sessionStorage.setItem('coopgestion_user', JSON.stringify(user));
}

function logout(show=true) {
  state.token=''; state.user=null; state.view='';
  sessionStorage.removeItem('coopgestion_token');
  sessionStorage.removeItem('coopgestion_user');
  sessionStorage.removeItem('coopgestion_view');
  clearInterval(state.poll); state.poll=null;
  $('app').classList.add('hidden');
  $('login-screen').classList.remove('hidden');
  if (show) $('login-error').style.display='none';
}

$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const error = $('login-error');
  error.style.display='none';
  try {
    const data = await api('/api/auth/login', {
      method:'POST',
      body:JSON.stringify({ username:$('login-user').value.trim(), password:$('login-password').value })
    });
    setSession(data.token, data.user);
    $('login-password').value='';
    await startApp();
  } catch (err) {
    error.textContent = err.message;
    error.style.display='block';
  }
});

const adminViews = [
  ['admin-inicio', 'Inicio', '📊'],
  ['admin-socios', 'Socios y aportes', '👥'],
  ['admin-trabajo', 'Trabajo', '⏱️'],
  ['admin-retribuciones', 'Retribuciones', '💳'],
  ['admin-finanzas', 'Ingresos y gastos', '📈'],
  ['admin-retiros', 'Excedentes (Ley 20.337)', '⚖️'],
  ['admin-fondos', 'Fondos', '🏛️'],
  ['admin-asamblea', 'Asamblea', '🗳️'],
  ['admin-historial', 'Historial de asambleas', '📜'],
  ['admin-suscripcion', 'Suscripción y Plan', '⭐']
];
const assocViews = [
  ['assoc-inicio', 'Inicio', '📊'],
  ['assoc-perfil', 'Mi perfil', '👤'],
  ['assoc-horas', 'Mis horas', '⏱️'],
  ['assoc-retribucion', 'Mi retribución', '💳'],
  ['assoc-asamblea', 'Asamblea', '🗳️']
];

function closeDrawer() {
  $('sidebar')?.classList.remove('open');
  $('sidebar-backdrop')?.classList.remove('open');
}

async function updateTopbarPlan() {
  const el = $('topbar-plan');
  if (!el || state.user?.role !== 'admin') {
    if (el) {
      el.innerHTML = '';
    }
    return;
  }
  try {
    const sub = await api('/api/subscription');
    const isFree = sub.plan === 'free';
    if (isFree) {
      el.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;background:var(--warn-soft);border:1px solid var(--warn-border);padding:4px 10px;border-radius:999px;font-size:12px;">
          <span style="font-weight:750;color:var(--warn)">🌱 Plan Semilla (${sub.activeCount}/${sub.maxMembers} socios)</span>
          <button type="button" id="btn-topbar-upgrade" class="primary" style="padding:3px 8px;font-size:11px;border-radius:6px;cursor:pointer">Mejorar</button>
        </div>
      `;
      $('btn-topbar-upgrade')?.addEventListener('click', () => go('admin-suscripcion'));
    } else {
      el.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;background:var(--ok-soft);border:1px solid var(--ok-border);padding:4px 10px;border-radius:999px;font-size:12px;color:var(--ok);cursor:pointer;" id="badge-topbar-pro">
          <span style="font-weight:800">⭐ Plan Profesional</span>
          <span class="helper" style="color:var(--ok)">· ${sub.activeCount} socios</span>
        </div>
      `;
      $('badge-topbar-pro')?.addEventListener('click', () => go('admin-suscripcion'));
    }
  } catch (_) {
    el.innerHTML = '';
  }
}

function buildNav() {
  const views = state.user.role === 'admin' ? adminViews : assocViews;
  $('sidebar-subtitle').textContent = state.user.role === 'admin' ? 'Administración' : 'Portal del asociado';
  $('nav').innerHTML = views.map(([id, label, icon]) => `
    <button type="button" data-view="${id}">
      <span class="nav-icon">${icon || '•'}</span>
      <span class="nav-label">${esc(label)}</span>
    </button>
  `).join('') + `
    <button type="button" id="logout" class="logout">
      <span class="nav-icon">🚪</span>
      <span class="nav-label">Cerrar sesión</span>
    </button>
  `;
  $('nav').querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => go(btn.dataset.view)));
  $('logout').addEventListener('click', () => logout());
}

function go(view) {
  closeDrawer();
  state.view = view;
  sessionStorage.setItem('coopgestion_view', view);
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === view));
  document.querySelectorAll('#nav [data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  const all = [...adminViews, ...assocViews];
  $('page-title').textContent = all.find(x => x[0]===view)?.[1] || 'CoopGestión';
  refreshCurrentView().catch(err => notify(err.message,'error'));
}

async function startApp() {
  try {
    await api('/api/me');
  } catch (err) {
    logout(false);
    $('login-error').textContent=err.message;
    $('login-error').style.display='block';
    return;
  }
  $('login-screen').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('user-name').textContent = state.user.displayName;
  $('user-role').textContent = state.user.role === 'admin' ? 'Administrador' : 'Asociado';
  $('user-avatar').textContent = initials(state.user.displayName);
  $('menu-toggle')?.addEventListener('click', () => {
    $('sidebar')?.classList.toggle('open');
    $('sidebar-backdrop')?.classList.toggle('open');
  });
  $('sidebar-backdrop')?.addEventListener('click', closeDrawer);
  buildNav();
  const validViews = (state.user.role === 'admin' ? adminViews : assocViews).map(x=>x[0]);
  const first = validViews.includes(state.view) ? state.view : validViews[0];
  go(first);
  clearInterval(state.poll);
  state.poll = setInterval(() => {
    const tag=document.activeElement?.tagName;
    if (['INPUT','TEXTAREA','SELECT'].includes(tag) || document.visibilityState!=='visible') return;
    refreshCurrentView(true).catch(()=>{});
  }, 3000);
}

async function refreshCurrentView(silent=false) {
  if (!state.token || !state.view) return;
  updateTopbarPlan().catch(()=>{});
  const renderers = {
    'admin-inicio': renderAdminHome,
    'admin-socios': renderAdminMembers,
    'admin-trabajo': renderAdminWork,
    'admin-retribuciones': renderAdminRetributions,
    'admin-finanzas': renderAdminFinance,
    'admin-retiros': renderAdminWithdrawals,
    'admin-fondos': renderAdminFunds,
    'admin-asamblea': renderAdminAssembly,
    'admin-historial': renderAdminHistory,
    'admin-suscripcion': renderAdminSubscription,
    'assoc-inicio': renderAssociateHome,
    'assoc-perfil': renderAssociateProfile,
    'assoc-horas': renderAssociateHours,
    'assoc-retribucion': renderAssociateRetribution,
    'assoc-asamblea': renderAssociateAssembly,
  };
  if (renderers[state.view]) await renderers[state.view](silent);
}

async function renderAdminHome() {
  const [members, work, motions, retributions, sub] = await Promise.all([
    api('/api/members'), api('/api/work-logs'), api('/api/motions'), api('/api/retributions'),
    api('/api/subscription').catch(() => ({ plan: 'free', activeCount: 0, maxMembers: 5, isLimitReached: false }))
  ]);
  const active = members.filter(m=>m.active && !m.verification_pending).length;
  const hours = work.reduce((s,x)=>s+Number(x.hours||0),0);
  const total = retributions.reduce((s,x)=>s+Number(x.total||0),0);
  const isFree = sub.plan === 'free';
  const percentage = isFree ? Math.min(100, Math.round(((sub.activeCount || active) / (sub.maxMembers || 5)) * 100)) : 100;

  $('admin-inicio').innerHTML = `
    <div class="grid3">
      <div class="card metric-card metric-clickable" id="home-metric-members" title="Ver gestión de socios">
        <div class="metric-top">
          <div class="metric-label">Socios activos</div>
          <div class="metric-icon">👥</div>
        </div>
        <div class="metric">${active}</div>
        <div class="metric-footer">
          <span>Administración de socios</span>
          <span>Ver padrón ↗</span>
        </div>
      </div>
      <div class="card metric-card metric-clickable" id="home-metric-work" title="Ver registro de trabajo">
        <div class="metric-top">
          <div class="metric-label">Horas registradas</div>
          <div class="metric-icon">⏱️</div>
        </div>
        <div class="metric">${hours.toLocaleString('es-AR')} h</div>
        <div class="metric-footer">
          <span>Libro de horas del ejercicio</span>
          <span>Ver horas ↗</span>
        </div>
      </div>
      <div class="card metric-card metric-clickable" id="home-metric-retributions" title="Ver retribuciones">
        <div class="metric-top">
          <div class="metric-label">Retribuciones calculadas</div>
          <div class="metric-icon">💳</div>
        </div>
        <div class="metric">${money(total)}</div>
        <div class="metric-footer">
          <span>Liquidación periódica</span>
          <span>Liquidar ↗</span>
        </div>
      </div>
    </div>

    <div class="card metric-clickable" id="home-sub-card" style="margin-top:20px;border:1px solid ${isFree ? 'var(--border)' : 'var(--border-focus)'};background:${isFree ? 'var(--panel)' : 'linear-gradient(180deg,#ffffff,var(--accent-soft))'}">
      <div class="section-head" style="margin-bottom:10px">
        <div>
          <div class="metric-label">Suscripción y Escala de la Cooperativa</div>
          <strong style="font-size:18px;display:block;margin-top:2px">${isFree ? '🌱 Plan Semilla (Gratuito)' : '⭐ Plan Profesional (Premium)'}</strong>
        </div>
        <span class="badge ${isFree ? (sub.isLimitReached ? 'off' : 'pending') : 'ok'}">
          ${isFree ? (sub.isLimitReached ? 'Cupo lleno (5/5)' : 'Activo') : 'Asociados ilimitados'}
        </span>
      </div>
      ${isFree ? `
        <div class="helper" style="font-size:13px">Cupo de asociados activos: <strong>${sub.activeCount || active} de ${sub.maxMembers || 5}</strong> (${percentage}%)</div>
        <div class="quota-bar-wrapper">
          <div class="quota-bar-fill" style="width:${percentage}%;background:${sub.isLimitReached ? 'var(--danger)' : 'var(--accent)'}"></div>
        </div>
        <div style="margin-top:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <span class="helper">${sub.isLimitReached ? 'Límite alcanzado: pasá a Plan Profesional para habilitar altas adicionales.' : 'Cooperativa en formación: podés sumar miembros hasta el tope de 5.'}</span>
          <button class="primary" style="font-size:12.5px;padding:7px 14px" id="btn-home-manage-sub">${sub.isLimitReached ? '⭐ Mejorar a Pro' : 'Ver planes'}</button>
        </div>
      ` : `
        <div class="helper" style="color:var(--ok);font-size:13.5px">✓ Cooperativa habilitada para crecimiento sin límites y distribución oficial de excedentes (Ley 20.337).</div>
        <div style="margin-top:12px;text-align:right">
          <button class="secondary" style="font-size:12.5px;padding:7px 14px" id="btn-home-manage-sub">Administrar suscripción</button>
        </div>
      `}
    </div>

    <div class="card metric-clickable" id="home-motion-card" style="margin-top:20px" title="Ver asamblea">
      <h3>Actividad compartida e institucional</h3>
      <p class="muted" style="line-height:1.6">Los asociados registran sus horas de labor y emiten sus votos democráticos desde su portal. El Consejo de Administración supervisa y valida la información en tiempo real.</p>
      <div class="notice">Mociones abiertas: <strong>${motions.length}</strong> · Click para gestionar asamblea</div>
    </div>`;

  $('home-metric-members')?.addEventListener('click', () => go('admin-socios'));
  $('home-metric-work')?.addEventListener('click', () => go('admin-trabajo'));
  $('home-metric-retributions')?.addEventListener('click', () => go('admin-retribuciones'));
  $('home-sub-card')?.addEventListener('click', (e) => {
    if (e.target.tagName !== 'BUTTON') go('admin-suscripcion');
  });
  $('btn-home-manage-sub')?.addEventListener('click', () => go('admin-suscripcion'));
  $('home-motion-card')?.addEventListener('click', () => go('admin-asamblea'));
}

async function renderAdminMembers() {
  const [members,authorities,sub]=await Promise.all([api('/api/members'),api('/api/authorities'),api('/api/subscription').catch(()=>null)]);
  window.__adminMembers=members;
  const q=(memberUiState.search||'').toLowerCase();
  const filtered=members.filter(m=>{const statusOk=memberUiState.filter==='all'||(memberUiState.filter==='active'&&m.active&&!m.verification_pending)||(memberUiState.filter==='pending'&&m.verification_pending)||(memberUiState.filter==='inactive'&&!m.active&&!m.verification_pending);const hay=[m.full_name,m.dni,m.cuit,m.email,...(m.roles||[])].join(' ').toLowerCase();return statusOk&&(!q||hay.includes(q))});
  const active=members.filter(m=>m.active&&!m.verification_pending),byRole=Object.fromEntries(authorities.map(a=>[a.role,a]));
  const authorityCards=['Presidente','Secretario','Tesorero'].map(role=>{const cur=byRole[role];return `<div class="authority-card"><div class="authority-icon">${role[0]}</div><div><div class="helper authority-label">${role}</div><strong>${esc(cur?.full_name||'Sin asignar')}</strong></div><select data-authority-role="${role}">${active.map(m=>`<option value="${m.id}" ${cur&&Number(cur.member_id)===Number(m.id)?'selected':''}>${esc(m.full_name)}${(m.roles||[]).length?` (${esc((m.roles||[]).join(', '))})`:''}</option>`).join('')}</select></div>`}).join('');
  const isLimitReached=sub?.isLimitReached;
  const subInfo=sub?`<div style="margin-top:6px;display:flex;align-items:center;gap:8px"><span class="badge ${sub.plan==='free'?'pending':'ok'}">${esc(sub.planName)}: ${sub.activeCount}${sub.maxMembers?` / ${sub.maxMembers} socios`:' socios'}</span>${isLimitReached?`<span class="danger-text" style="font-weight:750;font-size:13px">Límite alcanzado. Pasá a Premium para incorporar más miembros.</span>`:''}</div>`:'';

  $('admin-socios').innerHTML=`
    <div class="members-intro"><div><h2>Gestión de socios</h2><p class="muted">Altas, capital social, verificación, autoridades y bajas guardadas en PostgreSQL.</p>${subInfo}</div><div class="row-actions">${isLimitReached ? `<button id="show-member-form" class="secondary" style="border:1px dashed #cbd5e1;color:var(--muted);cursor:pointer" title="Cupo lleno en Plan Semilla (5/5)">🔒 Cupo lleno (5/5)</button><button id="btn-upgrade-members" class="primary" style="background:#067647">⭐ Mejorar a Pro</button>` : `<button id="show-member-form" class="primary">＋ Nuevo socio</button>`}<button id="export-members" class="secondary">Exportar datos</button></div></div>
    <form id="member-form" class="form-card ${memberUiState.formOpen?'':'hidden'}" novalidate>
      <div class="section-head"><div><h2>${memberUiState.reactivatingId?'Reincorporar socio':'Nuevo socio'}</h2><p class="muted">${memberUiState.reactivatingId?'Adjuntá una nueva constancia para iniciar la reincorporación.':'El alta queda pendiente hasta que Administración la apruebe.'}</p></div><button id="cancel-member" class="secondary" type="button">Cancelar</button></div>
      <div class="form-grid"><label>Nombre y apellido *<input id="member-name" maxlength="120"></label><label>DNI *<input id="member-dni" inputmode="numeric" maxlength="12"></label><label>CUIT *<input id="member-cuit" inputmode="numeric" maxlength="13"></label><label>Correo electrónico *<input id="member-email" type="email"></label></div>
      <hr class="divider"><h3>Capital social</h3><div class="form-grid"><label>Capital suscripto ($) *<input id="member-capital" type="number" min="1" step="1000" value="370000"></label><label>Aporte inicial integrado ($) *<input id="member-initial" type="number" min="0" step="100" value="18500"><div class="helper">Mínimo 5% del capital suscripto.</div></label></div>
      <div class="capital-summary"><div><span>Mínimo requerido (5%)</span><strong id="minimum-contribution">$18.500</strong></div><div><span>Capital integrado</span><strong id="integrated-preview">$18.500</strong></div><div><span>Saldo pendiente</span><strong id="pending-preview">$351.500</strong></div></div>
      <hr class="divider"><h3>Monotributo</h3><div class="mono-upload-card"><label>Constancia de monotributo (PDF) *<input id="member-monotributo" type="file" accept="application/pdf,.pdf"><div class="helper">El sistema lee el PDF y compara su CUIT con el ingresado.</div></label><div class="mono-check-card"><div><strong>Verificación automática</strong><div class="helper">Contenido del documento + coincidencia de CUIT</div></div><button id="verify-monotributo" class="secondary" type="button">Verificar constancia</button></div><div id="member-mono-result" class="mono-result pending">Pendiente de verificación.</div></div>
      <div class="review-note"><div><strong>Revisión administrativa</strong><p>Después del alta queda pendiente hasta que un administrador la habilite.</p></div><span class="badge pending">Pendiente de revisión</span></div>
      <div id="member-login-section"><hr class="divider"><h3>Acceso del asociado</h3><div class="form-grid"><label>Usuario *<input id="member-username" maxlength="80" placeholder="Ej. ana"></label><label>Contraseña inicial *<input id="member-password" type="password" minlength="4" placeholder="Mínimo 4 caracteres"></label></div><div class="notice" style="margin-top:12px">El usuario se crea deshabilitado y se activa al aprobar el alta.</div></div>
      <div class="validation-box"><strong>Requisitos para completar</strong><ul id="member-validation-list"></ul></div><div class="actions"><button class="primary" type="submit">${memberUiState.reactivatingId?'Solicitar reincorporación':'Registrar alta'}</button></div>
    </form>
    <section class="authorities-panel"><div class="section-head"><div><h2>Autoridades de la cooperativa</h2><p class="muted">Los cargos deben permanecer asignados. El Presidente puede acumular Secretaría y/o Tesorería.</p></div><span class="badge info">3 cargos</span></div><div class="authority-grid">${authorityCards}</div></section>
    <section class="member-list-panel"><div class="member-list-head"><div><h2>Listado de socios</h2><p class="muted">Buscá por nombre, DNI, CUIT, correo o cargo.</p></div><div class="member-filters"><input id="member-search" type="search" placeholder="Buscar socio" value="${esc(memberUiState.search)}"><select id="member-filter"><option value="all" ${memberUiState.filter==='all'?'selected':''}>Todos</option><option value="active" ${memberUiState.filter==='active'?'selected':''}>Activos</option><option value="pending" ${memberUiState.filter==='pending'?'selected':''}>Pendientes</option><option value="inactive" ${memberUiState.filter==='inactive'?'selected':''}>Bajas</option></select></div></div>
      <div class="list">${filtered.length?filtered.map(m=>{const roles=(m.roles||[]).length?m.roles:['Asociado'],status=m.verification_pending?'Pendiente de verificación':m.active?'Activo':'Baja',statusClass=m.verification_pending?'pending':m.active?'':'off';return `<article class="member-row"><div class="member-avatar">${initials(m.full_name)}</div><div class="row-main"><div class="member-title"><strong>${esc(m.full_name)}</strong><span class="badge ${statusClass}">${status}</span></div><div class="muted">${esc(m.email||'Sin correo')} · CUIT ${esc(m.cuit)}</div><div style="margin-top:7px">${roles.map(r=>`<span class="badge info">${esc(r)}</span>`).join(' ')}</div></div><div class="row-actions"><button class="secondary" data-member-detail="${m.id}">Ver detalle</button>${m.verification_pending?`<button class="primary" data-member-approve="${m.id}">Aprobar alta</button>`:''}${m.active&&!m.verification_pending?`<button class="danger" data-member-deactivate="${m.id}">Registrar baja</button>`:''}${!m.active&&!m.verification_pending?`<button class="secondary" data-member-reactivate="${m.id}">Reincorporar</button>`:''}</div></article>`}).join(''):'<div class="empty">No encontramos socios con esos filtros.</div>'}</div>
    </section>`;
  renderMonoResult();if(memberUiState.formOpen)renderMemberValidation();
  $('btn-upgrade-members')?.addEventListener('click', () => go('admin-suscripcion'));
  $('show-member-form').onclick = () => {
    if (isLimitReached) {
      notify('Límite del Plan Semilla alcanzado (5 asociados). Mejorá al Plan Profesional para incorporar más miembros.', 'error');
      go('admin-suscripcion');
      return;
    }
    memberUiState.formOpen = true;
    memberUiState.reactivatingId = null;
    resetMono();
    renderAdminMembers();
  };
  $('cancel-member')?.addEventListener('click', () => {
    memberUiState.formOpen = false;
    memberUiState.reactivatingId = null;
    resetMono();
    renderAdminMembers();
  });
  $('member-search').oninput = (e) => {
    memberUiState.search = e.target.value;
    renderAdminMembers();
  };
  $('member-filter').onchange = (e) => {
    memberUiState.filter = e.target.value;
    renderAdminMembers();
  };
  $('export-members').onclick = () => {
    const blob = new Blob([JSON.stringify(members, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'socios_coopgestion.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  };
  document.querySelectorAll('[data-authority-role]').forEach(sel => sel.onchange = async () => {
    try {
      await api('/api/authorities/' + encodeURIComponent(sel.dataset.authorityRole), {
        method: 'PUT',
        body: JSON.stringify({ memberId: Number(sel.value) })
      });
      notify('Autoridad actualizada.');
      await renderAdminMembers();
    } catch (err) {
      notify(err.message, 'error');
      await renderAdminMembers();
    }
  });
  if (memberUiState.formOpen) {
    ['member-name', 'member-dni', 'member-email', 'member-capital', 'member-initial', 'member-username', 'member-password'].forEach(id => $(id)?.addEventListener('input', renderMemberValidation));
    $('member-cuit').addEventListener('input', (e) => {
      e.target.value = formatCUIT(e.target.value);
      resetMono();
      renderMonoResult();
      renderMemberValidation();
    });
    $('member-monotributo').addEventListener('change', () => {
      resetMono();
      renderMonoResult();
      renderMemberValidation();
    });
    $('verify-monotributo').onclick = verifyMemberPdf;
    $('member-name').addEventListener('input', () => {
      if (!memberUiState.reactivatingId && !$('member-username').value.trim()) {
        $('member-username').value = $('member-name').value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\s+/)[0].replace(/[^a-z0-9._-]/g, '');
        renderMemberValidation();
      }
    });
    $('member-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const s = getMemberFormState(members);
      if (memberUiState.reactivatingId) {
        if (!s.fileOk || !s.monoOk) {
          notify('Para reincorporar se requiere una nueva constancia verificada.', 'error');
          return;
        }
        try {
          const monotributoContentBase64 = await fileToBase64(s.file);
          await api('/api/members/' + memberUiState.reactivatingId + '/reactivate', {
            method: 'POST',
            body: JSON.stringify({
              monotributoFile: s.file.name,
              monotributoMimeType: s.file.type || 'application/pdf',
              monotributoContentBase64,
              monotributoAutoVerified: true,
              monotributoCuitMatched: true
            })
          });
          notify('Reincorporación pendiente de revisión. La nueva constancia quedó guardada en PostgreSQL.');
          memberUiState.formOpen = false;
          memberUiState.reactivatingId = null;
          resetMono();
          await renderAdminMembers();
        } catch (err) {
          notify(err.message, 'error');
        }
        return;
      }
      if (![s.nameOk, s.dniOk, s.cuitOk, s.emailOk, s.capitalOk, s.fileOk, s.monoOk, s.loginOk].every(Boolean)) {
        notify('Revisá los requisitos antes de registrar.', 'error');
        renderMemberValidation();
        return;
      }
      if (s.duplicate) {
        notify(s.duplicate.active || s.duplicate.verification_pending ? 'Ya existe un socio o alta pendiente con ese DNI/CUIT.' : 'Ese DNI/CUIT pertenece a un ex-socio. Usá Reincorporar.', 'error');
        return;
      }
      try {
        const monotributoContentBase64 = await fileToBase64(s.file);
        await api('/api/members', {
          method: 'POST',
          body: JSON.stringify({
            fullName: s.fullName,
            dni: s.dni,
            cuit: formatCUIT(s.cuit),
            email: s.email,
            capitalSubscribed: s.cap,
            capitalIntegrated: s.integrated,
            monotributoFile: s.file.name,
            monotributoMimeType: s.file.type || 'application/pdf',
            monotributoContentBase64,
            monotributoAutoVerified: true,
            monotributoCuitMatched: true,
            username: s.username,
            password: s.password
          })
        });
        notify('Alta registrada. La constancia quedó guardada en PostgreSQL y el socio pendiente de verificación.');
        memberUiState.formOpen = false;
        resetMono();
        await renderAdminMembers();
      } catch (err) {
        notify(err.message, 'error');
      }
    });
  }
  document.querySelectorAll('[data-member-detail]').forEach(btn => btn.onclick = () => showMemberDetails(members.find(m => String(m.id) === btn.dataset.memberDetail)));
  document.querySelectorAll('[data-member-approve]').forEach(btn => btn.onclick = async () => {
    const ok = await confirmDialog({
      title: 'Aprobar alta de asociado',
      message: '¿Confirmás el alta formal y habilitación de acceso al sistema para este asociado?',
      confirmText: 'Aprobar alta'
    });
    if (!ok) return;
    try {
      await api('/api/members/' + btn.dataset.memberApprove + '/approve', { method: 'POST' });
      notify('Socio habilitado.');
      await renderAdminMembers();
    } catch (err) {
      notify(err.message, 'error');
    }
  });
  document.querySelectorAll('[data-member-deactivate]').forEach(btn => btn.onclick = async () => {
    const ok = await confirmDialog({
      title: 'Registrar baja de asociado',
      message: '¿Estás seguro de registrar la baja? El socio perderá acceso al sistema y no computará para quórum.',
      confirmText: 'Registrar baja',
      isDanger: true
    });
    if (!ok) return;
    try {
      await api('/api/members/' + btn.dataset.memberDeactivate + '/deactivate', { method: 'POST' });
      notify('Baja registrada.');
      await renderAdminMembers();
    } catch (err) {
      notify(err.message, 'error');
    }
  });
  document.querySelectorAll('[data-member-reactivate]').forEach(btn => btn.onclick = () => {
    if (isLimitReached) {
      notify('Límite del Plan Semilla alcanzado (5 asociados). Mejorá al Plan Profesional para reincorporar asociados.', 'error');
      go('admin-suscripcion');
      return;
    }
    const m = members.find(x => String(x.id) === btn.dataset.memberReactivate);
    memberUiState.formOpen = true;
    memberUiState.reactivatingId = m.id;
    resetMono();
    renderAdminMembers().then(() => {
      $('member-name').value = m.full_name;
      $('member-dni').value = m.dni;
      $('member-cuit').value = m.cuit;
      $('member-email').value = m.email || '';
      $('member-capital').value = m.capital_subscribed;
      $('member-initial').value = m.capital_integrated;
      ['member-name', 'member-dni', 'member-cuit', 'member-email', 'member-capital', 'member-initial'].forEach(id => $(id).disabled = true);
      $('member-login-section').classList.add('hidden');
      renderMemberValidation();
    });
  });
}

async function renderAdminWork() {
  const [logs,members] = await Promise.all([api('/api/work-logs'),api('/api/members')]);
  const activeMembers = members.filter(m=>m.active&&!m.verification_pending);
  $('admin-trabajo').innerHTML = `
    <div class="split">
      <form id="admin-work-form" class="form-card">
        <h3>Registrar horas</h3><p class="muted">Administración también puede cargar horas manualmente.</p>
        <label>Socio<select id="admin-work-member">${activeMembers.map(m=>`<option value="${m.id}">${esc(m.full_name)}</option>`).join('')}</select></label>
        <label>Fecha<input id="admin-work-date" type="date" required></label>
        <label>Horas<input id="admin-work-hours" type="number" min="0.5" max="23.5" step="0.5" required></label>
        <label>Descripción<textarea id="admin-work-description" rows="2" maxlength="180"></textarea></label>
        <div class="actions"><button class="primary">Registrar</button></div>
      </form>
      <div><div class="section-head"><div><h2>Historial de trabajo</h2><p class="muted">Incluye cargas hechas por Administración y por cada asociado.</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>Socio</th><th>Fecha</th><th>Horas</th><th>Detalle</th><th>Tipo</th><th></th></tr></thead><tbody>
        ${logs.map(x=>`<tr><td><strong>${esc(x.full_name)}</strong></td><td>${displayDate(x.work_date)}</td><td>${Number(x.hours).toLocaleString('es-AR')} h</td><td>${esc(x.description||'—')}</td><td>${x.special?'<span class="badge info">Domingo / feriado</span>':'Habitual'}</td><td><button class="danger" data-delete-work="${x.id}">Eliminar</button></td></tr>`).join('')}
      </tbody></table></div></div>
    </div>`;
  $('admin-work-date').value = new Date().toISOString().slice(0,10);
  $('admin-work-form').addEventListener('submit', async e=>{
    e.preventDefault();
    try {
      await api('/api/work-logs',{method:'POST',body:JSON.stringify({memberId:Number($('admin-work-member').value),workDate:$('admin-work-date').value,hours:Number($('admin-work-hours').value),description:$('admin-work-description').value})});
      notify('Horas registradas.'); await renderAdminWork();
    } catch(err){notify(err.message,'error')}
  });
  document.querySelectorAll('[data-delete-work]').forEach(btn=>btn.addEventListener('click',async()=>{
    const ok = await confirmDialog({
      title: 'Eliminar horas',
      message: '¿Estás seguro de eliminar este registro de horas de trabajo?',
      confirmText: 'Eliminar',
      isDanger: true
    });
    if(!ok) return;
    try{await api('/api/work-logs/'+btn.dataset.deleteWork,{method:'DELETE'});notify('Registro eliminado.');await renderAdminWork()}catch(err){notify(err.message,'error')}
  }));
}

async function renderAdminRetributions() {
  const [cfg,rows] = await Promise.all([api('/api/retribution/settings'),api('/api/retributions')]);
  const hasPending = rows.some(x => Number(x.transferred_amount) !== Number(x.total) && Number(x.total) > 0);
  $('admin-retribuciones').innerHTML = `
    <div class="grid2">
      <form id="rate-form" class="form-card"><h3>Configuración</h3>
        <div class="form-grid"><label>Valor hora habitual ($)<input id="normal-rate" type="number" min="0" step="100" value="${cfg.normal_rate}"></label><label>Domingo / feriado ($)<input id="special-rate" type="number" min="0" step="100" value="${cfg.special_rate}"></label></div>
        <div class="actions"><button class="primary">Guardar tarifas</button></div><hr class="divider">
        <h3>Feriados nacionales</h3><div class="form-grid"><label>Fecha<input id="holiday-date" type="date"></label><label>Descripción<input id="holiday-description" placeholder="Ej. Día de la Soberanía"></label></div><div class="actions"><button id="add-holiday" type="button" class="secondary">Agregar feriado</button></div>
        <div class="list" style="margin-top:12px">${cfg.holidays.length?cfg.holidays.map(h=>`<div class="row-card"><div><strong>${displayDate(h.holiday_date)}</strong><div class="helper">${esc(h.description)}</div></div><button class="danger" data-holiday="${dateOnly(h.holiday_date)}">Quitar</button></div>`).join(''):'<div class="empty">No hay feriados cargados.</div>'}</div>
      </form>
      <div>
        <div class="section-head">
          <div>
            <h2>Retribuciones</h2>
            <p class="muted">Cálculo sobre las horas guardadas en base de datos.</p>
          </div>
          ${hasPending ? `<button id="btn-transfer-all" class="primary" style="font-size:12px;padding:8px 12px">⚡ Registrar todas las transferencias</button>` : ''}
        </div>
        <div class="list">${rows.map(x=>`<article class="card"><div class="section-head"><div><strong>${esc(x.member.full_name)}</strong><div class="helper">${x.normal_hours} h habituales · ${x.special_hours} h especiales</div></div><div><strong>${money(x.total)}</strong></div></div><div class="helper">Habituales: ${money(x.normal_amount)} · Especiales: ${money(x.special_amount)}</div><div class="actions">${Number(x.transferred_amount)===Number(x.total)&&Number(x.total)>0?'<span class="badge">Transferencia registrada</span>':`<button class="primary" data-transfer="${x.member.id}">Registrar transferencia</button>`}</div></article>`).join('')}</div>
      </div>
    </div>`;
  $('rate-form').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/retribution/settings',{method:'PUT',body:JSON.stringify({normalRate:Number($('normal-rate').value),specialRate:Number($('special-rate').value)})});notify('Tarifas actualizadas.');await renderAdminRetributions()}catch(err){notify(err.message,'error')}});
  $('add-holiday').addEventListener('click',async()=>{try{await api('/api/holidays',{method:'POST',body:JSON.stringify({date:$('holiday-date').value,description:$('holiday-description').value})});notify('Feriado agregado.');await renderAdminRetributions()}catch(err){notify(err.message,'error')}});
  document.querySelectorAll('[data-holiday]').forEach(btn=>btn.addEventListener('click',async()=>{try{await api('/api/holidays/'+btn.dataset.holiday,{method:'DELETE'});notify('Feriado eliminado.');await renderAdminRetributions()}catch(err){notify(err.message,'error')}}));
  document.querySelectorAll('[data-transfer]').forEach(btn=>btn.addEventListener('click',async()=>{try{await api('/api/retributions/'+btn.dataset.transfer+'/transfer',{method:'POST'});notify('Transferencia registrada.');await renderAdminRetributions()}catch(err){notify(err.message,'error')}}));
  $('btn-transfer-all')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Transferencias masivas',
      message: '¿Confirmás registrar la transferencia de retribución para todos los asociados con saldos pendientes?',
      confirmText: 'Registrar todas'
    });
    if (!ok) return;
    try {
      const res = await api('/api/retributions/transfer-all', { method: 'POST' });
      notify(res.message, 'ok');
      await renderAdminRetributions();
    } catch (err) {
      notify(err.message, 'error');
    }
  });
}



async function renderAdminFinance(){
  const rows=await api('/api/financial-movements');
  const income=rows.filter(x=>x.movement_type==='Ingreso').reduce((s,x)=>s+Number(x.amount||0),0),expense=rows.filter(x=>x.movement_type==='Gasto').reduce((s,x)=>s+Number(x.amount||0),0);
  $('admin-finanzas').innerHTML=`<div class="grid3"><div class="card"><div class="metric-label">Ingresos</div><div class="metric">${money(income)}</div></div><div class="card"><div class="metric-label">Gastos</div><div class="metric">${money(expense)}</div></div><div class="card"><div class="metric-label">Saldo</div><div class="metric">${money(income-expense)}</div></div></div><form id="finance-form" class="form-card" style="margin-top:14px"><h3>Registrar movimiento</h3><div class="form-grid"><label>Tipo<select id="finance-type"><option>Ingreso</option><option>Gasto</option></select></label><label>Concepto<input id="finance-concept" maxlength="120" required></label><label>Monto ($)<input id="finance-amount" type="number" min="1" step="100" required></label><label>Fecha<input id="finance-date" type="date" required></label></div><div class="actions"><button class="primary">Registrar</button></div></form><div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th>Monto</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${displayDate(x.movement_date)}</td><td>${esc(x.movement_type)}</td><td>${esc(x.concept)}</td><td>${money(x.amount)}</td></tr>`).join('')}</tbody></table></div>`;
  $('finance-date').value=new Date().toISOString().slice(0,10);$('finance-form').onsubmit=async e=>{e.preventDefault();try{await api('/api/financial-movements',{method:'POST',body:JSON.stringify({movementType:$('finance-type').value,concept:$('finance-concept').value,amount:Number($('finance-amount').value),movementDate:$('finance-date').value})});notify('Movimiento registrado.');await renderAdminFinance()}catch(err){notify(err.message,'error')}};
}

function renderSurplusBreakdownHtml(data, isFree) {
  return `
    <div class="grid3" style="margin-bottom:14px">
      <div class="card soft">
        <div class="metric-label">Reserva Legal (5%)</div>
        <div class="metric">${money(data.reserveLegal)}</div>
        <div class="helper">Art. 42 inc. 1 Ley 20.337</div>
      </div>
      <div class="card soft">
        <div class="metric-label">Educación y Capacitación (5%)</div>
        <div class="metric">${money(data.educationFund)}</div>
        <div class="helper">Art. 42 inc. 2 Ley 20.337</div>
      </div>
      <div class="card soft">
        <div class="metric-label">Acción Asistencial (5%)</div>
        <div class="metric">${money(data.assistanceFund)}</div>
        <div class="helper">Art. 42 inc. 3 Ley 20.337</div>
      </div>
    </div>

    <div class="card" style="border:2px solid var(--accent);background:#fbfbfe;margin-bottom:14px">
      <div class="section-head">
        <div>
          <h3>Excedente Repartible a Socios (85%): ${money(data.distributable)}</h3>
          <p class="muted">${data.totalHours > 0 ? `Prorrateo proporcional estricto en función de las ${data.totalHours.toLocaleString('es-AR')} horas trabajadas.` : `Distribución equitativa de contingencia: al no registrarse horas computadas en el ejercicio, el excedente se reparte en partes iguales entre los ${data.distribution.length} asociados activos.`}</p>
        </div>
        <div class="row-actions">
          <button id="btn-apply-surplus" class="primary" ${isFree ? 'disabled' : ''}>
            ${isFree ? 'Asentar Distribución (Requiere Plan Pro)' : 'Aprobar y Asentar Distribución'}
          </button>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Socio</th>
              <th>CUIT</th>
              <th>Horas Aportadas</th>
              <th>% Participación</th>
              <th>Retorno Asignado ($)</th>
            </tr>
          </thead>
          <tbody>
            ${data.distribution.map((item) => `
              <tr>
                <td><strong>${esc(item.fullName)}</strong></td>
                <td>${esc(item.cuit)}</td>
                <td>${item.hours.toLocaleString('es-AR')} h</td>
                <td>${item.percentage}%</td>
                <td><strong style="color:var(--ok)">${money(item.returnAmount)}</strong></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function openSurplusDetailModal(distribution) {
  const items = distribution.items || [];
  document.body.insertAdjacentHTML('beforeend', `
    <dialog id="dist-detail-dialog">
      <div class="dialog-body">
        <div class="section-head">
          <div>
            <h2>Acta de Distribución de Excedentes: ${esc(distribution.period_label)}</h2>
            <p class="muted">Cerrado el ${displayDate(distribution.created_at)} · Excedente Total: ${money(distribution.total_surplus)}</p>
          </div>
          <div style="display:flex;gap:8px">
            <button class="primary" id="print-dist-detail">🖨️ Imprimir Acta</button>
            <button class="secondary" id="close-dist-detail">Cerrar</button>
          </div>
        </div>
        <div class="grid3" style="margin-bottom:14px">
          <div class="card soft"><span>Reserva Legal (5%)</span><strong>${money(distribution.reserve_legal_amount)}</strong></div>
          <div class="card soft"><span>Fondo Educación (5%)</span><strong>${money(distribution.education_fund_amount)}</strong></div>
          <div class="card soft"><span>Acción Asistencial (5%)</span><strong>${money(distribution.assistance_fund_amount)}</strong></div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Socio</th><th>CUIT</th><th>Horas</th><th>% Participación</th><th>Retorno</th></tr>
            </thead>
            <tbody>
              ${items.map((it) => `
                <tr>
                  <td><strong>${esc(it.fullName)}</strong></td>
                  <td>${esc(it.cuit)}</td>
                  <td>${it.hours} h</td>
                  <td>${it.percentage}%</td>
                  <td><strong>${money(it.returnAmount)}</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div class="acta-signatures">
          <div class="acta-sign-box"><div class="acta-sign-line">Firma Presidente</div></div>
          <div class="acta-sign-box"><div class="acta-sign-line">Firma Secretario/a</div></div>
          <div class="acta-sign-box"><div class="acta-sign-line">Firma Síndico/a</div></div>
        </div>
      </div>
    </dialog>
  `);
  const dlg = $('dist-detail-dialog');
  $('print-dist-detail').onclick = () => window.print();
  $('close-dist-detail').onclick = () => {
    dlg.close();
  };
  dlg.addEventListener('close', () => {
    dlg.remove();
  }, { once: true });
  dlg.showModal();
}

async function handleCalculateSurplus(isFree) {
  const total = Number($('surplus-total').value || 0);
  const period = $('surplus-period').value.trim() || 'Ejercicio Anual';
  if (total <= 0) {
    notify('Ingresá un monto de excedente válido.', 'error');
    return;
  }
  try {
    const data = await api('/api/surplus/calculate', {
      method: 'POST',
      body: JSON.stringify({ totalSurplus: total, periodLabel: period })
    });
    const container = $('surplus-calculation-results');
    container.innerHTML = renderSurplusBreakdownHtml(data, isFree);

    $('btn-apply-surplus')?.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Aprobar Cierre y Distribución de Excedentes',
        message: `¿Confirmás el cierre y distribución de ${money(data.totalSurplus)} para "${data.periodLabel}"?\nEsta acción impactará automáticamente en los fondos de reserva, educación y asistencia en la contabilidad.`,
        confirmText: 'Aprobar y Asentar'
      });
      if (!ok) return;
      try {
        await api('/api/surplus/distributions', {
          method: 'POST',
          body: JSON.stringify({ totalSurplus: data.totalSurplus, periodLabel: data.periodLabel })
        });
        notify('Distribución de excedentes aprobada y asentada en PostgreSQL.', 'ok');
        await renderAdminWithdrawals();
      } catch (err) {
        notify(err.message, 'error');
      }
    });
  } catch (err) {
    notify(err.message, 'error');
  }
}

async function renderAdminWithdrawals() {
  const [sub, dists] = await Promise.all([
    api('/api/subscription').catch(() => ({ plan: 'free' })),
    api('/api/surplus/distributions').catch(() => [])
  ]);
  const isFree = sub.plan === 'free';

  $('admin-retiros').innerHTML = `
    <div class="surplus-banner">
      <div class="surplus-banner-header">
        <span class="badge info">Régimen Legal Cooperativo · Ley 20.337</span>
        <span class="badge ${isFree ? 'pending' : 'ok'}">${isFree ? '🌱 Plan Semilla (Modo Simulación)' : '⭐ Plan Profesional (Habilitado Oficial)'}</span>
      </div>
      <h2>Distribución de Excedentes y Fondos Obligatorios</h2>
      <p class="muted" style="max-width:850px;line-height:1.6;margin-bottom:16px">En una cooperativa de trabajo no existen ganancias comerciales con fin de lucro. Los excedentes contables netos se destinan a fortalecer las reservas institucionales y a retribuir proporcionalmente el esfuerzo laboral de cada asociado:</p>
      <div class="surplus-pills">
        <div class="surplus-pill">
          <span class="surplus-pill-pct">5%</span>
          <div>
            <strong>Reserva Legal</strong>
            <small>Patrimonio irrepartible</small>
          </div>
        </div>
        <div class="surplus-pill">
          <span class="surplus-pill-pct">5%</span>
          <div>
            <strong>Fondo Educación</strong>
            <small>Capacitación y doctrina</small>
          </div>
        </div>
        <div class="surplus-pill">
          <span class="surplus-pill-pct">5%</span>
          <div>
            <strong>Fondo Asistencia</strong>
            <small>Salud y ayuda laboral</small>
          </div>
        </div>
        <div class="surplus-pill highlight">
          <span class="surplus-pill-pct">85%</span>
          <div>
            <strong>Retorno a Socios</strong>
            <small>Proporcional a horas trabajadas</small>
          </div>
        </div>
      </div>
    </div>

    ${isFree ? `
      <div class="notice" style="background:var(--warn-soft);border-color:var(--warn-border);color:var(--warn);margin-bottom:18px">
        <strong>Funcionalidad Premium:</strong> En el Plan Semilla podés simular la distribución de excedentes. Para asentar oficialmente el cierre en los libros de la cooperativa y alimentar los fondos de ley, <a href="#" id="link-upgrade-surplus" style="color:var(--warn);font-weight:bold;text-decoration:underline">actualizá al Plan Profesional</a>.
      </div>
    ` : ''}

    <div class="card">
      <h3>Simulador de Cierre de Ejercicio y Retorno de Excedentes</h3>
      <p class="muted">Ingresá el excedente neto del período (ingresos menos gastos) aprobado por el Consejo o Asamblea.</p>
      <div class="form-grid">
        <label>Período o Ejercicio<input id="surplus-period" value="Ejercicio Anual 2026" required></label>
        <label>Excedente Neto a Distribuir ($)<input id="surplus-total" type="number" min="1000" step="5000" value="1000000" required></label>
      </div>
      <div class="actions">
        <button id="btn-calc-surplus" class="primary" type="button">Calcular distribución legal</button>
      </div>
    </div>

    <div id="surplus-calculation-results" style="margin-top:14px"></div>

    <div class="member-list-panel" style="margin-top:18px">
      <div class="section-head">
        <div>
          <h3>Historial de Cierres y Distribuciones de Excedentes</h3>
          <p class="muted">Ejercicios cerrados y asentados en PostgreSQL con afectación automática de fondos.</p>
        </div>
        <span class="badge info">${dists.length} distribuciones</span>
      </div>
      <div class="list">
        ${dists.length ? dists.map((d) => `
          <article class="row-card">
            <div class="row-main">
              <strong>${esc(d.period_label)}</strong>
              <div class="muted">Cerrado el ${displayDate(d.created_at)} · Horas acumuladas: ${Number(d.total_hours).toLocaleString('es-AR')} h</div>
              <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
                <span class="badge ok">Excedente Total: ${money(d.total_surplus)}</span>
                <span class="badge info">Retornos a Socios (85%): ${money(d.distributable_amount)}</span>
                <span class="badge pending">Fondos Ley (15%): ${money(Number(d.reserve_legal_amount) + Number(d.education_fund_amount) + Number(d.assistance_fund_amount))}</span>
              </div>
            </div>
            <div class="row-actions">
              <button class="secondary" data-view-dist-details="${d.id}">Ver desglose por socio</button>
            </div>
          </article>
        `).join('') : '<div class="empty">Aún no se registraron distribuciones oficiales de excedentes.</div>'}
      </div>
    </div>
  `;

  $('link-upgrade-surplus')?.addEventListener('click', (e) => {
    e.preventDefault();
    go('admin-suscripcion');
  });

  $('btn-calc-surplus')?.addEventListener('click', () => {
    handleCalculateSurplus(isFree);
  });

  document.querySelectorAll('[data-view-dist-details]').forEach((btn) => {
    btn.onclick = () => {
      const d = dists.find((x) => String(x.id) === btn.dataset.viewDistDetails);
      if (!d) {
        return;
      }
      openSurplusDetailModal(d);
    };
  });
}

async function renderAdminSubscription() {
  const sub = await api('/api/subscription');
  const isFree = sub.plan === 'free';
  const percentage = isFree ? Math.min(100, Math.round((sub.activeCount / sub.maxMembers) * 100)) : 100;

  $('admin-suscripcion').innerHTML = `
    <div class="section-head">
      <div>
        <h2>Suscripción y Planes de CoopGestión</h2>
        <p class="muted">Elegí el modelo que mejor se adapte al tamaño y escala de tu cooperativa.</p>
      </div>
      <span class="badge ${isFree ? 'pending' : 'ok'}">${isFree ? 'Plan Semilla (Gratis)' : 'Plan Profesional (Premium)'}</span>
    </div>

    <div class="grid2">
      <div class="card" style="border:2px solid ${isFree ? 'var(--accent)' : 'var(--border)'};position:relative;">
        ${isFree ? `<span class="badge info" style="position:absolute;top:12px;right:12px">Plan Actual</span>` : ''}
        <h3>🌱 Plan Semilla (Gratuito)</h3>
        <p class="muted">Ideal para cooperativas en formación o grupos de trabajo iniciales.</p>
        <div style="font-size:28px;font-weight:900;margin:12px 0;">$0 <span style="font-size:14px;color:var(--muted);font-weight:normal">/ para siempre</span></div>
        <div class="notice" style="margin-bottom:14px">
          <strong>Cupo de asociados:</strong> ${sub.activeCount} de ${sub.maxMembers || 5} utilizados (${percentage}%)
          <div style="width:100%;background:#e2e8f0;height:7px;border-radius:999px;margin-top:6px;overflow:hidden">
            <div style="width:${percentage}%;background:${percentage >= 100 ? 'var(--danger)' : 'var(--accent)'};height:100%"></div>
          </div>
        </div>
        <ul style="padding-left:18px;line-height:1.8;font-size:13px;color:var(--text);margin-bottom:18px">
          <li>✓ Hasta 5 asociados activos o en verificación</li>
          <li>✓ Padrón de socios y aporte de capital inicial</li>
          <li>✓ Registro básico de horas de trabajo</li>
          <li>✓ Asambleas y votación democrática (1 socio = 1 voto)</li>
          <li style="color:var(--muted)">✕ Bloqueo de altas al alcanzar el 5to asociado</li>
          <li style="color:var(--muted)">✕ Asentar Distribución de Excedentes (Ley 20.337) bloqueado</li>
        </ul>
        ${!isFree ? `
          <button id="btn-downgrade-plan" class="danger" style="width:100%">Dar de baja suscripción y volver a Plan Semilla</button>
        ` : `
          <button class="secondary" style="width:100%" disabled>Plan activo</button>
        `}
      </div>

      <div class="card" style="border:2px solid ${!isFree ? 'var(--accent)' : '#c7d2fe'};background:${!isFree ? '#fff' : '#f8fbff'};position:relative;">
        ${!isFree ? `<span class="badge ok" style="position:absolute;top:12px;right:12px">Plan Actual</span>` : `<span class="badge info" style="position:absolute;top:12px;right:12px">Recomendado</span>`}
        <h3>⭐ Plan Profesional (Premium)</h3>
        <p class="muted">Para cooperativas consolidadas que requieren escala y cumplimiento legal pleno.</p>
        <div style="font-size:28px;font-weight:900;margin:12px 0;color:var(--accent);">$25.000 <span style="font-size:14px;color:var(--muted);font-weight:normal">/ mes por cooperativa</span></div>
        <div class="notice" style="margin-bottom:14px;background:#ecfdf3;border-color:#a7f3d0;color:#065f46">
          <strong>Asociados ilimitados:</strong> Sin restricciones de altas ni bajas.
        </div>
        <ul style="padding-left:18px;line-height:1.8;font-size:13px;color:var(--text);margin-bottom:18px">
          <li><strong>✓ Asociados ilimitados</strong> (sin tope de 5 socios)</li>
          <li><strong>✓ Distribución de Excedentes y Fondos de Ley (Ley 20.337)</strong></li>
          <li><strong>✓ Cálculo automático de horas especiales y feriados</strong></li>
          <li><strong>✓ Custodia ilimitada de constancias de monotributo</strong></li>
          <li><strong>✓ Soporte prioritario y exportación de datos</strong></li>
        </ul>
        ${isFree ? `
          <button id="btn-upgrade-plan" class="primary" style="width:100%;font-size:15px;padding:12px">Mejorar a Plan Profesional (Activar Premium)</button>
        ` : `
          <button class="primary" style="width:100%" disabled>Plan Profesional Activo</button>
        `}
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <h3>Transparencia de facturación y ciclo de vida</h3>
      <p class="muted">Podés alternar entre el plan gratuito y el profesional en cualquier momento para validar el comportamiento del sistema ante la escala de asociados.</p>
      <div class="helper">Última actualización de suscripción: ${displayDate(sub.updatedAt)}</div>
    </div>
  `;

  $('btn-upgrade-plan')?.addEventListener('click', async () => {
    try {
      const res = await api('/api/subscription/upgrade', { method: 'POST' });
      notify(res.message, 'ok');
      await updateTopbarPlan();
      await renderAdminSubscription();
    } catch (err) {
      notify(err.message, 'error');
    }
  });

  $('btn-downgrade-plan')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Volver a Plan Semilla',
      message: '¿Seguro que deseás volver al Plan Semilla (Gratis)? El límite para incorporar nuevos socios volverá a ser de 5 asociados activos.',
      confirmText: 'Volver a Plan Semilla',
      isDanger: true
    });
    if (!ok) return;
    try {
      const res = await api('/api/subscription/downgrade', { method: 'POST' });
      notify(res.message, 'ok');
      await updateTopbarPlan();
      await renderAdminSubscription();
    } catch (err) {
      notify(err.message, 'error');
    }
  });
}

async function renderAdminFunds(){
  const rows=await api('/api/fund-movements'),totals={};rows.forEach(x=>{totals[x.fund_name]=(totals[x.fund_name]||0)+(x.movement_type==='Ingreso'?1:-1)*Number(x.amount||0)});const names=[...new Set(['Fondo de reserva','Fondo operativo',...Object.keys(totals)])];
  $('admin-fondos').innerHTML=`<div class="section-head"><div><h2>Fondos de la cooperativa</h2><p class="muted">Movimientos persistidos en PostgreSQL.</p></div></div><div class="grid3">${names.map(n=>`<div class="card"><div class="metric-label">${esc(n)}</div><div class="metric">${money(totals[n]||0)}</div></div>`).join('')}</div><form id="fund-form" class="form-card" style="margin-top:14px"><h3>Registrar movimiento de fondo</h3><div class="form-grid"><label>Fondo<input id="fund-name" value="Fondo de reserva" required></label><label>Tipo<select id="fund-type"><option>Ingreso</option><option>Egreso</option></select></label><label>Monto ($)<input id="fund-amount" type="number" min="1" step="100" required></label><label>Fecha<input id="fund-date" type="date" required></label><label style="grid-column:1/-1">Motivo<input id="fund-reason" maxlength="180"></label></div><div class="actions"><button class="primary">Registrar</button></div></form><div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Fondo</th><th>Tipo</th><th>Monto</th><th>Motivo</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${displayDate(x.movement_date)}</td><td>${esc(x.fund_name)}</td><td>${esc(x.movement_type)}</td><td>${money(x.amount)}</td><td>${esc(x.reason||'—')}</td></tr>`).join('')}</tbody></table></div>`;
  $('fund-date').value=new Date().toISOString().slice(0,10);$('fund-form').onsubmit=async e=>{e.preventDefault();try{await api('/api/fund-movements',{method:'POST',body:JSON.stringify({fundName:$('fund-name').value,movementType:$('fund-type').value,amount:Number($('fund-amount').value),movementDate:$('fund-date').value,reason:$('fund-reason').value})});notify('Movimiento de fondo registrado.');await renderAdminFunds()}catch(err){notify(err.message,'error')}};
}

function tallyHtml(m) {
  const t=m.tally||{};
  return `<div class="tally"><div><strong>${t.eligible||0}</strong><span class="helper">Habilitados</span></div><div><strong>${t.emitted||0}</strong><span class="helper">Emitidos</span></div><div><strong>${t.in_favor||0}</strong><span class="helper">A favor</span></div><div><strong>${t.against||0}</strong><span class="helper">En contra</span></div><div><strong>${t.abstentions||0}</strong><span class="helper">Abstención</span></div></div>`;
}

async function renderAdminAssembly() {
  const motions=await api('/api/motions');
  $('admin-asamblea').innerHTML=`
    <form id="motion-form" class="form-card"><div class="section-head"><div><h2>Nueva moción</h2><p class="muted">El Administrador crea y cierra mociones; los votos los emiten los asociados.</p></div></div><div class="form-grid"><label>Título<input id="motion-title" required maxlength="220"></label><label>Tipo<select id="motion-type"><option value="ordinary">Ordinaria</option><option value="extraordinary">Extraordinaria</option></select></label></div><div class="actions"><button class="primary">Crear moción</button></div></form>
    <div class="section-head"><div><h2>Mociones abiertas</h2><p class="muted">El cómputo se actualiza con los votos guardados en PostgreSQL.</p></div></div>
    <div class="list">${motions.length?motions.map(m=>`<article class="motion-card"><div class="motion-head"><div><h3>${esc(m.title)}</h3><div class="helper">${m.motion_type==='extraordinary'?'Mayoría especial ≥ 66%':'Mayoría simple > 50%'}</div></div><span class="badge info motion-type">${m.motion_type==='extraordinary'?'Extraordinaria':'Ordinaria'}</span></div>${tallyHtml(m)}<div class="actions">${m.complete?`<span class="badge ${m.computed_result==='approved'?'':'off'}">${m.computed_result==='approved'?'APROBADA':'RECHAZADA'}</span><button class="primary" data-close-motion="${m.id}">Cerrar moción</button>`:'<span class="badge pending">Esperando votos</span>'}</div>${m.votes?.length?`<details style="margin-top:10px"><summary>Ver votos emitidos</summary><div class="list" style="margin-top:8px">${m.votes.map(v=>`<div class="row-card"><span>${esc(v.full_name)}</span><strong>${esc(v.vote)}</strong></div>`).join('')}</div></details>`:''}</article>`).join(''):'<div class="empty">No hay mociones abiertas.</div>'}</div>`;
  $('motion-form').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/motions',{method:'POST',body:JSON.stringify({title:$('motion-title').value,motionType:$('motion-type').value})});notify('Moción creada.');await renderAdminAssembly()}catch(err){notify(err.message,'error')}});
  document.querySelectorAll('[data-close-motion]').forEach(btn=>btn.addEventListener('click',async()=>{try{await api('/api/motions/'+btn.dataset.closeMotion+'/close',{method:'POST'});notify('Moción cerrada y guardada en historial.');await renderAdminAssembly()}catch(err){notify(err.message,'error')}}));
}

function renderClosedMotionDetails(m) {
  const snap = m.closed_snapshot;
  if (!snap) return '';
  const tally = snap.tally || {};
  const votes = snap.votes || [];
  return `
    <div style="margin-top:12px">
      ${tallyHtml({ tally })}
      ${votes.length ? `
        <div class="table-wrap" style="margin-top:12px">
          <table>
            <thead><tr><th>Asociado/a</th><th>Sentido del voto</th><th>Fecha</th></tr></thead>
            <tbody>
              ${votes.map(v => `
                <tr>
                  <td><strong>${esc(v.full_name)}</strong></td>
                  <td><span class="badge ${v.vote === 'A favor' ? 'ok' : v.vote === 'En contra' ? 'off' : 'pending'}">${esc(v.vote)}</span></td>
                  <td>${displayDate(v.created_at)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}
      <details style="margin-top:10px">
        <summary class="helper" style="cursor:pointer">Ver snapshot JSON técnico</summary>
        <pre class="history-json" style="margin-top:8px">${esc(JSON.stringify(snap, null, 2))}</pre>
      </details>
    </div>
  `;
}

async function renderAdminHistory() {
  const motions=await api('/api/motions?status=closed');
  $('admin-historial').innerHTML=`
    <div class="section-head">
      <div>
        <h2>Historial de asambleas</h2>
        <p class="muted">Las mociones cerradas conservan el registro formal inmutable del padrón y los votos emitidos.</p>
      </div>
      <span class="badge info">${motions.length} mociones cerradas</span>
    </div>
    <div class="list">
      ${motions.length ? motions.map(m=>`
        <article class="motion-card">
          <div class="motion-head">
            <div>
              <h3>${esc(m.title)}</h3>
              <div class="helper">Cerrada: ${m.closed_at?new Date(m.closed_at).toLocaleString('es-AR'):'—'} · ${m.motion_type==='extraordinary'?'Mayoría especial ≥ 66%':'Mayoría simple > 50%'}</div>
            </div>
            <span class="badge ${m.result==='approved'?'':'off'}">${m.result==='approved'?'✓ APROBADA':'✕ RECHAZADA'}</span>
          </div>
          ${renderClosedMotionDetails(m)}
        </article>
      `).join('') : '<div class="empty">Todavía no hay mociones cerradas.</div>'}
    </div>
  `;
}

async function getAssociateData() {
  const me = await api('/api/me');
  return me.member;
}

async function renderAssociateHome() {
  const [member, logs, retribution, motions] = await Promise.all([getAssociateData(),api('/api/work-logs'),api('/api/retribution/me'),api('/api/motions')]);
  const hours=logs.reduce((s,x)=>s+Number(x.hours||0),0);
  const pending=motions.filter(m=>!m.own_vote).length;
  $('assoc-inicio').innerHTML=`
    <div class="grid3">
      <div class="card metric-card">
        <div class="metric-top">
          <div class="metric-label">Mis horas acumuladas</div>
          <div class="metric-icon">⏱️</div>
        </div>
        <div class="metric">${hours.toLocaleString('es-AR')} h</div>
        <div class="metric-footer">
          <span>Horas trabajadas</span>
          <span>Registradas</span>
        </div>
      </div>
      <div class="card metric-card">
        <div class="metric-top">
          <div class="metric-label">Mi retribución estimada</div>
          <div class="metric-icon">💳</div>
        </div>
        <div class="metric">${money(retribution.total)}</div>
        <div class="metric-footer">
          <span>Liquidación del período</span>
          <span>Mensual</span>
        </div>
      </div>
      <div class="card metric-card">
        <div class="metric-top">
          <div class="metric-label">Mociones pendientes</div>
          <div class="metric-icon">🗳️</div>
        </div>
        <div class="metric">${pending}</div>
        <div class="metric-footer">
          <span>Votación democrática</span>
          <span>Asamblea</span>
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:20px">
      <h2>Hola, ${esc(member.full_name.split(/\s+/)[0])}</h2>
      <p class="muted" style="line-height:1.6">Desde tu portal de asociado podés consultar tu legajo societario, registrar tus jornadas de labor y ejercer tu derecho a voto en las asambleas convocadas.</p>
    </div>`;
}

async function renderAssociateProfile() {
  const m=await getAssociateData();
  const pending=Math.max(0,Number(m.capital_subscribed)-Number(m.capital_integrated));
  const roles=(m.roles||[]).length?(m.roles||[]):['Asociado'];
  const items=[['DNI',m.dni],['CUIT',m.cuit],['Correo',m.email],['Fecha de alta',displayDate(m.joined_on)],['Rol / cargos',roles.join(', ')],['Capital suscripto',money(m.capital_subscribed)],['Capital integrado',money(m.capital_integrated)],['Saldo pendiente',money(pending)],['Monotributo',m.monotributo_status],['Constancia',m.monotributo_file||'No cargada']];
  $('assoc-perfil').innerHTML=`<div class="card"><div class="section-head"><div><h2>${esc(m.full_name)}</h2><p class="muted">Información personal en modo lectura.</p></div><span class="badge">Activo</span></div><div class="info-grid">${items.map(([k,v])=>`<div class="info-item"><span>${esc(k)}</span><strong>${esc(v??'—')}</strong></div>`).join('')}</div>${m.monotributo_stored?`<div class="actions"><button class="secondary" id="assoc-download-monotributo">Descargar mi constancia</button></div>`:''}</div>`;
  $('assoc-download-monotributo')?.addEventListener('click',async()=>{try{await downloadMonotributo(m.id,m.monotributo_file)}catch(err){notify(err.message,'error')}});
}

async function renderAssociateHours() {
  const logs=await api('/api/work-logs');
  $('assoc-horas').innerHTML=`<div class="split"><form id="assoc-hours-form" class="form-card"><h2>Registrar trabajo</h2><p class="muted">La carga queda vinculada automáticamente a tu usuario.</p><label>Fecha<input id="assoc-date" type="date" required></label><label>Horas<input id="assoc-hours" type="number" min="0.5" max="23.5" step="0.5" required></label><label>Descripción<textarea id="assoc-description" rows="3" maxlength="180"></textarea></label><div class="notice" style="margin-top:12px">No podés cargar horas para otro socio ni duplicar una fecha.</div><div class="actions"><button class="primary">Registrar horas</button></div></form><div><div class="section-head"><div><h2>Mis registros</h2><p class="muted">Estos mismos registros aparecen en Administración.</p></div></div><div class="list">${logs.length?logs.map(x=>`<article class="row-card"><div><strong>${displayDate(x.work_date)}</strong><div class="helper">${esc(x.description||'Sin detalle')}${x.special?' · Domingo / feriado':''}</div></div><strong>${Number(x.hours).toLocaleString('es-AR')} h</strong></article>`).join(''):'<div class="empty">Todavía no registraste horas.</div>'}</div></div></div>`;
  $('assoc-date').value=new Date().toISOString().slice(0,10);
  $('assoc-hours-form').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/work-logs',{method:'POST',body:JSON.stringify({workDate:$('assoc-date').value,hours:Number($('assoc-hours').value),description:$('assoc-description').value})});notify('Horas registradas. Administración ya puede ver la carga.');await renderAssociateHours()}catch(err){notify(err.message,'error')}});
}

async function renderAssociateRetribution() {
  const [x,cfg,surplus]=await Promise.all([
    api('/api/retribution/me'),
    api('/api/retribution/settings'),
    api('/api/surplus/me').catch(()=>({hasDistribution:false}))
  ]);
  const transferred=Number(x.transferred_amount)===Number(x.total)&&Number(x.total)>0;
  $('assoc-retribucion').innerHTML=`
    <div class="card">
      <div class="section-head">
        <div>
          <h2>Mi retribución mensual</h2>
          <p class="muted">Calculada con la configuración horaria definida por Administración.</p>
        </div>
        <span class="badge ${transferred?'ok':'pending'}">${transferred?'Transferencia registrada':'Pendiente de transferencia'}</span>
      </div>
      <div class="grid3">
        <div class="card soft">
          <div class="metric-label">Horas habituales</div>
          <div class="metric">${x.normal_hours} h</div>
          <div class="helper">${money(x.normal_rate)} / h · ${money(x.normal_amount)}</div>
        </div>
        <div class="card soft">
          <div class="metric-label">Domingo / feriado</div>
          <div class="metric">${x.special_hours} h</div>
          <div class="helper">${money(x.special_rate)} / h · ${money(x.special_amount)}</div>
        </div>
        <div class="card soft">
          <div class="metric-label">Total devengado</div>
          <div class="metric">${money(x.total)}</div>
        </div>
      </div>
      <div class="notice" style="margin-top:12px">Los domingos son especiales automáticamente. Feriados cargados por Administración: <strong>${cfg.holidays.length}</strong>.</div>
    </div>

    ${surplus.hasDistribution?`
      <div class="card" style="margin-top:16px;border:2px solid #c7d2fe;background:#fbfbfe">
        <div class="section-head">
          <div>
            <h3>⚖️ Mi Retorno de Excedentes (Ley 20.337 Art. 42)</h3>
            <p class="muted">Período: <strong>${esc(surplus.periodLabel)}</strong> · Aprobado por Asamblea</p>
          </div>
          <span class="badge info">85% Prorrateado por trabajo</span>
        </div>
        <div class="grid3">
          <div class="card soft">
            <div class="metric-label">Mis horas aportadas</div>
            <div class="metric">${surplus.myHours} h</div>
            <div class="helper">de ${surplus.totalCoopHours.toLocaleString('es-AR')} h totales de la cooperativa</div>
          </div>
          <div class="card soft">
            <div class="metric-label">Mi participación laboral</div>
            <div class="metric">${surplus.myPercentage}%</div>
            <div class="helper">Ponderación proporcional al esfuerzo</div>
          </div>
          <div class="card soft" style="background:#ecfdf3;border:1px solid #a7f3d0">
            <div class="metric-label" style="color:#065f46">Monto de retorno asignado</div>
            <div class="metric" style="color:#065f46">${money(surplus.myReturnAmount)}</div>
            <div class="helper" style="color:#065f46">Excedente neto cooperativa: ${money(surplus.totalSurplus)}</div>
          </div>
        </div>
        <div class="notice" style="margin-top:12px;background:#f0fdf4;border-color:#bbf7d0;color:#166534">
          ✓ Por ley cooperativa, este retorno corresponde al fruto de tu trabajo y no al capital aportado.
        </div>
      </div>
    `:''}
  `;
}

async function renderAssociateAssembly() {
  const motions=await api('/api/motions');
  $('assoc-asamblea').innerHTML=`<div class="section-head"><div><h2>Mociones abiertas</h2><p class="muted">Tu usuario identifica automáticamente quién emite el voto. No podés votar en nombre de otra persona.</p></div></div><div class="list">${motions.length?motions.map(m=>`<article class="motion-card"><div class="motion-head"><div><h3>${esc(m.title)}</h3><div class="helper">${m.motion_type==='extraordinary'?'Mayoría especial ≥ 66%':'Mayoría simple > 50%'}</div></div><span class="badge info">${m.motion_type==='extraordinary'?'Extraordinaria':'Ordinaria'}</span></div>${m.own_vote?`<div class="notice" style="margin-top:12px"><strong>✓ Voto emitido:</strong> ${esc(m.own_vote.vote)}</div>`:`<div class="vote-actions"><button class="secondary" data-vote="A favor" data-motion="${m.id}">A favor</button><button class="secondary" data-vote="En contra" data-motion="${m.id}">En contra</button><button class="secondary" data-vote="Abstención" data-motion="${m.id}">Abstención</button></div>`}</article>`).join(''):'<div class="empty">No hay mociones abiertas.</div>'}</div>`;
  document.querySelectorAll('[data-vote][data-motion]').forEach(btn=>btn.addEventListener('click',async()=>{try{await api(`/api/motions/${btn.dataset.motion}/vote`,{method:'POST',body:JSON.stringify({vote:btn.dataset.vote})});notify('Voto registrado. El cómputo de Administración ya fue actualizado.');await renderAssociateAssembly()}catch(err){notify(err.message,'error')}}));
}

if (state.token && state.user) startApp();
