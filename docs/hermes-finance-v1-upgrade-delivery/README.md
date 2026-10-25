# Atualizar a ponte Hermes financeira pelo console web

Publique primeiro o Worker `brazacommerce-app` que aceita `hermes-finance-v1` e aguarde este instalador estar disponível no GitHub. Abra o console web root do Droplet na DigitalOcean. Não é necessário SSH nem informar novamente a chave: a configuração privada existente é reutilizada.

Cole **um único comando**, abaixo ou em [console-fetch.txt](console-fetch.txt):

```bash
/usr/bin/python3 -I -S -B -c 'import sys,hashlib,urllib.request as r; n=type('"'"'NoRedirect'"'"',(r.HTTPRedirectHandler,),{'"'"'redirect_request'"'"':lambda *a:None}); o=r.build_opener(r.ProxyHandler({}),n()); s=o.open(r.Request('"'"'https://raw.githubusercontent.com/MatheusLemosDS/MLS-Ecommerce-Ads/main/tools/install_hermes_web_bridge.py'"'"',headers={'"'"'Accept'"'"':'"'"'text/plain'"'"'}),timeout=20); b=s.read(65537); s.close(); (len(b)<=65536 and hashlib.sha256(b).hexdigest()=='"'"'07ca0661334c359b6ed93949f19a5b45f0e39b78980d70fcd4bb1a8feba6bdf4'"'"') or sys.exit('"'"'BRIDGE_INSTALLER_DOWNLOAD_INVALID'"'"'); sys.argv=['"'"'bridge-upgrade'"'"','"'"'--upgrade'"'"','"'"'--restart'"'"']; exec(compile(b,'"'"'<verified-hermes-finance-upgrade>'"'"','"'"'exec'"'"'),{'"'"'__name__'"'"':'"'"'__main__'"'"'})'
```

O comando usa Python isolado, baixa somente a URL HTTPS fixa do repositório, desativa proxies/redirecionamentos e lê no máximo 65.537 bytes. Antes de compilar ou executar, exige o SHA-256 exato do instalador: `07ca0661334c359b6ed93949f19a5b45f0e39b78980d70fcd4bb1a8feba6bdf4`. Uma alteração em `main`, resposta HTML ou download incompleto é recusado antes da execução. Não há autenticação GitHub ou dados de clientes nesse download.

O programa então executa `--upgrade --restart`:

1. Valida o arquivo privado de configuração e a unit existentes, sem alterar seus bytes ou pedir/imprimir a chave.
2. Bloqueia novas tarefas por uma manutenção de 120 segundos e exige `safe_to_restart:true`. Se já houver execução, retorna `BRIDGE_EXECUTION_IN_PROGRESS` antes de substituir arquivo ou reiniciar serviço.
3. Aceita apenas a ponte anterior revisada (`e49a9bfd4ef310d0938b0f6b253dac498aa7b9abd4c03f368de234546aaededd`) ou a versão nova idêntica. Uma versão personalizada é preservada e recusada.
4. Preserva `/opt/brazacommerce-hermes-bridge/hermes_bridge.py.pre-finance-v1`, grava staging no mesmo diretório, verifica sintaxe/runtime como `hermes-mls` e substitui o arquivo de forma atômica. Em falha posterior, tenta restaurar o backup e reiniciar a versão anterior.
5. Renova a manutenção antes do restart explícito e confere o serviço ativo. Libera a manutenção no final; se a rede impedir a liberação, ela expira em 120 segundos. Nenhuma tarefa é reenfileirada.

Esperado: JSON com `stage:"BRIDGE_UPGRADED"` (ou `BRIDGE_ALREADY_UPGRADED`) e `BRIDGE_RUNTIME_FLAGS_OK`. Essas saídas só ocorrem depois da verificação do restart. Aguarde até um minuto e confira a conexão no painel antes de solicitar a primeira análise financeira. O resultado real no painel ainda precisa dessa aceitação no Droplet.

O arquivo novo da ponte tem SHA-256 `ed0408b611516ff76a711aaac98253b1b3ceabade6bbe635913f8432ab30f9ff`. O pacote mantém Ads LOCKED, gateway/perfis intocados e não executa uma análise durante a instalação. O runtime requer Python com `zoneinfo` e os dados de fuso `America/Sao_Paulo`; o `--check` verifica a importação antes de anunciar sucesso. Não há instalação automática de dependências.

Se o download não estiver disponível, use como alternativa os oito arquivos `console-part-1.txt` até `console-part-8.txt`, nessa ordem. Eles executam o mesmo programa com a mesma verificação, sem baixar a fonte. Cole os conteúdos, sem nomes de arquivo ou cercas Markdown; o prompt `>` antes da última parte é esperado. Use um dos meios, sem repetir ambos.

Se aparecer erro, preserve o backup e envie somente o código de diagnóstico. Não envie a configuração privada, chaves ou transcrições de tarefas. Em `BRIDGE_EXECUTION_IN_PROGRESS`, aguarde a execução existente terminar antes de repetir a atualização; não repita a análise.

Validação local: 45 testes de instalação, atualização, manutenção, ativação e transferência passam com arquivos/processos/HTTP de fixture. O comando rápido foi testado sem download ou execução real. A fonte, os hashes e as partes estão neste diretório para revisão. As entregas antigas permanecem preservadas e não são usadas por este pacote.
