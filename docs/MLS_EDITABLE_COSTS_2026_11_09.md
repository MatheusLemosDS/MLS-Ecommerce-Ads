# Edição simples dos custos de produção — 09/11/2026

**Edição simples dos custos de produção — `PUBLISHED_VERIFIED`:** versão `2026-11-09.2`, 09/11/2026. Em Custos e regras, edite os valores dos tipos em um formulário visível e use Salvar valores; identificação e tamanhos ficam nas regras avançadas. Produtos oferece acesso direto ao valor do tipo. Alterar um tipo vale para todos os produtos associados, respeitando custos personalizados. A gravação usa a revisão e a auditoria existentes; conflitos e rascunhos não são descartados. A leitura restrita anterior à entrega confirmou Camiseta infantil em R$ 13,50, regra ativa na revisão 8; esse valor já estava salvo, sem nova alteração de configuração por esta entrega. As referências antigas de vendas usam a regra atual nos dados salvos. A tabela de fabricação realizada não estava presente; isso não comprova fabricação zero nem autoriza inventar lotes antigos. App publicado e vetor dos três Workers conferido em 2026-11-09T22:32:44-03:00. Fonte `2f11437b15ae656fecf38c9838c240fb3169ea28`, head `c61a9caf5316285d946ba3d1b35bc556623c1086`, CI [42734971744](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/42734971744) aprovada: 3630 Node e 67 Python; Chromium sintético normal/minificado, 320/1365 e claro/escuro. O recibo registra a publicação; consultar a [PR #114](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/114) para a integração atual. Fórmulas, DTOs, Auth/Finance, Hermes, seis agentes, mês/rascunhos, fabricação e fechamento semanal preservados; sem novo endpoint, consulta ao provedor, migração ou fato real criado para QA. M2/M2.2 e comparação Seller Centre/banco continuam abertos. [Uso, evidências e limites](#como-usar).

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

Publicação do App conferida em 2026-11-09T22:32:44-03:00. Fonte `2f11437b15ae656fecf38c9838c240fb3169ea28`, head `c61a9caf5316285d946ba3d1b35bc556623c1086`; CI [42734971744](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/42734971744) aprovada com 3630 Node e 67 Python, sem falhas/skips/cancelamentos. Oito resultados Chromium sintéticos normal/minificado ×320/1365 ×claro/escuro vinculados aos hashes dos três Workers. Auth/Finance, configuração, domínios, subdomínios, flags e cron conferidos. O recibo prova a publicação naquele corte; consultar a PR para a integração atual: https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/114. Aceite operacional real não foi presumido.

```json
{
  "versions": {
    "app": "876fcc9e-1826-4e31-aee6-6be2b44c8dbc",
    "auth": "ec385ca9-a986-49ec-abab-25a29daaf33b",
    "finance": "9ed0bd7d-269a-4e5f-81d0-63be8c6ac2c4"
  },
  "generated_sha256": {
    "app": "1ddfffce64190ef09c085946605a8ed19cc5149bd52a91e42b67c40804007750",
    "auth": "47c83f87f191fd0e5ff503d9c4bcf4671cd986b0965e66e84f1a6ed952dac925",
    "finance": "08ada5ecec92350f4f8301fdb7baa00f5f8083a0e8390296b2870e0ff3cdc1a5"
  },
  "published_sha256": {
    "app": "37d3967b0f33652b009ab7a1e5a1d70cbdb96e94991ecb47435295183963c2fc",
    "auth": "2a2c2433c6fba25d1c399991595c96e6b8a85045edb77879c8270c446cb45ad2",
    "finance": "e5bf80e14ff00e5b365bfbcfb25bf3a4dc1e42bf40bb0e4259909649eea1d5cd"
  }
}
```

## Continuidade do roadmap

M2 — Finance/Returns confiáveis e M2.2 continuam abertos, com M3 Observer em paralelo. Conferir o efeito dos custos no período correto e comparar o mesmo recorte com Seller Centre/banco. Produção dos itens vendidos não prova fabricação naquela data; custo estimado não confirma pagamento ou lucro realizado. A origem e a composição das peças devolvidas e a decomposição histórica de custos ainda precisam de evidências antes de valorar ou contabilizar reaproveitamento/revenda, sem dupla contagem. Ads/PROMO, preço e estoque externo permanecem nos gates existentes.

Preservar [clareza do resultado diário](MLS_DAILY_RESULT_CLARITY_2026_11_09.md), [conferência da fabricação](MLS_PRODUCTION_COVERAGE_2026_11_06.md), [fechamento semanal](MLS_PRODUCTION_WEEKLY_CLOSE_2026_11_03.md) e [auditoria de devoluções/reaproveitamento](MLS_RETURNS_REUSE_ROADMAP_AUDIT_2026_11_01.md). Seus recibos históricos mantêm os cortes originais.
