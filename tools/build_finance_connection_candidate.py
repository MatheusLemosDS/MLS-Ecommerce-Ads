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
    router=(FINANCE/'src/auth-router.mjs').read_text().replace('export async function forwardFinanceConnection','async function forwardFinanceConnection')
    needle='    const url = new URL(request.url);'
    auth=original.decode()
    if auth.count(needle)!=1:
        raise SystemExit('Auth insertion point not unique.')
    addition="\n    if (url.pathname.startsWith('/shopee/finance/')) return brazaFinanceRouter.forwardFinanceConnection(request, env);"
    auth=auth.replace(needle,needle+addition,1)
    auth+='\n\nconst brazaFinanceRouter = (() => {\n'+router+'\nreturn {forwardFinanceConnection};\n})();\n'
    store=(FINANCE/'src/connection-store.mjs').read_text()
    store=re.sub(r'^export\s+', '', store, flags=re.M)
    worker=(FINANCE/'src/connection-worker.mjs').read_text()
    worker=re.sub(r'^import\s+[\s\S]*?\s+from\s+[\'"]\./connection-store\.mjs[\'"];?\s*\n','',worker,count=1)
    if re.search(r'^import\b',worker,re.M):
        raise SystemExit('Unreviewed worker import; candidate not built.')
    bundled='const brazaFinanceStore = (() => {\n'+store+'\nreturn {FINANCE_PROFILE,FinanceConnectionError,createFinanceStore};\n})();\nconst {FINANCE_PROFILE,FinanceConnectionError,createFinanceStore}=brazaFinanceStore;\n'+worker
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
