# Operação simples e produção por período — 02/11/2026

**Estado: `PUBLISHED_VERIFIED_INTEGRATION_PENDING`.** Publicação dos três
Workers conferida em **02/11/2026 às 19:06:16 Brasília** (`2026-11-02T22:06:16+00:00`).
Versão **2026-11-02.3 — Operação simples e produção por período**.
PR [#104](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/104), branch
`feature/simplified-returns-production-layout-20261102`, base
`911870590fe812202287f549240d5274119d1cad`. Fonte `c7a7b35677fc30a408644225978aecd90d5fe826`,
head aprovado `94d62aa047263fbf478faf79aa87542a3ebb5037`, CI [41532391229](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41532391229)
aprovada: 3346 Node e 67 Python. Publicação Finance → Auth → App,
bytes e configurações conferidos após cada etapa. A integração Git ainda
requer recibo próprio; publicação e CI não comprovam merge em main.
A PR103 foi arquivada como a versão Live anterior.
[Recibo anterior](MLS_ORIGINAL_RETURN_ITEMS_2026_11_02.md).

## Pedido e resultado entregue

O proprietário pediu dados automáticos nas devoluções, custo das peças realmente
fabricadas entre datas escolhidas e uma navegação mais simples. Confirmou que
o período deve considerar a **data da fabricação**, não a criação do pedido.
A entrega reutiliza os registros existentes e concentra a operação em três
fluxos; não cria outra coleta financeira ou recomeça o catálogo.

| Fluxo | Caminho publicado | O que muda |
| --- | --- | --- |
| Conferir uma devolução | `/admin?tab=agent-returns#physicalReturnsQueue` | Fila com produto, variação, quantidades comerciais e dados atuais salvos; confirmação de recebimento correto ou com problema. |
| Consultar fabricação por datas | `/admin?tab=agent-production#incurredProductionDetails` | Data inicial/final, semana/mês e resumo diário dos registros de fabricação. |
| Consultar o resultado financeiro | `/admin?tab=agent-finance#businessMonthNetCard` | Acesso principal visível, preservando o resultado mensal e seus limites existentes. |
| Ver a entrega e seus acessos | `/admin?tab=roadmap#appReleaseNotes` | Notas específicas da versão e caminhos dos controles. |

Os caminhos acima estão publicados. A conferência técnica dos Workers não
substitui a conferência de um caso físico ou de fabricação real pelo proprietário.

## Devoluções: preparar os dados, confirmar o fato físico

A fila usa os itens de origem preservados na PR103 e o catálogo/custos já
salvos para sugerir nome, tamanho, cor, composição e referência de custo atual.
Cada informação conserva sua origem; referência atual não é custo histórico
comprovado da peça que voltou. Dados ausentes ou incompatíveis ficam pendentes.
Unidade comercial não se torna peça física por inferência, e kit incompleto
ou sem composição confiável não libera confirmação automática.

Quando a origem e a composição permitem, **Recebi corretamente** registra a
declaração do proprietário sobre identidade, quantidade e bom estado. A opção
**Recebi com problema** exige quantidade física recebida, condição e motivo;
informação insuficiente conduz à conferência detalhada. Recebimentos existentes
continuam acessíveis no histórico e não recebem uma segunda entrada pela fila.

O envio é uma mutação interna atômica: confere revisão e proposta atuais,
preserva auditoria e usa a mesma identidade da tentativa ao repetir um envio
incerto. Mudança de fonte ou proposta exige nova conferência; não ocorre ajuste
silencioso das quantidades. A leitura da fila não confirma o recebimento.

A imagem tem dois usos distintos:

- **Foto atual do produto:** miniatura HTTPS fornecida pelo catálogo nas
  consultas já existentes. Não é o PNG da estampa nem prova do produto enviado.
- **Estampa local:** arquivo PNG previamente salvo e verificado neste
  dispositivo, quando há correspondência confiável. Não há novo upload,
  recuperação automática de arquivo ausente ou confirmação apenas pelo nome.

## Fotos salvas e atualização limitada

Finance e Auth negociam a extensão opt-in `catalog-media-v1`; o envelope
`variant_catalog_media_v1` mantém o catálogo legado separado. A captura usa
os mesmos retornos de informações básicas e variações: nenhum novo endpoint
ou request ao provedor é acrescentado a uma consulta de catálogo.

O App salva a observação de mídia separadamente e só a apresenta quando hash,
fingerprint e data correspondem ao catálogo atual. Ausência, URL inválida ou
observação antiga não mantêm uma foto anterior silenciosamente. A leitura owner
é somente leitura, inclusive quando a tabela opcional ainda não existe.
Falha no armazenamento opcional preserva a atualização do catálogo principal;
não repete a consulta ao provedor.

Para catálogos antigos sem foto, a oportunidade programada **CATALOG** pode
antecipar até três trabalhos existentes, uma vez por produto/fingerprint, com
marcador durável. Backoff, lease ativo, mudança de metadados e falhas continuam
respeitados. Qualquer observação válida da mídia conta como tentativa, mesmo
sem imagem. Não há fila disparada por GET, novo coletor, reinício ou loop de
tentativas antecipadas. A renovação normal do catálogo continua independente.

## Produção: custo registrado na fabricação

O ledger de fabricação sai de **Custos e regras** e passa a **Produção**.
Escolher de 15 a 25 inclui os dois dias em Brasília. O filtro admite até
366 dias, exige datas válidas e não aceita uma data posterior à leitura salva.
Aplicar o período reutiliza o ledger carregado, sem consultar pedidos ou
alterar os registros. Os atalhos de semana/mês e o resumo diário usam a mesma
data de fabricação.

O total usa a quantidade física registrada e a fotografia imutável do custo
daquele lançamento. Repreço posterior do catálogo não reescreve o passado;
correção mantém a anulação/substituição auditada existente. Custo ausente
continua pendente, com subtotal conhecido separado. **Sem registros não
significa gasto zero**, especialmente em uma conta que ainda não começou a
declarar fabricação. Cancelar o pedido não apaga a produção já registrada.

Fabricação registrada não comprova pagamento ao fornecedor ou saída bancária.
Este resumo continua separado da referência de custo das vendas e do lucro;
não soma o mesmo custo novamente ao resultado financeiro.

## Navegação e apresentação

A navegação owner principal organiza sete destinos: **Visão geral, Produção,
Devoluções, Financeiro, Produtos, Anúncios e Hermes**. No celular, cinco ações
operacionais permanecem diretas; o menu dá acesso às demais áreas, incluindo
Anúncios e Hermes. Configurações, equipe, campanhas e histórico continuam
disponíveis em **Equipe e mais/Menu**.

O hub da equipe passa a representar os sete agentes existentes, incluindo
Finance e Returns, sem repetir a Visão geral como um agente. Os cartões e
gráficos compactos informam fonte, escopo e qualidade dos dados. Não desenham
uma série ausente nem transformam desconhecido em zero. Notas, busca, voltar/
avançar e atalhos antigos permanecem compatíveis. Em particular,
`/admin?tab=margins#incurredProductionDetails` resolve para Produção; a página
de custos conserva suas referências e regras.

## Validação e publicação

| Evidência | Estado neste corte |
| --- | --- |
| Contratos de mídia, transporte e catálogo legado | 100 testes focados aprovados localmente, sem falhas ou skips; dados sintéticos. |
| Orçamento de mídia a frio | Helper limitado + três trabalhos de catálogo: 23 RPCs D1 e três leituras privadas existentes, total de 26 RPCs; 71 instruções SQL em lotes, contadas separadamente. |
| Suite completa, QA integrada e CI | CI [41532391229](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41532391229) aprovada no head `94d62aa047263fbf478faf79aa87542a3ebb5037`: 3346 Node e 67 Python; QA sintética normal/minificada em 320/1365, sem erros de página ou overflow. |
| Publicação Finance → Auth → App | Concluída e conferida em 02/11/2026 às 19:06:16 Brasília; três UUIDs novos, bytes/configuração/domínios/flags/cron preservados. |
| Captura natural de fotos e uso físico real | Ainda não comprovados neste incremento. QA sintética não confirma um recebimento ou uma fabricação da conta. |

O proprietário já autorizou incrementos validados na versão oficial. O recibo
comprova esta publicação técnica, sem repetir aquela autorização. A integração
Git permanece pendente de evidência própria; CI, publicação e merge são
registros distintos. Não inserir SQL bruto, pedidos privados, dados pessoais ou
montantes da conta em documentação e fixtures.

## Recibo técnico dos três Workers

| Worker | UUID publicado | SHA-256 gerado | SHA-256 publicado |
| --- | --- | --- | --- |
| Finance | `7001376b-f065-4e37-84ea-ee9ac2ea890c` | `d7e64105b88602fa20f8e733f5e16548cfa3ceefbbd7733a87dfb5e5bd8fcd49` | `ea8a5abf0c818539ee02e0e14260b973d0d2ed243f2c0eb26162ae3bbb3fcb59` |
| Auth | `d6f4397f-ac4d-45cf-93da-175df8305a6d` | `851e27c703fda4143b87a8a85a79c06326b9a2f25ce16f5625d8871a589f43ec` | `5e18583606c453bd4e5ecfbc983db13826e4ad7f1c336fde5b7bbe9d628b2bd6` |
| App | `4a556c39-bd1b-4962-84a6-b25bf5504e95` | `50baef80d8c15e4fce11a68b7c90a52a5678c4ad398034607a6e1cabf4f5fe92` | `c37f8c70023f03c2bcb3a609807b9477a8ce32c7c6ee1b10358eedcee798fb24` |

O publisher não consultou endpoints owner ou provedor, executou zero consultas
D1 e não gravou fatos físicos/financeiros. As mutações da QA ocorreram somente
em dados falsos locais. A integração Git da PR104 está **pendente** neste corte.

A sequência pausou antes do App em uma consulta de leitura ao GitHub. Os
recibos de Finance e Auth foram preservados; código, CI, fontes e o vetor
intermediário completo foram conferidos novamente. A continuação explícita
publicou somente o App, uma vez, e conferiu os três Workers ao terminar.
Não houve repetição da publicação de Finance/Auth ou rollback automático.

## Primeira observação dos dados salvos

Leitura somente com `SELECT`, em **02/11/2026 às 19:06:36 Brasília**, vinte
segundos após o recibo: 49 trabalhos de catálogo, três elegíveis, nenhum com
falha ou lease ativo; 10 dos 19 casos legados tinham itens originais capturados
e nove continuavam sem captura. As tabelas opcionais de fotos e prioridade
ainda não existiam, portanto a captura natural de fotos não estava comprovada
nesse corte. Nenhuma coleta, fila ou execução do cron foi forçada para o teste.

O controle físico mantinha um caso e uma auditoria, sem nova auditoria depois
da publicação. As tabelas de fabricação ainda estavam ausentes: o gasto real
do período permanece desconhecido, sem presumir zero ou criar lançamentos a
partir dos pedidos. Arquivos de estampa do navegador não são observáveis por
essa consulta no servidor. Essas observações não comprovam aceite operacional
ou encerramento de M2/M2.2.

## Continuidade, limites e rollback

Depois da publicação, conferir um caso real na fila, a imagem efetivamente
disponível e um registro real de fabricação por datas escolhidas. O sistema
não deve inventar fatos físicos para demonstrar os controles. A captura
natural existente deve ser observada; não reiniciar OAuth/coleta ou criar
requisições comerciais para preencher ausências.

Preservar os dados aditivos de mídia, recibos, fabricação, vínculos e auditoria
durante rollback. Leitores legados podem ignorar a mídia e continuar com o
catálogo anterior. Recibos confirmados são fatos internos persistidos; não os
apagar para adaptar um código antigo. Os guards físicos já publicados continuam
válidos; recuperar com código compatível e correção explícita.

**M2/M2.2 continuam abertas.** Ainda faltam o aceite operacional, a conferência
da composição física, a decomposição histórica de peça/estampa versus
embalagem/etiqueta, custos incrementais, valoração/reservas/revenda e a ponte
contábil sem dupla contagem. Seller Centre e banco exigem confronto no mesmo
recorte. A entrega não confirma caixa, lucro realizado ou estoque externo;
Ads/PROMO e escritas comerciais mantêm os gates existentes.
