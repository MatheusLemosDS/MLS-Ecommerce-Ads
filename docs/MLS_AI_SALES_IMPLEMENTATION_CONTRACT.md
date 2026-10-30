# MLS AI Sales — contrato de implementação v1

API de desenvolvimento, 30/10/2026. Módulos puros; nenhum grant documental libera I/O. Todos os validadores abaixo retornam uma cópia profundamente congelada ou lançam `AiSalesContractError` com `code` sanitizado. Campos são fechados e obrigatórios; desconhecido é `null`, nunca zero. Strings de evidência são referências locais, não tokens/documentos privados.

## APIs compartilhadas

`mls-ai-sales-contracts.mjs` exporta `validateAiSalesProductSnapshot`, `validateAiSalesAsset`, `validateAiSalesCampaignPlan`, `validateAiSalesVideoJob`, `validateAiSalesCreator`, `validateAiSalesCollaboration`, `validateAiSalesPerformance`, `validateAiSalesActionAudit`, `makeAiSalesProductKey`, `canonicalAiSalesJson`, `hashAiSalesValue`, `AiSalesContractError`.

`hashAiSalesValue` é async SHA-256 via WebCrypto. Demais validadores são síncronos. Não há rede, relógio implícito, filesystem, storage nem valores aleatórios.

`makeAiSalesProductKey({marketplace,shop_ref,platform_product_id,variant_ref})` produz chave canônica com escopo, sem join por título/SKU.

### Evidence

```
{source,reference,observed_at,status,marketplace,shop_ref,currency,basis}
```

`status`: `VERIFIED|DECLARED|UNKNOWN`. `source`: identificador de origem, por exemplo `SHOPEE_SAVED`, `OPERATOR_DECLARED`, `OFFICIAL_REPORT`, `LOCAL_MEDIA`. `marketplace`: `SHOPEE_BR|TIKTOK_SHOP_BR`; `currency`: ISO-4217 ou null; `basis`: identificador de competência (ou null). `observed_at`: epoch inteiro positivo. Uma declaração não vira verificação.

### ProductSnapshot

```
{
 schema:'mls_ai_sales_product_snapshot_v1',
 product_key, marketplace, shop_ref, platform_product_id, variant_ref,
 sku:null|string,title,verified_product_attributes:[{name,value,evidence}],
 landing_url:null|string,price_cents:null|int,currency:null|string,
 cost_cents:null|int,fees_cents:null|int,inventory_units:null|int,
 piece_count:null|int,components:[{component_ref,size:null|string,quantity:int,art_ref:null|string}],
 observations:[{field,evidence}],media_refs:[asset_id]
}
```

Quando `piece_count` é conhecido, soma de `components.quantity` precisa ser igual; cada componente tem identidade própria. Para desconhecido, `components=[]`. Nenhum tamanho, algodão, estoque ou SKU é inferido do título. `variant_ref` pode ser null mas bloqueia um plano que exige vínculo exato.

### Asset

```
{
 schema:'mls_ai_sales_asset_v1',asset_id,product_key,variant_ref,
 file_name,sha256,mime,width,height,size_bytes,
 role:'MOCKUP_ORIGINAL'|'PRODUCT_PHOTO'|'ARTWORK',
 represented_units:int,component_coverage:[{component_ref,quantity:int}],origin:'LOCAL_OPERATOR',
 rights:{status:'AUTHORIZED'|'UNKNOWN'|'DENIED',reference:null|string,observed_at:null|epoch},
 preserve_geometry:true
}
```

`file_name` é apenas basename PNG/JPEG; bytes e decodificação são validados novamente pelo CLI. `ARTWORK` não substitui foto/mockup de produto. `represented_units` é a soma exata de `component_coverage.quantity`, com referências únicas aos componentes do produto e sem exceder suas quantidades. ARTWORK usa zero e cobertura vazia. Uma foto de kit pode cobrir dois componentes; duas fotos separadas podem cobrir um componente distinto cada. O planner usa o MÁXIMO observado para cada componente entre as fotos: duas imagens/ângulos da mesma peça não viram duas peças. O mesmo hash não pode receber coberturas contraditórias. O plano exige cobertura completa da composição, além de `piece_count` conhecido. A autorização de direitos nunca deriva do hash.

### CampaignPlan / VideoJob

`planAiSalesCampaign({campaign_id,products,assets,template_id,channel,goal,generated_at})` é async. Templates fechados: `NOSTALGIA_80_90_2000`, `PRODUCT_DETAILS`, `COUPLE_KIT`. Canais: `SHOPEE_VIDEO|TIKTOK_VIDEO`; goals: `STORE_VIDEO|AFFILIATE_BRIEF`. Máximo 10 produtos de uma mesma loja/provedor.

```
{
 schema:'mls_ai_sales_campaign_plan_v1',campaign_id,marketplace,shop_ref,
 product_refs:[product_key],template_id,channel,goal,stage:'DRAFT',
 asset_refs:[asset_id],asset_inputs:[{asset_id,product_key,sha256,manifest_hash}],generated_at,idempotency_key,
 status:'READY_FOR_LOCAL_RENDER'|'BLOCKED',blocked_reasons:[code],
 script_source:'LOCAL_TEMPLATE',scripts:[{product_key,locale:'pt-BR',title,lines:[text]}],
 operator_approval_id:null,commercial_writes:false
}
```

Roteiro local determinístico não é IA/LLM. Preço/estoque/desconto só podem aparecer com evidência própria compatível; v1 usa título e atributos verificados. Estoque desconhecido não impede produzir um rascunho local, mas impede alegar disponibilidade ou publicar.

`createAiSalesVideoJob(campaign,product_key,{job_id,assets})` é async:
```
{schema:'mls_ai_sales_video_job_v1',job_id,campaign_id,product_ref,template_id,
 input_hashes:[sha256],idempotency_key,state:'PLANNED'|'QA_BLOCKED'|'RENDERING'|'READY_FOR_OWNER'|'APPROVED'|'FAILED',
 error_code:null|code,output_hash:null|sha256,path_local:null|string,
 commercial_writes:false}
```

Renderer recebe wrapper local próprio `{schema:'mls_ai_sales_local_input_v1',campaign,products,assets,narration,budget}`; diretórios/ferramentas passam por options do CLI, não pelo snapshot. Revalida a campanha contra produtos e assets e verifica os hashes dos bytes originais. `createAiSalesVideoJob` compara os assets validados com os hashes e vínculos imutáveis capturados em `campaign.asset_inputs`, seleciona apenas os hashes originais do produto e nunca deriva um hash de mídia do idempotency_key. `manifest_hash` é SHA-256 do JSON canônico do Asset validado completo, incluindo direitos, dimensões e cobertura dos componentes. Mudar esses metadados mantendo os mesmos bytes também invalida o job e exige replanejamento.

### Creator

```
{schema:'mls_ai_sales_creator_v1',internal_creator_id,provider,shop_ref,
 approved_handle,consent_evidence:null|Evidence,
 seller_creator_access_grant_status:'UNKNOWN'|'DENIED'|'GRANTED',
 channel_fit:[string],last_contact_at:null|epoch,
 status:'DRAFT'|'ELIGIBLE'|'CONTACTED'|'RESPONDED'|'DECLINED'|'BLOCKED'}
```

`provider`: `SHOPEE_BR|TIKTOK_SHOP_BR`. `approved_handle` é handle público consentido, sem email, telefone ou comprador. Evidence de consentimento usa basis `CONSENTED` ou `PUBLIC_PERMITTED`; não concede scope de API. MVP não envia convites.

### Collaboration

```
{schema:'mls_ai_sales_collaboration_v1',plan_id,provider,shop_ref,creator_ref,product_ref,
 commission_rate_bps:null|int,money_exposure_cents:null|int,
 margin_evidence:null|Evidence,status:'DRAFT'|'BLOCKED'|'APPROVED'|'SENT'|'ACCEPTED'|'EXPIRED',
 provider_id:null|string,owner_approval_id:null|string,idempotency_key,commercial_writes:false}
```

O CRM pode envolver `{collaboration,gate}`; o gate econômico não é um grant de API. `SENT/ACCEPTED` só representam registros assistidos/importados, nunca envio pelo aplicativo.

### Performance (agregado)

```
{schema:'mls_ai_sales_performance_v1',source,marketplace,shop_ref,campaign_ref,product_ref,creator_ref:null|string,
 period:{start_date,end_date},observed_at,currency,
 views:null|int,clicks:null|int,affiliate_orders:null|int,
 confirmed_sales_cents:null|int,attributable_ad_spend_cents:null|int,
 commission_cents:null|int,refunds_cents:null|int,
 coverage_status:'COMPLETE'|'PARTIAL'|'UNKNOWN',source_evidence:Evidence}
```

O ledger manual deduplicável tem contrato próprio no módulo de desempenho, com record_id/revision/status; não deve fingir que este agregado prova pedidos individuais ou lucro líquido.

### ActionAudit

```
{schema:'mls_ai_sales_action_audit_v1',actor:'OWNER'|'AGENT',verb,target,draft_hash,
 decision:'DRAFT'|'APPROVED'|'REJECTED'|'BLOCKED',gate_result:[code],
 approved_at:null|epoch,executed_at:null|epoch,
 provider_result_status:'NOT_EXECUTED'|'MANUAL_RECORDED',redacted_evidence_ids:[string]}
```

## Gate econômico e capacidades

`evaluateAiSalesProfitability({product,commission_rate_bps,commission_evidence,extra_cost_cents,extra_cost_evidence,at})` retorna relatório fechado `mls_ai_sales_profitability_v1`: `status READY|BLOCKED`, `contribution_cents|null`, `margin_bps|null`, `blocked_reasons[]`, `product_key`, `currency`, `basis`, `commercial_writes:false`. READY exige preço/custo/tarifas/comissão/despesas conhecidos, evidências VERIFIED da mesma loja/moeda/basis, frescor e matemática segura. Comissão arredonda para cima em centavos. Não representa lucro realizado/bancário.

`auditAiSalesCapabilities({marketplace,shop_ref,evidence,at})` trata leitura de catálogo, Affiliate Seller, grant Creator e Content Posting separadamente. Estado documental GRANTED não prova conexão. Toda escrita comercial permanece `false` mesmo com evidência.

## Roteiro opcional de modelo: pedido e revisão offline

`mls-ai-sales-script-adapter.mjs` exporta:

- `getAiSalesScriptModes()` — informa o padrão `LOCAL_TEMPLATE`; custo de provedor zero nesse modo local e custo de computação local desconhecido. O modo de modelo opcional continua `BLOCKED`, sem transporte nem acesso de provedor comprovado.
- `buildAiSalesScriptRequest({products,provider,model,budget,generated_at})` — gera pedido determinístico de revisão, não chama API. `provider` é `OPENAI|ANTHROPIC|LOCAL_MODEL`; `model` é identificação declarada pelo operador, sem afirmar que existe ou está disponível. `budget` exige `{currency:'BRL',max_provider_cost_cents,max_output_tokens}`; limite positivo não concede acesso nem autoriza gasto. O pedido contém apenas títulos com evidência `VERIFIED` atual e atributos verificados atuais, mantendo referências de evidência. Preço, estoque, taxas e descontos não entram no contexto do modelo. Todas as variações precisam de identidade exata e da mesma loja/provedor.
- `importAiSalesScriptResponse({request,products,response,imported_at})` — revalida os produtos atuais contra o hash do pedido e aceita somente `{schema:'mls_ai_sales_script_response_v1',request_hash,scripts:[{product_key,hook_id,claim_refs,cta_id}]}`. Hooks e CTA pertencem a vocabulário fechado; `claim_refs` selecionam até três atributos comprovados. Não existe campo de texto livre, preço, estoque, promessa ou atributo novo. As linhas são reconstruídas com os valores literais da fonte.

O resultado é um `mls_ai_sales_script_review_v1`, sempre `truth_status:'SOURCE_DECLARED'`, `provider_execution_verified:false`, `provider_cost_cents:null`, `requires_owner_review:true`, `render_eligible:false`. Importar JSON não prova que um modelo foi executado. Esse resumo serve para revisão e seleção de fatos; **não substitui o roteiro canônico `LOCAL_TEMPLATE`** da campanha/MP4 atual. Integrar texto novo ao render requer contrato de proveniência, invalidação dos hashes e QA de áudio/legendas próprios. Transporte com credenciais e qualquer gasto dependem de autorização específica futura, sem chave ou custo implícitos.

## CRM assistido e desempenho declarado

`mls-ai-sales-affiliates.mjs` exporta criação/validação de workspace, upsert/remoção de criadores, `draftAiSalesAffiliateProposal` e `approveAiSalesAffiliateProposal` assíncronos, importação/exportação de workspace JSON e de criadores CSV/JSON. O workspace tem `{schema:'mls_ai_sales_affiliate_workspace_v1',revision,creators,plans,audit,last_updated_at,commercial_writes:false}`. Cada plano guarda `{collaboration,gate,proposal,draft_hash,created_at,updated_at}`.

O gate `READY` exige evidências financeiras verificadas atuais compatíveis, criador elegível com consentimento e evidência de devoluções verificada atual da mesma loja/provedor/moeda com `basis:'RECONCILED_ZERO_RETURN_EXPOSURE'`. Evidência genérica sem valor/exposição conciliada não prova ausência de devoluções; outros casos ficam `RETURNS_EXPOSURE_NOT_RECONCILED`. Aprovação é uma decisão local; não envia convite, mensagem ou comissão à plataforma. Exposição financeira só é conhecida quando produção, taxas, comissão e despesas adicionais são conhecidas. Importação manual degrada evidências para `DECLARED/OPERATOR_IMPORTED`, apaga atributos apresentados como verificados, deixa grants de criador `UNKNOWN` e revoga aprovações até nova revisão.

O ledger de `mls-ai-sales-performance.mjs` preserva a origem nominal do relatório em `source`, mas sua `source_evidence` importada fica `OPERATOR_IMPORTED/DECLARED`. Correções por identidade/revisão e deduplicação são atômicas. Registros `ORDER` e `METRICS` têm bases distintas, sem somar atribuições sobrepostas. Razões calculadas a partir de cobertura declarada completa são explicitamente reportadas/declaradas, não prova de vencedor, lucro bancário ou autorização para escalar anúncios.
