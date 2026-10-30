# Homologação navegável do MLS Commerce OS

30/10/2026. [PR DRAFT #84](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/84), baseada na PR #83, sem merge ou deploy. [CI do HEAD](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/84/checks). O proprietário informou que ainda não existe URL de homologação. O ambiente atual não está autenticado na Cloudflare. Foram preparados testes locais e uma demonstração que pode ser aberta sem acessar a loja.

## Escolha a forma de testar

| Forma | O que executa | Limites |
|---|---|---|
| HTML autossuficiente | Interface compilada, navegação, catálogo de exemplo, formulários locais do AI Sales, importação/exportação e vídeos reais incorporados | Backend em snapshot somente leitura; salvar custos e financeiro exige o servidor. Nenhuma conexão com a loja. |
| Servidor local | Worker App real da PR #83, autenticação e CSRF reais, banco SQLite local, custos/catálogo/variantes e planejamento | Apenas `127.0.0.1`. Dados fictícios; sem serviços, segredos ou banco da produção. Tráfego externo negado. |
| Homologação online com dados da loja | Ainda não provisionada | Depende de acesso seguro à Cloudflare e definição dos dados/bindings isolados. Não compartilhar senha, cookies ou tokens no chat. |

A indicação de demonstração aparece em todas as páginas da prévia, inclusive após entrar. Os exemplos são três produtos próprios: adulto com cores e tamanhos diferentes, infantil e kit de duas peças. Estoque, preços e tarifas que não constam da fonte continuam desconhecidos. Não se carregam métricas fictícias como se fossem lucro da loja.

## Abrir a demonstração sem instalar o projeto

Baixe o arquivo `MLS_OWNER_PREVIA_INTERATIVA.html` ou extraia o pacote de demonstração. Abra o HTML em um navegador compatível ou sirva-o por HTTP local. Ele contém a interface e os dados de exemplo, sem requisições externas. A política administrativa do Chromium deste ambiente bloqueia URLs `file://` antes de carregar o documento; ela não foi alterada. Por isso, a homologação automatizada do arquivo usa HTTP estático isolado, sem servidor de API. A abertura direta pelo gerenciador de arquivos depende das regras do navegador e do celular.

Na interface, use Visão geral, Agentes, Produtos, Produção e Mais opções → MLS AI Sales. O módulo contém Campanhas, Estúdio, Afiliados, Desempenho e Integrações. O bloco inicial explica o que é somente leitura e oferece os vídeos e arquivos de exemplo. No HTML, as operações de backend respondem com bloqueio explícito; não simulam uma gravação bem-sucedida.

## Executar o backend local real

Na raiz do repositório, com Node 24:

```sh
npm ci
npm run build
npm run preview:owner
```

O comando informa o endereço local. Abra-o no mesmo computador e clique em **Abrir demonstração interativa**. O servidor gera uma conta sintética apenas em memória e faz login pelo endpoint verdadeiro do Worker. Não usa a senha da loja e mantém cookies `Secure`, `HttpOnly`, `SameSite` e CSRF. Ao encerrar, o banco de memória é descartado.

Para incluir os exemplos de mídia, consulte [preparação e render PT-BR](MLS_OWNER_PREVIEW_MEDIA.md). Depois:

```sh
npm run preview:owner -- --media /tmp/mls-owner-preview-media
```

O endereço `127.0.0.1` é local; não é uma URL pública e não abre no celular de outro computador. O servidor rejeita hosts e origens desconhecidos, não tem credenciais reais, aceita mídia somente pelo índice validado e não possui proxy de rede.

## Exportar o HTML navegável

```sh
npm run preview:export -- --output /tmp/MLS_OWNER_PREVIA_INTERATIVA.html --media /tmp/mls-owner-preview-media
```

[Detalhes do modo offline](MLS_OWNER_PREVIEW_OFFLINE.md). Os arquivos em `/tmp` são temporários; baixe o pacote ou escolha uma pasta própria para conservá-los. Não há inclusão de cookies ou credenciais no HTML; o bootstrap usa um marcador sintético conhecido.

## Roteiro de aceite

1. Conferir as seis telas de referência, os demais painéis e os temas claro/escuro, em desktop e celular.
2. No servidor local, abrir Custos e alterar o adulto regular de R$ 15,90 para R$ 16,90. Salvar e reabrir o catálogo: adulto regular passa a R$ 16,90, plus permanece R$ 21,40, infantil permanece R$ 12,50 e o kit regular + plus passa de R$ 37,30 para R$ 38,30. É uma demonstração com dados fictícios.
3. Selecionar no AI Sales a variação exata, conferir os componentes e anexar a imagem original autorizada. Planejar e exportar a entrada do CLI. Hash, quantidade de peças e direitos precisam corresponder ao arquivo.
4. Gerar ou importar o MP4 de teste e seu manifesto. Reanexar o vídeo, reproduzir e revisar. Aprovação local não publica em marketplace; mudanças de produto/mídia invalidam as aprovações dependentes.
5. Testar o cadastro local de criador e os arquivos CSV/JSON de desempenho, conferindo os rótulos de origem declarada e os bloqueios econômicos.
6. Somente em ambiente autorizado com dados reais, confrontar Seller Centre, DAS-MEI registrado, custos, anúncios, devoluções, repasses e banco. A demonstração não encerra M2/issue #50 nem comprova lucro bancário.

App base: `a5ba3298faf4b8c2eaa32e98674f1d7408f4c4616236d8f04a2fba72bbfb91c8`. Auth e Finance não foram alterados. O Worker de produção não recebe endpoints de prévia, FFmpeg, bypass de autenticação ou novos bindings. Hermes segue OBSERVER; publicações, convites, preços, estoque, comissões e Ads/PROMO continuam bloqueados.

Validação registrada: 2.327 Node e 67 Python, zero falha/skip; três builds com hashes inalterados. Commit de implementação `1574f9e`. [Evidências e capturas](qa/mls-owner-preview-2026-10-30/README.md).
