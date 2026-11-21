export const OPERATING_INTEGRATION_REVIEW=Object.freeze({
  "schema": "mls_operating_after_historical_gate_review_v1",
  "previous_source_commit": "01ba4e3dfd92dc11c90386cbee7d2fce82d6db41",
  "new_base_commit": "426b1de037b075afa066ace4742e3cf398294bbf",
  "new_base_preflight_sha256": "57140013545bebd908c65eb8a29003ad2104f497a43b6d0732b6894bc1fad1cf",
  "release_id": "2026-11-21.3",
  "old_section_sha256": "d63d436bd17df86ed9bd5b46020b2c8269b1e450bd367c424b4ff05878c8bccf",
  "new_section_sha256": "2ecca42ef07d4775f90daff5702255619f7cead4b40657d04efedcd621987eb1",
  "old_allowed_sha256": "99667618bde40daa676cf75841781d7be643afb20ea2c65eb6df62faf08cd203",
  "new_allowed_sha256": "41d0f202efb8e6320378253ee00fa6b82ed4e534a1812aba8cf26e39e8a7006a",
  "old_frozen_sha256": "f40683a7aa28f2379a49fe3a88ed5b5106cae52e70d9b1f3c223f77ccfc6546c",
  "new_frozen_sha256": "fef0ba14f377f2e91715ff2cf00689b9cb99c505951d109f1be0d4fd4d9a0417",
  "changed_existing_pins": {
    "tools/tests/release-finance-completion-preflight.test.mjs": {
      "previous": "1639ee4d17282c4200c0fbce16ef4f417613d3d3f8dfe0622417e26fa7a3a993",
      "integrated": "ec8368eeee48d6fe259740504d8a97e2c1916e1f690854091f8d162ed5e053c4"
    },
    "web/cloudflare/src/cost-rules.mjs": {
      "previous": "bddd06c0c7f9b97c809240082137297b7d6b43b0a95ed61ddef7fead571643dd",
      "integrated": "a6db866f802e4c5b52964d023ada26c11c4767c6c357c74924ab2d21587e0f35"
    },
    "web/cloudflare/src/production-costs.mjs": {
      "previous": "04d8a0cc79f95fae403ce09f3d4137a4eb5b71489a98aea8161abdc2bb53d7a8",
      "integrated": "44636ea31d7b9a573c2bd3cbacf7cf313c169c941c1cc669597fcc3462e3a2ca"
    }
  },
  "added_frozen_paths": [
    "docs/MLS_HISTORICAL_DAILY_PROFIT_2026_11_21.md",
    "docs/financial-automation/validation/historical-daily-profit-20261121.json",
    "docs/financial-automation/validation/historical-profit-nov11-readonly-20261121.json",
    "docs/financial-automation/validation/numbered-kit-real-replay-20261121.json",
    "tools/release-historical-profit-candidate.json",
    "tools/tests/historical-profit-reviewed-source-fixture.mjs",
    "tools/tests/historical-profit-reviewed-source.test.mjs",
    "web/cloudflare/src/admin-api-client.mjs",
    "web/cloudflare/src/agent-registry-view.mjs",
    "web/cloudflare/src/business-daily-history.mjs",
    "web/cloudflare/src/business-day-view.mjs",
    "web/cloudflare/src/business-month-client.mjs",
    "web/cloudflare/src/business-month-view-state.mjs",
    "web/cloudflare/src/numbered-adult-kit-costs.mjs",
    "web/cloudflare/tests/admin-api-client.test.mjs",
    "web/cloudflare/tests/admin-bootstrap-compiled.test.mjs",
    "web/cloudflare/tests/admin-startup-compiled.test.mjs",
    "web/cloudflare/tests/business-daily-compiled.test.mjs",
    "web/cloudflare/tests/business-daily-history-browser-fixture.mjs",
    "web/cloudflare/tests/business-daily-history-fixture.mjs",
    "web/cloudflare/tests/business-daily-history-ui.test.mjs",
    "web/cloudflare/tests/business-daily-history.test.mjs",
    "web/cloudflare/tests/business-month-historical-view-v6.test.mjs",
    "web/cloudflare/tests/daily-result-clarity-chrome.test.mjs",
    "web/cloudflare/tests/dtf-auto-layout-chrome.test.mjs",
    "web/cloudflare/tests/historical-daily-profit-chrome.test.mjs",
    "web/cloudflare/tests/mls-approved-all-panels-chrome.test.mjs",
    "web/cloudflare/tests/mls-variant-order-chrome.test.mjs",
    "web/cloudflare/tests/monthly-net-period-chrome.test.mjs",
    "web/cloudflare/tests/numbered-adult-kit-costs.test.mjs",
    "web/cloudflare/tests/owner-report-browser-fixture.mjs",
    "web/cloudflare/tests/owner-report-snapshot-contract.test.mjs",
    "web/cloudflare/tests/production-closing-workspace-chrome.test.mjs",
    "web/cloudflare/tests/production-daily-browser-contract.test.mjs",
    "web/cloudflare/tests/production-daily-browser-fixture.mjs",
    "web/cloudflare/tests/production-daily-hermes-chrome.test.mjs",
    "web/cloudflare/tests/reviewed-cost-source-invariants.mjs",
    "web/cloudflare/tests/reviewed-numbered-kit-source-invariants.test.mjs",
    "web/cloudflare/tests/today-estimated-profit-chrome.test.mjs",
    "web/cloudflare/tests/today-estimated-profit-client.test.mjs"
  ],
  "test_cutoff_adapters": {
    "tools/tests/release-historical-profit-preflight.test.mjs": {
      "baseline_sha256": "edb1cf410668305acaa0a967330e2bbc6e7a23b5514a1b6067bf65740e723d8a",
      "reviewed_sha256": "9eac7235c8cf668507e97ba181bbd60d4a07b7847471695445a61b3f92dacead",
      "original": "current=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'))",
      "reviewed": "current=JSON.parse(spawnSync('git',['show','426b1de037b075afa066ace4742e3cf398294bbf:'+file],{cwd:root,encoding:'utf8'}).stdout)"
    }
  }
});
