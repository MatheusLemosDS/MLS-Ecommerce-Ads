# M2 — Pending, pendências do Hermes e preparação do fechamento

Pedido do proprietário de 31/10/2026: corrigir o detalhamento Pending e validar a lista antes de paginação; consolidar pendências financeiras para o Hermes; preparar o fechamento de um mês; simplificar a navegação no estilo navy/neon aprovado.

## Etapa 1 — diagnóstico da falha

Candidato sobre main PR91 `8b0edb28`. A leitura Live de 16:36:58 Brasília confirmou os três Workers e configurações atuais, Pending Overview de R$ 8.375,15 e ausência de lista válida. A causa não estava no registro: Finance, Auth e App substituíam a falha upstream por códigos genéricos.

Correção preparada: vocabulário fechado de estágio/HTTP/código do provedor/formato estrutural, projeção segura nos três Workers, tabela lateral aditiva associada à tentativa exata, preservação do DTO v1 e último resultado válido. A API owner aceita `income-detail?evidence=diagnostic-v1`; a leitura padrão permanece compatível. Nenhum corpo, mensagem arbitrária ou identidade de pedido entra no erro.

POST, assinatura e corpo foram conferidos com os contratos públicos pesquisados. Método/datas e cursor da requisição permanecem iguais. Não há paginação nova; uma lista sem metadados de completude continua exigindo validação antes da próxima etapa. O diagnóstico publicado deve ser observado em tentativa natural para corrigir a causa concreta, sem forçar jobs ou alterar cursores.

## Sequência autorizada

1. Publicar o diagnóstico validado nos três Workers e observar o motivo real; corrigir a causa e validar os pedidos retornados.
2. Reutilizar o painel de conciliação para uma lista consistente de motivos, quantidade, valor conhecido informativo, fonte e próxima ação; disponibilizar o mesmo contrato ao Hermes.
3. Preparar checklist de repasses, devoluções, produção, anúncios e despesas com a mesma publicação mensal. Seller Centre e banco permanecem NÃO COMPARADOS até existir evidência real.
4. Integrar a navegação revisada depois da validação financeira: uma navegação global estável, atalhos funcionais, detalhes acessíveis e testes Chromium desktop/mobile.

## Publicação e proteção

A autorização Live é persistente. A exceção de caminhos protegidos cobre apenas os arquivos literais desta correção Pending, sem liberar outros arquivos Finance/Auth, infraestrutura ou originais. Hashes exatos dos três Workers e configurações, flags, cron, backups e rollback devem ser conferidos antes/depois. Escritas comerciais continuam bloqueadas. A prévia visual permanece sintética.

Status: candidato de diagnóstico em validação; ainda sem publicação deste incremento. M2, validação de Pending e fechamento bancário continuam abertos.
