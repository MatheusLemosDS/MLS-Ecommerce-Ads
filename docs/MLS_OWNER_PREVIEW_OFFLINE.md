# Prévia interativa para abrir sem servidor

A prévia HTML usa o documento real do Worker compilado e respostas GET de uma execução local desse Worker com SQLite e três produtos sintéticos. Não requer login da loja, conexão Shopee ou envio de arquivos a serviços externos. Todos os dados são de demonstração. A identificação fica no topo do arquivo.

## Abrir e testar

1. Baixar `MLS_OWNER_PREVIA_INTERATIVA.html` e abrir no Chrome/Edge que permita documentos HTML locais. O arquivo contém os scripts e, quando solicitados ao exportar, os vídeos e arquivos de exemplo; não carrega bibliotecas de CDN.
2. Explorar Visão Geral, os agentes e as ferramentas pelo menu. Em celular, usar Mais opções. Há cinco abas dentro de MLS AI Sales.
3. Em AI Sales, carregar o catálogo de demonstração, escolher uma variação exata e conferir custo/tamanho. A camiseta infantil usa R$ 12,50; a composição física de um tipo personalizado precisa de confirmação local, pois o custo não prova quantas peças há na unidade vendida.
4. Testar funções que operam no navegador: cadastro de criadores, importação/exportação JSON/CSV, vinculação de originais autorizados e planejamento. Alterações locais devem ser exportadas antes de fechar o arquivo. Não existe banco persistente neste HTML.
5. Na área de ajuda, abrir os três MP4s reais de teste, se incluídos, e baixar originais próprios/entradas de CLI. São imagens sintéticas, voz offline PT-BR e roteiros `LOCAL_TEMPLATE`; não são vídeos da loja nem execução de LLM.

## Limites explícitos

- Custos salvos no backend, configurações, coleta, pedidos, vendas, anúncios e financeiro são **somente leitura**. Tentativas de POST recebem `OFFLINE_PREVIEW_READ_ONLY`; não há confirmação falsa de salvamento.
- Leituras desconhecidas ou de outra seleção ficam indisponíveis, sem assumir zero nem reutilizar o período errado. As respostas preservam os horários originais. A ausência de resultados da loja não é lucro zero.
- Os dados embutidos não comprovam Seller Centre, banco, estoque, taxas, preços ou permissões comerciais. Aprovação visual e auditiva pelo proprietário continua pendente.
- Downloads/importações no navegador são locais. O JSON não inclui os bytes de mídia; reanexar os originais ao retomar. Um manifesto antigo não aprova uma campanha alterada: o fluxo do CLI deve usar a entrada exportada daquela versão atual.
- A política CSP bloqueia rede; `fetch` serve somente as respostas embutidas, nega destinos externos e escritas. Links para serviços externos são interceptados. Não há cookies reais, tokens de conta ou senha no arquivo; CSRF é um marcador sintético sem validade em qualquer servidor.

No Chromium gerenciado deste ambiente, a navegação `file://` é bloqueada antes de carregar o documento (`ERR_BLOCKED_BY_ADMINISTRATOR`). A abertura direta em arquivo pessoal não foi certificada aqui; não se alterou nem contornou a política. O mesmo HTML foi verificado por transporte HTTP estático local em Chromium 1365×900 e 390×844: 16 painéis, cinco abas AI Sales, três produtos de catálogo, escolha GG e três MP4s com metadados 1080×1920/15s; nenhuma chamada `/api` chegou ao servidor estático, nenhum erro JavaScript/overflow, WebCrypto disponível e POST bloqueado com 503. Se o navegador impedir arquivos locais, usar o servidor local em vez de mudar suas políticas.

Para testar gravação real, autenticação e banco, usar o **servidor local** `tools/mls_owner_preview_server.mjs`. Ele executa o mesmo Worker em um banco separado e não se conecta à loja. Uma URL de homologação com dados reais depende de configuração e autorização externas.

## Gerar novamente

```sh
npm run build
node tools/mls_owner_preview_export.mjs --output /tmp/MLS_OWNER_PREVIA_INTERATIVA.html
```

Com a mídia própria já preparada e validada:

```sh
node tools/mls_owner_preview_export.mjs --output /tmp/MLS_OWNER_PREVIA_INTERATIVA.html --media /tmp/mls-owner-preview-media
```

O exportador autentica uma sessão local efêmera, captura GETs reais e encerra o servidor/banco. O cookie nunca é serializado; campos sensíveis são rejeitados e o CSRF é substituído. O arquivo contém hash do Worker, e o comando informa tamanho e SHA-256 do HTML. Nenhum Worker de produção, Auth, Finance, binding, D1 remoto ou OAuth é alterado.
