# Evidências mínimas para destravar P00

Este pedido não autoriza alteração de configuração, ampliação de permissões, push, deploy ou contato com terceiros. O commit local `1906de4` permanece preservado. Enviar somente metadados sanitizados obtidos por leitura autorizada; não enviar tokens, cookies, variáveis secretas, extratos ou dados de compradores. Um campo desconhecido deve continuar desconhecido.

## 1. Workers Builds — administrador Cloudflare

Para cada Worker `brazacommerce-app`, `brazacommerce-auth` e `brazacommerce-finance`, registrar:

- Data/hora UTC, nome do Worker e origem da evidência: resposta GET suportada ou configuração efetiva exibida no painel autenticado.
- Repositório conectado, branch de produção e estado habilitado/desabilitado de cada gatilho.
- Eventos disparadores: push, PR e previews; filtros de inclusão/exclusão de branches e caminhos, inclusive valores vazios/defaults e seu significado documentado.
- Diretório raiz, instalação, build command, deploy command e comando efetivo de branches não produtivas/previews. Se houver delegação a script, informar caminho e SHA desse script para inspeção.
- Se a branch `feature/saas-p00-baseline-20261114` é elegível e qual comando executaria. Incluir também `docs/retomada-main-atual-20261114` para a entrega documental preservada, caso ainda seja considerada para publicação.
- Indicar se há outros gatilhos/integrações que possam executar deploy desses mesmos Workers. Se isso não puder ser conferido, registrar a limitação.

Leituras já tentadas: GET `/accounts/{account_id}/builds/workers/{worker_tag}/triggers` e GET `/accounts/{account_id}/builds/workers/{worker_tag}`. Os identificadores dos três Workers foram confirmados pelo endpoint de scripts; a credencial existente recebe 403/10000 nas seis leituras de Builds. Uma resposta bem-sucedida de metadados de Worker não comprova permissão em Builds. URL contendo `/production/builds/`, check externo em falha ou ausência de deploy observado não demonstram a branch de produção.

A equipe reconferirá a main e a ausência de branch/PR remota antes de qualquer push autorizado. Nenhum status enviado será tomado isoladamente como autorização de produção; comandos arbitrários continuam exigindo inspeção. Não desabilitar gatilhos nem trocar comandos para contornar esta conferência.

## 2. Gateway Shopee e ponte Hermes — operadores dos serviços

Para cada serviço externo, informar separadamente: ambiente, operador responsável (papel/equipe basta), versão/data do artefato instalado, finalidade, categorias de dados, autenticação somente por referência, custo ou plano/limite contratado, limites técnicos, saúde observada, política de logs/retenção, backup, procedimento de restauração e data/resultado da última restauração comprovada. Se um serviço não tiver essa informação, registrar o campo e o responsável por obtê-la.

O [runbook Hermes existente](../../HERMES_FINANCEIRO.md) descreve backup e atualização atômica; sua presença não comprova instalação, versão remota, custo, execução ou recuperação atual. Não executar a atualização ou uma análise real como teste para preencher este formulário. O gateway Shopee/Ads não é o PSP de cobrança da assinatura SaaS.

## 3. Direitos — proprietário/responsável

Relacionar origem, licença/autorização aplicável e evidência por família: código e contribuições, marca, avatares/referências visuais, imagens comerciais, fontes e áudio efetivamente distribuídos. Identificar restrições e ativos somente referenciais/sintéticos. Não é necessário enviar arquivos pessoais ou contratos integrais; uma referência sanitizada ao registro aplicável pode ser suficiente para revisão. Não inventar licença raiz ou presumir titularidade pelo acesso ao GitHub.

Os notices MIT das duas bibliotecas npm incorporadas já foram conferidos. Não é necessário repetir essa prova sem mudança de versão/uso. As pendências de direitos não autorizam apagar os seis cartões, substituir avatares, redesenhar V4.1 ou publicar material em marketplace.

## Retomada

O executor confrontará a evidência com o recurso, a branch, o SHA e o ambiente. Continuará com o que ela efetivamente comprovar, mantendo campos ausentes como bloqueios. A suíte funcional aprovada não precisa ser repetida por mero recebimento documental; somente um delta relevante exige nova validação proporcional. O estado permanece no checkpoint e na matriz operacional existentes. P01–P11 não foram iniciadas por este pedido.
