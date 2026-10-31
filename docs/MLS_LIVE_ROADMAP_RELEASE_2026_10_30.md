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

PR [#86](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/86), branch
`release/live-roadmap-improvements-20261030`, código `1c4cd20` e ajuste de teste
`20182f422c6a1cc6b09c1bbba8924d139aa81618`.

- **2.382 Node, zero falhas/skip e 67 Python**, localmente e na
  [CI 41157082180](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/41157082180).
- Chromium autenticado com dados sintéticos em 1365×900 e 390×844: fluxo real
  HTTP→Worker→SQLite, salvar/recarregar, mídia local e conflito entre sessões.
  Não foi executada sessão privada real do proprietário.
- Três MP4s sintéticos reais, 1080×1920/H264/AAC, com hashes e decodificação
  completos. Nova aprovação continua necessária para mídia real da loja.
- 73 regressões de cancelamentos preservadas; Worker normal e minificado
  testados. Auth e Finance não sofreram alteração nesta release.
- Pré-release aprovado com **228 paths literais** e os hashes finais exatos.

A primeira CI teve 2.375 sucessos e uma falha de inicialização do Chrome no
prazo fixo de seis segundos. A espera passou a usar um prazo monotônico de vinte
segundos, validando porta e encerramento do processo. Seis casos adicionais e
os fluxos reais passaram; não houve restart, skip ou remoção de asserts. O ajuste
não alterou o App.

## Publicação oficial conferida

App publicado em 30/10/2026 Brasília (31/10 01:52 UTC), versão
`2ffcefb4-3103-4cd0-880c-569a61a4df69`, 100% ativa, com as duas flags exatamente
`ENABLED`. O download via API confirmou o bundle Wrangler byte a byte:
`2818ba24736777ebfd15cd3baee0e6969d8908e02cf1a29e1de59f3d18dfa8af`.
O App gerado antes do Wrangler é
`eea2f01c997b9e8012160862929abab8407a81dda44215c5aea8b2b9ef3a2ef6`.

Auth conserva `1fef431c8573e05563c7938d95be0976a160bc603340084aa747ee0b73e7ec64`
e Finance `bfc27e1022e0c5b3d335498389fd64b6978b8f7f04501d3bc6eff38202bf5feb`
nos builds locais; seus scripts e versões publicados continuam iguais à PR85.
Bindings, valores existentes, domínios, cron e compatibilidade foram preservados;
as únicas adições de configuração foram as duas flags autorizadas.

As duas tabelas de rascunho já existem, inicialmente vazias, sem inserir dados
de demonstração na Live. SELECTs confirmaram coleta habilitada, estado completo,
zero falhas, Finance conectado, heartbeat e política do Hermes preservados.
Pendências financeiras reais continuam visíveis e não viraram lucro definitivo.
Sondagens deste cliente permanecem bloqueadas pelo Cloudflare1010; não houve
bypass nem alegação de login real. A confirmação remota foi pela API e D1.

As entregas seguintes usam o mesmo fluxo: escopo revisado sobre a main atual,
testes, manifesto exato, backup, publicação oficial e conferência posterior.
Ambiente separado somente quando necessário. M2 e os contratos externos acima
continuam abertos; esta entrega promove as melhorias preparadas, sem encerrar
todo o roadmap comercial.
