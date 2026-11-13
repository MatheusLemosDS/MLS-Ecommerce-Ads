# V4 layout + weekly context evidence

Implementation stays in the existing application, with existing IDs, controllers, routes, all six initial agent cards, seven directory specialists, financial projectors and six current assets (the five historical modules plus workspace). No remote mutation, provider request, publication or message was performed by this agent.

Source hashes: layout-source-freeze.json. Current source files: approved-design-system.mjs (final shared presentation layer after existing specialist layer), theme.mjs (shared palette; preference lifecycle unchanged), workspace-navigation.mjs (same owner/review destinations with Portuguese group labels; Agentes distinct from human Equipe; Novidades e versão distinct from billing), production-weekly-view.mjs/production-workspace-view.mjs/weekly-operating-view.mjs (explicit selected source context). Root owns the admin-client anchor integration, generated build and external release. Account UI source/tests are described separately in account-ui-evidence.md; chart work in chart-extensions-evidence.md.

## Actual commands and results

- `node --test web/cloudflare/tests/workspace-navigation.test.mjs web/cloudflare/tests/ads-presentation.test.mjs` → 14/14 PASS. Log layout-unit.tap.
- `npm run build:app` → PASS; local final evidence build App3739562bytes SHA d9187e2fc48ba450c208c8182b5746874e15fc58db4dc0319bcf393cf7d89b7f. Log layout-final-build.log. This is emitted output, not a claim about a separate raw-source profile or eventual deployment hash.
- `node --test web/cloudflare/tests/mls-approved-design-system.test.mjs` → 8/8 PASS, including generated normal/minified owner preview OFF/ON. Log layout-design-unit.tap.
- `MLS_APPROVED_SCREENSHOT_DIR=/workspace/mls-v4-work/layout-screens node --test web/cloudflare/tests/mls-approved-all-panels-chrome.test.mjs` → 3/3 PASS;15existing workspaces×1365/390×light/dark×normal/minified plus genuine fresh syntheticD1bootstrap. Log layout-chrome.tap. Earlier screenshots show initial V4 presentation before final mobilepadding/gradient/control-boundary refinements; use final extra screenshot set for final visual review.
- `node --test web/cloudflare/tests/weekly-operating-ui.test.mjs web/cloudflare/tests/production-weekly-client.test.mjs web/cloudflare/tests/production-workspace-view.test.mjs` →40/40 PASS, including new exact source links, crossmonth selection/drafts, invalidFridays and late-response/logout guards. Log weekly-context-unit.tap.
- `MLS_V4_CONTEXT_SCREENSHOT_DIR=/workspace/mls-v4-work/weekly-context-screens node --test web/cloudflare/tests/weekly-context-navigation-chrome.test.mjs` →4/4 PASS normal/minified×320/1365. Native Chromium click/keyboard and real canonical weekly/publication/manufacturing read responses.8theme screenshots. Log weekly-context-browser.tap.
- `node /workspace/mls-v4-work/layout-qa.mjs` →144/144 checks PASS,0writes,0external requests. Log layout-extra-final.tap; index layout-extra-screens/results.json.144screens at320/390/1365/1440×light/dark×normal/minified for overview/costs/catalog/finance/production/returns/DTF/weekly/AI Sales with both preview flags enabled in synthetic owner only. Checks open existing advanced operational forms, unique IDs,13px minimum labels/body, no global overflow, six initial agents before graphs, real search keyboard/theme actions, reducedmotion. All source APIs intentionally503; this proves rendering/recovery semantics, not successful financial data or writes.

## WKR08 behavior proven in browser

Reportweek02Oct2026→selected25Sep opens Finance with month2026-09/date2026-09-25 in both URL and day/month controllers. BothSeptember/October source competencies remain linked. Back returns to02Octreport. Its manufacturing source opens validated October02cut after savedweeks load. Entering a physical manufacturing draft, returning to report and reopening the cut preserves that draft. Only GET source reads; physical database snapshot/provider call log unchanged. Invalid weekday/month mismatch cannot change selection; uncertain cut attempts retain their request and block competing context changes. Cash link explicitly names report range and tells operator that Bank preserves its own month/selection/drafts; it does not silently overwrite that independent bank context.

## Common integrated components

Existing application: six KPI cards/sparklines and agent cards retain their actual projectors and SVG avatar; shared final CSS styles states, fields, buttons, contextual navigation, tables and details. Signed financial bars and stable product-ranking selections use child agent's actual adapters/handlers.

New account area: commercial-account-view supplies shared header/nav/public split layout, card/form/field/check/action/notice/badge/list/table/code/readout variants. commercial-account-client integrates real account/organization APIs with CSRF, closed request bodies, revisions/idempotency, explicit confirmations, dirty state, uncertain response recovery, lifecycle clearing and backend-checked capabilities. No standalone component gallery or fake account persistence is substituted.

## Limits

These are local synthetic validations, not live owner acceptance, commercial readiness or publication. Final generated Auth/App transport and remote gates belong to root. Actual e-mail delivery, customer-specific OAuth, billing provider and approved retention purge remain explicit dependencies. WCAG2.2AA is a target: font/focus/controls/reflow/theme checks and native keyboard/touch were performed, not certification. CSS `zoom` was deliberately excluded after determining it does not reproduce browser zoom/media-query reflow;320px reflow is verified, while a complete manual browser-zoom audit remains separately attributable.
