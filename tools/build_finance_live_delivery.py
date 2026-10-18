"""Bundle the reviewed finance connection modules without npm or network access."""
from pathlib import Path
import hashlib
import json
import re
import zipfile
from build_finance_connection_candidate import build, ROOT

SRC = ROOT / 'web/finance/src'
OUT = ROOT / 'docs/finance-connection-delivery'
IMPORT = re.compile(r"^import\s+\{([^}]+)\}\s+from\s+['\"]\./([\w-]+\.mjs)['\"];\s*", re.M)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def bundle(entry):
    modules, sources, active = [], {}, set()

    def visit(name):
        if name in sources:
            return
        if name in active:
            raise ValueError('Circular module dependency')
        active.add(name)
        source = (SRC / name).read_text()
        imports = list(IMPORT.finditer(source))
        for match in imports:
            visit(match[2])
        converted = IMPORT.sub(lambda match: 'const {' + match[1] + '} = modules[' + json.dumps(match[2]) + '];\n', source)
        if re.search(r'^import\b', converted, re.M):
            raise ValueError('Unsupported module import')
        exports = re.findall(r'^export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)', converted, re.M)
        if len(exports) != len(set(exports)):
            raise ValueError('Duplicate export')
        converted = re.sub(r'^export\s+(?=(?:async\s+)?(?:function|const|class)\b)', '', converted, flags=re.M)
        has_default = bool(re.search(r'^export default\s+', converted, re.M))
        converted = re.sub(r'^export default\s+', 'const moduleDefault = ', converted, flags=re.M)
        if re.search(r'^export\b', converted, re.M):
            raise ValueError('Unsupported module export')
        returned = ','.join(exports + (['default:moduleDefault'] if has_default else []))
        modules.append('modules[' + json.dumps(name) + '] = (() => {\n' + converted + '\nreturn {' + returned + '};\n})();\n')
        sources[name] = sha(source.encode())
        active.remove(name)

    visit(entry)
    return ('const modules = {};\n' + ''.join(modules) + 'export default modules[' + json.dumps(entry) + '].default;\n').encode(), sources


def main():
    build()  # Verifies the original Auth v9 hash and generates its isolated delta.
    finance, sources = bundle('production-worker.mjs')
    auth = (ROOT / 'web/finance/candidate/auth-worker.mjs').read_bytes()
    OUT.mkdir(exist_ok=True)
    (OUT / 'auth-worker.mjs').write_bytes(auth)
    (OUT / 'finance-worker.mjs').write_bytes(finance)
    guide = (ROOT / 'web/finance/DEPLOY.md').read_bytes()
    (OUT / 'README.md').write_bytes(guide)
    manifest = {
        'status': 'REVIEWABLE_CONNECTION_DELIVERY_NOT_DEPLOYED',
        'partner_id': 2049333, 'shop_id': 1178167501,
        'activation_gate': "FINANCE_CONNECTION_ENABLED='true' plus private bindings and secrets",
        'auth_sha256': sha(auth), 'finance_sha256': sha(finance),
        'source_sha256': sources,
        'production_deployed': False, 'live_authorization_verified': False,
        'redirect_query_preservation_verified_live': False,
        'financial_import_implemented': False, 'ads_execution': 'LOCKED',
    }
    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    archive = ROOT / 'docs/brazacommerce-conexao-financeira.zip'
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as package:
        for name in ['auth-worker.mjs', 'finance-worker.mjs', 'README.md', 'manifest.json']:
            info = zipfile.ZipInfo(name, date_time=(2026, 10, 18, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            package.writestr(info, (OUT / name).read_bytes())
    print(json.dumps({'delivery': str(OUT), 'zip': str(archive), **manifest}))


if __name__ == '__main__':
    main()
