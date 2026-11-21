# Camisetas, compras e disponibilidade DTF — 21/11/2026

A operação existente passa a reunir pedidos salvos, composição física aprovada, camisetas, fornecedores, compras declaradas, recebimentos e reservas. O saldo não é deduzido das vendas nem inicializado por aproximação. A identidade financeira de um kit e a identificação das camisetas físicas continuam fontes diferentes.

## Integrações anteriores concluídas

- PR133: HEAD `1a2e1e76aefa5ab785e21128cc43271c1da258a7`, integrada em `426b1de037b075afa066ace4742e3cf398294bbf`; quatro checks,4.963 Node e67 Python aprovados.
- PR132: HEAD `99f8d9ae9f13424cdfd127539b13063ebeff4bdb`, integrada em `de0bb72e583a84d86b20952e55b352722996cbed`; [CI44896599372](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/44896599372) com quatro checks,5.061 Node e67 Python aprovados. A primeira CI combinada identificou oito expectativas de links antigas; os25 destinos foram mantidos e a verificação do acesso Finance ampliada.

Essas integrações não publicaram na Live. A versão técnica verificada continua17.3; o aceite financeiro real de11/11 eM2/M2.2 permanecem parciais/abertos.

## Uso na operação

1. Em **Produção → Estoque físico de camisetas**, cadastre cada tamanho/cor/modelagem/material e faça a contagem real. Sem contagem, o estoque livre permanece desconhecido.
2. Em **Produção → Camisetas, compras e disponibilidade DTF**, use **Atualizar materiais salvos**. Escolha a data planejada de necessidade; ela não comprova o prazo de envio Shopee. Confira as fontes, a quantidade comercial e as peças físicas.
3. Em **Conferir composição de camisetas**, vincule as variantes físicas e as peças por unidade comercial, inclusive kits. Confirme somente a composição que você conhece e registre a evidência. Isso não aprova automaticamente identidade ou custo histórico financeiro.
4. Confira a lista de faltas. Cadastre fornecedor, cotação e condições conhecidas. Prepare uma compra interna; nenhuma ordem é enviada ao fornecedor e nenhum dinheiro é movimentado. Custo ou frete ausente permanece desconhecido. Recebimento futuro firme só ajuda o planejamento se estiver confirmado e dentro da data necessária.
5. Registre somente recebimentos realmente ocorridos. Um recebimento parcial atualiza compra e estoque na mesma transação, uma única vez; a parte já recebida não volta a contar como chegada futura. Uma compra aberta não torna camisetas disponíveis agora.
6. Confira e reserve o pedido. Todas as variantes do kit são protegidas por fonte, composição, revisões e transação; não fica metade de um kit reservada em silêncio. Mudança de pedido/composição exige revisão e liberação explícita antes de outra geração.
7. Na **fila DTF**, use a conferência das camisetas e a seleção com reserva física. A leitura é atualizada explicitamente antes da seleção/preparação. A seleção mantém os controles de arte, revisão, cancelamento, impressão e reserva DTF existentes. Ela não consome tecido nem comprova fabricação.
8. Registre a fabricação real no fluxo existente e vincule o consumo às peças comprovadas desse registro. A confirmação não cria outra fabricação, despesa ou CMV. Corrigir consumo incorreto exige motivo, evidência e confirmação de que as peças continuam fisicamente lisas; anular fabricação não devolve camisetas automaticamente.
9. Abra **Materiais e obrigações da semana**. Recebimentos, consumos ligados à fabricação, correções e aplicações às obrigações usam suas próprias fontes e datas. Pagamento pode liquidar obrigação de outra semana e não vira segunda dedução. Movimento de sexta sem horário não é distribuído arbitrariamente antes/depois das13h. Contagens/ajustes independentes continuam na auditoria física; o fechamento financeiro salvo mantém período, fontes e revisões originais.

## Mesma fonte para agentes e DTF

Hermes, Finance, Products e Production recebem uma projeção validada do mesmo workspace, com escopo, horário, vetor de fontes, faltas e ações. Os indicadores financeiros, gráficos e os seis cartões V4.1 são preservados. Os agentes não inventam dados nem recebem autoridade de compra, transferência ou escrita Shopee.

A seleção DTF indica reserva conferida **na leitura**; não é uma transação conjunta de impressão e materiais, nem garantia de fabricação. A autoridade do consumo físico continua no comando atômico ligado à fabricação. Ausência/falha dessa fonte não remove o fluxo DTF legado.

## Integridade e limites

Fontes são montadas no servidor. GET não cria tabelas ou fatos. Comandos têm escopo/revisão/request_id, provas das fontes, confirmação explícita e repetição segura; quantidade e saldo enviados pelo navegador não são autoridade. Liberação, consumo e recebimento preservam auditoria. Catálogo atual não comprova identidade antiga.

O adaptador limita a leitura a500 linhas de pedidos salvos e1000 entidades do journal; componentes/recebimentos/políticas têm limites explícitos. Cobertura excedida ficaPARTIAL e não é convertida em plano completo. Um pedido individual comprovado pode operar sem aprovar o restante ausente. Datas futuras são planejamento; estoque é observado hoje.

O limite de chamadas foi verificado com20 consumos. A documentação oficial do [D1batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch) garante transação com rollback se uma instrução falhar. Os [limites D1](https://developers.cloudflare.com/d1/platform/limits/) contam uma chamada batch como uma consulta no orçamento de50 do Free; o código mantém guardas CAS e não depende de aumentar plano/limites. Nenhum cap de assets foi aumentado: os novos clientes usam uma extensão delimitada no asset workspace existente e a produção anterior permanece preservada.

O planejador puro reaproveita exclusivamente os dois fontes/testes do commit local `bac0d8c88acf07bad905fa28172dbc37fa4d541a`; seu workspace e documentos antigos não foram sobrescritos nem usados como checkpoint atual.

## Evidências e próxima ação

O único checkpoint é `docs/MLS_COMMERCE_OS_CHECKPOINT.json`; a validação deste incremento fica em `financial-automation/validation/order-materials-dtf-20261121.json`. Backend, UI, rotas, leitura semanal, concorrência e fontes têm testes focados. O Worker gerado móvel/desktop normal/minificado e a suíte completa precisam da evidência final no SHA exato da nova PR.

Estados separados: implementação funcional presente; testes focados aprovados; integração deste incremento e CI final ainda pendentes; Live não publicada; nenhum estoque, compra, pagamento ou dado financeiro real foi criado para QA. Próximo comando: conferir a main integrada, congelar os fontes, executar os gates completos e abrir a PR com manifesto exato. Depois, o proprietário poderá conferir contagens, composições e documentos reais em uma publicação especificamente autorizada.

A conferência de assets encontrou e corrigiu uma divergência entre a exportação CLIENT e o prefixo dos novos controladores emitidos. Fonte e asset agora são os mesmos bytes. Os14 testes de distribuição passaram, mantendo o deepEqual original com verificação prévia compacta de tamanho/hash. O predecessor DTF de53.814bytes e SHA1f0ca4… continua protegido por fixture extraída da mainDE0, e o motor original permanece byte a byte. O caso real SQLite de reserva física/seleçãoDTF/liberação também passou sem criar lotes ou consumo duplicados. Para a validação completa final e a integração, consultar os checks e o estado atuais da PR indicada no checkpoint.

A primeira CI completa da PR134 (44900135795,HEAD59b) passou5.203 de5.204 testes e detectou apenas a falta de classificação explícita das novas rotas comerciais. A correção registra três entradas exatas com todas as capacidades dos respectivos DTOs; roles, grants e lógica de autorização permanecem idênticos. Não foram acrescentadas permissões bancárias, finance.write ou costs.write. Passaram118 verificações de política/gates e20 casos focados incluindo as prévias locais após a preparação correta da mídia sintética. A nova CI completa da [PR134](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/134) é a autoridade para o HEAD atual; nenhuma falha anterior foi apagada ou contada como aprovação.
