# Operação e direitos — inventário P00

O [registro estruturado](operations-inventory.json) contém12 serviços/plataformas, todos com ambiente, versão, responsável, finalidade, dados, custo/plano, limites, referências de secrets e recuperação. Campos sem fonte permanecem `UNKNOWN`, com valor nulo, bloqueio, responsável e ação mínima. O registro completo tem aceite documental; os campos remotos desconhecidos continuam sem validação operacional.

Cloudflare foi conferida por leitura autorizada; os três Workers de produção e seus hashes/versões foram preservados. O proprietário informou uso de Cloudflare e DigitalOcean. Não há conexão/token/CLI DigitalOcean configurados no ambiente atual; a associação de cada serviço ao provedor, versões remotas, contrato e restauração permanecem não comprovados. Não foi necessário trocar gateway, plano ou limites para corrigir os Builds.

O gateway Shopee/Ads é transporte de integração. O PSP de assinatura SaaS é outro serviço, com configuração/contrato ainda pendentes. As interfaces de email, carteira/saques e banco também são registradas com seus limites; CSV/OFX não encerra a coleta automática.

As duas dependências npm incorporadas, `otpauth@9.6.0` e `@noble/hashes@2.4.0`, têm textos MIT verificados e preservados no [notices](THIRD_PARTY_NOTICES.txt). O [SBOM](sbom.cdx.json) registra94 componentes do lock. Ferramentas/fontes de QA local não foram acrescentadas ao pacote runtime.

O [inventário de direitos](rights-inventory.json) cobre código, marca, avatares, fontes, áudio e78 ativos. Ausência de LICENSE raiz, acesso ao GitHub e hashes não provam titularidade. A origem/autorização comercial não demonstrada permanece bloqueada; nenhuma licença nova foi inventada.

## Dependências externas abertas

- `EXT-OPERATIONS`: operador, instalação/versão real, plano/limites e recuperação do gateway/Hermes.
- `EXT-RIGHTS`: origem/licença/autorização comercial de código, marca e mídia.
- `EXT-BILLING`, `EXT-EMAIL` e `EXT-FINANCIAL-SOURCES`: contratos, capacidades, grants, consentimentos e provas aplicáveis antes de ativar as funções correspondentes.

O estado está apenas no [checkpoint](../../MLS_COMMERCE_OS_CHECKPOINT.json) e na [matriz](../../MLS_SAAS_EXECUTION.json). Ver [aceite e limites de P00](CLOSEOUT.md) e [evidências mínimas para retomar](EXTERNAL_EVIDENCE_REQUEST.md). O [histórico integral até300efbd](OPERATIONS_HISTORY_300efbd.md) conserva as tentativas, falhas, autorizações, snapshots e links anteriores, byte a byte.
