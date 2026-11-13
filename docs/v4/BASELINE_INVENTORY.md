# Inventário inicial V4.1 — antes do primeiro ajuste de interface

Base: `a5bd38a0902b38ecc3e90a747601eba330e7813e`. Worker App compilado: `378d3e24a853d441ebd06249282f77d060f8d01f0cc27e01209487d0f68737a1`, 3,688,221 bytes.

A matriz [functional-coverage.json](functional-coverage.json) mantém os 233 requisitos atuais, inclusive os 227 anteriores, e as 22 famílias. Cada linha separa inventário, implementação, validação local, integração, publicação e verificação Live. Estado inicial inventariado não significa aceite concluído.

O [inventário ativo](baseline-active-inventory.json) foi produzido executando o Worker compilado da base no runtime VM existente, com SQLite sintético isolado, saída de rede sempre recusada, owner/review e quatro combinações independentes de flags: OFF, Listing Factory, AI Sales e ambas. Foram 272 observações de rotas e 22 composições HTML distintas. Tentativas de rede: 0.

As composições enumeram todos os elementos montados com ID e os formulários, botões, campos, seletores, links, seções, tabelas, diálogos e details encontrados. Totais das composições distintas, com repetições entre páginas/perfis: {'a': 1089, 'button': 739, 'details': 328, 'summary': 328, 'section': 440, 'form': 111, 'input': 405, 'p': 727, 'textarea': 7, 'span': 360, 'div': 754, 'strong': 364, 'nav': 16, 'h1': 4, 'h2': 72, 'aside': 8, 'select': 222, 'small': 220, 'h3': 108, 'table': 34, 'tbody': 34, 'header': 28, 'label': 12, 'progress': 4, 'article': 28, 'ul': 32, 'dl': 60, 'h4': 26, 'h5': 8, 'th': 4, 'ol': 8, 'datalist': 4, 'svg': 4, 'pre': 4}. Há 201 locais de handlers dinâmicos e 108 referências literais de endpoint com arquivo/linha para seguir os controles criados após carga. Essas referências são pontos de inspeção, sem fingir execução de cada ação.

Os estados e ações dependentes de linhas/dados continuam vinculados aos módulos e fixtures do projeto. HTML inicial não comprova cardinalidade dos botões de cada linha nem comportamento no navegador. O inventário registra essa limitação; testes de interação são a próxima dimensão da evidência. Rotas/aliases negados e redirecionamentos estão registrados com papel e flags. O HTML bruto permanece apenas na área privada de trabalho; o JSON versionável omite valores de campos.

As cinco entradas V4.1 estão em [input](input/), com bytes e hashes em [input-manifest.json](input-manifest.json). A versão anterior foi preservada em [input-history/v4](input-history/v4/), sem sobrescrever sua proveniência. A instrução V4.1 autoriza publicação após os gates aplicáveis; este inventário não afirma que houve publicação.

Foram acrescentadas oito observações públicas anônimas à mesma base compilada, incluindo login sem sessão e credencial sintética inválida. Essas duas composições de acesso completam o inventário inicial de formulários públicos; não são acesso real do proprietário.
