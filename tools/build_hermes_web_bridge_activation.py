"""Build bounded console pastes for protocol-aware bridge activation."""
import ast
import hashlib
import json
from pathlib import Path
import shlex


TAG = "HERMES_WEB_BRIDGE_ACTIVATION_SOURCE"
SOURCE_SHA = '8046ea6a55a3d8fb6b4c2d14e16ba613fee6852b16f9c54541ddb81548459b83'


def build(repo):
    source = (repo / "tools/activate_hermes_web_bridge.py").read_bytes()
    if hashlib.sha256(source).hexdigest() != SOURCE_SHA:
        raise ValueError("UNREVIEWED_HERMES_WEB_BRIDGE_ACTIVATION_SOURCE")
    compile(source, "<hermes-bridge-activation-reviewed-source>", "exec")
    values={node.targets[0].id:ast.literal_eval(node.value) for node in ast.parse(source).body if isinstance(node,ast.Assign) and len(node.targets)==1 and isinstance(node.targets[0],ast.Name) and node.targets[0].id in ('BRIDGE_SHA','UNIT','PROTOCOL')}
    if values['BRIDGE_SHA']!=hashlib.sha256((repo/'web/bridge/hermes_bridge.py').read_bytes()).hexdigest() or values['UNIT'].encode()!=(repo/'web/bridge/brazacommerce-hermes-bridge.service').read_bytes() or values['PROTOCOL']!='hermes-finance-v1':raise ValueError('HERMES_WEB_BRIDGE_ACTIVATION_PAYLOAD_MISMATCH')
    digest = hashlib.sha256(source).hexdigest()
    canonical_digest = hashlib.sha256(ast.dump(ast.parse(source), include_attributes=False).encode()).hexdigest()
    code = ("import sys,hashlib,ast; s=sys.stdin.buffer.read(65537); "
            + "(len(s)<=65536 and hashlib.sha256(ast.dump(ast.parse(s),include_attributes=False).encode()).hexdigest()==" + repr(canonical_digest)
            + ") or sys.exit('HERMES_WEB_BRIDGE_ACTIVATION_SOURCE_INVALID'); "
            + "exec(compile(s,'<verified-hermes-bridge-activation>','exec'))")
    header = "/usr/bin/python3 -I -S -B -c " + shlex.quote(code) + " --restart <<'" + TAG + "'\n"
    body = source.decode("ascii")
    parts=[];part=''
    for line in (header+body+TAG+'\n').splitlines(keepends=True):
        if len(line.encode())>3600:raise ValueError('HERMES_WEB_BRIDGE_ACTIVATION_LINE_LIMIT')
        if len((part+line).encode())>3600:parts.append(part);part=''
        part+=line
    if part:parts.append(part)
    if not parts or max(len(part.encode()) for part in parts)>3600 or len(source)>65536:
        raise ValueError("HERMES_WEB_BRIDGE_ACTIVATION_PASTE_LIMIT")
    if TAG in body.splitlines():
        raise ValueError("HERMES_WEB_BRIDGE_ACTIVATION_FRAME_INVALID")
    return parts, source, {
        "operation": "CONFIGURE_OR_REUSE_SECRET_AND_RESTART_IDLE_BRIDGE", "ads": "LOCKED",
        "source_sha256": digest, "source_bytes": len(source),
        "canonical_ast_sha256": canonical_digest,
        "part_bytes": [len(part.encode()) for part in parts],
        "gateway_changed": False, "network_requests": "FIXED_APP_HEARTBEAT_DRAIN_PREFLIGHT", "protocol":"hermes-finance-v1","restart_requested":True,"bridge_source_sha256":values['BRIDGE_SHA'],
    }



def main():
    repo = Path(__file__).absolute().parent.parent
    parts, source, manifest = build(repo)
    destination = repo / "docs/hermes-finance-v1-activation-delivery"
    destination.mkdir(mode=0o700, exist_ok=False)
    for name, data in {
        **{f'console-part-{index}.txt':part.encode() for index,part in enumerate(parts,1)},
        "activation-source.py": source,
        "manifest.json": (json.dumps(manifest, sort_keys=True, indent=2) + "\n").encode(),
    }.items():
        (destination / name).write_bytes(data)
    print(json.dumps(manifest, sort_keys=True))


if __name__ == "__main__":
    main()
