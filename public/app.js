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

const memberUiState={search:'',filter:'all',formOpen:false,reactivatingId:null,mono:{checked:false,valid:false,message:'Pendiente de verificación.',issuedAt:null,expiresAt:null,status:'unknown',daysRemaining:null,extractedText:''}};
const digitsOnly=v=>String(v||'').replace(/\D/g,'');
function formatCUIT(v){const d=digitsOnly(v).slice(0,11);if(d.length<=2)return d;if(d.length<=10)return d.slice(0,2)+'-'+d.slice(2);return d.slice(0,2)+'-'+d.slice(2,10)+'-'+d.slice(10)}
function resetMono(){memberUiState.mono={checked:false,valid:false,message:'Pendiente de verificación.',issuedAt:null,expiresAt:null,status:'unknown',daysRemaining:null,extractedText:''}}
async function extractPdfText(file){if(!window.pdfjsLib)throw new Error('No se pudo cargar PDF.js.');const data=await file.arrayBuffer();const pdf=await pdfjsLib.getDocument({data}).promise;const out=[];for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i);const c=await p.getTextContent();out.push(c.items.map(x=>x.str).join(' '))}return out.join('\n')}
function parseArDateToken(token){const m=String(token||'').match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4}|\d{2})$/);if(!m)return null;let y=m[3];if(y.length===2)y=Number(y)>=70?'19'+y:'20'+y;const iso=`${y}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;const d=new Date(iso+'T00:00:00Z');return Number.isNaN(d.getTime())?null:iso}
function localValidityFromText(txt){const low=String(txt||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').toLowerCase();const find=(labels)=>{const m=low.match(new RegExp(`(?:${labels})\\s*(?:[:\\-]|es|el)?\\s*(\\d{1,2}[\\/.-]\\d{1,2}[\\/.-](?:\\d{4}|\\d{2}))`,'i'));return m?parseArDateToken(m[1]):null};const expiresAt=find('fecha de vencimiento|fecha vencimiento|vencimiento|vigente hasta|vigencia hasta|valida hasta|valido hasta');const issuedAt=find('fecha de emision|fecha emision|emitida el|emitido el|fecha de generacion|generada el|generado el|fecha de impresion|fecha impresion');let status='unknown',daysRemaining=null;if(expiresAt){const now=new Date(),base=new Date(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate())),end=new Date(expiresAt+'T00:00:00Z');daysRemaining=Math.round((end-base)/86400000);status=daysRemaining<0?'expired':daysRemaining<=5?'expiring':'valid'}return{issuedAt,expiresAt,status,daysRemaining}}
function monoBadge(status,days){if(status==='expired')return `<span class="badge off">Vencida</span>`;if(status==='expiring')return `<span class="badge pending">Vence en ${days} día${Number(days)===1?'':'s'}</span>`;if(status==='valid')return `<span class="badge">Vigente</span>`;return `<span class="badge info">Sin vigencia determinada</span>`}

async function verifyMemberPdf(){const file=$('member-monotributo')?.files?.[0],entered=digitsOnly($('member-cuit')?.value);if(entered.length!==11){notify('Ingresá primero un CUIT válido.','error');return}if(!file){notify('Adjuntá la constancia PDF.','error');return}try{const txt=await extractPdfText(file),low=txt.toLowerCase();const looks=low.includes('monotributo')||low.includes('monotributista')||low.includes('constancia de opcion')||low.includes('constancia de opción');const matches=digitsOnly(txt).includes(entered);const validity=localValidityFromText(txt);const valid=looks&&matches&&!!validity.expiresAt&&validity.status!=='expired'&&validity.status!=='unknown';let message;if(!looks)message='El PDF no parece una constancia de monotributo.';else if(!matches)message='El CUIT de la constancia no coincide.';else if(!validity.expiresAt)message='No se pudo determinar la vigencia del documento.';else if(validity.status==='expired')message=`La constancia está vencida desde ${displayDate(validity.expiresAt)}.`;else if(validity.status==='expiring')message=`✓ Constancia válida. Vence en ${validity.daysRemaining} día${validity.daysRemaining===1?'':'s'} (${displayDate(validity.expiresAt)}).`;else message=`✓ Constancia vigente hasta ${displayDate(validity.expiresAt)}.`;memberUiState.mono={checked:true,valid,message,...validity,extractedText:txt};renderMonoResult();renderMemberValidation()}catch(err){memberUiState.mono={checked:true,valid:false,message:'No se pudo leer el PDF.',issuedAt:null,expiresAt:null,status:'unknown',daysRemaining:null,extractedText:''};renderMonoResult();renderMemberValidation();notify(err.message,'error')}}
function renderMonoResult(){const b=$('member-mono-result');if(!b)return;b.className='mono-result '+(memberUiState.mono.valid?'good':memberUiState.mono.checked?'bad':'pending');b.textContent=memberUiState.mono.message}
function getMemberFormState(members=[]){const fullName=$('member-name')?.value.trim()||'',dni=digitsOnly($('member-dni')?.value),cuit=digitsOnly($('member-cuit')?.value),email=$('member-email')?.value.trim()||'',cap=Number($('member-capital')?.value||0),integrated=Number($('member-initial')?.value||0),file=$('member-monotributo')?.files?.[0]||null,username=$('member-username')?.value.trim()||'',password=$('member-password')?.value||'',duplicate=members.find(m=>digitsOnly(m.cuit)===cuit||digitsOnly(m.dni)===dni);return{fullName,dni,cuit,email,cap,integrated,file,username,password,duplicate,nameOk:fullName.length>=3,dniOk:dni.length>=7,cuitOk:cuit.length===11,emailOk:/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),capitalOk:cap>0&&integrated>=cap*.05&&integrated<=cap,fileOk:!!file&&(file.type==='application/pdf'||/\.pdf$/i.test(file.name))&&file.size<=5*1024*1024,loginOk:username.length>=3&&password.length>=4,monoOk:memberUiState.mono.valid}}
function renderMemberValidation(){const ul=$('member-validation-list');if(!ul)return;const s=getMemberFormState(window.__adminMembers||[]);const isReact=!!memberUiState.reactivatingId;const items=isReact?[[s.fileOk,'Nueva constancia en PDF (máx. 5 MB)'],[s.monoOk,'Constancia verificada, CUIT coincidente y no vencida']]:[[s.nameOk,'Nombre y apellido completos'],[s.dniOk,'DNI informado'],[s.cuitOk,'CUIT con 11 dígitos'],[s.emailOk,'Correo electrónico válido'],[s.capitalOk,'Aporte inicial entre 5% y 100%'],[s.fileOk,'Constancia en PDF (máx. 5 MB)'],[s.monoOk,'Constancia verificada, CUIT coincidente y no vencida'],[s.loginOk,'Usuario y contraseña inicial configurados'],[!s.duplicate||(!s.duplicate.active&&!s.duplicate.verification_pending),'Sin DNI/CUIT duplicado activo o pendiente']];ul.innerHTML=items.map(([ok,t])=>`<li class="${ok?'good':'bad'}">${ok?'✓':'✕'} ${t}</li>`).join('');if($('minimum-contribution'))$('minimum-contribution').textContent=money(Math.round(s.cap*.05));if($('integrated-preview'))$('integrated-preview').textContent=money(s.integrated);if($('pending-preview'))$('pending-preview').textContent=money(Math.max(0,s.cap-s.integrated))}
function showMemberDetails(m){
  const roles=(m.roles||[]).length?m.roles:['Asociado'];
  const pending=Math.max(0,Number(m.capital_subscribed||0)-Number(m.capital_integrated||0));
  const docStatus=m.monotributo_stored?'PDF guardado en PostgreSQL':(m.monotributo_file?'Solo nombre histórico; sin contenido binario':'No cargada');
  document.body.insertAdjacentHTML('beforeend',`<dialog id="member-detail-dialog"><div class="dialog-body"><div class="section-head"><div><h2>${esc(m.full_name)}</h2><p class="muted">${esc(roles.join(' · '))}</p></div><button class="secondary" id="close-member-detail">Cerrar</button></div><div class="info-grid">${[['DNI',m.dni],['CUIT',m.cuit],['Correo',m.email||'—'],['Fecha de alta',displayDate(m.joined_on)],['Capital suscripto',money(m.capital_subscribed)],['Capital integrado',money(m.capital_integrated)],['Saldo pendiente',money(pending)],['Monotributo',m.monotributo_status],['Constancia',m.monotributo_file||'No cargada'],['Almacenamiento',docStatus],['Verificación automática',m.monotributo_auto_verified&&m.monotributo_cuit_matched?'PDF válido · CUIT coincidente':'Pendiente / no verificada'],['Emisión',displayDate(m.monotributo_issued_at)],['Vencimiento',displayDate(m.monotributo_expires_at)],['Vigencia',m.monotributo_validity_status==='expired'?'Vencida':m.monotributo_validity_status==='expiring'?`Vence en ${m.monotributo_days_remaining} días`:m.monotributo_validity_status==='valid'?'Vigente':'Sin determinar']].map(([k,v])=>`<div class="info-item"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')}</div>${m.monotributo_stored?`<div class="actions"><button class="secondary" id="download-member-monotributo">Descargar constancia PDF</button></div>`:''}</div></dialog>`);
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
  ['admin-inicio','Inicio'],['admin-socios','Socios y aportes'],['admin-trabajo','Trabajo'],
  ['admin-retribuciones','Retribuciones'],['admin-finanzas','Ingresos y gastos'],['admin-retiros','Retiros y excedentes'],['admin-fondos','Fondos'],['admin-asamblea','Asamblea'],['admin-historial','Historial de asambleas']
];
const assocViews = [
  ['assoc-inicio','Inicio'],['assoc-perfil','Mi perfil'],['assoc-horas','Mis horas'],
  ['assoc-retribucion','Mi retribución'],['assoc-asamblea','Asamblea']
];

function buildNav() {
  const views = state.user.role === 'admin' ? adminViews : assocViews;
  $('sidebar-subtitle').textContent = state.user.role === 'admin' ? 'Administración' : 'Portal del asociado';
  $('nav').innerHTML = views.map(([id,label]) => `<button type="button" data-view="${id}">${esc(label)}</button>`).join('') +
    '<button type="button" id="logout" class="logout">Cerrar sesión</button>';
  $('nav').querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => go(btn.dataset.view)));
  $('logout').addEventListener('click', () => logout());
}

function go(view) {
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
    'assoc-inicio': renderAssociateHome,
    'assoc-perfil': renderAssociateProfile,
    'assoc-horas': renderAssociateHours,
    'assoc-retribucion': renderAssociateRetribution,
    'assoc-asamblea': renderAssociateAssembly,
  };
  if (renderers[state.view]) await renderers[state.view](silent);
}

async function renderAdminHome() {
  const [members, work, motions, retributions] = await Promise.all([
    api('/api/members'), api('/api/work-logs'), api('/api/motions'), api('/api/retributions')
  ]);
  const active = members.filter(m=>m.active && !m.verification_pending).length;
  const hours = work.reduce((s,x)=>s+Number(x.hours||0),0);
  const total = retributions.reduce((s,x)=>s+Number(x.total||0),0);
  $('admin-inicio').innerHTML = `
    <div class="grid3">
      <div class="card"><div class="metric-label">Socios activos</div><div class="metric">${active}</div></div>
      <div class="card"><div class="metric-label">Horas registradas</div><div class="metric">${hours.toLocaleString('es-AR')} h</div></div>
      <div class="card"><div class="metric-label">Retribuciones calculadas</div><div class="metric">${money(total)}</div></div>
    </div>
    <div class="card" style="margin-top:12px"><h3>Actividad compartida</h3><p class="muted">Los asociados registran sus propias horas y votos desde su portal. Administración ve esos datos desde la misma base PostgreSQL.</p><div class="notice">Mociones abiertas: <strong>${motions.length}</strong></div></div>`;
}

async function renderAdminMembers() {
  const [members,authorities,monoAlerts]=await Promise.all([api('/api/members'),api('/api/authorities'),api('/api/admin/monotributos/alerts')]);
  window.__adminMembers=members;
  const q=(memberUiState.search||'').toLowerCase();
  const filtered=members.filter(m=>{const statusOk=memberUiState.filter==='all'||(memberUiState.filter==='active'&&m.active&&!m.verification_pending)||(memberUiState.filter==='pending'&&m.verification_pending)||(memberUiState.filter==='inactive'&&!m.active&&!m.verification_pending);const hay=[m.full_name,m.dni,m.cuit,m.email,...(m.roles||[])].join(' ').toLowerCase();return statusOk&&(!q||hay.includes(q))});
  const active=members.filter(m=>m.active&&!m.verification_pending),byRole=Object.fromEntries(authorities.map(a=>[a.role,a]));
  const authorityCards=['Presidente','Secretario','Tesorero'].map(role=>{const cur=byRole[role];return `<div class="authority-card"><div class="authority-icon">${role[0]}</div><div><div class="helper authority-label">${role}</div><strong>${esc(cur?.full_name||'Sin asignar')}</strong></div><select data-authority-role="${role}">${active.map(m=>`<option value="${m.id}" ${cur&&Number(cur.member_id)===Number(m.id)?'selected':''}>${esc(m.full_name)}${(m.roles||[]).length?` (${esc((m.roles||[]).join(', '))})`:''}</option>`).join('')}</select></div>`}).join('');
  $('admin-socios').innerHTML=`
    <div class="members-intro"><div><h2>Gestión de socios</h2><p class="muted">Altas, capital social, verificación, autoridades y bajas guardadas en PostgreSQL.</p></div><div class="row-actions"><button id="show-member-form" class="primary">＋ Nuevo socio</button><button id="export-members" class="secondary">Exportar datos</button></div></div>
    <section class="expiry-panel"><div class="section-head"><div><h2>Vencimientos de monotributo</h2><p class="muted">Alertas automáticas para constancias vencidas o que vencen dentro de ${monoAlerts.alertDays} días.</p></div><span class="badge ${monoAlerts.items.length?'pending':'info'}">${monoAlerts.items.length} requieren atención</span></div><div class="expiry-list">${monoAlerts.items.length?monoAlerts.items.map(x=>`<article class="expiry-row"><div><strong>${esc(x.full_name)}</strong><div class="helper">CUIT ${esc(x.cuit)} · Vence ${displayDate(x.expires_at)}</div></div><div>${monoBadge(x.status,x.days_remaining)}</div></article>`).join(''):'<div class="empty">No hay constancias próximas a vencer.</div>'}</div></section>
    <form id="member-form" class="form-card ${memberUiState.formOpen?'':'hidden'}" novalidate>
      <div class="section-head"><div><h2>${memberUiState.reactivatingId?'Reincorporar socio':'Nuevo socio'}</h2><p class="muted">${memberUiState.reactivatingId?'Adjuntá una nueva constancia para iniciar la reincorporación.':'El alta queda pendiente hasta que Administración la apruebe.'}</p></div><button id="cancel-member" class="secondary" type="button">Cancelar</button></div>
      <div class="form-grid"><label>Nombre y apellido *<input id="member-name" maxlength="120"></label><label>DNI *<input id="member-dni" inputmode="numeric" maxlength="12"></label><label>CUIT *<input id="member-cuit" inputmode="numeric" maxlength="13"></label><label>Correo electrónico *<input id="member-email" type="email"></label></div>
      <hr class="divider"><h3>Capital social</h3><div class="form-grid"><label>Capital suscripto ($) *<input id="member-capital" type="number" min="1" step="1000" value="370000"></label><label>Aporte inicial integrado ($) *<input id="member-initial" type="number" min="0" step="100" value="18500"><div class="helper">Mínimo 5% del capital suscripto.</div></label></div>
      <div class="capital-summary"><div><span>Mínimo requerido (5%)</span><strong id="minimum-contribution">$18.500</strong></div><div><span>Capital integrado</span><strong id="integrated-preview">$18.500</strong></div><div><span>Saldo pendiente</span><strong id="pending-preview">$351.500</strong></div></div>
      <hr class="divider"><h3>Monotributo</h3><div class="mono-upload-card"><label>Constancia de monotributo (PDF) *<input id="member-monotributo" type="file" accept="application/pdf,.pdf"><div class="helper">El sistema lee el PDF, compara el CUIT y contrasta la fecha de vencimiento del documento con la fecha actual.</div></label><div class="mono-check-card"><div><strong>Verificación automática</strong><div class="helper">Contenido + CUIT + vencimiento vs. fecha actual</div></div><button id="verify-monotributo" class="secondary" type="button">Verificar constancia</button></div><div id="member-mono-result" class="mono-result pending">Pendiente de verificación.</div></div>
      <div class="review-note"><div><strong>Revisión administrativa</strong><p>Después del alta queda pendiente hasta que un administrador la habilite.</p></div><span class="badge pending">Pendiente de revisión</span></div>
      <div id="member-login-section"><hr class="divider"><h3>Acceso del asociado</h3><div class="form-grid"><label>Usuario *<input id="member-username" maxlength="80" placeholder="Ej. ana"></label><label>Contraseña inicial *<input id="member-password" type="password" minlength="4" placeholder="Mínimo 4 caracteres"></label></div><div class="notice" style="margin-top:12px">El usuario se crea deshabilitado y se activa al aprobar el alta.</div></div>
      <div class="validation-box"><strong>Requisitos para completar</strong><ul id="member-validation-list"></ul></div><div class="actions"><button class="primary" type="submit">${memberUiState.reactivatingId?'Solicitar reincorporación':'Registrar alta'}</button></div>
    </form>
    <section class="authorities-panel"><div class="section-head"><div><h2>Autoridades de la cooperativa</h2><p class="muted">Los cargos deben permanecer asignados. El Presidente puede acumular Secretaría y/o Tesorería.</p></div><span class="badge info">3 cargos</span></div><div class="authority-grid">${authorityCards}</div></section>
    <section class="member-list-panel"><div class="member-list-head"><div><h2>Listado de socios</h2><p class="muted">Buscá por nombre, DNI, CUIT, correo o cargo.</p></div><div class="member-filters"><input id="member-search" type="search" placeholder="Buscar socio" value="${esc(memberUiState.search)}"><select id="member-filter"><option value="all" ${memberUiState.filter==='all'?'selected':''}>Todos</option><option value="active" ${memberUiState.filter==='active'?'selected':''}>Activos</option><option value="pending" ${memberUiState.filter==='pending'?'selected':''}>Pendientes</option><option value="inactive" ${memberUiState.filter==='inactive'?'selected':''}>Bajas</option></select></div></div>
      <div class="list">${filtered.length?filtered.map(m=>{const roles=(m.roles||[]).length?m.roles:['Asociado'],status=m.verification_pending?'Pendiente de verificación':m.active?'Activo':'Baja',statusClass=m.verification_pending?'pending':m.active?'':'off';return `<article class="member-row"><div class="member-avatar">${initials(m.full_name)}</div><div class="row-main"><div class="member-title"><strong>${esc(m.full_name)}</strong><span class="badge ${statusClass}">${status}</span>${m.monotributo_expires_at?monoBadge(m.monotributo_validity_status,m.monotributo_days_remaining):''}</div><div class="muted">${esc(m.email||'Sin correo')} · CUIT ${esc(m.cuit)}</div><div style="margin-top:7px">${roles.map(r=>`<span class="badge info">${esc(r)}</span>`).join(' ')}</div></div><div class="row-actions"><button class="secondary" data-member-detail="${m.id}">Ver detalle</button>${m.verification_pending?`<button class="primary" data-member-approve="${m.id}">Aprobar alta</button>`:''}${m.active&&!m.verification_pending?`<button class="danger" data-member-deactivate="${m.id}">Registrar baja</button>`:''}${!m.active&&!m.verification_pending?`<button class="secondary" data-member-reactivate="${m.id}">Reincorporar</button>`:''}</div></article>`}).join(''):'<div class="empty">No encontramos socios con esos filtros.</div>'}</div>
    </section>`;
  renderMonoResult();if(memberUiState.formOpen)renderMemberValidation();
  $('show-member-form').onclick=()=>{memberUiState.formOpen=true;memberUiState.reactivatingId=null;resetMono();renderAdminMembers()};
  $('cancel-member')?.addEventListener('click',()=>{memberUiState.formOpen=false;memberUiState.reactivatingId=null;resetMono();renderAdminMembers()});
  $('member-search').oninput=e=>{memberUiState.search=e.target.value;renderAdminMembers()};$('member-filter').onchange=e=>{memberUiState.filter=e.target.value;renderAdminMembers()};
  $('export-members').onclick=()=>{const blob=new Blob([JSON.stringify(members,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='socios_coopgestion.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),500)};
  document.querySelectorAll('[data-authority-role]').forEach(sel=>sel.onchange=async()=>{try{await api('/api/authorities/'+encodeURIComponent(sel.dataset.authorityRole),{method:'PUT',body:JSON.stringify({memberId:Number(sel.value)})});notify('Autoridad actualizada.');await renderAdminMembers()}catch(err){notify(err.message,'error');await renderAdminMembers()}});
  if(memberUiState.formOpen){
    ['member-name','member-dni','member-email','member-capital','member-initial','member-username','member-password'].forEach(id=>$(id)?.addEventListener('input',renderMemberValidation));
    $('member-cuit').addEventListener('input',e=>{e.target.value=formatCUIT(e.target.value);resetMono();renderMonoResult();renderMemberValidation()});$('member-monotributo').addEventListener('change',()=>{resetMono();renderMonoResult();renderMemberValidation()});$('verify-monotributo').onclick=verifyMemberPdf;
    $('member-name').addEventListener('input',()=>{if(!memberUiState.reactivatingId&&!$('member-username').value.trim()){$('member-username').value=$('member-name').value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/\s+/)[0].replace(/[^a-z0-9._-]/g,'');renderMemberValidation()}});
    $('member-form').addEventListener('submit',async e=>{e.preventDefault();const s=getMemberFormState(members);if(memberUiState.reactivatingId){if(!s.fileOk||!s.monoOk){notify('Para reincorporar se requiere una nueva constancia verificada.','error');return}try{const monotributoContentBase64=await fileToBase64(s.file);await api('/api/members/'+memberUiState.reactivatingId+'/reactivate',{method:'POST',body:JSON.stringify({monotributoFile:s.file.name,monotributoMimeType:s.file.type||'application/pdf',monotributoContentBase64,monotributoExtractedText:memberUiState.mono.extractedText,monotributoAutoVerified:true,monotributoCuitMatched:true})});notify('Reincorporación pendiente de revisión. La nueva constancia quedó guardada en PostgreSQL.');memberUiState.formOpen=false;memberUiState.reactivatingId=null;resetMono();await renderAdminMembers()}catch(err){notify(err.message,'error')}return}
      if(![s.nameOk,s.dniOk,s.cuitOk,s.emailOk,s.capitalOk,s.fileOk,s.monoOk,s.loginOk].every(Boolean)){notify('Revisá los requisitos antes de registrar.','error');renderMemberValidation();return}if(s.duplicate){notify(s.duplicate.active||s.duplicate.verification_pending?'Ya existe un socio o alta pendiente con ese DNI/CUIT.':'Ese DNI/CUIT pertenece a un ex-socio. Usá Reincorporar.','error');return}
      try{const monotributoContentBase64=await fileToBase64(s.file);await api('/api/members',{method:'POST',body:JSON.stringify({fullName:s.fullName,dni:s.dni,cuit:formatCUIT(s.cuit),email:s.email,capitalSubscribed:s.cap,capitalIntegrated:s.integrated,monotributoFile:s.file.name,monotributoMimeType:s.file.type||'application/pdf',monotributoContentBase64,monotributoExtractedText:memberUiState.mono.extractedText,monotributoAutoVerified:true,monotributoCuitMatched:true,username:s.username,password:s.password})});notify('Alta registrada. La constancia quedó guardada en PostgreSQL y el socio pendiente de verificación.');memberUiState.formOpen=false;resetMono();await renderAdminMembers()}catch(err){notify(err.message,'error')}});
  }
  document.querySelectorAll('[data-member-detail]').forEach(btn=>btn.onclick=()=>showMemberDetails(members.find(m=>String(m.id)===btn.dataset.memberDetail)));
  document.querySelectorAll('[data-member-approve]').forEach(btn=>btn.onclick=async()=>{if(!confirm('¿Aprobar el alta y habilitar el acceso del asociado?'))return;try{await api('/api/members/'+btn.dataset.memberApprove+'/approve',{method:'POST'});notify('Socio habilitado.');await renderAdminMembers()}catch(err){notify(err.message,'error')}});
  document.querySelectorAll('[data-member-deactivate]').forEach(btn=>btn.onclick=async()=>{if(!confirm('¿Registrar la baja de este socio?'))return;try{await api('/api/members/'+btn.dataset.memberDeactivate+'/deactivate',{method:'POST'});notify('Baja registrada.');await renderAdminMembers()}catch(err){notify(err.message,'error')}});
  document.querySelectorAll('[data-member-reactivate]').forEach(btn=>btn.onclick=()=>{const m=members.find(x=>String(x.id)===btn.dataset.memberReactivate);memberUiState.formOpen=true;memberUiState.reactivatingId=m.id;resetMono();renderAdminMembers().then(()=>{$('member-name').value=m.full_name;$('member-dni').value=m.dni;$('member-cuit').value=m.cuit;$('member-email').value=m.email||'';$('member-capital').value=m.capital_subscribed;$('member-initial').value=m.capital_integrated;['member-name','member-dni','member-cuit','member-email','member-capital','member-initial'].forEach(id=>$(id).disabled=true);$('member-login-section').classList.add('hidden');renderMemberValidation()})});
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
    if(!confirm('¿Eliminar este registro de horas?'))return;
    try{await api('/api/work-logs/'+btn.dataset.deleteWork,{method:'DELETE'});notify('Registro eliminado.');await renderAdminWork()}catch(err){notify(err.message,'error')}
  }));
}

async function renderAdminRetributions() {
  const [cfg,rows] = await Promise.all([api('/api/retribution/settings'),api('/api/retributions')]);
  $('admin-retribuciones').innerHTML = `
    <div class="grid2">
      <form id="rate-form" class="form-card"><h3>Configuración</h3>
        <div class="form-grid"><label>Valor hora habitual ($)<input id="normal-rate" type="number" min="0" step="100" value="${cfg.normal_rate}"></label><label>Domingo / feriado ($)<input id="special-rate" type="number" min="0" step="100" value="${cfg.special_rate}"></label></div>
        <div class="actions"><button class="primary">Guardar tarifas</button></div><hr class="divider">
        <h3>Feriados nacionales</h3><div class="form-grid"><label>Fecha<input id="holiday-date" type="date"></label><label>Descripción<input id="holiday-description" placeholder="Ej. Día de la Soberanía"></label></div><div class="actions"><button id="add-holiday" type="button" class="secondary">Agregar feriado</button></div>
        <div class="list" style="margin-top:12px">${cfg.holidays.length?cfg.holidays.map(h=>`<div class="row-card"><div><strong>${displayDate(h.holiday_date)}</strong><div class="helper">${esc(h.description)}</div></div><button class="danger" data-holiday="${dateOnly(h.holiday_date)}">Quitar</button></div>`).join(''):'<div class="empty">No hay feriados cargados.</div>'}</div>
      </form>
      <div><div class="section-head"><div><h2>Retribuciones</h2><p class="muted">Cálculo sobre las horas guardadas en base de datos.</p></div></div>
      <div class="list">${rows.map(x=>`<article class="card"><div class="section-head"><div><strong>${esc(x.member.full_name)}</strong><div class="helper">${x.normal_hours} h habituales · ${x.special_hours} h especiales</div></div><div><strong>${money(x.total)}</strong></div></div><div class="helper">Habituales: ${money(x.normal_amount)} · Especiales: ${money(x.special_amount)}</div><div class="actions">${Number(x.transferred_amount)===Number(x.total)&&Number(x.total)>0?'<span class="badge">Transferencia registrada</span>':`<button class="primary" data-transfer="${x.member.id}">Registrar transferencia</button>`}</div></article>`).join('')}</div></div>
    </div>`;
  $('rate-form').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/retribution/settings',{method:'PUT',body:JSON.stringify({normalRate:Number($('normal-rate').value),specialRate:Number($('special-rate').value)})});notify('Tarifas actualizadas.');await renderAdminRetributions()}catch(err){notify(err.message,'error')}});
  $('add-holiday').addEventListener('click',async()=>{try{await api('/api/holidays',{method:'POST',body:JSON.stringify({date:$('holiday-date').value,description:$('holiday-description').value})});notify('Feriado agregado.');await renderAdminRetributions()}catch(err){notify(err.message,'error')}});
  document.querySelectorAll('[data-holiday]').forEach(btn=>btn.addEventListener('click',async()=>{try{await api('/api/holidays/'+btn.dataset.holiday,{method:'DELETE'});notify('Feriado eliminado.');await renderAdminRetributions()}catch(err){notify(err.message,'error')}}));
  document.querySelectorAll('[data-transfer]').forEach(btn=>btn.addEventListener('click',async()=>{try{await api('/api/retributions/'+btn.dataset.transfer+'/transfer',{method:'POST'});notify('Transferencia registrada.');await renderAdminRetributions()}catch(err){notify(err.message,'error')}}));
}



async function renderAdminFinance(){
  const rows=await api('/api/financial-movements');
  const income=rows.filter(x=>x.movement_type==='Ingreso').reduce((s,x)=>s+Number(x.amount||0),0),expense=rows.filter(x=>x.movement_type==='Gasto').reduce((s,x)=>s+Number(x.amount||0),0);
  $('admin-finanzas').innerHTML=`<div class="grid3"><div class="card"><div class="metric-label">Ingresos</div><div class="metric">${money(income)}</div></div><div class="card"><div class="metric-label">Gastos</div><div class="metric">${money(expense)}</div></div><div class="card"><div class="metric-label">Saldo</div><div class="metric">${money(income-expense)}</div></div></div><form id="finance-form" class="form-card" style="margin-top:14px"><h3>Registrar movimiento</h3><div class="form-grid"><label>Tipo<select id="finance-type"><option>Ingreso</option><option>Gasto</option></select></label><label>Concepto<input id="finance-concept" maxlength="120" required></label><label>Monto ($)<input id="finance-amount" type="number" min="1" step="100" required></label><label>Fecha<input id="finance-date" type="date" required></label></div><div class="actions"><button class="primary">Registrar</button></div></form><div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th>Monto</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${displayDate(x.movement_date)}</td><td>${esc(x.movement_type)}</td><td>${esc(x.concept)}</td><td>${money(x.amount)}</td></tr>`).join('')}</tbody></table></div>`;
  $('finance-date').value=new Date().toISOString().slice(0,10);$('finance-form').onsubmit=async e=>{e.preventDefault();try{await api('/api/financial-movements',{method:'POST',body:JSON.stringify({movementType:$('finance-type').value,concept:$('finance-concept').value,amount:Number($('finance-amount').value),movementDate:$('finance-date').value})});notify('Movimiento registrado.');await renderAdminFinance()}catch(err){notify(err.message,'error')}};
}

async function renderAdminWithdrawals(){
  const logs=await api('/api/work-logs');
  $('admin-retiros').innerHTML=`<div class="card"><h2>Anticipos de retiro y excedentes</h2><p class="muted">Simulación proporcional a las horas registradas.</p><div class="form-grid"><label>Monto disponible para distribuir ($)<input id="distribution-total" type="number" min="0" step="1000" value="300000"></label></div><div class="actions"><button id="calculate-distribution" class="primary">Calcular distribución</button></div></div><div id="distribution-results" class="grid2" style="margin-top:12px"></div>`;
  $('calculate-distribution').onclick=()=>{const total=Number($('distribution-total').value||0),sum=logs.reduce((s,x)=>s+Number(x.hours||0),0),by={};logs.forEach(x=>by[x.full_name]=(by[x.full_name]||0)+Number(x.hours||0));$('distribution-results').innerHTML=Object.entries(by).map(([name,h])=>`<div class="card"><strong>${esc(name)}</strong><div class="helper">${h.toLocaleString('es-AR')} h de ${sum.toLocaleString('es-AR')} h</div><div class="metric">${money(sum?total*h/sum:0)}</div></div>`).join('')||'<div class="empty">No hay horas registradas.</div>'};
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

async function renderAdminHistory() {
  const motions=await api('/api/motions?status=closed');
  $('admin-historial').innerHTML=`<div class="section-head"><div><h2>Historial de asambleas</h2><p class="muted">Las mociones cerradas conservan un snapshot del padrón y de los votos.</p></div></div><div class="list">${motions.length?motions.map(m=>`<article class="motion-card"><div class="motion-head"><div><h3>${esc(m.title)}</h3><div class="helper">Cerrada: ${m.closed_at?new Date(m.closed_at).toLocaleString('es-AR'):'—'}</div></div><span class="badge ${m.result==='approved'?'':'off'}">${m.result==='approved'?'APROBADA':'RECHAZADA'}</span></div>${m.closed_snapshot?`<details style="margin-top:10px"><summary>Ver snapshot histórico</summary><pre class="history-json">${esc(JSON.stringify(m.closed_snapshot,null,2))}</pre></details>`:''}</article>`).join(''):'<div class="empty">Todavía no hay mociones cerradas.</div>'}</div>`;
}

async function getAssociateData() {
  const me = await api('/api/me');
  return me.member;
}

async function renderAssociateHome() {
  const [member, logs, retribution, motions, mono] = await Promise.all([getAssociateData(),api('/api/work-logs'),api('/api/retribution/me'),api('/api/motions'),api('/api/me/monotributo/status')]);
  const hours=logs.reduce((s,x)=>s+Number(x.hours||0),0);
  const pending=motions.filter(m=>!m.own_vote).length;
  const d=mono.document;
  const alert=d?.validity_status==='expired'?`<div class="expiry-alert danger-alert"><strong>Tu constancia de monotributo está vencida.</strong><span>Venció el ${displayDate(d.expires_at)}. Cargá una nueva desde Mi perfil.</span></div>`:d?.validity_status==='expiring'?`<div class="expiry-alert warning-alert"><strong>Tu constancia está por vencer.</strong><span>Vence en ${d.days_remaining} día${Number(d.days_remaining)===1?'':'s'} (${displayDate(d.expires_at)}). Podés renovarla desde Mi perfil.</span></div>`:!d||d.validity_status==='unknown'?`<div class="expiry-alert warning-alert"><strong>No pudimos determinar la vigencia de tu constancia.</strong><span>Subí una constancia nueva desde Mi perfil.</span></div>`:'';
  $('assoc-inicio').innerHTML=`${alert}<div class="grid3"><div class="card"><div class="metric-label">Mis horas</div><div class="metric">${hours.toLocaleString('es-AR')} h</div></div><div class="card"><div class="metric-label">Mi retribución</div><div class="metric">${money(retribution.total)}</div></div><div class="card"><div class="metric-label">Mociones pendientes</div><div class="metric">${pending}</div></div></div><div class="card" style="margin-top:12px"><h2>Hola, ${esc(member.full_name.split(/\s+/)[0])}</h2><p class="muted">Desde este portal podés consultar tu perfil, cargar tus propias horas y votar las mociones abiertas.</p></div>`;
}

async function renderAssociateProfile() {
  const [m,mono]=await Promise.all([getAssociateData(),api('/api/me/monotributo/status')]);
  const pending=Math.max(0,Number(m.capital_subscribed)-Number(m.capital_integrated));
  const roles=(m.roles||[]).length?(m.roles||[]):['Asociado'];
  const d=mono.document;
  const items=[['DNI',m.dni],['CUIT',m.cuit],['Correo',m.email],['Fecha de alta',displayDate(m.joined_on)],['Rol / cargos',roles.join(', ')],['Capital suscripto',money(m.capital_subscribed)],['Capital integrado',money(m.capital_integrated)],['Saldo pendiente',money(pending)]];
  const statusHtml=d?`${monoBadge(d.validity_status,d.days_remaining)}<div class="mono-dates"><span>Emisión: <strong>${displayDate(d.issued_at)}</strong></span><span>Vencimiento: <strong>${displayDate(d.expires_at)}</strong></span></div>`:`<span class="badge info">Sin constancia almacenada</span>`;
  const warning=d?.validity_status==='expired'?`<div class="expiry-alert danger-alert"><strong>Constancia vencida</strong><span>Venció el ${displayDate(d.expires_at)}. Subí una nueva para actualizar tu documentación.</span></div>`:d?.validity_status==='expiring'?`<div class="expiry-alert warning-alert"><strong>Tu constancia vence pronto</strong><span>Quedan ${d.days_remaining} día${Number(d.days_remaining)===1?'':'s'}.</span></div>`:'';
  $('assoc-perfil').innerHTML=`${warning}<div class="card"><div class="section-head"><div><h2>${esc(m.full_name)}</h2><p class="muted">Información personal en modo lectura.</p></div><span class="badge">Activo</span></div><div class="info-grid">${items.map(([k,v])=>`<div class="info-item"><span>${esc(k)}</span><strong>${esc(v??'—')}</strong></div>`).join('')}</div></div><div class="card" style="margin-top:12px"><div class="section-head"><div><h2>Constancia de monotributo</h2><p class="muted">La renovación se verifica automáticamente: documento, CUIT y fecha de vencimiento comparada con la fecha actual.</p></div><div>${statusHtml}</div></div><div class="actions">${m.monotributo_stored?`<button class="secondary" id="assoc-download-monotributo">Descargar constancia actual</button>`:''}</div><hr class="divider"><label>Actualizar constancia (PDF)<input id="assoc-monotributo-file" type="file" accept="application/pdf,.pdf"></label><div class="helper">Máximo 5 MB. La constancia debe incluir una fecha de vencimiento legible; no se consulta ningún servicio externo.</div><div id="assoc-mono-upload-result" class="mono-result pending">Seleccioná un PDF para renovar la constancia.</div><div class="actions"><button class="primary" id="assoc-upload-monotributo">Verificar y actualizar constancia</button></div></div>`;
  $('assoc-download-monotributo')?.addEventListener('click',async()=>{try{await downloadMonotributo(m.id,m.monotributo_file)}catch(err){notify(err.message,'error')}});
  $('assoc-upload-monotributo').addEventListener('click',async()=>{const file=$('assoc-monotributo-file').files?.[0];const result=$('assoc-mono-upload-result');if(!file){result.className='mono-result bad';result.textContent='Seleccioná un archivo PDF.';return}if(file.size>5*1024*1024){result.className='mono-result bad';result.textContent='El PDF supera los 5 MB.';return}result.className='mono-result pending';result.textContent='Verificando constancia...';try{const extractedText=await extractPdfText(file);if(!String(extractedText||'').trim())throw new Error('No se pudo extraer texto del PDF. Probá con una constancia con texto seleccionable.');const contentBase64=await fileToBase64(file);const data=await api('/api/me/monotributo',{method:'POST',body:JSON.stringify({fileName:file.name,mimeType:file.type||'application/pdf',contentBase64,extractedText})});result.className='mono-result good';result.textContent=data.validation.message;notify('Constancia actualizada y verificada.');setTimeout(()=>renderAssociateProfile().catch(()=>{}),500)}catch(err){result.className='mono-result bad';result.textContent=err.message}});
}

async function renderAssociateHours() {
  const logs=await api('/api/work-logs');
  $('assoc-horas').innerHTML=`<div class="split"><form id="assoc-hours-form" class="form-card"><h2>Registrar trabajo</h2><p class="muted">La carga queda vinculada automáticamente a tu usuario.</p><label>Fecha<input id="assoc-date" type="date" required></label><label>Horas<input id="assoc-hours" type="number" min="0.5" max="23.5" step="0.5" required></label><label>Descripción<textarea id="assoc-description" rows="3" maxlength="180"></textarea></label><div class="notice" style="margin-top:12px">No podés cargar horas para otro socio ni duplicar una fecha.</div><div class="actions"><button class="primary">Registrar horas</button></div></form><div><div class="section-head"><div><h2>Mis registros</h2><p class="muted">Estos mismos registros aparecen en Administración.</p></div></div><div class="list">${logs.length?logs.map(x=>`<article class="row-card"><div><strong>${displayDate(x.work_date)}</strong><div class="helper">${esc(x.description||'Sin detalle')}${x.special?' · Domingo / feriado':''}</div></div><strong>${Number(x.hours).toLocaleString('es-AR')} h</strong></article>`).join(''):'<div class="empty">Todavía no registraste horas.</div>'}</div></div></div>`;
  $('assoc-date').value=new Date().toISOString().slice(0,10);
  $('assoc-hours-form').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/work-logs',{method:'POST',body:JSON.stringify({workDate:$('assoc-date').value,hours:Number($('assoc-hours').value),description:$('assoc-description').value})});notify('Horas registradas. Administración ya puede ver la carga.');await renderAssociateHours()}catch(err){notify(err.message,'error')}});
}

async function renderAssociateRetribution() {
  const [x,cfg]=await Promise.all([api('/api/retribution/me'),api('/api/retribution/settings')]);
  const transferred=Number(x.transferred_amount)===Number(x.total)&&Number(x.total)>0;
  $('assoc-retribucion').innerHTML=`<div class="card"><div class="section-head"><div><h2>Mi retribución</h2><p class="muted">Calculada con la configuración definida por Administración.</p></div><span class="badge ${transferred?'':'pending'}">${transferred?'Transferencia registrada':'Pendiente de transferencia'}</span></div><div class="grid3"><div class="card soft"><div class="metric-label">Horas habituales</div><div class="metric">${x.normal_hours} h</div><div class="helper">${money(x.normal_rate)} / h · ${money(x.normal_amount)}</div></div><div class="card soft"><div class="metric-label">Domingo / feriado</div><div class="metric">${x.special_hours} h</div><div class="helper">${money(x.special_rate)} / h · ${money(x.special_amount)}</div></div><div class="card soft"><div class="metric-label">Total</div><div class="metric">${money(x.total)}</div></div></div><div class="notice" style="margin-top:12px">Los domingos son especiales automáticamente. Feriados cargados por Administración: <strong>${cfg.holidays.length}</strong>.</div></div>`;
}

async function renderAssociateAssembly() {
  const motions=await api('/api/motions');
  $('assoc-asamblea').innerHTML=`<div class="section-head"><div><h2>Mociones abiertas</h2><p class="muted">Tu usuario identifica automáticamente quién emite el voto. No podés votar en nombre de otra persona.</p></div></div><div class="list">${motions.length?motions.map(m=>`<article class="motion-card"><div class="motion-head"><div><h3>${esc(m.title)}</h3><div class="helper">${m.motion_type==='extraordinary'?'Mayoría especial ≥ 66%':'Mayoría simple > 50%'}</div></div><span class="badge info">${m.motion_type==='extraordinary'?'Extraordinaria':'Ordinaria'}</span></div>${m.own_vote?`<div class="notice" style="margin-top:12px"><strong>✓ Voto emitido:</strong> ${esc(m.own_vote.vote)}</div>`:`<div class="vote-actions"><button class="secondary" data-vote="A favor" data-motion="${m.id}">A favor</button><button class="secondary" data-vote="En contra" data-motion="${m.id}">En contra</button><button class="secondary" data-vote="Abstención" data-motion="${m.id}">Abstención</button></div>`}</article>`).join(''):'<div class="empty">No hay mociones abiertas.</div>'}</div>`;
  document.querySelectorAll('[data-vote][data-motion]').forEach(btn=>btn.addEventListener('click',async()=>{try{await api(`/api/motions/${btn.dataset.motion}/vote`,{method:'POST',body:JSON.stringify({vote:btn.dataset.vote})});notify('Voto registrado. El cómputo de Administración ya fue actualizado.');await renderAssociateAssembly()}catch(err){notify(err.message,'error')}}));
}

if (state.token && state.user) startApp();
