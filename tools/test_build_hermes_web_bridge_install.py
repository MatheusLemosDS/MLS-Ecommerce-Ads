import io
from pathlib import Path
import shlex
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import Mock,patch
from urllib import request
from tools import build_hermes_web_bridge_install as builder

class TransferTests(unittest.TestCase):
 repo=Path(__file__).absolute().parent.parent
 def test_dynamic_parts_exact_program_and_limit(self):
  parts,source,manifest=builder.build(self.repo);self.assertEqual((parts,source,manifest),builder.build(self.repo));self.assertGreater(len(parts),1);self.assertTrue(all(n<=3600 for n in manifest['part_bytes']))
  combined=''.join(parts);self.assertEqual(combined.split('\n',1)[1].rsplit(builder.TAG+'\n',1)[0].encode(),source)
 def test_whole_program_checked_before_exec(self):
  parts,source,_=builder.build(self.repo);args=shlex.split(parts[0].splitlines()[0]);code=args[args.index('-c')+1]
  for data,accepted in ((source,True),(b'\n'+source,True),(source.replace(b'0o644',b'0o640'),False),(b'\n'*65537,False)):
   execute=Mock()
   with patch.object(sys,'stdin',SimpleNamespace(buffer=io.BytesIO(data))):
    if accepted:exec(code,{'exec':execute});execute.assert_called_once()
    else:
     with self.assertRaises(SystemExit):exec(code,{'exec':execute})
     execute.assert_not_called()
 def test_unreviewed_installer_rejected(self):
  with patch.object(builder,'SOURCE_SHA','0'*64),self.assertRaises(ValueError):builder.build(self.repo)
 def test_upgrade_has_explicit_restart_and_preserves_same_complete_source(self):
  parts,source,manifest=builder.build(self.repo,upgrade=True);args=shlex.split(parts[0].splitlines()[0]);self.assertIn('--upgrade',args);self.assertIn('--restart',args);self.assertTrue(manifest['restart_requested']);self.assertEqual(manifest['protocol'],'hermes-finance-v1');self.assertFalse(manifest['credentials_configured']);self.assertFalse(manifest['model_calls'])
  self.assertEqual(''.join(parts).split('\n',1)[1].rsplit(builder.TAG+'\n',1)[0].encode(),source)
 def test_payload_snapshot_matches_reviewed_live_bridge(self):
  from tools import install_hermes_web_bridge as installer
  from tools import activate_hermes_web_bridge as activation
  import hashlib
  _,_,manifest=builder.build(self.repo);self.assertEqual(installer.source(),(self.repo/'web/bridge/hermes_bridge.py').read_bytes());self.assertEqual(manifest['bridge_source_sha256'],installer.SOURCE_SHA)
  self.assertEqual(installer.LEGACY_SOURCE_SHA,'e49a9bfd4ef310d0938b0f6b253dac498aa7b9abd4c03f368de234546aaededd');self.assertEqual(installer.UNIT_SHA,hashlib.sha256(activation.UNIT.encode()).hexdigest())
 def test_fixed_download_is_isolated_pinned_bounded_and_verified_before_exec(self):
  import hashlib
  source=(self.repo/'tools/install_hermes_web_bridge.py').read_bytes();command=builder.quick_command(hashlib.sha256(source).hexdigest());args=shlex.split(command);self.assertEqual(args[:5],['/usr/bin/python3','-I','-S','-B','-c']);self.assertLess(len(command.encode()),3600)
  for raw,accepted in ((source,True),(source+b'\n# changed',False),(b'x'*65537,False)):
   response=Mock();response.read.return_value=raw;opener=Mock();opener.open.return_value=response;execute=Mock()
   with patch.object(request,'build_opener',return_value=opener) as factory,patch.object(sys,'argv',['fixture']):
    if accepted:exec(args[5],{'exec':execute});execute.assert_called_once();self.assertEqual(sys.argv,['bridge-upgrade','--upgrade','--restart'])
    else:
     with self.assertRaisesRegex(SystemExit,'BRIDGE_INSTALLER_DOWNLOAD_INVALID'):exec(args[5],{'exec':execute})
     execute.assert_not_called()
   response.read.assert_called_once_with(65537);response.close.assert_called_once_with();req=opener.open.call_args.args[0];self.assertEqual(req.full_url,builder.DOWNLOAD_URL);self.assertEqual(req.get_method(),'GET');self.assertEqual(factory.call_args.args[0].proxies,{});self.assertIsNone(factory.call_args.args[1].redirect_request(None,None,302,None,None,'https://invalid.example'))

if __name__=='__main__':unittest.main()
