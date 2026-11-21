# Pagamentos semanais e camisetas físicas — 20/11/2026

Continuação da main `dc784188e72c1a35dc014155e23c474b95b17cfe`, após os merges
das PRs130 e131. A CI final da PR131 e a repetição na main passaram com 4.910
Node e 67 Python. A Live 17.3 permanece separada e foi reconferida às 23:34:22 UTC.
O estado atual fica somente em `MLS_COMMERCE_OS_CHECKPOINT.json`.

Este incremento pertence aos subitens M2.2-WEEKLY-PRODUCTION-PAYMENTS e
M2.2-PHYSICAL-SHIRT-STOCK. Não reinicia fases concluídas ou usa PR121 como base.
Após a validação local, o proprietário autorizou em 21/11/2026 o envio da branch
ao GitHub, abertura de PR, CI e prévias isoladas Cloudflare. Essa autorização
não inclui publicação da Live ou movimentações financeiras.

## Pagamentos de produção

Em **Produção → Pagamentos semanais**, cadastre o prestador e declare uma
obrigação contratada para uma semana encerrada, com valor e referência reais.
O corte mantém sexta 13h → sexta 13h em Brasília. A obrigação não é criada a partir
do custo integral da fabricação: materiais ou serviços já pagos não geram outra
dívida automaticamente.

Para um pagamento que já ocorreu, informe data, valor e referência. Use a prévia
para conferir a distribuição pelas obrigações mais antigas daquele prestador.
Confirme somente após conferir as parcelas. Exemplo exclusivamente sintético:
obrigações de R$ 1.000 e R$ 800, pagamento de R$ 1.200 → primeira quitada e R$ 600
pendentes na segunda. O mesmo recibo/retry não aplica novamente o pagamento.
Pagamento anterior não liquida silenciosamente uma semana posterior.

Reverter um registro corrige a declaração e recompõe suas obrigações originais;
não estorna dinheiro. Anular obrigação ainda não paga conserva seu histórico.
Referências, revisão e prévia impedem duplicação e alterações concorrentes.
Este livro é operacional: não comprova débito bancário conciliado nem altera
automaticamente despesas, CMV, lucro, fabricação ou o razão legado.

## Camisetas por tamanho e cor

Em **Produção → Camisetas lisas · estoque físico**, cadastre tipo, modelagem,
tamanho, cor e material quando conhecido. Uma variante cadastrada começa sem
saldo confirmado. Informe a contagem inicial real; zero só existe após declaração
explícita. Cores equivalentes normalizadas não criam outra variante.

Registre recebimento somente quando as peças chegarem. Ajustes exigem motivo e
referência; movimentos anteriores à contagem inicial ou ao último movimento salvo são
rejeitados. Uma data fora de ordem exige revisão; o sistema não altera a data
para forçar a gravação nem reconstrói silenciosamente saldos antigos. Reserve
quantidade livre para uma demanda identificada. Liberação e consumo parcial usam
a reserva correspondente; o consumo é uma declaração física explícita.

Físico utilizável, reservado e livre aparecem separadamente. Duas sessões não
reservam o mesmo saldo. Listas e histórico possuem paginação; reabrir/recarregar
não repete gravações. Compra aberta, venda ou PNG não criam saldo; exportar DTF
não consome camiseta. Valor monetário e impacto financeiro permanecem desconhecidos
neste controle, evitando contar o custo outra vez.

## Integridade e compatibilidade

Os dois controles usam journal próprio por empresa/loja, revisão CAS, identidade
da requisição e histórico imutável. GET não cria tabelas. POST inicializa somente
quatro tabelas operacionais e quatro triggers, sem alterar os 114 comandos do
setup legado. O isolamento usa as permissões existentes: finance.read/write
para pagamentos, production.read/write para camisetas, e rotas do proprietário
com origem/CSRF. Comandos vinculam a loja mostrada na tela.

Os módulos novos não recebem autoridade de transferência, marketplace ou rede.
Os gráficos, seis agentes, cálculos históricos, contratos financeiros e a
distinção entre fabricação e venda permanecem preservados. AGENTS.md tornou-se
uma entrada curta; o texto anterior foi preservado integralmente em docs/history.

## Validação e limites

Os testes são sintéticos/locais, sem criar fatos reais. O checkpoint registra
separadamente implementação, teste, integração Git, publicação e aceite real.
A rodada final passou com **5.003 Node, 67 Python, zero falhas, cancelamentos ou
testes ignorados**, e zero vulnerabilidades na auditoria de dependências. A
primeira rodada teve 5.002 aprovações e uma falha na fixture do schema; a correção
acrescentou as quatro tabelas e quatro triggers à instalação em duas namespaces,
preservando todas as asserções. A rodada final completa confirmou o ajuste.

A página gerada foi usada com cliques e digitação nativos em quatro perfis
normal/minificado × 320/1365px e temas claro/escuro, com 24 capturas. O custo,
a fabricação e os fechamentos existentes conservaram 11 módulos byte-idênticos à
main. O setup legado continua com seus 114 comandos SQL e hash conferidos.
Nenhuma suíte, verificação de segurança ou contrato válido foi removido.

O commit-fonte está fixado no manifesto
`tools/release-operating-increment-candidate.json`. O envio da branch, a PR, a CI e
as prévias isoladas foram especificamente autorizados pelo proprietário em
21/11/2026. O [estado atual da PR e seus checks](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pulls?q=is%3Apr+head%3Afeature%2Fweekly-payments-physical-shirts-20261120)
é a fonte para o andamento remoto no SHA exato. A Live permanece bloqueada;
integração Git, publicação e aceite real continuam sendo etapas separadas.

Os caminhos de uso acima estarão disponíveis após integração e publicação
especificamente autorizadas. O código, testes e capturas locais comprovam o
alcance sintético; não comprovam pagamentos, estoque ou aceite da conta real.

Capacidade: cada prestador admite até 1.000 obrigações e 1.000 pagamentos, e cada
variante até 1.000 referências e 1.000 reservas, sujeitos ao payload de 196.608 bytes do journal. O livro de pagamentos possui
ainda um limite próprio de 190.000 bytes por prestador.
O limite é explícito e não descarta histórico: as revisões antigas permanecem
paginadas, inclusive além da milésima. Esse teto não comprova capacidade ilimitada.

Ainda não há ligação automática destes controles à compra, DTF, fabricação,
despesas/CMV ou conciliação bancária. Essa ligação é o próximo percurso e deve
usar as mesmas identidades e referências, sem duplicar movimento físico ou custo.
O estoque inicial, pagamentos e obrigações da operação real não foram declarados
por esta implementação. M2/M2.2 e aceite financeiro real continuam abertos.
