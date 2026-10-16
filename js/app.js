/* Financeiro Laura & Ricardo — lógica da página.
   Dados: capability `db` quando aberto no claude.ai (compartilhado); senão, localStorage. */
(function () {
  'use strict';
  const P = window.FinParsers;
  const KEY = 'financeiro-ricardo-v1';

  // ---------- utilidades ----------
  const $ = (s, el) => (el || document).querySelector(s);
  const clone = o => (o == null ? o : JSON.parse(JSON.stringify(o)));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const r2 = v => Math.round((+v || 0) * 100) / 100;
  const fmt = v => (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const brl = v => (v < 0 ? '−R$ ' : 'R$ ') + fmt(Math.abs(v));
  const sinal = v => (v < 0 ? '−' : '') + fmt(Math.abs(v));
  const k = v => { const a = Math.abs(v); const s = v < 0 ? '−' : ''; return a >= 1000 ? s + (a / 1000).toLocaleString('pt-BR', { maximumFractionDigits: a >= 10000 ? 0 : 1 }) + ' mil' : s + Math.round(a); };
  const pct = v => (isFinite(v) ? (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%' : '—');
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hoje = () => iso(new Date());
  const mesAtual = () => hoje().slice(0, 7);
  const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d || 1); };
  const diffDias = (a, b) => Math.round((parseD(b) - parseD(a)) / 864e5);
  const addMes = (m, n) => { const d = parseD(m + '-01'); d.setMonth(d.getMonth() + n); return iso(d).slice(0, 7); };
  const diasNoMes = m => { const d = parseD(m + '-01'); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); };
  const dataNoMes = (m, dia) => `${m}-${pad(Math.min(Math.max(1, +dia || 1), diasNoMes(m)))}`;
  const NOMES_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const nomeMes = m => `${NOMES_MES[+m.slice(5, 7) - 1]} de ${m.slice(0, 4)}`;
  const curto = m => `${NOMES_MES[+m.slice(5, 7) - 1].slice(0, 3)}/${m.slice(2, 4)}`;
  const diaSemana = s => ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][parseD(s).getDay()];
  const dataBR = s => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
  const uid = p => p + Math.random().toString(36).slice(2, 8);
  const lsGet = (k2, d) => { try { const v = localStorage.getItem(k2); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const lsSet = (k2, v) => { try { localStorage.setItem(k2, JSON.stringify(v)); } catch (e) { /* sem armazenamento local */ } };
  function diasUteis(de, ate) { let n = 0; const d = parseD(de); const f = parseD(ate); while (d <= f) { const w = d.getDay(); if (w && w < 6) n++; d.setDate(d.getDate() + 1); } return n; }

  const GRUPOS = { casa: 'Casa', divida: 'Dívidas', cartao: 'Cartões', empresa: 'Empresa', avulso: 'Avulsos' };
  const GRUPO_COR = { casa: 'var(--s1)', divida: 'var(--s2)', cartao: 'var(--s3)', empresa: 'var(--s4)', avulso: 'var(--faint)' };
  const CARTOES = { sicredi: 'Sicredi Black', nubank_ricardo: 'Nubank Ricardo', nubank_laura: 'Nubank Laura', mercadopago: 'Mercado Pago' };
  const COMIDA = ['mercado', 'delivery', 'restaurante', 'conveniencia'];

  // ---------- estado ----------
  const S = { config: { contas: {}, entradas: {}, geral: {}, regras: {} }, meses: {}, faturas: {}, carregado: false };
  const UI = {
    tab: lsGet(KEY + ':tab', 'inicio'), mes: mesAtual(), diaSel: null, importados: [], cen: lsGet(KEY + ':cen', { vendas: 0, semAds: false, cortes: false }),
    disp: null, ate: null, contarEntradas: true, filtroCartao: 'todos', catSel: null, editando: null, confirmar: null, fab: false, menu: false,
    editCaixa: false, somenteLeitura: false, sync: 'local', pessoa: '', sample: null, classificando: false,
  };
  if (location.hash && location.hash.length > 1) UI.tab = location.hash.slice(1);

  // ---------- armazenamento ----------
  const Store = {
    modo: 'carregando', db: null, filas: {},
    async iniciar() {
      const c = window.claude;
      if (c && typeof c.use === 'function') {
        try {
          const db = await c.use('db');
          if (db) { this.db = db; this.modo = 'nuvem'; UI.sync = 'nuvem'; this.assinar(); this.usuario(c); this.amostra(c); return; }
        } catch (e) { /* segue para o modo local */ }
      }
      this.modo = 'local'; UI.sync = 'local'; this.carregarLocal();
    },
    async usuario(c) {
      try {
        const u = await c.use('user'); if (!u) return;
        const me = await u.me(); UI.pessoa = (me && me.name) || '';
        if (u.can) { const pode = await u.can('data.write'); if (pode === false) UI.somenteLeitura = true; }
        render();
      } catch (e) { /* sem identidade */ }
    },
    async amostra(c) { try { UI.sample = await c.use('sample'); if (UI.sample && UI.tab === 'importar') render(); } catch (e) { UI.sample = null; } },
    carregarLocal() {
      let d = lsGet(KEY, null);
      if (!d && window.FIN_SEED) d = clone(window.FIN_SEED);
      aplicar(d || {}); S.carregado = true; render();
    },
    salvarLocal() { lsSet(KEY, { config: S.config, meses: S.meses, faturas: S.faturas }); },
    assinar() {
      const db = this.db; const pend = new Set(['contas', 'entradas', 'geral', 'regras', 'plano', 'meses', 'faturas']);
      const ok = (k2, snap) => { if (!snap.metadata || !snap.metadata.fromCache) pend.delete(k2); if (!pend.size) S.carregado = true; agendarRender(); };
      const erro = e => { UI.sync = 'erro'; console.warn('db', e); agendarRender(); };
      for (const k2 of ['contas', 'entradas', 'geral', 'regras', 'plano']) {
        db.doc('config/' + k2).onSnapshot(s => {
          const d = s.exists ? clone(s.data()) : {};
          S.config[k2] = (k2 === 'geral' || k2 === 'plano') ? d : (d.itens || {});
          ok(k2, s);
        }, erro);
      }
      db.collection('meses').onSnapshot(q => { S.meses = Object.fromEntries(q.docs.map(d => [d.id, clone(d.data())])); ok('meses', q); }, erro);
      db.collection('faturas').onSnapshot(q => { S.faturas = Object.fromEntries(q.docs.map(d => [d.id, clone(d.data())])); ok('faturas', q); }, erro);
      setTimeout(() => { if (!S.carregado) { S.carregado = true; render(); } }, 5000);
    },
    gravar(path, data) {
      if (this.modo !== 'nuvem') { this.salvarLocal(); return; }
      if (UI.somenteLeitura) { toast('Você tem acesso só de leitura. Peça acesso de edição a quem compartilhou.'); return; }
      const f = this.filas[path] || (this.filas[path] = { rodando: false, tem: false, prox: null });
      f.prox = data === null ? null : clone(data); f.tem = true;
      if (!f.rodando) this.drenar(path);
    },
    async drenar(path) {
      const f = this.filas[path]; f.rodando = true;
      while (f.tem) {
        const d = f.prox; f.tem = false;
        try {
          const ref = this.db.doc(path);
          if (d === null) await ref.delete(); else await ref.set(d);
          UI.sync = 'nuvem';
        } catch (e) {
          if (e && e.code === 'unavailable') { await new Promise(r => setTimeout(r, 800 + Math.random() * 800)); f.tem = true; if (!f.prox) f.prox = d; continue; }
          UI.sync = 'erro';
          if (e && e.code === 'invalid_argument') { UI.somenteLeitura = true; toast('Não foi possível salvar: este acesso é só de leitura.'); }
          else if (e && e.code === 'quota_exceeded') toast('O espaço de dados está cheio. Apague faturas antigas para liberar.');
          else toast('Não foi possível salvar agora. Tente de novo em instantes.');
        }
      }
      f.rodando = false; atualizarStatus();
    },
  };
  function aplicar(d) {
    const c = d.config || {};
    S.config = { contas: c.contas || {}, entradas: c.entradas || {}, geral: c.geral || {}, regras: c.regras || {}, plano: c.plano || {} };
    S.meses = d.meses || {}; S.faturas = d.faturas || {};
  }
  const salvarContas = () => Store.gravar('config/contas', { itens: S.config.contas });
  const salvarEntradas = () => Store.gravar('config/entradas', { itens: S.config.entradas });
  const salvarGeral = () => Store.gravar('config/geral', S.config.geral);
  const salvarPlano = () => Store.gravar('config/plano', S.config.plano);
  const salvarRegras = () => Store.gravar('config/regras', { itens: S.config.regras });
  const salvarMes = m => Store.gravar('meses/' + m, S.meses[m]);
  const salvarFatura = id => Store.gravar('faturas/' + id, S.faturas[id] || null);
  async function carregarBase() {
    const s = clone(window.FIN_SEED); if (!s) return;
    aplicar(s);
    if (Store.modo === 'nuvem') {
      salvarContas(); salvarEntradas(); salvarGeral(); salvarRegras(); salvarPlano();
      for (const id of Object.keys(S.faturas)) salvarFatura(id);
    } else Store.salvarLocal();
    toast('Base carregada.'); render();
  }

  // ---------- cálculos ----------
  const G = () => S.config.geral || {};
  const inicio = () => G().inicio || '2026-10';
  const ativo = (it, m) => (!it.inicio || it.inicio <= m) && (!it.fim || m <= it.fim);
  function mesDoc(m) { return S.meses[m] || {}; }
  function garantirMes(m) {
    const d = S.meses[m] || (S.meses[m] = {});
    d.pagos = d.pagos || {}; d.recebidos = d.recebidos || {}; d.extras = d.extras || {}; d.valores = d.valores || {};
    return d;
  }
  function faturaDoMes(cartao, m) { return Object.values(S.faturas).find(f => f.cartao === cartao && f.mes === m && !f.extrato) || null; }
  function valorConta(id, c, m) {
    const md = mesDoc(m);
    if (md.pagos && md.pagos[id] && md.pagos[id].valor != null) return md.pagos[id].valor;
    if (md.valores && md.valores[id] != null) return md.valores[id];
    if (c.cartao) { const f = faturaDoMes(c.cartao, m); if (f) return f.total; }
    if (c.cronograma && c.cronograma[m] != null) return c.cronograma[m];
    return +c.valor || 0;
  }
  function origemValor(id, c, m) {
    const md = mesDoc(m);
    if (md.pagos && md.pagos[id] && md.pagos[id].valor != null) return 'pago';
    if (md.valores && md.valores[id] != null) return 'ajustado';
    if (c.cartao && faturaDoMes(c.cartao, m)) return 'fatura';
    return 'estimado';
  }
  function valorEntrada(id, e, m) {
    const md = mesDoc(m);
    if (md.recebidos && md.recebidos[id] && md.recebidos[id].valor != null) return md.recebidos[id].valor;
    if (md.valores && md.valores[id] != null) return md.valores[id];
    return +e.valor || 0;
  }
  function status(it) {
    const d = diffDias(hoje(), it.data); it.em = d;
    if (it.feito) it.st = 'feito';
    else if (d < 0) { it.st = 'atrasado'; it.atraso = -d; }
    else if (d === 0) it.st = 'hoje';
    else if (d <= 7) it.st = 'breve';
    else it.st = 'futuro';
    return it;
  }
  function compromissos(m) {
    const md = mesDoc(m); const out = [];
    for (const [id, c] of Object.entries(S.config.contas)) {
      if (!ativo(c, m)) continue;
      out.push(status({ tipo: 'pagar', id, m, ref: c, nome: c.nome, valor: valorConta(id, c, m), data: dataNoMes(m, c.dia), feito: (md.pagos || {})[id] || null, auto: !!c.auto, grupo: c.grupo, prio: c.prio || 6 }));
    }
    for (const [id, e] of Object.entries(S.config.entradas)) {
      if (!ativo(e, m)) continue;
      out.push(status({ tipo: 'receber', id, m, ref: e, nome: e.nome, valor: valorEntrada(id, e, m), data: dataNoMes(m, e.dia), feito: (md.recebidos || {})[id] || null }));
    }
    for (const [id, x] of Object.entries(md.extras || {})) {
      out.push(status({ tipo: x.tipo === 'entrada' ? 'receber' : 'pagar', id: 'x:' + id, xid: id, m, extra: true, nome: x.desc, valor: +x.valor || 0, data: dataNoMes(m, x.dia), feito: x.feito || null, grupo: 'avulso', prio: 6 }));
    }
    return out.sort((a, b) => a.data.localeCompare(b.data) || b.valor - a.valor);
  }
  function mesesAte(m) { const out = []; let x = inicio(); while (x <= m) { out.push(x); x = addMes(x, 1); } return out; }
  function pendentesAtrasados() {
    const out = [];
    for (const m of mesesAte(mesAtual())) for (const it of compromissos(m)) if (it.st === 'atrasado') out.push(it);
    return out.sort((a, b) => b.atraso - a.atraso);
  }
  function resumoMes(m) {
    const its = compromissos(m);
    const r = { its, recebido: 0, aReceber: 0, pago: 0, aPagar: 0, receitaTotal: 0, custoTotal: 0, porGrupoPago: {}, porGrupo: {}, atrasadoPagar: 0, atrasadoReceber: 0, nAtrasoPagar: 0, nPagar: 0 };
    for (const it of its) {
      const v = it.feito && it.feito.valor != null ? it.feito.valor : it.valor;
      if (it.tipo === 'receber') {
        r.receitaTotal += v;
        if (it.st === 'feito') r.recebido += v; else { r.aReceber += v; if (it.st === 'atrasado') r.atrasadoReceber += v; }
      } else {
        r.custoTotal += v; r.nPagar++;
        r.porGrupo[it.grupo] = (r.porGrupo[it.grupo] || 0) + v;
        if (it.st === 'feito' || it.st === 'auto') { r.pago += v; r.porGrupoPago[it.grupo] = (r.porGrupoPago[it.grupo] || 0) + v; }
        else { r.aPagar += v; if (it.st === 'atrasado') { r.atrasadoPagar += v; r.nAtrasoPagar++; } }
      }
    }
    return r;
  }
  // Saldo das dívidas parceladas: parte do saldo no mês de início e abate cada parcela marcada como paga.
  function dividas() {
    const out = [];
    for (const [id, c] of Object.entries(S.config.contas)) {
      if (c.saldo == null) continue;
      let pago = 0, nPagas = 0;
      for (const [m, md] of Object.entries(S.meses)) {
        if (!md.pagos || !md.pagos[id] || m < (c.inicio || inicio())) continue;
        const v = c.parcelas ? (+c.parcelas[m] || 0) : valorConta(id, c, m);
        pago += v; if (v) nPagas++;
      }
      const atual = Math.max(0, r2(c.saldo - pago));
      const parcela = c.parcelas ? null : +c.valor || 0;
      const total = c.parcTotal ? c.parcTotal * (+c.valor || 0) : +c.saldo;
      out.push({ id, nome: c.rotuloDivida || c.nome, inicial: +c.saldo, total, atual, pago: r2(pago), nPagas, pagasAntes: c.pagasAntes || 0, parcTotal: c.parcTotal || null, noCartao: !!c.parcelas, restam: parcela ? Math.ceil(atual / parcela - 0.001) : null, fim: c.fim || (c.parcelas ? Object.keys(c.parcelas).sort().pop() : null), conferir: c.saldoConferir });
    }
    return out.sort((a, b) => b.atual - a.atual);
  }
  function emAberto() {
    let atrasado = 0, mes = 0;
    for (const it of pendentesAtrasados()) if (it.tipo === 'pagar') atrasado += it.valor;
    for (const it of compromissos(mesAtual())) if (it.tipo === 'pagar' && it.st !== 'feito' && it.st !== 'atrasado') mes += it.valor;
    return { atrasado: r2(atrasado), mes: r2(mes), total: r2(atrasado + mes) };
  }
  // Total devido sem contar duas vezes: contas em aberto (atrasadas + resto do mês) + saldo das dívidas
  // menos as parcelas dessas dívidas que já estão dentro das contas em aberto.
  function devoTotal() {
    const ab = emAberto(); let futuras = 0;
    for (const d of dividas()) {
      const c = S.config.contas[d.id]; let dentro = 0;
      for (const m of mesesAte(mesAtual())) {
        if (!ativo(c, m) || (mesDoc(m).pagos || {})[d.id]) continue;
        dentro += c.parcelas ? (+c.parcelas[m] || 0) : valorConta(d.id, c, m);
      }
      futuras += Math.max(0, d.atual - dentro);
    }
    return { contas: ab.total, futuras: r2(futuras), total: r2(ab.total + futuras) };
  }
  function painelFluxo(titulo, mesNome, linhas, frac, cor, alerta) {
    const [tot, feito, falta] = linhas;
    return `<section class="card fluxo"><div class="hd"><span class="eyebrow">${titulo} · ${esc(mesNome)}</span><span class="chip">${pct(frac)} ${titulo === 'Entradas' ? 'recebido' : 'pago'}</span></div>
      <div class="bd">
        <div class="fl-tot"><span>${tot[0]}</span><b class="num">${brl(tot[1])}</b></div>
        <div class="fl-bar" role="img" aria-label="${pct(frac)}"><span style="width:${Math.min(100, frac * 100)}%;background:${cor}"></span></div>
        <div class="fl-2">
          <div><span>${feito[0]}</span><b class="num ${feito[2]}">${brl(feito[1])}</b></div>
          <div><span>${falta[0]}</span><b class="num ${falta[2]}">${brl(falta[1])}</b></div>
        </div>
        ${alerta ? `<div class="fl-al">${esc(alerta)}</div>` : ''}
      </div></section>`;
  }
  function devoHTML() {
    const ab = emAberto(); const dv = dividas(); const totD = dv.reduce((a, d) => a + d.atual, 0);
    return `<section class="card"><div class="hd"><span class="eyebrow">Dívidas parceladas</span><span class="chip">${brl(totD)} · cai quando você marca Pago</span></div>
      <div class="bd" style="display:flex;flex-direction:column;gap:20px">
        ${dv.length ? `<div class="bars">${dv.map(d => `<div class="bar"><span class="bn">${esc(d.nome)}<small>${d.parcTotal ? `${d.pagasAntes + d.nPagas} de ${d.parcTotal} pagas · ` : ''}${d.restam != null ? `${d.restam} restante${d.restam === 1 ? '' : 's'}` : d.noCartao ? 'parcelas no cartão' : 'saldo devedor'}${d.fim ? ' · até ' + curto(d.fim) : ''}${d.conferir ? ' · conferir saldo' : ''}</small></span><span class="tr" title="${pct(1 - d.atual / (d.total || 1))} quitado"><span class="fl" style="width:${(d.atual / (d.total || 1)) * 100}%;background:var(--s2)"></span></span><span class="bv">${fmt(d.atual)}<small>${d.total > d.atual ? fmt(d.total - d.atual) + ' já pago' : 'nada abatido ainda'}</small></span></div>`).join('')}</div>` : ''}
      </div></section>`;
  }
  function receitaContratada(m) { let t = 0; for (const [id, e] of Object.entries(S.config.entradas)) if (ativo(e, m)) t += valorEntrada(id, e, m); return t; }
  function custoMes(m, cen) {
    const g = { casa: 0, divida: 0, cartao: 0, empresa: 0, avulso: 0 }; const atual = mesAtual();
    for (const [id, c] of Object.entries(S.config.contas)) {
      if (!ativo(c, m)) continue;
      let v = valorConta(id, c, m);
      if (cen && m > atual && origemValor(id, c, m) === 'estimado') {
        if (cen.semAds && c.cartao === 'nubank_ricardo') v = Math.max(0, v - (+G().metaAds || 0));
      }
      g[c.grupo || 'casa'] = (g[c.grupo || 'casa'] || 0) + v;
    }
    for (const x of Object.values(mesDoc(m).extras || {})) if (x.tipo !== 'entrada') g.avulso += +x.valor || 0;
    if (cen && cen.cortes && m > atual) g.cartao = Math.max(0, g.cartao - (+G().cortes || 0));
    g.total = g.casa + g.divida + g.cartao + g.empresa + g.avulso;
    return g;
  }
  function projecao(n, cen) {
    const atual = mesAtual(); const out = [];
    const r0 = resumoMes(atual);
    let pendAnt = 0; for (const it of pendentesAtrasados()) if (it.m < atual) pendAnt += it.tipo === 'pagar' ? -it.valor : it.valor;
    const caixa = G().caixa != null ? +G().caixa : 0;
    let acum = caixa + r0.aReceber - r0.aPagar + pendAnt;
    for (let i = 0; i < n; i++) {
      const m = addMes(atual, i);
      const contratada = receitaContratada(m);
      let extrasIn = 0; for (const x of Object.values(mesDoc(m).extras || {})) if (x.tipo === 'entrada') extrasIn += +x.valor || 0;
      const vendas = i > 0 ? (+cen.vendas || 0) : 0;
      const receita = contratada + extrasIn + vendas;
      const c = custoMes(m, cen);
      const resultado = receita - c.total;
      if (i > 0) acum += resultado;
      out.push({ m, contratada, vendas, extrasIn, receita, custos: c, custo: c.total, resultado, acum });
    }
    return { meses: out, caixaInformado: G().caixa != null, caixa };
  }
  // Fluxo dentro do mês: saldo dia a dia partindo de `inicial`.
  function fluxoMes(m, inicial, soPendentes) {
    const n = diasNoMes(m); const dias = Array.from({ length: n }, () => ({ e: 0, s: 0, itens: [] }));
    const t = hoje();
    for (const it of compromissos(m)) {
      if (soPendentes && (it.st === 'feito' || it.st === 'auto')) continue;
      let d = +it.data.slice(8, 10);
      if (soPendentes && it.data < t && m === t.slice(0, 7)) d = +t.slice(8, 10);
      const x = dias[d - 1]; x.itens.push(it);
      if (it.tipo === 'receber') x.e += it.valor; else x.s += it.valor;
    }
    let s = inicial; const saldo = [];
    for (const x of dias) { s += x.e - x.s; saldo.push(s); }
    let min = Infinity, diaMin = 1; saldo.forEach((v, i) => { if (v < min) { min = v; diaMin = i + 1; } });
    return { dias, saldo, min, diaMin };
  }
  function faturasDoMes(m) { return Object.entries(S.faturas).filter(([, f]) => f.mes === m && !f.extrato).map(([id, f]) => Object.assign({ id }, f)); }
  function itensFaturas(m, filtro) {
    const out = [];
    for (const f of faturasDoMes(m)) {
      if (filtro && filtro !== 'todos' && f.cartao !== filtro) continue;
      f.itens.forEach((it, i) => { if (it.cat !== 'ignorar' && it.cat !== 'entrada') out.push(Object.assign({ fid: f.id, idx: i, cartao: f.cartao }, it)); });
    }
    return out;
  }
  function ultimoMesComFatura() { const ms = Object.values(S.faturas).filter(f => !f.extrato).map(f => f.mes).sort(); return ms[ms.length - 1] || mesAtual(); }

  // ---------- gargalos ----------
  function gargalos() {
    const out = []; const atual = mesAtual(); const prox = addMes(atual, 1);
    const recA = receitaContratada(atual), recP = receitaContratada(prox);
    const custoP = custoMes(prox).total;
    const terminam = Object.values(S.config.entradas).filter(e => e.fim === atual);
    if (recP < recA && terminam.length) {
      const perda = terminam.reduce((a, e) => a + (+e.valor || 0), 0);
      out.push({ sev: 'critico', titulo: `A receita contratada cai ${pct(1 - recP / recA)} em ${NOMES_MES[+prox.slice(5) - 1]}`, numero: '−' + brl(perda),
        texto: `${terminam.map(e => e.nome).join(', ')} encerram em ${curto(atual)}. A receita que já está contratada passa de ${brl(recA)} para ${brl(recP)} por mês.`,
        acao: 'Prospectar para repor esses contratos é a tarefa mais importante de novembro. Cada novo cliente de R$ 2.500 reduz o gap em 10%.' });
    }
    const futuras = Object.values(S.config.entradas).filter(e => e.fim && e.fim > atual && e.fim < addMes(atual, 12)).sort((a, b) => a.fim.localeCompare(b.fim));
    if (futuras.length) {
      out.push({ sev: 'atencao', titulo: `Mais ${futuras.length > 1 ? futuras.length + ' receitas acabam' : 'uma receita acaba'} nos próximos meses`, numero: '−' + brl(futuras.reduce((a, e) => a + (+e.valor || 0), 0)) + '/mês',
        texto: futuras.map(e => `${e.nome}: último pagamento em ${curto(e.fim)} (${brl(e.valor)})`).join('. ') + '.',
        acao: 'Começar agora a conversa de renovação, ou a prospecção para substituir, antes do último pagamento.' });
    }
    const gap = custoP - recP;
    const du = diasUteis(prox + '-01', dataNoMes(prox, 31));
    out.push({ sev: gap > 0 ? 'critico' : 'ok', titulo: `A receita contratada cobre ${pct(recP / custoP)} do custo de ${NOMES_MES[+prox.slice(5) - 1]}`, numero: gap > 0 ? brl(gap) + ' a vender' : 'coberto',
      texto: `Custo previsto de ${brl(custoP)} contra ${brl(recP)} já contratados. ${gap > 0 ? `O restante precisa vir de vendas: ${brl(gap / du)} por dia útil.` : ''}`,
      acao: 'Registre as vendas em Recebimentos conforme fecham e acompanhe a meta diária na Projeção.' });
    // descompasso do calendário (mês típico partindo de zero)
    const fx = fluxoMes(prox, 0, false);
    const primeiraEntrada = fx.dias.findIndex(x => x.e > 0) + 1;
    const antes = fx.dias.slice(0, Math.max(0, primeiraEntrada - 1)).reduce((a, x) => a + x.s, 0);
    if (fx.min < 0) {
      out.push({ sev: 'atencao', titulo: `Saem ${brl(antes)} antes do primeiro recebimento do mês`, numero: 'dia ' + fx.diaMin,
        texto: `Num mês típico, condomínio, terreno, internet (dia 5) e aluguel (dia 8) vencem antes de qualquer entrada (dia ${primeiraEntrada || '—'}). O ponto mais baixo do mês é o dia ${fx.diaMin}, com ${brl(fx.min)} em relação ao início do mês.`,
        acao: `Pedir para mudar o vencimento do aluguel e do condomínio para depois do dia 10, ou manter um colchão de ${brl(-fx.min)} no começo do mês.` });
    }
    const porDia = fx.dias.map((x, i) => ({ d: i + 1, s: x.s, itens: x.itens.filter(i2 => i2.tipo === 'pagar') })).sort((a, b) => b.s - a.s)[0];
    if (porDia && porDia.s > 0) {
      out.push({ sev: 'atencao', titulo: `Dia ${porDia.d} concentra ${brl(porDia.s)} de saída`, numero: pct(porDia.s / custoP) + ' do mês',
        texto: `${porDia.itens.map(i => i.nome).join(', ')}. Esse dia sozinho pesa mais que toda a receita contratada.`,
        acao: 'Mudar o vencimento de um dos cartões para o dia 25 espalha a pressão sem cortar nada. É gratuito no app do banco.' });
    }
    // juros e multas
    const mf = ultimoMesComFatura(); const its = itensFaturas(mf);
    const juros = its.filter(i => i.cat === 'juros').reduce((a, i) => a + i.v, 0);
    const casaCartao = its.filter(i => i.cat === 'contas_casa');
    if (juros > 0.5 || casaCartao.length) {
      const cartoesJ = [...new Set(its.filter(i => i.cat === 'juros' && i.v > 0).map(i => CARTOES[i.cartao] || i.cartao))];
      out.push({ sev: 'critico', titulo: 'Juros e multas por atraso nos cartões', numero: brl(juros + (casaCartao.length ? 40.09 : 0)),
        texto: `Em ${curto(mf)}: ${brl(juros)} de multa, juros e IOF por atraso (${cartoesJ.join(' e ') || 'cartões'}).${casaCartao.length ? ` A conta de luz de ${brl(709.43)} foi parcelada no Nubank da Laura com R$ 35,17 de juros e R$ 4,92 de IOF.` : ''} Os dois Nubanks foram pagos com atraso no mesmo mês.`,
        acao: 'Mudar o vencimento dos dois Nubanks no app para depois do dia 10, quando entra o dinheiro. Nunca pagar boleto de conta no cartão parcelado.' });
    }
    // tráfego
    const trafego = its.filter(i => i.cat === 'trafego');
    const tTotal = trafego.reduce((a, i) => a + i.v, 0);
    if (tTotal > 0) {
      const zouti = Object.values(S.config.entradas).filter(e => /zouti/i.test(e.nome) && ativo(e, prox)).reduce((a, e) => a + (+e.valor || 0), 0);
      out.push({ sev: 'critico', titulo: `${brl(tTotal)} de anúncios no cartão pessoal`, numero: trafego.length + ' cobranças',
        texto: `Anúncios do Meta respondem por ${pct(tTotal / its.filter(i => i.cartao === 'nubank_ricardo').reduce((a, i) => a + i.v, 0))} da fatura do Nubank do Ricardo.${zouti ? ` Se esse tráfego é o que gera as vendas da Zouti (${brl(zouti)}/mês), cada R$ 1 investido está voltando R$ ${(zouti / tTotal).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}.` : ''} E vira fatura de cartão, a conta que não pode atrasar.`,
        acao: 'Separar: se o anúncio é de cliente, cobrar o repasse antes do vencimento do cartão. Se é para as vendas próprias, pausar as campanhas que não se pagam e pôr um teto mensal.' });
    }
    // comida
    const consumo = its.filter(i => i.cat !== 'parcelas' && i.esc !== 'empresa').reduce((a, i) => a + i.v, 0);
    const comida = its.filter(i => COMIDA.includes(i.cat));
    const cTotal = comida.reduce((a, i) => a + i.v, 0);
    const migalhas = its.filter(i => ['delivery', 'conveniencia'].includes(i.cat) && i.v > 0);
    if (cTotal > 0) {
      out.push({ sev: 'atencao', titulo: `Comida é ${pct(cTotal / consumo)} do consumo da casa nos cartões`, numero: brl(cTotal),
        texto: `Mercado, delivery, restaurante e conveniência em ${curto(mf)}. São ${migalhas.length} pedidos de delivery e idas à conveniência, ticket médio de ${brl(migalhas.reduce((a, i) => a + i.v, 0) / (migalhas.length || 1))}. O problema é a frequência, não o tamanho da compra.`,
        acao: 'Teto de envelope: delivery R$ 170, conveniência R$ 85, restaurante R$ 280 por mês. Uma compra grande no atacado por semana.' });
    }
    // assinaturas sobrepostas
    const servicos = { 'Google One': /GOOGLE (ONE|G1)/, 'Claude': /ANTHROPIC|CLAUDE/, 'Apple': /APPLE/, 'Academia': /IRONBERG|WELLHUB|GYMPASS|SMART ?FIT/ };
    const dup = [];
    for (const [nm, re] of Object.entries(servicos)) {
      const hits = its.filter(i => re.test(P.normaliza(i.desc)) && i.v > 0 && !/^IOF/.test(P.normaliza(i.desc)));
      const cartoes = new Set(hits.map(h => h.cartao + (h.pes || '')));
      if (hits.length > 1 && cartoes.size > 1 || hits.length > 2) dup.push({ nm, n: hits.length, v: hits.reduce((a, h) => a + h.v, 0), onde: [...new Set(hits.map(h => CARTOES[h.cartao]))].join(', ') });
    }
    if (dup.length) {
      out.push({ sev: 'atencao', titulo: 'Serviços pagos em dobro', numero: brl(dup.reduce((a, d) => a + d.v, 0)),
        texto: dup.map(d => `${d.nm}: ${d.n} cobranças (${brl(d.v)}) em ${d.onde}`).join('. ') + '.',
        acao: 'Ficar com um plano familiar de cada serviço. Duas academias e duas assinaturas de IA podem ser escolha consciente: confirme.' });
    }
    // novos parcelamentos
    const novos = its.filter(i => i.novoParc && i.cat !== 'contas_casa');
    if (novos.length) {
      out.push({ sev: 'atencao', titulo: `${novos.length} compra${novos.length > 1 ? 's' : ''} parcelada${novos.length > 1 ? 's' : ''} nova${novos.length > 1 ? 's' : ''} este mês`, numero: brl(novos.reduce((a, i) => a + i.v, 0)) + '/mês',
        texto: novos.map(i => `${i.desc} (${i.parc})`).join(', ') + '. Cada parcela nova empurra a queda da fatura para mais longe.',
        acao: 'Regra da casa: nada novo parcelado até jul/27, quando as parcelas antigas do Sicredi zeram.' });
    }
    // empresa nos cartões pessoais
    const emp = its.filter(i => i.esc === 'empresa').reduce((a, i) => a + i.v, 0);
    if (emp > 0) {
      out.push({ sev: 'atencao', titulo: 'Custo da empresa misturado nos cartões da casa', numero: brl(emp),
        texto: `Anúncios, Anthropic, OpenAI, ElevenLabs, Hostinger, Canva e a agência Jim.com somam ${brl(emp)} em ${curto(mf)} nos cartões pessoais. Assim a empresa parece dar mais lucro do que dá, e a casa parece gastar mais do que gasta.`,
        acao: 'Um cartão só para a empresa (o MEI tem direito). Até lá, o sistema já separa: veja em Custos com o filtro Empresa.' });
    }
    // carro
    const carroCartao = its.filter(i => ['combustivel', 'seguro_carro', 'manut_carro', 'transporte'].includes(i.cat)).reduce((a, i) => a + i.v, 0);
    const parcela = (S.config.contas.carro && ativo(S.config.contas.carro, prox)) ? +S.config.contas.carro.valor : 0;
    const mae = Object.values(S.config.entradas).filter(e => /m[ãa]e/i.test(e.nome) && ativo(e, prox)).reduce((a, e) => a + (+e.valor || 0), 0);
    if (parcela) {
      out.push({ sev: 'atencao', titulo: `O carro custa ${brl(parcela + carroCartao)} por mês`, numero: pct((parcela + carroCartao) / (recP || 1)) + ' da receita',
        texto: `Parcela de ${brl(parcela)} até fev/2030 mais ${brl(carroCartao)} de seguro, combustível, manutenção, pedágio e estacionamento. ${mae ? `A ajuda de ${brl(mae)} da sua mãe cobre ${pct(mae / (parcela + carroCartao))}.` : ''}`,
        acao: 'Pedir a taxa e o saldo devedor do financiamento para simular portabilidade. São R$ 102.500 em aberto.' });
    }
    // concentração de clientes
    const ent = Object.values(S.config.entradas).filter(e => ativo(e, prox)).sort((a, b) => b.valor - a.valor);
    if (ent.length) {
      const top = ent[0];
      out.push({ sev: top.valor / recP > 0.25 ? 'atencao' : 'ok', titulo: `${top.nome} é ${pct(top.valor / recP)} da receita contratada`, numero: brl(top.valor),
        texto: `A partir de ${NOMES_MES[+prox.slice(5) - 1]}, ${ent.length} fontes de receita. Perder a maior delas abriria mais ${brl(top.valor)} de gap por mês.`,
        acao: 'Manter contrato assinado com prazo e aviso prévio de 30 dias com os maiores clientes.' });
    }
    const ordem = { critico: 0, atencao: 1, ok: 2 };
    return out.sort((a, b) => ordem[a.sev] - ordem[b.sev]);
  }

  // ---------- gráficos (SVG) ----------
  const CHARTS = {};
  const estreito = () => window.innerWidth < 640;
  function ticks(min, max, n) {
    if (min === max) { max = min + 1; }
    const span = max - min; const step0 = span / n; const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map(x => x * mag).find(x => x >= step0) || step0;
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
    const out = []; for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 100) / 100);
    return out;
  }
  function chartLinhas(o) {
    const W = estreito() ? 460 : 760, H = o.h || 260, L = 50, R = o.right || (estreito() ? 70 : 110), T = 16, B = 30; const n = o.labels.length;
    if (estreito()) o.maxLabels = Math.min(o.maxLabels || 12, 6);
    const all = o.series.flatMap(s => s.valores); if (o.zero) all.push(0);
    const tk = ticks(Math.min(...all), Math.max(...all), 4);
    const y0 = tk[0], y1 = tk[tk.length - 1];
    const X = i => L + (n === 1 ? 0 : i * (W - L - R) / (n - 1));
    const Y = v => T + (H - T - B) * (1 - (v - y0) / (y1 - y0));
    let g = `<g class="grid">${tk.map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/>`).join('')}</g>`;
    g += tk.map(v => `<text class="ax" x="${L - 8}" y="${Y(v) + 4}" text-anchor="end">${k(v)}</text>`).join('');
    if (o.zero && y0 < 0 && y1 > 0) g += `<line class="zero" x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}"/>`;
    const every = Math.ceil(n / (o.maxLabels || 12));
    g += o.labels.map((l, i) => (i % every === 0 || i === n - 1) ? `<text class="ax" x="${X(i)}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>` : '').join('');
    const ends = [];
    o.series.forEach((s, si) => {
      const pts = s.valores.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`);
      if (s.area) {
        const base = Y(Math.max(y0, Math.min(0, y1)));
        g += `<path d="M${X(0)},${base} L${pts.join(' L')} L${X(n - 1)},${base} Z" fill="${s.cor}" fill-opacity="0.12" stroke="none"/>`;
      }
      g += `<path d="M${pts.join(' L')}" fill="none" stroke="${s.cor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" ${s.tracejado ? 'stroke-dasharray="5 4"' : ''}/>`;
      const lv = s.valores[n - 1]; ends.push({ y: Y(lv), s, lv, si });
      g += `<circle cx="${X(n - 1)}" cy="${Y(lv)}" r="4" fill="${s.cor}" stroke="var(--surface)" stroke-width="2"/>`;
    });
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 30) ends[i].y = ends[i - 1].y + 30;
    for (const e of ends) g += `<text class="lbl" x="${W - R + 10}" y="${e.y - 2}">${esc(e.s.nome)}</text><text class="lbl2" x="${W - R + 10}" y="${e.y + 13}">${k(e.lv)}</text>`;
    if (o.marca) { const { i, txt } = o.marca; const v = o.series[0].valores[i]; g += `<circle cx="${X(i)}" cy="${Y(v)}" r="5" fill="var(--bad)" stroke="var(--surface)" stroke-width="2"/><text class="lbl2" x="${X(i)}" y="${Y(v) + 20}" text-anchor="middle">${esc(txt)}</text>`; }
    g += `<line class="xh" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/><g class="dots"></g>`;
    CHARTS[o.id] = { L, W, R, n, X, Y, series: o.series, tip: o.tip };
    return `<div class="chart" data-chart="${o.id}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria || '')}">${g}<rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent" class="hit"/></svg></div>`;
  }
  function chartColunas(o) {
    const W = estreito() ? 460 : 760, H = o.h || 240, L = 50, R = 12, T = 22, B = 30; const n = o.labels.length;
    if (estreito() && n > 8) o.rotular = false;
    const stacks = o.labels.map((_, i) => o.grupos.reduce((a, gr) => a + Math.max(0, gr.valores[i]), 0));
    const neg = o.valores ? Math.min(0, ...o.valores) : 0;
    const tk = ticks(o.valores ? Math.min(0, ...o.valores) : 0, o.valores ? Math.max(0, ...o.valores) : Math.max(...stacks), 4);
    const y0 = tk[0], y1 = tk[tk.length - 1];
    const bw = (W - L - R) / n; const w = Math.min(44, bw * 0.62);
    const X = i => L + bw * i + bw / 2;
    const Y = v => T + (H - T - B) * (1 - (v - y0) / (y1 - y0));
    let g = `<g class="grid">${tk.map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/>`).join('')}</g>`;
    g += tk.map(v => `<text class="ax" x="${L - 8}" y="${Y(v) + 4}" text-anchor="end">${k(v)}</text>`).join('');
    const ev = estreito() && n > 8 ? 2 : 1;
    g += o.labels.map((l, i) => i % ev ? '' : `<text class="ax" x="${X(i)}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>`).join('');
    if (o.valores) {
      o.valores.forEach((v, i) => {
        const top = Y(Math.max(0, v)), bot = Y(Math.min(0, v)); const hgt = Math.max(1, bot - top);
        const cor = v < 0 ? 'var(--bad)' : 'var(--good)';
        g += `<rect x="${X(i) - w / 2}" y="${top}" width="${w}" height="${hgt}" rx="4" fill="${cor}" fill-opacity="0.85"/>`;
        if (o.rotular) g += `<text class="lbl2" x="${X(i)}" y="${v < 0 ? bot + 14 : top - 6}" text-anchor="middle">${k(v)}</text>`;
      });
      if (neg < 0) g += `<line class="zero" x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}"/>`;
    } else {
      o.labels.forEach((_, i) => {
        let acc = 0;
        o.grupos.forEach(gr => {
          const v = Math.max(0, gr.valores[i]); if (!v) return;
          const top = Y(acc + v), bot = Y(acc); acc += v;
          g += `<rect x="${X(i) - w / 2}" y="${top + 1}" width="${w}" height="${Math.max(0.5, bot - top - 2)}" rx="3" fill="${gr.cor}"/>`;
        });
        if (o.rotular) g += `<text class="lbl2" x="${X(i)}" y="${Y(acc) - 6}" text-anchor="middle">${k(acc)}</text>`;
      });
    }
    g += `<line class="xh" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>`;
    CHARTS[o.id] = { L, W, R, n, X: i => X(i), colunas: true, bw, tip: o.tip };
    return `<div class="chart" data-chart="${o.id}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria || '')}">${g}<rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent" class="hit"/></svg></div>`;
  }
  function ligarGraficos() {
    document.querySelectorAll('.chart[data-chart]').forEach(el => {
      const c = CHARTS[el.dataset.chart]; if (!c) return;
      const svg = el.querySelector('svg'); const xh = svg.querySelector('.xh'); const dots = svg.querySelector('.dots');
      const mover = ev => {
        const r = svg.getBoundingClientRect(); const sx = (ev.clientX - r.left) / r.width * c.W;
        let i = c.colunas ? Math.floor((sx - c.L) / c.bw) : Math.round((sx - c.L) / ((c.W - c.L - c.R) / Math.max(1, c.n - 1)));
        i = Math.max(0, Math.min(c.n - 1, i));
        const x = c.X(i); xh.setAttribute('x1', x); xh.setAttribute('x2', x); xh.setAttribute('visibility', 'visible');
        if (dots && c.series) dots.innerHTML = c.series.map(s => `<circle cx="${x}" cy="${c.Y(s.valores[i])}" r="5" fill="${s.cor}" stroke="var(--surface)" stroke-width="2"/>`).join('');
        const tip = $('#tip') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'tip', className: 'tip' }));
        tip.innerHTML = c.tip(i); tip.hidden = false;
        const tw = tip.offsetWidth, th = tip.offsetHeight;
        let lx = ev.clientX + 16; if (lx + tw > window.innerWidth - 8) lx = ev.clientX - tw - 16;
        let ly = ev.clientY - th - 12; if (ly < 8) ly = ev.clientY + 18;
        tip.style.left = Math.max(8, lx) + 'px'; tip.style.top = ly + 'px';
      };
      const sair = () => { xh.setAttribute('visibility', 'hidden'); if (dots) dots.innerHTML = ''; const t = $('#tip'); if (t) t.hidden = true; };
      svg.addEventListener('pointermove', mover); svg.addEventListener('pointerdown', mover); svg.addEventListener('pointerleave', sair);
    });
  }
  const tipRow = (cor, nome, v) => `<div class="r"><span>${cor ? `<i style="background:${cor}"></i>` : ''}${esc(nome)}</span><b style="margin:0;font:inherit;letter-spacing:0;text-transform:none;color:var(--fg)">${brl(v)}</b></div>`;

  // ---------- componentes ----------
  const ICON = {
    inicio: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
    agenda: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 9.5h16M8.5 3v4M15.5 3v4"/>',
    recebimentos: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
    contas: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19.5h14"/>',
    custos: '<path d="M5 19.5h14M7 16V11M11 16V7M15 16v-6M19 16V5"/>',
    projecao: '<path d="M4 19.5h16M5 15l4.5-4.5 3.5 3L19 7.5M15 7.5h4v4"/>',
    importar: '<path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5v4h4M10 14l2.5 2.5L15 14M12.5 10.5v6"/>',
    prioridade: '<path d="M12 4 4 8l8 4 8-4-8-4ZM4 12l8 4 8-4M4 16l8 4 8-4"/>',
    gargalos: '<path d="M12 4 3.5 19h17L12 4Z"/><path d="M12 10v4.5M12 17h.01"/>',
    plano: '<path d="M6 4h12v16H6z"/><path d="M9 8.5h6M9 12h6M9 15.5h3.5"/>',
  };
  const TABS = [
    ['inicio', 'Início'], ['agenda', 'Agenda'], ['recebimentos', 'Recebimentos'], ['contas', 'Contas a pagar'], ['custos', 'Custos'],
    ['projecao', 'Projeção'], ['importar', 'Importar faturas'], ['prioridade', 'Se faltar dinheiro'], ['gargalos', 'Gargalos'], ['plano', 'Plano e histórico'],
  ];
  function renderNav() {
    const atrasos = S.carregado ? pendentesAtrasados() : [];
    $('#nav').innerHTML = TABS.map(([id, nm]) => {
      let badge = '';
      if (id === 'agenda' && atrasos.length) badge = `<span class="badge" title="${atrasos.length} em atraso">${atrasos.length}</span>`;
      return `<button type="button" data-tab="${id}" ${UI.tab === id ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[id]}</svg>${nm}${badge}</button>`;
    }).join('');
    const nuvem = Store.modo === 'nuvem';
    const st = UI.sync === 'erro' ? ['err', 'ERRO AO SALVAR'] : nuvem ? ['', 'NO AR'] : ['off', 'SÓ NESTE NAVEGADOR'];
    $('#whoami').innerHTML = `<div class="st"><span class="dot ${st[0]}"></span><span>${st[1]}</span></div>
      <div class="n">${esc(UI.pessoa || (nuvem ? 'Laura e Ricardo' : 'Ricardo'))}</div>
      <div class="s">${nuvem ? (UI.somenteLeitura ? 'Acesso só de leitura' : 'Dados compartilhados entre vocês') : 'Os dados ficam salvos neste navegador'}</div>`;
  }
  function anel(frac, cor, txt) {
    const r = 18, c = 2 * Math.PI * r; const f = Math.max(0, Math.min(1, frac || 0));
    return `<svg viewBox="0 0 46 46" aria-hidden="true"><circle cx="23" cy="23" r="${r}" fill="none" stroke="var(--line-2)" stroke-width="3"/><circle cx="23" cy="23" r="${r}" fill="none" stroke="${cor}" stroke-width="3" stroke-linecap="round" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 23 23)"/><text x="23" y="27.5" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="12" font-weight="600" fill="var(--fg)">${txt}</text></svg>`;
  }
  function atualizarStatus() {
    if (!S.carregado) return;
    const at = pendentesAtrasados().filter(i => i.tipo === 'pagar');
    const atR = pendentesAtrasados().filter(i => i.tipo === 'receber');
    const its = compromissos(mesAtual()).filter(i => i.tipo === 'pagar');
    const breve = its.filter(i => ['hoje', 'breve'].includes(i.st));
    const caixa = G().caixa;
    const nuvem = Store.modo === 'nuvem';
    $('#statusbar').innerHTML = `
      <button class="ring" type="button" data-tab="agenda" title="Contas vencidas e não marcadas como pagas">${anel(its.length ? at.length / its.length : 0, 'var(--bad)', at.length)}<span><span class="rl">Em atraso</span><br><span class="rv">${at.length} / ${its.length} · ${k(at.reduce((a, i) => a + i.valor, 0))}</span></span></button>
      <button class="ring" type="button" data-tab="agenda" title="Contas que vencem hoje e nos próximos 7 dias">${anel(its.length ? breve.length / its.length : 0, 'var(--accent)', breve.length)}<span><span class="rl">Vencem em 7 dias</span><br><span class="rv">${breve.length} · ${k(breve.reduce((a, i) => a + i.valor, 0))}</span></span></button>
      <button class="ring" type="button" data-tab="recebimentos" title="Recebimentos com data passada e não marcados">${anel(atR.length ? 1 : 0, 'var(--warn)', atR.length)}<span><span class="rl">A receber atrasado</span><br><span class="rv">${atR.length} · ${k(atR.reduce((a, i) => a + i.valor, 0))}</span></span></button>
      <span class="sp"></span>
      <button class="pill hide-sm" type="button" data-act="caixa-editar" title="Atualizar o saldo em conta">Caixa <b>${caixa != null ? brl(+caixa) : 'informar'}</b></button>
      <span class="pill hide-sm hide-md"><span class="dot ${UI.sync === 'erro' ? 'err' : nuvem ? '' : 'off'}"></span>${UI.sync === 'erro' ? 'Erro ao salvar' : nuvem ? 'Sistema no ar' : 'Salvo no navegador'}</span>`;
  }
  function chave(it) {
    const ok = it.st === 'feito';
    const [a, b] = it.tipo === 'receber' ? ['A receber', 'Recebido'] : ['Pendente', 'Pago'];
    const at = `data-tipo="${it.tipo}" data-id="${esc(it.id)}" data-m="${it.m}"`;
    return `<div class="tg" role="group" aria-label="Situação de ${esc(it.nome)}"><button type="button" class="tg-p" ${ok ? `data-act="desfazer" ${at}` : ''} aria-pressed="${!ok}">${a}</button><button type="button" class="tg-ok" ${ok ? '' : `data-act="feito" ${at}`} aria-pressed="${ok}">${b}</button></div>`;
  }
  function chipStatus(it) {
    if (it.st === 'feito') return `<span class="chip good">${it.tipo === 'receber' ? 'recebido' : 'pago'}${it.feito.em ? ' ' + dataBR(it.feito.em) : ''}</span>`;

    if (it.st === 'atrasado') return `<span class="chip bad">atrasado há ${it.atraso} dia${it.atraso > 1 ? 's' : ''}</span>`;
    if (it.st === 'hoje') return `<span class="chip warn">${it.tipo === 'receber' ? 'entra hoje' : 'vence hoje'}</span>`;
    if (it.st === 'breve') return `<span class="chip gold">em ${it.em} dia${it.em > 1 ? 's' : ''}</span>`;
    return `<span class="chip">dia ${+it.data.slice(8)}</span>`;
  }
  function itemLinha(it, opts) {
    opts = opts || {};
    const sub = opts.sub || `${diaSemana(it.data)}, ${dataBR(it.data)}${it.m !== UI.mes && it.m !== mesAtual() ? ' · ' + curto(it.m) : ''}${it.ref && it.ref.conferir ? ' · conferir' : ''}`;
    const acao = chave(it);
    return `<div class="it"><div class="ic ${it.tipo === 'receber' ? 'in' : 'out'}" aria-hidden="true">${it.tipo === 'receber' ? '↓' : '↑'}</div>
      <div style="min-width:0"><div class="nm">${esc(it.nome)}</div><div class="meta">${sub} ${chipStatus(it)}</div></div>
      <div class="val ${it.tipo === 'receber' ? 'pos' : ''}">${it.tipo === 'receber' ? '+' : '−'}${fmt(it.valor)}</div>
      <div class="row-actions">${opts.semAcao ? '' : acao}</div></div>`;
  }
  function pageHead(titulo, sub, comMes) {
    return `<div class="topbar"><button type="button" data-act="menu" aria-label="Abrir menu"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button><span class="nm">Financeiro</span></div>
      <div class="pagehead"><div><h1>${titulo}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${comMes ? mesNav() : ''}</div>`;
  }
  function mesNav() { return `<div class="mesnav"><button type="button" data-act="mes" data-d="-1" aria-label="Mês anterior">‹</button><span>${nomeMes(UI.mes)}</span><button type="button" data-act="mes" data-d="1" aria-label="Próximo mês">›</button></div>`; }

  // ---------- telas ----------
  function telaInicio() {
    const m = UI.mes; const r = resumoMes(m); const caixa = G().caixa;
    const fimPrev = (caixa != null ? +caixa : 0) + r.aReceber - r.aPagar;
    const atras = pendentesAtrasados();
    const prox = compromissos(mesAtual()).filter(i => ['hoje', 'breve'].includes(i.st));
    if (diffDias(hoje(), dataNoMes(addMes(mesAtual(), 1), 1)) <= 7) prox.push(...compromissos(addMes(mesAtual(), 1)).filter(i => ['hoje', 'breve'].includes(i.st)));
    const fats = faturasDoMes(m);
    const pessoas = {};
    for (const f of fats) for (const it of f.itens) { if (it.cat === 'ignorar' || it.cat === 'entrada') continue; const p = it.esc === 'empresa' ? 'Empresa (dentro dos cartões)' : (it.pes || CARTOES[f.cartao]); pessoas[p] = (pessoas[p] || 0) + it.v; }
    const garg = gargalos().slice(0, 3);
    const passado = m < mesAtual();
    return `${pageHead(`Olá${UI.pessoa ? ', ' + esc(UI.pessoa.split(' ')[0]) : ''}. Hoje é ${diaSemana(hoje())}, ${dataBR(hoje())}.`, 'O que entra, o que sai e o que precisa de atenção agora.', true)}
    <div class="grid g2">
      ${painelFluxo('Entradas', nomeMes(m), [['Faturamento total', r.receitaTotal, ''], ['Já recebi', r.recebido, 'pos'], ['Falta receber', r.aReceber, r.aReceber ? 'warn' : 'pos']], r.receitaTotal ? r.recebido / r.receitaTotal : 0, 'var(--good)', r.atrasadoReceber ? `${brl(r.atrasadoReceber)} com data passada` : '')}
      ${painelFluxo('Saídas', nomeMes(m), [['Despesa total', r.custoTotal, ''], ['Já paguei', r.pago, 'pos'], ['Falta pagar', r.aPagar, r.aPagar ? 'neg' : 'pos']], r.custoTotal ? r.pago / r.custoTotal : 0, 'var(--s2)', r.atrasadoPagar ? `${brl(r.atrasadoPagar)} já venceu e não foi pago` : '')}
    </div>
    <section class="card resumo"><div class="bd"><div class="stats" style="justify-content:space-between">
      <div><span class="eyebrow">Resultado do mês</span><span class="sv2 ${r.receitaTotal - r.custoTotal < 0 ? 'neg' : 'pos'}">${brl(r.receitaTotal - r.custoTotal)}</span><span class="faint" style="font-size:12.5px">faturamento − despesa</span></div>
      <div><span class="eyebrow">Caixa hoje</span>${UI.editCaixa ? `<form data-form="caixa" style="display:flex;gap:8px;margin-top:2px"><input class="inp v" id="inp-caixa" inputmode="decimal" value="${caixa != null ? fmt(caixa) : ''}" placeholder="0,00" aria-label="Saldo em conta hoje"><button class="btn pri sm" type="submit">Salvar</button></form>` : `<span class="sv2">${caixa != null ? brl(+caixa) : '—'}</span><button class="link" type="button" data-act="caixa-editar" style="align-self:flex-start">${caixa != null ? 'atualizar' : 'informar'}</button>`}</div>
      <div><span class="eyebrow">Fim do mês previsto</span><span class="sv2 ${fimPrev < 0 ? 'neg' : 'pos'}">${brl(fimPrev)}</span><span class="faint" style="font-size:12.5px">caixa + falta receber − falta pagar</span></div>
      <div><span class="eyebrow">Devo no total</span><span class="sv2">${brl(devoTotal().total)}</span><span class="faint" style="font-size:12.5px">contas do mês + dívidas parceladas</span></div>
    </div></div></section>
    ${devoHTML()}
    <div class="grid g2">
      <section class="card"><div class="hd"><span class="eyebrow">Como ${nomeMes(m)} ${passado ? 'fechou' : 'está fechando'}</span><span class="chip">${r.its.filter(i => i.st === 'feito' || i.st === 'auto').length} de ${r.its.length} marcados</span></div>
        <div class="bd"><div class="dre">
          <div class="row b"><span>Entrou no caixa</span><span class="v pos">${fmt(r.recebido)}</span></div>
          <div class="row"><span>(−) Saiu em contas da casa</span><span class="v neg">${sinal(-(r.porGrupoPago.casa || 0))}</span></div>
          <div class="row"><span>(−) Saiu em dívidas</span><span class="v neg">${sinal(-(r.porGrupoPago.divida || 0))}</span></div>
          <div class="row"><span>(−) Saiu em cartões</span><span class="v neg">${sinal(-(r.porGrupoPago.cartao || 0))}</span></div>
          <div class="row"><span>(−) Saiu na empresa</span><span class="v neg">${sinal(-((r.porGrupoPago.empresa || 0) + (r.porGrupoPago.avulso || 0)))}</span></div>
          <div class="row tot"><span>Geração de caixa</span><span class="v gold">${sinal(r.recebido - r.pago)}</span></div>
          <div class="row"><span>Receita prevista no mês</span><span class="v">${fmt(r.receitaTotal)}</span></div>
          <div class="row"><span>Custo previsto no mês</span><span class="v">${fmt(r.custoTotal)}</span></div>
          <div class="row"><span>Cobertura da receita</span><span class="v ${r.receitaTotal < r.custoTotal ? 'neg' : 'pos'}">${pct(r.receitaTotal / (r.custoTotal || 1))}</span></div>
          ${Object.keys(pessoas).length ? `<div class="eyebrow sec">Gasto nos cartões no mês</div>
            ${Object.entries(pessoas).sort((a, b) => b[1] - a[1]).map(([p, v]) => `<div class="row sm"><span>${esc(p)}</span><span class="v">${fmt(v)}</span></div>`).join('')}
            <div class="row tot" style="font-size:17px"><span>Total das faturas</span><span class="v" style="font-size:20px">${fmt(fats.reduce((a, f) => a + f.total, 0))}</span></div>` : `<div class="callout" style="margin-top:14px">Nenhuma fatura de ${nomeMes(m)} importada ainda. <button class="link" type="button" data-tab="importar">Importar agora</button></div>`}
        </div></div></section>
      <div class="grid" style="align-content:start">
        <section class="card"><div class="hd"><span class="eyebrow">Atrasados</span>${atras.length ? (() => { const cp = atras.filter(i => i.tipo === 'pagar'), cr = atras.filter(i => i.tipo === 'receber'); return `<span style="display:flex;gap:6px;flex-wrap:wrap">${cp.length ? `<span class="chip bad">${cp.length} a pagar · ${k(cp.reduce((a, i) => a + i.valor, 0))}</span>` : ''}${cr.length ? `<span class="chip warn">${cr.length} a receber · ${k(cr.reduce((a, i) => a + i.valor, 0))}</span>` : ''}</span>`; })() : '<span class="chip good">nada em atraso</span>'}</div>
          <div class="bd">${atras.length ? `<div class="lst">${atras.slice(0, 8).map(i => itemLinha(i)).join('')}</div>${atras.length > 8 ? `<p class="p" style="margin-top:10px"><button class="link" type="button" data-tab="agenda">Ver os ${atras.length}</button></p>` : ''}
            ${atras.length > 2 ? `<div class="row-actions" style="justify-content:flex-start;margin-top:14px"><button class="btn sm" type="button" data-act="tudo-pago">Marcar todas as contas vencidas como pagas</button></div>` : ''}` : '<p class="p">Todas as contas e recebimentos com data passada estão marcados.</p>'}</div></section>
        <section class="card"><div class="hd"><span class="eyebrow">Hoje e próximos 7 dias</span></div>
          <div class="bd">${prox.length ? `<div class="lst">${prox.map(i => itemLinha(i)).join('')}</div>` : '<p class="p">Nada vence nos próximos 7 dias.</p>'}</div></section>
      </div>
    </div>
    <section class="card"><div class="hd"><span class="eyebrow">Leitura do mês</span><button class="link" type="button" data-tab="gargalos">Todos os gargalos</button></div>
      <div class="bd flush">${garg.map(gargHTML).join('')}</div></section>`;
  }
  function gargHTML(g) {
    return `<div class="garg ${g.sev}"><div class="sv" aria-hidden="true"></div><div class="gt"><h3>${esc(g.titulo)}</h3><span class="gn num">${esc(g.numero)}</span></div><p>${esc(g.texto)}</p><div class="acao"><b>${g.sev === 'critico' ? 'Crítico' : g.sev === 'atencao' ? 'Atenção' : 'Ok'} · O que fazer</b><span>${esc(g.acao)}</span></div></div>`;
  }

  function telaAgenda() {
    const m = UI.mes; const its = compromissos(m); const n = diasNoMes(m);
    const ini = parseD(m + '-01').getDay(); const t = hoje();
    const porDia = {}; for (const it of its) (porDia[+it.data.slice(8)] = porDia[+it.data.slice(8)] || []).push(it);
    let cells = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'].map(d => `<div class="wd">${d}</div>`).join('');
    for (let i = 0; i < ini; i++) cells += '<div class="day vazio"></div>';
    for (let d = 1; d <= n; d++) {
      const l = porDia[d] || []; const e = l.filter(i => i.tipo === 'receber').reduce((a, i) => a + i.valor, 0); const s = l.filter(i => i.tipo === 'pagar').reduce((a, i) => a + i.valor, 0);
      const late = l.some(i => i.st === 'atrasado');
      cells += `<button type="button" class="day ${`${m}-${pad(d)}` === t ? 'hoje' : ''} ${UI.diaSel === d ? 'sel' : ''}" data-act="dia" data-d="${d}" aria-label="Dia ${d}: entra ${fmt(e)}, sai ${fmt(s)}">
        <span class="dn">${d}${late ? '<span class="late" title="tem atraso"></span>' : ''}</span>${e ? `<span class="a pos">+${k(e)}</span>` : ''}${s ? `<span class="a neg">−${k(s)}</span>` : ''}</button>`;
    }
    const sel = UI.diaSel ? (porDia[UI.diaSel] || []) : null;
    const caixa = G().caixa != null ? +G().caixa : 0;
    const atual = m === mesAtual();
    const fx = fluxoMes(m, atual ? caixa : 0, atual);
    const labels = Array.from({ length: n }, (_, i) => String(i + 1));
    const chart = chartLinhas({ id: 'fluxo', labels, series: [{ nome: 'Saldo', cor: 'var(--s1)', valores: fx.saldo, area: true }], zero: true, h: 230, maxLabels: 16,
      marca: { i: fx.diaMin - 1, txt: 'menor saldo' }, aria: 'Saldo previsto dia a dia',
      tip: i => `<b>Dia ${i + 1}</b>${fx.dias[i].e ? tipRow('var(--good)', 'Entra', fx.dias[i].e) : ''}${fx.dias[i].s ? tipRow('var(--bad)', 'Sai', fx.dias[i].s) : ''}${tipRow('var(--s1)', 'Saldo', fx.saldo[i])}${fx.dias[i].itens.slice(0, 5).map(x => `<div class="faint" style="font-size:12px">${x.tipo === 'receber' ? '+' : '−'} ${esc(x.nome)}</div>`).join('')}` });
    return `${pageHead('Agenda de recebimentos e pagamentos', 'Cada dia mostra o que entra e o que sai. O ponto vermelho marca o que passou da data sem ser marcado.', true)}
    <div class="grid g2">
      <section class="card span2"><div class="hd"><span class="eyebrow">${nomeMes(m)}</span><div class="legend"><span><i style="background:var(--good)"></i>entra</span><span><i style="background:var(--bad)"></i>sai</span></div></div>
        <div class="bd"><div class="cal">${cells}</div></div></section>
      ${sel ? `<section class="card span2"><div class="hd"><span class="eyebrow">Dia ${UI.diaSel} · ${diaSemana(dataNoMes(m, UI.diaSel))}</span><button class="link" type="button" data-act="dia" data-d="0">fechar</button></div><div class="bd">${sel.length ? `<div class="lst">${sel.map(i => itemLinha(i)).join('')}</div>` : '<p class="p">Nada neste dia.</p>'}</div></section>` : ''}
      <section class="card span2"><div class="hd"><span class="eyebrow">${atual ? 'Saldo previsto daqui até o fim do mês' : 'Saldo dentro do mês, partindo de zero'}</span><span class="chip ${fx.min < 0 ? 'bad' : 'good'}">menor saldo ${brl(fx.min)} no dia ${fx.diaMin}</span></div>
        <div class="bd">${chart}<p class="p" style="margin-top:12px">${atual ? (G().caixa != null ? `Parte do caixa informado (${brl(caixa)}), soma o que ainda vai entrar e tira o que ainda vai sair. Contas vencidas e não marcadas entram como saída de hoje.` : 'Sem caixa informado, o gráfico parte de zero. Informe o saldo no Início para ver o número real.') : 'Mostra o descompasso entre a data em que o dinheiro entra e a data em que as contas vencem.'}</p></div></section>
      <section class="card span2"><div class="hd"><span class="eyebrow">Tudo do mês em ordem de data</span><span class="chip">${its.length} itens</span></div><div class="bd"><div class="lst">${its.map(i => itemLinha(i)).join('')}</div></div></section>
    </div>`;
  }

  function linhaEditavel(kind, id, it, m) {
    const ehConta = kind === 'conta';
    const itm = ehConta ? compromissos(m).find(x => x.id === id) : compromissos(m).find(x => x.id === id && x.tipo === 'receber');
    const v = ehConta ? valorConta(id, it, m) : valorEntrada(id, it, m);
    const orig = ehConta ? origemValor(id, it, m) : null;
    const editando = UI.editando === kind + ':' + id;
    const conf = UI.confirmar === kind + ':' + id;
    let html = `<tr>
      <td><b>${esc(it.nome)}</b>${it.conferir ? ' <span class="chip warn">conferir</span>' : ''}${it.nota ? `<span class="nota">${esc(it.nota)}</span>` : ''}</td>
      <td class="v">${it.dia}</td>
      <td class="v"><input class="inp v" data-valmes="${kind}" data-id="${id}" inputmode="decimal" value="${fmt(v)}" aria-label="Valor em ${nomeMes(m)} de ${esc(it.nome)}">${ehConta && orig !== 'estimado' ? `<span class="nota" style="text-align:right">${orig === 'fatura' ? 'da fatura importada' : orig}</span>` : ''}</td>
      <td>${itm ? chipStatus(itm) : `<span class="chip">fora do período</span>`}</td>
      ${ehConta ? `<td class="v"><span class="chip ${it.prio <= 3 ? 'bad' : it.prio <= 6 ? 'gold' : ''}" title="1 = pagar primeiro">${it.prio || '—'}</span></td>` : ''}
      <td class="v faint">${it.fim ? curto(it.fim) : '—'}</td>
      <td><div class="row-actions">
        ${itm ? chave(itm) : ''}
        <button class="btn sm" type="button" data-act="editar" data-k="${kind}:${id}">${editando ? 'Fechar' : 'Editar'}</button>
      </div></td></tr>`;
    if (editando) {
      html += `<tr class="edit"><td colspan="${ehConta ? 7 : 6}"><form class="form" data-form="${kind}" data-id="${id}">
        <label class="f">Nome<input class="inp" name="nome" value="${esc(it.nome)}" required></label>
        <label class="f">Valor padrão por mês<input class="inp" name="valor" inputmode="decimal" value="${fmt(it.valor)}"></label>
        <label class="f">Dia<input class="inp" name="dia" type="number" min="1" max="31" value="${it.dia}"></label>
        <label class="f">Começa em<input class="inp" name="inicio" type="month" value="${it.inicio || ''}"></label>
        <label class="f">Último mês<input class="inp" name="fim" type="month" value="${it.fim || ''}"></label>
        ${ehConta ? `<label class="f">Grupo<select class="inp" name="grupo">${Object.entries(GRUPOS).filter(([g]) => g !== 'avulso').map(([g, n]) => `<option value="${g}" ${it.grupo === g ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="f">Prioridade (1 = pagar primeiro)<input class="inp" name="prio" type="number" min="1" max="11" value="${it.prio || 6}"></label>
        <label class="f">Custo de atrasar (% ao mês)<input class="inp" name="atrasoPct" inputmode="decimal" value="${String(it.atrasoPct ?? 3).replace('.', ',')}"></label>
        <label class="check"><input type="checkbox" name="auto" ${it.auto ? 'checked' : ''}> Débito automático</label>` : ''}
        <label class="check"><input type="checkbox" name="conferir" ${it.conferir ? 'checked' : ''}> Valor ou data a conferir</label>
        <label class="f" style="grid-column:1/-1">Observação<input class="inp" name="nota" value="${esc(it.nota || '')}"></label>
        <div class="row-actions" style="grid-column:1/-1;justify-content:flex-start"><button class="btn pri" type="submit">Salvar</button><button class="btn danger" type="button" data-act="remover" data-k="${kind}:${id}">${conf ? 'Confirmar remoção' : 'Remover'}</button></div>
      </form></td></tr>`;
    }
    return html;
  }
  function telaRecebimentos() {
    const m = UI.mes; const its = compromissos(m).filter(i => i.tipo === 'receber');
    const tot = its.reduce((a, i) => a + i.valor, 0); const rec = its.filter(i => i.st === 'feito').reduce((a, i) => a + i.valor, 0);
    const atr = its.filter(i => i.st === 'atrasado');
    const ents = Object.entries(S.config.entradas).sort((a, b) => (a[1].dia - b[1].dia) || (b[1].valor - a[1].valor));
    const ativas = ents.filter(([, e]) => ativo(e, m)); const inativas = ents.filter(([, e]) => !ativo(e, m));
    const extras = its.filter(i => i.extra);
    const prox = addMes(m, 1);
    const terminam = ativas.filter(([, e]) => e.fim === m);
    return `${pageHead('Recebimentos', 'Quem paga, quanto e em que dia. Marque quando o dinheiro cair; o que passar da data aparece como atrasado.', true)}
    <div class="grid g4">
      <div class="card kpi"><span class="l">Contratado no mês</span><div class="big num">${brl(tot)}</div><div class="sub">${its.length} recebimentos</div></div>
      <div class="card kpi"><span class="l">Já recebido</span><div class="big num pos">${brl(rec)}</div><div class="sub">${pct(rec / (tot || 1))} do mês</div></div>
      <div class="card kpi"><span class="l">Com data passada</span><div class="big num ${atr.length ? 'warn' : ''}">${brl(atr.reduce((a, i) => a + i.valor, 0))}</div><div class="sub">${atr.length ? atr.map(i => `${esc(i.nome)} · ${i.atraso}d`).join(' · ') : 'nenhum'}</div></div>
      <div class="card kpi"><span class="l">Contratado em ${curto(prox)}</span><div class="big num">${brl(receitaContratada(prox))}</div><div class="sub">${terminam.length ? `<span class="neg">−${brl(terminam.reduce((a, [, e]) => a + e.valor, 0))} com o fim de ${terminam.map(([, e]) => esc(e.nome)).join(', ')}</span>` : 'sem mudança'}</div></div>
    </div>
    <section class="card"><div class="hd"><span class="eyebrow">Fontes de receita em ${nomeMes(m)}</span><button class="btn sm" type="button" data-act="nova-entrada">+ Nova fonte</button></div>
      <div class="bd flush tbl-wrap"><table class="t"><thead><tr><th>Fonte</th><th class="v">Dia</th><th class="v">Valor no mês</th><th>Situação</th><th class="v">Até</th><th></th></tr></thead><tbody>
        ${ativas.map(([id, e]) => linhaEditavel('entrada', id, e, m)).join('')}
        ${extras.map(i => `<tr><td><b>${esc(i.nome)}</b> <span class="chip">avulso</span></td><td class="v">${+i.data.slice(8)}</td><td class="v">${fmt(i.valor)}</td><td>${chipStatus(i)}</td><td class="v faint">—</td><td><div class="row-actions">${chave(i)}<button class="btn sm danger" type="button" data-act="remover-extra" data-id="${i.xid}">Remover</button></div></td></tr>`).join('')}
        <tr class="tot"><td>Total</td><td></td><td class="v">${fmt(tot)}</td><td colspan="3"></td></tr>
      </tbody></table></div></section>
    ${inativas.length ? `<section class="card"><div class="hd"><span class="eyebrow">Fora deste mês</span></div><div class="bd flush tbl-wrap"><table class="t"><tbody>${inativas.map(([id, e]) => linhaEditavel('entrada', id, e, m)).join('')}</tbody></table></div></section>` : ''}
    <section class="card"><div class="hd"><span class="eyebrow">Peso de cada fonte em ${curto(prox)}</span></div><div class="bd"><div class="bars">
      ${(() => { const l = ents.filter(([, e]) => ativo(e, prox)); const t2 = l.reduce((a, [, e]) => a + e.valor, 0); const mx = Math.max(...l.map(([, e]) => e.valor), 1);
        return l.sort((a, b) => b[1].valor - a[1].valor).map(([, e]) => `<div class="bar"><span class="bn">${esc(e.nome)}<small>dia ${e.dia}</small></span><span class="tr"><span class="fl" style="width:${e.valor / mx * 100}%"></span></span><span class="bv">${fmt(e.valor)}<small>${pct(e.valor / (t2 || 1))}</small></span></div>`).join(''); })()}
    </div></div></section>`;
  }
  function telaContas() {
    const m = UI.mes; const r = resumoMes(m);
    const lista = Object.entries(S.config.contas);
    const grupos = ['casa', 'divida', 'cartao', 'empresa'];
    const extras = r.its.filter(i => i.extra && i.tipo === 'pagar');
    return `${pageHead('Contas a pagar', 'Valor do mês editável direto na tabela. Faturas importadas substituem a estimativa do cartão automaticamente.', true)}
    <div class="grid g4">
      <div class="card kpi"><span class="l">Custo do mês</span><div class="big num">${brl(r.custoTotal)}</div><div class="sub">${r.nPagar} contas</div></div>
      <div class="card kpi"><span class="l">Já pago</span><div class="big num pos">${brl(r.pago)}</div><div class="sub">${pct(r.pago / (r.custoTotal || 1))} do mês</div></div>
      <div class="card kpi"><span class="l">Vencido sem marcar</span><div class="big num ${r.nAtrasoPagar ? 'neg' : ''}">${brl(r.atrasadoPagar)}</div><div class="sub">${r.nAtrasoPagar} conta${r.nAtrasoPagar === 1 ? '' : 's'}</div></div>
      <div class="card kpi"><span class="l">Falta pagar</span><div class="big num">${brl(r.aPagar)}</div><div class="sub">até o fim de ${NOMES_MES[+m.slice(5) - 1]}</div></div>
    </div>
    ${devoHTML()}
    <section class="card"><div class="hd"><span class="eyebrow">Contas de ${nomeMes(m)}</span><button class="btn sm" type="button" data-act="nova-conta">+ Nova conta</button></div>
      <div class="bd flush tbl-wrap"><table class="t"><thead><tr><th>Conta</th><th class="v">Dia</th><th class="v">Valor no mês</th><th>Situação</th><th class="v">Prior.</th><th class="v">Até</th><th></th></tr></thead><tbody>
      ${grupos.map(g => { const l = lista.filter(([, c]) => (c.grupo || 'casa') === g).sort((a, b) => a[1].dia - b[1].dia); if (!l.length) return '';
        const tg = l.filter(([, c]) => ativo(c, m)).reduce((a, [id, c]) => a + valorConta(id, c, m), 0);
        return `<tr class="grp"><td colspan="2">${GRUPOS[g]}</td><td class="v">${fmt(tg)}</td><td colspan="4"></td></tr>` + l.map(([id, c]) => linhaEditavel('conta', id, c, m)).join(''); }).join('')}
      ${extras.length ? `<tr class="grp"><td colspan="7">Avulsos do mês</td></tr>` + extras.map(i => `<tr><td><b>${esc(i.nome)}</b></td><td class="v">${+i.data.slice(8)}</td><td class="v">${fmt(i.valor)}</td><td>${chipStatus(i)}</td><td></td><td></td><td><div class="row-actions">${chave(i)}<button class="btn sm danger" type="button" data-act="remover-extra" data-id="${i.xid}">Remover</button></div></td></tr>`).join('') : ''}
      <tr class="tot"><td>Total</td><td></td><td class="v">${fmt(r.custoTotal)}</td><td colspan="4"></td></tr>
      </tbody></table></div></section>`;
  }

  function telaCustos() {
    const m = UI.mes; const c = custoMes(m); const rec = receitaContratada(m);
    const proj = projecao(12, { vendas: 0 }).meses;
    const grupos = ['casa', 'divida', 'cartao', 'empresa'];
    const contas = Object.entries(S.config.contas).filter(([, x]) => ativo(x, m)).map(([id, x]) => ({ id, nome: x.nome, grupo: x.grupo, v: valorConta(id, x, m), orig: origemValor(id, x, m) })).sort((a, b) => b.v - a.v);
    const mx = Math.max(...contas.map(x => x.v), 1);
    const filtro = UI.filtroCartao; const its = itensFaturas(m, filtro);
    const escopo = UI.escopo || 'todos';
    const itsE = its.filter(i => escopo === 'todos' || i.esc === escopo);
    const porCat = {}; for (const i of itsE) { const x = porCat[i.cat] || (porCat[i.cat] = { v: 0, n: 0 }); x.v += i.v; x.n++; }
    const cats = Object.entries(porCat).sort((a, b) => b[1].v - a[1].v); const mxc = Math.max(...cats.map(([, x]) => x.v), 1);
    const totC = itsE.reduce((a, i) => a + i.v, 0);
    const fats = faturasDoMes(m);
    const eventos = [];
    for (const e of Object.values(S.config.entradas)) if (e.fim && e.fim >= mesAtual()) eventos.push({ m: addMes(e.fim, 1), t: `Deixa de entrar ${e.nome} (−${fmt(e.valor)})`, neg: true });
    for (const x of Object.values(S.config.contas)) if (x.fim && x.fim >= mesAtual() && x.fim < addMes(mesAtual(), 12)) eventos.push({ m: addMes(x.fim, 1), t: `Termina ${x.nome} (−${fmt(x.valor)} de custo)` });
    const sic = S.config.contas.sicredi; if (sic && sic.cronograma) { const ult = Object.keys(sic.cronograma).sort().pop(); if (ult) eventos.push({ m: addMes(ult, 1), t: 'Parcelas antigas do Sicredi zeram' }); }
    eventos.sort((a, b) => a.m.localeCompare(b.m));
    const chart = chartColunas({ id: 'custos12', labels: proj.map(p => curto(p.m)), rotular: true, h: 260, aria: 'Projeção de custos por grupo',
      grupos: grupos.map(g => ({ nome: GRUPOS[g], cor: GRUPO_COR[g], valores: proj.map(p => p.custos[g]) })),
      tip: i => `<b>${curto(proj[i].m)}</b>${grupos.map(g => tipRow(GRUPO_COR[g], GRUPOS[g], proj[i].custos[g])).join('')}${tipRow('', 'Total', proj[i].custo)}` });
    return `${pageHead('Custos', 'Quanto custa o mês, para onde vai o dinheiro dos cartões e como o custo se comporta nos próximos 12 meses.', true)}
    <div class="grid g4">
      <div class="card kpi"><span class="l">Custo total do mês</span><div class="big num">${brl(c.total)}</div><div class="sub">casa, dívidas, cartões e empresa</div></div>
      <div class="card kpi"><span class="l">Receita contratada</span><div class="big num">${brl(rec)}</div><div class="sub">cobre ${pct(rec / (c.total || 1))} do custo</div></div>
      <div class="card kpi"><span class="l">A vender no mês</span><div class="big num ${c.total > rec ? 'neg' : 'pos'}">${brl(Math.max(0, c.total - rec))}</div><div class="sub">${brl(Math.max(0, c.total - rec) / diasUteis(m + '-01', dataNoMes(m, 31)))} por dia útil</div></div>
      <div class="card kpi"><span class="l">Cartões no mês</span><div class="big num">${brl(c.cartao)}</div><div class="sub">${pct(c.cartao / (c.total || 1))} do custo total</div></div>
    </div>
    <section class="card"><div class="hd"><span class="eyebrow">Composição do custo de ${nomeMes(m)}</span><div class="legend">${grupos.map(g => `<span><i style="background:${GRUPO_COR[g]}"></i>${GRUPOS[g]} ${k(c[g])}</span>`).join('')}</div></div>
      <div class="bd" style="display:flex;flex-direction:column;gap:18px">
        <div class="stack" role="img" aria-label="Custo por grupo">${grupos.map(g => c[g] ? `<span style="width:${c[g] / c.total * 100}%;background:${GRUPO_COR[g]}" title="${GRUPOS[g]}: ${fmt(c[g])}"></span>` : '').join('')}</div>
        <div class="bars">${contas.map(x => `<div class="bar"><span class="bn">${esc(x.nome)}<small>${GRUPOS[x.grupo] || ''} · dia ${S.config.contas[x.id].dia}${x.orig === 'fatura' ? ' · fatura real' : x.orig === 'estimado' ? ' · estimado' : ''}</small></span><span class="tr"><span class="fl" style="width:${x.v / mx * 100}%;background:${GRUPO_COR[x.grupo]}"></span></span><span class="bv">${fmt(x.v)}<small>${pct(x.v / c.total)}</small></span></div>`).join('')}</div>
      </div></section>
    <section class="card"><div class="hd"><span class="eyebrow">Projeção de custos · 12 meses</span><div class="legend">${grupos.map(g => `<span><i style="background:${GRUPO_COR[g]}"></i>${GRUPOS[g]}</span>`).join('')}</div></div>
      <div class="bd">${chart}
        ${eventos.length ? `<div class="eyebrow" style="margin:18px 0 8px">O que muda no caminho</div><div class="lst">${eventos.map(e => `<div class="it" style="grid-template-columns:70px minmax(0,1fr)"><span class="chip ${e.neg ? 'bad' : 'good'}">${curto(e.m)}</span><span>${esc(e.t)}</span></div>`).join('')}</div>` : ''}
      </div>
      <div class="bd flush tbl-wrap" style="border-top:1px solid var(--line)"><table class="t"><thead><tr><th>Grupo</th>${proj.map(p => `<th class="v">${curto(p.m)}</th>`).join('')}</tr></thead><tbody>
        ${grupos.map(g => `<tr><td><i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${GRUPO_COR[g]};margin-right:8px"></i>${GRUPOS[g]}</td>${proj.map(p => `<td class="v">${k(p.custos[g])}</td>`).join('')}</tr>`).join('')}
        <tr class="tot"><td>Total</td>${proj.map(p => `<td class="v">${k(p.custo)}</td>`).join('')}</tr>
        <tr><td class="muted">Receita contratada</td>${proj.map(p => `<td class="v muted">${k(p.contratada)}</td>`).join('')}</tr>
      </tbody></table></div></section>
    <section class="card"><div class="hd"><span class="eyebrow">Para onde foi o dinheiro dos cartões · ${curto(m)}</span>
        <div style="display:flex;gap:10px;flex-wrap:wrap"><div class="seg" role="group" aria-label="Cartão">${['todos', ...new Set(fats.map(f => f.cartao))].map(x => `<button type="button" data-act="filtro-cartao" data-v="${x}" aria-pressed="${filtro === x}">${x === 'todos' ? 'Todos' : esc(CARTOES[x] || x)}</button>`).join('')}</div>
        <div class="seg" role="group" aria-label="Casa ou empresa">${[['todos', 'Tudo'], ['casa', 'Casa'], ['empresa', 'Empresa']].map(([v, n]) => `<button type="button" data-act="escopo" data-v="${v}" aria-pressed="${escopo === v}">${n}</button>`).join('')}</div></div></div>
      <div class="bd">${!fats.length ? `<div class="empty">Nenhuma fatura de ${nomeMes(m)} importada. <button class="link" type="button" data-tab="importar">Importar faturas</button></div>` : `
        <div class="stats" style="margin-bottom:16px"><div><span class="eyebrow">Total</span><span class="sv2">${brl(totC)}</span></div><div><span class="eyebrow">Lançamentos</span><span class="sv2">${itsE.length}</span></div><div><span class="eyebrow">Comida</span><span class="sv2">${brl(itsE.filter(i => COMIDA.includes(i.cat)).reduce((a, i) => a + i.v, 0))}</span></div><div><span class="eyebrow">Empresa</span><span class="sv2">${brl(itsE.filter(i => i.esc === 'empresa').reduce((a, i) => a + i.v, 0))}</span></div></div>
        <div class="bars">${cats.map(([cat, x]) => `<button type="button" class="bar ${UI.catSel === cat ? 'sel' : ''}" data-act="cat" data-v="${cat}" aria-expanded="${UI.catSel === cat}"><span class="bn">${esc(P.CAT[cat] ? P.CAT[cat].nome : cat)}<small>${x.n} lançamento${x.n > 1 ? 's' : ''} · ticket ${fmt(x.v / x.n)}</small></span><span class="tr"><span class="fl ${P.CAT[cat] && P.CAT[cat].esc === 'empresa' ? 'emp' : ''}" style="width:${Math.max(0, x.v) / mxc * 100}%"></span></span><span class="bv">${fmt(x.v)}<small>${pct(x.v / (totC || 1))}</small></span></button>
          ${UI.catSel === cat ? `<div class="tbl-wrap" style="margin:4px 0 14px"><table class="t"><thead><tr><th>Data</th><th>Descrição</th><th>Cartão</th><th>Categoria</th><th class="v">Valor</th></tr></thead><tbody>${itsE.filter(i => i.cat === cat).sort((a, b) => b.v - a.v).map(i => `<tr><td class="faint">${dataBR(i.d)}</td><td>${esc(i.desc)}${i.parc ? ` <span class="chip">${esc(i.parc)}</span>` : ''}</td><td class="faint">${esc(CARTOES[i.cartao] || i.cartao)}${i.pes ? ' · ' + esc(i.pes) : ''}</td><td>${selCat(i.cat, `data-fid="${i.fid}" data-idx="${i.idx}"`)}</td><td class="v">${fmt(i.v)}</td></tr>`).join('')}</tbody></table></div>` : ''}`).join('')}</div>`}
      </div></section>`;
  }
  function selCat(atual, attrs) {
    return `<select class="inp sel-cat" data-act-change="recat" ${attrs} aria-label="Categoria">${P.CATEGORIAS.map(c => `<option value="${c.id}" ${c.id === atual ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select>`;
  }

  // Quanto faturar por mês para zerar contas em aberto e dívidas em N meses.
  function quitacao(n, cen, comCarro) {
    const atual = mesAtual(); const dv = dividas().filter(d => comCarro || d.id !== 'carro');
    const ids = new Set(dv.map(d => d.id));
    const parcelaDe = (id, m) => { const c = S.config.contas[id]; if (!c || !ativo(c, m)) return 0; return c.parcelas ? (+c.parcelas[m] || 0) : valorConta(id, c, m); };
    // em aberto que não é parcela de dívida (contas do mês vencidas ou a vencer)
    let abertoContas = 0;
    for (const m of mesesAte(atual)) for (const it of compromissos(m)) {
      if (it.tipo !== 'pagar' || it.st === 'feito') continue;
      if (!ids.has(it.id)) abertoContas += it.valor;
      else if (S.config.contas[it.id].parcelas) abertoContas += Math.max(0, it.valor - parcelaDe(it.id, m)); // fatura do cartão: só as parcelas são dívida
    }
    const saldoDividas = dv.reduce((a, d) => a + d.atual, 0);
    const alvo = abertoContas + saldoDividas;
    let base = 0, rec = 0;
    for (let i = 1; i <= n; i++) {
      const m = addMes(atual, i); const c = custoMes(m, cen).total;
      let parc = 0; for (const id of ids) parc += parcelaDe(id, m);
      base += c - parc; rec += receitaContratada(m);
    }
    base /= n; rec /= n;
    const necessario = base + alvo / n;
    const falta = Math.max(0, necessario - rec);
    return { n, alvo: r2(alvo), abertoContas: r2(abertoContas), saldoDividas: r2(saldoDividas), base: r2(base), rec: r2(rec), necessario: r2(necessario), falta: r2(falta), porDia: r2(falta / 21), dv };
  }
  function quitacaoHTML(cen) {
    const comCarro = UI.quitCarro !== false;
    const prazos = [6, 12, 18, 24, 36].map(n => quitacao(n, cen, comCarro));
    const q12 = prazos[1];
    const mx = Math.max(...prazos.map(q => q.necessario), 1);
    return `<section class="card"><div class="hd"><span class="eyebrow">Quanto preciso faturar para quitar tudo</span>
        <div class="seg" role="group" aria-label="Incluir o carro"><button type="button" data-act="quit-carro" data-v="1" aria-pressed="${comCarro}">Todas as dívidas</button><button type="button" data-act="quit-carro" data-v="0" aria-pressed="${!comCarro}">Sem antecipar o carro</button></div></div>
      <div class="bd" style="display:flex;flex-direction:column;gap:20px">
        <div class="fl-tot"><span>Para zerar tudo em 12 meses, faturar por mês</span><b class="num">${brl(q12.necessario)}</b></div>
        <div class="fl-2" style="grid-template-columns:repeat(3,minmax(0,1fr))">
          <div><span>Já contratado (média)</span><b class="num">${brl(q12.rec)}</b></div>
          <div><span>Falta vender por mês</span><b class="num neg">${brl(q12.falta)}</b></div>
          <div><span>Por dia útil</span><b class="num">${brl(q12.porDia)}</b></div>
        </div>
        <div class="stats">
          <div><span class="eyebrow">Total a quitar</span><span class="sv2">${brl(q12.alvo)}</span></div>
          <div><span class="eyebrow">Contas em aberto</span><span class="sv2">${brl(q12.abertoContas)}</span></div>
          <div><span class="eyebrow">Saldo das dívidas</span><span class="sv2">${brl(q12.saldoDividas)}</span></div>
          <div><span class="eyebrow">Custo do dia a dia</span><span class="sv2">${brl(q12.base)}/mês</span></div>
        </div>
      </div>
      <div class="bd flush tbl-wrap" style="border-top:1px solid var(--line)"><table class="t"><thead><tr><th>Quitar em</th><th class="v">Faturar por mês</th><th class="v">Já contratado</th><th class="v">Falta vender/mês</th><th class="v">Por dia útil</th><th style="min-width:160px"></th></tr></thead><tbody>
        ${prazos.map(q => `<tr${q.n === 12 ? ' style="background:var(--surface-2)"' : ''}><td><b>${q.n} meses</b> <span class="faint">até ${curto(addMes(mesAtual(), q.n))}</span></td><td class="v"><b>${fmt(q.necessario)}</b></td><td class="v muted">${fmt(q.rec)}</td><td class="v neg">${fmt(q.falta)}</td><td class="v">${fmt(q.porDia)}</td>
          <td><div class="fl-bar" style="height:8px"><span style="width:${q.necessario / mx * 100}%;background:var(--s2)"></span></div></td></tr>`).join('')}
      </tbody></table></div>
      <div class="bd" style="border-top:1px solid var(--line)"><p class="p">Faturamento necessário = custo do dia a dia (contas e cartões sem as parcelas das dívidas) + tudo o que está em aberto dividido pelo número de meses. Entram: ${q12.dv.map(d => `${esc(d.nome)} ${k(d.atual)}`).join(', ')}${comCarro ? '' : '. O carro segue nas parcelas normais e fica dentro do custo do dia a dia'}. Os cenários acima (pausar anúncios e cortes) já entram no cálculo. As próximas parcelas do Pronampe não estão incluídas porque o saldo dos contratos ainda não foi informado.</p></div></section>`;
  }
  function telaProjecao() {
    const cen = UI.cen; const pr = projecao(12, cen); const ms = pr.meses;
    const base = projecao(12, { vendas: 0 }).meses;
    const labels = ms.map(p => curto(p.m));
    const ch1 = chartLinhas({ id: 'proj', labels, aria: 'Receita prevista contra custos', h: 280,
      series: [{ nome: 'Receita', cor: 'var(--s1)', valores: ms.map(p => p.receita), area: true }, { nome: 'Custos', cor: 'var(--s2)', valores: ms.map(p => p.custo) }],
      tip: i => `<b>${nomeMes(ms[i].m)}</b>${tipRow('var(--s1)', 'Receita', ms[i].receita)}${ms[i].vendas ? `<div class="faint" style="font-size:12px">inclui ${brl(ms[i].vendas)} de vendas</div>` : ''}${tipRow('var(--s2)', 'Custos', ms[i].custo)}${tipRow('', 'Resultado', ms[i].resultado)}` });
    const ch2 = chartColunas({ id: 'res', labels, valores: ms.map(p => p.resultado), rotular: true, h: 230, aria: 'Resultado de cada mês',
      grupos: [], tip: i => `<b>${nomeMes(ms[i].m)}</b>${tipRow(ms[i].resultado < 0 ? 'var(--bad)' : 'var(--good)', 'Resultado do mês', ms[i].resultado)}${tipRow('', 'Saldo acumulado', ms[i].acum)}` });
    const negMes = ms.find(p => p.acum < 0);
    const gapMedio = base.slice(1).reduce((a, p) => a + Math.max(0, -p.resultado), 0) / Math.max(1, base.length - 1);
    const ult = ms[ms.length - 1];
    return `${pageHead('Projeção de faturamento e gastos', 'Doze meses à frente com o que já está contratado. Mexa nos cenários para ver o efeito das decisões.', false)}
    <section class="card"><div class="hd"><span class="eyebrow">Cenário</span><span class="chip">${pr.caixaInformado ? 'parte do caixa de ' + brl(pr.caixa) : 'sem caixa informado: parte de zero'}</span></div>
      <div class="bd"><form class="form" data-form="cenario" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">
        <label class="f">Vendas extras esperadas por mês<input class="inp" id="cen-vendas" name="vendas" inputmode="decimal" value="${fmt(cen.vendas || 0)}"></label>
        <label class="check"><input type="checkbox" name="semAds" ${cen.semAds ? 'checked' : ''}> Pausar anúncios do Meta (−${k(+G().metaAds || 0)}/mês)</label>
        <label class="check"><input type="checkbox" name="cortes" ${cen.cortes ? 'checked' : ''}> Aplicar o plano de cortes (−${k(+G().cortes || 0)}/mês)</label>
        <div class="row-actions" style="justify-content:flex-start"><button class="btn pri" type="submit">Recalcular</button></div>
      </form>
      <div class="stats" style="margin-top:20px">
        <div><span class="eyebrow">Gap médio sem vendas</span><span class="sv2 neg">${brl(gapMedio)}/mês</span></div>
        <div><span class="eyebrow">Vender por dia útil</span><span class="sv2">${brl(gapMedio / 21)}</span></div>
        <div><span class="eyebrow">Saldo em ${curto(ult.m)}</span><span class="sv2 ${ult.acum < 0 ? 'neg' : 'pos'}">${brl(ult.acum)}</span></div>
        <div><span class="eyebrow">Caixa fica negativo</span><span class="sv2 ${negMes ? 'neg' : 'pos'}">${negMes ? 'em ' + curto(negMes.m) : 'não fica'}</span></div>
      </div></div></section>
    ${quitacaoHTML(cen)}
    <section class="card"><div class="hd"><span class="eyebrow">Faturamento previsto × gastos</span><div class="legend"><span><i style="background:var(--s1)"></i>Receita</span><span><i style="background:var(--s2)"></i>Custos</span></div></div><div class="bd">${ch1}</div></section>
    <section class="card"><div class="hd"><span class="eyebrow">Resultado de cada mês</span><div class="legend"><span><i style="background:var(--good)"></i>sobra</span><span><i style="background:var(--bad)"></i>falta</span></div></div><div class="bd">${ch2}</div>
      <div class="bd flush tbl-wrap" style="border-top:1px solid var(--line)"><table class="t"><thead><tr><th>Mês</th><th class="v">Contratado</th><th class="v">Vendas</th><th class="v">Custos</th><th class="v">Resultado</th><th class="v">Acumulado</th></tr></thead><tbody>
        ${ms.map(p => `<tr><td>${nomeMes(p.m)}</td><td class="v">${fmt(p.contratada + p.extrasIn)}</td><td class="v">${fmt(p.vendas)}</td><td class="v">${fmt(p.custo)}</td><td class="v ${p.resultado < 0 ? 'neg' : 'pos'}">${sinal(p.resultado)}</td><td class="v ${p.acum < 0 ? 'neg' : 'pos'}">${sinal(p.acum)}</td></tr>`).join('')}
      </tbody></table></div></section>
    <p class="p">O primeiro mês usa os valores reais (faturas importadas e o que já foi marcado). Os seguintes usam o valor padrão de cada conta, o cronograma das parcelas do Sicredi e o fim de cada contrato. Os cortes e a pausa dos anúncios contam a partir do mês seguinte.</p>`;
  }

  function telaImportar() {
    const fats = Object.entries(S.faturas).sort((a, b) => (b[1].venc || '').localeCompare(a[1].venc || ''));
    return `${pageHead('Importar faturas e extratos', 'Solte os arquivos aqui. O sistema lê, classifica cada lançamento e confere a soma com o total da fatura antes de salvar.', false)}
    <label class="drop" id="drop" for="file">
      <div class="ico"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 15v4.5h14V15"/></svg></div>
      <h2>Solte as faturas aqui</h2>
      <p>Funciona com CSV e PDF do Nubank, CSV do Sicredi, extratos em Excel, OFX de qualquer banco e CSV genérico com colunas de data, descrição e valor. Pode mandar vários de uma vez.</p>
      <span class="btn pri" style="margin-top:6px">Escolher arquivos</span>
    </label>
    ${UI.importados.map((f, i) => importadoHTML(f, i)).join('')}
    <section class="card"><div class="hd"><span class="eyebrow">Faturas salvas</span><span class="chip">${fats.length}</span></div>
      <div class="bd flush tbl-wrap">${fats.length ? `<table class="t"><thead><tr><th>Cartão</th><th>Vencimento</th><th class="v">Total</th><th class="v">Classificado</th><th>Conferência</th><th>Arquivo</th><th></th></tr></thead><tbody>
        ${fats.map(([id, f]) => `<tr><td><b>${esc(CARTOES[f.cartao] || f.cartao)}</b></td><td>${f.venc ? dataBR(f.venc) + '/' + f.venc.slice(0, 4) : curto(f.mes)}</td><td class="v">${fmt(f.total)}</td><td class="v">${fmt(f.soma)}</td>
          <td>${Math.abs(f.total - f.soma) <= 1 ? '<span class="chip good">confere</span>' : `<span class="chip warn">diferença ${fmt(f.total - f.soma)}</span>`}</td><td class="faint">${esc(f.arquivo || '')}</td>
          <td><div class="row-actions"><button class="btn sm" type="button" data-act="ver-fatura" data-id="${id}">Ver em Custos</button><button class="btn sm danger" type="button" data-act="apagar-fatura" data-id="${id}">${UI.confirmar === 'fat:' + id ? 'Confirmar' : 'Apagar'}</button></div></td></tr>`).join('')}
      </tbody></table>` : '<div class="empty">Nenhuma fatura salva ainda.</div>'}</div></section>
    <section class="card"><div class="hd"><span class="eyebrow">Como a classificação funciona</span></div><div class="bd"><p class="p">Cada lançamento passa por regras de palavras-chave (iFood e Keeta viram Delivery, Facebk vira Tráfego pago, parcela 2 em diante vira Parcelas de compras antigas). Quando você troca a categoria de um lançamento, o sistema lembra a regra para aquele estabelecimento nas próximas faturas.${UI.sample ? ' O que ficar em Outros pode ser classificado pelo Claude com um clique.' : ''} Pagamentos de fatura e créditos de atraso não contam como gasto.</p>
      ${Object.keys(S.config.regras || {}).length ? `<div class="eyebrow" style="margin:16px 0 8px">Regras que você ensinou</div><div style="display:flex;gap:8px;flex-wrap:wrap">${Object.entries(S.config.regras).map(([kk, v]) => `<span class="chip">${esc(kk)} → ${esc(P.CAT[v] ? P.CAT[v].nome : v)} <button class="link" type="button" data-act="apagar-regra" data-k="${esc(kk)}" aria-label="Apagar regra">×</button></span>`).join('')}</div>` : ''}
    </div></section>`;
  }
  function importadoHTML(f, i) {
    if (f.erro) return `<section class="card"><div class="hd"><b>${esc(f.arquivo)}</b><button class="btn sm" type="button" data-act="descartar" data-i="${i}">Descartar</button></div><div class="bd"><div class="callout bad">${esc(f.erro)}</div></div></section>`;
    const validos = f.itens.filter(x => x.cat !== 'ignorar' && x.cat !== 'entrada');
    const porCat = {}; for (const x of validos) porCat[x.cat] = (porCat[x.cat] || 0) + x.v;
    const outros = f.itens.filter(x => x.cat === 'outros').length;
    const entradas = f.itens.filter(x => x.cat === 'entrada');
    const cartoes = Object.entries(S.config.contas).filter(([, c]) => c.cartao);
    const ja = f.cartao && f.venc && S.faturas[f.cartao + '-' + f.venc.slice(0, 7)];
    return `<section class="card"><div class="hd"><div><b>${esc(f.arquivo)}</b> <span class="chip">${esc(f.formato)}</span> <span class="chip">${f.itens.length} lançamentos</span></div>
      <div class="row-actions">${UI.sample && outros ? `<button class="btn sm" type="button" data-act="claude" data-i="${i}" ${UI.classificando ? 'disabled' : ''}>${UI.classificando ? 'Classificando…' : `Classificar ${outros} em Outros com o Claude`}</button>` : ''}<button class="btn sm" type="button" data-act="descartar" data-i="${i}">Descartar</button></div></div>
      <div class="bd" style="display:flex;flex-direction:column;gap:16px">
        <form class="form" data-form="importado" data-i="${i}">
          <label class="f">Tipo<select class="inp" name="extrato"><option value="0" ${!f.extrato ? 'selected' : ''}>Fatura de cartão</option><option value="1" ${f.extrato ? 'selected' : ''}>Extrato da conta</option></select></label>
          ${!f.extrato ? `<label class="f">Cartão<select class="inp" name="cartao">${cartoes.map(([id, c]) => `<option value="${c.cartao}" ${f.cartao === c.cartao ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></label>
          <label class="f">Vencimento<input class="inp" type="date" name="venc" value="${f.venc || ''}" required></label>
          <label class="f">Total da fatura<input class="inp" name="total" inputmode="decimal" value="${f.total != null ? fmt(f.total) : ''}" placeholder="total do app"></label>` : ''}
        </form>
        ${!f.extrato ? `<div class="stats"><div><span class="eyebrow">Soma classificada</span><span class="sv2">${brl(f.soma)}</span></div><div><span class="eyebrow">Total da fatura</span><span class="sv2">${f.total != null ? brl(f.total) : '—'}</span></div>
          <div><span class="eyebrow">Conferência</span><span class="sv2">${f.total == null ? '<span class="chip warn">informe o total</span>' : Math.abs(f.total - f.soma) <= 1 ? '<span class="chip good">confere</span>' : `<span class="chip bad">diferença de ${brl(f.total - f.soma)}</span>`}</span></div>${f.totalFonte ? `<div><span class="eyebrow">Origem do total</span><span class="sv2" style="font-size:14px">${esc(f.totalFonte)}</span></div>` : ''}</div>` :
          `<div class="callout">Extrato não vira fatura: o sistema procura nele os recebimentos e os pagamentos do mês e oferece marcar cada um. Assim nada é contado duas vezes.</div>${conciliacaoHTML(f, i)}`}
        ${!f.extrato ? `<div class="bars">${Object.entries(porCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<div class="bar"><span class="bn">${esc(P.CAT[c] ? P.CAT[c].nome : c)}</span><span class="tr"><span class="fl ${P.CAT[c] && P.CAT[c].esc === 'empresa' ? 'emp' : ''}" style="width:${Math.max(0, v) / Math.max(...Object.values(porCat), 1) * 100}%"></span></span><span class="bv">${fmt(v)}</span></div>`).join('')}</div>` : ''}
        <details ${outros ? 'open' : ''}><summary class="link" style="cursor:pointer;color:var(--accent);font-weight:600">Revisar lançamentos${outros ? ` (${outros} em Outros)` : ''}</summary>
          <div class="tbl-wrap" style="margin-top:10px;max-height:460px;overflow-y:auto"><table class="t"><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Casa/Empresa</th><th class="v">Valor</th></tr></thead><tbody>
          ${f.itens.map((x, j) => `<tr><td class="faint">${dataBR(x.d)}</td><td>${esc(x.desc)}${x.parc ? ` <span class="chip">${esc(x.parc)}</span>` : ''}${x.novoParc ? ' <span class="chip warn">parcelamento novo</span>' : ''}</td><td>${selCat(x.cat, `data-imp="${i}" data-idx="${j}"`)}</td>
            <td><select class="inp" style="max-width:120px" data-act-change="esc" data-imp="${i}" data-idx="${j}" aria-label="Casa ou empresa"><option value="casa" ${x.esc !== 'empresa' ? 'selected' : ''}>Casa</option><option value="empresa" ${x.esc === 'empresa' ? 'selected' : ''}>Empresa</option></select></td><td class="v ${x.v < 0 ? 'pos' : ''}">${fmt(x.v)}</td></tr>`).join('')}
          </tbody></table></div></details>
        ${!f.extrato ? `<div class="row-actions" style="justify-content:flex-start"><button class="btn pri" type="button" data-act="salvar-import" data-i="${i}">${ja ? 'Substituir a fatura já salva' : 'Salvar fatura'}</button>${ja ? `<span class="chip warn">já existe uma fatura ${esc(CARTOES[f.cartao])} de ${curto(f.venc.slice(0, 7))}</span>` : ''}</div>` : ''}
      </div></section>`;
  }
  function conciliacaoHTML(f, i) {
    const sug = [];
    const meses = [...new Set(f.itens.map(x => x.d.slice(0, 7)))];
    for (const m of meses) {
      const its = compromissos(m).filter(c => c.st !== 'feito');
      for (const x of f.itens.filter(y => y.d.slice(0, 7) === m)) {
        const tipo = x.v < 0 ? 'receber' : 'pagar'; const v = Math.abs(x.v);
        const alvo = its.find(c => c.tipo === tipo && Math.abs(c.valor - v) <= Math.max(2, c.valor * 0.02) && !sug.some(s => s.c.id === c.id && s.c.m === c.m));
        if (alvo) sug.push({ x, c: alvo });
      }
    }
    if (!sug.length) return '<p class="p">Nenhum valor do extrato bateu com um recebimento ou conta em aberto.</p>';
    return `<div class="lst">${sug.map(s => `<div class="it"><div class="ic ${s.c.tipo === 'receber' ? 'in' : 'out'}">${s.c.tipo === 'receber' ? '↓' : '↑'}</div><div style="min-width:0"><div class="nm">${esc(s.c.nome)}</div><div class="meta">extrato ${dataBR(s.x.d)}: ${esc(s.x.desc)}</div></div><div class="val">${fmt(Math.abs(s.x.v))}</div>
      <div class="row-actions"><button class="btn sm ok" type="button" data-act="conciliar" data-tipo="${s.c.tipo}" data-id="${esc(s.c.id)}" data-m="${s.c.m}" data-em="${s.x.d}" data-v="${Math.abs(s.x.v)}">Marcar ${s.c.tipo === 'receber' ? 'recebido' : 'pago'}</button></div></div>`).join('')}</div>`;
  }

  function telaPrioridade() {
    const t = hoje(); const caixa = G().caixa;
    const disp = UI.disp != null ? UI.disp : (caixa != null ? +caixa : 0);
    const ate = UI.ate || iso(new Date(parseD(t).getTime() + 15 * 864e5));
    const pend = [];
    for (const m of mesesAte(ate.slice(0, 7))) for (const it of compromissos(m)) if (!['feito', 'auto'].includes(it.st) && it.data <= ate) pend.push(it);
    const pagar = pend.filter(i => i.tipo === 'pagar').sort((a, b) => (a.prio - b.prio) || a.data.localeCompare(b.data));
    const entra = pend.filter(i => i.tipo === 'receber').reduce((a, i) => a + i.valor, 0);
    let saldo = disp + (UI.contarEntradas ? entra : 0);
    const plano = pagar.map(it => {
      const c = it.ref || {};
      const pct2 = it.extra ? 3 : (+c.atrasoPct || 0);
      if (saldo >= it.valor - 0.005) { saldo -= it.valor; return { it, acao: 'pagar' }; }
      return { it, acao: 'segurar', custo: it.valor * pct2 / 100, pct2, cartao: c.grupo === 'cartao' };
    });
    const seg = plano.filter(p => p.acao === 'segurar');
    const custoSeg = seg.reduce((a, p) => a + p.custo, 0);
    const cartaoSeg = seg.filter(p => p.cartao);
    const tabela = Object.values(S.config.contas).filter(c => c.atrasoPct != null).map(c => ({ nome: c.nome, pct: +c.atrasoPct, folga: c.folga, cuidado: c.cuidado, prio: c.prio })).sort((a, b) => a.pct - b.pct || b.prio - a.prio);
    const its = itensFaturas(ultimoMesComFatura());
    const soma = cs => its.filter(i => cs.includes(i.cat)).reduce((a, i) => a + i.v, 0);
    return `${pageHead('Se faltar dinheiro', 'Diga quanto tem e até quando precisa chegar. O sistema paga primeiro o que é mais caro atrasar e mostra o custo de segurar o resto.', false)}
    <section class="card"><div class="hd"><span class="eyebrow">Simulação</span></div><div class="bd">
      <form class="form" data-form="prioridade" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
        <label class="f">Quanto tenho disponível<input class="inp" id="pr-disp" name="disp" inputmode="decimal" value="${fmt(disp)}"></label>
        <label class="f">Contas até o dia<input class="inp" id="pr-ate" name="ate" type="date" value="${ate}"></label>
        <label class="check"><input type="checkbox" name="contar" ${UI.contarEntradas ? 'checked' : ''}> Contar com os recebimentos ainda não marcados até lá (${brl(entra)})</label>
        <div class="row-actions" style="justify-content:flex-start"><button class="btn pri" type="submit">Calcular</button></div>
      </form>
      <div class="stats" style="margin-top:20px">
        <div><span class="eyebrow">A pagar no período</span><span class="sv2">${brl(pagar.reduce((a, i) => a + i.valor, 0))}</span></div>
        <div><span class="eyebrow">Dá para pagar</span><span class="sv2 pos">${plano.filter(p => p.acao === 'pagar').length} contas</span></div>
        <div><span class="eyebrow">Segurar</span><span class="sv2 ${seg.length ? 'neg' : ''}">${seg.length} · ${brl(seg.reduce((a, p) => a + p.it.valor, 0))}</span></div>
        <div><span class="eyebrow">Custo de segurar 30 dias</span><span class="sv2">${brl(custoSeg)}</span></div>
      </div>
      ${cartaoSeg.length ? `<div class="callout bad" style="margin-top:16px"><b>Atenção:</b> mesmo segurando todo o resto, falta dinheiro para pagar integralmente ${cartaoSeg.map(p => esc(p.it.nome)).join(' e ')}. Não pague o mínimo: o rotativo custa de 10% a 16% ao mês. Converse antes com o Walassi e com o condomínio, e se ainda faltar, peça o parcelamento da fatura no app (sai mais barato que o rotativo).</div>` : ''}
    </div></section>
    <section class="card"><div class="hd"><span class="eyebrow">Ordem de pagamento</span><span class="legend"><span><i style="background:var(--good)"></i>pagar</span><span><i style="background:var(--bad)"></i>segurar</span></span></div>
      <div class="bd flush tbl-wrap">${plano.length ? `<table class="t"><thead><tr><th class="v">#</th><th>Conta</th><th>Vence</th><th class="v">Valor</th><th>Decisão</th><th class="v">Custo 30 dias</th><th>Cuidado</th></tr></thead><tbody>
        ${plano.map((p, n) => `<tr><td class="v faint">${n + 1}</td><td><b>${esc(p.it.nome)}</b></td><td>${dataBR(p.it.data)} ${p.it.st === 'atrasado' ? `<span class="chip bad">${p.it.atraso}d atraso</span>` : ''}</td><td class="v">${fmt(p.it.valor)}</td>
          <td>${p.acao === 'pagar' ? '<span class="chip good">pagar</span>' : `<span class="chip bad">${p.cartao ? 'falta dinheiro' : 'segurar'}</span>`}</td><td class="v">${p.acao === 'segurar' ? fmt(p.custo) + ` <span class="faint">(${String(p.pct2).replace('.', ',')}%)</span>` : '—'}</td><td class="muted" style="font-size:13px;min-width:220px">${esc((p.it.ref && p.it.ref.cuidado) || '')}</td></tr>`).join('')}
      </tbody></table>` : '<div class="empty">Nenhuma conta em aberto até essa data.</div>'}</div></section>
    <div class="grid g2">
      <section class="card"><div class="hd"><span class="eyebrow">Antes de atrasar qualquer conta, corte isto</span></div><div class="bd"><div class="lst">
        ${[['Anúncios do Meta sem retorno comprovado', soma(['trafego']), 'Vira fatura de cartão, a única conta que não pode atrasar.'],
          ['Delivery e conveniência', soma(['delivery', 'conveniencia']), 'Teto: R$ 170 de delivery e R$ 85 de conveniência.'],
          ['Restaurantes', soma(['restaurante']), 'Uma saída por semana, mantida de propósito.'],
          ['Compras online e parcelamentos novos', soma(['compras']), 'Regra das 48 horas antes de comprar.'],
          ['Assinaturas e academias', soma(['assinaturas', 'academia']), 'Um plano de cada serviço.']].filter(x => x[1] > 0).map(([n, v, d]) => `<div class="it" style="grid-template-columns:minmax(0,1fr) auto"><div><div class="nm">${n}</div><div class="meta">${d}</div></div><div class="val">${fmt(v)}</div></div>`).join('')}
      </div><p class="p" style="margin-top:10px">Valores da última fatura importada (${curto(ultimoMesComFatura())}).</p></div></section>
      <section class="card"><div class="hd"><span class="eyebrow">Quanto custa atrasar R$ 1.000 por 30 dias</span></div><div class="bd flush tbl-wrap"><table class="t"><thead><tr><th>Conta</th><th class="v">Custo</th><th>Folga</th></tr></thead><tbody>
        ${tabela.map(x => `<tr><td>${esc(x.nome)}</td><td class="v ${x.pct >= 10 ? 'neg' : x.pct === 0 ? 'pos' : ''}">${brl(x.pct * 10)}</td><td class="muted" style="font-size:13px">${esc(x.folga || '')}</td></tr>`).join('')}
      </tbody></table></div></section>
    </div>
    <p class="p">Regras gerais brasileiras: o contrato de cada dívida manda, e a tolerância de cada credor varia. Mudar datas de vencimento é gratuito e quase sempre possível, e resolve a maior parte do aperto sem atrasar nada.</p>`;
  }

  // Envelopes: este mês × mês passado, por categoria.
  function envelopesHTML(tetos, med) {
    const temFat = m => faturasDoMes(m).length > 0;
    const este = temFat(UI.mes) ? UI.mes : ultimoMesComFatura();
    const ant = addMes(este, -1);
    const filtro = UI.envCartao || 'todos';
    const somaMes = (m, cats) => itensFaturas(m, filtro === 'sicredi' ? 'sicredi' : 'todos').filter(i => cats.includes(i.cat) && i.esc !== 'empresa').reduce((a, i) => a + i.v, 0);
    const antReal = temFat(ant) && (filtro === 'todos' || faturaDoMes('sicredi', ant));
    const antMedia = !antReal && Object.keys(med || {}).length;
    const vAnt = t => antReal ? somaMes(ant, t.cats) : antMedia ? t.cats.reduce((a, c) => a + (+med[c] || 0), 0) : null;
    const linhas = tetos.map(t => ({ t, a: vAnt(t), e: r2(somaMes(este, t.cats)) }));
    const tot = { a: linhas.reduce((x, l) => x + (l.a || 0), 0), e: linhas.reduce((x, l) => x + l.e, 0), teto: tetos.reduce((x, t) => x + t.teto, 0) };
    const difCel = (a, e) => a == null ? '<td class="v faint">—</td>' : `<td class="v ${e - a > 0.5 ? 'neg' : a - e > 0.5 ? 'pos' : 'muted'}">${e - a > 0.5 ? '▲ ' : a - e > 0.5 ? '▼ ' : ''}${sinal(e - a)}${a > 0 ? ` <span class="faint">(${(e - a >= 0 ? '+' : '') + pct(e / a - 1)})</span>` : ''}</td>`;
    const cabAnt = antReal ? curto(ant) : `${curto(ant)}*`;
    return `<section class="card"><div class="hd"><span class="eyebrow">Gasto por categoria · ${curto(ant)} × ${curto(este)}</span>
        <div class="seg" role="group" aria-label="Cartões"><button type="button" data-act="env-cartao" data-v="todos" aria-pressed="${filtro === 'todos'}">Todos os cartões</button><button type="button" data-act="env-cartao" data-v="sicredi" aria-pressed="${filtro === 'sicredi'}">Só Sicredi</button></div></div>
      <div class="bd flush tbl-wrap"><table class="t"><thead><tr><th>Categoria</th><th class="v">${cabAnt}</th><th class="v">${curto(este)}</th><th class="v">Diferença</th><th class="v">Teto</th><th>Situação</th></tr></thead><tbody>
        ${linhas.map(l => `<tr><td><b>${esc(l.t.nome)}</b></td><td class="v">${l.a == null ? '<span class="faint">—</span>' : fmt(l.a)}</td><td class="v"><b>${fmt(l.e)}</b></td>${difCel(l.a, l.e)}<td class="v muted">${fmt(l.t.teto)}</td>
          <td>${l.e > l.t.teto ? `<span class="chip bad">${fmt(l.e - l.t.teto)} acima</span>` : `<span class="chip good">dentro</span>`}</td></tr>`).join('')}
        <tr class="tot"><td>Total</td><td class="v">${antReal || antMedia ? fmt(tot.a) : '—'}</td><td class="v">${fmt(tot.e)}</td>${difCel(antReal || antMedia ? tot.a : null, tot.e)}<td class="v">${fmt(tot.teto)}</td><td>${tot.e > tot.teto ? `<span class="chip bad">${fmt(tot.e - tot.teto)} acima</span>` : '<span class="chip good">dentro</span>'}</td></tr>
      </tbody></table></div>
      <div class="bd" style="border-top:1px solid var(--line)"><p class="p">▲ vermelho: gastou mais que no mês passado. ▼ verde: gastou menos. ${antReal ? '' : `* ${curto(ant)} ainda não tem faturas importadas: a coluna usa a média de ago–set do briefing, que só tem o Sicredi. Para comparar igual com igual, use <b>Só Sicredi</b>, ou importe as faturas de ${NOMES_MES[+ant.slice(5) - 1]} dos três cartões.`} Use as setas do mês no topo para escolher qual mês comparar.</p></div></section>`;
  }
  function telaPlano() {
    const pl = S.config.plano || {}; const h = pl.historico || {};
    const mf = ultimoMesComFatura(); const its = itensFaturas(mf);
    const somaCat = (cs, f) => its.filter(i => cs.includes(i.cat) && i.esc !== 'empresa' && (!f || f(i))).reduce((a, i) => a + i.v, 0);
    // histórico de faturas por mês
    const meses = [...new Set([...Object.keys(h.faturas || {}), ...Object.values(S.faturas).filter(f => !f.extrato).map(f => f.mes)])].sort();
    const cartoes = ['sicredi', 'nubank_laura', 'nubank_ricardo', 'mercadopago'];
    const valorHist = (m, c) => { const f = faturaDoMes(c, m); if (f) return { v: f.total, real: true }; const x = (h.faturas || {})[m]; return x && x[c] != null ? { v: x[c], est: (x._estimados || []).includes(c) } : null; };
    // comparativo Sicredi: média ago–set × mês importado
    const fs = faturaDoMes('sicredi', mf); const med = h.mediaSicredi || {};
    const atualCat = {};
    if (fs) for (const i of fs.itens) { if (i.cat === 'ignorar') continue; const pc = P.parcelaDe(i.desc, i.parc); const c = pc && pc.n >= 2 ? 'parcelas' : i.cat; atualCat[c] = (atualCat[c] || 0) + i.v; }
    const linhasCmp = [...new Set([...Object.keys(med), ...Object.keys(atualCat)])].map(c => ({ c, m: +med[c] || 0, a: r2(atualCat[c] || 0) })).sort((a, b) => b.m - a.m || b.a - a.a);
    const tetos = pl.tetos || [];
    const pend = Object.entries(pl.pendencias || {});
    const caixa = G().caixa != null ? +G().caixa : 0;
    return `${pageHead('Plano e histórico', 'O que estava no briefing financeiro: meses passados, média das faturas, tetos de gasto, plano de cortes, reserva e pendências.', true)}
    <section class="card"><div class="hd"><span class="eyebrow">Faturas mês a mês</span><span class="legend"><span>real = arquivo importado</span><span>* estimado pela média do briefing</span></span></div>
      <div class="bd flush tbl-wrap"><table class="t"><thead><tr><th>Cartão</th>${meses.map(m => `<th class="v">${curto(m)}</th>`).join('')}</tr></thead><tbody>
        ${cartoes.map(c => `<tr><td>${esc(CARTOES[c])}</td>${meses.map(m => { const x = valorHist(m, c); return `<td class="v">${x ? fmt(x.v) + (x.est ? '*' : '') : '<span class="faint">—</span>'}</td>`; }).join('')}</tr>`).join('')}
        <tr class="tot"><td>Total conhecido</td>${meses.map(m => `<td class="v">${fmt(cartoes.reduce((a, c) => a + ((valorHist(m, c) || {}).v || 0), 0))}</td>`).join('')}</tr>
      </tbody></table></div>
      ${(h.notas || []).length ? `<div class="bd" style="border-top:1px solid var(--line)"><div class="lst">${h.notas.map(n => `<div class="it" style="grid-template-columns:minmax(0,1fr)"><span class="muted">${esc(n)}</span></div>`).join('')}</div></div>` : ''}</section>
    ${linhasCmp.length && fs ? `<section class="card"><div class="hd"><span class="eyebrow">Fatura Sicredi: média de ago–set × ${curto(mf)}</span><span class="chip ${fs.total > (h.mediaSicrediTotal || 0) ? 'bad' : 'good'}">${curto(mf)} ${pct(fs.total / (h.mediaSicrediTotal || fs.total) - 1)} vs média</span></div>
      <div class="bd flush tbl-wrap"><table class="t"><thead><tr><th>Categoria</th><th class="v">Média ago–set</th><th class="v">${curto(mf)}</th><th class="v">Diferença</th></tr></thead><tbody>
        ${linhasCmp.map(x => `<tr><td>${esc(P.CAT[x.c] ? P.CAT[x.c].nome : x.c)}</td><td class="v">${x.m ? fmt(x.m) : '—'}</td><td class="v">${fmt(x.a)}</td><td class="v ${x.a - x.m > 50 ? 'neg' : x.m - x.a > 50 ? 'pos' : 'muted'}">${sinal(x.a - x.m)}</td></tr>`).join('')}
        <tr class="tot"><td>Total</td><td class="v">${fmt(h.mediaSicrediTotal || 0)}</td><td class="v">${fmt(fs.total)}</td><td class="v ${fs.total > (h.mediaSicrediTotal || 0) ? 'neg' : 'pos'}">${sinal(fs.total - (h.mediaSicrediTotal || 0))}</td></tr>
      </tbody></table></div></section>` : ''}
    ${tetos.length ? envelopesHTML(tetos, med) : ''}
    <div class="grid g2">
      ${(pl.cortes || []).length ? `<section class="card"><div class="hd"><span class="eyebrow">Plano de cortes</span><span class="chip good">${brl(pl.cortes.reduce((a, c) => a + c.mes, 0))}/mês</span></div><div class="bd flush tbl-wrap"><table class="t"><tbody>
        ${pl.cortes.map(c => `<tr><td><b>${esc(c.acao)}</b><span class="nota">${esc(c.como)}</span></td><td class="v">${fmt(c.mes)}</td></tr>`).join('')}
      </tbody></table></div><div class="bd" style="border-top:1px solid var(--line)"><p class="p">A função dos cortes é construir o colchão do dia 15, para que um mês mais fraco não empurre vocês para o rotativo.</p></div></section>` : ''}
      ${(pl.escada || []).length ? `<section class="card"><div class="hd"><span class="eyebrow">Escada da reserva</span><span class="chip">${G().caixa != null ? 'caixa ' + brl(caixa) : 'informe o caixa'}</span></div><div class="bd"><div class="lst">
        ${pl.escada.map((e, i) => `<div class="it" style="grid-template-columns:34px minmax(0,1fr) auto"><div class="ic out" style="background:var(--accent-bg);color:var(--accent)">${i}</div><div style="min-width:0"><div class="nm">${esc(e.nome)}</div><div class="meta">${esc(e.oque)}</div>${e.meta ? `<div class="stack" style="height:8px;margin-top:8px"><span style="width:${Math.min(100, caixa / e.meta * 100)}%;background:var(--accent)"></span></div>` : ''}</div><div class="val">${e.meta ? fmt(e.meta) : esc(e.txt || '')}</div></div>`).join('')}
      </div><p class="p" style="margin-top:10px">Cada etapa só começa quando a anterior fecha. Isto é organização financeira, não recomendação de produto.</p></div></section>` : ''}
    </div>
    ${pend.length ? `<section class="card"><div class="hd"><span class="eyebrow">Pendências</span><span class="chip">${pend.filter(([, x]) => x.feito).length} de ${pend.length} resolvidas</span></div><div class="bd"><div class="lst">
      ${pend.sort((a, b) => (a[1].feito ? 1 : 0) - (b[1].feito ? 1 : 0) || (a[1].ordem || 0) - (b[1].ordem || 0)).map(([id, x]) => `<label class="it check" style="grid-template-columns:22px minmax(0,1fr);cursor:pointer"><input type="checkbox" data-pend="${esc(id)}" ${x.feito ? 'checked' : ''}><span style="${x.feito ? 'text-decoration:line-through;color:var(--faint)' : ''}">${esc(x.txt)}${x.resposta ? `<span class="nota" style="display:block;font-size:12.5px;color:var(--muted);text-decoration:none">${esc(x.resposta)}</span>` : ''}</span></label>`).join('')}
    </div></div></section>` : ''}`;
  }
  function telaGargalos() {
    const gs = gargalos();
    const n = { critico: gs.filter(g => g.sev === 'critico').length, atencao: gs.filter(g => g.sev === 'atencao').length };
    const conferir = [...Object.values(S.config.contas), ...Object.values(S.config.entradas)].filter(x => x.conferir);
    return `${pageHead('Gargalos financeiros', 'O que mais pesa na administração do dinheiro hoje, calculado a partir das contas, dos recebimentos e das faturas importadas.', false)}
    <div class="grid g3">
      <div class="card kpi"><span class="l">Críticos</span><div class="big num neg">${n.critico}</div><div class="sub">resolver este mês</div></div>
      <div class="card kpi"><span class="l">Atenção</span><div class="big num warn">${n.atencao}</div><div class="sub">hábitos e estrutura</div></div>
      <div class="card kpi"><span class="l">Dados a conferir</span><div class="big num">${conferir.length}</div><div class="sub">valores ou datas estimados</div></div>
    </div>
    <section class="card"><div class="hd"><span class="eyebrow">Do mais urgente para o menos</span></div><div class="bd flush">${gs.map(gargHTML).join('')}</div></section>
    ${conferir.length ? `<section class="card"><div class="hd"><span class="eyebrow">Confirme para os números ficarem exatos</span></div><div class="bd"><div class="lst">${conferir.map(x => `<div class="it" style="grid-template-columns:minmax(0,1fr) auto"><div><div class="nm">${esc(x.nome)}</div><div class="meta">${esc(x.nota || 'Valor ou dia estimado.')} Dia ${x.dia}.</div></div><div class="val">${fmt(x.valor)}</div></div>`).join('')}</div></div></section>` : ''}`;
  }

  function telaVazia() {
    return `${pageHead('Financeiro', '', false)}<section class="card"><div class="bd"><div class="empty"><h2 style="font-family:var(--f-display);font-weight:300;font-size:26px;color:var(--fg);margin-bottom:8px">Ainda não há dados aqui</h2>
      <p class="p" style="margin:0 auto 18px">Carregue a base do briefing: 17 contas, 9 fontes de receita e as faturas de outubro já classificadas. Depois é só importar as próximas faturas.</p>
      <button class="btn pri" type="button" data-act="carregar-base">Carregar a base</button></div></div></section>`;
  }

  // ---------- render ----------
  let renderPendente = false;
  function agendarRender() {
    if (renderPendente) return; renderPendente = true;
    requestAnimationFrame(() => {
      renderPendente = false;
      const a = document.activeElement;
      if (a && $('#main').contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) { a.addEventListener('blur', agendarRender, { once: true }); renderNav(); atualizarStatus(); return; }
      render();
    });
  }
  function render() {
    renderNav();
    $('#app').classList.toggle('menu', UI.menu);
    const sc = $('#scrim'); if (UI.menu && !sc) { const d = document.createElement('div'); d.className = 'scrim'; d.id = 'scrim'; d.dataset.act = 'menu'; document.body.appendChild(d); } else if (!UI.menu && sc) sc.remove();
    if (!S.carregado) return;
    const vazio = !Object.keys(S.config.contas).length && !Object.keys(S.config.entradas).length;
    const telas = { inicio: telaInicio, agenda: telaAgenda, recebimentos: telaRecebimentos, contas: telaContas, custos: telaCustos, projecao: telaProjecao, importar: telaImportar, prioridade: telaPrioridade, gargalos: telaGargalos, plano: telaPlano };
    if (!telas[UI.tab]) UI.tab = 'inicio';
    let html;
    try { html = vazio ? telaVazia() : telas[UI.tab](); }
    catch (e) { console.error(e); html = `${pageHead('Algo deu errado nesta tela', '', false)}<div class="callout bad">${esc(e.message)}</div>`; }
    $('#main').innerHTML = `<div class="wrap">${html}</div>`;
    atualizarStatus(); ligarGraficos(); ligarDrop();
    $('#fab').hidden = vazio;
    renderLayer();
  }
  function renderLayer() {
    if (!UI.fab) { $('#layer').innerHTML = ''; return; }
    $('#layer').innerHTML = `<div class="sheet card"><div class="hd"><span class="eyebrow">Lançar avulso · ${curto(UI.mes)}</span><button class="link" type="button" data-act="fab">fechar</button></div><div class="bd">
      <form class="form" data-form="extra" style="grid-template-columns:1fr 1fr">
        <label class="f" style="grid-column:1/-1">Descrição<input class="inp" name="desc" id="ex-desc" required placeholder="Ex.: venda de consultoria"></label>
        <label class="f">Tipo<select class="inp" name="tipo"><option value="entrada">Entrada</option><option value="saida">Saída</option></select></label>
        <label class="f">Valor<input class="inp" name="valor" inputmode="decimal" required placeholder="0,00"></label>
        <label class="f">Dia<input class="inp" name="dia" type="number" min="1" max="31" value="${UI.mes === mesAtual() ? +hoje().slice(8) : 1}"></label>
        <label class="check" style="align-self:center"><input type="checkbox" name="feito" checked> Já aconteceu</label>
        <div class="row-actions" style="grid-column:1/-1;justify-content:flex-start"><button class="btn pri" type="submit">Lançar</button></div>
      </form></div></div>`;
    const el = $('#ex-desc'); if (el) el.focus();
  }
  let toastT;
  function toast(msg) {
    let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3200);
  }

  // ---------- ações ----------
  function irPara(tab) { UI.tab = tab; UI.menu = false; UI.catSel = null; UI.diaSel = null; lsSet(KEY + ':tab', tab); try { history.replaceState(null, '', '#' + tab); } catch (e) { /* sem histórico */ } render(); window.scrollTo(0, 0); }
  function marcar(tipo, id, m, feito, em, valor) {
    const md = garantirMes(m);
    if (id.startsWith('x:')) { const x = md.extras[id.slice(2)]; if (x) x.feito = feito ? { em: em || hoje() } : null; }
    else {
      const alvo = tipo === 'receber' ? md.recebidos : md.pagos;
      if (feito) { alvo[id] = { em: em || hoje() }; if (valor != null) alvo[id].valor = r2(valor); }
      else delete alvo[id];
    }
    salvarMes(m);
  }
  document.addEventListener('click', ev => {
    const tabB = ev.target.closest('[data-tab]'); if (tabB) { irPara(tabB.dataset.tab); return; }
    const b = ev.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act; const d = b.dataset;
    switch (a) {
      case 'menu': UI.menu = !UI.menu; render(); break;
      case 'mes': UI.mes = addMes(UI.mes, +d.d); UI.diaSel = null; UI.catSel = null; render(); break;
      case 'feito': marcar(d.tipo, d.id, d.m, true); toast(d.tipo === 'receber' ? 'Marcado como recebido.' : `Pago. Falta pagar no mês: ${brl(emAberto().total)} · devo no total: ${brl(devoTotal().total)}.`); render(); break;
      case 'desfazer': marcar(d.tipo, d.id, d.m, false); toast(d.tipo === 'receber' ? 'Voltou para a receber.' : 'Voltou para pendente.'); render(); break;
      case 'conciliar': marcar(d.tipo, d.id, d.m, true, d.em, +d.v); toast('Marcado a partir do extrato.'); render(); break;
      case 'noop': break;
      case 'tudo-pago': {
        const ms = new Set(); for (const it of pendentesAtrasados()) if (it.tipo === 'pagar') { const md = garantirMes(it.m); if (it.id.startsWith('x:')) md.extras[it.xid].feito = { em: it.data }; else md.pagos[it.id] = { em: it.data }; ms.add(it.m); }
        ms.forEach(salvarMes); toast('Contas vencidas marcadas como pagas na data de vencimento.'); render(); break;
      }
      case 'caixa-editar': UI.editCaixa = true; if (UI.tab !== 'inicio') { UI.tab = 'inicio'; } render(); setTimeout(() => { const i = $('#inp-caixa'); if (i) { i.focus(); i.select(); } }, 30); break;
      case 'dia': UI.diaSel = +d.d || null; render(); break;
      case 'editar': UI.editando = UI.editando === d.k ? null : d.k; render(); break;
      case 'remover': {
        if (UI.confirmar !== d.k) { UI.confirmar = d.k; render(); setTimeout(() => { if (UI.confirmar === d.k) { UI.confirmar = null; render(); } }, 4000); break; }
        const [kind, id] = d.k.split(':'); UI.confirmar = null;
        if (kind === 'conta') { delete S.config.contas[id]; salvarContas(); } else { delete S.config.entradas[id]; salvarEntradas(); }
        toast('Removido.'); render(); break;
      }
      case 'remover-extra': { const md = garantirMes(UI.mes); delete md.extras[d.id]; salvarMes(UI.mes); render(); break; }
      case 'nova-conta': { const id = uid('c_'); S.config.contas[id] = { nome: 'Nova conta', valor: 0, dia: 10, grupo: 'casa', prio: 6, atrasoPct: 3, inicio: UI.mes }; salvarContas(); UI.editando = 'conta:' + id; render(); break; }
      case 'nova-entrada': { const id = uid('e_'); S.config.entradas[id] = { nome: 'Nova fonte', valor: 0, dia: 10, inicio: UI.mes }; salvarEntradas(); UI.editando = 'entrada:' + id; render(); break; }
      case 'filtro-cartao': UI.filtroCartao = d.v; UI.catSel = null; render(); break;
      case 'quit-carro': UI.quitCarro = d.v === '1'; render(); break;
      case 'env-cartao': UI.envCartao = d.v; render(); break;
      case 'escopo': UI.escopo = d.v; UI.catSel = null; render(); break;
      case 'cat': UI.catSel = UI.catSel === d.v ? null : d.v; render(); break;
      case 'fab': UI.fab = !UI.fab; renderLayer(); break;
      case 'descartar': UI.importados.splice(+d.i, 1); render(); break;
      case 'salvar-import': salvarImportado(+d.i); break;
      case 'claude': classificarComClaude(+d.i); break;
      case 'ver-fatura': { const f = S.faturas[d.id]; if (f) { UI.mes = f.mes; UI.filtroCartao = f.cartao; } irPara('custos'); break; }
      case 'apagar-fatura': {
        if (UI.confirmar !== 'fat:' + d.id) { UI.confirmar = 'fat:' + d.id; render(); break; }
        UI.confirmar = null; delete S.faturas[d.id]; salvarFatura(d.id); toast('Fatura apagada.'); render(); break;
      }
      case 'apagar-regra': delete S.config.regras[d.k]; salvarRegras(); render(); break;
      case 'carregar-base': carregarBase(); break;
    }
  });
  document.addEventListener('change', ev => {
    const el = ev.target;
    if (el.dataset.valmes) {
      const v = P.numeroBR(el.value); if (isNaN(v)) { toast('Valor inválido. Use o formato 1.234,56.'); return; }
      const md = garantirMes(UI.mes); md.valores[el.dataset.id] = r2(v);
      if (el.dataset.valmes === 'conta' && md.pagos[el.dataset.id]) md.pagos[el.dataset.id].valor = r2(v);
      if (el.dataset.valmes === 'entrada' && md.recebidos[el.dataset.id]) md.recebidos[el.dataset.id].valor = r2(v);
      salvarMes(UI.mes); toast('Valor de ' + curto(UI.mes) + ' atualizado.'); agendarRender(); return;
    }
    if (el.dataset.pend) { const pl = S.config.plano || (S.config.plano = {}); const x = (pl.pendencias || {})[el.dataset.pend]; if (x) { x.feito = el.checked; salvarPlano(); agendarRender(); } return; }
    const ac = el.dataset.actChange;
    if (ac === 'recat') {
      const cat = el.value;
      if (el.dataset.imp != null) {
        const f = UI.importados[+el.dataset.imp]; const it = f.itens[+el.dataset.idx];
        it.cat = cat; it.esc = P.CAT[cat] ? P.CAT[cat].esc : it.esc; aprender(it.desc, cat);
        for (const o of f.itens) if (o !== it && P.chaveEstabelecimento(o.desc) === P.chaveEstabelecimento(it.desc) && o.cat !== 'ignorar') { o.cat = cat; o.esc = it.esc; }
        P.conferencia(f); render();
      } else {
        const f = S.faturas[el.dataset.fid]; if (!f) return; const it = f.itens[+el.dataset.idx];
        it.cat = cat; it.esc = P.CAT[cat] ? P.CAT[cat].esc : it.esc; aprender(it.desc, cat);
        f.soma = r2(f.itens.filter(i => i.cat !== 'ignorar' && i.cat !== 'entrada').reduce((a, i) => a + i.v, 0));
        salvarFatura(el.dataset.fid); toast('Categoria trocada. O sistema vai lembrar deste estabelecimento.'); render();
      }
    } else if (ac === 'esc') {
      const f = UI.importados[+el.dataset.imp]; f.itens[+el.dataset.idx].esc = el.value;
    } else if (el.closest('form[data-form="importado"]')) {
      const fm = el.closest('form'); const f = UI.importados[+fm.dataset.i];
      const fd = new FormData(fm);
      f.extrato = fd.get('extrato') === '1';
      if (!f.extrato) { f.cartao = fd.get('cartao') || f.cartao; f.venc = fd.get('venc') || f.venc; const tv = P.numeroBR(fd.get('total') || ''); f.total = isNaN(tv) ? null : tv; }
      P.processaFatura(f, { regras: S.config.regras }); if (!f.extrato && f.total == null) f.diferenca = null; render();
    }
  });
  function aprender(desc, cat) { const kk = P.chaveEstabelecimento(desc); if (!kk || cat === 'ignorar') return; S.config.regras = S.config.regras || {}; S.config.regras[kk] = cat; salvarRegras(); }
  document.addEventListener('submit', ev => {
    const fm = ev.target; if (!fm.dataset.form) return; ev.preventDefault();
    const fd = new FormData(fm); const tipo = fm.dataset.form;
    if (tipo === 'caixa') {
      const v = P.numeroBR(fd.get('inp-caixa') || $('#inp-caixa').value);
      if (isNaN(v)) { toast('Valor inválido. Use o formato 1.234,56.'); return; }
      S.config.geral = Object.assign({}, G(), { caixa: r2(v), caixaEm: hoje() }); salvarGeral(); UI.editCaixa = false; toast('Caixa atualizado.'); render();
    } else if (tipo === 'conta' || tipo === 'entrada') {
      const alvo = tipo === 'conta' ? S.config.contas : S.config.entradas; const it = alvo[fm.dataset.id]; if (!it) return;
      it.nome = String(fd.get('nome') || '').trim() || it.nome;
      const v = P.numeroBR(fd.get('valor')); if (!isNaN(v)) it.valor = r2(v);
      it.dia = Math.min(31, Math.max(1, +fd.get('dia') || it.dia));
      it.inicio = fd.get('inicio') || null; it.fim = fd.get('fim') || null;
      it.conferir = !!fd.get('conferir'); it.nota = String(fd.get('nota') || '').trim() || undefined;
      if (tipo === 'conta') { it.grupo = fd.get('grupo') || 'casa'; it.prio = Math.min(11, Math.max(1, +fd.get('prio') || 6)); it.auto = !!fd.get('auto'); const ap = P.numeroBR(fd.get('atrasoPct')); if (!isNaN(ap)) it.atrasoPct = ap; }
      Object.keys(it).forEach(kk => it[kk] === undefined && delete it[kk]);
      tipo === 'conta' ? salvarContas() : salvarEntradas();
      UI.editando = null; toast('Salvo.'); render();
    } else if (tipo === 'cenario') {
      const v = P.numeroBR(fd.get('vendas') || '0');
      UI.cen = { vendas: isNaN(v) ? 0 : v, semAds: !!fd.get('semAds'), cortes: !!fd.get('cortes') }; lsSet(KEY + ':cen', UI.cen); render();
    } else if (tipo === 'prioridade') {
      const v = P.numeroBR(fd.get('disp')); UI.disp = isNaN(v) ? 0 : v; UI.ate = fd.get('ate') || null; UI.contarEntradas = !!fd.get('contar'); render();
    } else if (tipo === 'extra') {
      const v = P.numeroBR(fd.get('valor')); if (isNaN(v) || v <= 0) { toast('Informe um valor maior que zero.'); return; }
      const md = garantirMes(UI.mes); const id = uid('x');
      md.extras[id] = { desc: String(fd.get('desc')).trim(), valor: r2(v), dia: Math.min(31, Math.max(1, +fd.get('dia') || 1)), tipo: fd.get('tipo') === 'saida' ? 'saida' : 'entrada' };
      if (fd.get('feito')) md.extras[id].feito = { em: dataNoMes(UI.mes, md.extras[id].dia) };
      salvarMes(UI.mes); UI.fab = false; toast('Lançado em ' + curto(UI.mes) + '.'); render();
    }
  });
  window.addEventListener('hashchange', () => { const t = location.hash.slice(1); if (t && t !== UI.tab && TABS.some(x => x[0] === t)) irPara(t); });
  $('#fab').addEventListener('click', () => { UI.fab = !UI.fab; renderLayer(); });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') { if (UI.fab) { UI.fab = false; renderLayer(); } if (UI.menu) { UI.menu = false; render(); } } });

  // ---------- importação ----------
  function ligarDrop() {
    const dz = $('#drop'); if (!dz || dz.dataset.ok) return; dz.dataset.ok = '1';
    ['dragenter', 'dragover'].forEach(e => dz.addEventListener(e, ev => { ev.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(e => dz.addEventListener(e, ev => { ev.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', ev => lerArquivos(ev.dataTransfer.files));
  }
  document.addEventListener('dragover', ev => { if (UI.tab !== 'importar') ev.preventDefault(); });
  document.addEventListener('drop', ev => { if (UI.tab !== 'importar' && ev.dataTransfer && ev.dataTransfer.files.length) { ev.preventDefault(); UI.tab = 'importar'; lerArquivos(ev.dataTransfer.files); } });
  $('#file').addEventListener('change', ev => { lerArquivos(ev.target.files); ev.target.value = ''; });
  let xlsxP = null;
  function sheetjs() {
    if (!xlsxP) { xlsxP = carregarScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js').then(() => window.XLSX); xlsxP.catch(() => { xlsxP = null; }); }
    return xlsxP;
  }
  let pdfjsP = null;
  function carregarScript(src) { return new Promise((ok, err) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => err(new Error('Não foi possível carregar o leitor de PDF.')); document.head.appendChild(s); }); }
  function pdfjs() {
    if (!pdfjsP) {
      const base = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
      pdfjsP = carregarScript(base + 'pdf.min.js').then(() => carregarScript(base + 'pdf.worker.min.js')).then(() => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js'; return window.pdfjsLib; });
      pdfjsP.catch(() => { pdfjsP = null; });
    }
    return pdfjsP;
  }
  function adivinhaCartao(f) {
    if (f.banco === 'sicredi') return 'sicredi';
    if (f.banco === 'nubank') {
      if (/laura/i.test(f.titular || '')) return 'nubank_laura';
      if (/ricardo/i.test(f.titular || '')) return 'nubank_ricardo';
      const dia = f.venc ? +f.venc.slice(8) : 0;
      const c = Object.values(S.config.contas).find(x => x.cartao && x.cartao.startsWith('nubank') && +x.dia === dia);
      return c ? c.cartao : 'nubank_ricardo';
    }
    const c = Object.values(S.config.contas).find(x => x.cartao); return c ? c.cartao : null;
  }
  async function lerArquivos(lista) {
    const arr = Array.from(lista || []); if (!arr.length) return;
    UI.tab = 'importar';
    for (const file of arr) {
      let f;
      try {
        if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
          toast('Lendo ' + file.name + '…');
          const lib = await pdfjs();
          const linhas = await P.pdfParaLinhas(lib, new Uint8Array(await file.arrayBuffer()));
          f = P.parseNubankLinhas(linhas);
          if (!f.itens.length) throw new Error('Não encontrei lançamentos neste PDF. Por enquanto o leitor de PDF entende faturas do Nubank; para outros bancos, exporte em CSV ou OFX.');
        } else if (/\.xlsx?$/i.test(file.name)) {
          const X = await sheetjs();
          const wb = X.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
          const csv = wb.SheetNames.map(n => X.utils.sheet_to_csv(wb.Sheets[n], { FS: ';' })).join('\n');
          f = P.lerTexto(csv, file.name);
          if (!f.itens.length) throw new Error('Não encontrei lançamentos na planilha. Ela precisa ter colunas de data, descrição e valor.');
        } else {
          const buf = await file.arrayBuffer();
          let txt = new TextDecoder('utf-8').decode(buf);
          if (txt.includes(String.fromCharCode(0xFFFD))) txt = new TextDecoder('windows-1252').decode(buf);
          f = P.lerTexto(txt, file.name);
          if (!f.itens.length) throw new Error('Não encontrei lançamentos. O arquivo precisa ter colunas de data, descrição e valor.');
        }
        f.arquivo = file.name;
        f.cartao = adivinhaCartao(f);
        P.processaFatura(f, { regras: S.config.regras });
      } catch (e) { f = { arquivo: file.name, erro: e.message || String(e) }; }
      UI.importados.unshift(f);
      render();
    }
    if (UI.importados.length) toast('Arquivos lidos. Revise e salve.');
  }
  function salvarImportado(i) {
    const f = UI.importados[i]; if (!f || f.extrato) return;
    if (!f.cartao || !f.venc) { toast('Escolha o cartão e a data de vencimento.'); return; }
    if (f.total == null) { f.total = f.soma; f.totalFonte = 'soma classificada'; }
    const id = f.cartao + '-' + f.venc.slice(0, 7);
    S.faturas[id] = {
      cartao: f.cartao, mes: f.venc.slice(0, 7), venc: f.venc, total: r2(f.total), soma: r2(f.soma), anterior: f.anterior ?? null,
      totalFonte: f.totalFonte || 'total oficial da fatura', formato: f.formato, arquivo: f.arquivo, importadoEm: hoje(),
      itens: f.itens.map(x => { const o = { d: x.d, desc: x.desc, v: x.v, cat: x.cat, esc: x.esc || 'casa', pes: x.pes || (f.cartao === 'nubank_laura' ? 'Laura' : f.cartao === 'nubank_ricardo' ? 'Ricardo' : '') }; if (x.parc) o.parc = x.parc; if (x.novoParc) o.novoParc = true; return o; }),
    };
    if (JSON.stringify(S.faturas[id]).length > 240000) { delete S.faturas[id]; toast('Fatura grande demais para salvar de uma vez. Divida o arquivo por mês.'); return; }
    salvarFatura(id); UI.importados.splice(i, 1);
    toast(`Fatura ${CARTOES[f.cartao] || f.cartao} de ${curto(f.venc.slice(0, 7))} salva. O valor já entrou em Contas a pagar.`); render();
  }
  async function classificarComClaude(i) {
    const f = UI.importados[i]; if (!f || !UI.sample) return;
    const alvo = f.itens.map((x, j) => ({ j, x })).filter(o => o.x.cat === 'outros');
    if (!alvo.length) return;
    UI.classificando = true; render();
    const cats = P.CATEGORIAS.filter(c => !['ignorar', 'entrada'].includes(c.id)).map(c => `${c.id}: ${c.nome}`).join('\n');
    const prompt = `Classifique lançamentos de fatura de cartão de crédito de um casal brasileiro em Alphaville (Barueri, SP). Ela tem uma ótica e ele presta serviços de CRM e tráfego pago.\nCategorias (use só o id):\n${cats}\n\nLançamentos:\n${alvo.map(o => `${o.j}\t${o.x.desc}\tR$ ${fmt(o.x.v)}`).join('\n')}\n\nResponda só com JSON no formato {"<número>": "<id da categoria>"}. Use "outros" quando não der para saber.`;
    try {
      const res = await UI.sample.json(prompt, { modelTier: 'quick' });
      let n = 0;
      for (const o of alvo) { const c = res && res[String(o.j)]; if (c && P.CAT[c] && c !== 'ignorar' && c !== 'entrada') { o.x.cat = c; o.x.esc = P.CAT[c].esc; o.x.fonte = 'Claude'; if (c !== 'outros') n++; } }
      P.conferencia(f); toast(n ? `${n} lançamento${n > 1 ? 's' : ''} classificado${n > 1 ? 's' : ''} pelo Claude. Confira antes de salvar.` : 'O Claude não reconheceu esses estabelecimentos.');
    } catch (e) {
      if (e && e.code === 'not_granted') { UI.sample = null; toast('A classificação pelo Claude não foi autorizada nesta página.'); }
      else if (e && e.code === 'rate_limited') toast('Muitos pedidos seguidos. Tente de novo em alguns minutos.');
      else toast('Não foi possível classificar agora.');
    }
    UI.classificando = false; render();
  }

  let eraEstreito = window.innerWidth < 640;
  window.addEventListener('resize', () => { const e = window.innerWidth < 640; if (e !== eraEstreito) { eraEstreito = e; agendarRender(); } });

  // ---------- início ----------
  render();
  Store.iniciar();
})();
