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
