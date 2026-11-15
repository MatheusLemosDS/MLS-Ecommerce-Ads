"""Validate P00 evidence structure, input preservation and existing source links only."""
from pathlib import Path
import hashlib,json,re,subprocess,urllib.parse
root=Path(__file__).resolve().parents[3]
p00=root/'docs/saas/p00'
def read(name):return json.loads((p00/name).read_text())
def git(*args):return subprocess.check_output(['git',*args],cwd=root)
assert git('merge-base','--is-ancestor','0a5a22897d3cf56f97b7b995eb78a743fc0a246e','HEAD')==b''
for old,archive in [('AGENTS.md','AGENTS_HISTORICO.md'),('NEXT_CHAT_HANDOFF.txt','NEXT_CHAT_HANDOFF_HISTORICO.txt')]:
 assert git('show','346f30f200e5cbd3d9efd26663a483c625d9c6e7:'+old)==(root/archive).read_bytes()
for e in read('input/MANIFEST.json')['inputs']:
 if 'path' in e:assert hashlib.sha256((p00/'input'/e['path']).read_bytes()).hexdigest()==e['sha256']
assert len(read('capabilities.json')['modules'])==22
for m in read('capabilities.json')['modules']:
 for field in ['implementation','roles_and_permissions','capability_support','provider_grant','connection','coverage','external_write_permission','validation','commercial_promise','next_action']:assert m.get(field), (m['id'],field)
 for e in m['evidence']:assert hashlib.sha256(git('show',e['snapshot_ref']+':'+e['path'])).hexdigest()==e['sha256_current']
assert len(read('financial-lineage.json')['values'])==25
assert len(read('sbom.cdx.json')['components'])==len(json.loads((root/'package-lock.json').read_text())['packages'])-1
for e in read('rights-inventory.json')['assets']:assert hashlib.sha256((root/e['path']).read_bytes()).hexdigest()==e['sha256']
old=read('release-candidate-before-p00.json')
new=json.loads((root/'tools/release-approved-candidate.json').read_text())
assert old['expected_hashes']==new['expected_hashes']
assert old['expected_live_flags']==new['expected_live_flags']
assert new['commercial_writes_allowed'] is False
assert new['base_commit']=='346f30f200e5cbd3d9efd26663a483c625d9c6e7'
assert all('*' not in path for path in new['allowed_files'])
links=0
for p in [p00/'README.md',p00/'OPERATIONS.md',p00/'CLOSEOUT.md']:
 for target in re.findall(r'\]\(([^)]+)\)',p.read_text()):
  if re.match(r'https?://',target):continue
  dest=target.split('#')[0];assert (p.parent/urllib.parse.unquote(dest)).exists(),(str(p),target);links+=1
matrix=json.loads((root/'docs/MLS_SAAS_EXECUTION.json').read_text())
assert len(matrix['tarefas'])==74
assert len({t['id'] for t in matrix['tarefas']})==74
for task in matrix['tarefas']:
 if task['fase']!='P00':assert task['estado']=='ESPECIFICADO',task['id']
checkpoint=json.loads((root/'docs/MLS_COMMERCE_OS_CHECKPOINT.json').read_text())
assert checkpoint['operational_execution_matrix']=='docs/MLS_SAAS_EXECUTION.json'
assert checkpoint['current_phase']=='P00'
assert matrix['canonical_checkpoint']=='docs/MLS_COMMERCE_OS_CHECKPOINT.json'
# Preserve exact old narratives while keeping only one short current entry.
inventory=read('operations-inventory.json')
for h in inventory['history_archives']:
 original=git('show',h['source_sha']+':'+h['source_path'])
 assert original==(p00/h['archive']).read_bytes()
 assert hashlib.sha256(original).hexdigest()==h['sha256']
required=['purpose','data_categories','environment','version','responsible','cost_plan','limits','secret_references','recovery']
assert len(inventory['services'])==12 and len({s['id'] for s in inventory['services']})==12
unknown=0
for service in inventory['services']:
 for key in required:
  field=service[key];assert field['state'] in ['VERIFIED','SPECIFIED','OWNER_REPORTED','UNKNOWN']
  if field['state']=='UNKNOWN':
   unknown+=1;assert field['value'] is None and field['reason']
   assert inventory['dependencies'][field['blocker']]['state']=='BLOQUEADO'
  else:
   assert field['value'] is not None and field['evidence']
   for ref in field['evidence']:
    assert (p00/ref.split('#')[0]).exists(),(service['id'],ref)
assert inventory['operational_acceptance'] is False and inventory['commercial_release_approved'] is False
assert inventory['production_change_authorized_by_register'] is False
embedded=[c for c in read('sbom.cdx.json')['components'] if any(p['name']=='mls:embedded_runtime' and p['value']=='true' for p in c.get('properties',[]))]
assert {(c['name'],c['version']) for c in embedded}=={(c['name'],c['version']) for c in inventory['embedded_runtime_license_scope']['components']}
for component in embedded:
 assert component['licenses']==[{'expression':'MIT'}]
 refs=json.loads(next(p['value'] for p in component['properties'] if p['name']=='mls:license_texts_observed'))
 for ref in refs:assert hashlib.sha256((root/ref['file']).read_bytes()).hexdigest()==ref['sha256']
# A finite test-infrastructure correction is authorized by the current CI failure.
# No production runtime, permission, workflow, cost or provider transport delta.
test_infrastructure={'web/cloudflare/tests/returns-receipts-chrome-helpers.mjs','web/cloudflare/tests/workspace-navigation-rework-chrome.test.mjs','web/cloudflare/tests/receipt-transport-lifecycle.test.mjs'}
changed=set(git('diff','346f30f200e5cbd3d9efd26663a483c625d9c6e7','--name-only','--','web','workers','.github','package.json','package-lock.json').decode().splitlines())
assert changed<=test_infrastructure,changed-test_infrastructure
print(json.dumps({'result':'PASS','modules':22,'financial_value_types':25,'npm_components':len(read('sbom.cdx.json')['components']),'asset_hashes':len(read('rights-inventory.json')['assets']),'local_links_checked':links,'requirements':74,'service_records':12,'explicit_unknown_fields':unknown,'embedded_licenses_verified':len(embedded),'history_and_runtime_preserved':True}))
