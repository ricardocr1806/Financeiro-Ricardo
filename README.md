# Financeiro · Laura & Ricardo

Painel de finanças da casa e da empresa: contas a pagar, recebimentos, custos, projeção de 12 meses, importação de faturas com classificação automática e diagnóstico de gargalos.

## Como abrir

- **No claude.ai (recomendado):** a página publicada guarda os dados no banco compartilhado do artifact, então Laura e Ricardo veem e marcam as mesmas contas.
- **Localmente:** abra `index.html` no navegador (ou sirva a pasta com `python3 -m http.server`). Fora do claude.ai os dados ficam no `localStorage` do navegador, começando pela base em `js/seed.js`.

## Abas

| Aba | O que faz |
|---|---|
| Início | Resumo do mês, atrasados com os dias de atraso, o que vence nos próximos 7 dias, leitura do mês |
| Agenda | Calendário com entradas e saídas por dia e o saldo previsto dia a dia |
| Recebimentos | Fontes de receita, dia, status, fim de contrato |
| Contas a pagar | Contas por grupo, valor do mês editável, prioridade de pagamento |
| Custos | Composição do custo, projeção de custos em 12 meses, gasto dos cartões por categoria |
| Projeção | Faturamento previsto × gastos, resultado mensal e acumulado, cenários |
| Importar faturas | Lê CSV/PDF do Nubank, CSV do Sicredi, OFX e CSV genérico; classifica e confere com o total |
| Se faltar dinheiro | Ordem de pagamento pelo custo de atrasar e o que segurar |
| Gargalos | Diagnóstico calculado a partir dos dados |

## Arquivos

- `index.html` — estrutura e estilos
- `js/parsers.js` — leitura de arquivos e regras de classificação (funções puras, testáveis no Node)
- `js/app.js` — estado, cálculos, telas e gráficos
- `js/seed.js` — base inicial: contas do briefing, receitas e as faturas de outubro/2026 já classificadas
