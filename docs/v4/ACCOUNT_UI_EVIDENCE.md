# Evidência da interface de contas — local sintético

O cliente final observado tem SHA-256 `5d4f02fbe4b205910e70e582120116e1dbec6eab44e6d09c8344159ff15e9639`; a view tem `3ddb6f1233e34492eea76ca0481e032aaf2bf5948858538ea67c1f4f8c9de980`. O [histórico completo do responsável](evidence/account-ui-history.md) preserva os hashes e resultados anteriores; versões antigas naquele histórico não são a fonte final.

| Execução | Resultado | Alcance e versão |
| --- | --- | --- |
| [Suite de segurança completa](evidence/account-ui-security.log) | 9/9, sem skips/falhas | Quatro perfis normal/minificado ×320/1365, dois teardowns normal/minificado, três testes de rotas/view. Cliente `cefa72cc…` anterior ao único ajuste posterior de limpeza explícita de campos revelados/pre. |
| [Repetição da fonte final](evidence/account-revealed-secret-final.log) | 3/3, sem skips/falhas | Jornada profunda normal320 e teardown normal/minificado no cliente `5d4f02fb…`. Confere referência de senha revelada e recovery pre apagadas antes de remover/navegar. |

Os testes usam Chromium nativo e o backend real de conta com SQLite local. Apenas relógio, entrega em outbox de teste e custo de KDF do fixture de navegador são substituídos; cookies, CSRF, Origin, SQL, revisões e autorização vêm da implementação. Não há resposta de negócio simulada no percurso principal. E-mail, cobrança e OAuth reais não são acionados.

As jornadas cobrem cadastro/verificação local, login, persistência de perfil/preferências/empresa, onboarding com loja e URLs explícitas, resposta incerta após commit com repetição idempotente, convites/membership e capacidades efetivas/escopo de loja, revogação, reauth, MFA e recovery codes. A confirmação de MFA tem também um gate de orçamento SQL do Auth compilado separado em [integration-evidence.json](integration-evidence.json); navegador aprovado não encerra esse gate.

A limpeza final remove dados pessoais e empresariais, rascunhos, comandos pendentes, DOM/nav e segredos. `401` protegido limpa/bloqueia inclusive com JSON truncado; erro de credencial/fator permanece editável. Login/logout/LOCKED por BroadcastChannel invalida a interface. Logout incerto faz um POST e mantém estado bloqueado sem anunciar confirmação. A tela de recovery codes permite somente os dez códigos e sua dispensa; não conserva navegação, formulários ou segredo de enrollment.

Os comandos exatos, logs e hashes estão na [matriz](functional-coverage.json) e no [registro de integração](integration-evidence.json). A UI com SQLite local não comprova sozinha o App/Auth completos publicados, infraestrutura, orçamento de CPU, entrega real, migração ou Live.
