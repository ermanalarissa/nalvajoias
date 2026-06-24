/************************************************************
 * JoiasPro - Back-end Google Apps Script
 *
 * Como usar:
 * 1. Acesse script.google.com e crie um novo projeto.
 * 2. Cole este arquivo em Code.gs.
 * 3. Clique em Implantar > Nova implantação > Aplicativo da Web.
 * 4. Executar como: você mesmo.
 * 5. Quem tem acesso: qualquer pessoa com o link.
 * 6. Copie a URL /exec e informe no app JoiasPro.
 ************************************************************/

const PROPERTY_KEY = 'JOIASPRO_DB_JSON';
const LOCK_TIMEOUT_MS = 25000;

function doGet(e) {
  return jsonResponse(getBancoSalvo());
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(LOCK_TIMEOUT_MS);
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!payload || payload.action !== 'salvar_banco') {
      return jsonResponse({ ok: false, erro: 'Ação inválida.' });
    }

    const recebido = normalizarBanco(payload.dados || criarBancoBase());
    if (recebido.app_id !== 'joiaspro') {
      return jsonResponse({ ok: false, erro: 'Banco incompatível.' });
    }

    const atual = normalizarBanco(getBancoSalvo());
    const baseRevision = Number(payload.baseRevision || recebido.configs.syncRevision || 0);
    const atualRevision = Number(atual.configs.syncRevision || 0);

    let finalDb = baseRevision < atualRevision ? mesclarBancosPorData(atual, recebido) : recebido;
    finalDb = normalizarBanco(finalDb);

    const novaRevision = atualRevision + 1;
    finalDb.configs.syncRevision = novaRevision;
    finalDb.configs.ultimaSincronizacao = Date.now();
    finalDb = limparFlagsCliente(finalDb, novaRevision);

    PropertiesService.getScriptProperties().setProperty(PROPERTY_KEY, JSON.stringify(finalDb));
    return jsonResponse({ ok: true, revision: novaRevision, dados: finalDb });
  } catch (err) {
    return jsonResponse({ ok: false, erro: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getBancoSalvo() {
  const raw = PropertiesService.getScriptProperties().getProperty(PROPERTY_KEY);
  if (!raw) return criarBancoBase();
  try {
    const parsed = JSON.parse(raw);
    return normalizarBanco(parsed);
  } catch (err) {
    return criarBancoBase();
  }
}

function criarBancoBase() {
  return {
    app_id: 'joiaspro',
    loja: { nome: 'JoiasPro', logo: '', telefone: '', cidade: '', uf: 'PB' },
    categorias: getCategoriasPadrao(),
    joias: [],
    clientes: [],
    vendas: [],
    administradores: [],
    auditoria: [],
    configGerais: { corTema: '#9B6A2F', corSubHeader: '#fff8ef' },
    configs: { url: '', dadosBaixados: false, somenteLocal: false, ultimaMudancaLocal: 0, ultimaSincronizacao: 0, syncRevision: 0, senhaAdmin: '1999', clientId: '' },
    _deleted: { joias: {}, clientes: {}, vendas: {}, categorias: {}, administradores: {} }
  };
}

function getCategoriasPadrao() {
  return [
    { id: 'correntaria', nome: 'Correntaria', icon: '📿', ordem: 1 },
    { id: 'pulseiras', nome: 'Pulseiras', icon: '〰️', ordem: 2 },
    { id: 'brincos', nome: 'Brincos', icon: '💎', ordem: 3 },
    { id: 'argolas', nome: 'Argolas', icon: '⭕', ordem: 4 },
    { id: 'pingentes', nome: 'Pingentes', icon: '🔶', ordem: 5 },
    { id: 'aneis', nome: 'Anéis', icon: '💍', ordem: 6 },
    { id: 'escapularios', nome: 'Escapulários', icon: '✝️', ordem: 7 },
    { id: 'aliancas', nome: 'Alianças', icon: '🟡', ordem: 8 }
  ];
}

function normalizarBanco(dados) {
  const base = criarBancoBase();
  if (!dados || dados.app_id !== 'joiaspro') return base;

  dados.loja = Object.assign({}, base.loja, dados.loja || {});
  dados.categorias = Array.isArray(dados.categorias) && dados.categorias.length ? dados.categorias : base.categorias;
  dados.joias = Array.isArray(dados.joias) ? dados.joias : [];
  dados.clientes = Array.isArray(dados.clientes) ? dados.clientes : [];
  dados.vendas = Array.isArray(dados.vendas) ? dados.vendas : [];
  dados.administradores = Array.isArray(dados.administradores) ? dados.administradores : [];
  dados.auditoria = Array.isArray(dados.auditoria) ? dados.auditoria : [];
  dados.configGerais = Object.assign({}, base.configGerais, dados.configGerais || {});
  dados.configs = Object.assign({}, base.configs, dados.configs || {});
  dados._deleted = Object.assign({}, base._deleted, dados._deleted || {});
  ['joias','clientes','vendas','categorias','administradores'].forEach(function(k) {
    dados._deleted[k] = dados._deleted[k] || {};
  });

  getCategoriasPadrao().forEach(function(cat) {
    if (!dados.categorias.some(function(c) { return c && c.id === cat.id; })) dados.categorias.push(cat);
  });

  return dados;
}

function limparFlagsCliente(db, revision) {
  const now = Date.now();
  const clearObj = function(obj) {
    if (!obj || typeof obj !== 'object') return;
    delete obj._clientDirty;
    delete obj._clientChangedAt;
    obj._serverUpdatedAt = now;
    obj._serverSeq = revision;
  };

  clearObj(db.loja);
  clearObj(db.configGerais);
  ['categorias','joias','clientes','vendas','administradores','auditoria'].forEach(function(lista) {
    (db[lista] || []).forEach(clearObj);
  });

  Object.keys(db._deleted || {}).forEach(function(tipo) {
    Object.keys(db._deleted[tipo] || {}).forEach(function(id) {
      clearObj(db._deleted[tipo][id]);
    });
  });
  return db;
}

function objetoMaisNovo(a, b) {
  if (!a) return b || {};
  if (!b) return a || {};
  const ta = Number(a.updatedAt || a._clientChangedAt || a._serverUpdatedAt || 0);
  const tb = Number(b.updatedAt || b._clientChangedAt || b._serverUpdatedAt || 0);
  return tb >= ta ? b : a;
}

function tombstoneTempo(valor) {
  if (!valor) return 0;
  return typeof valor === 'object' ? Number(valor.deletedAt || valor._clientChangedAt || valor._serverUpdatedAt || 0) : Number(valor || 0);
}

function mesclarExclusoes(a, b) {
  const tipos = ['joias','clientes','vendas','categorias','administradores'];
  const out = {};
  tipos.forEach(function(tipo) {
    out[tipo] = {};
    const aa = (a && a[tipo]) || {};
    const bb = (b && b[tipo]) || {};
    Object.keys(aa).forEach(function(id) { out[tipo][id] = aa[id]; });
    Object.keys(bb).forEach(function(id) {
      const old = out[tipo][id];
      out[tipo][id] = tombstoneTempo(bb[id]) >= tombstoneTempo(old) ? bb[id] : old;
    });
  });
  return out;
}

function mesclarListaPorData(atual, nova, excluidos) {
  atual = atual || [];
  nova = nova || [];
  excluidos = excluidos || {};
  const map = {};
  atual.concat(nova).forEach(function(item) {
    if (!item) return;
    const key = item.id || item.referencia || item.nome;
    if (!key) return;
    map[key] = objetoMaisNovo(map[key], item);
  });
  return Object.keys(map).filter(function(id) {
    return !excluidos[id] || tombstoneTempo(excluidos[id]) < Number(map[id].updatedAt || map[id]._serverUpdatedAt || 0);
  }).map(function(id) { return map[id]; });
}

function mesclarBancosPorData(atual, recebido) {
  atual = normalizarBanco(atual);
  recebido = normalizarBanco(recebido);
  const merged = normalizarBanco(atual);
  merged._deleted = mesclarExclusoes(atual._deleted, recebido._deleted);
  merged.loja = objetoMaisNovo(atual.loja, recebido.loja);
  merged.configGerais = objetoMaisNovo(atual.configGerais, recebido.configGerais);
  merged.categorias = mesclarListaPorData(atual.categorias, recebido.categorias, merged._deleted.categorias);
  merged.joias = mesclarListaPorData(atual.joias, recebido.joias, merged._deleted.joias);
  merged.clientes = mesclarListaPorData(atual.clientes, recebido.clientes, merged._deleted.clientes);
  merged.vendas = mesclarListaPorData(atual.vendas, recebido.vendas, merged._deleted.vendas);
  merged.administradores = mesclarListaPorData(atual.administradores, recebido.administradores, merged._deleted.administradores);
  merged.auditoria = mesclarListaPorData(atual.auditoria, recebido.auditoria, {});
  merged.configs = Object.assign({}, atual.configs || {}, recebido.configs || {});
  merged.configs.syncRevision = Math.max(Number(atual.configs.syncRevision || 0), Number(recebido.configs.syncRevision || 0));
  return normalizarBanco(merged);
}

function resetarBanco() {
  PropertiesService.getScriptProperties().deleteProperty(PROPERTY_KEY);
  return 'Banco JoiasPro apagado.';
}
