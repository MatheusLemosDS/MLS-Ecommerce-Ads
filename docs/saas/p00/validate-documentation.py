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
 for e in m['evidence']:assert hashlib.sha256((root/e['path']).read_bytes()).hexdigest()==e['sha256_current']
assert len(read('financial-lineage.json')['values'])==25
assert len(read('sbom.cdx.json')['components'])==len(json.loads((root/'package-lock.json').read_text())['packages'])-1
for e in read('rights-inventory.json')['assets']:assert hashlib.sha256((root/e['path']).read_bytes()).hexdigest()==e['sha256']
links=0
for p in [p00/'README.md',p00/'OPERATIONS.md']:
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
# No runtime, permissions, workflow, cost or marketplace transport delta.
assert not git('diff','346f30f200e5cbd3d9efd26663a483c625d9c6e7','--name-only','--','web','workers','.github','package.json','package-lock.json').strip()
print(json.dumps({'result':'PASS','modules':22,'financial_value_types':25,'npm_components':len(read('sbom.cdx.json')['components']),'asset_hashes':len(read('rights-inventory.json')['assets']),'local_links_checked':links,'requirements':74,'history_and_runtime_preserved':True}))
