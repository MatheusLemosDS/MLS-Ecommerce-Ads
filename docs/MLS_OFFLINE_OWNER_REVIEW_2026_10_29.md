# MLS Commerce OS — homologação visual offline, sem Cloudflare

**Status:** PR DRAFT empilhada na PR #76. Nenhum merge/deploy ou alteração de ambiente real foi autorizado.

## Propósito

Criar um artefato GitHub Actions em ZIP que permita ao proprietário visualizar o **design aprovado** e a separação de visibilidade da V3.6 no Edge/Chrome, sem configurar Codespaces, Cloudflare, Workers, D1, Shopee ou credenciais.

Este recurso é **somente homologação visual**. Não é um staging autenticado nem valida integrações, compras, reservas, valores, envios ou publicação de anúncios.

## Como acessar

1. Abrir a PR de QA e clicar no check `Validar Workers` ou em `Actions`.
2. Escolher a execução com **SUCCESS** no HEAD da branch de QA.
3. No rodapé da execução, em **Artifacts**, baixar `mls-offline-owner-visual-review`.
4. Extrair o ZIP e abrir `index.html` no Edge ou Chrome, sem instalar extensões.
5. Abrir `preview-off.html` para comparar o primeiro release **V3.6 OFF** com o mockup aprovado. Para ver somente a diferença visual de V3.6, abrir `preview-on.html`.
6. Usar os links da faixa superior para visualizar as quinze áreas. Os formulários/botões são intencionalmente inativos, mas seções `details` ainda podem ser expandidas pelo navegador.

## Arquivos gerados

| Arquivo | Uso |
| --- | --- |
| `index.html` | Índice local com explicação e links |
| `preview-off.html` | Design aprovado com Fábrica de Anúncios e busca V3.6 indisponíveis |
| `preview-on.html` | Diferença de visibilidade da V3.6 **apenas na simulação** |
| `manifest.json` | Declaração verificável de caráter sintético e offline |
| `README.txt` | Orientações básicas de navegação |

## Proteções técnicas

O gerador `tools/build_offline_owner_review.mjs` usa o Worker compilado em **fixture D1 sintética**. Antes de gerar a prévia:

- Remove **todos os scripts originais da aplicação** e qualquer `iframe`, `img`, `object`, `link` ou recurso externo.
- Mantém somente HTML e CSS, remove URLs de CSS; toda navegação entre painéis é feita por âncoras locais, sem código cliente ou rede.
- Neutraliza formulários, controles mutáveis e URLs; a CSP bloqueia scripts, rede, submissão de formulários e recursos externos.
- Insere faixa visível `QA SINTÉTICA · SEM DADOS REAIS`, sem valores reais de pedidos, clientes, anúncios, cookies ou tokens.
- É testado com entradas hostis e fixture compilada OFF/ON por `tools/tests/offline-owner-review.test.mjs`.
- O workflow tem somente permissões de leitura, sem deploy, e o ZIP fica no GitHub Actions por sete dias.
- O gerador não muda `dist/app-worker.mjs`, nem os hashes do App/Auth/Finance, nem a variável `MLS_V36_OWNER_PREVIEW` do Cloudflare.

## O que ainda falta antes do release

- QA autenticada real do candidato em ambiente isolado (ou lançamento controlado após autorização, primeiro com flag OFF);
- Verificar a versão Cloudflare `1bb72681` como opção operacional de rollback e o estado de Auth/Finance;
- Confirmar novamente `Disable builds` ON e variável `MLS_V36_OWNER_PREVIEW` ausente na conta;
- Aprovação explícita do proprietário antes de merge e, separadamente, antes de deploy.

**Não publicar a PR de QA para gerar a prévia.** O GitHub Actions pode entregar o ZIP sem mesclar código nem acionar Cloudflare. O release oficial continua na [PR #76](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/76) em DRAFT.
