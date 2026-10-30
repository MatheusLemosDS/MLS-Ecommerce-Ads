# Homologação local — Worker real, dados fictícios

30/10/2026. App `a5ba3298faf4b8c2eaa32e98674f1d7408f4c4616236d8f04a2fba72bbfb91c8`, sem alterações em App/Auth/Finance. **2.327 testes Node e 67 Python aprovados; zero falha/skip.** [Registro](regression.json).

Os testes abrem o servidor HTTP local real, fazem login com cookies Secure/CSRF e gravam/releem o SQLite. Não há respostas de API simuladas nesses dois fluxos. Os exemplos são sintéticos e não têm conexão com a loja. O terceiro fluxo usa o HTML autossuficiente em servidor HTTP estático, sem API, com gravações bloqueadas. `file://` foi bloqueado pela política administrativa do navegador e não foi certificado.

| Evidência | Desktop | Celular |
|---|---|---|
| Visão geral de demonstração | [Escuro](preview-1365-dark-overview.png) | [Claro](preview-390-light-overview.png) |
| Custo salvo no backend local | [R$ 16,90](preview-1365-actual-costs-saved.png) | [R$ 16,90](preview-390-actual-costs-saved.png) |
| MP4 reproduzido no Estúdio | [Campanha criada na interface](preview-1365-native-current-campaign-mp4.png) | [Exemplo reanexado](preview-390-actual-studio-mp4.png) |
| HTML independente | [Catálogo](offline-1365-native-catalog.png) | [Catálogo](offline-390-native-catalog.png) |

Quatro JSONs registram os cálculos, variantes, fluxo de render e ausência de erros JS. A seleção acima contém oito imagens; as 74 capturas completas são geradas pelo teste/artefato CI, sem incluir a imagem antiga não referenciada de uma execução anterior. Os relatórios derivados preservam o SHA do relatório original e identificam a seleção das imagens.

O fluxo desktop gerou um vídeo a partir da campanha/arquivos selecionados na interface, reanexou o MP4 e passou pelo gate local de aprovação. O clique de teste **não é avaliação visual ou auditiva do proprietário**, não autoriza publicação e mantém `commercial_writes=false`.

[Guia para testar](../../MLS_OWNER_HOMOLOGATION_2026_10_30.md). Financeiro real/Seller Centre/banco e acesso à Cloudflare continuam externos. Nenhum merge/deploy foi executado.
