const APP_VERSION = "v0.6";
const STORAGE_KEY = "joiaspro_v1";
const CLIENT_KEY = "joiaspro_client_id";
// A consulta curta mantém os aparelhos próximos sem bloquear a tela. A fila
// impede requests concorrentes e o servidor continua sendo a fonte do horário.
const SYNC_PULL_INTERVAL_MS = 5000;
const SYNC_RETRY_INTERVAL_MS = 2500;
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

// Fotos reais usadas na capa do catálogo. Elas ficam no repositório para o
// aplicativo carregar rapidamente, sem depender de um serviço externo.
const CAPA_FOTOS = [
  { src: "assets/capa/colar-ponto-luz.jpeg", titulo: "Brilho que fica", categoria: "Correntaria" },
  { src: "assets/capa/escapulario-cartier.jpeg", titulo: "Detalhes com significado", categoria: "Escapulários" },
  { src: "assets/capa/pulseiras-ouro.jpeg", titulo: "Ouro em movimento", categoria: "Pulseiras" },
  { src: "assets/capa/pulseira-elos.jpeg", titulo: "Clássicos para todos os dias", categoria: "Pulseiras" },
  { src: "assets/capa/aneis-coracao.jpeg", titulo: "Peças para celebrar", categoria: "Anéis" },
  { src: "assets/capa/brincos-argolas.jpeg", titulo: "Elegância nos detalhes", categoria: "Argolas" }
];

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

let serverClockOffsetMs = 0;
let localMutationVersion = 0;
let db = carregarBanco();
let adminLogado = null;
let estado = { categoria: "todos", status: "todos", busca: "" };
let fotoJoiaTemp = "";
let logoLojaTemp = "";
let contextoNovoCliente = "";
let isSyncingFundo = false;
let syncTimer = null;
let syncIntervalId = null;
let syncListenersRegistered = false;
let syncPendente = false;
let cepLookupInProgress = false;
let renderPendenteSync = false;
let filtroClientes = "todos";
let capaFotoAtual = 0;
let capaTimer = null;

function qs(id) { return document.getElementById(id); }
function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }
function escapeHTML(valor) { return String(valor ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch])); }
function agoraServidor() { return Date.now() + serverClockOffsetMs; }
function atualizarRelogioServidor(serverNow) {
  const valor = Number(serverNow || 0);
  if(Number.isFinite(valor) && valor > 0) serverClockOffsetMs = valor - Date.now();
}
function getHojeSTR() { const d = new Date(agoraServidor()); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
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
function maskCPF(el) { let v = el.value.replace(/\D/g, "").slice(0, 11); if(v.length > 9) v = `${v.slice(0,3)}.${v.slice(3,6)}.${v.slice(6,9)}-${v.slice(9)}`; else if(v.length > 6) v = `${v.slice(0,3)}.${v.slice(3,6)}.${v.slice(6)}`; else if(v.length > 3) v = `${v.slice(0,3)}.${v.slice(3)}`; el.value = v; }
function maskCEP(el) { let v = el.value.replace(/\D/g, "").slice(0, 8); if(v.length > 5) v = `${v.slice(0,5)}-${v.slice(5)}`; el.value = v; }
function abrirModal(id) { const el = qs(id); if(el) { el.style.display = "flex"; const modal = el.querySelector(".modal"); if(modal) modal.scrollTop = 0; } }
function fecharModal(id) {
  const el = qs(id);
  if(el) el.style.display = "none";
  // Uma sincronização em segundo plano nunca deve apagar o que está sendo
  // digitado. Assim que o último modal fecha, a tela recebe a atualização.
  if(renderPendenteSync && !qsa(".modal-overlay").some(m => getComputedStyle(m).display !== "none")) {
    renderPendenteSync = false;
    renderTudo(false);
  }
}
function setLoading(ativo, texto = "Processando...") { qs("loadingText").innerText = texto; qs("loadingOverlay").style.display = ativo ? "flex" : "none"; }
function getCategoria(id) { return (db.categorias || []).find(c => c.id === id) || { id, nome: id || "Sem categoria", icon: "◆" }; }
function getCliente(id) { return (db.clientes || []).find(c => c.id === id) || null; }
function getJoia(id) { return (db.joias || []).find(j => j.id === id) || null; }
function parseNumeroFlexivel(valor) {
  if(typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  let texto = String(valor ?? "").trim().replace(/\s/g, "").replace(/R\$/gi, "");
  if(texto.includes(",") && texto.includes(".")) texto = texto.replace(/\./g, "").replace(",", ".");
  else if(texto.includes(",")) texto = texto.replace(",", ".");
  const numero = parseFloat(texto.replace(/[^\d.-]/g, ""));
  return Number.isFinite(numero) ? numero : 0;
}
function calcularCustoJoia(joia = {}) {
  const gramas = Math.max(0, parseNumeroFlexivel(joia.gramasCusto ?? joia.pesoOuro));
  const indice = Math.max(0, parseNumeroFlexivel(joia.indiceCusto ?? joia.indice));
  const fatorDia = Math.max(0, parseNumeroFlexivel(joia.fatorDia ?? joia.fator));
  const incidenciaImposto = Math.max(0, parseNumeroFlexivel(joia.incidenciaImposto ?? joia.imposto));
  const custoBase = gramas * indice * fatorDia;
  const valorImposto = custoBase * (incidenciaImposto / 100);
  return { gramas, indice, fatorDia, incidenciaImposto, custoBase, valorImposto, total: custoBase + valorImposto };
}
function getCustoFixoJoia(joia = {}) {
  const fixo = parseNumeroFlexivel(joia.custoFixo);
  return joia.statusPagamento === "pago" && fixo > 0 ? fixo : 0;
}
function getCustoAtualJoia(joia = {}) {
  const fixo = getCustoFixoJoia(joia);
  if(fixo > 0) return fixo;
  const calculado = calcularCustoJoia(joia).total;
  return calculado > 0 ? calculado : Math.max(0, parseNumeroFlexivel(joia.precoCompra));
}
function getCustoVenda(venda = {}) {
  const snapshot = parseNumeroFlexivel(venda.custoUnitario);
  if(snapshot > 0) return snapshot;
  return getCustoAtualJoia(getJoia(venda.joiaId) || {});
}
function getQuantidadeCustoJoia(joia = {}) {
  return Math.max(1, Math.floor(Number(joia.quantidadeInicial || joia.quantidadeEstoque || 1)));
}
function getUsuarioAuditoria() { return adminLogado && adminLogado.nome ? adminLogado.nome : "Sistema"; }
function getValorFrete(venda = {}) { return Math.max(0, Number(venda.valorFrete ?? venda.frete ?? 0) || 0); }
function getValorTotalPedido(venda = {}) {
  const informado = Number(venda.valorTotalPedido);
  return Number.isFinite(informado) && Object.prototype.hasOwnProperty.call(venda, "valorTotalPedido") ? Math.max(0, informado) : Math.max(0, Number(venda.valorVenda || 0) + getValorFrete(venda));
}
function getFormaPagamentoLabel(valor) {
  const mapa = { pix: "Pix", cartao_presencial: "Cartão de crédito presencial", cartao_link: "Cartão de crédito por link", dinheiro: "Dinheiro" };
  return mapa[valor] || valor || "Não informado";
}
function getModalidadeEnvioLabel(valor) { return String(valor || "").toLowerCase() === "sedex" ? "Sedex" : String(valor || "").toLowerCase() === "pac" ? "PAC" : valor || "Não informado"; }
function getStatusPedidoLabel(valor) {
  const mapa = { pronto_para_envio: "Pronto para envio", aguardando_fabricacao: "Aguardando fabricação", enviado: "Enviado", entregue: "Entregue" };
  return mapa[valor] || valor || "Pronto para envio";
}
function ehVendedora(perfil = adminLogado) { return !!perfil && (perfil.tipo === "vendedora" || perfil.isAdmin === false); }
function ehAdministrador(perfil = adminLogado) { return !!perfil && !ehVendedora(perfil); }
function exigirAdministrador() {
  if(ehAdministrador()) return true;
  alert("Esta área está disponível apenas para o perfil Administrador.");
  return false;
}
function modalDeEdicaoAberto() {
  return qsa(".modal-overlay").some(m => getComputedStyle(m).display !== "none" && ["modalJoiaForm","modalClienteForm","modalVenda","modalReserva","modalUsuarioForm","modalConfiguracoes","modalTemaVisual","modalTrocaSenha","modalListaEsperaForm","modalAnotacaoForm","modalRastreioPedido","modalPagamentoCusto"].includes(m.id));
}
function atualizarPermissoesPerfil() {
  const vendedor = ehVendedora();
  const administrador = ehAdministrador();
  const alternar = (id, visivel) => { const el = qs(id); if(el) el.style.display = visivel ? "" : "none"; };
  ["btnPainelGeral","btnDadosLoja","btnTemaVisual","btnAuditoria","btnAvancado","btnMenuVendasVendedoras","btnMenuFinanceiro"].forEach(id => alternar(id, administrador));
  alternar("btnPainelVendedora", vendedor);
  alternar("btnMenuPainelVendedora", vendedor);
  const campoCompra = qs("campoJoiaCompra");
  if(campoCompra) campoCompra.style.display = vendedor ? "none" : "";
  const custos = qsa(".somente-admin"); custos.forEach(el => el.style.display = vendedor ? "none" : "");
}
function getVendedorAtual() {
  if(!adminLogado || !ehVendedora()) return null;
  return { id: adminLogado.id || "", nome: adminLogado.nome || "" };
}
function preencherSelectVendedores(valor = "") {
  const select = qs("vendaVendedora");
  if(!select) return;
  const vendedores = getPerfisAdminDisponiveis().filter(p => ehVendedora(p));
  select.innerHTML = '<option value="">Venda da loja/administrador</option>' + vendedores.map(p => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.nome)}</option>`).join("");
  select.value = valor || "";
  select.closest(".form-group")?.style.setProperty("display", ehAdministrador() ? "" : "none");
}
function montarEnderecoCliente(c = {}) {
  const rua = [c.rua, c.numero].filter(Boolean).join(", ");
  const local = [rua, c.bairro, c.cidade, c.uf].filter(Boolean).join(" - ");
  const extras = [c.complemento, c.pontoReferencia].filter(Boolean).join(" · ");
  return [c.cep, local, extras].filter(Boolean).join(" · ");
}
function enderecoClienteParaExibicao(c = {}) {
  return montarEnderecoCliente(c) || c.enderecoEntrega || "sem endereço";
}

function criarBancoBase() {
  return {
    app_id: "joiaspro",
    loja: { nome: "JoiasPro", logo: "", telefone: "", cidade: "", uf: "PB" },
    categorias: CATEGORIAS_PADRAO.map(c => ({ ...c })),
    joias: [],
    clientes: [],
    vendas: [],
    listaEspera: [],
    anotacoes: [],
    administradores: [],
    auditoria: [],
    configGerais: { temaId: "ouro_classico", corTema: "#9B6A2F", corSubHeader: "#fff8ef" },
    configs: { url: "", dadosBaixados: false, somenteLocal: false, ultimaMudancaLocal: 0, ultimaSincronizacao: 0, serverNow: 0, syncRevision: 0, senhaAdmin: "1999", clientId: getClientIdLocal() },
    _deleted: { joias: {}, clientes: {}, vendas: {}, listaEspera: {}, anotacoes: {}, categorias: {}, administradores: {} }
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
  dados.listaEspera = Array.isArray(dados.listaEspera) ? dados.listaEspera : [];
  dados.anotacoes = Array.isArray(dados.anotacoes) ? dados.anotacoes : [];
  dados.administradores = Array.isArray(dados.administradores) ? dados.administradores : [];
  dados.auditoria = filtrarAuditoriaRecente(Array.isArray(dados.auditoria) ? dados.auditoria : []);
  dados.configGerais = { ...base.configGerais, ...(dados.configGerais || {}) };
  dados.configs = { ...base.configs, ...(dados.configs || {}) };
  dados.configs.clientId = dados.configs.clientId || getClientIdLocal();
  dados._deleted = { ...base._deleted, ...(dados._deleted || {}) };
  ["joias","clientes","vendas","listaEspera","anotacoes","categorias","administradores"].forEach(k => dados._deleted[k] = dados._deleted[k] || {});

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
    j.pesoOuro = parseNumeroFlexivel(j.pesoOuro);
    j.gramasCusto = parseNumeroFlexivel(j.gramasCusto ?? j.pesoOuro);
    j.indiceCusto = parseNumeroFlexivel(j.indiceCusto ?? j.indice);
    j.fatorDia = parseNumeroFlexivel(j.fatorDia ?? j.fator);
    j.incidenciaImposto = Math.max(0, parseNumeroFlexivel(j.incidenciaImposto ?? j.imposto));
    const custoCalculado = calcularCustoJoia(j);
    j.custoBase = parseNumeroFlexivel(j.custoBase) || custoCalculado.custoBase;
    j.custoCalculado = parseNumeroFlexivel(j.custoCalculado) || custoCalculado.total;
    j.statusPagamento = ["pago", "aberto"].includes(j.statusPagamento) ? j.statusPagamento : (parseNumeroFlexivel(j.precoCompra) > 0 ? "pago" : "aberto");
    j.dataPagamento = j.dataPagamento || "";
    j.custoFixo = parseNumeroFlexivel(j.custoFixo) || (j.statusPagamento === "pago" ? parseNumeroFlexivel(j.precoCompra) : 0);
    j.custoFixoData = j.custoFixoData || (j.statusPagamento === "pago" ? j.dataPagamento : "");
    j.precoCompra = parseNumeroFlexivel(j.precoCompra) || (j.statusPagamento === "pago" ? j.custoFixo : j.custoCalculado);
    j.precoVenda = Number(j.precoVenda || 0);
    j.status = ["disponível","reservado","vendido"].includes(j.status) ? j.status : "disponível";
    const qtdInformada = Number(j.quantidadeEstoque);
    j.quantidadeEstoque = Number.isFinite(qtdInformada) ? Math.max(0, Math.floor(qtdInformada)) : (j.status === "vendido" ? 0 : 1);
    j.quantidadeInicial = Math.max(Number(j.quantidadeInicial || 0), j.quantidadeEstoque, j.status === "vendido" ? 1 : 0);
    j.dataEntrada = j.dataEntrada || j.dataCadastro || getHojeSTR();
    j.foto = j.foto || "";
    j.updatedAt = Number(j.updatedAt || 0);
  });

  dados.clientes.forEach((c, idx) => {
    if(!c.id) c.id = `cli_${normalizarTextoId(c.nomeCompleto || c.nome)}_${idx}`;
    c.nomeCompleto = c.nomeCompleto || c.nome || "";
    c.telefone = c.telefone || "";
    c.email = c.email || "";
    c.cpf = c.cpf || "";
    c.cep = c.cep || "";
    // Migração transparente do endereço antigo para o novo campo de rua.
    c.rua = c.rua || c.enderecoEntrega || "";
    c.numero = c.numero || "";
    c.bairro = c.bairro || "";
    c.cidade = c.cidade || "";
    c.uf = c.uf || "PB";
    c.complemento = c.complemento || "";
    c.pontoReferencia = c.pontoReferencia || "";
    c.observacao = c.observacao || c.obs || "";
    c.vip = !!c.vip;
    c.enderecoEntrega = c.enderecoEntrega || montarEnderecoCliente(c);
    c.updatedAt = Number(c.updatedAt || 0);
  });

  dados.vendas.forEach((v, idx) => {
    if(!v.id) v.id = `venda_${normalizarTextoId(v.joiaId)}_${idx}`;
    v.data = v.data || getHojeSTR();
    v.valorVenda = Number(v.valorVenda || 0);
    v.quantidade = Math.max(1, Math.floor(Number(v.quantidade || 1)));
    v.vendedorId = v.vendedorId || "";
    v.vendedorNome = v.vendedorNome || "";
    v.valorFrete = Math.max(0, Number(v.valorFrete ?? v.frete ?? 0) || 0);
    v.modalidadeEnvio = v.modalidadeEnvio || v.modalidade || "";
    v.pedidoId = v.pedidoId || v.id;
    v.statusPedido = v.statusPedido || "pronto_para_envio";
    v.codigoRastreio = v.codigoRastreio || "";
    v.dataRastreio = Number(v.dataRastreio || 0);
    v.custoUnitario = parseNumeroFlexivel(v.custoUnitario);
    v.custoTotal = parseNumeroFlexivel(v.custoTotal) || (v.custoUnitario * v.quantidade);
    const totalInformado = Number(v.valorTotalPedido);
    v.valorTotalPedido = Number.isFinite(totalInformado) && Object.prototype.hasOwnProperty.call(v, "valorTotalPedido") ? Math.max(0, totalInformado) : Math.max(0, v.valorVenda + v.valorFrete);
    v.updatedAt = Number(v.updatedAt || 0);
  });

  dados.listaEspera.forEach((item, idx) => {
    if(!item.id) item.id = `espera_${idx}`;
    item.clienteId = item.clienteId || "";
    item.clienteNome = item.clienteNome || (dados.clientes.find(c => c.id === item.clienteId)?.nomeCompleto || "");
    item.descricao = item.descricao || item.peca || "";
    item.dataPrevista = item.dataPrevista || "";
    item.observacao = item.observacao || item.obs || "";
    item.status = item.status || "aguardando";
    item.updatedAt = Number(item.updatedAt || 0);
  });
  dados.anotacoes.forEach((item, idx) => {
    if(!item.id) item.id = `anotacao_${idx}`;
    item.titulo = item.titulo || "Anotação";
    item.texto = item.texto || item.observacao || "";
    item.dataLembrete = item.dataLembrete || "";
    item.prioridade = item.prioridade || "normal";
    item.concluida = !!item.concluida;
    item.usuarioNome = item.usuarioNome || "";
    item.updatedAt = Number(item.updatedAt || 0);
  });

  dados.administradores.forEach((a, idx) => {
    if(!a.id) a.id = `adm_${normalizarTextoId(a.nome)}_${idx}`;
    a.nome = a.nome || "Usuário";
    a.senha = String(a.senha || "");
    a.tipo = a.tipo || (a.isAdmin === false ? "vendedora" : "admin");
    a.isAdmin = a.tipo !== "vendedora";
    a.forcarTrocaSenha = !!a.forcarTrocaSenha;
    a.updatedAt = Number(a.updatedAt || 0);
  });
  return dados;
}

function salvarBanco(opcoes = {}) {
  db.configs = { ...criarBancoBase().configs, ...(db.configs || {}) };
  db.configs.clientId = db.configs.clientId || getClientIdLocal();
  if(opcoes.marcarLocal !== false) {
    db.configs.ultimaMudancaLocal = agoraServidor();
    localMutationVersion += 1;
  }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); }
  catch(e) { alert("Não foi possível salvar. As fotos podem estar grandes demais para o armazenamento local deste navegador."); throw e; }
  if(opcoes.sincronizar !== false) agendarSincronizacao();
}

function marcarRegistroPendente(registro) {
  if(!registro) return registro;
  const agora = agoraServidor();
  registro.updatedAt = agora;
  registro._clientDirty = true;
  registro._clientChangedAt = agora;
  registro._clientId = getClientIdLocal();
  registro._clientUser = getUsuarioAuditoria();
  return registro;
}

function tocarRegistro(registro) { return marcarRegistroPendente(registro); }
function registrarMovimentoEstoque(joia, delta) {
  const valor = Number(delta || 0);
  if(!joia || !Number.isFinite(valor) || valor === 0) return;
  joia._inventoryDelta = Number(joia._inventoryDelta || 0) + valor;
}

function registrarExclusao(tipo, id) {
  if(!id) return;
  db._deleted = db._deleted || criarBancoBase()._deleted;
  db._deleted[tipo] = db._deleted[tipo] || {};
  const agora = agoraServidor();
  db._deleted[tipo][id] = { id, tipo, deletedAt: agora, _clientDirty: true, _clientChangedAt: agora, _clientId: getClientIdLocal(), usuario: getUsuarioAuditoria() };
}

function filtrarAuditoriaRecente(lista, agora = agoraServidor()) {
  const limite = agora - AUDITORIA_RETENCAO_DIAS * 24 * 60 * 60 * 1000;
  return (Array.isArray(lista) ? lista : [])
    .filter(item => item && (item._clientDirty || !item.createdAt || Number(item.createdAt) >= limite))
    .sort((a,b) => Number(b.createdAt || b._clientChangedAt || 0) - Number(a.createdAt || a._clientChangedAt || 0))
    .slice(0, 500);
}

function registrarAuditoria(acao, detalhes = "") {
  db.auditoria = Array.isArray(db.auditoria) ? db.auditoria : [];
  const agora = agoraServidor();
  db.auditoria.push({ id: gerarIdLocal("audit"), acao, detalhes, usuario: getUsuarioAuditoria(), createdAt: agora, _clientDirty: true, _clientChangedAt: agora, _clientId: getClientIdLocal() });
  db.auditoria = filtrarAuditoriaRecente(db.auditoria, agora);
}

function getPerfisAdminDisponiveis() {
  const perfis = (db.administradores || []).filter(a => a.nome && a.senha).map(a => {
    const tipo = a.tipo || (a.isAdmin === false ? "vendedora" : "admin");
    return { id: a.id, nome: a.nome, senha: String(a.senha), tipo, isAdmin: tipo !== "vendedora", forcarTrocaSenha: !!a.forcarTrocaSenha };
  });

  if(perfis.length === 0) perfis.push({ id: "admin_padrao", nome: "Administrador", senha: String(db.configs.senhaAdmin || "1999"), tipo: "admin", isAdmin: true, forcarTrocaSenha: false });
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
  adminLogado = { id: perfil.id, nome: perfil.nome, tipo: perfil.tipo || (perfil.isAdmin === false ? "vendedora" : "admin"), isAdmin: perfil.isAdmin !== false, forcarTrocaSenha: !!perfil.forcarTrocaSenha };
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
  const tipo = qs("perfilAtualTipo");
  if(tipo) tipo.innerText = adminLogado ? (ehVendedora() ? "Vendedora" : "Administrador") : "Não conectado";
  atualizarPermissoesPerfil();
  if(ehVendedora()) ["modalPainelResultados","modalAvancado","modalConfiguracoes","modalTemaVisual","modalAuditoria"].forEach(id => { const el = qs(id); if(el) el.style.display = "none"; });
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
    registro = { id: gerarIdLocal("adm"), nome: "Administrador", senha: nova, tipo: "admin", isAdmin: true, forcarTrocaSenha: false };
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

function selecionarFotoCapa(indice) {
  capaFotoAtual = (Number(indice) + CAPA_FOTOS.length) % CAPA_FOTOS.length;
  renderCapaHome();
}
function renderCapaHome() {
  const box = qs("homeCover");
  if(!box || !CAPA_FOTOS.length) return;
  const foto = CAPA_FOTOS[capaFotoAtual % CAPA_FOTOS.length];
  const nomeLoja = db.loja?.nome || "Nalva Joias";
  box.innerHTML = `
    <div class="home-cover-main">
      <img src="${escapeHTML(foto.src)}" alt="${escapeHTML(foto.titulo)}" loading="eager">
      <div class="home-cover-shade"></div>
      <div class="home-cover-copy"><span>${escapeHTML(nomeLoja)} · Ouro 18K</span><strong>${escapeHTML(foto.titulo)}</strong><small>${escapeHTML(foto.categoria)} · peças escolhidas para você</small></div>
      <div class="home-cover-dots">${CAPA_FOTOS.map((_, i) => `<button type="button" aria-label="Foto ${i + 1}" class="${i === capaFotoAtual ? "active" : ""}" onclick="selecionarFotoCapa(${i})"></button>`).join("")}</div>
    </div>
    <div class="home-cover-thumbs">${CAPA_FOTOS.map((item, i) => `<button type="button" class="home-cover-thumb ${i === capaFotoAtual ? "active" : ""}" onclick="selecionarFotoCapa(${i})"><img src="${escapeHTML(item.src)}" alt="${escapeHTML(item.titulo)}" loading="lazy"><span>${escapeHTML(item.categoria)}</span></button>`).join("")}</div>`;
  if(!capaTimer) capaTimer = setInterval(() => { if(document.visibilityState !== "hidden") selecionarFotoCapa(capaFotoAtual + 1); }, 7000);
}

function atualizarCustoVisualJoia() {
  const form = {
    pesoOuro: parseNumeroFlexivel(qs("joiaPeso")?.value),
    gramasCusto: parseNumeroFlexivel(qs("joiaPeso")?.value),
    indiceCusto: parseNumeroFlexivel(qs("joiaIndiceCusto")?.value),
    fatorDia: parseNumeroFlexivel(qs("joiaFatorDia")?.value),
    incidenciaImposto: parseNumeroFlexivel(qs("joiaImposto")?.value)
  };
  const custo = calcularCustoJoia(form);
  if(qs("joiaCustoBase")) qs("joiaCustoBase").innerText = formatMoeda(custo.custoBase);
  if(qs("joiaValorImposto")) qs("joiaValorImposto").innerText = formatMoeda(custo.valorImposto);
  if(qs("joiaCustoCalculado")) qs("joiaCustoCalculado").innerText = formatMoeda(custo.total);
  const status = qs("joiaStatusPagamento")?.value || "aberto";
  const joiaAtual = getJoia(qs("joiaId")?.value) || {};
  const fixo = status === "pago" ? (parseNumeroFlexivel(joiaAtual.custoFixo) || custo.total) : 0;
  if(qs("joiaCustoFixo")) qs("joiaCustoFixo").innerText = fixo > 0 ? formatMoeda(fixo) : "Será fixado quando for pago";
  if(qs("joiaCompra")) qs("joiaCompra").value = formatMoedaSem(fixo || custo.total);
  if(qs("joiaCustoFixoHint")) qs("joiaCustoFixoHint").innerText = status === "pago" ? "Este valor fica congelado para o cálculo do lucro." : "Enquanto estiver em aberto, o custo é apenas uma estimativa e pode mudar com o fator do dia.";
}

function calcularResumo(mesRef = getMesAtualSTR()) {
  const joias = db.joias || [];
  const getQtd = (j) => Math.max(0, Math.floor(Number(j.quantidadeEstoque || 0)));
  const estoque = joias.filter(j => j.status !== "vendido" && getQtd(j) > 0);
  const disponiveis = joias.filter(j => j.status === "disponível" && getQtd(j) > 0);
  const reservadas = joias.filter(j => j.status === "reservado" && getQtd(j) > 0);
  const vendidasJoias = joias.filter(j => j.status === "vendido" || getQtd(j) === 0);
  const estoqueQtd = estoque.reduce((s,j) => s + getQtd(j), 0);
  const disponiveisQtd = disponiveis.reduce((s,j) => s + getQtd(j), 0);
  const reservadasQtd = reservadas.reduce((s,j) => s + getQtd(j), 0);
  const custoEstoque = estoque.reduce((s,j) => s + getCustoAtualJoia(j) * getQtd(j), 0);
  const vendaEstoque = estoque.reduce((s,j) => s + Number(j.precoVenda || 0) * getQtd(j), 0);
  const pesoEstoque = estoque.reduce((s,j) => s + Number(j.pesoOuro || 0) * getQtd(j), 0);
  const vendas = db.vendas || [];
  const receitaVendida = vendas.reduce((s,v) => s + getValorTotalPedido(v), 0);
  const qtdVendidaTotal = vendas.reduce((s,v) => s + Math.max(1, Number(v.quantidade || 1)), 0);
  const vendasMes = vendas.filter(v => String(v.data || "").slice(0,7) === mesRef);
  const receitaMes = vendasMes.reduce((s,v) => s + getValorTotalPedido(v), 0);
  const qtdVendidaMes = vendasMes.reduce((s,v) => s + Math.max(1, Number(v.quantidade || 1)), 0);
  const custoVendidoMes = vendasMes.reduce((s,v) => s + getCustoVenda(v) * Math.max(1, Number(v.quantidade || 1)), 0);
  const pesoVendidoMes = vendasMes.reduce((s,v) => { const j = getJoia(v.joiaId); return s + Number(j?.pesoOuro || 0) * Math.max(1, Number(v.quantidade || 1)); }, 0);
  const ticketMedioMes = vendasMes.length ? receitaMes / vendasMes.length : 0;
  const margemRealMes = receitaMes - custoVendidoMes;
  const mesAnterior = deslocarMes(mesRef, -1);
  const vendasMesAnterior = vendas.filter(v => String(v.data || "").slice(0,7) === mesAnterior);
  const receitaMesAnterior = vendasMesAnterior.reduce((s,v) => s + getValorTotalPedido(v), 0);
  const variacaoMes = receitaMesAnterior ? ((receitaMes - receitaMesAnterior) / receitaMesAnterior) * 100 : (receitaMes ? 100 : 0);
  return { total: joias.length, totalUnidades: estoqueQtd + qtdVendidaTotal, estoque: estoqueQtd, estoqueItens: estoque.length, disponiveis: disponiveisQtd, reservadas: reservadasQtd, vendidas: qtdVendidaTotal, vendidasJoias: vendidasJoias.length, custoEstoque, vendaEstoque, margemPotencial: vendaEstoque - custoEstoque, pesoEstoque, receitaVendida, vendasMesQtd: vendasMes.length, qtdVendidaMes, vendasMes, receitaMes, custoVendidoMes, pesoVendidoMes, ticketMedioMes, margemRealMes, mesRef, mesAnterior, receitaMesAnterior, variacaoMes };
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
          <div class="product-meta">Ref. ${escapeHTML(j.referencia || "-")} · ${escapeHTML(cat.nome)}<br>${formatDecimal(j.pesoOuro,3)} g de ouro · estoque ${Math.max(0, Number(j.quantidadeEstoque || 0))}${cliente ? ` · ${escapeHTML(cliente.nomeCompleto)}` : ""}</div>
          <div class="product-price"><strong>${formatMoeda(j.precoVenda)}</strong><small>${formatDecimal(j.pesoOuro,3)} g</small></div>
        </div>
      </article>`;
  }).join("");
}

function renderTudo(scrollTop = false) {
  aplicarTema();
  renderCabecalho();
  atualizarPerfilAdminUI();
  renderCapaHome();
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
  if(qs("joiaCliente")) preencherSelectClientes("joiaCliente", "", true);
  fotoJoiaTemp = "";
  qs("joiaId").value = id || "";
  limparInputsFotoJoia();
  if(id) {
    const j = getJoia(id); if(!j) return;
    qs("tituloJoiaForm").innerText = "Editar joia";
    qs("joiaReferencia").value = j.referencia || "";
    qs("joiaCategoria").value = j.categoria || "aneis";
    qs("joiaDescricao").value = j.descricao || "";
    qs("joiaPeso").value = j.pesoOuro ? formatDecimal(j.pesoOuro,3) : "";
    qs("joiaIndiceCusto").value = j.indiceCusto ? formatMoedaSem(j.indiceCusto) : "";
    qs("joiaFatorDia").value = j.fatorDia ? formatDecimal(j.fatorDia, 6) : "";
    qs("joiaImposto").value = j.incidenciaImposto ? formatDecimal(j.incidenciaImposto, 2) : "";
    qs("joiaStatusPagamento").value = j.statusPagamento || (j.custoFixo || j.precoCompra ? "pago" : "aberto");
    qs("joiaDataPagamento").value = j.dataPagamento || "";
    qs("joiaCompra").value = j.precoCompra ? formatMoedaSem(j.precoCompra) : "";
    qs("joiaVenda").value = j.precoVenda ? formatMoedaSem(j.precoVenda) : "";
    qs("joiaQuantidade").value = Math.max(0, Number(j.quantidadeEstoque || 0));
    qs("joiaDataEntrada").value = j.dataEntrada || j.dataCadastro || getHojeSTR();
    qs("joiaStatus").value = j.status || "disponível";
    if(qs("joiaCliente")) preencherSelectClientes("joiaCliente", j.clienteId || "", true);
    qs("joiaObs").value = j.obs || "";
    fotoJoiaTemp = j.foto || "";
  } else {
    qs("tituloJoiaForm").innerText = "Cadastrar joia";
    qs("joiaReferencia").value = "";
    qs("joiaCategoria").value = estado.categoria !== "todos" ? estado.categoria : "aneis";
    qs("joiaDescricao").value = "";
    qs("joiaPeso").value = "";
    qs("joiaIndiceCusto").value = "";
    qs("joiaFatorDia").value = "";
    qs("joiaImposto").value = "";
    qs("joiaStatusPagamento").value = "aberto";
    qs("joiaDataPagamento").value = "";
    qs("joiaCompra").value = "";
    qs("joiaVenda").value = "";
    qs("joiaQuantidade").value = "1";
    qs("joiaDataEntrada").value = getHojeSTR();
    qs("joiaStatus").value = "disponível";
    if(qs("joiaCliente")) qs("joiaCliente").value = "";
    qs("joiaObs").value = "";
  }
  atualizarPreviewFotoJoia();
  atualizarCustoVisualJoia();
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
  finally {
    setLoading(false);
    // Permite escolher novamente o mesmo arquivo ou alternar entre câmera e galeria.
    if(event.target) event.target.value = "";
  }
}
function limparInputsFotoJoia() {
  ["inputFotoJoiaCamera", "inputFotoJoiaGaleria"].forEach(id => { if(qs(id)) qs(id).value = ""; });
}
function removerFotoJoia() { fotoJoiaTemp = ""; limparInputsFotoJoia(); atualizarPreviewFotoJoia(); }

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
  let status = qs("joiaStatus").value;
  let quantidadeEstoque = Math.max(0, Math.floor(Number(qs("joiaQuantidade").value || 0)));
  if(status === "vendido") quantidadeEstoque = 0;
  if(quantidadeEstoque <= 0) status = "vendido";
  let joia = id ? getJoia(id) : null;
  const nova = !joia;
  if(!joia) { joia = { id: gerarIdLocal("joia"), dataCadastro: getHojeSTR() }; db.joias.push(joia); }
  const quantidadeAnterior = Math.max(0, Math.floor(Number(joia.quantidadeEstoque || 0)));
  const precoCompraAnterior = Number(joia.precoCompra || 0);
  const custoFormula = calcularCustoJoia({
    pesoOuro: parseNumeroFlexivel(qs("joiaPeso").value),
    gramasCusto: parseNumeroFlexivel(qs("joiaPeso").value),
    indiceCusto: parseNumeroFlexivel(qs("joiaIndiceCusto")?.value),
    fatorDia: parseNumeroFlexivel(qs("joiaFatorDia")?.value),
    incidenciaImposto: parseNumeroFlexivel(qs("joiaImposto")?.value)
  });
  const statusPagamento = qs("joiaStatusPagamento")?.value || "aberto";
  const custoFixoAnterior = parseNumeroFlexivel(joia.custoFixo);
  const estavaPago = joia.statusPagamento === "pago" && custoFixoAnterior > 0;
  const custoFixo = statusPagamento === "pago" ? (estavaPago ? custoFixoAnterior : (custoFormula.total || precoCompraAnterior)) : custoFixoAnterior;
  const dataPagamento = statusPagamento === "pago" ? (qs("joiaDataPagamento")?.value || joia.dataPagamento || getHojeSTR()) : (joia.dataPagamento || "");
  const custoAtual = custoFormula.total || custoFixo || precoCompraAnterior;
  Object.assign(joia, {
    referencia,
    categoria,
    descricao: qs("joiaDescricao").value.trim(),
    pesoOuro: parseDecimal(qs("joiaPeso").value),
    // O campo de custo fica oculto para a vendedora e nunca pode ser zerado
    // por uma edição feita nesse perfil.
    precoCompra: ehVendedora() ? precoCompraAnterior : (statusPagamento === "pago" ? custoFixo : custoAtual),
    gramasCusto: custoFormula.gramas,
    indiceCusto: custoFormula.indice,
    fatorDia: custoFormula.fatorDia,
    incidenciaImposto: custoFormula.incidenciaImposto,
    custoBase: custoFormula.custoBase,
    custoCalculado: custoFormula.total,
    custoFixo,
    statusPagamento,
    dataPagamento,
    custoFixoData: statusPagamento === "pago" ? dataPagamento : (joia.custoFixoData || ""),
    precoVenda: parseMoeda(qs("joiaVenda").value),
    quantidadeEstoque,
    quantidadeInicial: Math.max(Number(joia.quantidadeInicial || 0), quantidadeEstoque),
    dataEntrada: qs("joiaDataEntrada").value || getHojeSTR(),
    status,
    obs: qs("joiaObs").value.trim(),
    foto: fotoJoiaTemp || ""
  });
  registrarMovimentoEstoque(joia, quantidadeEstoque - quantidadeAnterior);
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
  const custoAtual = getCustoAtualJoia(j);
  const lucro = Number(j.precoVenda || 0) - custoAtual;
  const vendas = (db.vendas || []).filter(v => v.joiaId === j.id).sort((a,b) => String(b.data).localeCompare(String(a.data)));
  const blocoFinanceiroJoia = ehAdministrador() ? `
       <div class="detail-box"><small>Custo ${j.statusPagamento === "pago" ? "fixo" : "estimado"}</small><strong>${formatMoeda(custoAtual)}</strong><small>${j.statusPagamento === "pago" ? `pago em ${escapeHTML(formatDataBR(j.dataPagamento) || "-")}` : "em aberto"}</small></div>
       <div class="detail-box"><small>Margem un.</small><strong>${formatMoeda(lucro)}</strong></div>` : "";
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
      <div class="detail-box"><small>Estoque</small><strong>${Math.max(0, Number(j.quantidadeEstoque || 0))}</strong></div>
      <div class="detail-box"><small>Peso ouro</small><strong>${formatDecimal(j.pesoOuro,3)} g</strong></div>
       <div class="detail-box"><small>Venda</small><strong>${formatMoeda(j.precoVenda)}</strong></div>
       ${blocoFinanceiroJoia}
      <div class="detail-box"><small>Entrada</small><strong>${formatDataBR(j.dataEntrada || j.dataCadastro)}</strong></div>
      <div class="detail-box"><small>Cadastro</small><strong>${formatDataBR(j.dataCadastro)}</strong></div>
      <div class="detail-box"><small>Atualizado</small><strong>${formatDateTime(j.updatedAt)}</strong></div>
    </div>
    ${vendas.length ? `<div class="section-title">Histórico de venda deste item</div>${vendas.map(v => `<div class="sale-card"><strong>${formatDataBR(v.data)} · ${formatMoeda(getValorTotalPedido(v))}</strong><small>${Math.max(1, Number(v.quantidade || 1))} un. · ${escapeHTML(getCliente(v.clienteId)?.nomeCompleto || "Cliente não localizado")} · ${escapeHTML(getFormaPagamentoLabel(v.formaPagamento))}${getValorFrete(v) ? ` · frete ${formatMoeda(getValorFrete(v))}` : ""}</small><p>${escapeHTML(v.obs || "")}</p></div>`).join("")}` : `<div class="section-title">Histórico de venda deste item</div><p class="hint">Nenhuma venda registrada para este item.</p>`}
    <div class="detail-actions">
      <button class="btn-outline" onclick="fecharModal('modalJoiaDetalhe'); abrirFormularioJoia('${escapeHTML(j.id)}')">Editar</button>
      <button class="btn-outline" onclick="duplicarJoia('${escapeHTML(j.id)}')">Duplicar</button>
      <button class="btn-outline" onclick="abrirCompartilharJoia('${escapeHTML(j.id)}')">Enviar WhatsApp</button>
      ${Math.max(0, Number(j.quantidadeEstoque || 0)) > 0 ? `<button class="btn-action" onclick="abrirVenda('${escapeHTML(j.id)}')">Registrar venda</button>` : `<button class="btn-action" onclick="voltarJoiaEstoque('${escapeHTML(j.id)}')">Voltar ao estoque</button>`}
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
  setLoading(true, "Gerando card da joia...");
  try {
    const blob = await gerarCartaoJoiaBlob(alvo.j);
    const file = new File([blob], `${normalizarTextoId(alvo.j.referencia || "joia")}.jpg`, { type: "image/jpeg" });
    await copiarTextoCompartilhamento(alvo.texto);
    if(alvo.tel) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = file.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1200);
      alert("O card da joia foi gerado e o texto foi copiado. Vou abrir a conversa do número informado. Pelo navegador, o WhatsApp não permite anexar imagem automaticamente para um número específico. Anexe o card baixado nessa conversa.");
      window.open(alvo.url, "_blank");
      return;
    }
    if(navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
      await navigator.share({ files: [file], text: alvo.texto, title: alvo.j.descricao || alvo.j.referencia || "Joia" });
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = file.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1200);
      window.open(alvo.url, "_blank");
    }
  } finally { setLoading(false); }
}



function abrirFotoGrande(id) { const j = getJoia(id); if(j && j.foto) { qs("fotoGrande").src = j.foto; abrirModal("modalFoto"); } }

function duplicarJoia(id) {
  const j = getJoia(id); if(!j) return;
  const copia = { ...j, id: gerarIdLocal("joia"), referencia: `${j.referencia}-CÓPIA`, status: "disponível", clienteId: "", dataVenda: "", dataCadastro: getHojeSTR(), dataEntrada: getHojeSTR(), quantidadeEstoque: Math.max(1, Number(j.quantidadeEstoque || 1)), quantidadeInicial: Math.max(1, Number(j.quantidadeEstoque || 1)) };
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

function getResumoCliente(clienteId) {
  const vendas = (db.vendas || []).filter(v => v.clienteId === clienteId);
  return {
    vendas: vendas.length,
    unidades: vendas.reduce((s,v) => s + Math.max(1, Number(v.quantidade || 1)), 0),
    total: vendas.reduce((s,v) => s + getValorTotalPedido(v), 0),
    ultima: vendas.map(v => String(v.data || "")).sort().pop() || ""
  };
}
function setFiltroClientes(filtro) {
  filtroClientes = filtro || "todos";
  qsa("[data-filtro-cliente]").forEach(btn => btn.classList.toggle("active", btn.dataset.filtroCliente === filtroClientes));
  renderClientes();
}
function abrirClientes() { preencherUFSelect("clienteUF", "PB"); renderClientes(); abrirModal("modalClientes"); }
function vendaPertenceAoPerfil(venda, perfil = adminLogado) {
  if(!perfil || ehAdministrador(perfil)) return true;
  const nomePerfil = String(perfil.nome || "").trim().toLowerCase();
  return (venda.vendedorId && venda.vendedorId === perfil.id) || (!venda.vendedorId && nomePerfil && String(venda.vendedorNome || "").trim().toLowerCase() === nomePerfil);
}
function abrirPedidosClientes() {
  if(!adminLogado) return abrirLoginAdmin(false);
  const mes = qs("mesPedidosClientes");
  if(mes && !mes.value) mes.value = getMesAtualSTR();
  renderPedidosClientes();
  abrirModal("modalPedidosClientes");
}
function renderPedidosClientes() {
  const busca = String(qs("buscaPedidoCliente")?.value || "").trim().toLowerCase();
  const mes = qs("mesPedidosClientes")?.value || "";
  let lista = [...(db.vendas || [])].filter(v => vendaPertenceAoPerfil(v));
  if(mes) lista = lista.filter(v => String(v.data || "").slice(0,7) === mes);
  if(busca) lista = lista.filter(v => [v.vendedorNome, getCliente(v.clienteId)?.nomeCompleto, getJoia(v.joiaId)?.referencia, getJoia(v.joiaId)?.descricao].join(" ").toLowerCase().includes(busca));
  lista.sort((a,b) => String(b.data || "").localeCompare(String(a.data || "")) || String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  qs("listaPedidosClientes").innerHTML = lista.length ? lista.map(v => {
    const cliente = getCliente(v.clienteId);
    const joia = getJoia(v.joiaId);
    const endereco = cliente ? enderecoClienteParaExibicao(cliente) : "Endereço não localizado";
    const rastreio = v.codigoRastreio ? ` · rastreio ${escapeHTML(v.codigoRastreio)}` : "";
    return `<div class="order-card"><div><strong>${escapeHTML(cliente?.nomeCompleto || "Cliente não localizado")}</strong><small>${escapeHTML(joia?.referencia || "Joia removida")} · ${Math.max(1, Number(v.quantidade || 1))} un. · ${formatMoeda(getValorTotalPedido(v))}</small><small>${escapeHTML(endereco)}</small><small>${escapeHTML(getFormaPagamentoLabel(v.formaPagamento))} · ${escapeHTML(getModalidadeEnvioLabel(v.modalidadeEnvio))} · ${escapeHTML(getStatusPedidoLabel(v.statusPedido))}${rastreio}${v.vendedorNome ? ` · ${escapeHTML(v.vendedorNome)}` : ""}</small></div><div class="order-actions"><button class="btn-outline small" onclick="gerarPDFPedido('${escapeHTML(v.id)}')">PDF</button><button class="btn-outline small" onclick="enviarPedidoEmail('${escapeHTML(v.id)}')">E-mail</button><button class="btn-outline small" onclick="abrirRastreioPedido('${escapeHTML(v.id)}')">${v.codigoRastreio ? "Atualizar rastreio" : "Adicionar rastreio"}</button></div></div>`;
  }).join("") : `<div class="empty-state" style="height:180px"><div>🧾</div><strong>Nenhum pedido encontrado</strong><p>Registre uma venda para gerar o pedido.</p></div>`;
}

function montarMensagemPedidoEmail(venda) {
  const cliente = getCliente(venda?.clienteId) || {};
  const joia = getJoia(venda?.joiaId) || {};
  return `Olá${cliente.nomeCompleto ? `, ${cliente.nomeCompleto}` : ""}!\n\nObrigada por essa venda, você acaba de adquirir um produto em ouro 18K, logo mais te enviamos o código de rastreio para acompanhar o seu pedido.\n\nPedido: ${venda?.pedidoId || venda?.id || "-"}\nPeça: ${joia.referencia || joia.descricao || "Joia"}\nValor total: ${formatMoeda(getValorTotalPedido(venda))}\nModalidade de envio: ${getModalidadeEnvioLabel(venda?.modalidadeEnvio)}\n\nCom carinho,\n${db.loja?.nome || "JoiasPro"}`;
}
function montarMensagemRastreio(venda) {
  const cliente = getCliente(venda?.clienteId) || {};
  const codigo = String(venda?.codigoRastreio || "").toUpperCase();
  return `Olá${cliente.nomeCompleto ? `, ${cliente.nomeCompleto}` : ""}! Seu pedido ${venda?.pedidoId || ""} foi enviado.\n\nCódigo de rastreio: ${codigo}\nAcompanhe pelos Correios: https://rastreamento.correios.com.br/app/index.php?objetop=${encodeURIComponent(codigo)}\n\n${db.loja?.nome || "JoiasPro"}`;
}
function abrirLinkExterno(url) {
  if(!url) return false;
  try {
    const janela = window.open(url, "_blank", "noopener,noreferrer");
    if(janela) return true;
  } catch(e) {}
  try { window.location.href = url; return true; } catch(e) { return false; }
}
async function enviarPedidoEmail(vendaId) {
  const venda = (db.vendas || []).find(v => v.id === vendaId || v.pedidoId === vendaId);
  if(!venda) return false;
  const cliente = getCliente(venda.clienteId) || {};
  if(!cliente.email) return alert("Cadastre o e-mail do cliente antes de enviar o pedido.");
  const assunto = `Pedido ${venda.pedidoId || venda.id} · ${db.loja?.nome || "JoiasPro"}`;
  const corpo = montarMensagemPedidoEmail(venda);
  try {
    const bytes = criarBytesPDFPedido(venda, { loja: db.loja });
    if(typeof File !== "undefined" && navigator.share && navigator.canShare) {
      const arquivo = new File([bytes], `pedido_${normalizarTextoId(cliente.nomeCompleto || "cliente")}_${venda.data || getHojeSTR()}.pdf`, { type: "application/pdf" });
      if(navigator.canShare({ files: [arquivo] })) {
        await navigator.share({ title: assunto, text: corpo, files: [arquivo] });
        return true;
      }
    }
  } catch(e) {
    if(e && e.name === "AbortError") return false;
  }
  gerarPDFPedido(venda.id);
  const mailto = `mailto:${encodeURIComponent(cliente.email)}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(`${corpo}\n\nO PDF do pedido foi baixado pelo aplicativo para ser anexado nesta mensagem.`)}`;
  abrirLinkExterno(mailto);
  return true;
}
function abrirRastreioPedido(vendaId) {
  const venda = (db.vendas || []).find(v => v.id === vendaId || v.pedidoId === vendaId);
  if(!venda) return false;
  const cliente = getCliente(venda.clienteId) || {};
  qs("rastreioVendaId").value = venda.id;
  qs("rastreioCodigo").value = venda.codigoRastreio || "";
  qs("rastreioPedidoResumo").innerText = `${cliente.nomeCompleto || "Cliente"}${cliente.email ? ` · ${cliente.email}` : ""}${cliente.telefone ? ` · ${cliente.telefone}` : ""}`;
  abrirModal("modalRastreioPedido");
  setTimeout(() => qs("rastreioCodigo")?.focus(), 80);
  return true;
}
function salvarRastreioPedido() {
  const venda = (db.vendas || []).find(v => v.id === qs("rastreioVendaId")?.value);
  const codigo = String(qs("rastreioCodigo")?.value || "").trim().toUpperCase();
  if(!venda) return;
  if(codigo.length < 6) return alert("Informe um código de rastreio válido.");
  venda.codigoRastreio = codigo;
  venda.dataRastreio = agoraServidor();
  venda.statusPedido = "enviado";
  tocarRegistro(venda);
  registrarAuditoria("Código de rastreio salvo", `${venda.pedidoId || venda.id} · ${codigo}`);
  salvarBanco();
  fecharModal("modalRastreioPedido");
  renderTudo();
  renderPedidosClientes();
  renderAcompanhamento();
  const cliente = getCliente(venda.clienteId) || {};
  const mensagem = montarMensagemRastreio(venda);
  const telefone = normalizarTelefoneWhatsapp(cliente.telefone || "");
  let abriu = false;
  if(telefone) abriu = abrirLinkExterno(`https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`) || abriu;
  if(cliente.email) abriu = abrirLinkExterno(`mailto:${encodeURIComponent(cliente.email)}?subject=${encodeURIComponent(`Rastreio do pedido ${venda.pedidoId || venda.id}`)}&body=${encodeURIComponent(mensagem)}`) || abriu;
  if(!abriu) alert("Código salvo. Cadastre telefone e/ou e-mail do cliente para abrir as mensagens automaticamente.");
}
function renderClientes() {
  const q = (qs("buscaCliente")?.value || "").toLowerCase();
  let lista = [...(db.clientes || [])];
  if(filtroClientes === "vip") lista = lista.filter(c => c.vip);
  const ranking = new Map(lista.map(c => [c.id, getResumoCliente(c.id)]));
  lista.sort((a,b) => filtroClientes === "mais_compram" ? (ranking.get(b.id).total - ranking.get(a.id).total || ranking.get(b.id).unidades - ranking.get(a.id).unidades || String(a.nomeCompleto).localeCompare(String(b.nomeCompleto))) : String(a.nomeCompleto).localeCompare(String(b.nomeCompleto)));
  if(q) lista = lista.filter(c => [c.nomeCompleto, c.cpf, c.email, c.telefone, c.cep, c.rua, c.numero, c.bairro, c.cidade, c.uf, c.complemento, c.pontoReferencia, c.enderecoEntrega, c.observacao].join(" ").toLowerCase().includes(q));
  qs("listaClientes").innerHTML = lista.length ? lista.map(c => `
    <div class="client-card ${c.vip ? "client-vip" : ""}" data-vip="${c.vip ? "true" : "false"}" role="button" tabindex="0" onclick="abrirDetalheCliente('${escapeHTML(c.id)}')" onkeydown="if(event.key==='Enter'||event.key===' ') { event.preventDefault(); abrirDetalheCliente('${escapeHTML(c.id)}'); }">
      <div><strong>${escapeHTML(c.nomeCompleto)}</strong><small>${escapeHTML(c.telefone || "sem telefone")}${c.email ? ` · ${escapeHTML(c.email)}` : ""} · ${escapeHTML([c.cidade,c.uf].filter(Boolean).join(" - "))}</small><small>${c.cpf ? `CPF ${escapeHTML(c.cpf)} · ` : ""}${escapeHTML(enderecoClienteParaExibicao(c))}</small></div>
      <div class="client-actions"><button onclick="event.stopPropagation(); abrirFormularioCliente('${escapeHTML(c.id)}')">Editar</button><button onclick="event.stopPropagation(); excluirCliente('${escapeHTML(c.id)}')">Excluir</button></div>
    </div>`).join("") : `<div class="empty-state" style="height:180px"><div>👥</div><strong>Nenhum cliente</strong></div>`;
  if(lista.length) lista.forEach((c, index) => {
    const resumo = ranking.get(c.id) || getResumoCliente(c.id);
    const card = qs("listaClientes").children[index];
    if(card) {
      const info = card.firstElementChild;
      if(info) info.insertAdjacentHTML("beforeend", `<small class="client-purchase-summary">${resumo.vendas} venda(s) · ${resumo.unidades} un. · ${formatMoeda(resumo.total)}</small>`);
      if(c.vip && info?.firstElementChild) info.firstElementChild.insertAdjacentHTML("afterbegin", '<span class="vip-badge">★ VIP</span> ');
    }
  });
}

async function buscarCepCliente() {
  const cep = String(qs("clienteCEP")?.value || "").replace(/\D/g, "");
  if(cep.length !== 8) return alert("Informe um CEP válido com 8 números.");
  if(cepLookupInProgress) return;
  cepLookupInProgress = true;
  setLoading(true, "Buscando endereço...");
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { cache: "no-store" });
    if(!res.ok) throw new Error("Falha ao consultar CEP");
    const dados = await res.json();
    if(dados.erro) return alert("CEP não encontrado.");
    qs("clienteRua").value = dados.logradouro || "";
    qs("clienteBairro").value = dados.bairro || "";
    qs("clienteCidade").value = dados.localidade || "";
    preencherUFSelect("clienteUF", dados.uf || "PB");
    qs("clienteNumero").focus();
  } catch(e) {
    alert("Não foi possível consultar o CEP agora. Você pode preencher o endereço manualmente.");
  } finally { cepLookupInProgress = false; setLoading(false); }
}

function abrirFormularioCliente(id = "", contexto = "") {
  contextoNovoCliente = contexto || "";
  preencherUFSelect("clienteUF", "PB");
  qs("clienteId").value = id || "";
  if(id) {
    const c = getCliente(id); if(!c) return;
    qs("tituloClienteForm").innerText = "Editar cliente";
    qs("clienteNome").value = c.nomeCompleto || "";
    qs("clienteCPF").value = c.cpf || "";
    qs("clienteTelefone").value = c.telefone || "";
    qs("clienteEmail").value = c.email || "";
    qs("clienteCEP").value = c.cep || "";
    qs("clienteRua").value = c.rua || c.enderecoEntrega || "";
    qs("clienteNumero").value = c.numero || "";
    qs("clienteBairro").value = c.bairro || "";
    qs("clienteCidade").value = c.cidade || "";
    preencherUFSelect("clienteUF", c.uf || "PB");
    qs("clienteComplemento").value = c.complemento || "";
    qs("clientePontoReferencia").value = c.pontoReferencia || "";
  } else {
    qs("tituloClienteForm").innerText = "Cadastrar cliente";
    ["clienteNome","clienteCPF","clienteTelefone","clienteEmail","clienteCEP","clienteRua","clienteNumero","clienteBairro","clienteComplemento","clientePontoReferencia"].forEach(idCampo => { qs(idCampo).value = ""; });
    qs("clienteCidade").value = db.loja?.cidade || "";
    preencherUFSelect("clienteUF", db.loja?.uf || "PB");
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
  Object.assign(c, {
    nomeCompleto: nome,
    cpf: qs("clienteCPF").value.trim(),
    telefone: qs("clienteTelefone").value.trim(),
    email: qs("clienteEmail").value.trim(),
    cep: qs("clienteCEP").value.trim(),
    rua: qs("clienteRua").value.trim(),
    numero: qs("clienteNumero").value.trim(),
    bairro: qs("clienteBairro").value.trim(),
    cidade: qs("clienteCidade").value.trim(),
    uf: qs("clienteUF").value,
    complemento: qs("clienteComplemento").value.trim(),
    pontoReferencia: qs("clientePontoReferencia").value.trim()
  });
  c.enderecoEntrega = montarEnderecoCliente(c);
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

function abrirDetalheCliente(id) {
  const c = getCliente(id); if(!c) return;
  const compras = (db.vendas || []).filter(v => v.clienteId === id).sort((a,b) => String(b.data || "").localeCompare(String(a.data || "")));
  const joiasRelacionadas = (db.joias || []).filter(j => j.clienteId === id);
  const resumoCompras = getResumoCliente(id);
  qs("detalheClienteConteudo").innerHTML = `
    <div class="client-detail-header"><div class="client-avatar">👤</div><div><h2>${escapeHTML(c.nomeCompleto)}</h2><p>${escapeHTML(c.telefone || "Sem telefone")}</p></div></div>
    <div class="client-vip-actions"><span class="vip-badge ${c.vip ? "active" : "muted"}">${c.vip ? "★ Cliente VIP" : "☆ Marcar como VIP"}</span><button class="btn-outline small" onclick="alternarVipCliente('${escapeHTML(c.id)}')">${c.vip ? "Remover VIP" : "Marcar VIP"}</button></div>
    <div class="detail-grid client-detail-grid">
      <div class="detail-box"><small>CPF</small><strong>${escapeHTML(c.cpf || "-")}</strong></div>
      <div class="detail-box"><small>E-mail</small><strong>${escapeHTML(c.email || "-")}</strong></div>
      <div class="detail-box"><small>CEP</small><strong>${escapeHTML(c.cep || "-")}</strong></div>
      <div class="detail-box"><small>Cidade / UF</small><strong>${escapeHTML([c.cidade,c.uf].filter(Boolean).join(" - ") || "-")}</strong></div>
      <div class="detail-box"><small>Cadastro</small><strong>${escapeHTML(formatDataBR(c.dataCadastro) || "-")}</strong></div>
      <div class="detail-box"><small>Compras</small><strong>${resumoCompras.vendas} · ${resumoCompras.unidades} un.</strong></div>
      <div class="detail-box"><small>Total comprado</small><strong>${formatMoeda(resumoCompras.total)}</strong></div>
    </div>
    <div class="client-address-box"><small>Endereço</small><p>${escapeHTML(enderecoClienteParaExibicao(c))}</p></div>
    <div class="form-group client-observation"><label for="clienteDetalheObservacao">Observação</label><textarea id="clienteDetalheObservacao" rows="4" placeholder="Anotações sobre este cliente...">${escapeHTML(c.observacao || "")}</textarea><button class="btn-outline" onclick="salvarObservacaoCliente('${escapeHTML(c.id)}')">Salvar observação</button></div>
    <div class="section-title">Histórico de compras</div>
    ${compras.length ? compras.map(v => { const j = getJoia(v.joiaId); return `<div class="sale-card"><strong>${escapeHTML(formatDataBR(v.data) || "-")} · ${escapeHTML(j?.referencia || "Joia removida")}</strong><small>${Math.max(1, Number(v.quantidade || 1))} un. · ${formatMoeda(getValorTotalPedido(v))} · ${escapeHTML(getFormaPagamentoLabel(v.formaPagamento))}${getValorFrete(v) ? ` · frete ${formatMoeda(getValorFrete(v))}` : ""}${v.vendedorNome ? ` · ${escapeHTML(v.vendedorNome)}` : ""}</small><p>${escapeHTML(v.obs || j?.descricao || "")}</p></div>`; }).join("") : `<p class="hint">Nenhuma compra registrada para este cliente.</p>`}
    ${joiasRelacionadas.length ? `<div class="section-title">Joias reservadas ou vinculadas</div>${joiasRelacionadas.map(j => `<div class="sale-card"><strong>${escapeHTML(j.referencia || "Joia")}</strong><small>${escapeHTML(j.status || "")} · ${formatMoeda(j.precoVenda)}</small></div>`).join("")}` : ""}
    <div class="modal-actions"><button class="btn-cancel" onclick="fecharModal('modalClienteDetalhe')">Fechar</button><button class="btn-action" onclick="fecharModal('modalClienteDetalhe'); abrirFormularioCliente('${escapeHTML(c.id)}')">Editar cliente</button></div>`;
  abrirModal("modalClienteDetalhe");
}

function salvarObservacaoCliente(id) {
  const c = getCliente(id); if(!c) return;
  c.observacao = qs("clienteDetalheObservacao").value.trim();
  tocarRegistro(c);
  registrarAuditoria("Observação de cliente alterada", c.nomeCompleto);
  salvarBanco();
  abrirDetalheCliente(id);
}

function alternarVipCliente(id) {
  const c = getCliente(id); if(!c) return;
  c.vip = !c.vip;
  tocarRegistro(c);
  registrarAuditoria(c.vip ? "Cliente marcado como VIP" : "Cliente retirado do VIP", c.nomeCompleto);
  salvarBanco();
  renderClientes();
  abrirDetalheCliente(id);
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
  qs("vendaQuantidade").value = "1";
  qs("vendaQuantidade").max = Math.max(1, Number(j.quantidadeEstoque || 1));
  qs("vendaValor").value = formatMoedaSem(j.precoVenda);
  qs("vendaForma").value = "";
  if(qs("vendaFrete")) qs("vendaFrete").value = "";
  if(qs("vendaModalidadeEnvio")) qs("vendaModalidadeEnvio").value = "pac";
  if(qs("vendaStatusPedido")) qs("vendaStatusPedido").value = "pronto_para_envio";
  qs("vendaObs").value = "";
  preencherSelectVendedores("");
  atualizarTotalVenda();
  abrirModal("modalVenda");
}

function atualizarTotalVenda() {
  const joia = getJoia(qs("vendaJoiaId")?.value);
  if(!joia) return;
  const qtd = Math.max(1, Math.floor(Number(qs("vendaQuantidade")?.value || 1)));
  const subtotal = Number(joia.precoVenda || 0) * qtd;
  qs("vendaValor").value = formatMoedaSem(subtotal);
  const frete = Math.max(0, parseMoeda(qs("vendaFrete")?.value || ""));
  if(qs("vendaTotalPedido")) qs("vendaTotalPedido").innerText = formatMoeda(subtotal + frete);
}

function salvarVenda() {
  const joia = getJoia(qs("vendaJoiaId").value); if(!joia) return;
  const clienteId = qs("vendaCliente").value;
  if(!clienteId) return alert("Selecione o cliente da venda.");
  const qtdSolicitada = Math.max(1, Math.floor(Number(qs("vendaQuantidade").value || 1)));
  const qtdAtual = Math.max(0, Math.floor(Number(joia.quantidadeEstoque || 0)));
  if(qtdSolicitada > qtdAtual) return alert(`Estoque insuficiente. Disponível: ${qtdAtual}.`);
  const vendedorSelecionado = ehVendedora() ? getVendedorAtual() : getPerfisAdminDisponiveis().find(p => p.id === qs("vendaVendedora")?.value && ehVendedora(p));
  const vendedor = vendedorSelecionado || (ehVendedora() ? getVendedorAtual() : null);
  const subtotal = Math.max(0, parseMoeda(qs("vendaValor").value));
  const valorFrete = Math.max(0, parseMoeda(qs("vendaFrete")?.value || ""));
  const modalidadeEnvio = qs("vendaModalidadeEnvio")?.value || "pac";
  const custoUnitario = getCustoAtualJoia(joia);
  const venda = { id: gerarIdLocal("venda"), pedidoId: gerarIdLocal("pedido"), joiaId: joia.id, clienteId, vendedorId: vendedor?.id || "", vendedorNome: vendedor?.nome || "", data: qs("vendaData").value || getHojeSTR(), quantidade: qtdSolicitada, valorVenda: subtotal, valorFrete, valorTotalPedido: subtotal + valorFrete, custoUnitario, custoTotal: custoUnitario * qtdSolicitada, modalidadeEnvio, formaPagamento: qs("vendaForma").value, statusPedido: qs("vendaStatusPedido")?.value || "pronto_para_envio", codigoRastreio: "", dataRastreio: 0, obs: qs("vendaObs").value.trim() };
  tocarRegistro(venda);
  db.vendas.push(venda);
  joia.quantidadeEstoque = Math.max(0, qtdAtual - qtdSolicitada);
  registrarMovimentoEstoque(joia, -qtdSolicitada);
  joia.status = joia.quantidadeEstoque > 0 ? "disponível" : "vendido";
  joia.clienteId = clienteId;
  joia.dataVenda = venda.data;
  joia.valorVendaReal = venda.valorVenda;
  tocarRegistro(joia);
  registrarAuditoria("Venda registrada", `Ref. ${joia.referencia} · ${formatMoeda(getValorTotalPedido(venda))}`);
  salvarBanco();
  fecharModal("modalVenda");
  fecharModal("modalJoiaDetalhe");
  renderTudo();
  gerarPDFPedido(venda.id);
}

function textoPDFSeguro(valor) {
  const mapa = { "–": "-", "—": "-", "‑": "-", "•": "-", "★": "*", "☆": "*", "…": "...", "“": '"', "”": '"', "’": "'" };
  return String(valor ?? "").normalize("NFC").replace(/[^\x00-\xFF]/g, ch => mapa[ch] || "?");
}
function escaparTextoPDF(valor) { return textoPDFSeguro(valor).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/\r?\n/g, " "); }
function quebrarTextoPedido(valor, limite = 86) {
  const texto = textoPDFSeguro(valor).replace(/\s+/g, " ").trim();
  if(!texto) return [""];
  const palavras = texto.split(" ");
  const linhas = [];
  let atual = "";
  palavras.forEach(palavra => {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if(tentativa.length > limite && atual) { linhas.push(atual); atual = palavra; }
    else atual = tentativa;
  });
  if(atual) linhas.push(atual);
  return linhas;
}
function montarLinhasPedidoPDF(venda) {
  const cliente = getCliente(venda.clienteId) || {};
  const joia = getJoia(venda.joiaId) || {};
  const categoria = getCategoria(joia.categoria);
  const endereco = [
    cliente.cep ? `CEP: ${cliente.cep}` : "",
    cliente.rua ? `${cliente.rua}${cliente.numero ? `, ${cliente.numero}` : ""}` : "",
    cliente.bairro ? `Bairro: ${cliente.bairro}` : "",
    [cliente.cidade, cliente.uf].filter(Boolean).join(" - "),
    cliente.complemento ? `Complemento: ${cliente.complemento}` : "",
    cliente.pontoReferencia ? `Referência: ${cliente.pontoReferencia}` : ""
  ].filter(Boolean);
  const subtotal = Math.max(0, Number(venda.valorVenda || 0));
  const frete = getValorFrete(venda);
  const total = getValorTotalPedido(venda);
  const linhas = [
    "JOIASPRO - PEDIDO PARA ENVIO",
    `Pedido: ${venda.pedidoId || venda.id || "-"}    Data: ${formatDataBR(venda.data) || formatDataBR(getHojeSTR())}`,
    "",
    "CLIENTE",
    cliente.nomeCompleto || "Cliente não localizado",
    cliente.telefone ? `Telefone: ${cliente.telefone}` : "",
    ...endereco,
    "",
    "DADOS DA PEÇA",
    `Descrição: ${joia.descricao || categoria.nome || "Joia"}`,
    `Referência: ${joia.referencia || "-"}`,
    `Categoria: ${categoria.nome || "-"}`,
    `Quantidade: ${Math.max(1, Number(venda.quantidade || 1))}`,
    venda.vendedorNome ? `Vendedora: ${venda.vendedorNome}` : "",
    "",
    "PAGAMENTO E ENVIO",
    `Subtotal da peça: ${formatMoeda(subtotal)}`,
    `Frete: ${formatMoeda(frete)}`,
    `Valor total: ${formatMoeda(total)}`,
    `Forma de pagamento: ${getFormaPagamentoLabel(venda.formaPagamento)}`,
    `Modalidade de envio: ${getModalidadeEnvioLabel(venda.modalidadeEnvio)}`
  ];
  if(venda.obs) { linhas.push("", "Observação:"); linhas.push(...quebrarTextoPedido(venda.obs)); }
  const saida = [];
  linhas.forEach(linha => { if(!linha) saida.push(""); else saida.push(...quebrarTextoPedido(linha)); });
  return saida;
}
function pdfRgb(cor = "#000000") {
  const hex = String(cor).replace("#", "");
  const r = parseInt(hex.slice(0,2),16) || 0, g = parseInt(hex.slice(2,4),16) || 0, b = parseInt(hex.slice(4,6),16) || 0;
  return `${(r/255).toFixed(3)} ${(g/255).toFixed(3)} ${(b/255).toFixed(3)}`;
}
function pdfRetangulo(x, y, w, h, preenchimento = null, borda = null, espessura = 0.6) {
  const partes = ["q"];
  if(preenchimento) partes.push(`${pdfRgb(preenchimento)} rg`);
  if(borda) partes.push(`${pdfRgb(borda)} RG ${espessura} w`);
  partes.push(`${x} ${y} ${w} ${h} re`, preenchimento && borda ? "B" : preenchimento ? "f" : "S", "Q");
  return partes.join(" ");
}
function pdfTexto(texto, x, y, tamanho = 10, cor = "#241A12", negrito = false) {
  return `${negrito ? "/F2" : "/F1"} ${tamanho} Tf ${pdfRgb(cor)} rg 1 0 0 1 ${x} ${y} Tm (${escaparTextoPDF(texto)}) Tj`;
}
function pdfValor(valor, vazio = "____________________________") { return String(valor || vazio); }
function pdfCortar(valor, limite = 62) { const texto = textoPDFSeguro(valor || ""); return texto.length > limite ? `${texto.slice(0, Math.max(0, limite - 3))}...` : texto; }
function base64ParaBytes(valor) {
  try {
    const binario = atob(valor);
    const bytes = new Uint8Array(binario.length);
    for(let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i) & 255;
    return bytes;
  } catch(e) { return null; }
}
function dimensoesJPEG(bytes) {
  if(!bytes || bytes.length < 10 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null;
  let pos = 2;
  while(pos + 9 < bytes.length) {
    if(bytes[pos] !== 0xFF) { pos += 1; continue; }
    while(bytes[pos] === 0xFF) pos += 1;
    const marcador = bytes[pos++];
    if(marcador === 0xD8 || marcador === 0xD9) continue;
    if(pos + 1 >= bytes.length) break;
    const tamanho = (bytes[pos] << 8) + bytes[pos + 1];
    if([0xC0,0xC1,0xC2,0xC3,0xC5,0xC6,0xC7,0xC9,0xCA,0xCB,0xCD,0xCE,0xCF].includes(marcador) && pos + 7 < bytes.length) return { width: (bytes[pos + 5] << 8) + bytes[pos + 6], height: (bytes[pos + 3] << 8) + bytes[pos + 4] };
    pos += Math.max(2, tamanho);
  }
  return null;
}
function extrairLogoPDF(dataUrl) {
  const match = /^data:image\/(?:jpe?g);base64,(.+)$/i.exec(String(dataUrl || ""));
  if(!match) return null;
  const bytes = base64ParaBytes(match[1]);
  const dimensoes = dimensoesJPEG(bytes);
  return bytes && dimensoes ? { bytes, width: dimensoes.width, height: dimensoes.height } : null;
}
function bytesParaString(bytes) { let texto = ""; for(let i = 0; i < bytes.length; i++) texto += String.fromCharCode(bytes[i]); return texto; }
function montarConteudoFormularioPedidoPDF(venda, loja = {}, temLogo = false) {
  const cliente = getCliente(venda.clienteId) || {};
  const joia = getJoia(venda.joiaId) || {};
  const categoria = getCategoria(joia.categoria);
  const out = [];
  const x = 40, largura = 515;
  out.push(pdfRetangulo(0, 0, 595, 842, "#FBF7F0"));
  out.push(pdfRetangulo(28, 28, 539, 786, "#FFFFFF", "#E4D5C2", 1));
  out.push(pdfRetangulo(28, 758, 539, 56, "#EFE1CF", "#D6B98C", 0.8));
  if(temLogo) {
    const logo = extrairLogoPDF(loja.logo);
    if(logo) {
      const escala = Math.min(54 / logo.width, 48 / logo.height);
      const w = Math.max(1, Math.round(logo.width * escala)), h = Math.max(1, Math.round(logo.height * escala));
      out.push(`q ${w} 0 0 ${h} 43 ${762 + (48 - h) / 2} cm /Im1 Do Q`);
    }
  } else out.push(pdfTexto("◆", 48, 780, 26, "#B8860B", true));
  out.push(pdfTexto(loja.nome || "JoiasPro", 116, 791, 18, "#52320E", true));
  out.push(pdfTexto("FORMULÁRIO DE PEDIDO", 116, 772, 10, "#8A6840", true));
  out.push(pdfTexto([loja.telefone, loja.cidade, loja.uf].filter(Boolean).join(" · "), 365, 781, 8, "#746B60", false));
  let y = 742;
  const secao = titulo => { out.push(pdfRetangulo(x, y, largura, 21, "#DCC7AA", "#D1B58E", 0.5)); out.push(pdfTexto(titulo, x + 8, y + 6, 9, "#52320E", true)); y -= 28; };
  const linha = (campos, altura = 24) => {
    const espaco = 4, colunas = campos.length, colW = (largura - espaco * (colunas - 1)) / colunas;
    campos.forEach((campo, idx) => {
      const cx = x + idx * (colW + espaco), labelW = Math.min(142, Math.max(74, colW * .36));
      out.push(pdfRetangulo(cx, y, labelW, altura, "#F2E9DD", "#DCCDBB", 0.45));
      out.push(pdfRetangulo(cx + labelW, y, colW - labelW, altura, "#FFFFFF", "#DCCDBB", 0.45));
      out.push(pdfTexto(pdfCortar(campo.label, 24), cx + 6, y + altura - 14, campo.label.length > 16 ? 6.2 : 7.2, "#746B60", true));
      const valor = pdfCortar(campo.value ? campo.value : "____________________", 44);
      out.push(pdfTexto(valor, cx + labelW + 6, y + altura - 14, 8.2, "#241A12", false));
    });
    y -= altura;
  };
  secao("DADOS DO CLIENTE");
  linha([{label:"NOME COMPLETO", value:cliente.nomeCompleto}, {label:"CPF", value:cliente.cpf}]);
  linha([{label:"TELEFONE", value:cliente.telefone}, {label:"E-MAIL", value:cliente.email}]);
  linha([{label:"CEP", value:cliente.cep}, {label:"RUA", value:cliente.rua}]);
  linha([{label:"NÚMERO", value:cliente.numero}, {label:"BAIRRO", value:cliente.bairro}]);
  linha([{label:"CIDADE", value:cliente.cidade}, {label:"UF", value:cliente.uf}]);
  linha([{label:"COMPLEMENTO", value:cliente.complemento}, {label:"PONTO DE REFERÊNCIA", value:cliente.pontoReferencia}]);
  secao("DADOS DO PEDIDO");
  linha([{label:"PEDIDO Nº", value:venda.pedidoId || venda.id}, {label:"DATA", value:formatDataBR(venda.data) || getHojeSTR()}]);
  linha([{label:"VENDEDORA", value:venda.vendedorNome}, {label:"STATUS", value:getStatusPedidoLabel(venda.statusPedido)}]);
  linha([{label:"PEÇA / DESCRIÇÃO", value:joia.descricao || categoria.nome}, {label:"REFERÊNCIA", value:joia.referencia}]);
  linha([{label:"CATEGORIA", value:categoria.nome}, {label:"QUANTIDADE", value:Math.max(1, Number(venda.quantidade || 1))}]);
  const obs = pdfCortar(venda.obs || "", 95);
  linha([{label:"OBSERVAÇÃO", value:obs}], 30);
  secao("PAGAMENTO E ENVIO");
  linha([{label:"SUBTOTAL", value:formatMoeda(venda.valorVenda)}, {label:"FRETE", value:formatMoeda(getValorFrete(venda))}]);
  linha([{label:"VALOR TOTAL", value:formatMoeda(getValorTotalPedido(venda))}, {label:"PAGAMENTO", value:getFormaPagamentoLabel(venda.formaPagamento)}]);
  linha([{label:"MODALIDADE", value:getModalidadeEnvioLabel(venda.modalidadeEnvio)}, {label:"RASTREIO", value:venda.codigoRastreio}]);
  out.push(pdfRetangulo(x, 53, largura, 34, "#EFE1CF", "#D6B98C", 0.6));
  out.push(pdfTexto("Obrigada por sua compra! Produto em ouro 18K.", x + 12, 72, 9, "#52320E", true));
  out.push(pdfTexto("Logo mais enviaremos o código de rastreio para acompanhar seu pedido.", x + 12, 59, 8, "#746B60", false));
  return textoPDFSeguro(out.join("\n"));
}
function montarConteudoPDFPedido(linhas, venda = null, loja = {}, temLogo = false) {
  if(venda) return montarConteudoFormularioPedidoPDF(venda, loja, temLogo);
  const out = ["BT", "/F1 11 Tf"];
  let y = 790;
  (linhas || []).forEach((linha, index) => {
    if(index === 0) out.push("/F2 16 Tf");
    else if([3, 9, 16].includes(index)) out.push("/F2 12 Tf");
    if(linha) out.push(`1 0 0 1 50 ${y} Tm (${escaparTextoPDF(linha)}) Tj`);
    y -= linha ? 17 : 10;
  });
  out.push("ET");
  return textoPDFSeguro(out.join("\n"));
}
function criarBytesPDFPedido(linhasOuVenda, opcoes = {}) {
  const venda = Array.isArray(linhasOuVenda) ? (opcoes.venda || null) : linhasOuVenda;
  const linhas = Array.isArray(linhasOuVenda) ? linhasOuVenda : [];
  const loja = opcoes.loja || (typeof db !== "undefined" ? db.loja : {}) || {};
  const logo = venda ? extrairLogoPDF(loja.logo) : null;
  const paginas = venda ? [null] : [];
  const limiteLinhasPagina = 43;
  if(!venda) for(let i = 0; i < linhas.length; i += limiteLinhasPagina) paginas.push(linhas.slice(i, i + limiteLinhasPagina));
  if(!paginas.length) paginas.push([""]);
  const objetos = [];
  objetos[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objetos[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objetos[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  let proximoObjeto = 5;
  if(logo) {
    objetos[5] = `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.bytes.length} >>\nstream\n${bytesParaString(logo.bytes)}\nendstream`;
    proximoObjeto = 6;
  }
  const pageRefs = [];
  paginas.forEach((pagina, idx) => {
    const pageObj = proximoObjeto + idx * 2;
    const contentObj = pageObj + 1;
    pageRefs.push(`${pageObj} 0 R`);
    const recursosImagem = logo ? " /XObject << /Im1 5 0 R >>" : "";
    const conteudo = venda ? montarConteudoPDFPedido(null, venda, loja, !!logo) : montarConteudoPDFPedido(pagina);
    objetos[pageObj] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${recursosImagem} >> /Contents ${contentObj} 0 R >>`;
    objetos[contentObj] = `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`;
  });
  objetos[2] = `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${paginas.length} >>`;
  let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [0];
  for(let i = 1; i < objetos.length; i++) {
    if(!objetos[i]) continue;
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${i === 5 && logo ? objetos[i] : textoPDFSeguro(objetos[i])}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objetos.length}\n0000000000 65535 f \n`;
  for(let i = 1; i < objetos.length; i++) pdf += `${String(offsets[i] || 0).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objetos.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  const bytes = new Uint8Array(pdf.length);
  for(let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 255;
  return bytes;
}
function gerarPDFPedido(vendaId) {
  const venda = (db.vendas || []).find(v => v.id === vendaId || v.pedidoId === vendaId);
  if(!venda) return false;
  try {
    const bytes = criarBytesPDFPedido(venda, { loja: db.loja });
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const cliente = getCliente(venda.clienteId);
    const nome = normalizarTextoId(cliente?.nomeCompleto || "cliente");
    const a = document.createElement("a");
    a.href = url;
    a.download = `pedido_${nome}_${venda.data || getHojeSTR()}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    return true;
  } catch(e) {
    console.error("PDF do pedido falhou", e);
    alert("Não foi possível gerar o PDF deste pedido.");
    return false;
  }
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
  if(Math.max(0, Number(j.quantidadeEstoque || 0)) === 0) { j.quantidadeEstoque = 1; registrarMovimentoEstoque(j, 1); }
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
  if(Math.max(0, Number(j.quantidadeEstoque || 0)) === 0) { j.quantidadeEstoque = 1; registrarMovimentoEstoque(j, 1); }
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
  if(!adminLogado) return abrirLoginAdmin(false);
  if(ehVendedora()) return abrirPainelVendedora();
  const input = qs("painelMes");
  if(input && !input.value) input.value = getMesAtualSTR();
  renderPainelResultados();
  abrirModal("modalPainelResultados");
}
function abrirPainelPerfil() { return ehVendedora() ? abrirPainelVendedora() : abrirPainelResultados(); }
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
    return { mes: m, label: labelMesCurto(m), valor: lista.reduce((s,v) => s + getValorTotalPedido(v), 0), qtd: lista.length };
  });
  const maxMes = Math.max(1, ...vendasPorMes.map(x => x.valor));
  const porCatEstoque = (db.categorias || []).map(cat => {
    const itens = (db.joias || []).filter(j => j.categoria === cat.id && j.status !== "vendido" && Number(j.quantidadeEstoque || 0) > 0);
    const vendidosMes = vendasMesLista.filter(v => getJoia(v.joiaId)?.categoria === cat.id);
    const vendidosTotal = vendas.filter(v => getJoia(v.joiaId)?.categoria === cat.id);
    const qtdEstoque = itens.reduce((s,j) => s + Math.max(0, Number(j.quantidadeEstoque || 0)),0);
    const compra = itens.reduce((s,j) => s + getCustoAtualJoia(j) * Math.max(0, Number(j.quantidadeEstoque || 0)),0);
    const venda = itens.reduce((s,j) => s + Number(j.precoVenda||0) * Math.max(0, Number(j.quantidadeEstoque || 0)),0);
    const receitaMes = vendidosMes.reduce((s,v)=>s + getValorTotalPedido(v),0);
    const custoMes = vendidosMes.reduce((s,v)=>s + getCustoVenda(v) * Math.max(1, Number(v.quantidade||1)),0);
    const qtdVendidosMes = vendidosMes.reduce((s,v)=>s + Math.max(1, Number(v.quantidade||1)),0);
    const qtdVendidosTotal = vendidosTotal.reduce((s,v)=>s + Math.max(1, Number(v.quantidade||1)),0);
    return { cat, qtd: qtdEstoque, vendidosMes: qtdVendidosMes, vendidosTotal: qtdVendidosTotal, peso: itens.reduce((s,j) => s + Number(j.pesoOuro||0) * Math.max(0, Number(j.quantidadeEstoque || 0)),0), compra, venda, receitaMes, custoMes };
  });
  const maxCatVenda = Math.max(1, ...porCatEstoque.map(x => x.venda));
  const maxCatReceitaMes = Math.max(1, ...porCatEstoque.map(x => x.receitaMes));
  const giro = r.totalUnidades ? Math.round((r.vendidas / r.totalUnidades) * 100) : 0;
  const margemPct = r.receitaMes ? ((r.margemRealMes / r.receitaMes) * 100) : 0;
  const variacaoLabel = `${r.variacaoMes >= 0 ? "+" : ""}${formatDecimal(r.variacaoMes,1)}%`;
  const clientesMes = Object.values(vendasMesLista.reduce((acc, v) => {
    const id = v.clienteId || "sem_cliente";
    const cli = getCliente(v.clienteId);
    acc[id] = acc[id] || { nome: cli?.nomeCompleto || "Cliente não localizado", qtd: 0, valor: 0 };
    acc[id].qtd += Math.max(1, Number(v.quantidade || 1)); acc[id].valor += getValorTotalPedido(v);
    return acc;
  }, {})).sort((a,b)=>b.valor-a.valor).slice(0,5);
  const topItensMes = Object.values(vendasMesLista.reduce((acc, v) => {
    const joia = getJoia(v.joiaId);
    const id = v.joiaId || "sem_item";
    acc[id] = acc[id] || { ref: joia?.referencia || "-", nome: joia?.descricao || getCategoria(joia?.categoria).nome || "Item não localizado", qtd: 0, valor: 0 };
    acc[id].qtd += Math.max(1, Number(v.quantidade || 1)); acc[id].valor += getValorTotalPedido(v);
    return acc;
  }, {})).sort((a,b)=> b.qtd - a.qtd || b.valor - a.valor).slice(0,5);
  qs("painelResumo").innerHTML = `
    <div class="report-month-title">Consulta de ${escapeHTML(nomeMesLongo(mesRef))}</div>
    <div class="report-hero report-hero-3">
      <div><small>Vendas do mês</small><strong>${formatMoeda(r.receitaMes)}</strong><em>${r.qtdVendidaMes} un. · ${r.vendasMesQtd} venda(s) · ticket médio ${formatMoeda(r.ticketMedioMes)}</em></div>
      <div><small>Margem do mês</small><strong>${formatMoeda(r.margemRealMes)}</strong><em>${formatDecimal(margemPct,1)}% sobre vendas · custo ${formatMoeda(r.custoVendidoMes)}</em></div>
      <div><small>Valor de venda em estoque</small><strong>${formatMoeda(r.vendaEstoque)}</strong><em>${r.estoque} peças · ${formatDecimal(r.pesoEstoque,3)} g de ouro</em></div>
    </div>
    <div class="report-grid wide">
      <div class="report-card"><small>Unidades vendidas</small><strong>${r.qtdVendidaMes}</strong><em>${formatDecimal(r.pesoVendidoMes,3)} g vendidos no mês</em></div>
      <div class="report-card"><small>Disponíveis</small><strong>${r.disponiveis}</strong><em>prontas para venda</em></div>
      <div class="report-card"><small>Reservadas</small><strong>${r.reservadas}</strong><em>com cliente vinculado</em></div>
      <div class="report-card"><small>Custo em estoque</small><strong>${formatMoeda(r.custoEstoque)}</strong><em>margem pot. ${formatMoeda(r.margemPotencial)}</em></div>
      <div class="report-card"><small>Comparação mês anterior</small><strong>${variacaoLabel}</strong><em>mês anterior ${formatMoeda(r.receitaMesAnterior)}</em></div>
      <div class="report-card"><small>Giro cadastrado</small><strong>${giro}%</strong><em>vendidas / unidades cadastradas</em></div>
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
        ${clientesMes.length ? clientesMes.map(c => `<div class="ranking-row"><span>${escapeHTML(c.nome)}</span><strong>${formatMoeda(c.valor)}</strong><small>${c.qtd} unidade(s)</small></div>`).join("") : `<p class="hint">Sem vendas no mês selecionado.</p>`}
      </div>
      <div class="chart-card">
        <div class="section-title">Itens mais vendidos do mês</div>
        ${topItensMes.length ? topItensMes.map(i => `<div class="ranking-row"><span>${escapeHTML(i.ref)} · ${escapeHTML(i.nome)}</span><strong>${i.qtd} un.</strong><small>${formatMoeda(i.valor)}</small></div>`).join("") : `<p class="hint">Sem vendas no mês selecionado.</p>`}
      </div>
    </div>
    <div class="section-title">Resumo por categoria</div>
    <div class="table-wrap"><table><thead><tr><th>Categoria</th><th>Estoque</th><th>Vend. mês</th><th>Receita mês</th><th>Peso estoque</th><th>Custo est.</th><th>Venda est.</th><th>Margem pot.</th></tr></thead><tbody>
      ${porCatEstoque.map(x => `<tr><td>${escapeHTML(x.cat.icon)} ${escapeHTML(x.cat.nome)}</td><td>${x.qtd}</td><td>${x.vendidosMes}</td><td>${formatMoeda(x.receitaMes)}</td><td>${formatDecimal(x.peso,3)} g</td><td>${formatMoeda(x.compra)}</td><td>${formatMoeda(x.venda)}</td><td>${formatMoeda(x.venda - x.compra)}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="section-title">Vendas de ${escapeHTML(labelMesCurto(mesRef))}</div>
    ${vendasMesLista.map(v => {
      const joia = getJoia(v.joiaId); const cli = getCliente(v.clienteId);
      return `<div class="sale-card"><strong>${formatDataBR(v.data)} · ${formatMoeda(getValorTotalPedido(v))}</strong><small>${escapeHTML(joia?.referencia || "-")} · ${Math.max(1, Number(v.quantidade || 1))} un. · ${escapeHTML(cli?.nomeCompleto || "Cliente não localizado")} · ${escapeHTML(getFormaPagamentoLabel(v.formaPagamento))}${getValorFrete(v) ? ` · frete ${formatMoeda(getValorFrete(v))}` : ""}${v.vendedorNome ? ` · Vendedora: ${escapeHTML(v.vendedorNome)}` : ""}</small><p>${escapeHTML(v.obs || "")}</p></div>`;
    }).join("") || `<p class="hint">Nenhuma venda registrada neste mês.</p>`}
  `;
}

function getVendasDoVendedor(id, mesRef = getMesAtualSTR()) {
  const perfil = getPerfisAdminDisponiveis().find(p => p.id === id) || adminLogado;
  const nome = String(perfil?.nome || "").toLowerCase();
  return (db.vendas || []).filter(v => String(v.data || "").slice(0,7) === mesRef && ((v.vendedorId && v.vendedorId === id) || (!v.vendedorId && nome && String(v.vendedorNome || "").toLowerCase() === nome)));
}
function abrirPainelVendedora() {
  if(!adminLogado) return abrirLoginAdmin(false);
  if(!ehVendedora()) return abrirPainelResultados();
  const input = qs("painelMesVendedora");
  if(input && !input.value) input.value = getMesAtualSTR();
  renderPainelVendedora();
  abrirModal("modalPainelVendedora");
}
function mudarMesPainelVendedora(delta) {
  const input = qs("painelMesVendedora"); if(!input) return;
  input.value = deslocarMes(input.value || getMesAtualSTR(), delta);
  renderPainelVendedora();
}
function renderPainelVendedora() {
  if(!adminLogado) return;
  const mesRef = qs("painelMesVendedora")?.value || getMesAtualSTR();
  const vendas = getVendasDoVendedor(adminLogado.id, mesRef).sort((a,b) => String(b.data).localeCompare(String(a.data)));
  const unidades = vendas.reduce((s,v) => s + Math.max(1, Number(v.quantidade || 1)), 0);
  const receita = vendas.reduce((s,v) => s + getValorTotalPedido(v), 0);
  const clientes = new Set(vendas.map(v => v.clienteId).filter(Boolean)).size;
  qs("painelResumoVendedora").innerHTML = `
    <div class="report-month-title">Minhas vendas · ${escapeHTML(nomeMesLongo(mesRef))}</div>
    <div class="report-hero report-hero-3 seller-report-hero">
      <div><small>Faturamento do mês</small><strong>${formatMoeda(receita)}</strong><em>${vendas.length} venda(s)</em></div>
      <div><small>Peças vendidas</small><strong>${unidades}</strong><em>${clientes} cliente(s)</em></div>
      <div><small>Ticket médio</small><strong>${formatMoeda(vendas.length ? receita / vendas.length : 0)}</strong><em>dados do seu perfil</em></div>
    </div>
    <div class="section-title">Vendas de ${escapeHTML(labelMesCurto(mesRef))}</div>
    ${vendas.map(v => { const j = getJoia(v.joiaId); const c = getCliente(v.clienteId); return `<div class="sale-card"><strong>${formatDataBR(v.data)} · ${formatMoeda(getValorTotalPedido(v))}</strong><small>${escapeHTML(j?.referencia || "-")} · ${Math.max(1, Number(v.quantidade || 1))} un. · ${escapeHTML(c?.nomeCompleto || "Cliente não localizado")}</small><p>${escapeHTML(getStatusPedidoLabel(v.statusPedido))} · ${escapeHTML(getFormaPagamentoLabel(v.formaPagamento))}${getValorFrete(v) ? ` · frete ${formatMoeda(getValorFrete(v))}` : ""}${v.codigoRastreio ? ` · ${escapeHTML(v.codigoRastreio)}` : ""}${v.obs ? ` · ${escapeHTML(v.obs)}` : ""}</p></div>`; }).join("") || `<p class="hint">Nenhuma venda registrada neste mês.</p>`}
  `;
}

function abrirPainelVendasVendedoras() {
  if(!exigirAdministrador()) return;
  const mes = qs("mesVendasVendedoras");
  if(mes && !mes.value) mes.value = getMesAtualSTR();
  const select = qs("filtroVendedoraAdmin");
  if(select) {
    const atual = select.value;
    select.innerHTML = '<option value="">Todas as vendedoras</option>' + getPerfisAdminDisponiveis().filter(p => ehVendedora(p)).map(p => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.nome)}</option>`).join("");
    select.value = atual || "";
  }
  renderPainelVendasVendedoras();
  abrirModal("modalVendasVendedoras");
}
function renderPainelVendasVendedoras() {
  if(!ehAdministrador()) return;
  const mes = qs("mesVendasVendedoras")?.value || getMesAtualSTR();
  const vendedorId = qs("filtroVendedoraAdmin")?.value || "";
  let vendas = (db.vendas || []).filter(v => String(v.data || "").slice(0,7) === mes && (v.vendedorId || v.vendedorNome));
  if(vendedorId) { const perfil = getPerfisAdminDisponiveis().find(p => p.id === vendedorId); vendas = vendas.filter(v => v.vendedorId === vendedorId || (!v.vendedorId && perfil && String(v.vendedorNome || "").trim().toLowerCase() === String(perfil.nome || "").trim().toLowerCase())); }
  vendas.sort((a,b) => String(b.data || "").localeCompare(String(a.data || "")) || String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  const receita = vendas.reduce((s,v) => s + getValorTotalPedido(v), 0);
  const unidades = vendas.reduce((s,v) => s + Math.max(1, Number(v.quantidade || 1)), 0);
  const nomeVendedora = vendedorId ? (getPerfisAdminDisponiveis().find(p => p.id === vendedorId)?.nome || "Vendedora") : "Todas as vendedoras";
  qs("resumoVendasVendedoras").innerHTML = `<div class="report-month-title">${escapeHTML(nomeVendedora)} · ${escapeHTML(nomeMesLongo(mes))}</div><div class="report-hero report-hero-3 seller-report-hero"><div><small>Faturamento</small><strong>${formatMoeda(receita)}</strong><em>${vendas.length} venda(s)</em></div><div><small>Peças vendidas</small><strong>${unidades}</strong><em>no mês selecionado</em></div><div><small>Vendedoras com vendas</small><strong>${new Set(vendas.map(v => v.vendedorId || v.vendedorNome)).size}</strong><em>dados completos do administrador</em></div></div>`;
  qs("listaVendasVendedoras").innerHTML = vendas.length ? vendas.map(v => { const j = getJoia(v.joiaId); const c = getCliente(v.clienteId); return `<div class="sale-card"><strong>${escapeHTML(formatDataBR(v.data))} · ${formatMoeda(getValorTotalPedido(v))}</strong><small>${escapeHTML(v.vendedorNome || "Vendedora não informada")} · ${escapeHTML(j?.referencia || "-")} · ${Math.max(1, Number(v.quantidade || 1))} un. · ${escapeHTML(c?.nomeCompleto || "Cliente não localizado")}</small><p>${escapeHTML(getStatusPedidoLabel(v.statusPedido))} · ${escapeHTML(getFormaPagamentoLabel(v.formaPagamento))}${v.codigoRastreio ? ` · ${escapeHTML(v.codigoRastreio)}` : ""}</p></div>`; }).join("") : `<div class="empty-state" style="height:180px"><div>📈</div><strong>Nenhuma venda encontrada</strong><p>Escolha outro mês ou vendedora.</p></div>`;
}

let abaFinanceiroAtual = "abertos";
function formatarFormulaCusto(joia) {
  const custo = calcularCustoJoia(joia);
  if(!custo.gramas && !custo.indice && !custo.fatorDia) return "Fórmula ainda não preenchida";
  return `${formatDecimal(custo.gramas, 3)} g × ${formatMoeda(custo.indice)} × ${formatDecimal(custo.fatorDia, 6)} + ${formatDecimal(custo.incidenciaImposto, 2)}% imposto`;
}
function abrirPainelFinanceiroCustos(tab = "abertos") {
  if(!exigirAdministrador()) return;
  trocarAbaFinanceiro(tab);
  abrirModal("modalFinanceiroCustos");
}
function trocarAbaFinanceiro(tab = "abertos") {
  abaFinanceiroAtual = ["abertos", "pagos"].includes(tab) ? tab : "abertos";
  qsa("[data-fin-tab]").forEach(btn => btn.classList.toggle("active", btn.dataset.finTab === abaFinanceiroAtual));
  renderPainelFinanceiroCustos();
}
function renderPainelFinanceiroCustos() {
  if(!ehAdministrador()) return;
  const joias = [...(db.joias || [])];
  const abertos = joias.filter(j => j.statusPagamento !== "pago").sort((a,b) => String(a.dataEntrada || "").localeCompare(String(b.dataEntrada || "")));
  const pagos = joias.filter(j => j.statusPagamento === "pago").sort((a,b) => String(b.dataPagamento || "").localeCompare(String(a.dataPagamento || "")));
  const valorAberto = abertos.reduce((s,j) => s + getCustoAtualJoia(j) * getQuantidadeCustoJoia(j), 0);
  const valorFixo = pagos.reduce((s,j) => s + getCustoFixoJoia(j) * getQuantidadeCustoJoia(j), 0);
  if(qs("resumoFinanceiroCustos")) qs("resumoFinanceiroCustos").innerHTML = `<div class="report-hero report-hero-3 finance-hero"><div><small>Em aberto</small><strong>${formatMoeda(valorAberto)}</strong><em>${abertos.length} peça(s) aguardando pagamento</em></div><div><small>Custo fixado</small><strong>${formatMoeda(valorFixo)}</strong><em>${pagos.length} peça(s) pagas</em></div><div><small>Fórmula aplicada</small><strong>g × índice × fator</strong><em>imposto separado no cálculo</em></div></div>`;
  const lista = abaFinanceiroAtual === "abertos" ? abertos : pagos;
  if(qs("listaFinanceiroCustos")) qs("listaFinanceiroCustos").innerHTML = lista.length ? lista.map(j => {
    const qtd = getQuantidadeCustoJoia(j);
    const custo = abaFinanceiroAtual === "abertos" ? getCustoAtualJoia(j) : getCustoFixoJoia(j);
    const botao = abaFinanceiroAtual === "abertos" ? `<button class="btn-action compact" onclick="abrirPagamentoCusto('${escapeHTML(j.id)}')">Marcar como pago</button>` : `<button class="btn-outline compact" onclick="reabrirCustoJoia('${escapeHTML(j.id)}')">Reabrir custo</button>`;
    return `<div class="finance-card"><div><strong>${escapeHTML(j.referencia || "Sem referência")} · ${escapeHTML(j.descricao || getCategoria(j.categoria).nome)}</strong><small>${formatarFormulaCusto(j)}</small><small>${qtd} un. · custo ${abaFinanceiroAtual === "abertos" ? "estimado" : "fixo"}: ${formatMoeda(custo)}${j.dataPagamento ? ` · pago em ${escapeHTML(formatDataBR(j.dataPagamento))}` : ""}</small></div><div class="finance-card-actions"><strong>${formatMoeda(custo * qtd)}</strong>${botao}</div></div>`;
  }).join("") : `<div class="empty-state compact-empty"><div>${abaFinanceiroAtual === "abertos" ? "✓" : "◆"}</div><strong>${abaFinanceiroAtual === "abertos" ? "Nenhum custo em aberto" : "Nenhum custo pago registrado"}</strong><p>${abaFinanceiroAtual === "abertos" ? "As peças pagas aparecerão aqui até serem quitadas." : "O custo fixo das peças pagas aparecerá aqui."}</p></div>`;
}
function abrirPagamentoCusto(id) {
  if(!exigirAdministrador()) return;
  const j = getJoia(id); if(!j) return;
  qs("pagamentoCustoJoiaId").value = id;
  qs("pagamentoCustoResumo").innerText = `${j.referencia || "Peça"} · ${j.descricao || getCategoria(j.categoria).nome}`;
  qs("pagamentoCustoData").value = getHojeSTR();
  qs("pagamentoCustoFator").value = j.fatorDia ? formatDecimal(j.fatorDia, 6) : "";
  qs("pagamentoCustoIndice").value = j.indiceCusto ? formatMoedaSem(j.indiceCusto) : "";
  atualizarPagamentoCustoVisual();
  abrirModal("modalPagamentoCusto");
}
function atualizarPagamentoCustoVisual() {
  const j = getJoia(qs("pagamentoCustoJoiaId")?.value) || {};
  const calculo = calcularCustoJoia({ ...j, indiceCusto: parseNumeroFlexivel(qs("pagamentoCustoIndice")?.value), fatorDia: parseNumeroFlexivel(qs("pagamentoCustoFator")?.value) });
  if(qs("pagamentoCustoValor")) qs("pagamentoCustoValor").innerText = formatMoeda(calculo.total || parseNumeroFlexivel(j.precoCompra));
}
function salvarPagamentoCusto() {
  if(!exigirAdministrador()) return;
  const joia = getJoia(qs("pagamentoCustoJoiaId").value); if(!joia) return;
  const indice = parseNumeroFlexivel(qs("pagamentoCustoIndice").value);
  const fator = parseNumeroFlexivel(qs("pagamentoCustoFator").value);
  const data = qs("pagamentoCustoData").value || getHojeSTR();
  if(!indice || !fator) return alert("Informe o índice e o fator do dia para fixar o custo.");
  const calculo = calcularCustoJoia({ ...joia, indiceCusto: indice, fatorDia: fator });
  const custoFixo = calculo.total || parseNumeroFlexivel(joia.precoCompra);
  if(!custoFixo) return alert("Não foi possível calcular o custo. Confira gramas, índice e fator do dia.");
  Object.assign(joia, { indiceCusto: indice, fatorDia: fator, custoBase: calculo.custoBase, incidenciaImposto: calculo.incidenciaImposto, custoCalculado: calculo.total, custoFixo, precoCompra: custoFixo, statusPagamento: "pago", dataPagamento: data, custoFixoData: data });
  (db.vendas || []).filter(v => v.joiaId === joia.id).forEach(v => { v.custoUnitario = custoFixo; v.custoTotal = custoFixo * Math.max(1, Number(v.quantidade || 1)); tocarRegistro(v); });
  tocarRegistro(joia);
  registrarAuditoria("Custo da peça fixado", `Ref. ${joia.referencia} · ${formatMoeda(custoFixo)}`);
  salvarBanco();
  fecharModal("modalPagamentoCusto");
  trocarAbaFinanceiro("abertos");
  renderTudo();
}
function reabrirCustoJoia(id) {
  if(!exigirAdministrador()) return;
  const joia = getJoia(id); if(!joia) return;
  if(!confirm("Reabrir o custo desta peça para recalcular depois do pagamento?")) return;
  joia.statusPagamento = "aberto";
  joia.precoCompra = getCustoAtualJoia(joia);
  tocarRegistro(joia);
  registrarAuditoria("Custo da peça reaberto", `Ref. ${joia.referencia}`);
  salvarBanco();
  renderPainelFinanceiroCustos();
  renderTudo();
}

let abaAcompanhamentoAtual = "espera";
function abrirAcompanhamento(tab = "espera") {
  if(!adminLogado) return abrirLoginAdmin(false);
  trocarAbaAcompanhamento(tab);
  abrirModal("modalAcompanhamento");
}
function trocarAbaAcompanhamento(tab = "espera") {
  abaAcompanhamentoAtual = ["espera","fabricacao","anotacoes"].includes(tab) ? tab : "espera";
  qsa("[data-acomp-tab]").forEach(btn => btn.classList.toggle("active", btn.dataset.acompTab === abaAcompanhamentoAtual));
  ["espera","fabricacao","anotacoes"].forEach(nome => { const painel = qs(`acompPainel${nome.charAt(0).toUpperCase()}${nome.slice(1)}`); if(painel) painel.style.display = nome === abaAcompanhamentoAtual ? "block" : "none"; });
  renderAcompanhamento();
}
function renderAcompanhamento() {
  renderListaEspera();
  renderFabricacao();
  renderAnotacoes();
}
function renderListaEspera() {
  const lista = [...(db.listaEspera || [])].filter(item => item.status !== "concluida").sort((a,b) => String(a.dataPrevista || "9999").localeCompare(String(b.dataPrevista || "9999")) || String(b.updatedAt || 0).localeCompare(String(a.updatedAt || 0)));
  qs("listaEsperaConteudo").innerHTML = lista.length ? lista.map(item => {
    const cliente = getCliente(item.clienteId);
    return `<div class="followup-card"><div><strong>${escapeHTML(cliente?.nomeCompleto || item.clienteNome || "Cliente sem cadastro")}</strong><small>${escapeHTML(item.descricao || "Peça não informada")}${item.dataPrevista ? ` · previsão ${escapeHTML(formatDataBR(item.dataPrevista))}` : ""}</small><p>${escapeHTML(item.observacao || "Sem observações")}</p></div><div class="client-actions"><button onclick="abrirFormularioListaEspera('${escapeHTML(item.id)}')">Editar</button><button onclick="excluirListaEspera('${escapeHTML(item.id)}')">Excluir</button></div></div>`;
  }).join("") : `<div class="empty-state compact-empty"><div>⏳</div><strong>Nenhum cliente na lista de espera</strong><p>Adicione um interesse para acompanhar.</p></div>`;
}
function abrirFormularioListaEspera(id = "") {
  preencherSelectClientes("listaEsperaCliente", "", true);
  const item = id ? (db.listaEspera || []).find(x => x.id === id) : null;
  qs("listaEsperaId").value = item?.id || "";
  qs("tituloListaEsperaForm").innerText = item ? "Editar lista de espera" : "Lista de espera";
  qs("listaEsperaCliente").value = item?.clienteId || "";
  qs("listaEsperaDescricao").value = item?.descricao || "";
  qs("listaEsperaData").value = item?.dataPrevista || "";
  qs("listaEsperaObservacao").value = item?.observacao || "";
  abrirModal("modalListaEsperaForm");
}
function salvarListaEspera() {
  const descricao = qs("listaEsperaDescricao").value.trim();
  if(!descricao) return alert("Informe qual peça o cliente está aguardando.");
  const id = qs("listaEsperaId").value;
  let item = id ? (db.listaEspera || []).find(x => x.id === id) : null;
  if(!item) { item = { id: gerarIdLocal("espera"), createdAt: agoraServidor() }; db.listaEspera.push(item); }
  const cliente = getCliente(qs("listaEsperaCliente").value);
  Object.assign(item, { clienteId: cliente?.id || "", clienteNome: cliente?.nomeCompleto || "", descricao, dataPrevista: qs("listaEsperaData").value || "", observacao: qs("listaEsperaObservacao").value.trim(), status: "aguardando" });
  tocarRegistro(item);
  registrarAuditoria("Lista de espera atualizada", `${cliente?.nomeCompleto || "Cliente"} · ${descricao}`);
  salvarBanco();
  fecharModal("modalListaEsperaForm");
  renderAcompanhamento();
}
function excluirListaEspera(id) {
  const item = (db.listaEspera || []).find(x => x.id === id); if(!item) return;
  if(!confirm("Remover este cliente da lista de espera?")) return;
  registrarExclusao("listaEspera", id);
  db.listaEspera = db.listaEspera.filter(x => x.id !== id);
  salvarBanco();
  renderAcompanhamento();
}
function renderFabricacao() {
  const lista = [...(db.vendas || [])].filter(v => v.statusPedido === "aguardando_fabricacao").sort((a,b) => String(b.data || "").localeCompare(String(a.data || "")));
  qs("listaFabricacaoConteudo").innerHTML = lista.length ? lista.map(v => {
    const cliente = getCliente(v.clienteId), joia = getJoia(v.joiaId);
    return `<div class="followup-card"><div><strong>${escapeHTML(cliente?.nomeCompleto || "Cliente não localizado")}</strong><small>${escapeHTML(joia?.referencia || "Joia")} · pedido ${escapeHTML(v.pedidoId || v.id)} · ${escapeHTML(v.vendedorNome || "Loja")}</small><p>${escapeHTML(v.obs || "Aguardando a finalização da fabricação.")}</p></div><div class="followup-actions"><select onchange="atualizarStatusPedido('${escapeHTML(v.id)}', this.value)"><option value="aguardando_fabricacao" selected>Aguardando fabricação</option><option value="pronto_para_envio">Pronto para envio</option><option value="enviado">Enviado</option><option value="entregue">Entregue</option></select><button class="btn-outline small" onclick="abrirRastreioPedido('${escapeHTML(v.id)}')">Rastreio</button></div></div>`;
  }).join("") : `<div class="empty-state compact-empty"><div>🏭</div><strong>Nenhum pedido em fabricação</strong><p>Ao registrar uma venda, escolha o status de fabricação.</p></div>`;
}
function atualizarStatusPedido(vendaId, status) {
  const venda = (db.vendas || []).find(v => v.id === vendaId); if(!venda) return;
  venda.statusPedido = status || "pronto_para_envio";
  tocarRegistro(venda);
  registrarAuditoria("Status do pedido atualizado", `${venda.pedidoId || venda.id} · ${getStatusPedidoLabel(venda.statusPedido)}`);
  salvarBanco();
  renderAcompanhamento();
  renderPedidosClientes();
}
function renderAnotacoes() {
  const lista = [...(db.anotacoes || [])].sort((a,b) => Number(a.concluida) - Number(b.concluida) || String(a.dataLembrete || "9999").localeCompare(String(b.dataLembrete || "9999")) || String(b.updatedAt || 0).localeCompare(String(a.updatedAt || 0)));
  qs("listaAnotacoesConteudo").innerHTML = lista.length ? lista.map(item => `<div class="followup-card note-card ${item.concluida ? "note-done" : ""}"><div><strong>${escapeHTML(item.titulo)}</strong><small>${item.dataLembrete ? `Lembrete: ${escapeHTML(formatDataBR(item.dataLembrete))}` : "Sem data"} · prioridade ${escapeHTML(item.prioridade)}${item.usuarioNome ? ` · ${escapeHTML(item.usuarioNome)}` : ""}</small><p>${escapeHTML(item.texto)}</p></div><div class="followup-actions"><button class="btn-outline small" onclick="alternarAnotacao('${escapeHTML(item.id)}')">${item.concluida ? "Reabrir" : "Concluir"}</button><button class="btn-outline small" onclick="abrirFormularioAnotacao('${escapeHTML(item.id)}')">Editar</button><button class="btn-outline small" onclick="excluirAnotacao('${escapeHTML(item.id)}')">Excluir</button></div></div>`).join("") : `<div class="empty-state compact-empty"><div>📝</div><strong>Nenhuma anotação</strong><p>Crie um lembrete para a equipe.</p></div>`;
}
function abrirFormularioAnotacao(id = "") {
  const item = id ? (db.anotacoes || []).find(x => x.id === id) : null;
  qs("anotacaoId").value = item?.id || "";
  qs("tituloAnotacaoForm").innerText = item ? "Editar anotação" : "Nova anotação";
  qs("anotacaoTitulo").value = item?.titulo || "";
  qs("anotacaoData").value = item?.dataLembrete || "";
  qs("anotacaoPrioridade").value = item?.prioridade || "normal";
  qs("anotacaoTexto").value = item?.texto || "";
  abrirModal("modalAnotacaoForm");
}
function salvarAnotacao() {
  const titulo = qs("anotacaoTitulo").value.trim();
  const texto = qs("anotacaoTexto").value.trim();
  if(!titulo || !texto) return alert("Informe um título e o texto da anotação.");
  const id = qs("anotacaoId").value;
  let item = id ? (db.anotacoes || []).find(x => x.id === id) : null;
  if(!item) { item = { id: gerarIdLocal("anotacao"), createdAt: agoraServidor(), concluida: false }; db.anotacoes.push(item); }
  Object.assign(item, { titulo, texto, dataLembrete: qs("anotacaoData").value || "", prioridade: qs("anotacaoPrioridade").value || "normal", usuarioId: adminLogado?.id || "", usuarioNome: adminLogado?.nome || "" });
  tocarRegistro(item);
  registrarAuditoria("Anotação salva", titulo);
  salvarBanco();
  fecharModal("modalAnotacaoForm");
  renderAnotacoes();
}
function alternarAnotacao(id) {
  const item = (db.anotacoes || []).find(x => x.id === id); if(!item) return;
  item.concluida = !item.concluida;
  tocarRegistro(item);
  salvarBanco();
  renderAnotacoes();
}
function excluirAnotacao(id) {
  const item = (db.anotacoes || []).find(x => x.id === id); if(!item) return;
  if(!confirm("Excluir esta anotação?")) return;
  registrarExclusao("anotacoes", id);
  db.anotacoes = db.anotacoes.filter(x => x.id !== id);
  salvarBanco();
  renderAnotacoes();
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
  if(!exigirAdministrador()) return;
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
  if(!exigirAdministrador()) return;
  renderTemasPredefinidos();
  abrirModal("modalTemaVisual");
}
function renderPreviewLogoLoja() { qs("previewLogoLoja").innerHTML = logoLojaTemp ? `<img src="${logoLojaTemp}" alt="Logo">` : `<span>◆</span>`; }
async function selecionarLogoLoja(event) { const file = event.target.files && event.target.files[0]; if(!file) return; setLoading(true, "Comprimindo logo..."); try { logoLojaTemp = await comprimirImagem(file, 512, .86); renderPreviewLogoLoja(); } finally { setLoading(false); } }

function salvarDadosLoja() {
  if(!exigirAdministrador()) return;
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
  if(!exigirAdministrador()) return;
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
  if(!exigirAdministrador()) return;
  db.configs.url = qs("configUrlApp").value.trim();
  db.configs.somenteLocal = !db.configs.url;
  registrarAuditoria("Configuração de sincronização alterada", db.configs.url ? "Back-end configurado." : "Uso local sem back-end.");
  salvarBanco();
  renderSyncInfo();
  inicializarSincronizacaoAutomatica();
  alert("Configuração avançada salva.");
}
function salvarConfiguracoes() { salvarDadosLoja(); }

function renderSyncInfo() {
  const status = db.configs.url ? "Sincronização configurada" : "Somente local";
  const ultima = db.configs.ultimaSincronizacao ? formatDateTime(db.configs.ultimaSincronizacao) : "nunca";
  const fila = syncPendente || temMudancaLocalPendente() ? " · alterações aguardando envio" : "";
  qs("syncInfo").innerHTML = `<strong>${status}${fila}</strong><br>Última sincronização: ${ultima}<br>Revisão: ${escapeHTML(db.configs.syncRevision || 0)}<br><small>Atualização automática ativa enquanto o app estiver aberto.</small>`;
}

function renderUsuarios() {
  const usuarios = getPerfisAdminDisponiveis();
  qs("listaUsuarios").innerHTML = usuarios.map(u => `
    <div class="user-card"><div><strong>${escapeHTML(u.nome)}</strong><small>${u.tipo === "vendedora" ? "Vendedora" : "Administrador"}${u.forcarTrocaSenha ? " · troca de senha pendente" : ""}</small></div>
    <div class="client-actions"><button onclick="abrirFormularioUsuario('${escapeHTML(u.id)}')">Editar</button>${u.id !== "admin_padrao" ? `<button onclick="excluirUsuario('${escapeHTML(u.id)}')">Excluir</button>` : ""}</div></div>`).join("");
}

function abrirFormularioUsuario(id = "") {
  if(!exigirAdministrador()) return;
  qs("usuarioId").value = id || "";
  const u = id ? getPerfisAdminDisponiveis().find(x => x.id === id) : null;
  qs("tituloUsuarioForm").innerText = u ? "Editar usuário" : "Cadastrar usuário";
  qs("usuarioNome").value = u ? u.nome : "";
  qs("usuarioSenha").value = u ? u.senha : "";
  qs("usuarioAdmin").checked = u ? u.isAdmin : true;
  if(qs("usuarioTipo")) qs("usuarioTipo").value = u ? (u.tipo || (u.isAdmin ? "admin" : "vendedora")) : "vendedora";
  qs("usuarioForcarTroca").checked = u ? u.forcarTrocaSenha : true;
  abrirModal("modalUsuarioForm");
}

function salvarUsuarioForm() {
  if(!exigirAdministrador()) return;
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
  const tipo = qs("usuarioTipo")?.value || (qs("usuarioAdmin").checked ? "admin" : "vendedora");
  Object.assign(u, { nome, senha, tipo, isAdmin: tipo === "admin", forcarTrocaSenha: qs("usuarioForcarTroca").checked });
  tocarRegistro(u);
  registrarAuditoria("Usuário salvo", nome);
  salvarBanco();
  fecharModal("modalUsuarioForm");
  renderUsuarios();
}

function excluirUsuario(id) {
  if(!exigirAdministrador()) return;
  const u = db.administradores.find(a => a.id === id); if(!u) return;
  if(adminLogado && adminLogado.id === id) return alert("Não é possível excluir o usuário conectado.");
  if(!confirm(`Excluir usuário ${u.nome}?`)) return;
  registrarExclusao("administradores", id);
  db.administradores = db.administradores.filter(a => a.id !== id);
  registrarAuditoria("Usuário excluído", u.nome);
  salvarBanco();
  renderUsuarios();
}

function abrirAuditoria() { if(!exigirAdministrador()) return; renderAuditoria(); abrirModal("modalAuditoria"); }
function renderAuditoria() {
  const q = (qs("buscaAuditoria")?.value || "").toLowerCase();
  let lista = [...(db.auditoria || [])];
  if(q) lista = lista.filter(a => [a.acao, a.detalhes, a.usuario].join(" ").toLowerCase().includes(q));
  qs("listaAuditoria").innerHTML = lista.length ? lista.map(a => `<div class="audit-card"><strong>${escapeHTML(a.acao)}</strong><small>${formatDateTime(a.createdAt)} · ${escapeHTML(a.usuario || "Sistema")}</small><p>${escapeHTML(a.detalhes || "")}</p></div>`).join("") : `<p class="hint">Sem registros de auditoria.</p>`;
}

function abrirAvancado() { if(!exigirAdministrador()) return; qs("configUrlApp").value = db.configs.url || ""; renderSyncInfo(); renderUsuarios(); abrirModal("modalAvancado"); }

function exportarDadosBackup() {
  if(!exigirAdministrador()) return;
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(db, null, 2));
  const a = document.createElement("a");
  a.href = dataStr;
  a.download = `joiaspro_backup_${getHojeSTR()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function importarDadosBackup(event) {
  if(!exigirAdministrador()) { if(event?.target) event.target.value = ""; return; }
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
  if(!exigirAdministrador()) return;
  let rows = [];
  if(tipo === "joias") {
    rows = [["referencia","descricao","categoria","status","quantidade_estoque","data_entrada","peso_ouro_g","indice_custo","fator_dia","incidencia_imposto","status_pagamento","data_pagamento","custo_base","custo_calculado","custo_fixo","preco_venda","cliente","data_cadastro","data_venda","observacoes"]];
    (db.joias || []).forEach(j => rows.push([j.referencia, j.descricao, getCategoria(j.categoria).nome, j.status, j.quantidadeEstoque || 0, j.dataEntrada || "", String(j.pesoOuro).replace(".",","), formatMoedaSem(j.indiceCusto), formatDecimal(j.fatorDia,6), formatDecimal(j.incidenciaImposto,2), j.statusPagamento || "aberto", j.dataPagamento || "", formatMoedaSem(j.custoBase), formatMoedaSem(j.custoCalculado), formatMoedaSem(getCustoFixoJoia(j)), formatMoedaSem(j.precoVenda), getCliente(j.clienteId)?.nomeCompleto || "", j.dataCadastro || "", j.dataVenda || "", j.obs || ""]));
  } else if(tipo === "clientes") {
    rows = [["nome_completo","cpf","email","telefone","cep","rua","numero","bairro","cidade","uf","complemento","ponto_referencia","vip","observacao"]];
    (db.clientes || []).forEach(c => rows.push([c.nomeCompleto, c.cpf, c.email, c.telefone, c.cep, c.rua, c.numero, c.bairro, c.cidade, c.uf, c.complemento, c.pontoReferencia, c.vip ? "sim" : "nao", c.observacao]));
  } else if(tipo === "vendas") {
    rows = [["data","pedido","referencia","cliente","cpf","email","vendedor","quantidade","subtotal","frete","valor_total","forma_pagamento","modalidade_envio","status_pedido","codigo_rastreio","observacao"]];
    (db.vendas || []).forEach(v => { const cliente = getCliente(v.clienteId) || {}; rows.push([v.data, v.pedidoId || v.id, getJoia(v.joiaId)?.referencia || "", cliente.nomeCompleto || "", cliente.cpf || "", cliente.email || "", v.vendedorNome || "", v.quantidade || 1, formatMoedaSem(v.valorVenda), formatMoedaSem(getValorFrete(v)), formatMoedaSem(getValorTotalPedido(v)), getFormaPagamentoLabel(v.formaPagamento), getModalidadeEnvioLabel(v.modalidadeEnvio), getStatusPedidoLabel(v.statusPedido), v.codigoRastreio || "", v.obs || ""]); });
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
  syncTimer = setTimeout(() => sincronizarFundo(false, true), 500);
}

function temMudancaLocalPendente() {
  if(db.loja && db.loja._clientDirty) return true;
  if(db.configGerais && db.configGerais._clientDirty) return true;
  if((db.joias || []).some(x => x._clientDirty)) return true;
  if((db.clientes || []).some(x => x._clientDirty)) return true;
  if((db.vendas || []).some(x => x._clientDirty)) return true;
  if((db.listaEspera || []).some(x => x._clientDirty)) return true;
  if((db.anotacoes || []).some(x => x._clientDirty)) return true;
  if((db.categorias || []).some(x => x._clientDirty)) return true;
  if((db.administradores || []).some(x => x._clientDirty)) return true;
  if((db.auditoria || []).some(x => x._clientDirty)) return true;
  return Object.values(db._deleted || {}).some(grupo => Object.values(grupo || {}).some(t => t && t._clientDirty));
}

function tombstoneTempo(valor) { return valor && typeof valor === "object" ? Number(valor.deletedAt || valor._clientChangedAt || 0) : Number(valor || 0); }
function objetoMaisNovo(a,b) {
  if(!a) return b || {};
  if(!b) return a || {};
  if(a._clientDirty && !b._clientDirty) return a;
  if(b._clientDirty && !a._clientDirty) return b;
  const ta = Number(a._serverUpdatedAt || a.updatedAt || a._clientChangedAt || 0);
  const tb = Number(b._serverUpdatedAt || b.updatedAt || b._clientChangedAt || 0);
  return tb >= ta ? b : a;
}
function mesclarExclusoes(a,b) { const tipos = ["joias","clientes","vendas","listaEspera","anotacoes","categorias","administradores"]; const out = {}; tipos.forEach(tipo => { out[tipo] = {}; const aa = (a && a[tipo]) || {}, bb = (b && b[tipo]) || {}; Object.keys(aa).forEach(id => out[tipo][id] = aa[id]); Object.keys(bb).forEach(id => { const old = out[tipo][id]; if(old?._clientDirty && !bb[id]?._clientDirty) return; if(bb[id]?._clientDirty || tombstoneTempo(bb[id]) >= tombstoneTempo(old)) out[tipo][id] = bb[id]; }); }); return out; }
function mesclarListaPorData(atual = [], nova = [], excluidos = {}) {
  const map = {};
  atual.concat(nova).forEach(item => {
    if(!item) return;
    const key = item.id || item.referencia || item.nome;
    if(!key) return;
    map[key] = objetoMaisNovo(map[key], item);
  });
  return Object.keys(map)
    .filter(id => !excluidos[id] || tombstoneTempo(excluidos[id]) < Number(map[id].updatedAt || map[id]._serverUpdatedAt || 0))
    .map(id => map[id]);
}
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
  merged.listaEspera = mesclarListaPorData(local.listaEspera, nuvem.listaEspera, merged._deleted.listaEspera);
  merged.anotacoes = mesclarListaPorData(local.anotacoes, nuvem.anotacoes, merged._deleted.anotacoes);
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
  atualizarRelogioServidor(novoBanco._serverNow || novoBanco.configs?.serverNow || novoBanco.configs?.ultimaSincronizacao);
  const urlSalva = db.configs?.url || "";
  db = normalizarBanco(novoBanco);
  if(urlSalva) db.configs.url = urlSalva;
  db.configs.somenteLocal = !db.configs.url;
  db.configs.ultimaSincronizacao = Number(novoBanco._serverNow || novoBanco.configs?.serverNow || novoBanco.configs?.ultimaSincronizacao || agoraServidor());
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  if(opcoes.render !== false) {
    if(modalDeEdicaoAberto()) renderPendenteSync = true;
    else renderTudo();
  }
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
    atualizarRelogioServidor(dadosNuvem?._serverNow || dadosNuvem?.configs?.serverNow || dadosNuvem?.configs?.ultimaSincronizacao);
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
    inicializarSincronizacaoAutomatica();
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

async function sincronizarFundo(forcado = false, apenasEmpurrar = false, avisar = false) {
  if(!db.configs.url || isSyncingFundo) return false;
  syncPendente = false;
  isSyncingFundo = true;
  if(qs("syncIndicador")) qs("syncIndicador").style.opacity = "1";
  try {
    const versaoLocalAntes = localMutationVersion;
    const snapshot = normalizarBanco(JSON.parse(JSON.stringify(db)));
    const res = await fetch(db.configs.url + (db.configs.url.includes("?") ? "&" : "?") + "nocache=" + Date.now(), { method: "POST", redirect: "follow", headers: { "Content-Type": "text/plain;charset=utf-8" }, cache: "no-store", body: JSON.stringify({ action: "salvar_banco", dados: snapshot, baseRevision: db.configs.syncRevision || 0 }) });
    if(!res.ok) throw new Error("Falha ao salvar na nuvem");
    const retorno = await res.json().catch(() => null);
    if(!retorno || retorno.ok !== true) throw new Error(retorno?.erro || "Resposta inválida do back-end");
    atualizarRelogioServidor(retorno?.serverNow || retorno?.dados?._serverNow || retorno?.dados?.configs?.serverNow);
    if(retorno.dados && validarBancoImportado(retorno.dados)) {
      // Se houve edição durante o request, ela fica na fila; nunca é apagada
      // pela resposta do servidor.
      const posRequest = localMutationVersion === versaoLocalAntes ? retorno.dados : mesclarBancosPorData(db, retorno.dados);
      posRequest.configs.url = db.configs.url;
      posRequest.configs.ultimaSincronizacao = Number(retorno.serverNow || retorno.dados._serverNow || retorno.dados.configs?.serverNow || agoraServidor());
      aplicarBancoAtualizado(posRequest, { render: true });
    } else {
      db.configs.syncRevision = retorno.revision || db.configs.syncRevision || 0;
      db.configs.ultimaSincronizacao = Number(retorno.serverNow || agoraServidor());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    }
    renderSyncInfoSafe();
    if(avisar) alert("Dados enviados para a nuvem.");
    return true;
  } catch(e) {
    console.warn("Sync falhou", e);
    syncPendente = true;
    if(avisar) alert("Não foi possível enviar agora. O app tentará novamente automaticamente.");
    return false;
  } finally {
    isSyncingFundo = false;
    if(qs("syncIndicador")) qs("syncIndicador").style.opacity = "0";
    if(syncPendente) { clearTimeout(syncTimer); syncTimer = setTimeout(() => sincronizarFundo(false, true), SYNC_RETRY_INTERVAL_MS); }
  }
}
function enviarDadosNuvemAgora() { return sincronizarFundo(true, false, true); }

async function puxarDadosNuvem(silencioso = true) {
  if(!db.configs.url || isSyncingFundo) return false;
  isSyncingFundo = true;
  if(qs("syncIndicador")) qs("syncIndicador").style.opacity = "1";
  try {
    const localAntes = normalizarBanco(JSON.parse(JSON.stringify(db)));
    const versaoLocalAntes = localMutationVersion;
    const fetchUrl = db.configs.url + (db.configs.url.includes("?") ? "&" : "?") + "nocache=" + Date.now();
    const res = await fetch(fetchUrl, { redirect: "follow", cache: "no-store" });
    if(!res.ok) throw new Error("Falha ao puxar dados");
    let nuvem = await res.json();
    if(!validarBancoImportado(nuvem)) throw new Error("Banco incompatível");
    atualizarRelogioServidor(nuvem._serverNow || nuvem.configs?.serverNow || nuvem.configs?.ultimaSincronizacao);
    nuvem = normalizarBanco(nuvem);
    const revisaoNuvem = Number(nuvem.configs.syncRevision || nuvem._serverRevision || 0);
    const revisaoLocal = Number(localAntes.configs.syncRevision || 0);
    const houveMudancaLocal = versaoLocalAntes !== localMutationVersion || temMudancaLocalPendente() || syncPendente;
    if(revisaoNuvem <= revisaoLocal && !houveMudancaLocal) {
      if(!silencioso) alert("Você já está com a versão mais recente.");
      return true;
    }
    // Mesmo ao clicar em “Puxar”, o snapshot local é mesclado. Isso evita
    // perder uma venda/cliente criado neste aparelho antes do pull terminar.
    const mesclado = mesclarBancosPorData(db, nuvem);
    mesclado.configs.url = db.configs.url;
    mesclado.configs.somenteLocal = false;
    aplicarBancoAtualizado(mesclado, { render: true });
    if(temMudancaLocalPendente()) {
      syncPendente = true;
      agendarSincronizacao();
    }
    if(!silencioso) alert("Dados atualizados e mesclados com a nuvem.");
    renderSyncInfoSafe();
    return true;
  } catch(e) {
    if(!silencioso) alert("Não foi possível puxar os dados da nuvem. O app continuará tentando.");
    return false;
  } finally {
    isSyncingFundo = false;
    if(qs("syncIndicador")) qs("syncIndicador").style.opacity = "0";
  }
}
function puxarDadosNuvemAgora() { return puxarDadosNuvem(false); }
function renderSyncInfoSafe() { if(qs("syncInfo")) renderSyncInfo(); }

function inicializarSincronizacaoAutomatica() {
  if(syncIntervalId) { clearInterval(syncIntervalId); syncIntervalId = null; }
  if(!db.configs.url) return;
  setTimeout(() => sincronizacaoAutomatica(), 700);
  syncIntervalId = setInterval(() => sincronizacaoAutomatica(), SYNC_PULL_INTERVAL_MS);
  if(!syncListenersRegistered) {
    syncListenersRegistered = true;
    window.addEventListener("focus", () => sincronizacaoAutomatica());
    window.addEventListener("online", () => sincronizacaoAutomatica());
    document.addEventListener("visibilitychange", () => { if(document.visibilityState === "visible") sincronizacaoAutomatica(); });
  }
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
