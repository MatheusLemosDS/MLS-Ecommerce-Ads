# Entrada e navegação unificadas

A entrada principal passa a ser `/login`. O proprietário usa o mesmo usuário e
senha administrativos já configurados. A sessão permite abrir o resumo da
loja, produtos, custos e anúncios sem pedir outro login. O endereço antigo
`/admin/login` permanece como compatibilidade para links e formulários antigos.

O acesso de revisão dos anúncios continua disponível na mesma tela, com as
credenciais de revisão existentes. Esse acesso não recebe permissões de
administração, informações financeiras privadas ou autorização para gravar
custos. A união da entrada não transforma uma conta de revisão em proprietário.
Não é necessário cadastrar novas variáveis, chaves, senhas ou bancos.

## Navegação da loja

As áreas principais compartilham nomes, ordem, ícones e destaque da página ativa:

- **Visão geral:** vendas pagas do mês, custo estimado de produção, imposto,
  anúncios, despesas e resultado líquido previsto.
- **Produtos:** catálogo, variações e exceções de composição e custo.
- **Anúncios:** investimento, vendas atribuídas, ROAS e acesso às campanhas.
- **Custos:** cadastro do perfil de produção e conferências financeiras.
- **Automação:** metas, critérios e recomendações para a próxima etapa.

Conexões, análises do Hermes, histórico e plano ficam nas opções secundárias.
O acesso de revisão mostra somente as áreas de anúncios permitidas.

No celular, as áreas principais ficam na barra inferior. As opções adicionais,
o tema e a saída ficam no cabeçalho. Os temas claro e escuro continuam usando
a preferência já salva no navegador.

## Organização dos valores

A visão geral começa pelo mês escolhido e pelos quatro indicadores principais.
A explicação do resultado mostra repasse, produção, imposto, anúncios e outras
despesas. Valores faltantes indicam a conferência necessária. Produtos ficam
em uma lista com busca, filtros, ordenação e paginação.

Diagnósticos e referências avançadas permanecem disponíveis em áreas
recolhidas. O saldo de pedidos exclusivos por produto continua separado do
líquido previsto da loja; pedidos mistos não recebem rateio presumido. O custo
de produção usa as unidades vendidas e o perfil atual, sem se apresentar como
registro de fabricação efetiva.

## Sessões e compatibilidade

Sessões administrativas válidas anteriores continuam aceitas. Elas também
passam a abrir os anúncios. Sessões de revisão válidas continuam restritas às
áreas de revisão, com verificação de usuário, assinatura e validade.

As operações administrativas mantêm exigência de origem e token CSRF. A saída
invalida os dois cookies do navegador e exige POST com CSRF. Abrir `/logout`
por GET apresenta confirmação, sem encerrar a conta silenciosamente.

As mudanças são geradas no Worker App sem modificar os Workers originais
congelados, o contrato financeiro ou a execução de campanhas. Os testes usam
respostas simuladas; publicar o commit no Git não comprova que o build já
ficou ativo no Cloudflare.
