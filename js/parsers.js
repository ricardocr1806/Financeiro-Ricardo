/* Leitura e classificação de faturas e extratos.
   Funções puras: rodam no navegador (window.FinParsers) e no Node (module.exports). */
(function (root) {
  'use strict';

  const MESES_PT = { JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6, JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12 };

  // ---------- categorias ----------
  const CATEGORIAS = [
    { id: 'mercado', nome: 'Mercado', esc: 'casa', grupo: 'Comida' },
    { id: 'delivery', nome: 'Delivery', esc: 'casa', grupo: 'Comida' },
    { id: 'restaurante', nome: 'Restaurante e lanche', esc: 'casa', grupo: 'Comida' },
    { id: 'conveniencia', nome: 'Conveniência e doces', esc: 'casa', grupo: 'Comida' },
    { id: 'parcelas', nome: 'Parcelas de compras antigas', esc: 'casa', grupo: 'Parcelas' },
    { id: 'combustivel', nome: 'Combustível', esc: 'casa', grupo: 'Carro' },
    { id: 'seguro_carro', nome: 'Seguro do carro', esc: 'casa', grupo: 'Carro' },
    { id: 'manut_carro', nome: 'Manutenção do carro', esc: 'casa', grupo: 'Carro' },
    { id: 'transporte', nome: 'Pedágio, Uber e estacionamento', esc: 'casa', grupo: 'Carro' },
    { id: 'farmacia', nome: 'Farmácia e saúde', esc: 'casa', grupo: 'Saúde' },
    { id: 'academia', nome: 'Academia e bem-estar', esc: 'casa', grupo: 'Saúde' },
    { id: 'assinaturas', nome: 'Streaming e assinaturas', esc: 'casa', grupo: 'Assinaturas' },
    { id: 'compras', nome: 'Compras online e lojas', esc: 'casa', grupo: 'Compras' },
    { id: 'beleza', nome: 'Beleza', esc: 'casa', grupo: 'Compras' },
    { id: 'pet', nome: 'Pet', esc: 'casa', grupo: 'Compras' },
    { id: 'contas_casa', nome: 'Conta da casa paga no cartão', esc: 'casa', grupo: 'Casa' },
    { id: 'tarifas', nome: 'Anuidade, tarifas e IOF', esc: 'casa', grupo: 'Banco' },
    { id: 'juros', nome: 'Juros e multa por atraso', esc: 'casa', grupo: 'Banco' },
    { id: 'ferramentas', nome: 'Ferramentas do negócio', esc: 'empresa', grupo: 'Empresa' },
    { id: 'trafego', nome: 'Tráfego pago (anúncios)', esc: 'empresa', grupo: 'Empresa' },
    { id: 'outros', nome: 'Outros', esc: 'casa', grupo: 'Outros' },
    { id: 'entrada', nome: 'Entrada de dinheiro', esc: 'casa', grupo: 'Entrada' },
    { id: 'ignorar', nome: 'Pagamento de fatura (não é gasto)', esc: 'casa', grupo: 'Ignorar' },
  ];
  const CAT = Object.fromEntries(CATEGORIAS.map(c => [c.id, c]));

  // Ordem importa: a primeira regra que casar vence.
  const REGRAS = [
    ['ignorar', /PAG FAT|PAGAMENTO RECEBIDO|^PAGAMENTO (EM|DE FATURA)|CREDITO DE ATRASO|SALDO EM ATRASO|VALOR PENDENTE DO MES ANTERIOR|PAGAMENTO EFETUADO/],
    ['juros', /MULTA|JUROS|IOF (DE|POR) (FATURA )?ATRAS|IOF DE ATRASO|ENCERRAMENTO DE DIVIDA|ROTATIVO|ENCARGOS|MORA/],
    ['tarifas', /ANUIDADE|TARIFA|IOF COMPRA INTERNACIONAL|^IOF$/],
    ['trafego', /FACEBK|FACEBOOK|META ADS|META PLATFORMS|GOOGLE ?\*? ?ADS|GOOGLE ADS|TIKTOK ADS|TIKTOK FOR BUSINESS|KWAI ADS/],
    ['ferramentas', /ANTHROPIC|CLAUDE|OPENAI|CHATGPT|ELEVENLABS|HOSTINGER|CANVA|JIM ?COM PW2|NOTION|ZAPIER|GOOGLE WORKSPACE|GSUITE|CAPCUT|MANYCHAT|RD STATION|HOTMART|KIWIFY|ZOUTI|REGISTRO\.BR|VERCEL|GITHUB|ADOBE|FIGMA|MIRO|ACTIVECAMPAIGN/],
    ['assinaturas', /NETFLIX|DISNEY|SPOTIFY|APPLE ?\.? ?COM ?\/ ?BILL|GOOGLE ONE|GOOGLE G1|YOUTUBE|PRIME VIDEO|AMAZON PRIME|AMAZONPRIME|HBO|^MAX$|GLOBOPLAY|IFOOD CLUB|DEEZER|PARAMOUNT|CRUNCHYROLL|ICLOUD/],
    ['academia', /IRONBERG|WELLHUB|GYMPASS|SMART ?FIT|ACADEMIA|CROSSFIT|BODYTECH|BLUEFIT|TOTALPASS/],
    ['mercado', /IFD SENDAS|SENDAS|CARREFOUR|SAM ?S |SAMS CLUB|ATACADAO|ASSAI|PAO DE ACUCAR(?! ?MINUTO)|^EXTRA|HORTIFRUTI|HORTI FRUTI|OBA |MAMBO|SEARA ALIMENTOS|EGMAR COMERCIO|SUPERMERCADO|MERCADO (?!LIVRE|PAGO)|DIA BRASIL|ST MARCHE|EMPORIO|ACOUGUE|SACOLAO/],
    ['delivery', /^IFD|IFOOD|RAPPI|KEETA|^KEE |99 ?FOOD|AIQFOME|ZE DELIVERY|UBER ?EATS|JAMES DELIVERY/],
    ['conveniencia', /MINUTO PA|MINUTO PAO|NUTRICAR|PANETTERIA|PADARIA|PANIFICADORA|BRIGADERIA|CACAU SHOW|CHOC|FLAKES DOCES|DOCES|OXXO|AMPM|AM PM|BR MANIA|SELECT |CONVENIENCIA|LA VILLE|KOPENHAGEN|SORVET/],
    ['restaurante', /OUTBACK|HAMBURGUER|RESTA|BURGER|DOMINOS|PIZZ|GASTRONOMIA|PASTEL|KOMBINA|JERONIMO|MC ?DONALD|ARCOS DOURADOS|SUSHI|LANCH|CHURRASC|BAR |BISTRO|CAFE|CAFETERIA|STARBUCKS|COCO BAMBU|MADERO|SPOLETO|HABIBS|POKE|TEMAKI|CANTINA|TRATTORIA|STEAK/],
    ['combustivel', /POSTO|SHELL|IPIRANGA|PETROBRAS|COMBUST|ALE |RAIZEN/],
    ['seguro_carro', /YELUM|SEGURO|PORTO SEG|AZUL SEG|SUHAI|HDI|TOKIO MARINE|ALLIANZ|MAPFRE/],
    ['manut_carro', /HYUNDAI|AUTOCENTER|AUTO CENTER|AKLMOTORSPORT|MOTORSPORT|PNEU|OFICINA|LAVA ?RAPIDO|LAVAGEM|MECANICA|AUTOPECAS|AUTO PECAS|DETRAN|IPVA|LICENCIAMENTO/],
    ['transporte', /UBER|^99 |99APP|99 TECNOLOGIA|RIOSP|PEDAGIO|SEM PARAR|VELOE|CONECTCAR|TAGGY|^BARUERI$|^OSASCO$|ESTAPAR|ESTACIONA|CIRCUIT PARK|ALLPARK|INDIGO|ZONA AZUL|VIACAO|BUSER|CLICKBUS|LATAM|GOL LINHAS|AZUL LINHAS|METRO|CPTM/],
    ['farmacia', /DROGA|FARMACIA|RAIA|PACHECO|PANVEL|DROGASIL|PAGUE MENOS|CLINICA|LABORAT|HOSPITAL|MEDIC|ODONTO|DENTIST|FLEURY|DASA|PSICOLOG|NUTRI(?!CAR)/],
    ['beleza', /HAIR|SALAO|BARBEAR|BARBEARIA|BOTICARIO|NATURA|SEPHORA|ESTETICA|CABELO|NAIL|MANICURE|DEPIL|COSMETIC|BELEZA/],
    ['pet', /PETZ|PET |PETSHOP|COBASI|VETERIN|MY PET/],
    ['contas_casa', /ENEL|SABESP|COMGAS|ELETROPAULO|CPFL|VIVO|CLARO|^TIM |CONDOMINIO|ALUGUEL|NET SERVICOS|ULTRAGAZ|LIQUIGAS/],
    ['compras', /AMAZON|MERCADOLIVRE|MERCADO LIVRE|MERCADOPAGO|SHOPEE|TIKTOK ?SH|SHOPPROTIKTOK|EBN|HAVAN|LEROY MERLIN|MAGALU|MAGAZINE LUIZA|SHEIN|ALIEXPRESS|GOCASE|RETROMAK|PIONEIROTINTAS|KABUM|RENNER|ZARA|C&A|RIACHUELO|CENTAURO|DECATHLON|TOK STOK|CASAS BAHIA|AMERICANAS|SUBMARINO|FAST SHOP|IGUATEMI|LOJA/],
  ];

  function normaliza(s) {
    return String(s || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[“”"']/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Chave usada para lembrar a classificação manual de um estabelecimento.
  function chaveEstabelecimento(desc) {
    let n = normaliza(desc)
      .replace(/ - PARCELA \d+\/\d+$/, '')
      .replace(/\(\d+\/\d+\)/, '')
      .replace(/^IOF DE /, '')
      .replace(/\*[A-Z0-9]{6,}$/, '')
      .replace(/\b[A-Z0-9]*\d[A-Z0-9]*\b/g, '')
      .replace(/[^A-Z ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return n.split(' ').slice(0, 3).join(' ') || normaliza(desc).slice(0, 20);
  }

  function parcelaDe(desc, coluna) {
    const s = String(coluna || '') + ' ' + String(desc || '');
    const m = s.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
    if (!m) return null;
    const n = +m[1], t = +m[2];
    if (!t || n > t || t > 48) return null;
    return { n, t };
  }

  /** Classifica um lançamento. regrasUsuario: { chave: catId } aprendidas no sistema. */
  function classifica(desc, valor, opts) {
    opts = opts || {};
    const regrasUsuario = opts.regras || {};
    const n = normaliza(desc);
    const chave = chaveEstabelecimento(desc);
    if (regrasUsuario[chave]) return { cat: regrasUsuario[chave], fonte: 'regra sua' };
    let alvo = n;
    const iof = n.match(/^IOF DE (.+)$/);
    if (iof && !/ATRAS/.test(n)) alvo = iof[1];
    if (/^ESTORNO DE (.+)$/.test(n)) alvo = n.replace(/^ESTORNO DE /, '');
    for (const [cat, re] of REGRAS) {
      if (re.test(alvo)) {
        const p = parcelaDe(desc, opts.parcela);
        if (p && p.n >= 2 && !['ignorar', 'juros', 'contas_casa', 'seguro_carro', 'ferramentas', 'trafego'].includes(cat)) {
          return { cat: 'parcelas', fonte: 'automática', origem: cat };
        }
        return { cat, fonte: 'automática' };
      }
    }
    const p = parcelaDe(desc, opts.parcela);
    if (p && p.n >= 2) return { cat: 'parcelas', fonte: 'automática', origem: 'outros' };
    return { cat: 'outros', fonte: 'sem regra' };
  }

  // ---------- números e datas ----------
  function numeroBR(s) {
    if (typeof s === 'number') return s;
    let t = String(s || '').replace(/R\$|U\$|US\$|\s/g, '').replace(/−/g, '-');
    if (!t) return NaN;
    const neg = /^-|-$|^\(.*\)$/.test(t);
    t = t.replace(/[-()]/g, '');
    if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
    else if (/\.\d{1,2}$/.test(t)) t = t.replace(/,/g, '');
    else t = t.replace(/[.,]/g, '');
    const v = parseFloat(t);
    return neg ? -v : v;
  }

  function dataISO(s) {
    s = String(s || '').trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) {
      const y = m[3].length === 2 ? '20' + m[3] : m[3];
      return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }
    m = s.match(/^(\d{4})(\d{2})(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    return null;
  }

  function splitCSV(linha, sep) {
    const out = []; let cur = ''; let q = false;
    for (let i = 0; i < linha.length; i++) {
      const c = linha[i];
      if (c === '"') { if (q && linha[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === sep && !q) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out.map(x => x.trim());
  }

  function round2(v) { return Math.round(v * 100) / 100; }

  function montaItem(d, desc, v, extra) {
    const it = Object.assign({ d, desc: String(desc).replace(/\s+/g, ' ').trim(), v: round2(v) }, extra || {});
    return it;
  }

  // ---------- Sicredi (CSV com ponto e vírgula) ----------
  function parseSicredi(texto) {
    const linhas = texto.replace(/^﻿/, '').split(/\r?\n/);
    const f = { formato: 'Sicredi (CSV)', banco: 'sicredi', itens: [] };
    for (const l of linhas) {
      const p = splitCSV(l, ';');
      const k = normaliza(p[0]);
      if (k.startsWith('DATA DE VENCIMENTO')) f.venc = dataISO(p[1]);
      else if (k.startsWith('VALOR TOTAL')) f.total = numeroBR(p[1]);
      else if (k.startsWith('TOTAL DA FATURA ANTERIOR')) f.anterior = numeroBR(p[1]);
      else if (k.startsWith('ASSOCIADO')) f.titular = p[1];
      else if (/^\d{2}\/\d{2}\/\d{4}$/.test(p[0]) && p.length >= 4) {
        const v = numeroBR(p[3]);
        if (isNaN(v)) continue;
        const pes = normaliza(p[6] || '');
        f.itens.push(montaItem(dataISO(p[0]), p[1], v, {
          parc: p[2] ? p[2].replace(/[()]/g, '') : null,
          pes: /LAURA/.test(pes) ? 'Laura' : /RICARDO/.test(pes) ? 'Ricardo' : (p[6] || ''),
          fim: p[5] || null,
        }));
      }
    }
    return f;
  }

  // ---------- Nubank (CSV date,title,amount) ----------
  function parseNubankCSV(texto, nomeArquivo) {
    const linhas = texto.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
    const f = { formato: 'Nubank (CSV)', banco: 'nubank', itens: [] };
    const m = String(nomeArquivo || '').match(/(\d{4}-\d{2}-\d{2})/);
    if (m) f.venc = m[1];
    for (const l of linhas.slice(1)) {
      const p = splitCSV(l, ',');
      if (p.length < 3) continue;
      const d = dataISO(p[0]);
      const v = numeroBR(p[2]);
      if (!d || isNaN(v)) continue;
      const pc = parcelaDe(p[1]);
      f.itens.push(montaItem(d, p[1], v, { parc: pc ? `${pc.n}/${pc.t}` : null }));
    }
    // O CSV do Nubank não traz o total: a fatura é a soma de todas as linhas.
    if (f.itens.length) { f.total = round2(f.itens.reduce((a, i) => a + i.v, 0)); f.totalFonte = 'soma do arquivo'; }
    return f;
  }

  // ---------- Nubank (PDF -> linhas de texto) ----------
  function parseNubankLinhas(linhas) {
    const f = { formato: 'Nubank (PDF)', banco: 'nubank', itens: [] };
    const txt = linhas.join('\n');
    let m = txt.match(/Data de vencimento:?\s*(\d{1,2}) ([A-Z]{3}) (\d{4})/i);
    if (m) f.venc = `${m[3]}-${String(MESES_PT[m[2].toUpperCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    m = txt.match(/Total a pagar\s*R\$\s*([\d.]+,\d{2})/);
    if (m) f.total = numeroBR(m[1]);
    m = txt.match(/Fatura anterior\s*R\$\s*([\d.]+,\d{2})/);
    if (m) f.anterior = numeroBR(m[1]);
    m = txt.match(/Ol[áa],\s*([A-ZÀ-Úa-zà-ú]+)/);
    if (m) f.titular = m[1].charAt(0) + m[1].slice(1).toLowerCase();
    m = txt.match(/Saldo em aberto da pr[óo]xima fatura\s*R\$\s*([\d.]+,\d{2})/);
    if (m) f.proxima = numeroBR(m[1]);
    const ano = f.venc ? +f.venc.slice(0, 4) : new Date().getFullYear();
    const mesV = f.venc ? +f.venc.slice(5, 7) : 12;
    const re = /^(\d{2}) (JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(.*?)\s*([−-])?\s?R\$\s?([\d.]+,\d{2})\s*$/;
    for (const raw of linhas) {
      const l = raw.replace(/\s+/g, ' ').trim();
      const r = l.match(re);
      if (!r) continue;
      let desc = r[3].replace(/•+\s*\d{4}\s*/g, '').trim();
      if (!desc) continue;
      const mes = MESES_PT[r[2]];
      const y = mes > mesV ? ano - 1 : ano;
      const v = numeroBR(r[5]) * (r[4] ? -1 : 1);
      const pc = parcelaDe(desc);
      f.itens.push(montaItem(`${y}-${String(mes).padStart(2, '0')}-${r[1]}`, desc, v, {
        parc: pc ? `${pc.n}/${pc.t}` : null,
        pes: f.titular || '',
      }));
    }
    return f;
  }

  // Transforma o conteúdo do pdf.js em linhas de texto (agrupando por altura).
  async function pdfParaLinhas(pdfjsLib, buffer) {
    const doc = await pdfjsLib.getDocument({ data: buffer, isEvalSupported: false }).promise;
    const linhas = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      const grupos = [];
      for (const it of tc.items) {
        if (!it.str || !it.str.trim()) continue;
        const y = it.transform[5], x = it.transform[4];
        let g = grupos.find(g => Math.abs(g.y - y) < 3);
        if (!g) { g = { y, partes: [] }; grupos.push(g); }
        g.partes.push({ x, s: it.str });
      }
      grupos.sort((a, b) => b.y - a.y);
      for (const g of grupos) linhas.push(g.partes.sort((a, b) => a.x - b.x).map(p => p.s).join(' '));
    }
    return linhas;
  }

  // ---------- OFX ----------
  function parseOFX(texto) {
    const f = { formato: 'OFX', banco: 'ofx', itens: [], extrato: !/<CREDITCARDMSGSRSV1>/i.test(texto) };
    const blocos = texto.split(/<STMTTRN>/i).slice(1);
    const tag = (b, t) => { const m = b.match(new RegExp('<' + t + '>([^<\\r\\n]*)', 'i')); return m ? m[1].trim() : ''; };
    for (const b of blocos) {
      const d = dataISO(tag(b, 'DTPOSTED'));
      const v = parseFloat(tag(b, 'TRNAMT').replace(',', '.'));
      const desc = tag(b, 'MEMO') || tag(b, 'NAME');
      if (!d || isNaN(v)) continue;
      // OFX: negativo = saída. Normalizamos para positivo = gasto.
      f.itens.push(montaItem(d, desc, -v, {}));
    }
    return f;
  }

  // ---------- CSV genérico (extrato ou fatura de outro banco) ----------
  function parseCSVGenerico(texto) {
    const linhas = texto.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
    const cand = [';', ',', '\t'];
    let sep = ';', best = 0;
    for (const s of cand) {
      const n = linhas.slice(0, 10).reduce((a, l) => a + splitCSV(l, s).length, 0);
      if (n > best) { best = n; sep = s; }
    }
    let hi = -1, cols = null;
    for (let i = 0; i < Math.min(linhas.length, 30); i++) {
      const p = splitCSV(linhas[i], sep).map(normaliza);
      const iD = p.findIndex(x => /^(DATA|DATE|DT)/.test(x));
      const iV = p.findIndex(x => /VALOR|AMOUNT|QUANTIA|MONTANTE/.test(x));
      const iT = p.findIndex(x => /DESCRI|HISTORICO|TITLE|LANCAMENTO|ESTABELECIMENTO|DETALHE|MEMO/.test(x));
      if (iD >= 0 && iV >= 0) { hi = i; cols = { iD, iV, iT: iT >= 0 ? iT : (iD === 0 ? 1 : 0) }; break; }
    }
    const f = { formato: 'CSV', banco: 'generico', itens: [] };
    if (!cols) return f;
    for (const l of linhas.slice(hi + 1)) {
      const p = splitCSV(l, sep);
      const d = dataISO(p[cols.iD]);
      const v = numeroBR(p[cols.iV]);
      if (!d || isNaN(v)) continue;
      const pc = parcelaDe(p[cols.iT]);
      f.itens.push(montaItem(d, p[cols.iT] || '', v, { parc: pc ? `${pc.n}/${pc.t}` : null }));
    }
    return f;
  }

  /** Detecta o formato de um arquivo de texto e devolve a fatura lida. */
  function lerTexto(texto, nomeArquivo) {
    const head = texto.slice(0, 2000);
    if (/<OFX>|OFXHEADER/i.test(head)) return parseOFX(texto);
    if (/Cart[ãa]o Mastercard|Associado\s*;|Cooperativa\s*;/i.test(head)) return parseSicredi(texto);
    if (/^﻿?date,title,amount/i.test(head)) return parseNubankCSV(texto, nomeArquivo);
    const g = parseCSVGenerico(texto);
    if (/extrato|conta/i.test(nomeArquivo || '')) g.extrato = true;
    return g;
  }

  /** Classifica todos os itens e calcula a conferência contra o total oficial. */
  function processaFatura(f, opts) {
    opts = opts || {};
    for (const it of f.itens) {
      if (f.extrato) {
        // extrato: positivo = saída; negativo = entrada de dinheiro
        if (it.v < 0) { it.cat = 'entrada'; it.fonte = 'automática'; it.esc = 'casa'; continue; }
      }
      const c = classifica(it.desc, it.v, { regras: opts.regras, parcela: it.parc });
      it.cat = c.cat; it.fonte = c.fonte;
      if (c.origem) it.origem = c.origem;
      it.esc = CAT[it.cat] ? CAT[it.cat].esc : 'casa';
      const pc = parcelaDe(it.desc, it.parc);
      if (pc) { it.parc = `${pc.n}/${pc.t}`; if (pc.n === 1) it.novoParc = true; }
    }
    return conferencia(f);
  }

  function conferencia(f) {
    const validos = f.itens.filter(i => i.cat !== 'ignorar' && i.cat !== 'entrada');
    f.soma = round2(validos.reduce((a, i) => a + i.v, 0));
    if (typeof f.total === 'number' && !isNaN(f.total)) {
      f.diferenca = round2(f.total - f.soma);
      f.confere = Math.abs(f.diferenca) <= 1;
    } else {
      f.diferenca = null; f.confere = null;
    }
    return f;
  }

  const api = { CATEGORIAS, CAT, REGRAS, normaliza, chaveEstabelecimento, classifica, numeroBR, dataISO, splitCSV,
    parseSicredi, parseNubankCSV, parseNubankLinhas, pdfParaLinhas, parseOFX, parseCSVGenerico, lerTexto,
    processaFatura, conferencia, parcelaDe, round2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FinParsers = api;
})(typeof window !== 'undefined' ? window : globalThis);
