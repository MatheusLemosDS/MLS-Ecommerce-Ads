# Primeira instalação do arquivo da ponte financeira

Use esta entrega somente quando `/opt/brazacommerce-hermes-bridge/hermes_bridge.py` ainda não existe. Para a ponte já instalada, use [a atualização](../hermes-finance-v1-upgrade-delivery/README.md).

No console web root da DigitalOcean, cole os conteúdos de `console-part-1.txt` até `console-part-8.txt`, na ordem. Não cole nomes de arquivo nem cercas Markdown. O prompt `>` até a última parte é esperado. A verificação do programa inteiro ocorre antes da execução.

O instalador usa apenas Python padrão, valida o pacote e cria o arquivo root-owned modo 0644 na pasta modo 0755. Depois executa `--check` como `hermes-mls` UID 1000. Esperado: `BRIDGE_INSTALLED` (ou `BRIDGE_ALREADY_INSTALLED`) e `BRIDGE_RUNTIME_FLAGS_OK`. Um arquivo diferente é preservado e recusado. Esta etapa não configura credenciais, não inicia serviço, não executa análise e não altera Ads/gateway/perfis.

Após sucesso, publique o Worker com `hermes-finance-v1` e use [a ativação](../hermes-finance-v1-activation-delivery/README.md). A fonte legível da ponte, o instalador e o manifesto estão neste diretório. A confirmação do runtime e da conexão exige a execução no Droplet real.
