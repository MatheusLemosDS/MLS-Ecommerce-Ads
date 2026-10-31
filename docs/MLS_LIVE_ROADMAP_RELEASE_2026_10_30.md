# Melhorias preparadas na Live — 30/10/2026

O proprietário autorizou promover todas as melhorias preparadas para a versão
oficial e manter esse fluxo nos próximos incrementos do roadmap. Esta orientação
substitui as antigas restrições de desenvolvimento/DRAFT/sem deploy dos registros
anteriores. A publicação do software não autoriza gastos, mensagens, convites,
alterações de preços/estoque/comissões ou publicações comerciais.

## Integração e comportamento

Base oficial: `2ab4c9d8baa3c25e5816bcca14b4a0973ea73d5a`, PR85. Fonte preparada:
`4c149a7e818306ddd91419494e75a12b6e14c1f4`, PR84, que reúne a cadeia visual,
Listing Factory e AI Sales. A reconciliação local `b17df54` preserva a correção
dos cancelamentos, a revisão do mês anterior e o Finance da PR85. Não há
substituição da árvore oficial pelo snapshot antigo nem merges duplicados.

Entregas da release:

- Visual das referências fornecidas, navegação dos 15 painéis, temas e telas
  desktop/celular, gráficos editáveis e estados honestos para dados ausentes.
- Busca do catálogo/DTF e Fábrica de Anúncios, com SKUs importados preservados,
  tamanhos/combos/quantidades, imagens originais e exportação/retomada de JSON.
- Análise de produtos e cenário matemático de preço em modo observador.
- Hermes usando a mesma publicação financeira completa da tela durante coleta
  parcial, preservando os horários e os bloqueios das fontes.
- Cinco abas AI Sales: Campanhas, Estúdio, Afiliados, Desempenho e Integrações.
  As ações locais de planejamento, mídia, CRM e ledger não simulam autorização
  de publicação nem precisão bancária.
- Novo salvamento de rascunhos AI Sales no D1, por proprietário, com revisão,
  concorrência segura, limite de um MiB e histórico limitado. Imagens e vídeos
  não são enviados. Uma retomada exige reanexação e nova conferência de mídia;
  aprovações, grants e provas de arquivo não sobrevivem ao armazenamento.

## Ativação e retorno à versão anterior

Os recursos continuam exclusivos do proprietário. A release usa as flags
independentes `MLS_V36_OWNER_PREVIEW=ENABLED` e
`MLS_AI_SALES_OWNER_PREVIEW=ENABLED`, adicionadas ao deploy por opções do Wrangler
com `keep_vars=true`. Nenhum segredo ou binding existente deve ser substituído.
O App é o único Worker cujo runtime muda nesta integração; Auth e Finance
precisam conservar os hashes da base PR85.

Antes da publicação, exigir suíte integral, testes do Worker normal/minificado,
Chromium desktop/mobile, mídia real de teste, configuração e manifesto exato de
pré-release. O manifesto lista literalmente os arquivos revisados e os hashes;
não aceita wildcard, alteração de Worker protegido ou aprovação inferida da CI.

Backup privado e manifesto de rollback foram guardados fora dos arquivos
versionados. Versão oficial anterior do App:
`db3fb95f-6a8c-4f44-93d7-2b41f5e00d35`. Em caso de regressão, desativar as flags
ou voltar a essa versão do App. As tabelas de rascunho são aditivas; o rollback
não as apaga nem requer migração de Finance/Auth ou credenciais.

## Limites operacionais

O estúdio exporta um plano executável pelo CLI Node/FFmpeg, gera MP4 real
1080×1920 com voz offline PT-BR e permite importar o manifesto e reanexar o vídeo
para revisão. FFmpeg não roda dentro do Worker Cloudflare. Render em nuvem,
LLM e voz neural exigem um executor/provedor e orçamento configurados; o fluxo
atual informa `LOCAL_TEMPLATE`, sem chamada paga.

Catálogo interno salvo e grants de Affiliate/Creator/Posting são capacidades
distintas. SKU, preço e estoque ausentes no contrato atual permanecem
desconhecidos. A conciliação M2 ainda depende do Seller Centre e dos comprovantes
reais; esta release não fecha M2 nem declara lucro bancário. O restante do
roadmap avança por incrementos verificáveis, registrando bloqueios externos.

## Registro da validação

Em execução na branch `release/live-roadmap-improvements-20261030`. A regressão
direcionada de cancelamentos passou novamente em 73 testes após a reconciliação.
Os resultados finais de persistência, UI, mídia, CI e publicação serão registrados
no fechamento da release. Merge, flags e versão ativa devem ser verificados
separadamente; uma compilação não comprova publicação.
