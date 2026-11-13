# V4.1 — publicação, uso e recuperação

**Publicada e conferida no escopo técnico/público** em **13/11/2026 às 13:14:50 de Brasília**, em **https://app.brazacommerce.com.br**. Versão visível `2026-11-12.1`; commit publicado **`7ec3ffa0ed27366eca0792d5d277979bb991f679`**, implementação corrigida `bdbc857ac443f58376613225dcbbfd02a108d41c`.

A [PR #119](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/119) registra a integração Git; seu estado atual deve ser consultado separadamente. A publicação foi realizada com a PR aberta. A [CI 43456719793](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/actions/runs/43456719793) aprovou **4.106 testes Node, sem falhas/skips, e67 Python**, além do build e preflight. O [recibo técnico](live-publication.json) e a [verificação pública](public-live-verification.json) demonstram o que foi observado no destino; merge não é usado como prova de deploy.

## O que está disponível

- **Visão geral:** mantém os seis agentes após os indicadores, com navegação e hierarquia visual reorganizadas. Séries de pedidos, dinheiro e ROAS preservam unidades, fontes e períodos; valores ausentes continuam identificados.
- **Financeiro e Relatórios:** composição do resultado, custos e pendências legíveis. O semanal mantém as três bases separadas: fabricação física, estimativa das vendas e caixa importado. Links transportam mês, data ou corte, preservando rascunhos.
- **Produtos, Produção e Pedidos:** continuam com os formulários e ações existentes. Ranking/ABC, custos, distribuição das etapas e gráficos físicos usam as fontes validadas. Links antigos de fabricação agora resolvem o painel correto.
- **Conta e empresa:** `/account/login`, cadastro e recuperação, perfil, segurança, sessões e `/companies` possuem backend persistente, empresa/loja/equipe/papéis e isolamento entre App → Auth → Finance. O login existente da loja continua em `/login` e o painel em `/admin?tab=overview`. Não é necessário reconectar a loja para usar o layout.

A [matriz funcional](functional-coverage.json) conserva os233 requisitos e22 famílias de gráficos, além de dois achados adicionais. Ela distingue código publicado, testes locais/CI, verificação pública e aceite operacional. Os sete slots sem fonte gráfica fechada continuam indisponíveis com motivo. Ads/PROMO permanecem bloqueados e Hermes observador.

## Deploy observado

As migrações aditivas0001/0002 foram aplicadas **somente no ACCOUNT_DB dedicado**, distinto dos bancos legados. O banco novo foi conferido com seis tabelas, um índice explícito, dois registros do journal e **zero identidades/fatos operacionais**. Não houve consulta SQL ou migração nos D1 legados por esta release. A loja atual não foi copiada nem atribuída ao primeiro cadastro.

As versões foram enviadas inativas e ativadas em **Finance → Auth → App**. Após cada etapa foram conferidos vetor ativo/latest, fontes raw, configuração e domínio. O delta autorizado foi o ACCOUNT_DB nas três configurações e a chave privada de criptografia no Auth. Bindings/segredos existentes, flags, cron, serviços e domínios foram preservados; Finance continua privado.

| Worker | Versão ativa e latest,100% | Ativação em13/11, Brasília |
| --- | --- | --- |
| Finance | `d3bf1196-e75b-491b-bc40-f523029db483` | 13:10:56 |
| Auth | `59f4e183-ea0a-45d3-8291-c56ce737047a` | 13:11:46 |
| App | `68bb7328-b635-49bb-a64a-b8dff7f0c417` | 13:12:49 |

O vetor foi conferido às13:13:44 e o domínio às13:14:50 de Brasília. Os hashes completos compilados e raw estão no recibo; são artefatos distintos. Os **seis assets atuais e quatro retidos** foram obtidos do domínio com SHA-256 e comprimento exatos, preservando recuperação e rollback.

## Verificações após a publicação

Foram executadas **15 verificações HTTP,10 assets e24 perfis públicos** em320/1365px e claro/escuro, sem erros JavaScript nos perfis registrados. `/login` serviu a release `2026-11-12.1`; páginas públicas de conta foram comparadas à fonte Auth efetivamente publicada. Áreas protegidas redirecionaram ao login e APIs sem sessão retornaram401.

As respostas reais do domínio foram obtidas por GET Node com **TLS verificado** e renderizadas no Chromium por CDP. O Chromium nativo deste ambiente não confiou na CA do proxy; TLS não foi desativado. A evidência comprova as respostas do site e a renderização registrada, não transporte HTTPS nativo desse navegador.

**Nenhuma sessão real autorizada do proprietário estava disponível.** Login/logout autenticados, painéis internos e dados financeiros reais não foram exercitados na Live. A conferência pública não substitui esses fluxos nem o confronto Seller Centre/banco. Nenhum pedido, despesa, devolução, campanha, cobrança, convite, mensagem ou conta sintética real foi criado para QA.

## CI e controles existentes

A primeira CI43453964784 falhou em dois perfis mobile: o texto de status não cabia com a fonte real do runner. A correção CSS e os perfis de fontes/tamanhos adicionais passaram no gate focado4/4 e na CI completa atual. A falha permanece no [histórico](ci-validation.json); o gate local4106/67 inicial não foi reatribuído ao código posterior.

Os três checks **Cloudflare Workers Builds** já apresentavam falha na fonte publicada da PR118 e permaneceram separados do gate GitHub `validate` aprovado. As APIs de configuração/log retornaram403; o diagnóstico exige a permissão `Workers Builds Configuration: Edit` no token autorizado. O fluxo manual Wrangler existente concluiu o deploy e a verificação independente; isso não transforma aqueles checks em aprovados. Não houve force push, uso de admin ou alteração de controle para ocultar falha.

## Dependências para comercialização e aceite

| Dependência ainda ausente | Consequência |
| --- | --- |
| E-mail transacional real | Verificação, reset, troca de e-mail e convites não têm entrega real comprovada. Backend/outbox de teste não são serviço de envio Live. |
| Provedor de cobrança e planos aprovados | Checkout, portal e cobrança real ficam indisponíveis. Nenhum preço/trial foi inventado. |
| Credenciais e scopes por empresa | Novas empresas permanecem desconectadas; não herdam a conexão da loja atual. TikTok Order API e Mercado Livre seguem com suas dependências próprias. |
| Documentos legais e retenção | Não há alegação de conformidade legal ou apagamento irreversível liberado por inferência. |
| Sessão e evidências operacionais autorizadas | M2/M2.2, fabricação completa, comparação Seller Centre/banco e lucro realizado continuam abertos. |

O código publicado não equivale a SaaS pronto para clientes ou resultado financeiro conciliado. O [registro de dependências](EXTERNAL_DEPENDENCIES.json) identifica o impacto por requisito.

## Recuperação

Os códigos/configurações/fontes anteriores e os pontos de restauração dos bancos legados foram registrados antes da mudança. Em regressão crítica, restaurar coordenadamente o vetor compatível dos três Workers e assets, conferindo novamente o domínio. **Manter ACCOUNT_DB, schema, escritas novas e a chave de criptografia**; não apagar tabelas nem sobrepor fatos novos com backup antigo para voltar o código.

A versão anterior mantém o caminho legado e ignora o banco novo. Contas comerciais ficam indisponíveis durante esse rollback, com os dados preservados para reaplicar a versão compatível e a mesma chave. Ensaios de restauração/migração foram locais e sintéticos; nenhum rollback destrutivo ou restauração operacional de banco foi executado nesta publicação. Uma recuperação futura deve receber seu próprio recibo.
