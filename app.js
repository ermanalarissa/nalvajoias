const APP_VERSION = "v1.0.2";
const STORAGE_KEY = "joiaspro_v1";
const CLIENT_KEY = "joiaspro_client_id";
const SYNC_PULL_INTERVAL_MS = 30000;
const AUDITORIA_RETENCAO_DIAS = 30;

const CATEGORIAS_PADRAO = [
  { id: "correntaria", nome: "Correntaria", icon: "📿", ordem: 1 },
  { id: "pulseiras", nome: "Pulseiras", icon: "⛓", ordem: 2 },
  { id: "brincos", nome: "Brincos", icon: "💠", ordem: 3 },
  { id: "argolas", nome: "Argolas", icon: "⍥⃝⃝", ordem: 4 },
  { id: "pingentes", nome: "Pingentes", icon: "🔶", ordem: 5 },
  { id: "aneis", nome: "Anéis", icon: "💍", ordem: 6 },
  { id: "escapularios", nome: "Escapulários", icon: "♱", ordem: 7 },
  { id: "aliancas", nome: "Alianças", icon: "⃝", ordem: 8 }
];

const TEMAS_PREDEFINIDOS = [
  { id: "ouro_classico", nome: "Ouro Clássico", cor: "#9B6A2F", sub: "#fff8ef" },
  { id: "champagne", nome: "Champagne", cor: "#B58B4A", sub: "#FFF7E8" },
  { id: "preto_ouro", nome: "Preto e Ouro", cor: "#5A3B16", sub: "#FBF3E3" },
  { id: "rose_gold", nome: "Rose Gold", cor: "#B76E79", sub: "#FFF1F3" },
  { id: "esmeralda", nome: "Esmeralda", cor: "#0F6B58", sub: "#ECF8F4" },
  { id: "safira", nome: "Safira", cor: "#1C3F75", sub: "#EEF4FF" }
];

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

let db = carregarBanco();
let adminLogado = null;
let estado = { categoria: "todos", status: "todos", busca: "" };
let fotoJoiaTemp = "";
let logoLojaTemp = "";
let contextoNovoCliente = "";
let isSyncingFundo = false;
let syncTimer = null;
let syncPendente = false;

function qs(id) { return document.getElementById(id); }
function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }
function escapeHTML(valor) { return String(valor ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch])); }
function getHojeSTR() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function getMesAtualSTR() { return getHojeSTR().slice(0, 7); }
function formatDataBR(v) { if(!v) return ""; const p = String(v).split("-"); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : v; }
function formatDateTime(ts) { if(!ts) return ""; return new Date(Number(ts)).toLocaleString("pt-BR"); }
function gerarIdLocal(prefixo = "id") { if(window.crypto && crypto.randomUUID) return `${prefixo}_${crypto.randomUUID()}`; return `${prefixo}_${Date.now()}_${Math.random().toString(36).slice(2)}`; }
function getClientIdLocal() { let id = localStorage.getItem(CLIENT_KEY); if(!id) { id = gerarIdLocal("client"); localStorage.setItem(CLIENT_KEY, id); } return id; }
function normalizarTextoId(valor) { return String(valor || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "item"; }
function parseMoeda(str) { if(!str) return 0; let v = String(str).replace(/\s/g, "").replace(/R\$/gi, ""); if(v.includes(",") && v.includes(".")) v = v.replace(/\./g, "").replace(",", "."); else if(v.includes(",")) v = v.replace(",", "."); else if(v.includes(".")) { const partes = v.split("."); if(partes.length > 2 || partes[partes.length-1].length === 3) v = v.replace(/\./g, ""); } const n = parseFloat(v.replace(/[^\d.-]/g, "")); return isNaN(n) ? 0 : n; }
function formatMoeda(valor) { return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function formatMoedaSem(valor) { return Number(valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function parseDecimal(str) { if(!str) return 0; const n = parseFloat(String(str).replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "")); return isNaN(n) ? 0 : n; }
function formatDecimal(valor, casas = 2) { return Number(valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas }); }
function maskMoeda(el) { let v = el.value.replace(/\D/g, ""); if(!v) { el.value = ""; return; } el.value = (parseFloat(v) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }); }
function maskDecimal(el, casas = 3) { let v = el.value.replace(/[^\d,\.]/g, "").replace(".", ","); const partes = v.split(","); if(partes.length > 2) v = partes[0] + "," + partes.slice(1).join(""); if(partes[1] && partes[1].length > casas) v = partes[0] + "," + partes[1].slice(0, casas); el.value = v; }
function maskTelefone(el) { let v = el.value.replace(/\D/g, ""); if(v.length > 11) v = v.slice(0, 11); v = v.replace(/^(\d{2})(\d)/, "($1) $2"); v = v.replace(/(\d{5})(\d{4})$/, "$1-$2"); el.value = v; }
function abrirModal(id) { const el = qs(id); if(el) { el.style.display = "flex"; const modal = el.querySelector(".modal"); if(modal) modal.scrollTop = 0; } }
function fecharModal(id) { const el = qs(id); if(el) el.style.display = "none"; }
function setLoading(ativo, texto = "Processando...") { qs("loadingText").innerText = texto; qs("loadingOverlay").style.display = ativo ? "flex" : "none"; }
function getCategoria(id) { return (db.categorias || []).find(c => c.id === id) || { id, nome: id || "Sem categoria", icon: "◆" }; }
function getCliente(id) { return (db.clientes || []).find(c => c.id === id) || null; }
function getJoia(id) { return (db.joias || []).find(j => j.id === id) || null; }
function getUsuarioAuditoria() { return adminLogado && adminLogado.nome ? adminLogado.nome : "Sistema"; }

function criarBancoBase() {
  return {
    app_id: "joiaspro",
    loja: { nome: "JoiasPro", logo: "", telefone: "", cidade: "", uf: "PB" },
    categorias: CATEGORIAS_PADRAO.map(c => ({ ...c })),
    joias: [],
    clientes: [],
    vendas: [],
    administradores: [],
    auditoria: [],
    configGerais: { temaId: "ouro_classico", corTema: "#9B6A2F", corSubHeader: "#fff8ef" },
    configs: { url: "", dadosBaixados: false, somenteLocal: false, ultimaMudancaLocal: 0, ultimaSincronizacao: 0, syncRevision: 0, senhaAdmin: "1999", clientId: getClientIdLocal() },
    _deleted: { joias: {}, clientes: {}, vendas: {}, categorias: {}, administradores: {} }
  };
}

function carregarBanco() {
  const base = criarBancoBase();
  try {
    const salvo = localStorage.getItem(STORAGE_KEY);
    if(salvo) return normalizarBanco(JSON.parse(salvo), base);
  } catch(e) { console.warn("Banco local inválido", e); }
  return base;
}

function normalizarBanco(dados, base = criarBancoBase()) {
  if(!dados || dados.app_id !== "joiaspro") return base;
  dados.loja = { ...base.loja, ...(dados.loja || {}) };
  dados.categorias = Array.isArray(dados.categorias) && dados.categorias.length ? dados.categorias : base.categorias;
  dados.joias = Array.isArray(dados.joias) ? dados.joias : [];
  dados.clientes = Array.isArray(dados.clientes) ? dados.clientes : [];
  dados.vendas = Array.isArray(dados.vendas) ? dados.vendas : [];
  dados.administradores = Array.isArray(dados.administradores) ? dados.administradores : [];
  dados.auditoria = filtrarAuditoriaRecente(Array.isArray(dados.auditoria) ? dados.auditoria : []);
  dados.configGerais = { ...base.configGerais, ...(dados.configGerais || {}) };
  dados.configs = { ...base.configs, ...(dados.configs || {}) };
  dados.configs.clientId = dados.configs.clientId || getClientIdLocal();
  dados._deleted = { ...base._deleted, ...(dados._deleted || {}) };
  ["joias","clientes","vendas","categorias","administradores"].forEach(k => dados._deleted[k] = dados._deleted[k] || {});

  dados.categorias = dados.categorias.map((c, idx) => ({ id: c.id || normalizarTextoId(c.nome), nome: c.nome || "Categoria", icon: c.icon || "◆", ordem: Number(c.ordem || idx + 1), updatedAt: Number(c.updatedAt || 0), ...c }));
  CATEGORIAS_PADRAO.forEach(cat => {
    const existente = dados.categorias.find(c => c.id === cat.id);
    if(!existente) dados.categorias.push({ ...cat });
    else { existente.icon = cat.icon; existente.nome = existente.nome || cat.nome; existente.ordem = cat.ordem; }
  });
  dados.categorias.sort((a,b) => Number(a.ordem || 999) - Number(b.ordem || 999) || String(a.nome).localeCompare(String(b.nome)));

  dados.joias.forEach((j, idx) => {
    if(!j.id) j.id = `joia_${normalizarTextoId(j.referencia || j.descricao)}_${idx}`;
    j.referencia = String(j.referencia || "").trim();
    j.categoria = j.categoria || "aneis";
    j.descricao = j.descricao || "";
    j.pesoOuro = Number(j.pesoOuro || 0);
    j.precoCompra = Number(j.precoCompra || 0);
    j.precoVenda = Number(j.precoVenda || 0);
    j.status = ["disponível","reservado","vendido"].includes(j.status) ? j.status : "disponível";
    j.foto = j.foto || "";
    j.updatedAt = Number(j.updatedAt || 0);
  });

  dados.clientes.forEach((c, idx) => {
    if(!c.id) c.id = `cli_${normalizarTextoId(c.nomeCompleto || c.nome)}_${idx}`;
    c.nomeCompleto = c.nomeCompleto || c.nome || "";
    c.telefone = c.telefone || "";
    c.cidade = c.cidade || "";
    c.uf = c.uf || "PB";
    c.enderecoEntrega = c.enderecoEntrega || "";
    c.updatedAt = Number(c.updatedAt || 0);
  });

  dados.vendas.forEach((v, idx) => {
    if(!v.id) v.id = `venda_${normalizarTextoId(v.joiaId)}_${idx}`;
    v.data = v.data || getHojeSTR();
    v.valorVenda = Number(v.valorVenda || 0);
    v.updatedAt = Number(v.updatedAt || 0);
  });

  dados.administradores.forEach((a, idx) => {
    if(!a.id) a.id = `adm_${normalizarTextoId(a.nome)}_${idx}`;
    a.nome = a.nome || "Usuário";
    a.senha = String(a.senha || "");
    a.isAdmin = a.isAdmin !== false;
    a.forcarTrocaSenha = !!a.forcarTrocaSenha;
    a.updatedAt = Number(a.updatedAt || 0);
  });
  return dados;
}

function salvarBanco(opcoes = {}) {
  db.configs = { ...criarBancoBase().configs, ...(db.configs || {}) };
  db.configs.clientId = db.configs.clientId || getClientIdLocal();
  if(opcoes.marcarLocal !== false) db.configs.ultimaMudancaLocal = Date.now();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); }
  catch(e) { alert("Não foi possível salvar. As fotos podem estar grandes demais para o armazenamento local deste navegador."); throw e; }
  if(opcoes.sincronizar !== false) agendarSincronizacao();
}

function marcarRegistroPendente(registro) {
  if(!registro) return registro;
  const agora = Date.now();
  registro.updatedAt = agora;
  registro._clientDirty = true;
  registro._clientChangedAt = agora;
  registro._clientId = getClientIdLocal();
  registro._clientUser = getUsuarioAuditoria();
  return registro;
}

function tocarRegistro(registro) { return marcarRegistroPendente(registro); }

function registrarExclusao(tipo, id) {
  if(!id) return;
  db._deleted = db._deleted || criarBancoBase()._deleted;
  db._deleted[tipo] = db._deleted[tipo] || {};
  const agora = Date.now();
  db._deleted[tipo][id] = { id, tipo, deletedAt: agora, _clientDirty: true, _clientChangedAt: agora, _clientId: getClientIdLocal(), usuario: getUsuarioAuditoria() };
}

function filtrarAuditoriaRecente(lista, agora = Date.now()) {
  const limite = agora - AUDITORIA_RETENCAO_DIAS * 24 * 60 * 60 * 1000;
  return (Array.isArray(lista) ? lista : [])
    .filter(item => item && (item._clientDirty || !item.createdAt || Number(item.createdAt) >= limite))
    .sort((a,b) => Number(b.createdAt || b._clientChangedAt || 0) - Number(a.createdAt || a._clientChangedAt || 0))
    .slice(0, 500);
}

function registrarAuditoria(acao, detalhes = "") {
  db.auditoria = Array.isArray(db.auditoria) ? db.auditoria : [];
  const agora = Date.now();
  db.auditoria.push({ id: gerarIdLocal("audit"), acao, detalhes, usuario: getUsuarioAuditoria(), createdAt: agora, _clientDirty: true, _clientChangedAt: agora, _clientId: getClientIdLocal() });
  db.auditoria = filtrarAuditoriaRecente(db.auditoria, agora);
}

function getPerfisAdminDisponiveis() {
  const perfis = (db.administradores || []).filter(a => a.nome && a.senha).map(a => ({ id: a.id, nome: a.nome, senha: String(a.senha), isAdmin: a.isAdmin !== false, forcarTrocaSenha: !!a.forcarTrocaSenha }));
  if(perfis.length === 0) perfis.push({ id: "admin_padrao", nome: "Administrador", senha: String(db.configs.senhaAdmin || "1999"), isAdmin: true, forcarTrocaSenha: false });
  return perfis;
}

function renderOpcoesLoginAdmin(selectedId = "") {
  const select = qs("loginAdminUsuario");
  const perfis = getPerfisAdminDisponiveis();
  select.innerHTML = perfis.map(p => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.nome)}</option>`).join("");
  if(selectedId && perfis.some(p => p.id === selectedId)) select.value = selectedId;
}

function exibirErroLogin(id, texto) { const el = qs(id); if(el) { el.innerText = texto; el.style.display = "block"; } }
function limparErroLogin(id) { const el = qs(id); if(el) { el.innerText = ""; el.style.display = "none"; } }

function iniciarFluxoAcesso() {
  if(!db.configs.url && !db.configs.somenteLocal) { abrirSetupUrl(); return; }
  abrirLoginAdmin(false);
}

function abrirSetupUrl() {
  qs("setupAppVersion").innerText = APP_VERSION;
  qs("setupUrlApp").value = db.configs.url || "";
  limparErroLogin("setupUrlErro");
  abrirModal("modalSetupUrl");
  setTimeout(() => qs("setupUrlApp").focus(), 80);
}

function usarSomenteLocal() {
  db.configs.somenteLocal = true;
  salvarBanco({ sincronizar: false });
  fecharModal("modalSetupUrl");
  abrirLoginAdmin(false);
}

function abrirLoginAdmin(ehTroca = false) {
  renderOpcoesLoginAdmin(adminLogado ? adminLogado.id : "");
  qs("loginAdminSenha").value = "";
  qs("loginAppVersion").innerText = APP_VERSION;
  limparErroLogin("loginAdminErro");
  qs("loginAdminTexto").innerText = ehTroca ? "Escolha o perfil e informe a senha." : "Escolha o usuário e informe a senha.";
  qs("btnCancelarLoginAdmin").style.display = (ehTroca && adminLogado) ? "block" : "none";
  abrirModal("modalLoginAdmin");
  setTimeout(() => qs("loginAdminSenha").focus(), 80);
}

function entrarAdmin() {
  const usuarioId = qs("loginAdminUsuario").value;
  const senha = qs("loginAdminSenha").value.trim();
  const perfil = getPerfisAdminDisponiveis().find(a => a.id === usuarioId);
  if(!perfil) { exibirErroLogin("loginAdminErro", "Selecione um usuário válido."); return; }
  if(!senha || senha !== perfil.senha) { exibirErroLogin("loginAdminErro", "Senha incorreta."); qs("loginAdminSenha").select(); return; }
  adminLogado = { id: perfil.id, nome: perfil.nome, isAdmin: perfil.isAdmin !== false, forcarTrocaSenha: !!perfil.forcarTrocaSenha };
  fecharModal("modalLoginAdmin");
  atualizarPerfilAdminUI();
  registrarAuditoria("Login", `Perfil ${perfil.nome} acessou o aplicativo.`);
  salvarBanco({ sincronizar: false });
  renderTudo();
  if(perfil.forcarTrocaSenha) abrirTrocaSenhaPerfil(true);
}

function atualizarPerfilAdminUI() {
  const nome = adminLogado ? adminLogado.nome : "Entrar";
  qs("perfilAdminNome").innerText = nome.length > 12 ? nome.slice(0,11) + "…" : nome;
  qs("perfilAtualNome").innerText = nome;
}

function abrirMenuPerfil() { if(!adminLogado) abrirLoginAdmin(false); else abrirModal("modalPerfilAdmin"); }
function trocarPerfilAdmin() { fecharModal("modalPerfilAdmin"); abrirLoginAdmin(true); }
function cancelarTrocaPerfil() { if(adminLogado) fecharModal("modalLoginAdmin"); else abrirLoginAdmin(false); }
function sairPerfilAdmin() { adminLogado = null; atualizarPerfilAdminUI(); fecharModal("modalPerfilAdmin"); abrirLoginAdmin(false); }

function abrirTrocaSenhaPerfil(obrigatoria = false) {
  if(!adminLogado) return abrirLoginAdmin(false);
  qs("trocaSenhaObrigatoria").value = obrigatoria ? "true" : "false";
  qs("tituloTrocaSenha").innerText = obrigatoria ? "Troca de senha obrigatória" : "Trocar senha";
  qs("textoTrocaSenha").innerText = obrigatoria ? "Para continuar, escolha uma nova senha numérica." : "Informe a senha atual e escolha uma nova senha numérica.";
  qs("btnFecharTrocaSenha").style.display = obrigatoria ? "none" : "inline-flex";
  qs("btnCancelarTrocaSenha").style.display = obrigatoria ? "none" : "inline-flex";
  qs("trocaSenhaAtual").value = "";
  qs("trocaSenhaNova").value = "";
  qs("trocaSenhaNova2").value = "";
  limparErroLogin("trocaSenhaErro");
  abrirModal("modalTrocaSenha");
}

function salvarTrocaSenhaPerfil() {
  if(!adminLogado) return;
  const atual = qs("trocaSenhaAtual").value.trim();
  const nova = qs("trocaSenhaNova").value.trim();
  const nova2 = qs("trocaSenhaNova2").value.trim();
  const obrigatoria = qs("trocaSenhaObrigatoria").value === "true";
  const perfil = getPerfisAdminDisponiveis().find(p => p.id === adminLogado.id);
  if(!perfil) return;
  if(!obrigatoria && atual !== perfil.senha) return exibirErroLogin("trocaSenhaErro", "Senha atual incorreta.");
  if(!nova || nova.length < 4) return exibirErroLogin("trocaSenhaErro", "Use uma senha com pelo menos 4 números.");
  if(nova !== nova2) return exibirErroLogin("trocaSenhaErro", "A confirmação não confere.");

  let registro = db.administradores.find(a => a.id === adminLogado.id);
  if(!registro && adminLogado.id === "admin_padrao") {
    registro = { id: gerarIdLocal("adm"), nome: "Administrador", senha: nova, isAdmin: true, forcarTrocaSenha: false };
    db.administradores.push(registro);
    adminLogado.id = registro.id;
  }
  if(registro) {
    registro.senha = nova;
    registro.forcarTrocaSenha = false;
    tocarRegistro(registro);
  } else {
    db.configs.senhaAdmin = nova;
  }
  registrarAuditoria("Senha alterada", `Senha do perfil ${adminLogado.nome} foi alterada.`);
  salvarBanco();
  fecharModal("modalTrocaSenha");
  alert("Senha alterada.");
}

function aplicarTema() {
  const cor = db.configGerais?.corTema || "#9B6A2F";
  const sub = db.configGerais?.corSubHeader || "#fff8ef";
  document.documentElement.style.setProperty("--theme-base", cor);
  document.documentElement.style.setProperty("--theme-dark", shadeColor(cor, -42));
  document.documentElement.style.setProperty("--theme-soft", hexToRgba(cor, .12));
  document.documentElement.style.setProperty("--theme-sub", sub);
  const meta = qs("metaThemeColor");
  if(meta) meta.setAttribute("content", cor);
}

function shadeColor(color, percent) {
  let R = parseInt(color.substring(1,3),16), G = parseInt(color.substring(3,5),16), B = parseInt(color.substring(5,7),16);
  R = parseInt(String(R * (100 + percent) / 100)); G = parseInt(String(G * (100 + percent) / 100)); B = parseInt(String(B * (100 + percent) / 100));
  R = Math.max(0, Math.min(255, R)); G = Math.max(0, Math.min(255, G)); B = Math.max(0, Math.min(255, B));
  const RR = R.toString(16).padStart(2,"0"), GG = G.toString(16).padStart(2,"0"), BB = B.toString(16).padStart(2,"0");
  return `#${RR}${GG}${BB}`;
}
function hexToRgba(hex, alpha) { const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16); return `rgba(${r}, ${g}, ${b}, ${alpha})`; }

function renderCabecalho() {
  const nome = db.loja?.nome || "JoiasPro";
  qs("headerNomeLoja").innerText = nome;
  qs("headerSubtitulo").innerText = [db.loja?.cidade, db.loja?.uf].filter(Boolean).join(" - ") || "Controle de joias";
  qs("splashNome").innerText = nome;
  const mark = qs("brandMark");
  if(db.loja?.logo) mark.innerHTML = `<img src="${db.loja.logo}" alt="Logo">`; else mark.innerText = "◆";
  if(db.loja?.logo) { qs("splashLogoObj").src = db.loja.logo; qs("splashLogoObj").style.display = "block"; qs("splashLogoFallback").style.display = "none"; }
}

function calcularResumo(mesRef = getMesAtualSTR()) {
  const joias = db.joias || [];
  const estoque = joias.filter(j => j.status !== "vendido");
  const disponiveis = joias.filter(j => j.status === "disponível");
  const reservadas = joias.filter(j => j.status === "reservado");
  const vendidas = joias.filter(j => j.status === "vendido");
  const custoEstoque = estoque.reduce((s,j) => s + Number(j.precoCompra || 0), 0);
  const vendaEstoque = estoque.reduce((s,j) => s + Number(j.precoVenda || 0), 0);
  const pesoEstoque = estoque.reduce((s,j) => s + Number(j.pesoOuro || 0), 0);
  const vendas = db.vendas || [];
  const receitaVendida = vendas.reduce((s,v) => s + Number(v.valorVenda || 0), 0);
  const vendasMes = vendas.filter(v => String(v.data || "").slice(0,7) === mesRef);
  const receitaMes = vendasMes.reduce((s,v) => s + Number(v.valorVenda || 0), 0);
  const custoVendidoMes = vendasMes.reduce((s,v) => { const j = getJoia(v.joiaId); return s + Number(j?.precoCompra || 0); }, 0);
  const pesoVendidoMes = vendasMes.reduce((s,v) => { const j = getJoia(v.joiaId); return s + Number(j?.pesoOuro || 0); }, 0);
  const ticketMedioMes = vendasMes.length ? receitaMes / vendasMes.length : 0;
  const margemRealMes = receitaMes - custoVendidoMes;
  const mesAnterior = deslocarMes(mesRef, -1);
  const vendasMesAnterior = vendas.filter(v => String(v.data || "").slice(0,7) === mesAnterior);
  const receitaMesAnterior = vendasMesAnterior.reduce((s,v) => s + Number(v.valorVenda || 0), 0);
  const variacaoMes = receitaMesAnterior ? ((receitaMes - receitaMesAnterior) / receitaMesAnterior) * 100 : (receitaMes ? 100 : 0);
  return { total: joias.length, estoque: estoque.length, disponiveis: disponiveis.length, reservadas: reservadas.length, vendidas: vendidas.length, custoEstoque, vendaEstoque, margemPotencial: vendaEstoque - custoEstoque, pesoEstoque, receitaVendida, vendasMesQtd: vendasMes.length, vendasMes, receitaMes, custoVendidoMes, pesoVendidoMes, ticketMedioMes, margemRealMes, mesRef, mesAnterior, receitaMesAnterior, variacaoMes };
}

function renderResumoTopo() {
  const r = calcularResumo();
  qs("topSummary").innerHTML = `
    <div class="summary-card"><small>Em estoque</small><strong>${r.estoque}</strong><em>${formatDecimal(r.pesoEstoque,3)} g ouro</em></div>
    <div class="summary-card"><small>Venda estoque</small><strong>${formatMoeda(r.vendaEstoque)}</strong><em>${r.disponiveis} disponíveis</em></div>
    <div class="summary-card"><small>Custo estoque</small><strong>${formatMoeda(r.custoEstoque)}</strong><em>margem ${formatMoeda(r.margemPotencial)}</em></div>
    <div class="summary-card"><small>Vendidas</small><strong>${r.vendidas}</strong><em>${formatMoeda(r.receitaVendida)}</em></div>
  `;
}

function renderCategorias() {
  qs("homeCategorias").innerHTML = (db.categorias || []).map(cat => `
    <button class="cat-card cat-${escapeHTML(cat.id)} ${estado.categoria === cat.id ? "active" : ""}" onclick="setCategoria('${escapeHTML(cat.id)}')">
      <span class="cat-icon">${escapeHTML(cat.icon || "◆")}</span>
      <span class="cat-name">${escapeHTML(cat.nome)}</span>
    </button>`).join("");
  const bar = qs("activeFilterBar");
  if(estado.categoria !== "todos") {
    const cat = getCategoria(estado.categoria);
    bar.style.display = "block";
    bar.innerHTML = `Categoria: ${escapeHTML(cat.nome)} <button onclick="setCategoria('todos')">limpar</button>`;
  } else {
    bar.style.display = "none";
  }
}

function setCategoria(catId) { estado.categoria = (estado.categoria === catId) ? "todos" : catId; renderTudo(false); }
function voltarInicio() { estado.categoria = "todos"; estado.status = "todos"; estado.busca = ""; qs("inputBusca").value = ""; renderTudo(false); }
function setFiltroStatus(status) { estado.status = status; renderChips(); renderLista(); }
function setBusca(v) { estado.busca = String(v || "").trim().toLowerCase(); renderLista(); }
function renderChips() { ["Todos","Disponivel","Reservado","Vendido"].forEach(nome => { const el = qs("chip" + nome); if(el) el.classList.remove("active"); }); const map = { todos:"chipTodos", "disponível":"chipDisponivel", reservado:"chipReservado", vendido:"chipVendido" }; const el = qs(map[estado.status]); if(el) el.classList.add("active"); }

function getJoiasFiltradas() {
  let lista = [...(db.joias || [])];
  if(estado.categoria !== "todos") lista = lista.filter(j => j.categoria === estado.categoria);
  if(estado.status !== "todos") lista = lista.filter(j => j.status === estado.status);
  if(estado.busca) {
    const q = estado.busca;
    lista = lista.filter(j => {
      const cat = getCategoria(j.categoria).nome;
      const cliente = getCliente(j.clienteId);
      return [j.referencia, j.descricao, cat, j.obs, cliente?.nomeCompleto].join(" ").toLowerCase().includes(q);
    });
  }
  return lista.sort((a,b) => {
    const ordemStatus = { "disponível": 1, "reservado": 2, "vendido": 3 };
    return ordemStatus[a.status] - ordemStatus[b.status] || String(getCategoria(a.categoria).nome).localeCompare(getCategoria(b.categoria).nome) || String(a.referencia).localeCompare(String(b.referencia));
  });
}

function renderLista() {
  const lista = getJoiasFiltradas();
  qs("emptyState").style.display = lista.length ? "none" : "flex";
  qs("listaJoias").innerHTML = lista.map(j => {
    const cat = getCategoria(j.categoria);
    const cliente = getCliente(j.clienteId);
    const titulo = j.descricao || cat.nome;
    return `
      <article class="product-card" onclick="abrirDetalheJoia('${escapeHTML(j.id)}')">
        <div class="product-photo">${j.foto ? `<img src="${j.foto}" alt="${escapeHTML(j.referencia)}">` : `<span>${escapeHTML(cat.icon || "◆")}</span>`}</div>
        <div class="product-info">
          <div class="product-top">
            <div class="product-title">${escapeHTML(titulo)}</div>
            <span class="status-badge status-${escapeHTML(j.status)}">${escapeHTML(j.status)}</span>
          </div>
          <div class="product-meta">Ref. ${escapeHTML(j.referencia || "-")} · ${escapeHTML(cat.nome)}<br>${formatDecimal(j.pesoOuro,3)} g de ouro${cliente ? ` · ${escapeHTML(cliente.nomeCompleto)}` : ""}</div>
          <div class="product-price"><strong>${formatMoeda(j.precoVenda)}</strong><small>${formatDecimal(j.pesoOuro,3)} g</small></div>
        </div>
      </article>`;
  }).join("");
}

function renderTudo(scrollTop = false) {
  aplicarTema();
  renderCabecalho();
  renderCategorias();
  renderChips();
  renderLista();
  if(scrollTop) qs("mainScrollArea").scrollTop = 0;
}

function preencherSelectCategorias() {
  qs("joiaCategoria").innerHTML = (db.categorias || []).map(c => `<option value="${escapeHTML(c.id)}">${escapeHTML(c.nome)}</option>`).join("");
}
function preencherUFSelect(id, valor = "PB") { qs(id).innerHTML = UFS.map(uf => `<option value="${uf}">${uf}</option>`).join(""); qs(id).value = valor || "PB"; }
function preencherSelectClientes(selectId, valor = "", incluirVazio = true) {
  const clientes = [...(db.clientes || [])].sort((a,b) => String(a.nomeCompleto).localeCompare(String(b.nomeCompleto)));
  qs(selectId).innerHTML = `${incluirVazio ? '<option value="">Sem cliente</option>' : '<option value="">Selecione...</option>'}` + clientes.map(c => `<option value="${escapeHTML(c.id)}">${escapeHTML(c.nomeCompleto)}${c.cidade ? ` - ${escapeHTML(c.cidade)}` : ""}</option>`).join("");
  qs(selectId).value = valor || "";
}

function abrirFormularioJoia(id = "") {
  preencherSelectCategorias();
  preencherSelectClientes("joiaCliente", "", true);
  fotoJoiaTemp = "";
  qs("joiaId").value = id || "";
  qs("inputFotoJoia").value = "";
  if(id) {
    const j = getJoia(id); if(!j) return;
    qs("tituloJoiaForm").innerText = "Editar joia";
    qs("joiaReferencia").value = j.referencia || "";
    qs("joiaCategoria").value = j.categoria || "aneis";
    qs("joiaDescricao").value = j.descricao || "";
    qs("joiaPeso").value = j.pesoOuro ? formatDecimal(j.pesoOuro,3) : "";
    qs("joiaCompra").value = j.precoCompra ? formatMoedaSem(j.precoCompra) : "";
    qs("joiaVenda").value = j.precoVenda ? formatMoedaSem(j.precoVenda) : "";
    qs("joiaStatus").value = j.status || "disponível";
    preencherSelectClientes("joiaCliente", j.clienteId || "", true);
    qs("joiaObs").value = j.obs || "";
    fotoJoiaTemp = j.foto || "";
  } else {
    qs("tituloJoiaForm").innerText = "Cadastrar joia";
    qs("joiaReferencia").value = "";
    qs("joiaCategoria").value = estado.categoria !== "todos" ? estado.categoria : "aneis";
    qs("joiaDescricao").value = "";
    qs("joiaPeso").value = "";
    qs("joiaCompra").value = "";
    qs("joiaVenda").value = "";
    qs("joiaStatus").value = "disponível";
    qs("joiaCliente").value = "";
    qs("joiaObs").value = "";
  }
  atualizarPreviewFotoJoia();
  abrirModal("modalJoiaForm");
}

function atualizarPreviewFotoJoia() {
  qs("previewFotoJoia").innerHTML = fotoJoiaTemp ? `<img src="${fotoJoiaTemp}" alt="Foto da joia">` : `<span>📷</span>`;
}

async function selecionarFotoJoia(event) {
  const file = event.target.files && event.target.files[0];
  if(!file) return;
  try {
    setLoading(true, "Comprimindo foto...");
    fotoJoiaTemp = await comprimirImagem(file, 1200, .82);
    atualizarPreviewFotoJoia();
  } catch(e) { alert("Não foi possível carregar a foto."); }
  finally { setLoading(false); }
}
function removerFotoJoia() { fotoJoiaTemp = ""; qs("inputFotoJoia").value = ""; atualizarPreviewFotoJoia(); }

function comprimirImagem(file, maxDim = 1200, qualidade = .82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        const scale = Math.min(1, maxDim / Math.max(w, h));
        w = Math.round(w * scale); h = Math.round(h * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", qualidade));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function salvarJoiaForm() {
  const id = qs("joiaId").value;
  const referencia = qs("joiaReferencia").value.trim();
  const categoria = qs("joiaCategoria").value;
  if(!referencia) return alert("Informe a referência da joia.");
  if(!categoria) return alert("Selecione a categoria.");
  const status = qs("joiaStatus").value;
  const clienteId = qs("joiaCliente").value;
  if((status === "vendido" || status === "reservado") && !clienteId) {
    if(!confirm("A joia está sem cliente vinculado. Deseja salvar mesmo assim?")) return;
  }
  let joia = id ? getJoia(id) : null;
  const nova = !joia;
  if(!joia) { joia = { id: gerarIdLocal("joia"), dataCadastro: getHojeSTR() }; db.joias.push(joia); }
  Object.assign(joia, {
    referencia,
    categoria,
    descricao: qs("joiaDescricao").value.trim(),
    pesoOuro: parseDecimal(qs("joiaPeso").value),
    precoCompra: parseMoeda(qs("joiaCompra").value),
    precoVenda: parseMoeda(qs("joiaVenda").value),
    status,
    clienteId,
    obs: qs("joiaObs").value.trim(),
    foto: fotoJoiaTemp || ""
  });
  if(status === "vendido" && !joia.dataVenda) joia.dataVenda = getHojeSTR();
  if(status !== "vendido") joia.dataVenda = "";
  tocarRegistro(joia);
  registrarAuditoria(nova ? "Joia cadastrada" : "Joia alterada", `Ref. ${referencia}`);
  salvarBanco();
  fecharModal("modalJoiaForm");
  renderTudo();
}

function abrirDetalheJoia(id) {
  const j = getJoia(id); if(!j) return;
  const cat = getCategoria(j.categoria);
  const cli = getCliente(j.clienteId);
  const lucro = Number(j.precoVenda || 0) - Number(j.precoCompra || 0);
  const vendas = (db.vendas || []).filter(v => v.joiaId === j.id).sort((a,b) => String(b.data).localeCompare(String(a.data)));
  qs("detalheJoiaConteudo").innerHTML = `
    <div class="detail-header">
      <div class="detail-photo" onclick="abrirFotoGrande('${escapeHTML(j.id)}')">${j.foto ? `<img src="${j.foto}" alt="${escapeHTML(j.referencia)}">` : `<span>${escapeHTML(cat.icon || "◆")}</span>`}</div>
      <div class="detail-info">
        <h2>${escapeHTML(j.descricao || cat.nome)}</h2>
        <div class="detail-ref">Ref. ${escapeHTML(j.referencia)} · ${escapeHTML(cat.nome)}</div>
        <p><span class="status-badge status-${escapeHTML(j.status)}">${escapeHTML(j.status)}</span></p>
        <p>${escapeHTML(j.obs || "")}</p>
        ${cli ? `<div class="sale-card"><strong>Cliente vinculado</strong><small>${escapeHTML(cli.nomeCompleto)} · ${escapeHTML(cli.telefone || "sem telefone")}</small><small>${escapeHTML([cli.cidade, cli.uf].filter(Boolean).join(" - "))}</small></div>` : ""}
      </div>
    </div>
    <div class="detail-grid">
      <div class="detail-box"><small>Peso ouro</small><strong>${formatDecimal(j.pesoOuro,3)} g</strong></div>
      <div class="detail-box"><small>Compra</small><strong>${formatMoeda(j.precoCompra)}</strong></div>
      <div class="detail-box"><small>Venda</small><strong>${formatMoeda(j.precoVenda)}</strong></div>
      <div class="detail-box"><small>Margem</small><strong>${formatMoeda(lucro)}</strong></div>
      <div class="detail-box"><small>Cadastro</small><strong>${formatDataBR(j.dataCadastro)}</strong></div>
      <div class="detail-box"><small>Atualizado</small><strong>${formatDateTime(j.updatedAt)}</strong></div>
    </div>
    ${vendas.length ? `<div class="section-title">Histórico de venda</div>${vendas.map(v => `<div class="sale-card"><strong>${formatDataBR(v.data)} · ${formatMoeda(v.valorVenda)}</strong><small>${escapeHTML(getCliente(v.clienteId)?.nomeCompleto || "Cliente não localizado")} · ${escapeHTML(v.formaPagamento || "")}</small><p>${escapeHTML(v.obs || "")}</p></div>`).join("")}` : ""}
    <div class="detail-actions">
      <button class="btn-outline" onclick="fecharModal('modalJoiaDetalhe'); abrirFormularioJoia('${escapeHTML(j.id)}')">Editar</button>
      <button class="btn-outline" onclick="duplicarJoia('${escapeHTML(j.id)}')">Duplicar</button>
      <button class="btn-outline" onclick="abrirCompartilharJoia('${escapeHTML(j.id)}')">Enviar WhatsApp</button>
      ${j.status !== "vendido" ? `<button class="btn-action" onclick="abrirVenda('${escapeHTML(j.id)}')">Registrar venda</button>` : `<button class="btn-action" onclick="voltarJoiaEstoque('${escapeHTML(j.id)}')">Voltar ao estoque</button>`}
      ${j.status !== "reservado" && j.status !== "vendido" ? `<button class="btn-outline" onclick="abrirReserva('${escapeHTML(j.id)}')">Reservar</button>` : `<button class="btn-outline" onclick="liberarReserva('${escapeHTML(j.id)}')">Liberar reserva</button>`}
      <button class="btn-danger full-row" onclick="excluirJoia('${escapeHTML(j.id)}')">Excluir joia</button>
    </div>
  `;
  abrirModal("modalJoiaDetalhe");
}


function getNumeroWhatsappCliente(cliente) {
  return String(cliente?.telefone || "").replace(/\D/g, "").replace(/^0+/, "");
}
function normalizarTelefoneWhatsapp(valor) {
  let tel = String(valor || "").replace(/\D/g, "").replace(/^0+/, "");
  if(tel && tel.length <= 11 && !tel.startsWith("55")) tel = "55" + tel;
  return tel;
}
function getMensagemJoia(j) {
  const cat = getCategoria(j.categoria);
  const nomeLoja = db.loja?.nome || "JoiasPro";
  return `Olá! Segue a joia da ${nomeLoja}:\n\n${j.descricao || cat.nome}\nRef.: ${j.referencia || "-"}\nCategoria: ${cat.nome}\nPeso: ${formatDecimal(j.pesoOuro,3)} g de ouro\nPreço: ${formatMoeda(j.precoVenda)}\n\nTenho interesse?`;
}
function abrirCompartilharJoia(id) {
  const j = getJoia(id); if(!j) return;
  qs("shareJoiaId").value = id;
  preencherSelectClientes("shareCliente", j.clienteId || "", true);
  qs("shareTelefoneManual").value = getCliente(j.clienteId)?.telefone || "";
  qs("shareMensagem").value = getMensagemJoia(j);
  qs("sharePreview").innerHTML = `${j.foto ? `<img src="${j.foto}" alt="${escapeHTML(j.referencia)}">` : `<span>${escapeHTML(getCategoria(j.categoria).icon || "◆")}</span>`}<div><strong>${escapeHTML(j.descricao || getCategoria(j.categoria).nome)}</strong><small>Ref. ${escapeHTML(j.referencia || "-")} · ${formatMoeda(j.precoVenda)}</small></div>`;
  abrirModal("modalCompartilhar");
}
function atualizarTelefoneSharePorCliente() {
  const c = getCliente(qs("shareCliente").value);
  qs("shareTelefoneManual").value = c?.telefone || "";
}
function getDestinoWhatsappShare() {
  const j = getJoia(qs("shareJoiaId").value); if(!j) return null;
  const cliente = getCliente(qs("shareCliente").value);
  const tel = normalizarTelefoneWhatsapp(qs("shareTelefoneManual").value || cliente?.telefone || "");
  const texto = qs("shareMensagem").value || getMensagemJoia(j);
  const url = tel ? `https://wa.me/${tel}?text=${encodeURIComponent(texto)}` : `https://wa.me/?text=${encodeURIComponent(texto)}`;
  return { j, cliente, tel, texto, url };
}
async function copiarTextoCompartilhamento(texto) {
  try { if(navigator.clipboard) await navigator.clipboard.writeText(texto); } catch(e) {}
}
function abrirWhatsappTexto() {
  const alvo = getDestinoWhatsappShare(); if(!alvo) return;
  if(!alvo.tel && !confirm("Nenhum WhatsApp foi informado. Abrir o WhatsApp sem destinatário?")) return;
  window.open(alvo.url, "_blank");
}

async function gerarCartaoJoiaBlob(j) {
  const cat = getCategoria(j.categoria);
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = db.configGerais?.corSubHeader || "#fff8ef";
  ctx.fillRect(0,0,canvas.width,1350);
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, 70, 70, 940, 1210, 42, true, false);
  ctx.fillStyle = db.configGerais?.corTema || "#9B6A2F";
  ctx.font = "800 44px Segoe UI, Arial";
  ctx.fillText(db.loja?.nome || "JoiasPro", 110, 135);
  ctx.font = "700 34px Segoe UI, Arial";
  ctx.fillStyle = "#241A12";
  ctx.fillText(j.descricao || cat.nome, 110, 940, 860);
  ctx.font = "700 26px Segoe UI, Arial";
  ctx.fillStyle = "#746B60";
  ctx.fillText(`Ref. ${j.referencia || "-"} · ${cat.nome}`, 110, 995, 860);
  ctx.fillText(`Peso: ${formatDecimal(j.pesoOuro,3)} g de ouro`, 110, 1042, 860);
  ctx.font = "900 54px Segoe UI, Arial";
  ctx.fillStyle = db.configGerais?.corTema || "#9B6A2F";
  ctx.fillText(formatMoeda(j.precoVenda), 110, 1130, 860);
  ctx.font = "700 24px Segoe UI, Arial";
  ctx.fillStyle = "#746B60";
  ctx.fillText("Mensagem gerada pelo JoiasPro", 110, 1215, 860);
  if(j.foto) {
    await new Promise(resolve => {
      const img = new Image();
      img.onload = () => { drawImageCover(ctx, img, 110, 180, 860, 700, 30); resolve(); };
      img.onerror = resolve;
      img.src = j.foto;
    });
  } else {
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, 110, 180, 860, 700, 30, true, false);
    ctx.fillStyle = db.configGerais?.corTema || "#9B6A2F";
    ctx.font = "200 220px Segoe UI Symbol, Arial";
    ctx.textAlign = "center";
    ctx.fillText(cat.icon || "◆", 540, 570);
    ctx.textAlign = "left";
  }
  return await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", .92));
}
function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x+r, y); ctx.arcTo(x+w, y, x+w, y+h, r); ctx.arcTo(x+w, y+h, x, y+h, r); ctx.arcTo(x, y+h, x, y, r); ctx.arcTo(x, y, x+w, y, r); ctx.closePath();
  if(fill) ctx.fill(); if(stroke) ctx.stroke();
}
function drawImageCover(ctx, img, x, y, w, h, r = 0) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale, sh = h / scale;
  const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2;
  ctx.save();
  roundRect(ctx, x, y, w, h, r, false, false);
  ctx.clip();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, w, h);
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}
async function compartilharJoiaImagemWhatsapp() {
  const alvo = getDestinoWhatsappShare(); if(!alvo) return;
  if(!alvo.tel && !confirm("Nenhum WhatsApp foi informado. Gerar a imagem mesmo assim?")) return;
  setLoading(true, "Gerando imagem da joia...");
  try {
    const blob = await gerarCartaoJoiaBlob(alvo.j);
    const file = new File([blob], `${normalizarTextoId(alvo.j.referencia || "joia")}.jpg`, { type: "image/jpeg" });
    await copiarTextoCompartilhamento(alvo.texto);
    if(navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
      await navigator.share({ files: [file], text: alvo.texto, title: alvo.j.descricao || alvo.j.referencia || "Joia" });
      if(alvo.tel) setTimeout(() => window.open(alvo.url, "_blank"), 250);
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = file.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      alert("A imagem da joia foi gerada. Vou abrir a conversa do cliente selecionado com o texto pronto. Anexe a imagem baixada, se o WhatsApp não anexar automaticamente.");
      window.open(alvo.url, "_blank");
    }
  } finally { setLoading(false); }
}


function abrirFotoGrande(id) { const j = getJoia(id); if(j && j.foto) { qs("fotoGrande").src = j.foto; abrirModal("modalFoto"); } }

function duplicarJoia(id) {
  const j = getJoia(id); if(!j) return;
  const copia = { ...j, id: gerarIdLocal("joia"), referencia: `${j.referencia}-CÓPIA`, status: "disponível", clienteId: "", dataVenda: "", dataCadastro: getHojeSTR() };
  tocarRegistro(copia);
  db.joias.push(copia);
  registrarAuditoria("Joia duplicada", `Ref. ${j.referencia} copiada para ${copia.referencia}`);
  salvarBanco();
  fecharModal("modalJoiaDetalhe");
  renderTudo();
}

function excluirJoia(id) {
  const j = getJoia(id); if(!j) return;
  if(!confirm(`Excluir a joia ${j.referencia}?`)) return;
  registrarExclusao("joias", id);
  db.joias = db.joias.filter(x => x.id !== id);
  registrarAuditoria("Joia excluída", `Ref. ${j.referencia}`);
  salvarBanco();
  fecharModal("modalJoiaDetalhe");
  renderTudo();
}

function abrirClientes() { preencherUFSelect("clienteUF", "PB"); renderClientes(); abrirModal("modalClientes"); }
function renderClientes() {
  const q = (qs("buscaCliente")?.value || "").toLowerCase();
  let lista = [...(db.clientes || [])].sort((a,b) => String(a.nomeCompleto).localeCompare(String(b.nomeCompleto)));
  if(q) lista = lista.filter(c => [c.nomeCompleto, c.telefone, c.cidade, c.uf, c.enderecoEntrega].join(" ").toLowerCase().includes(q));
  qs("listaClientes").innerHTML = lista.length ? lista.map(c => `
    <div class="client-card">
      <div><strong>${escapeHTML(c.nomeCompleto)}</strong><small>${escapeHTML(c.telefone || "sem telefone")} · ${escapeHTML([c.cidade,c.uf].filter(Boolean).join(" - "))}</small><small>${escapeHTML(c.enderecoEntrega || "sem endereço")}</small></div>
      <div class="client-actions"><button onclick="abrirFormularioCliente('${escapeHTML(c.id)}')">Editar</button><button onclick="excluirCliente('${escapeHTML(c.id)}')">Excluir</button></div>
    </div>`).join("") : `<div class="empty-state" style="height:180px"><div>👥</div><strong>Nenhum cliente</strong></div>`;
}

function abrirFormularioCliente(id = "", contexto = "") {
  contextoNovoCliente = contexto || "";
  preencherUFSelect("clienteUF", "PB");
  qs("clienteId").value = id || "";
  if(id) {
    const c = getCliente(id); if(!c) return;
    qs("tituloClienteForm").innerText = "Editar cliente";
    qs("clienteNome").value = c.nomeCompleto || "";
    qs("clienteTelefone").value = c.telefone || "";
    qs("clienteCidade").value = c.cidade || "";
    preencherUFSelect("clienteUF", c.uf || "PB");
    qs("clienteEndereco").value = c.enderecoEntrega || "";
  } else {
    qs("tituloClienteForm").innerText = "Cadastrar cliente";
    qs("clienteNome").value = "";
    qs("clienteTelefone").value = "";
    qs("clienteCidade").value = db.loja?.cidade || "";
    preencherUFSelect("clienteUF", db.loja?.uf || "PB");
    qs("clienteEndereco").value = "";
  }
  abrirModal("modalClienteForm");
}

function salvarClienteForm() {
  const id = qs("clienteId").value;
  const nome = qs("clienteNome").value.trim();
  if(!nome) return alert("Informe o nome completo do cliente.");
  let c = id ? getCliente(id) : null;
  const novo = !c;
  if(!c) { c = { id: gerarIdLocal("cli"), dataCadastro: getHojeSTR() }; db.clientes.push(c); }
  Object.assign(c, { nomeCompleto: nome, telefone: qs("clienteTelefone").value.trim(), cidade: qs("clienteCidade").value.trim(), uf: qs("clienteUF").value, enderecoEntrega: qs("clienteEndereco").value.trim() });
  tocarRegistro(c);
  registrarAuditoria(novo ? "Cliente cadastrado" : "Cliente alterado", nome);
  salvarBanco();
  fecharModal("modalClienteForm");
  renderClientes();
  preencherSelectClientes("joiaCliente", qs("joiaCliente")?.value || "", true);
  preencherSelectClientes("vendaCliente", c.id, false);
  preencherSelectClientes("reservaCliente", c.id, true);
  if(contextoNovoCliente === "venda") qs("vendaCliente").value = c.id;
  if(contextoNovoCliente === "reserva") qs("reservaCliente").value = c.id;
  contextoNovoCliente = "";
}

function excluirCliente(id) {
  const c = getCliente(id); if(!c) return;
  const vinculado = (db.joias || []).some(j => j.clienteId === id) || (db.vendas || []).some(v => v.clienteId === id);
  if(vinculado && !confirm("Este cliente tem joias ou vendas vinculadas. Excluir mesmo assim?")) return;
  registrarExclusao("clientes", id);
  db.clientes = db.clientes.filter(x => x.id !== id);
  registrarAuditoria("Cliente excluído", c.nomeCompleto);
  salvarBanco();
  renderClientes();
  renderTudo();
}

function abrirVenda(joiaId) {
  const j = getJoia(joiaId); if(!j) return;
  qs("vendaJoiaId").value = joiaId;
  qs("vendaJoiaResumo").innerHTML = `${escapeHTML(j.referencia)} · ${escapeHTML(j.descricao || getCategoria(j.categoria).nome)}<br><small>${formatMoeda(j.precoVenda)}</small>`;
  preencherSelectClientes("vendaCliente", j.clienteId || "", false);
  qs("vendaData").value = getHojeSTR();
  qs("vendaValor").value = formatMoedaSem(j.precoVenda);
  qs("vendaForma").value = "";
  qs("vendaObs").value = "";
  abrirModal("modalVenda");
}

function salvarVenda() {
  const joia = getJoia(qs("vendaJoiaId").value); if(!joia) return;
  const clienteId = qs("vendaCliente").value;
  if(!clienteId) return alert("Selecione o cliente da venda.");
  const venda = { id: gerarIdLocal("venda"), joiaId: joia.id, clienteId, data: qs("vendaData").value || getHojeSTR(), valorVenda: parseMoeda(qs("vendaValor").value), formaPagamento: qs("vendaForma").value.trim(), obs: qs("vendaObs").value.trim() };
  tocarRegistro(venda);
  db.vendas.push(venda);
  joia.status = "vendido";
  joia.clienteId = clienteId;
  joia.dataVenda = venda.data;
  joia.valorVendaReal = venda.valorVenda;
  tocarRegistro(joia);
  registrarAuditoria("Venda registrada", `Ref. ${joia.referencia} · ${formatMoeda(venda.valorVenda)}`);
  salvarBanco();
  fecharModal("modalVenda");
  fecharModal("modalJoiaDetalhe");
  renderTudo();
}

function abrirReserva(joiaId) {
  const j = getJoia(joiaId); if(!j) return;
  qs("reservaJoiaId").value = joiaId;
  preencherSelectClientes("reservaCliente", j.clienteId || "", true);
  qs("reservaObs").value = j.reservaObs || "";
  abrirModal("modalReserva");
}

function salvarReserva() {
  const joia = getJoia(qs("reservaJoiaId").value); if(!joia) return;
  joia.status = "reservado";
  joia.clienteId = qs("reservaCliente").value;
  joia.reservaObs = qs("reservaObs").value.trim();
  tocarRegistro(joia);
  registrarAuditoria("Joia reservada", `Ref. ${joia.referencia}`);
  salvarBanco();
  fecharModal("modalReserva");
  fecharModal("modalJoiaDetalhe");
  renderTudo();
}

function liberarReserva(joiaId) {
  const j = getJoia(joiaId); if(!j) return;
  j.status = "disponível";
  j.clienteId = "";
  j.reservaObs = "";
  tocarRegistro(j);
  registrarAuditoria("Reserva liberada", `Ref. ${j.referencia}`);
  salvarBanco();
  fecharModal("modalJoiaDetalhe");
  renderTudo();
}

function voltarJoiaEstoque(joiaId) {
  const j = getJoia(joiaId); if(!j) return;
  if(!confirm("Voltar esta joia para o estoque? O histórico da venda será mantido.")) return;
  j.status = "disponível";
  j.clienteId = "";
  j.dataVenda = "";
  tocarRegistro(j);
  registrarAuditoria("Joia voltou ao estoque", `Ref. ${j.referencia}`);
  salvarBanco();
  fecharModal("modalJoiaDetalhe");
  renderTudo();
}

function deslocarMes(mesRef, delta) {
  const [ano, mes] = String(mesRef || getMesAtualSTR()).split("-").map(Number);
  const d = new Date(ano, (mes || 1) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
function getUltimosMeses(qtd = 6, mesFinal = getMesAtualSTR()) {
  const out = [];
  for(let i = qtd - 1; i >= 0; i--) out.push(deslocarMes(mesFinal, -i));
  return out;
}
function nomeMesLongo(mesRef) {
  const nomes = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const [ano, mes] = String(mesRef || getMesAtualSTR()).split("-").map(Number);
  return `${nomes[(mes || 1)-1]} de ${ano}`;
}

function labelMesCurto(mesRef) {
  const nomes = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const [ano, mes] = String(mesRef).split("-").map(Number);
  return `${nomes[(mes || 1)-1]}/${String(ano).slice(2)}`;
}

function getMesPainelSelecionado() {
  const input = qs("painelMes");
  if(input && input.value) return input.value;
  return getMesAtualSTR();
}
function abrirPainelResultados() {
  const input = qs("painelMes");
  if(input && !input.value) input.value = getMesAtualSTR();
  renderPainelResultados();
  abrirModal("modalPainelResultados");
}
function mudarMesPainel(delta) {
  const input = qs("painelMes");
  if(!input) return;
  input.value = deslocarMes(input.value || getMesAtualSTR(), delta);
  renderPainelResultados();
}
function renderPainelResultados() {
  const mesRef = getMesPainelSelecionado();
  const r = calcularResumo(mesRef);
  const vendas = [...(db.vendas || [])].sort((a,b)=>String(b.data).localeCompare(String(a.data)));
  const vendasMesLista = vendas.filter(v => String(v.data || "").slice(0,7) === mesRef);
  const meses = getUltimosMeses(6, mesRef);
  const vendasPorMes = meses.map(m => {
    const lista = vendas.filter(v => String(v.data || "").slice(0,7) === m);
    return { mes: m, label: labelMesCurto(m), valor: lista.reduce((s,v) => s + Number(v.valorVenda || 0), 0), qtd: lista.length };
  });
  const maxMes = Math.max(1, ...vendasPorMes.map(x => x.valor));
  const porCatEstoque = (db.categorias || []).map(cat => {
    const itens = (db.joias || []).filter(j => j.categoria === cat.id && j.status !== "vendido");
    const vendidosMes = vendasMesLista.filter(v => getJoia(v.joiaId)?.categoria === cat.id);
    const vendidosTotal = vendas.filter(v => getJoia(v.joiaId)?.categoria === cat.id);
    const compra = itens.reduce((s,j) => s + Number(j.precoCompra||0),0);
    const venda = itens.reduce((s,j) => s + Number(j.precoVenda||0),0);
    const receitaMes = vendidosMes.reduce((s,v)=>s + Number(v.valorVenda||0),0);
    const custoMes = vendidosMes.reduce((s,v)=>s + Number(getJoia(v.joiaId)?.precoCompra||0),0);
    return { cat, qtd: itens.length, vendidosMes: vendidosMes.length, vendidosTotal: vendidosTotal.length, peso: itens.reduce((s,j) => s + Number(j.pesoOuro||0),0), compra, venda, receitaMes, custoMes };
  });
  const maxCatVenda = Math.max(1, ...porCatEstoque.map(x => x.venda));
  const maxCatReceitaMes = Math.max(1, ...porCatEstoque.map(x => x.receitaMes));
  const giro = r.total ? Math.round((r.vendidas / r.total) * 100) : 0;
  const margemPct = r.receitaMes ? ((r.margemRealMes / r.receitaMes) * 100) : 0;
  const variacaoLabel = `${r.variacaoMes >= 0 ? "+" : ""}${formatDecimal(r.variacaoMes,1)}%`;
  const clientesMes = Object.values(vendasMesLista.reduce((acc, v) => {
    const id = v.clienteId || "sem_cliente";
    const cli = getCliente(v.clienteId);
    acc[id] = acc[id] || { nome: cli?.nomeCompleto || "Cliente não localizado", qtd: 0, valor: 0 };
    acc[id].qtd += 1; acc[id].valor += Number(v.valorVenda || 0);
    return acc;
  }, {})).sort((a,b)=>b.valor-a.valor).slice(0,5);
  qs("painelResumo").innerHTML = `
    <div class="report-month-title">Consulta de ${escapeHTML(nomeMesLongo(mesRef))}</div>
    <div class="report-hero report-hero-3">
      <div><small>Vendas do mês</small><strong>${formatMoeda(r.receitaMes)}</strong><em>${r.vendasMesQtd} peça(s) · ticket médio ${formatMoeda(r.ticketMedioMes)}</em></div>
      <div><small>Margem do mês</small><strong>${formatMoeda(r.margemRealMes)}</strong><em>${formatDecimal(margemPct,1)}% sobre vendas · custo ${formatMoeda(r.custoVendidoMes)}</em></div>
      <div><small>Valor de venda em estoque</small><strong>${formatMoeda(r.vendaEstoque)}</strong><em>${r.estoque} peças · ${formatDecimal(r.pesoEstoque,3)} g de ouro</em></div>
    </div>
    <div class="report-grid wide">
      <div class="report-card"><small>Peças vendidas</small><strong>${r.vendasMesQtd}</strong><em>${formatDecimal(r.pesoVendidoMes,3)} g vendidos no mês</em></div>
      <div class="report-card"><small>Disponíveis</small><strong>${r.disponiveis}</strong><em>prontas para venda</em></div>
      <div class="report-card"><small>Reservadas</small><strong>${r.reservadas}</strong><em>com cliente vinculado</em></div>
      <div class="report-card"><small>Custo em estoque</small><strong>${formatMoeda(r.custoEstoque)}</strong><em>margem pot. ${formatMoeda(r.margemPotencial)}</em></div>
      <div class="report-card"><small>Comparação mês anterior</small><strong>${variacaoLabel}</strong><em>mês anterior ${formatMoeda(r.receitaMesAnterior)}</em></div>
      <div class="report-card"><small>Giro cadastrado</small><strong>${giro}%</strong><em>vendidas / total cadastrado</em></div>
    </div>
    <div class="charts-grid">
      <div class="chart-card">
        <div class="section-title">Vendas dos últimos 6 meses</div>
        <div class="bar-chart vertical-bars">
          ${vendasPorMes.map(x => `<div class="vbar-wrap"><div class="vbar" style="height:${Math.max(5, Math.round((x.valor/maxMes)*100))}%"></div><small>${escapeHTML(x.label)}</small><b>${formatMoeda(x.valor)}</b></div>`).join("")}
        </div>
      </div>
      <div class="chart-card">
        <div class="section-title">Valor em estoque por categoria</div>
        <div class="bar-chart">
          ${porCatEstoque.map(x => `<div class="hbar-row"><span>${escapeHTML(x.cat.icon)} ${escapeHTML(x.cat.nome)}</span><div><i style="width:${Math.max(3, Math.round((x.venda/maxCatVenda)*100))}%"></i></div><b>${formatMoeda(x.venda)}</b></div>`).join("")}
        </div>
      </div>
      <div class="chart-card">
        <div class="section-title">Vendas do mês por categoria</div>
        <div class="bar-chart">
          ${porCatEstoque.map(x => `<div class="hbar-row"><span>${escapeHTML(x.cat.icon)} ${escapeHTML(x.cat.nome)}</span><div><i style="width:${Math.max(3, Math.round((x.receitaMes/maxCatReceitaMes)*100))}%"></i></div><b>${formatMoeda(x.receitaMes)}</b></div>`).join("")}
        </div>
      </div>
      <div class="chart-card">
        <div class="section-title">Top clientes do mês</div>
        ${clientesMes.length ? clientesMes.map(c => `<div class="ranking-row"><span>${escapeHTML(c.nome)}</span><strong>${formatMoeda(c.valor)}</strong><small>${c.qtd} venda(s)</small></div>`).join("") : `<p class="hint">Sem vendas no mês selecionado.</p>`}
      </div>
    </div>
    <div class="section-title">Resumo por categoria</div>
    <div class="table-wrap"><table><thead><tr><th>Categoria</th><th>Estoque</th><th>Vend. mês</th><th>Receita mês</th><th>Peso estoque</th><th>Custo est.</th><th>Venda est.</th><th>Margem pot.</th></tr></thead><tbody>
      ${porCatEstoque.map(x => `<tr><td>${escapeHTML(x.cat.icon)} ${escapeHTML(x.cat.nome)}</td><td>${x.qtd}</td><td>${x.vendidosMes}</td><td>${formatMoeda(x.receitaMes)}</td><td>${formatDecimal(x.peso,3)} g</td><td>${formatMoeda(x.compra)}</td><td>${formatMoeda(x.venda)}</td><td>${formatMoeda(x.venda - x.compra)}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="section-title">Vendas de ${escapeHTML(labelMesCurto(mesRef))}</div>
    ${vendasMesLista.map(v => {
      const joia = getJoia(v.joiaId); const cli = getCliente(v.clienteId);
      return `<div class="sale-card"><strong>${formatDataBR(v.data)} · ${formatMoeda(v.valorVenda)}</strong><small>${escapeHTML(joia?.referencia || "-")} · ${escapeHTML(cli?.nomeCompleto || "Cliente não localizado")} · ${escapeHTML(v.formaPagamento || "")}</small><p>${escapeHTML(v.obs || "")}</p></div>`;
    }).join("") || `<p class="hint">Nenhuma venda registrada neste mês.</p>`}
  `;
}

function getTemaSelecionado() {
  const id = qs("temaSelecionado")?.value || db.configGerais?.temaId || "ouro_classico";
  return TEMAS_PREDEFINIDOS.find(t => t.id === id) || TEMAS_PREDEFINIDOS[0];
}
function escolherTema(id) {
  const tema = TEMAS_PREDEFINIDOS.find(t => t.id === id) || TEMAS_PREDEFINIDOS[0];
  if(qs("temaSelecionado")) qs("temaSelecionado").value = tema.id;
  qsa(".theme-option").forEach(btn => btn.classList.toggle("active", btn.dataset.theme === tema.id));
  document.documentElement.style.setProperty("--theme-base", tema.cor);
  document.documentElement.style.setProperty("--theme-dark", shadeColor(tema.cor, -42));
  document.documentElement.style.setProperty("--theme-soft", hexToRgba(tema.cor, .12));
  document.documentElement.style.setProperty("--theme-sub", tema.sub);
}
function renderTemasPredefinidos() {
  const atual = db.configGerais?.temaId || (TEMAS_PREDEFINIDOS.find(t => t.cor === db.configGerais?.corTema)?.id) || "ouro_classico";
  const box = qs("temasPredefinidos");
  if(!box) return;
  qs("temaSelecionado").value = atual;
  box.innerHTML = TEMAS_PREDEFINIDOS.map(t => `<button type="button" class="theme-option ${t.id === atual ? "active" : ""}" data-theme="${escapeHTML(t.id)}" onclick="escolherTema('${escapeHTML(t.id)}')"><span style="background:${escapeHTML(t.cor)}"></span><strong>${escapeHTML(t.nome)}</strong></button>`).join("");
}

function abrirDadosLoja() {
  qs("lojaNome").value = db.loja.nome || "";
  qs("lojaTelefone").value = db.loja.telefone || "";
  qs("lojaCidade").value = db.loja.cidade || "";
  preencherUFSelect("lojaUF", db.loja.uf || "PB");
  logoLojaTemp = db.loja.logo || "";
  renderPreviewLogoLoja();
  abrirModal("modalConfiguracoes");
}
function abrirConfiguracoes() { abrirDadosLoja(); }
function abrirTemaVisual() {
  renderTemasPredefinidos();
  abrirModal("modalTemaVisual");
}
function renderPreviewLogoLoja() { qs("previewLogoLoja").innerHTML = logoLojaTemp ? `<img src="${logoLojaTemp}" alt="Logo">` : `<span>◆</span>`; }
async function selecionarLogoLoja(event) { const file = event.target.files && event.target.files[0]; if(!file) return; setLoading(true, "Comprimindo logo..."); try { logoLojaTemp = await comprimirImagem(file, 512, .86); renderPreviewLogoLoja(); } finally { setLoading(false); } }

function salvarDadosLoja() {
  db.loja.nome = qs("lojaNome").value.trim() || "JoiasPro";
  db.loja.telefone = qs("lojaTelefone").value.trim();
  db.loja.cidade = qs("lojaCidade").value.trim();
  db.loja.uf = qs("lojaUF").value;
  db.loja.logo = logoLojaTemp || "";
  tocarRegistro(db.loja);
  registrarAuditoria("Dados da loja alterados", "Nome, contato, cidade ou logo da loja foram atualizados.");
  salvarBanco();
  renderTudo();
  fecharModal("modalConfiguracoes");
  alert("Dados da loja salvos.");
}
function salvarTemaVisual() {
  const tema = getTemaSelecionado();
  db.configGerais.temaId = tema.id;
  db.configGerais.corTema = tema.cor;
  db.configGerais.corSubHeader = tema.sub;
  tocarRegistro(db.configGerais);
  registrarAuditoria("Tema visual alterado", tema.nome);
  salvarBanco();
  renderTudo();
  fecharModal("modalTemaVisual");
  alert("Tema salvo.");
}
function salvarConfigAvancada() {
  db.configs.url = qs("configUrlApp").value.trim();
  db.configs.somenteLocal = !db.configs.url;
  registrarAuditoria("Configuração de sincronização alterada", db.configs.url ? "Back-end configurado." : "Uso local sem back-end.");
  salvarBanco();
  renderSyncInfo();
  alert("Configuração avançada salva.");
}
function salvarConfiguracoes() { salvarDadosLoja(); }

function renderSyncInfo() {
  const status = db.configs.url ? "Sincronização configurada" : "Somente local";
  const ultima = db.configs.ultimaSincronizacao ? formatDateTime(db.configs.ultimaSincronizacao) : "nunca";
  qs("syncInfo").innerHTML = `<strong>${status}</strong><br>Última sincronização: ${ultima}<br>Revisão: ${escapeHTML(db.configs.syncRevision || 0)}`;
}

function renderUsuarios() {
  const usuarios = getPerfisAdminDisponiveis();
  qs("listaUsuarios").innerHTML = usuarios.map(u => `
    <div class="user-card"><div><strong>${escapeHTML(u.nome)}</strong><small>${u.isAdmin ? "Administrador" : "Usuário"}${u.forcarTrocaSenha ? " · troca de senha pendente" : ""}</small></div>
    <div class="client-actions"><button onclick="abrirFormularioUsuario('${escapeHTML(u.id)}')">Editar</button>${u.id !== "admin_padrao" ? `<button onclick="excluirUsuario('${escapeHTML(u.id)}')">Excluir</button>` : ""}</div></div>`).join("");
}

function abrirFormularioUsuario(id = "") {
  qs("usuarioId").value = id || "";
  const u = id ? getPerfisAdminDisponiveis().find(x => x.id === id) : null;
  qs("tituloUsuarioForm").innerText = u ? "Editar usuário" : "Cadastrar usuário";
  qs("usuarioNome").value = u ? u.nome : "";
  qs("usuarioSenha").value = u ? u.senha : "";
  qs("usuarioAdmin").checked = u ? u.isAdmin : true;
  qs("usuarioForcarTroca").checked = u ? u.forcarTrocaSenha : true;
  abrirModal("modalUsuarioForm");
}

function salvarUsuarioForm() {
  const id = qs("usuarioId").value;
  const nome = qs("usuarioNome").value.trim();
  const senha = qs("usuarioSenha").value.trim();
  if(!nome) return alert("Informe o nome.");
  if(!senha || senha.length < 4) return alert("Informe uma senha com pelo menos 4 números.");
  let u = id ? db.administradores.find(a => a.id === id) : null;
  if(!u && id === "admin_padrao") {
    u = { id: gerarIdLocal("adm") };
    db.administradores.push(u);
    if(adminLogado && adminLogado.id === "admin_padrao") adminLogado.id = u.id;
  }
  if(!u) { u = { id: gerarIdLocal("adm") }; db.administradores.push(u); }
  Object.assign(u, { nome, senha, isAdmin: qs("usuarioAdmin").checked, forcarTrocaSenha: qs("usuarioForcarTroca").checked });
  tocarRegistro(u);
  registrarAuditoria("Usuário salvo", nome);
  salvarBanco();
  fecharModal("modalUsuarioForm");
  renderUsuarios();
}

function excluirUsuario(id) {
  const u = db.administradores.find(a => a.id === id); if(!u) return;
  if(adminLogado && adminLogado.id === id) return alert("Não é possível excluir o usuário conectado.");
  if(!confirm(`Excluir usuário ${u.nome}?`)) return;
  registrarExclusao("administradores", id);
  db.administradores = db.administradores.filter(a => a.id !== id);
  registrarAuditoria("Usuário excluído", u.nome);
  salvarBanco();
  renderUsuarios();
}

function abrirAuditoria() { renderAuditoria(); abrirModal("modalAuditoria"); }
function renderAuditoria() {
  const q = (qs("buscaAuditoria")?.value || "").toLowerCase();
  let lista = [...(db.auditoria || [])];
  if(q) lista = lista.filter(a => [a.acao, a.detalhes, a.usuario].join(" ").toLowerCase().includes(q));
  qs("listaAuditoria").innerHTML = lista.length ? lista.map(a => `<div class="audit-card"><strong>${escapeHTML(a.acao)}</strong><small>${formatDateTime(a.createdAt)} · ${escapeHTML(a.usuario || "Sistema")}</small><p>${escapeHTML(a.detalhes || "")}</p></div>`).join("") : `<p class="hint">Sem registros de auditoria.</p>`;
}

function abrirAvancado() { qs("configUrlApp").value = db.configs.url || ""; renderSyncInfo(); renderUsuarios(); abrirModal("modalAvancado"); }

function exportarDadosBackup() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(db, null, 2));
  const a = document.createElement("a");
  a.href = dataStr;
  a.download = `joiaspro_backup_${getHojeSTR()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function importarDadosBackup(event) {
  const file = event.target.files && event.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const imported = JSON.parse(e.target.result);
      if(!validarBancoImportado(imported)) return alert("Backup inválido ou incompatível.");
      const url = db.configs.url;
      db = normalizarBanco(imported);
      if(url && !db.configs.url) db.configs.url = url;
      salvarBanco({ sincronizar: false });
      registrarAuditoria("Backup importado", file.name);
      salvarBanco();
      alert("Backup importado.");
      location.reload();
    } catch(err) { alert("Erro ao ler o backup."); }
  };
  reader.readAsText(file);
  event.target.value = "";
}

function exportarCSV(tipo) {
  let rows = [];
  if(tipo === "joias") {
    rows = [["referencia","descricao","categoria","status","peso_ouro_g","preco_compra","preco_venda","cliente","data_cadastro","data_venda","observacoes"]];
    (db.joias || []).forEach(j => rows.push([j.referencia, j.descricao, getCategoria(j.categoria).nome, j.status, String(j.pesoOuro).replace(".",","), formatMoedaSem(j.precoCompra), formatMoedaSem(j.precoVenda), getCliente(j.clienteId)?.nomeCompleto || "", j.dataCadastro || "", j.dataVenda || "", j.obs || ""]));
  } else if(tipo === "clientes") {
    rows = [["nome_completo","telefone","cidade","uf","endereco_entrega"]];
    (db.clientes || []).forEach(c => rows.push([c.nomeCompleto, c.telefone, c.cidade, c.uf, c.enderecoEntrega]));
  } else if(tipo === "vendas") {
    rows = [["data","referencia","cliente","valor_venda","forma_pagamento","observacao"]];
    (db.vendas || []).forEach(v => rows.push([v.data, getJoia(v.joiaId)?.referencia || "", getCliente(v.clienteId)?.nomeCompleto || "", formatMoedaSem(v.valorVenda), v.formaPagamento || "", v.obs || ""]));
  }
  const csv = rows.map(r => r.map(campo => `"${String(campo ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `joiaspro_${tipo}_${getHojeSTR()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function excluirTudoLocal() {
  if(qs("inputExcluirTudo").value.trim().toLowerCase() !== "excluir tudo") return alert("Digite a frase exatamente como indicada.");
  if(!confirm("Excluir todos os dados salvos neste aparelho?")) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

function agendarSincronizacao() {
  if(!db.configs || !db.configs.url) return;
  syncPendente = true;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => sincronizarFundo(false, true), 1500);
}

function temMudancaLocalPendente() {
  if(db.loja && db.loja._clientDirty) return true;
  if(db.configGerais && db.configGerais._clientDirty) return true;
  if((db.joias || []).some(x => x._clientDirty)) return true;
  if((db.clientes || []).some(x => x._clientDirty)) return true;
  if((db.vendas || []).some(x => x._clientDirty)) return true;
  if((db.categorias || []).some(x => x._clientDirty)) return true;
  if((db.administradores || []).some(x => x._clientDirty)) return true;
  if((db.auditoria || []).some(x => x._clientDirty)) return true;
  return Object.values(db._deleted || {}).some(grupo => Object.values(grupo || {}).some(t => t && t._clientDirty));
}

function tombstoneTempo(valor) { return valor && typeof valor === "object" ? Number(valor.deletedAt || valor._clientChangedAt || 0) : Number(valor || 0); }
function objetoMaisNovo(a,b) { if(!a) return b || {}; if(!b) return a || {}; const ta = Number(a.updatedAt || a._clientChangedAt || a._serverUpdatedAt || 0); const tb = Number(b.updatedAt || b._clientChangedAt || b._serverUpdatedAt || 0); return tb >= ta ? b : a; }
function mesclarExclusoes(a,b) { const tipos = ["joias","clientes","vendas","categorias","administradores"]; const out = {}; tipos.forEach(tipo => { out[tipo] = {}; const aa = (a && a[tipo]) || {}, bb = (b && b[tipo]) || {}; Object.keys(aa).forEach(id => out[tipo][id] = aa[id]); Object.keys(bb).forEach(id => { const old = out[tipo][id]; out[tipo][id] = tombstoneTempo(bb[id]) >= tombstoneTempo(old) ? bb[id] : old; }); }); return out; }
function mesclarListaPorData(atual = [], nova = [], excluidos = {}) { const map = {}; atual.concat(nova).forEach(item => { if(!item) return; const key = item.id || item.referencia || item.nome; if(!key) return; map[key] = objetoMaisNovo(map[key], item); }); return Object.keys(map).filter(id => !excluidos[id] || tombstoneTempo(excluidos[id]) < Number(map[id].updatedAt || 0)).map(id => map[id]); }
function mesclarBancosPorData(local, nuvem) {
  local = normalizarBanco(local); nuvem = normalizarBanco(nuvem);
  const merged = normalizarBanco({ ...local });
  merged._deleted = mesclarExclusoes(local._deleted, nuvem._deleted);
  merged.loja = objetoMaisNovo(local.loja, nuvem.loja);
  merged.configGerais = objetoMaisNovo(local.configGerais, nuvem.configGerais);
  merged.categorias = mesclarListaPorData(local.categorias, nuvem.categorias, merged._deleted.categorias);
  merged.joias = mesclarListaPorData(local.joias, nuvem.joias, merged._deleted.joias);
  merged.clientes = mesclarListaPorData(local.clientes, nuvem.clientes, merged._deleted.clientes);
  merged.vendas = mesclarListaPorData(local.vendas, nuvem.vendas, merged._deleted.vendas);
  merged.administradores = mesclarListaPorData(local.administradores, nuvem.administradores, merged._deleted.administradores);
  merged.auditoria = filtrarAuditoriaRecente(mesclarListaPorData(local.auditoria, nuvem.auditoria, {}));
  merged.configs = { ...(local.configs || {}), ...(nuvem.configs || {}) };
  merged.configs.url = local.configs.url || nuvem.configs.url || "";
  merged.configs.somenteLocal = !merged.configs.url;
  merged.configs.ultimaMudancaLocal = Math.max(Number(local.configs?.ultimaMudancaLocal || 0), Number(nuvem.configs?.ultimaMudancaLocal || 0));
  merged.configs.ultimaSincronizacao = Math.max(Number(local.configs?.ultimaSincronizacao || 0), Number(nuvem.configs?.ultimaSincronizacao || 0));
  merged.configs.syncRevision = Math.max(Number(local.configs?.syncRevision || 0), Number(nuvem.configs?.syncRevision || 0));
  return normalizarBanco(merged);
}

function aplicarBancoAtualizado(novoBanco, opcoes = {}) {
  if(!validarBancoImportado(novoBanco)) return false;
  const urlSalva = db.configs?.url || "";
  db = normalizarBanco(novoBanco);
  if(urlSalva) db.configs.url = urlSalva;
  db.configs.somenteLocal = !db.configs.url;
  db.configs.ultimaSincronizacao = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  if(opcoes.render !== false) renderTudo();
  return true;
}

function validarBancoImportado(dados) { return !!(dados && dados.app_id === "joiaspro" && dados.loja && typeof dados.loja === "object"); }

async function salvarURLComValor(inputUrl, origem = "inicial") {
  inputUrl = String(inputUrl || "").trim();
  if(!inputUrl) { if(origem === "inicial") exibirErroLogin("setupUrlErro", "Digite a URL do back-end."); else alert("Digite a URL."); return false; }
  if(origem === "inicial") limparErroLogin("setupUrlErro");
  setLoading(true, "Conectando ao back-end...");
  try {
    const fetchUrl = inputUrl + (inputUrl.includes("?") ? "&" : "?") + "nocache=" + Date.now();
    const res = await fetch(fetchUrl, { redirect: "follow", cache: "no-store" });
    if(!res.ok) throw new Error("Falha ao buscar dados");
    let dadosNuvem = await res.json();
    if(!validarBancoImportado(dadosNuvem)) {
      const base = criarBancoBase();
      base.configs.url = inputUrl;
      db.configs.url = inputUrl;
      await sincronizarFundo(true, false);
      dadosNuvem = db;
    } else {
      dadosNuvem = mesclarBancosPorData(db, dadosNuvem);
      dadosNuvem.configs.url = inputUrl;
      dadosNuvem.configs.somenteLocal = false;
      db = normalizarBanco(dadosNuvem);
      salvarBanco({ sincronizar: false, marcarLocal: false });
      await sincronizarFundo(true, false);
    }
    if(origem === "inicial") fecharModal("modalSetupUrl");
    alert("Dados sincronizados. Faça login.");
    abrirLoginAdmin(false);
    return true;
  } catch(e) {
    console.error(e);
    if(origem === "inicial") exibirErroLogin("setupUrlErro", "Não foi possível conectar nessa URL."); else alert("Não foi possível conectar nessa URL.");
    return false;
  } finally { setLoading(false); }
}
async function salvarURLInicial() { return salvarURLComValor(qs("setupUrlApp").value, "inicial"); }

async function sincronizarFundo(forcado = false, apenasEmpurrar = false) {
  if(!db.configs.url || isSyncingFundo) return;
  syncPendente = false;
  isSyncingFundo = true;
  qs("syncIndicador").style.opacity = "1";
  try {
    const localAntes = JSON.parse(JSON.stringify(db));
    const res = await fetch(db.configs.url, { method: "POST", redirect: "follow", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "salvar_banco", dados: db, baseRevision: db.configs.syncRevision || 0 }) });
    if(!res.ok) throw new Error("Falha ao salvar na nuvem");
    const retorno = await res.json().catch(() => null);
    if(retorno && retorno.ok && retorno.dados && validarBancoImportado(retorno.dados)) {
      const mesclado = mesclarBancosPorData(localAntes, retorno.dados);
      mesclado.configs.url = db.configs.url;
      mesclado.configs.ultimaSincronizacao = Date.now();
      aplicarBancoAtualizado(mesclado);
    } else if(retorno && retorno.ok) {
      db.configs.syncRevision = retorno.revision || db.configs.syncRevision || 0;
      db.configs.ultimaSincronizacao = Date.now();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    }
    renderSyncInfoSafe();
  } catch(e) {
    console.warn("Sync falhou", e);
    syncPendente = true;
  } finally {
    isSyncingFundo = false;
    qs("syncIndicador").style.opacity = "0";
    if(syncPendente) { clearTimeout(syncTimer); syncTimer = setTimeout(() => sincronizarFundo(false, true), 6000); }
  }
}

async function puxarDadosNuvem(silencioso = true) {
  if(!db.configs.url || isSyncingFundo) return;
  if(syncPendente || temMudancaLocalPendente()) { sincronizarFundo(false, true); return; }
  try {
    const fetchUrl = db.configs.url + (db.configs.url.includes("?") ? "&" : "?") + "nocache=" + Date.now();
    const res = await fetch(fetchUrl, { redirect: "follow", cache: "no-store" });
    if(!res.ok) throw new Error("Falha ao puxar dados");
    let nuvem = await res.json();
    if(!validarBancoImportado(nuvem)) return;
    nuvem = normalizarBanco(nuvem);
    if(Number(nuvem.configs.syncRevision || 0) <= Number(db.configs.syncRevision || 0)) { if(!silencioso) alert("Você já está com a versão mais recente."); return; }
    nuvem.configs.url = db.configs.url;
    aplicarBancoAtualizado(nuvem);
    if(!silencioso) alert("Dados atualizados da nuvem.");
    renderSyncInfoSafe();
  } catch(e) { if(!silencioso) alert("Não foi possível puxar os dados da nuvem."); }
}
function renderSyncInfoSafe() { if(qs("syncInfo")) renderSyncInfo(); }

function inicializarSincronizacaoAutomatica() {
  if(!db.configs.url) return;
  setTimeout(() => sincronizacaoAutomatica(), 2500);
  setInterval(() => sincronizacaoAutomatica(), SYNC_PULL_INTERVAL_MS);
  window.addEventListener("focus", () => sincronizacaoAutomatica());
}
function sincronizacaoAutomatica() { if(!db.configs.url || isSyncingFundo) return; if(syncPendente || temMudancaLocalPendente()) sincronizarFundo(false, true); else puxarDadosNuvem(true); }

function registrarServiceWorker() { if("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {}); }
async function forcarAtualizacao() {
  if(!confirm("Deseja limpar o cache e forçar atualização do aplicativo?")) return;
  try {
    if("serviceWorker" in navigator) { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.unregister())); }
    if(window.caches) { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))); }
  } catch(e) {}
  window.location.replace(window.location.pathname + "?nocache=" + Date.now());
}

function configurarTeclas() {
  document.addEventListener("keydown", e => {
    if(e.key === "Escape") {
      const abertos = qsa(".modal-overlay").filter(m => getComputedStyle(m).display !== "none");
      const top = abertos.sort((a,b) => (parseInt(getComputedStyle(a).zIndex)||0) - (parseInt(getComputedStyle(b).zIndex)||0)).pop();
      if(top && !(top.id === "modalTrocaSenha" && qs("trocaSenhaObrigatoria")?.value === "true")) fecharModal(top.id);
    }
    if(e.key === "Enter" && qs("modalLoginAdmin") && getComputedStyle(qs("modalLoginAdmin")).display !== "none") entrarAdmin();
  });
}

function init() {
  qs("splashVersao").innerText = APP_VERSION;
  aplicarTema();
  renderCabecalho();
  preencherUFSelect("clienteUF", db.loja?.uf || "PB");
  configurarTeclas();
  registrarServiceWorker();
  renderTudo(true);
  inicializarSincronizacaoAutomatica();
  setTimeout(() => { qs("splashScreen").style.opacity = "0"; setTimeout(() => qs("splashScreen").style.display = "none", 500); }, 800);
  iniciarFluxoAcesso();
}

document.addEventListener("DOMContentLoaded", init);
