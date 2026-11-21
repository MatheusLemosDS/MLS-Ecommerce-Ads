# MLS Commerce OS — entrada de desenvolvimento

## Missão e retomada atual

Continuar a operação própria existente, preservando o design V4.1. A main
reconciliada é `dc784188e72c1a35dc014155e23c474b95b17cfe`, que integra PR130 e
PR131; conferir sempre o remoto antes de uma nova sessão. PR121 é histórica.
Este incremento implementa pagamentos parciais de produção por semana/prestador
e estoque físico de camisetas por tamanho/cor; compras, fila DTF e fechamento
integrados vêm depois, conforme os serviços comprovados.

O pedido atual não autoriza movimentação de dinheiro ou publicação externa.
Implementação local, testes, integração Git, publicação e aceite real têm estados
separados. Não tratar merge como deploy, nem testes sintéticos como aceite da conta.

Leia nesta ordem:
1. `docs/ROADMAP_MLS_COMMERCE_OS.md`: estratégia e ordem.
2. `docs/MLS_COMMERCE_OS_CHECKPOINT.json`: único checkpoint canônico atual.
3. `docs/MLS_CODEX_HANDOFF_2026_10_28.md`: apontadores de retomada.
4. O registro do incremento/domínio indicado no checkpoint.

O histórico integral anterior está preservado em
`docs/history/AGENTS_before_operating_increment_20261120.md`. Seus recibos e
restrições por PR continuam evidências no escopo/data descritos; instruções
históricas de checkout/merge não substituem o Git atual e o pedido vigente.
O checkpoint de missão antigo é referência histórica, não outra autoridade atual.

## Invariantes

- Preservar App/Auth/Finance (`brazacommerce-*`), bindings, D1, URLs, headers,
  cookies, isolamento por empresa/loja, autenticação, revisão e auditoria.
- Não apagar alterações locais, históricos ou branches do usuário; nada de reset
  destrutivo, limpeza indiscriminada ou force push. Não repetir merges históricos.
- Produto MLS Commerce OS; Hermes OBSERVER, Ads/PROMO LOCKED. Não conceder acessos,
  contornar consentimentos/grants ou transformar sugestões em escrita externa.
- Não movimentar dinheiro, efetuar PIX/saques/reembolsos/cobranças, comprar serviços,
  publicar em marketplaces, mudar preços/budgets/estoques externos, enviar mensagens
  ou reconectar OAuth sem a autorização específica aplicável.
- Nunca colocar tokens, callbacks, cookies, senhas, order_sn privados, dados de
  compradores ou arquivos pessoais em Git/logs/respostas. Usar fixtures sintéticas.
- Ausência de fonte é UNKNOWN/NOT_CAPTURED/PARTIAL/BLOCKED, nunca zero/COMPLETE.
  Não inventar lucros, estoque, taxas, preços, vendas, fatos físicos ou permissões.
- Separar vendas, fabricação, obrigação, pagamento declarado, liquidação bancária,
  recebíveis, carteira, trânsito, caixa e CMV. Não duplicar receita ou deduções.
- Custos históricos ficam preservados; custos atuais não comprovam preços antigos.
  Custo completo OU componentes conforme política vigente, sem somar os dois.
- Fabricação conserva sexta13h inclusiva → sexta13h exclusiva em America/Sao_Paulo.
  Vendas/financeiro mantêm os respectivos calendários civis e bases explícitas.
- Fechamentos originais e revisões são imutáveis; correções têm delta e auditoria.
  Retry não duplica fatos; CAS impede perda de alteração concorrente.
- Exportar DTF não comprova imprimir, fabricar ou consumir material. Kit/unidade
  comercial, peça física e estampa são quantidades diferentes. Arte ausente é
  pendência. Backup restaura pixels e vínculos, não apenas hashes.
- Estoque inicial exige contagem explícita; compra aberta/pagamento não prova
  recebimento. Reserva física não equivale à reserva de linhas DTF. Devolução exige
  recebimento/inspeção antes de disponibilidade. Não presumir estoque pelas vendas.
- Preservar Visão geral como entrada normal e destinos de links diretos válidos.
  Manter indicadores, gráficos, avatares, cores, temas e componentes V4.1; seis
  cartões entre indicadores e gráficos: Hermes, Finance, Ads, Products, Production,
  Returns. Auditor permanece no diretório. Não aplicar prévias exploratórias.
- Preservar datas, filtros, paginação, seleção, rascunhos e retorno ao navegar;
  restaurar contexto não repete gravação, pagamento, reserva ou exportação.
- M2/M2.2 e aceite financeiro real continuam abertos até confronto da conta com
  Seller Centre/banco e fatos físicos equivalentes. Bloqueios de venda ficam
  ADIADO_VENDA sem travar operação própria. Registrar dependência específica e
  continuar trabalho independente.
- Não reduzir/desativar testes, segurança, lista exata de hashes reconhecidos ou
  contratos válidos para obter CI verde. Toda exceção tem delta explícito e prova.
- Não copiar bibliotecas Shopee/ERP inteiras; revisar licença, contrato oficial,
  compatibilidade Workers, método, payload, escopo, região, paginação e limites.
  SDK/relato de fórum não comprova permissão; escrow batch tem divergências GET/POST.
- Hash de imagem identifica bytes; não comprova decodificação, direito autoral ou
  política do marketplace. Nenhum script publica na Shopee por padrão.

## Implementação e verificação

Usar Node24 e dependências fixadas. Acesso a novas tabelas exige estratégia de
isolamento e recuperação; worktree não isola bancos/storage/credenciais reais.
Novas leituras são SELECT-only e novos efeitos têm ação explícita, CAS e replay.
Migração destrutiva/incompatível exige restauração demonstrada antes da operação.

Gates do projeto:
```
npm ci
npm test
python3 -m unittest web/bridge/test_hermes_bridge.py tools/test_install_hermes_web_bridge.py tools/test_build_hermes_web_bridge_install.py tools/test_activate_hermes_web_bridge.py tools/test_build_hermes_web_bridge_activation.py -q
npm run build
```

Funções interpoladas em strings de cliente precisam entrar em
`web/cloudflare/build.py` (`freeze_client_helpers`) e ser verificadas no Worker
gerado. Preservar artefatos reconhecidos e adicionar novos hashes só após build
válido. UI alterada exige Chromium normal/minificado e móvel/desktop pertinente.
Reutilizar evidência válida; não repetir suítes amplas sem mudança ou preocupação.
Integração exige CI verde no SHA exato e compatibilidade dos três Workers.

Cada mudança visível atualiza APP_RELEASE e notas coerentes; o identificador não
prova deploy. Publicação só com autorização específica vigente, bytes/assets,
configuração/bindings/flags/cron, backup/rollback e QA exigidos; conferir a versão
real após cada etapa. Ferramentas de prévia não concedem autorização de produção.

Ao entregar: informar resultado concreto, acesso/uso, arquivos/commit/PR, testes e
alcance, estados IMPLEMENTADO/TESTADO/INTEGRADO/PUBLICADO/VALIDADO_REAL separados,
limitações e próximo comando. Atualizar o único checkpoint canônico e apontadores
no roadmap/handoff; preservar históricos. Ao interromper, salvar o ponto exato de
continuação. Não encerrar só em análise quando houver implementação autorizada.
