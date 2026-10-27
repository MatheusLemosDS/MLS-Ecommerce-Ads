# Roadmap canônico — MLS Commerce OS

Atualizado em **27/10/2026**.

> **ESTE É O ROADMAP CANÔNICO DO PROJETO.**
> Toda nova conversa, conexão, sessão do Codex ou continuidade deve começar por este arquivo e por
> [MLS_COMMERCE_OS_CHECKPOINT.json](MLS_COMMERCE_OS_CHECKPOINT.json).
> O arquivo `ROADMAP_BRAZACOMMERCE.md` passa a ser histórico e não deve receber novas decisões de produto.

## 1. Identidade oficial

**Nome do produto:** MLS Commerce OS  
**Posicionamento:** sistema operacional inteligente para e-commerce.  
**Inteligência central:** MLS Hermes.  
**Objetivo:** reunir operação, finanças, produtos, Ads, produção, criativos, marketplaces e automação em uma única plataforma, com agentes especializados que observam, recomendam, executam dentro de limites e auditam o próprio trabalho.

A marca anterior **BrazaCommerce** permanece somente como legado técnico durante a migração segura.

### Regra de migração de nome

Nesta fase, mudar primeiro tudo que o usuário vê. **Não renomear ainda:**

- Workers `brazacommerce-app`, `brazacommerce-auth` e `brazacommerce-finance`;
- bindings e bancos D1;
- domínio `app.brazacommerce.com.br`;
- cookies, headers `X-Braza-*`, nomes de schemas, tabelas e chaves persistidas;
- rotas públicas/privadas;
- identificadores usados por Cloudflare, Shopee, Hermes ou testes de compatibilidade.

Esses nomes são aliases técnicos de compatibilidade. A migração interna só acontece em fase própria, com alias, rollback e teste de produção.

## 2. Referência de produto e experiência

A referência visual/produtiva informada pelo operador é o ecossistema apresentado pelo Seller.IA Club/Instagram: interface limpa, especialistas em um único lugar, diagnóstico executivo e acesso rápido às ações.

O MLS Commerce OS **não deve copiar a interface literalmente**. A referência define o nível mínimo esperado de clareza e percepção de produto. Nossa meta é ir além, conectando os especialistas a uma mesma base operacional e permitindo autonomia progressiva, auditável e limitada.

### Central de Comando — experiência alvo

A tela inicial deve responder rapidamente:

- lucro estimado hoje;
- vendas hoje;
- pedidos pagos;
- margem;
- gasto de Ads;
- TACOS/ROAS quando a base for compatível;
- devoluções e reembolsos;
- repasse previsto;
- despesas e vencimentos;
- alertas prioritários;
- produtos campeões e produtos em risco;
- estado dos agentes.

Os detalhes técnicos continuam disponíveis por drill-down, sem competir com o resumo executivo.

## 3. Arquitetura multiagente

Todos os agentes usam a **mesma verdade operacional**. Um custo alterado em Produtos deve repercutir em Financeiro, Pricing, Ads e Hermes sem cópias divergentes.

### MLS Hermes — Supervisor

Responsável por:

- receber e resumir os estados dos agentes;
- ordenar prioridades;
- detectar conflitos entre recomendações;
- verificar permissões e limites antes de qualquer ação;
- encaminhar tarefas ao especialista correto;
- explicar ao operador o que aconteceu, por quê e com quais evidências.

Hermes não deve inventar dados ausentes nem ignorar bloqueios de confiabilidade.

### Agentes especializados

| Agente | Responsabilidade principal | Estado inicial |
| --- | --- | --- |
| **MLS Finance** | lucro diário/mensal, repasses, DAS, despesas, caixa e conciliação | Base existente; transformar em agente observador |
| **MLS Ads** | ROAS, TACOS, CPA, orçamento, escalar/manter/otimizar/pausar | Leitura existente; execução LOCKED |
| **MLS Pricing** | preço mínimo, preço ideal, margem, ponto de equilíbrio e ROAS mínimo | Planejado |
| **MLS Products** | SKUs, curva ABC, contribuição, cadastro, oportunidades e qualidade dos dados | Base parcial existente |
| **MLS Production** | pedidos, fila DTF, artes, lotes, gargalos e estado operacional | Base DTF existente |
| **MLS Creative** | mockups, fotos, títulos, descrições, criativos e vídeos | Planejado |
| **MLS Inventory** | estoque vendável, reservas, cobertura e reposição | Bloqueado por contrato de estoque |
| **MLS Marketplace** | Shopee, TikTok Shop, Mercado Livre e sincronização | Shopee primeiro; demais progressivos |
| **MLS Returns** | cancelamentos, devoluções, reembolsos e impacto financeiro | Base existente; conciliação incompleta |
| **MLS Auditor** | qualidade dos dados, consistência, permissões e auditoria dos agentes | Evoluir a partir das auditorias existentes |

## 4. Contrato mínimo de cada agente

Cada agente deve ter um estado persistente ou projetável com:

- `agent_id` e versão do contrato;
- modo de autonomia;
- status: saudável, trabalhando, atenção, bloqueado ou erro;
- última análise e próxima execução;
- fontes e idade dos dados;
- tarefas abertas;
- recomendações propostas;
- ações aprovadas;
- ações executadas;
- resultado observado;
- evidências/referências da decisão;
- permissões;
- limites financeiros e operacionais;
- motivo explícito de bloqueio;
- trilha de auditoria.

Agentes não podem usar texto do modelo como única evidência para movimentar dinheiro ou alterar campanhas.

## 5. Modos de autonomia

### OBSERVER — Observador
Analisa, explica e abre tarefas. Não altera sistemas externos.

### ASSISTED — Assistido
Propõe uma ação concreta e exige aprovação explícita do operador antes da execução.

### AUTONOMOUS — Autônomo limitado
Executa somente ações que estejam dentro de políticas persistidas e verificadas no backend.

Uma ação autônoma de Ads, por exemplo, só poderá acontecer se as regras exigidas estiverem satisfeitas: margem mínima, limite diário/mensal, qualidade dos dados, estoque/cobertura, frequência máxima de alteração, perda máxima e ausência de bloqueios financeiros.

**Ads/PROMO permanece LOCKED até a fase específica de escrita oficial e piloto controlado.**

## 6. Estrutura de navegação alvo

A evolução da interface deve convergir para:

1. **Início** — Central de Comando.
2. **Agentes** — equipe digital e fila de trabalho.
3. **Financeiro** — MLS Finance + MLS Returns.
4. **Produtos** — MLS Products + MLS Pricing.
5. **Produção** — MLS Production.
6. **Ads** — MLS Ads.
7. **Criativos** — MLS Creative.
8. **Automação** — políticas, aprovações e execuções.
9. **Marketplaces** — MLS Marketplace.
10. **Histórico** — auditoria completa.

No celular, priorizar Início, Agentes, Produtos, Produção, Ads e Mais.

## 7. Fases da conversão MLS Commerce OS

### M0 — Branding seguro e continuidade canônica — **PUBLICADO**
- [x] Definir nome MLS Commerce OS.
- [x] Definir MLS Hermes como supervisor.
- [x] Definir família inicial de agentes.
- [x] Definir Observer / Assisted / Autonomous.
- [x] Criar este roadmap canônico.
- [x] Criar checkpoint de continuidade.
- [x] Iniciar troca do branding visível no login, gestão e Ads.
- [x] Validar suíte/CI e publicar o branding pela PR #11.
- [ ] Conferir visual real autenticado em desktop e celular.
- [ ] Manter aliases técnicos antigos sem renomear infraestrutura.

**Critério de saída:** marca nova publicada sem regressão, roadmap canônico e checkpoint apontando para a versão publicada.

### M1 — Central de Comando + Agent Registry — **PUBLICADO**
Criar uma nova home seguindo a hierarquia visual definida:

- faixa executiva Hoje;
- lucro/vendas/Ads/margem/pedidos/alertas;
- bloco “Seus agentes”;
- status e última atividade de cada agente;
- prioridades do dia;
- caixa de conversa/ações do MLS Hermes;
- detalhes antigos recolhidos por drill-down.

Implementar primeiro um **Agent Registry somente leitura**, sem criar novas chamadas à Shopee. Os agentes devem projetar o estado das fontes já existentes.

Agentes iniciais na tela:
1. MLS Finance;
2. MLS Ads;
3. MLS Products;
4. MLS Production;
5. MLS Returns;
6. MLS Auditor;
7. MLS Hermes Supervisor.

**Critério de saída:** a Central de Comando deve conseguir dizer “o que está acontecendo e o que precisa de ação” usando apenas dados existentes, sem executar alterações comerciais.

**Publicação:** PR #12, merge `91fc0cf169f67a9440a8e58a033c925b9ce98eed`. Agent Registry em modo Observer, sem chamadas externas adicionais, com CI 2.008 + 67 e deploy dos três Workers confirmado.

### M2 — Finance/Returns confiáveis como agentes observadores — **EM ANDAMENTO / PONTO DE RETOMADA**
Continuar a fase financeira atual:

- fechar cruzamento de liberações por pedido;
- exibir valor de devolução/reembolso por situação;
- identificar diferenças, duplicidades e referências sem correspondência;
- manter lucro realizado desconhecido quando não houver liquidação comprovada;
- transformar pendências em tarefas do MLS Finance/Returns;
- adicionar vencimentos de despesas e contas no resumo do agente.

**Incremento publicado — PR #13:** conciliação de liberações por pedido com repasse-base, ajuste, repasse após ajuste, valor liberado verificável e cruzamento local com devoluções. Estados `NOT_LOCATED`, `AMBIGUOUS`, `LOCATED_UNVERIFIED` e `VERIFIED`. O sidecar v2 reutiliza a coleta/cache existentes; não cria endpoint Shopee, tabela D1 ou polling. [Detalhes](CONCILIACAO_POR_PEDIDO_MLS_FINANCE_RETURNS.md).

**Incremento publicado — PR #14:** acompanhamento temporal separa o mês de criação dos pedidos dos calendários de liberação posteriores. O contrato privado `release-coverage-v1` lê somente a coorte e os ledgers já salvos no Finance, sem capability de rede Shopee. O tracker acompanha uma coorte anterior por cron, preserva falhas, desacelera após identidade completa no corte e mostra a cobertura para meses passados. `identity_complete_at_cutoff` não comprova fim do ciclo, depósito bancário ou saldo ainda a liberar.

**Incremento publicado — PR #16:** o MLS Finance agora lê o `get_income_overview` em background e mostra **Pendente atual na Shopee** separado do mês. Para a loja local, o contrato atual diferencia `Released` e `Pending`; `pending_amount` é tratado como snapshot atual, não como competência, depósito bancário ou lucro. O round-robin financeiro passa a `RELEASES -> RETURNS -> INCOME` sem aumentar o orçamento de uma leitura privada por oportunidade. [Pesquisa](PESQUISA_INCOME_OVERVIEW_SHOPEE_2026_10_27.md).

**Incremento publicado — PR #18:** o MLS Finance agora resume **contas atrasadas, vencendo hoje, próximos 7 dias e próximo vencimento** a partir das datas declaradas no ledger. O `business-month-view-v4` reutiliza o mesmo `LEFT JOIN` mensal já existente, sem query D1 adicional, tabela nova, polling ou chamada Shopee. `NOT_ITEMIZED` continua desconhecido em vez de zero; marcar como pago permanece controle interno e não comprova liquidação bancária.

**Incremento publicado — PR #19:** o MLS Finance agora coleta `get_income_detail` para **Pending atual** somente quando o Income Overview confirma valor pendente maior que zero. A primeira página mantém até 100 registros, `has_more` sinaliza cobertura parcial e `order_sn` nunca sai do Finance Worker: a UI recebe apenas hashes internos, moeda, status, escrow estimado e previsão de liberação. O bloco **Pending atual por pedido** faz somente leitura local D1 ao ser aberto. O round-robin financeiro passa a `RELEASES -> RETURNS -> INCOME -> INCOME_DETAIL`, mantendo uma leitura privada por oportunidade. [Pesquisa](PESQUISA_INCOME_DETAIL_SHOPEE_2026_10_27.md).

**Incremento publicado — PR #21:** o MLS Finance agora audita localmente o Pending atual antes de qualquer paginação: compara de forma descritiva o `pending_amount` do Overview com o subtotal visível de `estimated_escrow_amount`, registra cobertura, `has_more`, quantidade de valores convertíveis e sincronia dos snapshots. `OBSERVED_MATCH` não prova saldo/competência; `OBSERVED_DIFFERENT` vira validação no Seller Centre, não erro contábil. A seção fechada continua sem leitura D1 extra e a auditoria não cria chamada Shopee. [Detalhes](AUDITORIA_PENDING_ATUAL_MLS_FINANCE.md).

**Ainda falta nesta fase:** observar o estado real da auditoria Pending na conta e comparar com o Seller Centre; se houver `PARTIAL_PAGE`, validar cursor/semântica antes da paginação; se houver `OBSERVED_DIFFERENT`, explicar timing/base antes de tratá-lo como divergência material; manter `remaining_receivable` separado do snapshot atual. O horizonte limitado do tracker nunca deve ser usado como prova de que não haverá liberação posterior.

**Critério de saída:** período completo conciliado com explicação de cada diferença material.

### M3 — Products + Pricing Intelligence
- contribuição por SKU;
- curva ABC;
- custo e margem por produto/variação;
- preço mínimo;
- preço-alvo;
- preço promocional seguro;
- ROAS mínimo/ponto de equilíbrio somente quando a base de receita for compatível;
- bloqueio por custo/atribuição/estoque desconhecido.

### M4 — MLS Ads em Shadow Mode
- contrato oficial de campanha/atribuição;
- ranking Escalar / Manter / Otimizar / Pausar;
- recomendações sem escrita;
- simulação do impacto;
- comparação posterior entre recomendação e resultado real;
- MLS Auditor valida a evidência antes de liberar proposta.

### M5 — MLS Hermes Supervisor operacional
- fila única de tarefas;
- conflitos entre agentes;
- prioridade por impacto financeiro, urgência e confiança;
- comandos em linguagem natural;
- “Faça as seguras” somente para ações já classificadas como aprováveis;
- trilha de raciocínio operacional resumida em evidências, não cadeia de pensamento.

### M6 — Escrita assistida
Somente após contratos oficiais e permissões reais:
- ações comerciais específicas;
- aprovação humana por ação/lote;
- idempotência;
- resposta incerta tratada como estado desconhecido;
- rollback quando tecnicamente possível;
- auditoria.

### M7 — Autonomia limitada
- políticas persistidas;
- teto de Ads;
- perda máxima;
- margem mínima;
- estoque mínimo;
- frequência de alteração;
- kill switch;
- aprovação para elevação de limites;
- auditor acompanhando o executor.

### M8 — MLS Creative + Marketplace
- títulos, descrições, mockups, fotos e vídeos;
- avaliação de desempenho dos criativos;
- publicação somente com contrato oficial;
- TikTok Shop e Mercado Livre usando a mesma camada de agentes.

### M9 — MLS Commerce OS maduro
Ciclo:
**coletar → entender → priorizar → recomendar → aprovar/executar → verificar → aprender → auditar.**

## 8. Base técnica já disponível

A conversão não reinicia o projeto. O MLS Commerce OS herda integralmente o que já foi publicado:

- coleta automática em segundo plano;
- financeiro por pedido;
- resumo diário e mensal;
- custos por produto/variação e regras;
- reconhecimento infantil e histórico do tamanho removido;
- despesas, parcelas, aluguel, funcionários e boletos;
- devoluções e ajustes;
- liberações/escrow e reconciliação parcial;
- Ads e calendário;
- catálogo salvo;
- Produção/DTF;
- Hermes com contexto financeiro;
- auditorias, checkpoints e proteção contra dados incompatíveis;
- abertura do painel desacoplada das configurações;
- redução de gravações D1 redundantes.

Base anterior à conversão: **PR #10**, merge
`9c418fd3010f46957d1ce52345baacd76041c788`.

Conversão de identidade M0 publicada pela **PR #11**, merge
`3dab8f0be54d331bcded1fba4c09e9bfdf68256b`. CI de `main` passou e App/Auth/Finance foram publicados. A **M1** foi publicada pela PR #12; o próximo desenvolvimento começa em **M2**.

## 9. Regras permanentes de continuidade

1. **Nunca recomeçar o projeto do zero.**
2. Ler primeiro este roadmap e o checkpoint JSON.
3. Preservar integralmente sistemas já publicados, salvo correção comprovada.
4. Nova funcionalidade deve usar a mesma verdade financeira/catálogo sempre que possível.
5. Não duplicar coletores só para alimentar agentes.
6. Não chamar recomendação de lucro comprovado.
7. Não transformar aprovação de devolução em comprovante bancário.
8. Não atribuir Ads a SKU sem contrato/evidência válida.
9. Não executar Ads, promoção, preço ou estoque externamente enquanto a ação estiver LOCKED.
10. Toda autonomia precisa de limites persistidos, concorrência segura, idempotência e auditoria.
11. Toda entrega relevante atualiza este arquivo e `MLS_COMMERCE_OS_CHECKPOINT.json`.
12. O antigo `ROADMAP_BRAZACOMMERCE.md` é somente histórico.

## 10. Próximo passo ao retomar

A fase canônica é **M2 — Finance/Returns confiáveis como agentes observadores**.

Retomar por:
- validar em fontes oficiais da Shopee a semântica do ciclo de escrow/liberação e de valores ainda não liberados;
- somente habilitar `remaining_receivable` se houver contrato e evidência suficientes; caso contrário manter `null`;
- observar o tracker temporal real após a próxima virada de mês sem duplicar coleta;
- manter Ads/PROMO LOCKED e o lucro realizado desconhecido sem liquidação comprovada.


**Incremento integrado — PR #22, evidência local de Pending:** acrescentar ação
manual de copiar um JSON sanitizado com estado, cobertura, valores agregados e
horários da auditoria Pending. É um apoio para a observação da conta real,
não substitui o Seller Centre, não acessa Shopee e não libera paginação,
recebível ou lucro realizado. Merge `2e35ac0267757f748912f36756c89584aa13efe6`;
CI PR `40559446787` e main `40559823142`, **2.064 Node + 67 Python**.
Deploy Cloudflare e conferência autenticada do Seller Centre continuam pendentes de evidência.
