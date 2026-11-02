# Operação simples e produção por período — 02/11/2026

**Estado: `PREPARED_NOT_PUBLISHED`.** Versão proposta
**2026-11-02.3 — Operação simples e produção por período**.
Branch `feature/simplified-returns-production-layout-20261102`, base oficial
`911870590fe812202287f549240d5274119d1cad` (main após PR103).
Este registro descreve o candidato local; não é recibo de publicação.
A última Live comprovada continua sendo a PR103, versão `2026-11-02.2`,
com Finance `5e3b4686-1011-4e24-a890-fa33050b8490`, Auth
`e13c43ad-b096-411b-8ae7-92e24ff44991` e App
`0a2955bc-e420-42a1-8c53-97f6fef04358`.
[Recibo anterior](MLS_ORIGINAL_RETURN_ITEMS_2026_11_02.md).

## Pedido e resultado preparado

O proprietário pediu dados automáticos nas devoluções, custo das peças realmente
fabricadas entre datas escolhidas e uma navegação mais simples. Confirmou que
o período deve considerar a **data da fabricação**, não a criação do pedido.
O candidato reutiliza os registros existentes e concentra a operação em três
fluxos; não cria outra coleta financeira ou recomeça o catálogo.

| Fluxo | Caminho após a publicação | O que muda |
| --- | --- | --- |
| Conferir uma devolução | `/admin?tab=agent-returns#physicalReturnsQueue` | Fila com produto, variação, quantidades comerciais e dados atuais salvos; confirmação de recebimento correto ou com problema. |
| Consultar fabricação por datas | `/admin?tab=agent-production#incurredProductionDetails` | Data inicial/final, semana/mês e resumo diário dos registros de fabricação. |
| Consultar o resultado financeiro | `/admin?tab=agent-finance#businessMonthNetCard` | Acesso principal visível, preservando o resultado mensal e seus limites existentes. |
| Ver a entrega e seus acessos | `/admin?tab=roadmap#appReleaseNotes` | Notas específicas da versão e caminhos dos controles. |

Os endereços descrevem o candidato. Até o recibo deste incremento, a Live pode
exibir os caminhos e o comportamento da versão anterior.

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
| Suite completa, QA integrada e CI do candidato | Em consolidação pelo responsável pela entrega; não substituir por contagem de outra release. |
| Publicação Finance → Auth → App | Pendente de recibo com fonte/CI, UUIDs e conferência de bytes/configuração após cada etapa. |
| Captura natural de fotos e uso físico real | Ainda não comprovados neste incremento. QA sintética não confirma um recebimento ou uma fabricação da conta. |

O proprietário já autorizou incrementos validados na versão oficial. Esta
marcação de preparação não pede novamente a autorização existente; impede
confundir código preparado com versão publicada. Só atualizar o estado para
Live após receber a evidência efetiva. Git/merge, CI e publicação são registros
distintos. Não inserir SQL bruto, pedidos privados, dados pessoais ou montantes
da conta em documentação e fixtures.

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
