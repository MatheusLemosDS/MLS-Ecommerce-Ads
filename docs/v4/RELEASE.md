# V4.1 — release e recuperação

Estado deste registro: **correção CSS focada aprovada; nova CI completa e publicação pendentes**. Fonte inicial histórica `eeb3c34c324b362c2c56ef46727e6b24485cc3b7`, base `a5bd38a0902b38ecc3e90a747601eba330e7813e`, branch `feature/v41-layout-commercial-live-20261112`. O manifest de release fixa o commit candidato e o vetor autorizado; o recibo final deve identificar o commit efetivamente servido.

Destino autorizado: **https://app.brazacommerce.com.br**. A autorização atual substitui a antiga entrega somente local e permite o fluxo normal de commit/push/PR/merge, migrações aditivas ensaiadas, deploy e conferência. Não autoriza força sobre gates, mensagens reais ou ações comerciais de teste.

## Antes da ativação

1. Conferir CI e regras reais de integração; não usar force push/admin bypass.
2. Confirmar os backups exportados das versões/fontes/configurações dos três Workers e os pontos de restauração dos bancos legados. Conferir novamente o vetor ativo para detectar alteração concorrente.
3. Aplicar as migrações ensaiadas `account-0001.sql` e `account-0002.sql` somente no ACCOUNT_DB novo. Confirmar schema, journal e ausência de identidades/fatos inventados. Não executar backfill ou mapeamento real da loja sem identidade/condições verificadas.
4. Conferir o único delta de bindings: o mesmo ACCOUNT_DB nas três configurações, separado de todos os bancos legados; no Auth, chave privada de criptografia. Configurações capturadas, segredos existentes, flags owner, domínio, cron e conexão da loja permanecem preservados.
5. Upload de versões inativas e assets, com gates de tamanho/hash/configuração; ativar na ordem compatível **Finance → Auth → App**, verificando após cada etapa o vetor ativo completo.

## Depois da ativação

Registrar commit/PR/CI, horários e IDs de deploy, hashes das fontes realmente servidas e os seis assets atuais/retidos. Conferir o domínio, páginas públicas de acesso, respostas sem sessão, console/rede e responsividade. Fluxos autenticados usam somente sessão autorizada disponível; ausência de sessão é registrada como `NOT_PERFORMED`, sem fabricar acesso ou considerar login público prova de todos os painéis.

Os registros finais devem ser anexados em `live-publication.json` e `public-live-verification.json`, com resultado e limites próprios. Esses arquivos não são presumidos por este documento inicial. Atualizar matriz, checkpoint e resumo após receber os recibos reais, mantendo dependências externas separadas.

## Recuperação

Manter versões/fontes/configuração/assets anteriores e o novo ACCOUNT_DB. Em regressão crítica, restaurar coordenadamente a configuração e o vetor compatível dos Workers/asset, verificando cada etapa e o domínio; nunca apagar os dados novos para voltar o código. A versão anterior mantém o acesso legado e ignora o banco novo; contas comerciais ficam indisponíveis durante esse rollback, com dados preservados para reaplicar a V4.1 corrigida. Restauração de banco e ensaios destrutivos são feitos em cópia, não na produção. O relatório final deve registrar qualquer recuperação executada; um plano sozinho não comprova restauração operacional.

## Histórico da CI e candidato corrigido

A primeira CI 43453964784 em c7f5ae8 falhou2/4106 nos perfis mobile de status. O local4106/67 anterior é preservado como histórico. A fonte corrigida `bdbc857ac443f58376613225dcbbfd02a108d41c` gera App `82fe3d3ecf19b0f72254dc5778e8a8335505bfc4db4071cc01afce4cfb7cea48` e possui gate focado4/4 aprovado; Auth/Finance permanecem no vetor registrado. A nova CI completa deve passar antes da ativação. Ver [registro e logs](ci-validation.json). Nenhuma migração/deploy é comprovada por este adendo.
