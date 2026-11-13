# MLS V4.1 — cobertura e evidências

A instrução atual autoriza implementar, validar e publicar no domínio existente após os gates aplicáveis. Os documentos abaixo separam o que foi inventariado, implementado, validado, publicado e observado no site. O código foi publicado e conferido no escopo técnico/público registrado. O estado de cada requisito permanece na matriz; publicação não significa prontidão comercial ou QA autenticado Live.

- [Entradas e hashes](input-manifest.json): cinco arquivos V4.1 com bytes preservados; a V4 anterior permanece em [input-history](input-history/).
- [Inventário inicial](BASELINE_INVENTORY.md) e [composição/ações](baseline-active-inventory.json): base a5 compilada, owner/review, flags independentes e acesso público sintético, antes do redesign.
- [Matriz funcional](functional-coverage.json): 233 requisitos e 22 famílias de gráfico, com estados e evidências independentes.
- [Decisão de arquitetura](ARCHITECTURE.md), [armazenamento](TENANT_STORAGE_INVENTORY.json) e [dependências/licenças](DEPENDENCIES.json).
- [Contexto comercial e mídia no navegador](BROWSER_CONTEXT_EVIDENCE.md): isolamento por aba, cancelamento/limpeza e IndexedDB nativo com duas pessoas/empresas sintéticas.
- [Estratégia de validação](VALIDATION.md), [resultados de integridade documental](documentation-validation.json) e [logs focados](evidence/).
- [CI e candidato corrigido](ci-validation.json): primeira tentativa com2falhas de fonte corrigida, CI atual43456719793 verde com4.106Node/67Python; histórico local preservado.
- [Registro das execuções de integração](integration-evidence.json): cadeia local App/Auth/Finance, Auth gerado, navegador de conta e suíte Finance, com limites próprios.
- [Publicação e recuperação](RELEASE.md), [recibo técnico](live-publication.json) e [verificação pública](public-live-verification.json): domínio, versões/hash/configuração, migrações e limites da conferência real.
- [Dependências externas](EXTERNAL_DEPENDENCIES.json): impacto, trabalho local necessário e evidência real faltante por fluxo.

Para conferir bytes das entradas, IDs/aceites, contratos do catálogo e consistência das evidências registradas:

```sh
node docs/v4/validate-evidence.mjs --write
```

Esse comando valida a documentação e os artefatos citados. Ele não executa testes funcionais, não consulta provedores e não confirma a publicação. Os comandos funcionais e os critérios de navegador/Live estão em `VALIDATION.md`.
