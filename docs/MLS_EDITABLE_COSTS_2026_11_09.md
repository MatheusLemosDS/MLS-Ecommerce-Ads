# Edição simples dos custos de produção — 09/11/2026

**Edição simples dos custos de produção — `PREPARED_NOT_PUBLISHED`:** versão `2026-11-09.2`, 09/11/2026. Em Custos e regras, edite os valores dos tipos em um formulário visível e use Salvar valores; identificação e tamanhos ficam nas regras avançadas. Produtos oferece acesso direto ao valor do tipo. Alterar um tipo vale para todos os produtos associados, respeitando custos personalizados. A gravação usa a revisão e a auditoria existentes; conflitos e rascunhos não são descartados. A leitura restrita anterior à entrega confirmou Camiseta infantil em R$ 13,50, regra ativa na revisão 8; esse valor já estava salvo, sem nova alteração de configuração por esta entrega. As referências antigas de vendas usam a regra atual nos dados salvos. A tabela de fabricação realizada não estava presente; isso não comprova fabricação zero nem autoriza inventar lotes antigos. Preparada; fonte/head/PR/CI, contagens e hashes/publicação deste candidato continuam sem evidência final. A última Live comprovada permanece `2026-11-09.1`, App `36d5afa6-f53c-4b3a-96aa-69ac8c886fb6`, PR113 integrada em `bd01f64d7e290abb259e9c9dc2646496494a87f0`; vetor/configuração novamente conferidos por GET em 09/11/2026. Fórmulas, DTOs, Auth/Finance, Hermes, seis agentes, mês/rascunhos, fabricação e fechamento semanal preservados; sem novo endpoint, consulta ao provedor, migração ou fato real criado para QA. M2/M2.2 e comparação Seller Centre/banco continuam abertos. [Uso, evidências e limites](#como-usar).

## Como usar

1. Abra **Equipe e mais → Custos e regras** (`/admin?tab=margins#costRules`). O formulário principal mostra os valores dos tipos já cadastrados.
2. Altere o valor desejado, por exemplo Camiseta infantil para `13,50`, e use **Salvar valores**. O valor é completo por unidade comercial conforme a regra; um kit não vira uma peça avulsa.
3. A alteração vale para todos os produtos que usam aquele tipo. Para uma exceção de produto ou variação, use o custo personalizado existente; sua prioridade continua preservada. No produto, **Alterar valor deste tipo** abre o cadastro.
4. Identificação no título, exclusões, tamanhos e associações permanecem nas regras avançadas. Salvar valores modifica somente os preços; não troca essas condições.
5. Se outra sessão mudar a revisão, seus valores digitados permanecem para conferência. Recarregar é uma decisão explícita. Rascunhos avançados também impedem uma gravação rápida que possa substituí-los.
6. Confira o mês ou período desejado nos painéis existentes. Os custos dos pedidos salvos são recalculados com a referência atual, sem consultar novamente a Shopee para essa edição.

## Camiseta infantil e histórico

A leitura somente SELECT de 2026-11-09T22:00:46.378283-03:00 confirmou a regra `camiseta-infantil` ativa, R$ 13,50, revisão 8; custos gerais na revisão 5. Não havia perfil ou atribuição de custo personalizado nessa leitura. O valor solicitado já estava salvo. Por isso esta entrega não grava outra revisão artificial nem troca o seed do sistema para tentar corrigir um estado persistido. A leitura foi restrita aos cadastros e metadados necessários, sem consultar o provedor.

As referências de produção das vendas, inclusive variações antigas identificadas como infantis, acompanham a regra atual quando recalculadas. Quantidades vendidas, datas, repasses e horários da fonte permanecem preservados. Um pedido antigo pode receber a referência atual sem que isso altere o registro original da venda. Uma análise histórica congelada continua documentando os parâmetros usados quando foi produzida.

Fabricação realizada é um controle independente, com data e custo histórico declarados. Na leitura não existia a tabela desse ledger; não havia registros persistidos ali para revisar. Isso não significa que a loja nunca fabricou, nem fornece datas ou quantidades antigas a partir de pedidos. Nenhum lote foi criado e nenhum custo histórico de fabricação foi sobrescrito. Se houver registros reais em outro momento, uma correção retroativa precisa preservar os originais e a auditoria, os vínculos e os cortes de sexta; não deve ser feita por UPDATE indiscriminado.

## Escopo e validação

A interface usa o endpoint e o mutador canônicos existentes, com revisão, comparação do estado anterior e auditoria. Não altera fórmulas, arredondamentos, DTOs legados, preços comerciais, campanhas, estoque, dados externos ou autorização da loja. O formulário simples preserva regras, condições e associações; a recarga explícita e os conflitos protegem rascunhos. Fabricação, conferência semanal, devoluções, Hermes e os seis agentes continuam nos controles existentes.

O pacote reduz apenas cópias de funções sem consumidores no servidor; o núcleo completo do navegador e as APIs de persistência necessárias são preservados e testados. O limite de 4 MiB e a verificação exata dos hashes continuam ativos. Nenhuma publicação comercial ou fato físico/financeiro real é criado para QA.

`PREPARED_NOT_PUBLISHED`: fonte/head/PR/CI, contagens, hashes e publicação deste candidato permanecem null até as evidências finais. A última Live comprovada é `2026-11-09.1`, PR113 integrada em `bd01f64d7e290abb259e9c9dc2646496494a87f0`, com os três Workers novamente conferidos por GET. Preparação e testes isolados não comprovam publicação ou aceite real.

## Continuidade do roadmap

M2 — Finance/Returns confiáveis e M2.2 continuam abertos, com M3 Observer em paralelo. Conferir o efeito dos custos no período correto e comparar o mesmo recorte com Seller Centre/banco. Produção dos itens vendidos não prova fabricação naquela data; custo estimado não confirma pagamento ou lucro realizado. A origem e a composição das peças devolvidas e a decomposição histórica de custos ainda precisam de evidências antes de valorar ou contabilizar reaproveitamento/revenda, sem dupla contagem. Ads/PROMO, preço e estoque externo permanecem nos gates existentes.

Preservar [clareza do resultado diário](MLS_DAILY_RESULT_CLARITY_2026_11_09.md), [conferência da fabricação](MLS_PRODUCTION_COVERAGE_2026_11_06.md), [fechamento semanal](MLS_PRODUCTION_WEEKLY_CLOSE_2026_11_03.md) e [auditoria de devoluções/reaproveitamento](MLS_RETURNS_REUSE_ROADMAP_AUDIT_2026_11_01.md). Seus recibos históricos mantêm os cortes originais.
