"""Build versioned, readable installation and reviewed-upgrade console pastes."""
import ast
import base64
import gzip
import hashlib
import json
from pathlib import Path
import shlex


TAG = "HERMES_WEB_BRIDGE_INSTALL_SOURCE"
DOWNLOAD_URL='https://raw.githubusercontent.com/MatheusLemosDS/MLS-Ecommerce-Ads/main/tools/install_hermes_web_bridge.py'
SOURCE_SHA = '07ca0661334c359b6ed93949f19a5b45f0e39b78980d70fcd4bb1a8feba6bdf4'


def quick_command(digest):
    if type(digest) is not str or len(digest)!=64 or any(character not in '0123456789abcdef' for character in digest):raise ValueError('BRIDGE_INSTALLER_PIN_INVALID')
    code=("import sys,hashlib,urllib.request as r; "
          "n=type('NoRedirect',(r.HTTPRedirectHandler,),{'redirect_request':lambda *a:None}); "
          "o=r.build_opener(r.ProxyHandler({}),n()); "
          "s=o.open(r.Request("+repr(DOWNLOAD_URL)+",headers={'Accept':'text/plain'}),timeout=20); "
          "b=s.read(65537); s.close(); "
          "(len(b)<=65536 and hashlib.sha256(b).hexdigest()=="+repr(digest)+") or sys.exit('BRIDGE_INSTALLER_DOWNLOAD_INVALID'); "
          "sys.argv=['bridge-upgrade','--upgrade','--restart']; "
          "exec(compile(b,'<verified-hermes-finance-upgrade>','exec'),{'__name__':'__main__'})")
    return '/usr/bin/python3 -I -S -B -c '+shlex.quote(code)+'\n'


def build(repo,*,upgrade=False):
    source = (repo / "tools/install_hermes_web_bridge.py").read_bytes()
    if hashlib.sha256(source).hexdigest() != SOURCE_SHA:
        raise ValueError("UNREVIEWED_HERMES_WEB_BRIDGE_INSTALL_SOURCE")
    compile(source, "<hermes-bridge-install-reviewed-source>", "exec")
    values={node.targets[0].id:ast.literal_eval(node.value) for node in ast.parse(source).body if isinstance(node,ast.Assign) and len(node.targets)==1 and isinstance(node.targets[0],ast.Name) and node.targets[0].id in ('PACKED','PACKED_SHA','SOURCE_SHA','LEGACY_SOURCE_SHA')}
    packed=base64.b64decode(values['PACKED'],validate=True);bridge=gzip.decompress(packed)
    if hashlib.sha256(packed).hexdigest()!=values['PACKED_SHA'] or hashlib.sha256(bridge).hexdigest()!=values['SOURCE_SHA'] or bridge!=(repo/'web/bridge/hermes_bridge.py').read_bytes():raise ValueError('HERMES_WEB_BRIDGE_PAYLOAD_MISMATCH')
    digest = hashlib.sha256(source).hexdigest()
    canonical_digest = hashlib.sha256(ast.dump(ast.parse(source), include_attributes=False).encode()).hexdigest()
    code = ("import sys,hashlib,ast; s=sys.stdin.buffer.read(65537); "
            + "(len(s)<=65536 and hashlib.sha256(ast.dump(ast.parse(s),include_attributes=False).encode()).hexdigest()==" + repr(canonical_digest)
            + ") or sys.exit('HERMES_WEB_BRIDGE_INSTALL_SOURCE_INVALID'); "
            + "exec(compile(s,'<verified-hermes-bridge-install>','exec'))")
    header = "/usr/bin/python3 -I -S -B -c " + shlex.quote(code) + (" --upgrade --restart" if upgrade else "") + " <<'" + TAG + "'\n"
    body = source.decode("ascii")
    parts=[];part=''
    for line in (header+body+TAG+'\n').splitlines(keepends=True):
        if len(line.encode())>3600:raise ValueError('BRIDGE_TRANSFER_LINE_LIMIT')
        if len((part+line).encode())>3600:parts.append(part);part=''
        part+=line
    if part:parts.append(part)
    if not parts or max(len(part.encode()) for part in parts)>3600 or TAG in body.splitlines() or len(source)>65536:
        raise ValueError("BRIDGE_TRANSFER_FRAME_INVALID")
    return parts, source, {
        "operation": "UPGRADE_REVIEWED_LEGACY_AND_RESTART_IDLE_BRIDGE" if upgrade else "INSTALL_FILE_AND_CHECK_USER_RUNTIME_ONLY", "ads": "LOCKED",
        "source_sha256": digest, "source_bytes": len(source), "canonical_ast_sha256": canonical_digest,
        "part_bytes": [len(part.encode()) for part in parts], "service_started": False,
        "credentials_configured": False, "model_calls": False,
        "bridge_source_sha256":values['SOURCE_SHA'],"previous_bridge_sha256":values['LEGACY_SOURCE_SHA'],"protocol":"hermes-finance-v1","restart_requested":upgrade,
    }



def main():
    repo = Path(__file__).absolute().parent.parent
    deliveries=[(mode,build(repo,upgrade=mode)) for mode in (False,True)]
    for mode,(parts,source,manifest) in deliveries:
        destination=repo/('docs/hermes-finance-v1-upgrade-delivery' if mode else 'docs/hermes-finance-v1-install-delivery')
        if destination.exists():raise FileExistsError(destination)
    for mode,(parts,source,manifest) in deliveries:
        destination=repo/('docs/hermes-finance-v1-upgrade-delivery' if mode else 'docs/hermes-finance-v1-install-delivery');destination.mkdir(mode=0o700)
        for i,part in enumerate(parts,1):(destination/f'console-part-{i}.txt').write_text(part)
        (destination/'installer-source.py').write_bytes(source);(destination/'bridge-source.py').write_bytes((repo/'web/bridge/hermes_bridge.py').read_bytes())
        if mode:(destination/'console-fetch.txt').write_text(quick_command(manifest['source_sha256']))
        (destination/'manifest.json').write_text(json.dumps(manifest,sort_keys=True,indent=2)+'\n');print(json.dumps(manifest,sort_keys=True))



if __name__ == "__main__":
    main()
