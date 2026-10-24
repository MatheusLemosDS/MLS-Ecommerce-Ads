# Produção e montagem DTF

O módulo **Produção** reúne a fila privada de pedidos, a biblioteca de artes
do navegador, a prévia e o histórico dos lotes. A largura útil de **57 cm** e
o exemplo **`vivaosanos80-27`** foram confirmados pelo operador.

## Primeiro uso

1. Abra **Produção** no computador que usará para baixar as impressões.
2. Importe os PNGs finais em **Artes salvas neste dispositivo**. Para o exemplo,
   o arquivo se chama `vivaosanos80.png`. A extensão e as dimensões são
   conferidas; nomes iguais com conteúdos diferentes não se substituem.
3. Confira as pendências reais da operação no primeiro uso: o sistema não sabe
   quais pedidos já tinham sido impressos antes da instalação do módulo.
4. Use **Selecionar aptos**, **Montar prévia** e **Reservar lote**. A seleção
   automática respeita os limites do lote, deixando o restante para o próximo.
5. No lote reservado, use **Exportar PNGs** e baixe as folhas. Cada download
   consulta novamente a situação dos pedidos. Imprima no tamanho real no RIP.
6. Depois da impressão, use **Marcar produzido**. A linha permanece associada
   ao lote; atualizar a página não cria outra reserva dessas mesmas peças.

As artes ficam em IndexedDB, **neste navegador e dispositivo**. A conta guarda
os pedidos, as reservas, os hashes e o histórico, não os pixels dos arquivos.
Outro navegador precisa importar as mesmas artes. Limpar os dados do site
remove a biblioteca local; reimportar os mesmos PNGs recupera a exportação de
um lote cujo estado ainda permita baixar. Os arquivos originais devem ser
mantidos na pasta de artes do operador.

## SKU, dimensões e kits

- `vivaosanos80-27` procura `vivaosanos80.png`, com largura de **27 cm**.
- O último hífen separa o nome da largura. `nome-da-arte-27,5` significa
  **27,5 cm**. A precisão aceita é de um milímetro.
- A altura de impressão segue a proporção original do PNG. Somente a caixa de
  ocupação no filme é arredondada para cima ao milímetro; os pixels não são
  esticados para preencher esse arredondamento.
- `frente-27+costas-10` declara duas impressões por unidade vendida. A quantidade
  do pedido multiplica cada parte exatamente uma vez.
- Kits já identificados como uma peça masculina e uma feminina exigem ao menos
  duas partes explícitas, por exemplo `arte-27+arte-25`. Não se presume que as
  duas peças tenham a mesma estampa ou largura.
- Um SKU individual descreve uma impressão por unidade. O sistema não descobre
  quantas estampas um produto desconhecido contém pelo título. O cadastro deve
  declarar todas as partes. Kits mistos com uma peça sem estampa ainda exigem
  uma regra específica; não são tratados como duas impressões por adivinhação.
- `sem-estampa` não gera DTF. SKU ausente, arte ausente, composição de kit
  incompleta ou resolução insuficiente ficam fora do lote.

O SKU consultado é o da **variação vendida**. Somente um produto sem modelo
(`model_id=0`) pode usar o SKU do item quando não houver SKU do modelo. Não há
busca aproximada nem substituição silenciosa de uma arte por nome parecido.

## Filme e arquivos

O formato inicial usa largura útil de **570 mm**, comprimento máximo de folha
de **500 mm**, margem de **5 mm**, espaçamento de **5 mm** e **300 DPI**, sem
rotação. Comprimento, espaçamento, margens, resolução e rotação podem ser
alterados em **Formato do filme e qualidade**, com versão e auditoria.

Margens são descontadas da largura útil. O empacotamento é determinístico e
mantém caixas e espaçamentos sem sobreposição. A rotação só ocorre quando
habilitada; a imagem mantém a proporção. A resolução nativa precisa sustentar
a largura pedida no DPI configurado. Ampliar a imagem ou apenas mudar seu DPI
não cria detalhes ausentes.

A saída é PNG transparente, com tamanho físico no bloco `pHYs`, mais um
manifesto JSON que identifica o lote, as artes e suas posições. Não há
espelhamento, criação de tinta branca ou perfil de cor da impressora; esses
ajustes pertencem ao fluxo habitual do RIP. O arquivo usa a arte final recebida,
sem remover fundo nem gerar uma nova imagem.

Limites explícitos: 100 linhas, 50 pedidos, 300 impressões, 20 folhas e
50 milhões de pixels por folha. Uma única linha é reservada com toda sua
quantidade; divisão parcial da quantidade de uma linha ainda não é oferecida.
Aumentar o comprimento configurado pode ser útil para lotes maiores, respeitando
o limite de memória. Falhas de memória não liberam outra reserva: retoma-se o
mesmo lote existente.

## Pedidos, cancelamentos e concorrência

A coleta consulta primeiro as vendas de hoje por data de criação em Brasília,
com paginação completa. Em cada ciclo, importa também um dia anterior,
percorrendo gradualmente os últimos 15 dias. Isso evita que o volume acumulado
esgote a paginação antes de trazer o trabalho de hoje. Também revisita até 50
pedidos já conhecidos e pendentes por ciclo, priorizando os menos recentes. Não
descobre pedidos anteriores a essa janela que nunca foram importados.

Somente `READY_TO_SHIP`, `PROCESSED` e `RETRY_SHIP` podem entrar na produção.
Não pagos, em cancelamento, cancelados, enviados, concluídos e estados
desconhecidos são bloqueados. A fila mantém identidade estável por pedido e
linha; não é reconstruída dos totais financeiros ou das conversões de Ads.
Dados de comprador e endereço não entram no módulo.

Reservar e exportar consultam novamente todos os pedidos do lote. Uma resposta
ausente, antiga ou incompatível bloqueia a operação. Quantidade, SKU, composição
e configuração usados no lote ficam congelados. Respostas antigas não
ressuscitam cancelamentos. Versões contraditórias com o mesmo horário de
alteração na Shopee ficam bloqueadas até haver uma versão posterior coerente;
alterar apenas a regra local de composição não cria esse conflito de origem.

Reservas e auditorias são gravadas atomicamente. Duas sessões não conseguem
reservar a mesma linha em lotes diferentes; repetir a mesma requisição retorna
o lote original. Um lote `PREPARED` pode ser desfeito. Um lote `EXPORTED` mantém
a reserva, inclusive se a transferência do arquivo falhar, pois o sistema não
pode afirmar que ele não foi impresso. Nova exportação usa a mesma reserva e
verifica novamente os pedidos. Reimpressão intencional e baixas de fabricação
anteriores à instalação não são automatizadas nesta entrega.

O agendamento do App consulta a fila após a coleta financeira, respeitando a
pausa da coleta e mantendo lease próprio. Falha no DTF não altera os totais
financeiros. A tela também atualiza a fila quando está visível, sem consultas
sobrepostas. Fonte indisponível preserva a última fila; não a transforma em
uma lista vazia nem libera download sem nova verificação.

## Relação com os custos e publicação

O comprimento do lote é operacional. **Não há desconto financeiro adicional
de DTF**: os custos completos por peça já podem incluir estampa. Integração de
consumo real, preço por metro, perdas e estoque de filme exige cadastro próprio
e conciliação antes de alterar o custo ou o resultado financeiro.

A entrega envolve **App, Auth e Financeiro no mesmo commit**. Usa os bancos e
as credenciais existentes, sem novo binding de armazenamento de imagens.
O acesso de revisão de anúncios não recebe a fila ou as artes do proprietário.
Testes simulam fontes e geração do PNG; não comprovam deploy ativo, permissões
reais da API nem calibração da impressora. A primeira folha física deve ser
conferida no tamanho real antes de ampliar a operação.
