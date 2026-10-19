"""Build isolated, offline-only financial connection candidates; never overwrite v11."""
from pathlib import Path
import hashlib
import json
import re

ROOT=Path(__file__).resolve().parents[1]
FINANCE=ROOT/'web/finance'
AUTH_SHA='45d0142709c5087e373cc4da146070ed39c472805f6f64c00f00b6555f0e1f56'

def digest(value):
    return hashlib.sha256(value).hexdigest()

def build():
    original=(ROOT/'web/cloudflare/auth-worker.mjs').read_bytes()
    if digest(original)!=AUTH_SHA:
        raise SystemExit('Current Auth differs from the reviewed v9 baseline; candidate not built.')
    # The preview projection is a self-contained, reviewed module shared by all
    # three Workers. Strip only its explicit import; refuse additional imports.
    preview=(FINANCE/'src/payment-preview-frame.mjs').read_text()
    if re.search(r'^import\b',preview,re.M):
        raise SystemExit('Unreviewed preview frame import; candidate not built.')
    preview=re.sub(r'^export\s+', '', preview, flags=re.M)
    preview_bundle='const brazaFinancePreviewFrame = (() => {\n'+preview+'\nreturn {projectFinancePaymentPreview};\n})();\n'
    preview_import="import {projectFinancePaymentPreview} from './payment-preview-frame.mjs';\n"
    router_source=(FINANCE/'src/auth-router.mjs').read_text()
    if router_source.count(preview_import)!=1:
        raise SystemExit('Preview router import not unique; candidate not built.')
    router=re.sub(r'^export\s+', '', router_source.replace(preview_import,''), flags=re.M)
    if re.search(r'^import\b',router,re.M):
        raise SystemExit('Unreviewed router import; candidate not built.')
    needle='    const url = new URL(request.url);'
    auth=original.decode()
    if auth.count(needle)!=1:
        raise SystemExit('Auth insertion point not unique.')
    addition="\n    if (url.pathname.startsWith('/shopee/finance/')) return brazaFinanceRouter.forwardFinanceConnection(request, env);\n    if (url.pathname === '/internal/shopee/finance/payment-sample' || url.pathname === '/internal/shopee/finance/payment-preview') return brazaFinanceRouter.forwardFinancePaymentSample(request, env, {validateInternalApp});"
    auth=auth.replace(needle,needle+addition,1)
    auth+='\n\n'+preview_bundle+'\nconst brazaFinanceRouter = (() => {\nconst {projectFinancePaymentPreview}=brazaFinancePreviewFrame;\n'+router+'\nreturn {forwardFinanceConnection,forwardFinancePaymentSample};\n})();\n'
    store=(FINANCE/'src/connection-store.mjs').read_text()
    store=re.sub(r'^export\s+', '', store, flags=re.M)
    worker=(FINANCE/'src/connection-worker.mjs').read_text()
    if worker.count(preview_import)!=1:
        raise SystemExit('Preview worker import not unique; candidate not built.')
    worker=worker.replace(preview_import,'')
    worker=re.sub(r'^import\s+[\s\S]*?\s+from\s+[\'"]\./connection-store\.mjs[\'"];?\s*\n','',worker,count=1)
    if re.search(r'^import\b',worker,re.M):
        raise SystemExit('Unreviewed worker import; candidate not built.')
    bundled=preview_bundle+'\nconst {projectFinancePaymentPreview}=brazaFinancePreviewFrame;\nconst brazaFinanceStore = (() => {\n'+store+'\nreturn {FINANCE_PROFILE,FinanceConnectionError,createFinanceStore};\n})();\nconst {FINANCE_PROFILE,FinanceConnectionError,createFinanceStore}=brazaFinanceStore;\n'+worker
    candidate=FINANCE/'candidate'
    candidate.mkdir(exist_ok=True)
    (candidate/'auth-worker.mjs').write_text(auth)
    (candidate/'finance-worker.mjs').write_text(bundled)
    manifest={
        'status':'OFFLINE_CANDIDATE_NOT_FOR_PRODUCTION',
        'activation':'BASE_WITHOUT_PROVIDER_ADAPTER_USE_LIVE_DELIVERY',
        'partner_id':2049333,'shop_id':1178167501,
        'auth_baseline_sha256':AUTH_SHA,
        'auth_candidate_sha256':digest(auth.encode()),
        'finance_candidate_sha256':digest(bundled.encode()),
        'production_deployed':False,'ads_execution':'LOCKED',
        'provider_adapter_enabled':False,
    }
    (candidate/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps(manifest))

if __name__=='__main__':
    build()
