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
- Somente a sessão com CSRF válido é requisito para iniciar o resumo. Auditoria,
  configurações, Ads, produtos, produção e demais módulos carregam de forma
  independente; suas falhas não impedem a consulta financeira.
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
