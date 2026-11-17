# Varredura de estabilidade — operação própria

## Continuação mensal 17.2 — fonte/configuração verificadas, público pendente

Diagnóstico real do catálogo observado: `FINANCE_PRODUCT_INDEX_RESPONSE_EMPTY_ITEM_MISSING`, na tentativa de 21:44:48 UTC. A compatibilidade estrita está em revisão isolada para 17.3, ainda sem integração ou publicação; o catálogo permanece não resolvido.

Retomada real observada: uma fonte histórica foi substituída por uma nova fonte do mesmo período, preservando o frame original e a publicação anterior; páginas, cobertura financeira e aceite operacional permanecem pendentes.

[Recibo 17.2](publication-monthly-continuation-live.json) · [validação](monthly-continuation-20261117.json). Auth→App foram publicados pelo candidato exato aprovado; Finance permaneceu na versão 17.1. Leitura nativa confirma as fontes e configurações dos três Workers, com tráfego de 100%. Nenhuma mudança de schema, retenção, cap, fórmulas, permissões ou workflows.

O gate público 17.2 está **pendente**, após 503 com 98 bytes Envoy na URL canônica em três séries de três tentativas e curl; a falha, SHA256 e ausência de cancelamento manual são preservados. Não equivale a sucesso público nem prova falha da aplicação. A 17.1 continua a última publicação integralmente conferida em fonte/configuração/HTTP/assets.

A continuação mantém intervalo mínimo de 900 s nas ofertas reservadas, yield não mensal, uma fonte/turno, leases e CAS; HISTORY ordinário conserva seu backoff. Avanço de páginas do histórico, catálogo e aceite operacional/financeiro pendentes; prova sintética não promete prazo ou cobertura. Repetir o gate público limitado sem alterar configuração/segurança para contornar.

## Histórico das publicações 17.1 e 16.5

## Catálogo17.1 — diagnóstico publicado, recuperação ainda não comprovada

[Recibo 17.1](publication-catalog-diagnostics-live.json) · [validação](catalog-diagnostics-20261117.json). App/Auth/Finance foram publicados e verificados pelo candidato exato aprovado, sem mudança de schema, permissões ou workflows. A correção acrescenta diagnóstico estrutural finito; preserva erro 502, identidade, filtros/cursor e backoff. Não normaliza ausência em sucesso e não prova que o erro real do catálogo foi resolvido.

A próxima evidência necessária é o diagnóstico da tentativa natural elegível do catálogo. Não executar varredura forçada, reset ou bypass para obter uma tela verde. Recuperação de fontes, completude financeira e aceite owner continuam separados. O histórico 16.5 e seus incidentes/recibos permanecem íntegros abaixo.

## Histórico da publicação 16.5

**Estabilidade16.5 publicada e verificada técnica e publicamente.** [Recibo](publication-live.json), [validação](validation.json) e [bloqueios restantes](BLOCKERS.json). Fonte ed651fa/CI661 e registro documental0315e454/CI662 aprovados, com os mesmos hashes. Executor recuperado; oito endpoints e oito assets conferidos sem redeploy. Incidente anterior preservado; recuperação integral de fontes e aceite operacional/financeiro continuam pendentes.

Base de código preservada: `f78b503`, PR127, Live16.4. Main reconfirmada pelo conector GitHub em `346f30f`. A CI660 da própria base terminou aprovada; falhas de rodadas anteriores não são tratadas como falhas atuais sem reprodução. [Base e escopo](BASELINE.json).

## Falhas reproduzidas

- **DTF → Pedidos/fabricação:** a receita confirmada acrescenta dois campos ao payload. Dois leitores ainda exigiam seis, bloqueando Pedidos e a proposta de fabricação. A correção distingue a identidade comercial original da composição local, mantendo o hash cru para concorrência e a auditoria anterior.
- **Ponte App/Auth:** o timeout começava depois de ler toda a entrada. Streams pendentes e cancelamentos que não terminam podiam manter a chamada aberta. O prazo agora cobre entrada, transporte e resposta, inclusive chegada tardia, sem expor detalhes privados.
- **Histórico mensal:** a manutenção de outubro só recebia execução quando novembro estava completamente ocioso. A lane reservada passa a alternar continuação mensal e manutenção auxiliar, preservando leases, cooldown e limites. Três referências antigas já não existiam no Finance. Um404 privado tipado agora registra intenção auditada e, em outro turno, permite uma consulta real do mesmo período sob CAS; mantém o frame e a publicação anteriores. Execução da fila não comprova fechamento completo.
- **Builds externos:** o isolamento de preview comprovado em P00 não fazia parte da cadeia publicada atual. O helper foi restaurado, com branches explicitamente autorizadas, recursos QA, identificação por GET e recusa de deploy de produção em contexto não produtivo. Configuração/logs de Builds continuam limitados por403; não se atribui uma causa remota sem acesso.
- **Pacote de deploy:** o módulo completo já gerado era empacotado novamente pelo Wrangler, acrescentando aproximadamente444KB no App. A validação de ESM fechado e `--no-bundle` entregam os mesmos bytes testados, mantendo o cap de4MiB. Imports residuais, CommonJS, sintaxe inválida e ausência de export default são recusados antes do transporte.
- **Ferramentas:** atualização compatível e fixada de Node/Wrangler/Undici; o npm declarado permanece11.9.0. O audit abrange também dependências de desenvolvimento. Um resultado zero do feed não substitui revisar os avisos oficiais.
- **Diagnóstico do catálogo:** erros finitos já sanitizados eram descartados entre Finance/Auth/App/registro. O diagnóstico finito agora é preservado sob a mesma revisão/lease; não pula o statusBANNED nem atribui erro genérico a falta de permissão.

## Fontes consultadas

[Configuração de Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), [configuração de Previews](https://developers.cloudflare.com/workers/previews/configuration/), [recursos e isolamento](https://developers.cloudflare.com/workers/previews/resources/) e [relato dos mantenedores sobre branches e previews](https://github.com/cloudflare/developer-platform/issues/75).

[Node24.22.3](https://nodejs.org/en/blog/release/v24.22.3) e avisos oficiais Undici: [redirecionamentos intermediários](https://github.com/nodejs/undici/security/advisories/GHSA-mqg3-3v4r-cm32), [cache com redirecionamento](https://github.com/nodejs/undici/security/advisories/GHSA-7xg3-fphp-28hg). Relatos e documentação são referências; somente reprodução e verificação do candidato comprovam a correção local.

## Limites que permanecem explícitos

Três tabelas laterais aditivas registram alternância, diagnóstico do catálogo e recuperação de fontes. Os cálculos financeiros e DTO mensal foram preservados byte a byte pelos pins existentes, com uma variante exata apenas para transporte/CAS. Não há nova DDL no Finance, remoção de fatos ou mudança dos bindings.

A coleta atual e o heartbeat do Hermes foram observados ativos por leitura. Catálogo, histórico e builds são avaliados separadamente. Limites de seleção de originais e capacidades ainda parciais de estoque/CMV/banco não são transformados em COMPLETE. Grants, consentimentos, extratos, fatos físicos e aceite financeiro real precisam de evidências próprias. Recursos QA de preview são compartilhados entre as branches autorizadas; não constituem isolamento entre branches ou clientes.

Nenhum valor real de custo, pedido, fabricação, pagamento ou fechamento foi alterado para testar esta entrega. Venda permanece ADIADO_VENDA; gates, autenticação, CSRF, isolamento, sexta13h/Brasília, gráficos e seis agentes permanecem obrigatórios. Publicação técnica e aceite operacional serão registrados separadamente no checkpoint canônico.
