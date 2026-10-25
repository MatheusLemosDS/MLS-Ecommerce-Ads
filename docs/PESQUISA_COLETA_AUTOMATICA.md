# Pesquisa da coleta automática

Consulta realizada em 25/10/2026. Esta pesquisa compara o código local com documentação da Cloudflare e projetos públicos. As referências de SDK Shopee são secundárias e não substituem o contrato oficial da API nem confirmam permissões da aplicação.

## Evidências no sistema

- O navegador permite até 90 segundos para um POST. Esse tempo inclui toda a rota: banco, coleta privada, validação, agregação, descoberta de produtos e histórico.
- A chamada privada do App tem prazo de 45 segundos. O Auth agora dá 35 segundos especificamente a `/internal/shopee/finance/business-period`, incluindo leitura da requisição, chamada ao serviço e leitura da resposta. As demais operações privadas preservam 45 segundos. O coletor Finance tem orçamento de 20 segundos por etapa, com margem para persistir o progresso.
- Abortar o cliente não comprova que uma escrita do serviço foi cancelada. Os leases e controles de revisão precisam impedir avanço concorrente; não se deve liberar um lease enquanto uma tarefa abandonada ainda pode escrever.
- Antes da correção, `BUSINESS_PERIOD_CONFLICT` indicava outro coletor trabalhando, mas era convertido em `SOURCE_UNAVAILABLE`. A interface então interrompia a coleta. A atualização distingue espera por concorrência, checkpoint, indisponibilidade temporária e bloqueio que exige correção.
- O proprietário pode observar o estado salvo com `GET /api/admin/finance/business-month?month=YYYY-MM`, sem repetir chamadas à Shopee ou ao Ads. A operação pode preparar estruturas locais e atualizar descoberta/histórico, mas não publica alterações comerciais.
- Leituras válidas parciais continuam sendo parciais. Cancelamentos, pagamentos ausentes, custos incompletos, devoluções e dados antigos não podem produzir um lucro confirmado.

O crescimento dos valores parciais nas imagens confirma que chegaram dados entre consultas. Ele não identifica qual requisição posterior falhou. Sem o evento correspondente nos logs de produção, demora do D1, limite de CPU e falha de rede permanecem hipóteses distintas.

## Referências oficiais da Cloudflare

| Referência | Fato documentado | Aplicação no sistema |
| --- | --- | --- |
| [D1: concorrência e throughput](https://developers.cloudflare.com/d1/reference/faq/#limits) | Cada banco processa consultas uma por vez. Requisições concorrentes são enfileiradas; uma fila cheia pode gerar `overloaded`. | Reduzir chamadas repetidas e evitar vários coletores disputando o mesmo trabalho. Acrescentar concorrência não aumenta sozinho a capacidade de escrita do banco. |
| [D1: limites](https://developers.cloudflare.com/d1/platform/limits/) | O limite de duração de 30 segundos também se aplica ao batch inteiro. | O prazo de 45 segundos do fetch não limita consultas anteriores ou posteriores. Várias etapas sequenciais podem exceder o prazo total do navegador. |
| [D1: batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch) | Os comandos de um batch executam sequencialmente como transação; uma falha desfaz a sequência. | Persistir cursor, dados e revisão de maneira coerente. Agrupar consultas reduz viagens ao banco. |
| [Workers: limites](https://developers.cloudflare.com/workers/platform/limits/#cpu-time) | CPU não inclui espera de rede ou banco. Workers Free tem 10 ms de CPU por requisição; Paid tem limite configurável, com padrão de 30 segundos para HTTP. Estouro de CPU pode retornar erro 1102. | O plano da conta não foi confirmado nesta pesquisa. Não foi alterado `limits.cpu_ms` nem presumida disponibilidade do plano Paid. Verificar CPU e wall time nos logs antes de atribuir a falha a esse limite. |
| [Workers: conexões simultâneas](https://developers.cloudflare.com/workers/platform/limits/#simultaneous-open-connections) | Há limite de seis conexões aguardando cabeçalhos por invocação; service bindings compartilham o limite da requisição principal. | Manter um pequeno conjunto de consultas em paralelo, com corpos consumidos ou cancelados e prazo para cada etapa. |
| [Workers: waitUntil](https://developers.cloudflare.com/workers/runtime-apis/context/#waituntil) | Em HTTP, trabalho pode continuar por até 30 segundos após resposta ou desconexão. Promessas sem `await` ou `waitUntil` podem ser canceladas. | Não converter a coleta inteira em uma promessa solta ou supor que `waitUntil` seja uma fila durável. |
| [Workflows: regras](https://developers.cloudflare.com/workflows/build/rules-of-workflows/) | Etapas devem ser pequenas, persistir o estado necessário e permitir repetição idempotente. | Gravar progresso após cada unidade concluída e repetir somente o trecho que falhou. |
| [Workflows: repetição](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/) | Retries podem ter limite, intervalo, backoff e timeout por tentativa. | Separar erros transitórios de autorização, permissão e contrato inválido. |
| [Queues: confirmação e retries](https://developers.cloudflare.com/queues/configuration/batching-retries/) | Mensagens podem ser confirmadas individualmente; falhas podem ser repetidas com atraso e limite. | Um pedido que falhou não deve obrigar a repetir todos os pagamentos já validados da página. |
| [Queues: concorrência](https://developers.cloudflare.com/queues/configuration/consumer-concurrency/) | A concorrência pode ser limitada para proteger um serviço externo com capacidade restrita. | Priorizar progresso confiável e respeitar sinais de limitação da fonte. |

O repositório da documentação, [cloudflare/cloudflare-docs](https://github.com/cloudflare/cloudflare-docs), informa licença CC-BY-4.0. As fontes acima foram consultadas para decisões de arquitetura, sem copiar sua implementação.

## Projetos oficiais consultados no GitHub

| Projeto e licença verificada | Padrões observados |
| --- | --- |
| [cloudflare/workflows-starter](https://github.com/cloudflare/workflows-starter), [Apache-2.0](https://github.com/cloudflare/workflows-starter/blob/main/LICENSE) | [src/index.ts](https://github.com/cloudflare/workflows-starter/blob/main/src/index.ts) mostra etapas persistidas com `step.do`, retry limitado, backoff exponencial e consulta de status separada da criação da execução. |
| [cloudflare/queues-web-crawler](https://github.com/cloudflare/queues-web-crawler), [Apache-2.0](https://github.com/cloudflare/queues-web-crawler/blob/master/LICENSE) | [consumer/src/index.ts](https://github.com/cloudflare/queues-web-crawler/blob/master/consumer/src/index.ts) confirma cada mensagem concluída e repete somente a mensagem que falha. O conteúdo de `LICENSE` confirma Apache-2.0, embora o campo resumido da API GitHub retorne `NOASSERTION`. |

Não foi copiado código desses projetos nem adicionada dependência. O coletor atual já dispõe de cron, cursor persistido, revisões e leases em D1. Essas estruturas permitem aplicar os padrões essenciais agora. Uma migração posterior para Queues ou Workflows pode tornar o agendamento mais independente do navegador, mas requer configuração e avaliação próprias.

## SDKs Shopee: referências secundárias

Estas referências foram levantadas na auditoria de publicação e conferidas em revisões fixas. Servem para comparar tratamento de falhas, não para autorizar novos endpoints ou reproduzir códigos de erro sem validação oficial.

| Projeto e licença | Evidência consultada |
| --- | --- |
| [congminh1254/shopee-sdk](https://github.com/congminh1254/shopee-sdk/tree/196aedb4bec5fd7c9e99158a448a222f184a42ab), MIT | [Boas práticas de pagamento](https://github.com/congminh1254/shopee-sdk/blob/196aedb4bec5fd7c9e99158a448a222f184a42ab/docs/managers/payment.md#L747) distingue pagamento ainda não encontrado de outras falhas e recomenda cache. O [schema de escrow](https://github.com/congminh1254/shopee-sdk/blob/196aedb4bec5fd7c9e99158a448a222f184a42ab/schemas/v2.payment.get_escrow_detail.json#L184) lista situações distintas de permissão e restrição da aplicação. |
| [EcomPHP/shopee-php](https://github.com/EcomPHP/shopee-php/tree/c6210a7b79b10c842bf90f153f86c1877578757b), Apache-2.0 | [Client.php](https://github.com/EcomPHP/shopee-php/blob/c6210a7b79b10c842bf90f153f86c1877578757b/src/Client.php#L242) decodifica o erro da API e separa exceções de autorização de erros gerais. Essa separação apoia preservar a sessão diante de timeout ou rate limit; a lista literal do SDK não é adotada como contrato oficial. |

Não foi copiado código dos SDKs. Nenhum número de pedidos por página, quota, janela de atribuição ou permissão Shopee foi assumido como verdadeiro apenas por aparecer em um projeto comunitário.

## Prioridades resultantes

1. Concluir unidades pequenas, persistir progresso validado e retomar sem duplicar valores.
2. Usar prazos hierárquicos: Finance 20 s, Auth 35 s, App 45 s e POST do navegador 90 s. O prazo externo inclui trabalho adicional e não substitui orçamento das etapas.
3. Após timeout ou desconexão do navegador, observar primeiro o estado salvo por GET. Não repetir imediatamente uma mutação cujo resultado ainda é desconhecido.
4. Tratar conflito de lease e checkpoint como espera normal. Aplicar atraso limitado em falhas temporárias; exigir intervenção somente quando houver evidência de autorização, permissão ou dado inválido.
5. Reutilizar pagamentos validados dentro da mesma execução, sem tornar uma falha temporária equivalente a pagamento zero ou remover a obrigação de verificar cancelamentos em uma coleta nova.
6. Preservar diagnósticos finitos de etapa, código e HTTP, sem registrar tokens, assinaturas, dados de clientes, corpos brutos ou URLs autenticadas.

Os testes usam fontes simuladas e SQLite compatível com a interface D1. Comprovam comportamento local e contratos; a estabilidade da conta real deve ser verificada no progresso e nos eventos de produção após o deploy.
