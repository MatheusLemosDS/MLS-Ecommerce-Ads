# M2.2b — registro histórico da produção incorrida

**Primeira etapa interna M2.2b publicada no App; a fase permanece parcial.** Branch `feature/m22-incurred-production-ledger-20261101`, base `07cf2b8` (PR #98), PR [#99](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/99). Fonte `51128b89e67f944ecf62bf55196dac293a3eecac`, head testado `0749710ba9826d6256c2ae02223ed04458a7895f`, CI [41347493170](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41347493170) aprovado. A publicação do App foi verificada separadamente: a PR ainda aguardava o CI documental e a integração Git no momento desse recibo. O controle registra declarações do operador, sem confirmar fabricação real na conta, toda a produção da loja, desembolso ou pagamento.

## Problema e escopo

O custo aplicado aos pedidos elegíveis é uma referência calculada com as regras salvas atuais. Ele pode mudar quando o pedido é cancelado, quando uma composição é corrigida ou quando os preços cadastrados são atualizados. Isso não demonstra quando uma camiseta foi efetivamente produzida nem apaga o custo de uma fabricação já confirmada pelo operador.

Esta primeira etapa M2.2b oferece um ledger global, independente, de **peças físicas homogêneas produzidas e declaradas pelo operador**, com data de fabricação e fotografia do custo informado. O registro é uma declaração com referência e auditoria; não é nota fiscal, confirmação de pagamento ou prova bancária. Quantidade e identidade não são verificadas automaticamente pela fonte operacional.

O painel anterior agora se chama **“Referência de custo das vendas”**. Ele continua calculando a estimativa dos pedidos elegíveis e não recebe uma segunda soma do novo ledger. O novo controle fica na área de Custos, em `incurredProductionDetails`, com o título “Produção realizada · registro histórico”. Não cria outra navegação principal.

O trabalho dá continuidade ao [controle físico de recebimento e inspeção](MLS_M22_PHYSICAL_RETURNS_2026_11_01.md) e à [prioridade M2.2 do roadmap](ROADMAP_MLS_COMMERCE_OS.md). Esses controles registram fatos diferentes: fabricar uma peça, receber uma devolução, inspecioná-la, pagar uma despesa e reconhecer seu valor em estoque não são o mesmo evento.

## Registro de fabricação

| Informação | Regra desta etapa |
| --- | --- |
| Identidade e referência | UUID estável e `production_ref` manual; referências ativas únicas globalmente após normalização Unicode, caixa e espaços |
| Data real declarada | `produced_date` no calendário de Brasília, válida entre 2000 e 2099, sem data futura nem posterior ao dia do registro |
| Quantidade | Inteiro positivo de peças físicas; uma linha/lote tem a mesma data, identidade e custo unitário |
| Identidade das peças | Estampa, cor, tamanho, adulto/infantil e modelagem masculina/feminina/unissex, com campos desconhecidos preservados; catálogo/SKU são referências opcionais |
| Evidência declarada | Descrição de como o operador confirmou a fabricação; confirmação explícita antes de gravar |
| Custo | Valor unitário declarado em centavos ou UNKNOWN, com fotografia imutável e referência opcional validada |
| Origem opcional | Lote manual ou contexto DTF salvo conferido pelo servidor, sem afirmar que esse contexto comprova produção |
| Histórico | Autor, horários, revisão, requisição idempotente, situação ACTIVE/VOID, motivo e vínculo de substituição |

Peças com identidades ou custos diferentes precisam de registros distintos. A quantidade de uma unidade vendida de kit não é convertida automaticamente em camisetas produzidas. No exemplo SIMULADO de três peças a R$ 15,90, o custo declarado é R$ 47,70 nesse registro, independentemente de o anúncio ter uma unidade vendida. Isso não confirma a composição ou quantidade original esperada do pedido.

Uma mudança posterior para `CANCELLED`, `TO_RETURN` ou `REFUND_PAID`, ou a remoção da fonte DTF salva, não altera o fato já registrado. O custo histórico não é reprecificado com as configurações atuais e uma fotografia UNKNOWN não é preenchida automaticamente quando uma nova referência aparece.

## Custo conhecido, zero e ausência de registros

O contrato de custo distingue `DECLARED` e `UNKNOWN`. Um custo declarado exige valor unitário explícito, inclusive quando for zero. Campo vazio ou `null` nunca é convertido em zero. Em UNKNOWN, `unit_cost_cents` e a referência de custo permanecem nulos.

O operador pode informar o valor manualmente. Como opção, pode selecionar uma referência adulta atual `all_inclusive` e confirmar expressamente que ela representa o custo histórico da fabricação declarada. O servidor confere revisão, valor e faixa adulta compatível, e grava a fotografia daquela referência. A simples existência do preço atual ou do tamanho da peça não cria custo incorrido.

Não há sugestão automática por peça a partir do modo itemizado, nem divisão de preço de kit ou aplicação automática de regra infantil. Referência indisponível não bloqueia lote manual com custo declarado ou UNKNOWN. Valores all-inclusive não são decompostos em peça/estampa, embalagem e etiqueta por inferência.

| Estado do resumo | Significado |
| --- | --- |
| `NO_RECORDS` | Nenhum registro ativo no recorte; subtotal dos valores registrados é zero, mas o total permanece nulo. Não comprova custo zero de toda a operação |
| `PARTIAL_COSTS` | Há peças ativas com custo UNKNOWN; subtotal conhecido e quantidades conhecidas/desconhecidas são separados, e o total permanece nulo |
| `DECLARED_COSTS` | Todos os custos dos registros ativos incluídos foram declarados; o total pode ser zero apenas por declaração explícita |

Os resumos excluem registros VOID das quantidades e custos ativos, mas mantêm a quantidade de registros anulados. Uma anulação corrige a declaração interna; não afirma que a fabricação deixou de ocorrer, devolve dinheiro ou movimenta estoque. Somas e multiplicações precisam permanecer em inteiros seguros, sem arredondamento de valores desconhecidos.

## Semana e mês pela data de produção

Os seletores de mês e dia de referência semanal são independentes. O mês vai do primeiro dia até o menor entre seu último dia e hoje em Brasília. A semana vai de segunda-feira até o menor entre domingo e hoje em Brasília; pode cruzar mês e ano.

Os dois recortes usam `produced_date`, não a data em que o formulário foi salvo, o mês de criação do pedido ou sua situação atual. Uma produção de outubro registrada em novembro continua pertencendo a outubro nesse ledger. Semana e mês podem incluir as mesmas peças: **não somar os dois totais**.

Os valores devem aparecer como **custos incorridos registrados/declarados**. Nem um resumo com todos os custos declarados comprova que toda a fabricação da loja foi lançada. Um período vazio continua distinto de um período com produção registrada a custo explicitamente zero.

## Origem DTF salva e referências atuais

O adaptador lê até 50 contextos DTF locais, com indicação de leitura parcial ou indisponível. Essa seleção não é o histórico completo dos pedidos. A quantidade da fonte continua identificada como unidades vendidas, não peças produzidas; situações canceladas ou contexto ausente não apagam registros históricos.

O servidor deriva e confere chaves, hashes, horário e situação da origem. O cliente não pode declarar arbitrariamente um vínculo como confiável. Identificadores pessoais, seriais de pedidos e credenciais não entram no contrato do navegador. A origem é opcional: lote manual e histórico salvo continuam disponíveis quando DTF ou custos atuais não puderem ser lidos.

Uma nova declaração com fonte ou referência desatualizada deve falhar para conferência. A repetição de uma requisição já confirmada é diferente: ela usa a identidade e o conteúdo originais antes de exigir novamente a fonte/referência atual, de modo que uma resposta perdida não duplique produção nem se torne impossível de recuperar após mudança de configuração.

## Correções, concorrência e conservação do histórico

Data, identidade, quantidade, origem e fotografia do custo não são editadas silenciosamente depois da gravação. A correção exige anular o registro com motivo e criar uma substituição explícita, vinculada ao predecessor VOID com a mesma referência normalizada.

Cada predecessor admite apenas uma substituição. A cadeia pode continuar quando essa substituição também for anulada, mas não pode ramificar, formar ciclo ou reutilizar uma referência histórica por um novo registro sem vínculo. O histórico anterior permanece completo, inclusive depois da correção de quantidade, data ou custo.

Revisão esperada (CAS), identidade da requisição, hash canônico do conteúdo, gravação do registro e auditoria são conferidos na mesma transação. A mesma requisição após timeout deve devolver o resultado sem registrar fabricação novamente. A mesma identidade de requisição com conteúdo diferente é conflito. Falhas de gravação/auditoria não podem produzir uma revisão ou um custo parcial.

## API, leitura passiva e limites

A rota owner publicada é `/api/admin/production/incurred?month=AAAA-MM&week_of=AAAA-MM-DD`, com os dois parâmetros explícitos para GET e POST. Autenticação, método, origem e CSRF de mutações são validados antes da inicialização global ou de DDL. O corpo de mutação tem limite de 8.192 bytes.

GET usa somente SELECT, sem criar tabelas, consultar provedor ou gravar registros. Um banco ainda não inicializado retorna ledger vazio válido com `NO_RECORDS`, sem afirmar que a loja não teve fabricação. Schema parcial ou estado corrompido falham explicitamente. As quatro tabelas próprias são aditivas e inicializadas apenas pelo caminho de mutação validado; não entram no schema global nem acrescentam trabalho ao cron.

| Capacidade | Regra |
| --- | --- |
| 1.000 registros globais | Inclui ativos e anulados; rejeitar o próximo registro excedente sem apagar histórico |
| 8.192 bytes por registro | Medir UTF-8, além de validar campos e quantidades |
| 1 MiB no DTO completo | Rejeitar antes de qualquer mutação que ultrapasse o limite; sem truncamento silencioso |

A lista local é paginada para manter a interface leve. Navegar nesses registros não exige coletar pedidos novamente. Os formulários devem preservar rascunhos e a requisição imutável após falha de confirmação, e ignorar respostas antigas após troca de seleção ou logout.

## Isolamento financeiro e limites desta entrega

`financial_integration_allowed` e `external_stock_write_allowed` permanecem falsos. A avaliação global de estoque continua `UNKNOWN` com `amount_cents = null`; o `inventory_value_cents` de cada custo também fica nulo, mesmo quando o custo de fabricação foi declarado.

O módulo não grava em Finance/Auth, custos de referência, totais líquidos, DTF, recebimento físico de devoluções ou estoque externo. Não soma novamente os valores registrados ao custo de produção já usado pelo resultado das vendas. Não confunde custo incorrido com caixa pago nem converte uma referência de custo em valor recuperável da peça devolvida.

Continuam abertos: quantidades/itens originais esperados verificados, produção real completa da loja, decomposição histórica de peça/estampa versus embalagem/etiqueta consumidas, custo incremental de reparo/nova embalagem, vínculo entre fabricação e peça devolvida, valoração do estoque recuperado, reservas, consumo na revenda e integração contábil sem dupla contagem. A divisão dos valores all-inclusive depende de fatos do operador; não será presumida.

## Critérios de validação e publicação

A suíte local completa passou em **3.099 testes Node e 67 Python**, sem falhas ou skips; a bateria direcionada tem **43 testes aprovados**. O CI do head exato também passou. A QA do Worker gerado, normal/minificado, cobre **320 e 1365 px**. Fabricação, custos e correções exercitados nos testes são **SIMULADOS LOCALMENTE**; nenhum fato de fabricação foi criado na Live para validar o formulário.

| Critério | Evidência exigida | Evidência desta etapa |
| --- | --- | --- |
| Custo histórico independente | Mudanças de configuração/fonte/situação não reprecificam nem apagam registros; UNKNOWN não é preenchido depois | APROVADO em testes locais/simulados |
| Quantidade física declarada | Três peças a R$ 15,90 resultam em R$ 47,70; quantidade de kit/DTF não preenche automaticamente a fabricação | APROVADO em testes locais/simulados |
| Ausência, UNKNOWN e zero | Período vazio, custo desconhecido e zero confirmado têm estados/totais distintos | APROVADO em testes locais/simulados |
| Períodos de Brasília | Data de produção diferente da gravação, semana cruzando mês/ano e recortes sobrepostos | APROVADO em testes locais/simulados |
| Cadeia de correção | VOID preserva fatos/auditoria; substituições sem ramificação, ciclos ou referência reutilizada sem vínculo | APROVADO em testes locais/simulados |
| Concorrência e repetição | CAS, referência normalizada duplicada, mesmo envio após timeout e conflito de conteúdo | APROVADO em testes locais/simulados |
| Falhas e limites | Auditoria/gravação revertidas juntas, estado corrompido, datas/valores inválidos e limites UTF-8 | APROVADO em testes locais/simulados |
| Leitura passiva e fonte | GET frio sem DDL/provedor, guards antes de inicialização e vínculo verificado no servidor | APROVADO em testes locais/simulados |
| Sem dupla contagem ou estoque | Fontes financeiras e DTO de resultado preservados; DTF e controle físico não mudam; avaliação segue desconhecida | APROVADO em testes locais/simulados |
| Cliente e Worker gerado | Formulários, retry, rascunhos, CAS e logout; normal/minificado e 320/1365 px em dados simulados | APROVADO em testes locais/simulados |
| Release | Suíte completa, Python, CI e bytes/configuração/domínios/flags/cron dos três Workers | APROVADO em testes e no recibo real de publicação |

As suites de [núcleo](../web/cloudflare/tests/incurred-production.test.mjs), [contabilidade adversarial](../web/cloudflare/tests/incurred-production-adversarial.test.mjs), [adaptador](../web/cloudflare/tests/incurred-production-workspace.test.mjs), [cliente](../web/cloudflare/tests/incurred-production-client.test.mjs) e [Chromium](../web/cloudflare/tests/incurred-production-chrome.test.mjs) foram executadas. A navegação por teclado e outras modalidades de acessibilidade não foram exercitadas explicitamente nesta QA e não são declaradas verificadas. Testes autenticados locais e leitura operacional salva não comprovam uso físico real pelo proprietário.

| Registro da entrega | Estado |
| --- | --- |
| PR e commit revisado | #99, fonte `51128b89e67f944ecf62bf55196dac293a3eecac`; head testado `0749710ba9826d6256c2ae02223ed04458a7895f` |
| Suíte local completa e QA final | 3.099 Node, 67 Python e 43 direcionados aprovados; QA local/simulada normal/minificada 320/1365 |
| CI GitHub do código no head exato | 41347493170, GREEN |
| Hashes gerados/publicados e versões App/Auth/Finance | Os três bytes exatos conferidos; tabela abaixo |
| Publicação na Live e comparação da configuração | App `c33b1d03-6ef5-4420-8452-06bb255abb89`; configuração preservada; integração Git tratada separadamente |
| Uso real confirmado pelo proprietário, com fatos de fabricação/custo | NÃO EXECUTADO |

## QA com fonte operacional real e fatos simulados

Uma cópia somente leitura da fonte operacional salva foi reproduzida localmente no mesmo App gerado `936c2cb0659f79805df88e66bf10ea198c30a052dfbd22cf53dfe2bccc396cab`, em 320/1365 px: 50 contextos DTF incluídos e referência de custo na revisão 5. Essa seleção limitada não é o histórico completo dos pedidos nem prova que houve fabricação. O caso operacional de pedido cancelado com unidade vendida de kit igual a 1 não preencheu automaticamente a quantidade de peças.

No exercício **SIMULADO LOCAL**, foram declaradas três peças a R$ 15,90, total de R$ 47,70, com produção em 31 de outubro; um lote de novembro com custo UNKNOWN foi anulado e substituído por um custo explicitamente zero. Mês e semana ficaram independentes. As quatro fontes financeiras observadas, o contexto DTF, os custos salvos e o DTO financeiro v4 permaneceram inalterados nessa comparação local. Não houve escrita de fatos na Live nem chamadas de provedor por essa QA.

O acesso público do executor continua bloqueado pelo WAF Cloudflare com resposta 403; nenhum bypass foi usado. O fluxo real de fabricação/custo do proprietário permanece **NÃO EXECUTADO** nesta validação.

## Publicação verificada

O recibo privado `publication-receipt.json`, no diretório ignorado `attachments/live-m22-incurred-production-baseline-20261101/`, confirma a publicação concluída em `2026-11-01T20:40:32+00:00`. Os três Workers ficaram em versões únicas de 100%, com bytes, configurações, bindings, domínios, flags e cron conferidos. Somente o App mudou; Auth e Finance foram preservados. Não houve escrita comercial ou alteração de valores financeiros remotos.

| Worker | Versão | SHA-256 gerado | SHA-256 publicado |
| --- | --- | --- | --- |
| app | `c33b1d03-6ef5-4420-8452-06bb255abb89` | `936c2cb0659f79805df88e66bf10ea198c30a052dfbd22cf53dfe2bccc396cab` | `4bc7a1e827df84720c0848d9ee735d23985e3507c30f3330078d8f3acf690eb9` |
| auth | `37bead27-c941-40e6-87e8-832f01d1785a` | `c63ee09b2d98b6321e3ae7feae1066a9eec9160b49868d72fb84cb0471a0018d` | `46053d0b5f11ff4d738b4cf2cc1cc6afda7d21e233980b1e640f63728f32af2a` |
| finance | `e0b258a2-e73f-45d2-912a-1cb6fd666e18` | `dff201100ed319f3b7d4d8cabf6826237be3a140e679f562cb982cec5bdd89b4` | `b4195212972f5a9f0f8ff08c9504e983f8bd3ca3b3c42493cb7c88addb84de8b` |

Merge em `main`, CI e deploy continuam evidências distintas; este recibo de publicação não declara que a integração Git já terminou.

## Próximas etapas abertas

Conferir as quantidades e os itens originais esperados e vincular a peça devolvida ao fato histórico de fabricação correto, preservando identidade e quantidades. Depois confirmar com o operador a decomposição de peça/estampa versus embalagem/etiqueta consumidas e os custos incrementais de reparo/nova embalagem. Não dividir automaticamente all-inclusive nem transformar a referência atual em valor recuperável.

A etapa interna do ledger já foi entregue; não é necessário implementá-la novamente. Valoração, reservas, revenda, alocação de lotes e a ponte contábil sem dupla contagem continuam abertas. M2 e M2.2 não estão encerradas, e nenhuma etapa deste registro autoriza escrita comercial ou movimentação automática de estoque.
