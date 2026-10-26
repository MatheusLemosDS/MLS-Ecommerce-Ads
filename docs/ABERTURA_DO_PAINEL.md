# Recuperação da abertura do painel

Uma falha durante a abertura podia deixar o mês vazio e mostrar `Failed to
fetch`. O fluxo aguardava sessão, auditoria, status e vários módulos antes de
iniciar a Visão geral. Foi possível reproduzir o bloqueio com uma falha na
sessão ou na auditoria e com uma consulta secundária que nunca terminava.
Isso explica um mecanismo compatível com a imagem recebida; a requisição exata
que falhou no celular não foi observada diretamente.

## Comportamento atual

- O seletor recebe o mês de Brasília, ou um mês válido da URL, antes das
  consultas. Valores financeiros continuam pendentes até uma resposta validada.
- A confirmação da sessão usa `GET /api/admin/bootstrap`, que valida o cookie
  assinado e devolve somente `admin_bootstrap_v1` e o CSRF existente, sem acessar
  o D1. Somente essa confirmação é requisito para iniciar o resumo. Auditoria,
  configurações, Ads, produtos, produção e demais módulos carregam de forma
  independente; suas falhas não impedem a consulta financeira.
- A leitura completa de `/api/admin/state` ocorre em segundo plano. Os controles
  de configuração ficam desabilitados até receber valores válidos; falhas não
  substituem os valores por padrões. Reabrir Custos de produção ou usar
  Atualizar status no Hermes permite uma nova tentativa, compartilhada quando
  outra já estiver em andamento. Configurações já carregadas não são relidas
  nessa ação, preservando os rascunhos de edição.
- A leitura inicial da sessão tem prazo de doze segundos. Uma falha de rede ou
  timeout sem erro HTTP permite uma única repetição, após 750 ms e com a página
  visível. Uma interrupção do corpo de uma resposta 2xx também pode repetir.
- Se continuar indisponível, o painel oferece **Tentar novamente**. Uma sessão
  expirada oferece **Entrar novamente**; 401/403 não geram repetição automática.
- Erros de transporte aparecem em português, sem detalhes brutos da resposta,
  tokens ou HTML de terceiros. Os prazos incluem a leitura do JSON: 45 segundos
  para GET e 90 segundos para POST por padrão, com limite próprio para a sessão.
- POST não é repetido automaticamente pelo transporte. Uma falha depois do envio
  não comprova que uma gravação deixou de acontecer no servidor.

Inicializações simultâneas compartilham uma tentativa. Respostas antigas não
reiniciam módulos depois de parar a sessão. Uma saída só interrompe os painéis
após confirmação HTTP: falha de rede, recusa ou timeout do logout preserva a
interface e informa que a saída não foi confirmada.

## Verificação

Os testes executam os scripts reais de administração e do resumo emitidos pelo
Worker compilado, com e sem minificação. Cobrem auditoria indisponível,
carregamentos secundários suspensos, abertura offline, repetição limitada,
recuperação manual, sessão expirada, falha na apresentação das configurações e
logout não confirmado. Nenhum cenário recebe valores financeiros inventados.

Disponibilidade pública de `/health` e `/login` não comprova a conexão de cada
requisição autenticada no aparelho. A recuperação permite tentar novamente sem
deixar o resumo permanentemente em “Preparando os dados”.

## Limite diário do D1 — 26/10/2026

O bloqueio de gravações do D1 foi confirmado por alertas da conta em dois ciclos
diários consecutivos. Em 26/10, os avisos registraram 76% às 04h04, 94% às 05h26
e limite excedido às 06h23, em Brasília. São horários dos avisos, não medições
diretas do instante de cada operação. A cota gratuita de 100 mil linhas gravadas
é compartilhada pelos bancos da conta; acessos ao Worker não equivalem a linhas
gravadas. Uma única coleta pode ler ou gravar várias linhas.

A inicialização autenticada acessa o banco e pode executar a preparação do
armazenamento. Antes desta correção, uma exceção de cota nessa etapa virava
`ADMIN_UNAVAILABLE` e a interface sugeria verificar a conexão. O servidor agora
reconhece apenas as mensagens canônicas do D1 para limites diários de leitura e
gravação e devolve `ADMIN_DB_DAILY_LIMIT_EXCEEDED`, com HTTP 503. Detalhes do erro,
SQL e causas internas não são enviados ao navegador. O painel informa o limite
do banco e a renovação diária às 21h de Brasília; mantém a tentativa manual,
inclusive para permitir recuperação após mudança de plano. Não repete a leitura
automaticamente por causa de um 503.

A fila de classificação também deixa de atualizar `next_attempt_at=0` quando
o item prioritário já tem esse valor. A promoção de um item com tentativa
agendada continua funcionando. Isso elimina uma gravação redundante confirmada
em teste, mas não mede sua participação no consumo real nem demonstra que toda
a operação cabe na franquia gratuita.

Publicar essas correções não renova a cota consumida. A recuperação do serviço
depende da renovação diária ou da alteração do plano da conta, seguida de uma
consulta autenticada bem-sucedida. Otimizações de outros pontos da coleta
dependem de medição por banco e rotina. Esta correção preserva a frequência da
coleta e os dados financeiros.

Referências: [preços e renovação do D1](https://developers.cloudflare.com/d1/platform/pricing/)
e [erros documentados do D1](https://developers.cloudflare.com/d1/observability/debug-d1/).

## Demora na confirmação da sessão — 26/10/2026

Após a publicação da PR #7 (`f16bb1f`), o operador enviou um print com
**“A consulta demorou mais que o esperado. Tente novamente.”** no topo e
**“Aguardando consulta”** no resumo. A página autenticada e os scripts haviam
aberto; o fluxo da interface associa essa mensagem ao timeout da confirmação
inicial. O resumo mostrava uma segunda mensagem, incorreta para esse caso,
que sugeria verificar a conexão.

O caminho anterior usava `/api/admin/state`, com prazo de doze segundos, para
confirmar a sessão. Antes de devolver seu JSON, essa rota aguardava `setup()`.
Em uma instância nova, mesmo com um banco já existente, a medição local encontrou
um batch de 97 statements, outro de 2 para consultar correções e quatro leituras
sequenciais de configurações, heartbeat, capacidades e orçamento do Hermes.
O cache de inicialização é local ao processo e não impede esse trabalho em
outra instância. Esse caminho já existia antes da PR #7.

A reprodução controlada suspendeu a preparação do banco e obteve o mesmo erro
de timeout, mantendo login e HTML disponíveis. Isso comprova o bloqueio no
código; **não mede a latência real do D1 nem identifica o motivo do atraso na
requisição privada do celular**.

A correção separa a sessão das leituras de configuração:

- `/api/admin/bootstrap` fica depois da autenticação do proprietário e antes
  de `setup()`. Não lê nem grava no banco, não chama provedores e não renova o
  cookie. Exige GET sem parâmetros e responde com `Cache-Control: no-store`.
- O resumo inicia sua própria leitura após essa confirmação. Uma resposta
  lenta de configuração ou Hermes deixa de impedir o início do resumo.
- `/api/admin/state` mantém o contrato anterior. Sua resposta tardia é
  descartada após logout confirmado; uma saída que falha preserva a sessão.
- A interface compartilha apenas uma categoria pública de falha com o resumo:
  demora, rede, sessão, cota, indisponibilidade ou resposta inválida. As mensagens
  brutas da infraestrutura continuam excluídas. Atualizar vendas fica
  desabilitado enquanto a confirmação inicial não termina.

Há **uma requisição HTTP leve adicional por abertura bem-sucedida**, sem novas
consultas SQL, chamadas à Shopee ou agendas de coleta. A leitura de estado
anterior continua existindo em segundo plano. Isso não constitui uma medição
de economia nem uma projeção da fatura do Cloudflare.

Os testes cobrem a sessão enquanto o mesmo banco está bloqueado na preparação,
permissões e CSRF, os nove scripts reais da página em ordem, versões normal e
minificada, configuração pendente ou inválida, retomada manual, descarte de
respostas depois de sair e preservação de rascunhos. O D1 continua necessário
para carregar os dados financeiros: sua indisponibilidade deve aparecer na
consulta correspondente, sem ser confundida com falha na confirmação da sessão.
