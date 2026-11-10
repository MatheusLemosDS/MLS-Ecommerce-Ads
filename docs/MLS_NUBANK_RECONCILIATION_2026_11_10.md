# Conciliação com extrato Nubank — 10/11/2026

<!-- NUBANK_CASH_RECONCILIATION_CURRENT -->
**Conciliação com extrato Nubank — `PUBLISHED_VERIFIED`:** versão `2026-11-10.1`, 10/11/2026. Em **MLS Finance → Banco e transferências**, confira extrato Nubank CSV/OFX e transferências Shopee CSV, prepare a prévia sem salvar e importe somente após a confirmação das linhas. Sugestões exigem revisão; confirmar e desfazer vínculos preserva a auditoria. A data do dinheiro fica separada da data dos pedidos e o lucro previsto permanece inalterado. Finance → Auth → App publicados e os três vetores de bytes/versões, configuração, domínios, subdomínios, flags e cron conferidos após cada etapa; verificação final em 10/11/2026 às 14:02:41 Brasília. Head `9b546e8e65278470e62c919d0711d05b2f55a18d`, CI [42857825794](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/42857825794) aprovada com 3.761 testes Node e 67 Python; QA Chromium sintética normal/minificado ×320/1365 ×claro/escuro. A suíte local teve 3.760/3.761 por indisponibilidade CDP antes da navegação; o mesmo arquivo passou isoladamente, sem alterar o teste. Nenhum arquivo Nubank real foi importado nesta entrega; contratos legados, `BANK` em `NOT_COMPARED`, produção e lucro preservados. M2/M2.2 e o confronto operacional Seller Centre/banco continuam abertos. Consultar a [PR #116](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/116) para o estado atual da integração Git.
<!-- END_NUBANK_CASH_RECONCILIATION_CURRENT -->

## Como usar

1. Entre como proprietário e abra **MLS Finance → Banco e transferências**. A busca também oferece esse destino no painel Finance.
2. Escolha o extrato CSV ou OFX do Nubank e use **Conferir este arquivo**. O arquivo original é lido no navegador. Confirme que pertence à única conta Nubank da loja usada no confronto.
3. Confira formato, separador, datas, sinais e colunas. No CSV de transferências Shopee, indique as colunas e a situação concluída exata, quando houver; confirme que as linhas selecionadas são transferências concluídas para a mesma conta. Use arquivos UTF-8 de até 5 MiB.
4. Use **Preparar prévia sem salvar**: apenas as linhas selecionadas e normalizadas são enviadas ao serviço privado para conferir duplicadas, sem gravação. Confira todas as páginas e revise seleção e avisos de duplicidade. Alterar a seleção invalida a prévia anterior. Marque a conferência e use **Importar linhas conferidas** para gravar as linhas normalizadas e seus identificadores de evidência.
5. Consulte os registros pelo mês dos movimentos bancários. Datas próximas, valor igual e referência compartilhada oferecem sugestões para revisão; o sistema não confirma recebimentos automaticamente.
6. Confira um crédito Nubank e uma transferência Shopee, informe o motivo e confirme o vínculo. A seleção manual permite comparar movimentos de páginas ou meses diferentes. Valores divergentes, agrupamentos e origens incertas permanecem em revisão.
7. Para corrigir uma confirmação, use **Desfazer** e informe o motivo. Os movimentos importados e a auditoria são preservados. Em conflito de revisão ou sessão encerrada, releia o estado antes de tentar outra alteração.

## Escopo, privacidade e limites

O recurso confronta evidências declaradas pelo proprietário. Não conecta o banco nem consulta a API da Shopee. Arquivos importados e sugestões não comprovam autenticidade bancária nem recebimento confirmado. CSV de cartão não deve ser usado como extrato da conta. A data do dinheiro pode pertencer a um mês diferente da criação do pedido.

O arquivo original permanece no navegador. A prévia envia as linhas selecionadas e normalizadas ao serviço privado para leitura de duplicidades, sem salvar; a importação explícita persiste registros, identificadores e descrições no Finance. Abrir a tela, ler o workspace ou preparar a prévia não cria tabelas. A estrutura privada só é criada ao importar pela ação do proprietário. Replay e revisão protegem as operações; colisões e linhas ambíguas precisam ser revistas, sem presumir que todo valor repetido seja o mesmo movimento.

Os vínculos não reescrevem repasses, devoluções, produção, custo, lucro previsto, estoque, originais semanais ou dados dos pedidos. Os contratos e cálculos legados permanecem, inclusive o indicador `BANK` em `NOT_COMPARED`; esta conferência não encerra automaticamente o fechamento financeiro legado. Dados ausentes continuam desconhecidos. As seis cartas de agentes, os controles de mês, rascunhos e produção foram preservados. Ads/PROMO e demais escritas comerciais seguem os gates existentes.

Nenhum extrato ou CSV bancário real foi importado nesta entrega. QA sintética e publicação técnica não confirmam autenticidade bancária, recebimento real, aceite operacional ou lucro realizado. M2/M2.2 e o confronto Seller Centre/banco continuam abertos.

## Validação da fonte publicada

O head publicado é `9b546e8e65278470e62c919d0711d05b2f55a18d`, com referência preparada `bdbfd5130ae6771b470b29071862c8179c829821`, sobre a main/PR115 `f451c15ec1b96abaa6315457324ccaa31c8d361c`. A CI [Validar Workers #42857825794](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/42857825794) passou integralmente no runner limpo: **3.761 Node, zero falha, skip ou cancelamento**, além de **67 Python** aprovados. Os três hashes gerados foram conferidos no log de CI.

A execução completa local teve **3.760/3.761**: o único erro foi `Chrome CDP page unavailable`, antes de `Page.navigate`, no arquivo `browser-owner-chrome.test.mjs`. A repetição isolada do mesmo arquivo passou **1/1**, sem alterar sua fonte. Esse resultado local não é apresentado como suíte completa aprovada; a prova integral é a CI acima. O registro privado `local-browser-infrastructure-followup.json` conserva o erro original e o acompanhamento.

A QA Chromium aprovada usa exemplos sintéticos nos oito contextos **normal/minificado ×320/1365 ×claro/escuro**, vinculados aos hashes dos três Workers. Conferiu leitura de arquivo, prévia sem salvar, importação explícita, duplicidade, confirmação/desfazer, replay, conflitos, seis agentes e regressões de produção/mês/rascunhos. O relatório combinado registra os 24 guards verdadeiros, nenhum erro de página, nenhum overflow horizontal e contadores externos zerados; SHA256 `ab7283e02ae978370933691598cec67578a1a78983839ca4e079ff9a8bd0ec49`.

Os testes de orçamento SQL reproduziram a importação de mil linhas em um novo isolamento do Worker. O caminho com estrutura ausente usa **45 instruções D1**; com estrutura existente saudável, **19**, sem repetir DDL. A verificação cobre integralmente os **31 objetos** de esquema e recusa proteções ausentes ou alteradas. Ambos os caminhos ficam abaixo do orçamento conservador de 50 consultas por invocação: a [documentação oficial D1](https://developers.cloudflare.com/d1/platform/limits/) publica **50 no Free e 1.000 no Workers Paid**. Esses números vêm de testes sintéticos e não representam uma importação real na conta.

As fontes geradas continuam abaixo de **4 MiB**, sem aumento desse teto. Os hashes gerados são distintos dos bytes brutos preparados pelo Wrangler e exportados da publicação:

| Worker | SHA256 gerado |
| --- | --- |
| App | `bae9f6f0c816e24954919523868160c3e932935a42b8a1d0037bafa8432df6bb` |
| Auth | `c8e3fd3aecac69320666bc847064bf222bcbde35e9a63cf41fb87a4c02cb1838` |
| Finance | `6070dc2cef50c815692b8cfad97659ff945df8504555d689bee8c6164a9e5be2` |

## Publicação e quatro vetores conferidos

Finance → Auth → App foram publicados nessa ordem. A verificação final terminou em **10/11/2026 às 14:02:41 Brasília** (`2026-11-10T17:02:41.633702+00:00`). O recibo privado `publication-receipt.json` registra os três passos e seus vetores completos; configuração, domínios, subdomínios, flags e cron permaneceram exatos após cada passo. Todas as versões observadas atendiam 100% do tráfego.

| Código | Worker | Versão | SHA256 bruto exportado |
| --- | --- | --- | --- |
| A0 | App anterior | `55d29a3f-f0a8-4481-86a6-bc4cf6715c6c` | `083ea76a0d659579512dc5022f09fdc435d503f1b5f8220e9115ea35f54ac6e7` |
| A1 | App publicado | `6e9e6514-8e0d-4791-bdc3-23ef8709363d` | `fe19885f23d728fcb52ef1d77b76da2a7d4367fbe15d6f9810a352bd7160d0d3` |
| H0 | Auth anterior | `ec385ca9-a986-49ec-abab-25a29daaf33b` | `2a2c2433c6fba25d1c399991595c96e6b8a85045edb77879c8270c446cb45ad2` |
| H1 | Auth publicado | `3b085dec-c506-472c-afae-6863c67cd545` | `9259b304bf139201b93044ad83843ebc8b6c75d4817fefb86609d642ae655357` |
| F0 | Finance anterior | `9ed0bd7d-269a-4e5f-81d0-63be8c6ac2c4` | `e5bf80e14ff00e5b365bfbcfb25bf3a4dc1e42bf40bb0e4259909649eea1d5cd` |
| F1 | Finance publicado | `4b285d05-9326-4885-b02d-c56a4ad99596` | `bf2740e7e6c1879866a20e299e9aefedb5b453ce3ac1ca8c6021537ead10f966` |

| Corte | Horário Brasília | App | Auth | Finance |
| --- | --- | --- | --- | --- |
| Antes da primeira publicação | 14:01:45 | A0 | H0 | F0 |
| Após Finance | 14:02:01 | A0 | H0 | F1 |
| Após Auth | 14:02:19 | A0 | H1 | F1 |
| Após App | 14:02:38 | A1 | H1 | F1 |

O vetor final A1/H1/F1 foi lido novamente às **14:02:41 Brasília**, com os mesmos bytes e versões. O App mantém cron `* * * * *` e as duas flags owner em `ENABLED`; Auth e Finance permanecem sem cron. Finance continua privado, sem workers.dev ou previews. Bindings, bancos e domínios existentes foram preservados.

A publicação não executou consulta D1, endpoint do proprietário, chamada ao provedor, importação bancária real, escrita comercial, retry ou rollback automático. A leitura pública posterior confirmou login HTTP200 com a release `2026-11-10.1`, API owner HTTP401 sem sessão e rota Auth HTTP401 sem chave; isso não equivale a uma sessão autenticada real do proprietário.

## Workers Builds e integração Git

Os três checks externos **Workers Builds** da Cloudflare reportaram falha na PR116. A causa continua desconhecida; o histórico de acesso à API de logs de Builds é **HTTP403/código12004**, e o GitHub mostrou apenas links dos builds, sem a causa. Não classificamos a falha como gate intencional nem presumimos que autodeploy esteja desligado. A CI GitHub aprovada e a publicação controlada via Wrangler são evidências distintas; os bytes e a configuração Live foram conferidos diretamente.

Consultar a [PR #116](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/116) para o estado atual da integração Git. Este registro comprova a publicação técnica; não presume merge nem aceite operacional. A documentação pode avançar com CI própria sem republicar o runtime.
