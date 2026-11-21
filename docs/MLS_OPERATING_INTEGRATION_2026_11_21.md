# Integração operacional e custos históricos — 21/11/2026

A PR133 foi integrada na main em `426b1de037b075afa066ace4742e3cf398294bbf`, com 4/4 checks e 4.963 Node/67 Python. A PR132, já validada isoladamente com 5.003 Node/67 Python, foi reconciliada com essa main. A nova combinação preserva a composição financeira dos kits numerados, o contrato histórico v6, pagamentos semanais parciais auditados e estoque físico de camisetas por tamanho/cor.

Conflitos de documentação preservam os dois registros. Empacotamento reúne os helpers, notas da versão e assets de ambos os incrementos. Os verificadores anteriores continuam protegidos por provas de preservação exatas; o gate operacional exige a nova base, inventário e hashes do candidato, sem autorização de publicação.

## Uso

- **Visão geral:** o resultado diário exige custos históricos comprovados; subtotal parcial aparece separado e não vira lucro completo. Alterar custos atuais não aprova preços antigos.
- **Produção → Pagamentos semanais:** declarar a obrigação de uma semana/prestador, conferir a prévia da aplicação às obrigações mais antigas e registrar somente pagamento já realizado. Nenhuma transferência é executada e nenhuma despesa é duplicada.
- **Produção → Camisetas físicas:** cadastrar tamanho/cor/modelagem/material, conferir a contagem inicial e registrar somente recebimentos reais. Reserva e consumo são fatos diferentes; exportar DTF não confirma consumo ou fabricação. Saldo inicial sem contagem continua desconhecido.

## Validação e estados

O único checkpoint é `docs/MLS_COMMERCE_OS_CHECKPOINT.json`; a evidência deste incremento é `financial-automation/validation/operating-integration-20261121.json`. O estado atual de CI e integração usa o HEAD da [PR132](https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/132), evitando tratar um recibo isolado anterior como aprovação da união. Foram concluídos 77 testes focados de histórico, kits, journal, estoque e pagamentos; também passaram 81 verificações dos gates e 24 testes de build/interface, incluindo oito perfis Chromium normais/minificados de 320/1365px e 36 capturas. A suíte completa combinada exige o resultado final da CI no HEAD exato.

A Live17.3 permaneceu com os três Workers, vetores, rotas e configurações idênticos na leitura GET após o merge133. Integração Git não é publicação. Não houve compra, pagamento, escrita em dados financeiros ou criação de fatos físicos reais. Aceite histórico de11/11 e M2/M2.2 continuam parciais/abertos.

## Próxima ação executável

Após o verde no SHA exato e a integração validada da132, ligar pedidos salvos, composições físicas aprovadas, estoque e recebimentos a necessidades por tamanho/cor, reservas atômicas, lista de faltas/compras e disponibilidade DTF. Compartilhar as mesmas fontes com Hermes, Finance, Products e Production; não presumir quantidade, prazo, custo, fornecedor ou estoque ausente.

A primeira CI combinada,44895273590, executou5.061 testes Node:5.053 passaram e8 perfis do teste de descoberta das notas falharam por esperar a ordem anterior dos links. A lista explícita foi reconciliada com o link da Visão geral e ganhou verificação adicional de que Finance continua acessível. Nenhuma verificação foi removida, e nenhum runtime financeiro mudou. A integração continua condicionada à nova CI completa aprovada.
