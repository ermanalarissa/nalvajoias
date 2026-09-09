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
  const dados = getBancoSalvo();
  const serverNow = Date.now();
  // Mantido no envelope do próprio banco para não quebrar versões antigas do app.
  dados._serverNow = serverNow;
  dados._serverRevision = Number(dados.configs.syncRevision || 0);
  return jsonResponse(dados);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(LOCK_TIMEOUT_MS);
  try {
    const serverNow = Date.now();
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

    // Todo request passa pelo merge dentro do lock, mesmo quando o aparelho
    // acredita estar na última revisão. Um snapshot local pode ter ficado
    // atrasado sem perceber; substituir o banco inteiro nesse caso apagaria
    // vendas/novos clientes feitos por outro aparelho. O merge preserva os
    // registros atuais e aplica somente alterações marcadas pelo cliente.
    let finalDb = (atualRevision === 0 && baseRevision === 0) ? recebido : mesclarBancosNoServidor(atual, recebido);
    finalDb = normalizarBanco(finalDb);

    const novaRevision = atualRevision + 1;
    finalDb.configs.syncRevision = novaRevision;
    finalDb.configs.ultimaSincronizacao = serverNow;
    finalDb.configs.serverNow = serverNow;
    finalDb = limparFlagsCliente(finalDb, novaRevision, serverNow);

    PropertiesService.getScriptProperties().setProperty(PROPERTY_KEY, JSON.stringify(finalDb));
    finalDb._serverNow = serverNow;
    finalDb._serverRevision = novaRevision;
    return jsonResponse({ ok: true, revision: novaRevision, serverNow: serverNow, dados: finalDb });
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
    listaEspera: [],
    anotacoes: [],
    administradores: [],
    auditoria: [],
    configGerais: { corTema: '#9B6A2F', corSubHeader: '#fff8ef' },
    configs: { url: '', dadosBaixados: false, somenteLocal: false, ultimaMudancaLocal: 0, ultimaSincronizacao: 0, serverNow: 0, syncRevision: 0, senhaAdmin: '1999', clientId: '' },
    _deleted: { joias: {}, clientes: {}, vendas: {}, listaEspera: {}, anotacoes: {}, categorias: {}, administradores: {} }
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
  dados.listaEspera = Array.isArray(dados.listaEspera) ? dados.listaEspera : [];
  dados.anotacoes = Array.isArray(dados.anotacoes) ? dados.anotacoes : [];
  dados.administradores = Array.isArray(dados.administradores) ? dados.administradores : [];
  dados.auditoria = Array.isArray(dados.auditoria) ? dados.auditoria : [];
  dados.configGerais = Object.assign({}, base.configGerais, dados.configGerais || {});
  dados.configs = Object.assign({}, base.configs, dados.configs || {});
  dados._deleted = Object.assign({}, base._deleted, dados._deleted || {});
  ['joias','clientes','vendas','listaEspera','anotacoes','categorias','administradores'].forEach(function(k) {
    dados._deleted[k] = dados._deleted[k] || {};
  });

  getCategoriasPadrao().forEach(function(cat) {
    if (!dados.categorias.some(function(c) { return c && c.id === cat.id; })) dados.categorias.push(cat);
  });

  dados.clientes.forEach(function(c, idx) {
    if (!c.id) c.id = 'cli_' + idx;
    c.cpf = c.cpf || '';
    c.email = c.email || '';
    c.vip = !!c.vip;
  });
  dados.vendas.forEach(function(v, idx) {
    if (!v.id) v.id = 'venda_' + idx;
    v.vendedorId = v.vendedorId || '';
    v.vendedorNome = v.vendedorNome || '';
    v.valorVenda = Number(v.valorVenda || 0);
    v.valorFrete = Math.max(0, Number(v.valorFrete != null ? v.valorFrete : v.frete) || 0);
    v.modalidadeEnvio = v.modalidadeEnvio || v.modalidade || '';
    v.pedidoId = v.pedidoId || v.id;
    v.statusPedido = v.statusPedido || 'pronto_para_envio';
    v.quantidadePendenteFabricacao = Math.max(0, Math.floor(Number(v.quantidadePendenteFabricacao || 0)));
    v.fabricacaoAutomatica = !!v.fabricacaoAutomatica;
    v.origemFabricacao = v.origemFabricacao || '';
    v.codigoRastreio = v.codigoRastreio || '';
    v.dataRastreio = Number(v.dataRastreio || 0);
    v.custoUnitario = Number(v.custoUnitario || 0);
    v.custoTotal = Number(v.custoTotal || 0) || (v.custoUnitario * Math.max(1, Number(v.quantidade || 1)));
    var totalInformado = Number(v.valorTotalPedido);
    v.valorTotalPedido = Number.isFinite(totalInformado) && Object.prototype.hasOwnProperty.call(v, 'valorTotalPedido') ? Math.max(0, totalInformado) : Math.max(0, v.valorVenda + v.valorFrete);
  });
  dados.joias.forEach(function(j, idx) {
    if (!j.id) j.id = 'joia_' + idx;
    j.pesoOuro = Number(j.pesoOuro || 0);
    j.gramasCusto = Number(j.gramasCusto != null ? j.gramasCusto : j.pesoOuro) || 0;
    j.indiceCusto = Number(j.indiceCusto != null ? j.indiceCusto : j.indice) || 0;
    j.fatorDia = Number(j.fatorDia != null ? j.fatorDia : j.fator) || 0;
    j.incidenciaImposto = Math.max(0, Number(j.incidenciaImposto != null ? j.incidenciaImposto : j.imposto) || 0);
    var custoBase = j.gramasCusto * j.indiceCusto * j.fatorDia;
    var custoCalculado = custoBase * (1 + j.incidenciaImposto / 100);
    j.custoBase = Number(j.custoBase || 0) || custoBase;
    j.custoCalculado = Number(j.custoCalculado || 0) || custoCalculado;
    j.statusPagamento = j.statusPagamento === 'pago' || j.statusPagamento === 'aberto' ? j.statusPagamento : (Number(j.precoCompra || 0) > 0 ? 'pago' : 'aberto');
    j.dataPagamento = j.dataPagamento || '';
    j.custoFixo = Number(j.custoFixo || 0) || (j.statusPagamento === 'pago' ? Number(j.precoCompra || 0) : 0);
    j.custoFixoData = j.custoFixoData || (j.statusPagamento === 'pago' ? j.dataPagamento : '');
    j.precoCompra = Number(j.precoCompra || 0) || (j.statusPagamento === 'pago' ? j.custoFixo : j.custoCalculado);
  });
  dados.listaEspera.forEach(function(item, idx) {
    if (!item.id) item.id = 'espera_' + idx;
    item.clienteId = item.clienteId || '';
    item.clienteNome = item.clienteNome || '';
    item.descricao = item.descricao || item.peca || '';
    item.dataPrevista = item.dataPrevista || '';
    item.observacao = item.observacao || item.obs || '';
    item.status = item.status || 'aguardando';
  });
  dados.anotacoes.forEach(function(item, idx) {
    if (!item.id) item.id = 'anotacao_' + idx;
    item.titulo = item.titulo || 'Anotação';
    item.texto = item.texto || item.observacao || '';
    item.dataLembrete = item.dataLembrete || '';
    item.prioridade = item.prioridade || 'normal';
    item.concluida = !!item.concluida;
  });
  dados.administradores.forEach(function(a, idx) {
    if (!a.id) a.id = 'adm_' + idx;
    a.tipo = a.tipo || (a.isAdmin === false ? 'vendedora' : 'admin');
    a.isAdmin = a.tipo !== 'vendedora';
  });

  return dados;
}

function limparFlagsCliente(db, revision, serverNow) {
  const now = Number(serverNow || Date.now());
  const clearObj = function(obj) {
    if (!obj || typeof obj !== 'object') return;
    const dirty = !!obj._clientDirty;
    delete obj._clientDirty;
    delete obj._clientChangedAt;
    delete obj._clientId;
    delete obj._clientUser;
    delete obj._inventoryDelta;
    if (dirty) obj.updatedAt = now;
    if (dirty || !obj._serverUpdatedAt) obj._serverUpdatedAt = now;
    if (dirty || !obj._serverSeq) obj._serverSeq = revision;
    if (dirty && obj.deletedAt) obj.deletedAt = now;
    if (dirty && obj.createdAt) obj.createdAt = now;
  };

  clearObj(db.loja);
  clearObj(db.configGerais);
  ['categorias','joias','clientes','vendas','listaEspera','anotacoes','administradores','auditoria'].forEach(function(lista) {
    (db[lista] || []).forEach(clearObj);
  });

  Object.keys(db._deleted || {}).forEach(function(tipo) {
    Object.keys(db._deleted[tipo] || {}).forEach(function(id) {
      clearObj(db._deleted[tipo][id]);
    });
  });
  return db;
}

function chaveRegistro(item) {
  return item && (item.id || item.referencia || item.nome);
}

function mesclarObjetoNoServidor(atual, recebido) {
  if (!atual) return recebido || {};
  if (!recebido) return atual || {};
  // Um registro marcado pelo cliente é uma alteração intencional. Como os
  // requests são serializados pelo LockService, o último request recebido
  // vence somente para aquele registro, sem substituir os demais.
  return recebido._clientDirty ? recebido : atual;
}

function mesclarListaNoServidor(atual, recebido) {
  const mapa = {};
  (atual || []).forEach(function(item) {
    const id = chaveRegistro(item);
    if (id) mapa[id] = item;
  });
  (recebido || []).forEach(function(item) {
    const id = chaveRegistro(item);
    if (!id) return;
    if (!mapa[id] || item._clientDirty) mapa[id] = item;
  });
  return Object.keys(mapa).map(function(id) { return mapa[id]; });
}

function mesclarJoiasNoServidor(atual, recebido) {
  const mapa = {};
  (atual || []).forEach(function(item) {
    const id = chaveRegistro(item);
    if (id) mapa[id] = item;
  });
  (recebido || []).forEach(function(item) {
    const id = chaveRegistro(item);
    if (!id) return;
    if (!mapa[id] || !item._clientDirty) {
      if (!mapa[id]) mapa[id] = item;
      return;
    }
    const atualJoia = mapa[id];
    const proxima = Object.assign({}, item);
    const delta = Number(item._inventoryDelta || 0);
    if (Number.isFinite(delta) && delta !== 0) {
      const quantidadeAtual = Math.max(0, Math.floor(Number(atualJoia.quantidadeEstoque || 0)));
      proxima.quantidadeEstoque = Math.max(0, Math.floor(quantidadeAtual + delta));
      proxima.quantidadeInicial = Math.max(Number(atualJoia.quantidadeInicial || 0), Number(item.quantidadeInicial || 0), proxima.quantidadeEstoque);
      if (proxima.quantidadeEstoque <= 0 && proxima.status !== 'reservado') proxima.status = 'vendido';
      if (proxima.quantidadeEstoque > 0 && proxima.status === 'vendido') proxima.status = 'disponível';
    }
    mapa[id] = proxima;
  });
  return Object.keys(mapa).map(function(id) { return mapa[id]; });
}

function mesclarExclusoesNoServidor(atual, recebido) {
  const tipos = ['joias','clientes','vendas','listaEspera','anotacoes','categorias','administradores'];
  const out = {};
  tipos.forEach(function(tipo) {
    out[tipo] = {};
    const aa = (atual && atual[tipo]) || {};
    const bb = (recebido && recebido[tipo]) || {};
    Object.keys(aa).forEach(function(id) { out[tipo][id] = aa[id]; });
    Object.keys(bb).forEach(function(id) {
      if (!out[tipo][id] || bb[id]._clientDirty) out[tipo][id] = bb[id];
    });
  });
  return out;
}

function removerExcluidos(lista, excluidos) {
  const mapa = excluidos || {};
  return (lista || []).filter(function(item) {
    const id = chaveRegistro(item);
    return !id || !mapa[id];
  });
}

function mesclarBancosNoServidor(atual, recebido) {
  atual = normalizarBanco(atual);
  recebido = normalizarBanco(recebido);
  const merged = normalizarBanco(atual);
  merged._deleted = mesclarExclusoesNoServidor(atual._deleted, recebido._deleted);
  merged.loja = mesclarObjetoNoServidor(atual.loja, recebido.loja);
  merged.configGerais = mesclarObjetoNoServidor(atual.configGerais, recebido.configGerais);
  merged.categorias = removerExcluidos(mesclarListaNoServidor(atual.categorias, recebido.categorias), merged._deleted.categorias);
  merged.joias = removerExcluidos(mesclarJoiasNoServidor(atual.joias, recebido.joias), merged._deleted.joias);
  merged.clientes = removerExcluidos(mesclarListaNoServidor(atual.clientes, recebido.clientes), merged._deleted.clientes);
  merged.vendas = removerExcluidos(mesclarListaNoServidor(atual.vendas, recebido.vendas), merged._deleted.vendas);
  merged.listaEspera = removerExcluidos(mesclarListaNoServidor(atual.listaEspera, recebido.listaEspera), merged._deleted.listaEspera);
  merged.anotacoes = removerExcluidos(mesclarListaNoServidor(atual.anotacoes, recebido.anotacoes), merged._deleted.anotacoes);
  merged.administradores = removerExcluidos(mesclarListaNoServidor(atual.administradores, recebido.administradores), merged._deleted.administradores);
  merged.auditoria = mesclarListaNoServidor(atual.auditoria, recebido.auditoria);
  merged.configs = Object.assign({}, atual.configs || {}, recebido.configs || {});
  merged.configs.syncRevision = Math.max(Number(atual.configs.syncRevision || 0), Number(recebido.configs.syncRevision || 0));
  return normalizarBanco(merged);
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
  const tipos = ['joias','clientes','vendas','listaEspera','anotacoes','categorias','administradores'];
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
  merged.listaEspera = mesclarListaPorData(atual.listaEspera, recebido.listaEspera, merged._deleted.listaEspera);
  merged.anotacoes = mesclarListaPorData(atual.anotacoes, recebido.anotacoes, merged._deleted.anotacoes);
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
