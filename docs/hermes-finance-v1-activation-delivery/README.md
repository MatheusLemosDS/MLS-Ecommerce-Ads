# Ativar ou revalidar a ponte financeira instalada

Para atualizar uma ponte antiga já configurada, prefira [o comando único de atualização](../hermes-finance-v1-upgrade-delivery/README.md), que também reinicia o serviço. Esta entrega serve à primeira configuração de uma ponte financeira já instalada ou à revalidação explícita do serviço.

Publique primeiro o Worker com `hermes-finance-v1`. No console web root da DigitalOcean, cole `console-part-1.txt` até `console-part-4.txt`, nessa ordem, sem nomes de arquivo ou cercas Markdown. O comando inclui `--restart` explicitamente.

Se o arquivo privado de configuração já existe, ele é validado e reutilizado sem pedir ou alterar a chave. Na primeira configuração, o programa solicita `HERMES_BRIDGE_SECRET` por entrada oculta; use o mesmo valor do Worker, sem aspas, diretamente no console. Não envie a chave no chat. Sem entrada oculta segura, a ativação falha antes de gravar o valor.

O programa confere a fonte/runtime, negocia o protocolo e bloqueia novos claims durante a manutenção de 120 segundos. Um job em execução impede configuração/restart. Após a confirmação de ociosidade, cria somente os arquivos ausentes revisados, com env root:GID 1000/modo 0640 e unit root/modo 0644. Arquivos diferentes ou symlinks são preservados e recusados. Reinicia explicitamente apenas `brazacommerce-hermes-bridge.service`, como `hermes-mls` UID 1000/GID 1000, e libera a manutenção ao terminar. A manutenção expira em 120 segundos se a rede impedir a liberação.

Esperado: `BRIDGE_FINANCE_PROTOCOL_OK / ADS LOCKED` e `BRIDGE_SERVICE_ACTIVE`. Aguarde até um minuto e confira a conexão e uma solicitação manual no painel. Serviço ativo não comprova, sozinho, que a análise real concluiu. Não há execução do modelo no preflight; depois da liberação, o serviço pode atender tarefas já autorizadas na fila e consumir créditos.

Fontes e manifesto estão neste diretório. 45 testes locais de packaging passam sem HTTP/systemd reais; nenhuma alteração foi feita no Droplet durante a preparação desta entrega. Gateway, perfis e anúncios permanecem inalterados.
