
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const STATUSES=["Importado pelo Claude","Aguardando conferência","Conferido","Distribuído","Em elaboração","Aguardando revisão","Revisado","Protocolado","Concluído"];
let sessionUser=null, profile=null, tasks=[], profiles=[], historyRows=[], editing=null;
let officeSettings={office_name:"Escritório convidado",system_name:"BRZ/BRUTUS",subtitle:"Conferência, distribuição, revisão e controle de prazos",configured:false};
let feedbackRating=0,feedbackCycle=0,feedbackUsageDays=0;

const $=id=>document.getElementById(id);
const today=()=>new Date().toISOString().slice(0,10);
const fmt=d=>{if(!d)return "-";const [y,m,a]=d.split("-");return `${a}/${m}/${y}`};
const due=t=>t.prazo_interno||t.prazo_judicial||"";
function normalizeProcessNumber(v){return String(v||"").toUpperCase().replace(/[^0-9A-Z]/g,"")}
function normalizeText(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/\s+/g," ").trim()}
function taskFingerprint(x){
  const proc=normalizeProcessNumber(x.processo), prov=normalizeText(x.providencia||x.tarefa);
  if(proc)return `${proc}|${prov}`;
  return `SEM-PROC|${normalizeText(x.cliente)}|${prov}|${x.prazoJudicial||x.prazo_judicial||x.vencimento||""}`;
}

function normalizePriority(value){
  const raw=normalizeText(value).replace(/[^A-Z ]/g,"").trim();
  const aliases={
    "URGENTE":"URGENTE",
    "ALTA":"ALTA",
    "NORMAL":"NORMAL",
    "MEDIA":"NORMAL",
    "MEDIO":"NORMAL",
    "BAIXA":"ACOMPANHAMENTO",
    "ACOMPANHAMENTO":"ACOMPANHAMENTO",
    "CONFERENCIA":"CONFERÊNCIA"
  };
  return aliases[raw]||"CONFERÊNCIA";
}


function pbadge(p){let c=p==="URGENTE"?"red":p==="ALTA"?"orange":p==="CONFERÊNCIA"?"purple":p==="NORMAL"?"blue":"gray";return `<span class="badge ${c}">${p||"-"}</span>`}
function sbadge(s){let c=s==="Concluído"?"green":s==="Protocolado"?"blue":(s||"").toLowerCase().includes("confer")||s==="Importado pelo Claude"?"purple":s==="Aguardando revisão"?"orange":"gray";return `<span class="badge ${c}">${s||"-"}</span>`}
function dueHTML(t){const d=due(t),cls=d<today()&&t.status!=="Concluído"?"late":d===today()?"today":"";return `<span class="deadline ${cls}">${fmt(d)}</span>${t.prazo_interno&&t.prazo_judicial?`<br><small>Judicial: ${fmt(t.prazo_judicial)}</small>`:""}`}

async function init(){
  $("status").innerHTML=STATUSES.map(x=>`<option>${x}</option>`).join("");
  bindEvents();
  await loadOfficeSettings();
  const {data:{session}}=await sb.auth.getSession();
  if(session) await startApp(session.user);
}
function bindEvents(){
  $("loginBtn").onclick=login;
  $("publicSendBtn").onclick=publicImportJSON;
  $("logoutBtn").onclick=()=>sb.auth.signOut().then(()=>location.reload());
  $("newTaskBtn").onclick=()=>openTask(null,"task");$("newPendingBtn").onclick=()=>openTask(null,"pending");$("importBtn").onclick=()=>$("fileInput").click();$("fileInput").onchange=importJSON;
  document.querySelectorAll(".metric-card").forEach(card=>{
    card.onclick=()=>openMetric(card.dataset.metric);
    card.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openMetric(card.dataset.metric)}};
  });
  $("closeMetricBtn").onclick=closeMetric;
  $("metricModal").onclick=e=>{if(e.target===$("metricModal"))closeMetric()};
  $("exportBtn").onclick=exportCSV;
  $("clearLastImportBtn").onclick=clearLastImport;
  $("clearBaseBtn").onclick=clearBase;
  $("officeSettingsBtn").onclick=openOfficeSettings;
  $("cancelOfficeSettingsBtn").onclick=()=>$("officeSettingsModal").classList.remove("open");
  $("saveOfficeSettingsBtn").onclick=saveOfficeSettings;
  $("dismissFeedbackBtn").onclick=()=>$("feedbackModal").classList.remove("open");
  $("sendFeedbackBtn").onclick=sendFeedback;
  document.querySelectorAll("#feedbackRating button").forEach(btn=>btn.onclick=()=>selectFeedbackRating(Number(btn.dataset.rating)));
  $("cancelBtn").onclick=closeTask;$("saveBtn").onclick=saveTask;$("deleteBtn").onclick=deleteTask;
  ["search","fOwner","fStatus","fPriority","fDue"].forEach(id=>$(id).addEventListener(id==="search"?"input":"change",render));
  document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>showView(b.dataset.view,b));
}

function applyBranding(){
  const office=officeSettings.office_name||"Escritório convidado";
  const system=officeSettings.system_name||"BRZ/BRUTUS";
  const subtitle=officeSettings.subtitle||"Conferência, distribuição, revisão e controle de prazos";
  $("loginOfficeName").textContent=office;
  $("appOfficeTitle").textContent=`Controladoria Jurídica — ${office}`;
  $("appSubtitle").textContent=subtitle;
  document.title=`${system} | ${office}`;
}

async function loadOfficeSettings(){
  const {data,error}=await sb.from("office_settings").select("*").eq("id",true).maybeSingle();
  if(!error&&data)officeSettings=data;
  applyBranding();
}

function openOfficeSettings(required=false){
  $("officeNameInput").value=officeSettings.office_name||"";
  $("systemNameInput").value=officeSettings.system_name||"BRZ/BRUTUS";
  $("officeSubtitleInput").value=officeSettings.subtitle||"Conferência, distribuição, revisão e controle de prazos";
  $("cancelOfficeSettingsBtn").classList.toggle("hidden",required);
  $("officeSettingsModal").classList.add("open");
}

async function saveOfficeSettings(){
  if(profile?.role!=="admin")return;
  const office_name=$("officeNameInput").value.trim();
  const system_name=$("systemNameInput").value.trim()||"BRZ/BRUTUS";
  const subtitle=$("officeSubtitleInput").value.trim()||"Conferência, distribuição, revisão e controle de prazos";
  if(office_name.length<2){alert("Informe o nome do escritório.");return}
  const btn=$("saveOfficeSettingsBtn");btn.disabled=true;btn.textContent="Salvando...";
  const {data,error}=await sb.from("office_settings").update({office_name,system_name,subtitle,configured:true,configured_by:sessionUser.id}).eq("id",true).select().single();
  btn.disabled=false;btn.textContent="Salvar identidade";
  if(error){alert("Não foi possível salvar: "+error.message);return}
  officeSettings=data;applyBranding();$("officeSettingsModal").classList.remove("open");
}

function selectFeedbackRating(value){
  feedbackRating=value;
  document.querySelectorAll("#feedbackRating button").forEach(btn=>{
    const active=Number(btn.dataset.rating)<=value;
    btn.classList.toggle("active",active);btn.setAttribute("aria-checked",String(Number(btn.dataset.rating)===value));
  });
}

async function recordUsageAndCheckFeedback(){
  const usage_date=today();
  const {error:usageError}=await sb.from("usage_days").upsert({user_id:sessionUser.id,usage_date},{onConflict:"user_id,usage_date",ignoreDuplicates:true});
  if(usageError){console.error("Registro de uso:",usageError);return}
  const {data:days,error:daysError}=await sb.from("usage_days").select("usage_date").eq("user_id",sessionUser.id);
  if(daysError){console.error("Contagem de uso:",daysError);return}
  feedbackUsageDays=days?.length||0;feedbackCycle=Math.floor(feedbackUsageDays/5);
  if(feedbackCycle<1)return;
  const {data:sent,error:feedbackError}=await sb.from("user_feedback").select("id").eq("user_id",sessionUser.id).eq("usage_cycle",feedbackCycle).maybeSingle();
  if(feedbackError){console.error("Consulta de avaliação:",feedbackError);return}
  if(sent)return;
  feedbackRating=0;$("feedbackSuggestion").value="";$("feedbackMsg").classList.add("hidden");
  $("feedbackCycleLabel").textContent=`${feedbackCycle*5}º dia efetivo de uso`;
  selectFeedbackRating(0);$("feedbackModal").classList.add("open");
}

async function sendFeedback(){
  const msg=$("feedbackMsg");
  if(!feedbackRating){msg.textContent="Selecione uma avaliação de 1 a 5 estrelas.";msg.className="msg";return}
  const btn=$("sendFeedbackBtn");btn.disabled=true;btn.textContent="Enviando...";
  const {error}=await sb.from("user_feedback").insert({user_id:sessionUser.id,usage_cycle:feedbackCycle,usage_days_count:feedbackUsageDays,rating:feedbackRating,suggestion:$("feedbackSuggestion").value.trim()||null});
  btn.disabled=false;btn.textContent="Enviar avaliação";
  if(error){msg.textContent="Não foi possível enviar: "+error.message;msg.className="msg";return}
  msg.textContent="Obrigado. Sua avaliação foi registrada.";msg.className="msg success";
  setTimeout(()=>$("feedbackModal").classList.remove("open"),900);
}

function setPublicImportMessage(text,type="info"){
  const el=$("publicImportMsg");
  el.textContent=text;
  el.className=`msg ${type}`;
  el.classList.remove("hidden");
}

function normalizeImportPayload(p){
  const tarefas=Array.isArray(p)?p:(p?.tarefas||p?.tasks||[]);
  if(!Array.isArray(tarefas) || tarefas.length===0) throw new Error("O JSON não contém tarefas.");
  if(tarefas.length>500) throw new Error("O arquivo excede o limite de 500 tarefas.");
  return {raw:p,tarefas};
}

async function publicImportJSON(){
  const fileInput=$("publicFileInput");
  const sendBtn=$("publicSendBtn");
  const f=fileInput.files?.[0];

  if(!f){
    setPublicImportMessage("Selecione um arquivo JSON antes de enviar.","");
    return;
  }

  if(f.size>2*1024*1024){
    setPublicImportMessage("Arquivo muito grande. Limite: 2 MB.","");
    return;
  }

  fileInput.disabled=true;
  sendBtn.disabled=true;
  sendBtn.textContent="Enviando...";

  try{
    const text=await f.text();
    const parsed=JSON.parse(text);
    const {raw,tarefas}=normalizeImportPayload(parsed);

    const auditoria=(raw && !Array.isArray(raw) && raw.auditoria) ? raw.auditoria : {};
    const {error}=await sb.from("import_batches").insert({
      filename:f.name,
      payload:raw,
      item_count:tarefas.length,
      source:"Claude",
      audit_date:auditoria?.data||null,
      status:"pending"
    });

    if(error) throw error;

    setPublicImportMessage(
      `Arquivo enviado com sucesso: ${f.name} — ${tarefas.length} tarefa(s).`,
      "success"
    );
    fileInput.value="";
  }catch(err){
    setPublicImportMessage("Não foi possível enviar: "+(err?.message||"JSON inválido."),"");
  }finally{
    fileInput.disabled=false;
    sendBtn.disabled=false;
    sendBtn.textContent="Enviar arquivo";
  }
}

async function processPendingPublicImports(){
  const badge=$("pendingImportBadge");
  const {data:batches,error}=await sb.from("import_batches").select("*").eq("status","pending").order("created_at",{ascending:true});
  if(error){console.error(error);return}
  if(!batches?.length){badge.classList.add("hidden");return}
  badge.textContent=`${batches.length} importação(ões) pendente(s)`;badge.classList.remove("hidden");

  const {data:existing,error:ee}=await sb.from("tasks").select("*");
  if(ee){console.error(ee);return}
  const seen=new Set((existing||[]).filter(t=>t.status!=="Concluído").map(t=>normalizeProcessNumber(t.processo)?`PROC|${normalizeProcessNumber(t.processo)}`:`FALLBACK|${taskFingerprint(t)}`));
  let processed=0,added=0,dups=0;

  for(const batch of batches){
    try{
      const {tarefas}=normalizeImportPayload(batch.payload),rows=[];
      for(const x of tarefas){
        const row={processo:x.processo||"",cliente:x.cliente||"",providencia:x.providencia||x.tarefa||"",
          prioridade:normalizePriority(x.prioridade),prazo_judicial:x.prazoJudicial||x.prazo_judicial||x.vencimento||null,
          prazo_interno:null,responsavel_id:null,status:"Aguardando conferência",origem:x.origem||x.ato||"",
          observacoes:x.observacoes||"",conferido:false,created_by:sessionUser.id,updated_by:sessionUser.id,import_batch_id:batch.id};
        const fp=normalizeProcessNumber(row.processo)?`PROC|${normalizeProcessNumber(row.processo)}`:`FALLBACK|${taskFingerprint(row)}`;if(seen.has(fp)){dups++;continue}seen.add(fp);rows.push(row);
      }
      let created=[];
      if(rows.length){const r=await sb.from("tasks").insert(rows).select("id");if(r.error)throw r.error;created=r.data||[]}
      if(created.length)await sb.from("task_history").insert(created.map(x=>({task_id:x.id,user_id:sessionUser.id,acao:"Importação de relatório",detalhe:`Lote ${batch.id}`})));
      const u=await sb.from("import_batches").update({status:"processed",processed_at:new Date().toISOString(),processed_by:sessionUser.id}).eq("id",batch.id);
      if(u.error)throw u.error;processed++;added+=rows.length;
    }catch(err){console.error(err);await sb.from("import_batches").update({status:"error",error_message:String(err?.message||err).slice(0,1000)}).eq("id",batch.id)}
  }
  badge.classList.add("hidden");
  if(processed)alert(`${added} nova(s) tarefa(s) incluída(s). ${dups} repetida(s) ignorada(s). A base anterior foi mantida.`);
}

async function login(){
  $("loginMsg").classList.add("hidden");
  const {data,error}=await sb.auth.signInWithPassword({email:$("loginEmail").value.trim(),password:$("loginPassword").value});
  if(error){$("loginMsg").textContent=error.message;$("loginMsg").classList.remove("hidden");return}
  await startApp(data.user);
}
async function startApp(user){
  sessionUser=user;
  let {data:p,error}=await sb.from("profiles").select("*").eq("id",user.id).single();
  if(error||!p){
    const detalhe=error?.message ? `\n\nDetalhe do Supabase: ${error.message}` : "";
    alert("Usuário autenticado, mas o perfil não pôde ser carregado."+detalhe);
    await sb.auth.signOut();
    return;
  }
  profile=p;
  $("loginScreen").classList.add("hidden");$("app").classList.remove("hidden");
  $("userName").textContent=p.nome||user.email;$("userRole").textContent=p.role==="admin"?"Administrador":"Colaborador";
  document.querySelectorAll(".admin-only").forEach(el=>el.classList.toggle("hidden",p.role!=="admin"));
  if(p.role!=="admin") {$("importBtn").classList.add("hidden");}
  if(p.role==="admin") await processPendingPublicImports();
  await loadAll();
  if(p.role==="admin"&&!officeSettings.configured)openOfficeSettings(true);
  await recordUsageAndCheckFeedback();
}
async function loadAll(){
  const [{data:t,error:te},{data:p,error:pe},{data:h,error:he},{data:b,error:be}] = await Promise.all([
    sb.from("tasks").select("*").order("prazo_interno",{ascending:true,nullsFirst:false}),
    sb.from("profiles").select("id,nome,email,role,ativo").eq("ativo",true).order("nome"),
    sb.from("task_history").select("*, profiles(nome), tasks(processo)").order("created_at",{ascending:false}).limit(300),
    profile?.role==="admin"
      ? sb.from("import_batches").select("id,filename,audit_date,created_at,processed_at,status,item_count").eq("status","processed").order("processed_at",{ascending:false,nullsFirst:false}).limit(3)
      : Promise.resolve({data:[],error:null})
  ]);
  if(te) console.error(te); if(pe) console.error(pe); if(he) console.error(he); if(be) console.error(be);
  tasks=t||[];profiles=p||[];historyRows=h||[];importBatches=b||[];render();
}
function table(arr,review=false){
 if(!arr.length)return '<div class="empty">Nenhum item nesta fila.</div>';
 return `<div class="task-table-scroll"><table><thead><tr><th>Prioridade</th><th>Prazo</th><th>Processo</th><th>Cliente</th><th>Providência</th><th>Responsável</th><th>Status</th><th></th></tr></thead><tbody>`+
 arr.map(t=>{const owner=profiles.find(p=>p.id===t.responsavel_id),isPending=String(t.observacoes||"").includes("[PENDENCIA_INICIAL]");return `<tr class="${isPending?"pending-initial-row":""}"><td>${pbadge(t.prioridade)}${isPending?'<br><span class="badge pending-initial-badge">INICIAL PENDENTE</span>':""}</td><td>${dueHTML(t)}</td><td><strong>${t.processo||"-"}</strong>${t.conferido?'<br><span class="badge green">✓ Conferido</span>':'<br><span class="badge purple">A conferir</span>'}</td><td>${t.cliente||"-"}</td><td>${t.providencia||"-"}</td><td>${owner?.nome||'<span class="late">Não atribuído</span>'}</td><td>${sbadge(t.status)}</td><td><button class="secondary" onclick="openTask('${t.id}')">${review?"Conferir":"Editar"}</button></td></tr>`}).join("")+"</tbody></table></div>"
}
function render(){
 const td=today(),active=tasks.filter(t=>t.status!=="Concluído");
 const recent=$("recentImports");
 if(recent){
   const fmtDT=v=>v?new Date(v).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"}):"-";
   recent.innerHTML=importBatches.length
     ? importBatches.map((b,i)=>`<div class="recent-import"><strong>${i+1}ª</strong><span>${b.audit_date?fmt(b.audit_date):fmtDT(b.processed_at||b.created_at)}</span><small>${b.filename||"Relatório"} · ${b.item_count||0} item(ns)</small></div>`).join("")
     : '<div class="empty">Nenhuma importação processada.</div>';
 }
 $("mActive").textContent=active.length;$("mReview").textContent=active.filter(t=>!t.conferido).length;
 $("mLate").textContent=active.filter(t=>due(t)&&due(t)<td).length;$("mPendingInitial").textContent=active.filter(t=>String(t.observacoes||"").includes("[PENDENCIA_INICIAL]")).length;
 $("mUrgent").textContent=active.filter(t=>t.prioridade==="URGENTE").length;$("mFiled").textContent=active.filter(t=>t.status==="Protocolado").length;
 const done=tasks.filter(t=>t.status==="Concluído").length;$("mRate").textContent=tasks.length?Math.round(done/tasks.length*100)+"%":"0%";
 $("generalTable").innerHTML=table([...active].sort((a,b)=>(due(a)||"9999").localeCompare(due(b)||"9999")));
 $("reviewTable").innerHTML=table(tasks.filter(t=>!t.conferido&&t.status!=="Concluído").sort((a,b)=>(due(a)||"9999").localeCompare(due(b)||"9999")),true);
 const owners=profiles.filter(p=>p.ativo!==false);
 const current=$("fOwner").value;
 $("fOwner").innerHTML='<option value="">Todos responsáveis</option>'+owners.map(o=>`<option value="${o.id}">${o.nome}${o.role==="admin"?" (Administrador)":""}</option>`).join("");
 $("fOwner").value=current;
 $("fStatus").innerHTML='<option value="">Todos status</option>'+STATUSES.map(x=>`<option>${x}</option>`).join("");
 const q=$("search").value.toLowerCase(),fd=$("fDue").value;
 let filtered=tasks.filter(t=>{
   if(profile.role!=="admin" && t.responsavel_id!==profile.id) return false;
   const blob=`${t.processo} ${t.cliente} ${t.providencia}`.toLowerCase(),d=due(t);
   const dm=!fd||(fd==="late"&&d&&d<td)||(fd==="today"&&d===td)||(fd==="7"&&d&&d>=td&&d<=new Date(Date.now()+7*864e5).toISOString().slice(0,10));
   return (!q||blob.includes(q))&&(!$("fOwner").value||t.responsavel_id===$("fOwner").value)&&(!$("fStatus").value||t.status===$("fStatus").value)&&(!$("fPriority").value||t.prioridade===$("fPriority").value)&&dm;
 });
 $("teamTable").innerHTML=table(filtered.sort((a,b)=>(due(a)||"9999").localeCompare(due(b)||"9999")));
 $("ownersPanel").innerHTML=owners.length?owners.map(o=>{let a=tasks.filter(t=>t.responsavel_id===o.id),d=a.filter(t=>t.status==="Concluído").length,r=a.length?Math.round(d/a.length*100):0,late=a.filter(t=>t.status!=="Concluído"&&due(t)&&due(t)<td).length;return `<div class="person"><strong>${o.nome}</strong><small><button type="button" class="perf-link" data-owner="${o.id}" data-kind="open">${a.length-d} abertas</button> · <button type="button" class="perf-link" data-owner="${o.id}" data-kind="late">${late} vencidas</button> · <button type="button" class="perf-link" data-owner="${o.id}" data-kind="done">${d} concluídas</button></small><div class="bar"><span style="width:${r}%"></span></div><small>${r}% de cumprimento</small></div>`}).join(""):'<div class="empty">Nenhum colaborador cadastrado.</div>';
 $("ownersPanel").querySelectorAll(".perf-link").forEach(btn=>btn.addEventListener("click",()=>openOwnerList(btn.dataset.owner,btn.dataset.kind)));
 renderHistory();
}
function renderHistory(){
 const rows=profile.role==="admin"?historyRows:historyRows.filter(h=>h.user_id===profile.id);
 $("historyTable").innerHTML=rows.length?`<div style="overflow:auto"><table><thead><tr><th>Data</th><th>Processo</th><th>Usuário</th><th>Ação</th><th>Detalhe</th></tr></thead><tbody>${rows.map(h=>`<tr><td>${new Date(h.created_at).toLocaleString("pt-BR")}</td><td>${h.tasks?.processo||"-"}</td><td>${h.profiles?.nome||"-"}</td><td>${h.acao}</td><td>${h.detalhe||"-"}</td></tr>`).join("")}</tbody></table></div>`:'<div class="empty">Sem histórico.</div>';
}

function openOwnerList(ownerId,kind){
  const owner=profiles.find(p=>String(p.id)===String(ownerId));
  if(!owner)return;
  const td=today();
  const assigned=tasks.filter(t=>String(t.responsavel_id)===String(ownerId));
  let rows=[],label="";
  if(kind==="late"){label="Prazos vencidos";rows=assigned.filter(t=>t.status!=="Concluído"&&due(t)&&due(t)<td)}
  else if(kind==="done"){label="Prazos concluídos";rows=assigned.filter(t=>t.status==="Concluído")}
  else{label="Prazos abertos";rows=assigned.filter(t=>t.status!=="Concluído")}
  $("metricModalTitle").textContent=`${label} — ${owner.nome}`;
  $("metricModalSubtitle").textContent=rows.length?`${rows.length} tarefa(s) encontrada(s).`:"Nenhuma tarefa nesta categoria.";
  $("metricModalContent").innerHTML=rows.length?table([...rows].sort((a,b)=>(due(a)||"9999").localeCompare(due(b)||"9999"))):'<div class="empty">Nenhuma tarefa nesta categoria.</div>';
  $("metricModal").classList.add("open");
}

function metricSelection(type){
  const td=today();
  const active=tasks.filter(t=>t.status!=="Concluído");
  const map={
    active:{
      title:"Tarefas ativas",
      subtitle:"Todas as tarefas ainda não concluídas.",
      rows:active
    },
    review:{
      title:"Aguardando conferência",
      subtitle:"Tarefas que ainda precisam de validação.",
      rows:active.filter(t=>!t.conferido)
    },
    late:{
      title:"Tarefas vencidas",
      subtitle:"Prazo interno ou judicial anterior à data de hoje.",
      rows:active.filter(t=>due(t)&&due(t)<td)
    },
    pendingInitial:{
      title:"Iniciais pendentes",
      subtitle:"Petições iniciais pendentes de elaboração ou distribuição.",
      rows:active.filter(t=>String(t.observacoes||"").includes("[PENDENCIA_INICIAL]"))
    },
    urgent:{
      title:"Tarefas urgentes",
      subtitle:"Itens classificados com prioridade URGENTE.",
      rows:active.filter(t=>t.prioridade==="URGENTE")
    },
    filed:{
      title:"Tarefas protocoladas",
      subtitle:"Protocoladas e ainda não encerradas.",
      rows:active.filter(t=>t.status==="Protocolado")
    },
    done:{
      title:"Tarefas concluídas",
      subtitle:"Itens já encerrados no controle.",
      rows:tasks.filter(t=>t.status==="Concluído")
    }
  };
  return map[type]||{title:"Tarefas",subtitle:"",rows:[]};
}

function openMetric(type){
  const item=metricSelection(type);
  $("metricModalTitle").textContent=`${item.title} (${item.rows.length})`;
  $("metricModalSubtitle").textContent=item.subtitle;
  $("metricModalContent").innerHTML=table(
    [...item.rows].sort((a,b)=>(due(a)||"9999").localeCompare(due(b)||"9999"))
  );
  $("metricModal").classList.add("open");
}

function closeMetric(){
  $("metricModal").classList.remove("open");
}

function showView(id,el){
 document.querySelectorAll(".view").forEach(x=>x.classList.remove("active"));document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
 $(id).classList.add("active");el.classList.add("active")
}
window.openTask=function(id=null,mode="task"){
 editing=id;creationMode=id?"task":mode;const t=id?tasks.find(x=>x.id===id):{};
 $("modalTitle").textContent=id?"Conferir / editar tarefa":creationMode==="pending"?"Nova pendência":"Nova tarefa";
 $("deleteBtn").style.display=id&&profile.role==="admin"?"block":"none";
 ["processo","cliente","providencia","prioridade","prazoJudicial","prazoInterno","status","origem","observacoes","protocolo"].forEach(k=>{
   const db={prazoJudicial:"prazo_judicial",prazoInterno:"prazo_interno"}[k]||k;
   let val=t[db]||(k==="prioridade"?"NORMAL":k==="status"?(creationMode==="pending"?"Em elaboração":"Aguardando conferência"):"");
   if(k==="observacoes") val=String(val).replace(/\[PENDENCIA_INICIAL\]\s*/g,"");
   $(k).value=val;
 });
 $("conferido").value=String(!!t.conferido);
 $("isPendingInitial").checked=String(t.observacoes||"").includes("[PENDENCIA_INICIAL]");
 $("responsavel").innerHTML='<option value="">Não atribuído</option>'+profiles.filter(p=>p.ativo!==false).map(p=>`<option value="${p.id}">${p.nome}${p.role==="admin"?" (Administrador)":""}</option>`).join("");
 $("responsavel").value=t.responsavel_id||"";
 const admin=profile.role==="admin";
 // Colaboradores podem complementar identificação e andamento de tarefas atribuídas.
 ["processo","cliente","status","observacoes","protocolo","isPendingInitial"].forEach(x=>$(x).disabled=false);
 ["providencia","prioridade","prazoJudicial","prazoInterno","responsavel","conferido","origem"].forEach(x=>$(x).disabled=!admin);
 // Nova pendência pode ser cadastrada por qualquer usuário; campos operacionais ficam disponíveis.
 if(!id&&creationMode==="pending"){
   ["processo","cliente","providencia","prioridade","prazoJudicial","prazoInterno","origem","observacoes","protocolo"].forEach(x=>$(x).disabled=false);
   $("responsavel").disabled=!admin;
   $("conferido").disabled=!admin;
 }
 $("taskModal").classList.add("open");
}
function closeTask(){$("taskModal").classList.remove("open")}
async function saveTask(){
 const isAdmin=profile.role==="admin";
 const old=editing?tasks.find(t=>t.id===editing):null;
 const pendingInitial=$("isPendingInitial").checked;
 let obs=$("observacoes").value.replace(/\[PENDENCIA_INICIAL\]\s*/g,"").trim();
 if(pendingInitial) obs="[PENDENCIA_INICIAL] "+obs;
 let payload={
   processo:$("processo").value.trim(),cliente:$("cliente").value.trim(),providencia:$("providencia").value.trim(),
   prioridade:$("prioridade").value,prazo_judicial:$("prazoJudicial").value||null,prazo_interno:$("prazoInterno").value||null,
   responsavel_id:$("responsavel").value||null,status:$("status").value,origem:$("origem").value.trim(),observacoes:obs,
   protocolo:$("protocolo").value.trim(),conferido:$("conferido").value==="true",updated_by:sessionUser.id
 };
 if(!isAdmin && old){
   payload={processo:payload.processo,cliente:payload.cliente,status:payload.status,observacoes:payload.observacoes,protocolo:payload.protocolo,updated_by:sessionUser.id};
 }
 if(!editing && creationMode==="pending"){
   payload.status=payload.status||"Em elaboração";
   payload.origem=payload.origem||"Pendência cadastrada manualmente";
   if(!isAdmin){
     payload.responsavel_id=sessionUser.id;
     payload.conferido=false;
   }
 }
 // Regra da nova pendência: ao concluir, passa a integrar as protocoladas.
 const isManualPending=creationMode==="pending" || (old && old.origem==="Pendência cadastrada manualmente");
 if(isManualPending && payload.status==="Concluído") payload.status="Protocolado";
 let res;
 if(editing) res=await sb.from("tasks").update(payload).eq("id",editing).select().single();
 else {payload.created_by=sessionUser.id;res=await sb.from("tasks").insert(payload).select().single();}
 if(res.error){alert("Erro ao salvar: "+res.error.message);return}
 await sb.from("task_history").insert({task_id:res.data.id,user_id:sessionUser.id,acao:editing?"Atualização":"Criação",detalhe:editing?`Status: ${res.data.status}`:"Tarefa criada"});
 closeTask();await loadAll();
}
async function deleteTask(){
 if(!editing||profile.role!=="admin"||!confirm("Excluir esta tarefa?"))return;
 const {error}=await sb.from("tasks").delete().eq("id",editing);
 if(error){alert(error.message);return}
 closeTask();await loadAll();
}
async function importJSON(e){
  if(profile.role!=="admin")return;
  const f=e.target.files[0];if(!f)return;const r=new FileReader();
  r.onload=async()=>{try{
    const p=JSON.parse(r.result),a=Array.isArray(p)?p:(p.tarefas||p.tasks||[]);
    if(!Array.isArray(a)||!a.length)throw new Error("O JSON não contém tarefas.");
    const auditoria=(!Array.isArray(p)&&p.auditoria)?p.auditoria:{};
    const br=await sb.from("import_batches").insert({filename:f.name,payload:p,item_count:a.length,source:"Importação autenticada",
      audit_date:auditoria?.data||null,status:"processed",processed_at:new Date().toISOString(),processed_by:sessionUser.id}).select().single();
    if(br.error)throw br.error;
    const er=await sb.from("tasks").select("*");if(er.error)throw er.error;
    const seen=new Set((er.data||[]).filter(t=>t.status!=="Concluído").map(t=>normalizeProcessNumber(t.processo)?`PROC|${normalizeProcessNumber(t.processo)}`:`FALLBACK|${taskFingerprint(t)}`)),rows=[];let dups=0;
    for(const x of a){
      const row={processo:x.processo||"",cliente:x.cliente||"",providencia:x.providencia||x.tarefa||"",
        prioridade:normalizePriority(x.prioridade),prazo_judicial:x.prazoJudicial||x.prazo_judicial||x.vencimento||null,
        prazo_interno:null,responsavel_id:null,status:"Aguardando conferência",origem:x.origem||x.ato||"",observacoes:x.observacoes||"",
        conferido:false,created_by:sessionUser.id,updated_by:sessionUser.id,import_batch_id:br.data.id};
      const fp=normalizeProcessNumber(row.processo)?`PROC|${normalizeProcessNumber(row.processo)}`:`FALLBACK|${taskFingerprint(row)}`;if(seen.has(fp)){dups++;continue}seen.add(fp);rows.push(row);
    }
    if(rows.length){const ins=await sb.from("tasks").insert(rows).select("id");if(ins.error)throw ins.error;
      await sb.from("task_history").insert((ins.data||[]).map(x=>({task_id:x.id,user_id:sessionUser.id,acao:"Importação de relatório",detalhe:`Lote ${br.data.id}`})))}
    alert(`${rows.length} nova(s) tarefa(s) incluída(s). ${dups} repetida(s) ignorada(s). A lista anterior foi mantida.`);await loadAll();
  }catch(err){alert("Erro ao importar JSON: "+(err.message||"formato inválido"))}};
  r.readAsText(f);e.target.value="";
}

async function clearLastImport(){
  if(profile?.role!=="admin")return;
  const q=await sb.from("import_batches").select("*").eq("status","processed").order("processed_at",{ascending:false,nullsFirst:false}).limit(1).maybeSingle();
  if(q.error){alert(q.error.message);return}if(!q.data){alert("Não há lista importada para limpar.");return}
  const c=await sb.from("tasks").select("id",{count:"exact",head:true}).eq("import_batch_id",q.data.id);
  if(c.error){alert(c.error.message);return}
  if(!confirm(`Limpar somente a última lista juntada?\n\nArquivo: ${q.data.filename||"-"}\nTarefas acrescentadas por ela: ${c.count||0}\n\nAs listas anteriores serão preservadas.`))return;
  const d=await sb.from("tasks").delete().eq("import_batch_id",q.data.id);if(d.error){alert(d.error.message);return}
  const b=await sb.from("import_batches").delete().eq("id",q.data.id);if(b.error){alert(b.error.message);return}
  alert("Última lista removida. As anteriores foram mantidas.");await loadAll();
}

async function clearBase(){
  if(profile?.role!=="admin"){
    alert("Apenas o administrador pode limpar a base.");
    return;
  }

  const primeira=confirm(
    "ATENÇÃO: esta ação apagará TODAS as tarefas, histórico e listas importadas da Controladoria.\n\nDeseja continuar?"
  );
  if(!primeira)return;

  const codigo=prompt('Para confirmar, digite exatamente: LIMPAR');
  if(codigo!=="LIMPAR"){
    alert("Limpeza cancelada.");
    return;
  }

  try{
    // O histórico ligado às tarefas também é removido pelo ON DELETE CASCADE.
    const {error:e1}=await sb.from("tasks").delete().not("id","is",null);
    if(e1) throw e1;

    const {error:e2}=await sb.from("import_batches").delete().not("id","is",null);
    if(e2) throw e2;

    // Remove eventual histórico órfão.
    const {error:e3}=await sb.from("task_history").delete().not("id","is",null);
    if(e3) console.warn("Histórico órfão não removido:",e3);

    alert("Base limpa com sucesso.");
    await loadAll();
  }catch(err){
    alert("Não foi possível limpar a base: "+(err?.message||err));
  }
}

function exportCSV(){
 const c=["processo","cliente","providencia","prioridade","prazo_judicial","prazo_interno","status","conferido","origem","observacoes","protocolo"],esc=v=>`"${String(v??"").replaceAll('"','""')}"`;
 const csv="\ufeff"+[c.join(";"),...tasks.map(t=>c.map(k=>esc(t[k])).join(";"))].join("\n");
 const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.download="controladoria_brutus.csv";a.click();URL.revokeObjectURL(a.href);
}
init();
