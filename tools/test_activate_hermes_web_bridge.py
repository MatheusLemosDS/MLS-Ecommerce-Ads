import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock,patch
from urllib.error import HTTPError
from tools import activate_hermes_web_bridge as activation

KEY='fixture-'+'x'*40
class ActivationTests(unittest.TestCase):
 def setUp(self):
  tmp=tempfile.TemporaryDirectory(dir='/tmp');self.addCleanup(tmp.cleanup);self.root=Path(tmp.name)
  (self.root/'opt/brazacommerce-hermes-bridge').mkdir(parents=True)
  (self.root/'opt/brazacommerce-hermes-bridge/hermes_bridge.py').write_bytes(Path('web/bridge/hermes_bridge.py').read_bytes())
  (self.root/'etc/systemd/system').mkdir(parents=True)
  self.kw={'anchor':str(self.root),'owner':os.geteuid(),'group':os.getgid()}
 def test_configuration_permissions_idempotence_and_only_new_service(self):
  with patch.object(activation,'preflight'):
   activation.configure(KEY,**self.kw);activation.configure(KEY,**self.kw)
  secret=self.root/'etc/brazacommerce-hermes-bridge.env';unit=self.root/'etc/systemd/system/brazacommerce-hermes-bridge.service'
  self.assertEqual(secret.stat().st_mode&0o777,0o640);self.assertEqual(unit.stat().st_mode&0o777,0o644)
  self.assertEqual(secret.read_text(),'HERMES_BRIDGE_SECRET='+KEY+'\n');self.assertIn('User=hermes-mls',unit.read_text());self.assertIn('Group=1000',unit.read_text())
  self.assertNotIn('gateway.service',unit.read_text())
 def test_auth_failure_writes_no_files(self):
  with patch.object(activation,'preflight',side_effect=activation.ActivationError('BRIDGE_APP_KEY_REJECTED')):
   with self.assertRaises(activation.ActivationError):activation.configure(KEY,**self.kw)
  self.assertFalse((self.root/'etc/brazacommerce-hermes-bridge.env').exists())
 def test_preflight_key_only_in_header_and_error_body_discarded(self):
  body=io.BytesIO(b'PRIVATE_ERROR');exc=HTTPError('https://app.invalid',401,'private',{},body);opener=Mock();opener.open.side_effect=exc
  with patch.object(activation.request,'build_opener',return_value=opener):
   with self.assertRaisesRegex(activation.ActivationError,'KEY_REJECTED'):activation.preflight(KEY)
  self.assertTrue(body.closed);req=opener.open.call_args.args[0];self.assertEqual(req.full_url,'https://app.brazacommerce.com.br/api/hermes/heartbeat');self.assertNotIn(KEY,req.data.decode())
 def test_source_mismatch_stops_before_auth(self):
  (self.root/'opt/brazacommerce-hermes-bridge/hermes_bridge.py').write_bytes(b'CHANGED')
  with patch.object(activation,'preflight') as preflight:
   with self.assertRaisesRegex(activation.ActivationError,'SOURCE_INVALID'):activation.configure(KEY,**self.kw)
  preflight.assert_not_called()
 def test_conflict_and_symlink_preserve_existing_files(self):
  secret=self.root/'etc/brazacommerce-hermes-bridge.env';secret.write_bytes(b'PREEXISTING');secret.chmod(0o640)
  with patch.object(activation,'preflight'),self.assertRaisesRegex(activation.ActivationError,'CONFLICT'):activation.configure(KEY,**self.kw)
  self.assertEqual(secret.read_bytes(),b'PREEXISTING');secret.unlink();outside=self.root/'outside';outside.write_bytes(b'UNCHANGED');secret.symlink_to(outside)
  with patch.object(activation,'preflight'),self.assertRaises(OSError):activation.configure(KEY,**self.kw)
  self.assertEqual(outside.read_bytes(),b'UNCHANGED')
 def test_key_format_blocks_envfile_injection(self):
  for value in ('short',KEY+'\nOTHER=1','a'*32+';cmd'):
   with self.assertRaisesRegex(activation.ActivationError,'KEY_INVALID'):activation.preflight(value)
 def test_root_guard_before_prompt(self):
  with patch.object(activation.os,'geteuid',return_value=1000),patch.object(activation.getpass,'getpass') as prompt,patch('builtins.print'):
   self.assertEqual(activation.main(),1)
  prompt.assert_not_called()

 def test_main_uses_hidden_prompt_and_starts_only_new_service_no_secret_output(self):
  with patch.object(activation.os,'geteuid',return_value=0),patch.object(activation,'verify'),patch.object(activation,'check_runtime'),patch.object(activation,'existing_secret',return_value=None),patch.object(activation.getpass,'getpass',return_value=KEY),patch.object(activation,'activate') as activate,patch('builtins.print') as output:
   self.assertEqual(activation.main(['--restart']),0)
  activate.assert_called_once_with(KEY);self.assertNotIn(KEY,repr(output.call_args_list))
 def test_preflight_accepts_only_expected_ok_response(self):
  for raw,accepted in ((b'{"ok":true,"protocol":"hermes-finance-v1"}',True),(b'{"ok":true}',False),(b'{"ok":true,"protocol":"legacy"}',False),(b'{"ok":false}',False),(b'{"secret":"PRIVATE"}',False),(b'x'*1025,False)):
   response=Mock();response.__enter__=Mock(return_value=response);response.__exit__=Mock(return_value=False);response.status=200;response.read.return_value=raw;opener=Mock();opener.open.return_value=response
   with patch.object(activation.request,'build_opener',return_value=opener):
    if accepted:activation.preflight(KEY)
    else:
     with self.assertRaises(activation.ActivationError):activation.preflight(KEY)

 def test_existing_secret_reused_byte_for_byte_and_new_key_refused(self):
  with patch.object(activation,'preflight'):activation.configure(KEY,**self.kw)
  secret=self.root/'etc/brazacommerce-hermes-bridge.env';before=secret.stat();raw=secret.read_bytes()
  with patch.object(activation,'preflight') as preflight:activation.configure(None,**self.kw)
  preflight.assert_called_once_with(KEY);self.assertEqual(secret.read_bytes(),raw);self.assertEqual(secret.stat().st_ino,before.st_ino)
  with patch.object(activation,'preflight') as preflight,self.assertRaisesRegex(activation.ActivationError,'CONFLICT'):activation.configure('different-'+'x'*40,**self.kw)
  preflight.assert_not_called();self.assertEqual(secret.read_bytes(),raw)
 def test_existing_secret_main_never_prompts_and_restart_flag_is_required(self):
  with patch.object(activation.os,'geteuid',return_value=0),patch.object(activation,'verify'),patch.object(activation,'check_runtime'),patch.object(activation,'existing_secret',return_value=KEY),patch.object(activation.getpass,'getpass') as prompt,patch.object(activation,'activate') as activate,patch('builtins.print') as output:
   self.assertEqual(activation.main(['--restart']),0)
  prompt.assert_not_called();activate.assert_called_once_with(KEY);self.assertNotIn(KEY,repr(output.call_args_list))
  with patch.object(activation.os,'geteuid',return_value=0),patch.object(activation,'verify') as verify,patch.object(activation,'activate') as activate,patch('builtins.print'):
   self.assertEqual(activation.main([]),1)
  verify.assert_not_called();activate.assert_not_called()
 def test_drain_ack_requires_protocol_exact_state_and_no_running_job(self):
  for value,accepted in (({'ok':True,'protocol':activation.PROTOCOL,'draining':True,'safe_to_restart':True},True),({'ok':True,'protocol':activation.PROTOCOL,'draining':True,'safe_to_restart':False},False),({'ok':True,'protocol':activation.PROTOCOL},False),({'ok':True,'protocol':activation.PROTOCOL,'draining':False,'safe_to_restart':True},False)):
   response=Mock();response.__enter__=Mock(return_value=response);response.__exit__=Mock(return_value=False);response.status=200;response.read.return_value=json.dumps(value).encode();opener=Mock();opener.open.return_value=response
   with patch.object(activation.request,'build_opener',return_value=opener):
    if accepted:activation.preflight(KEY,drain=True)
    else:
     with self.assertRaises(activation.ActivationError):activation.preflight(KEY,drain=True)
   self.assertEqual(json.loads(opener.open.call_args.args[0].data),{'protocol':activation.PROTOCOL,'drain':True})
 def test_activation_restarts_explicitly_under_maintenance_and_releases_it(self):
  lock=os.open('/dev/null',os.O_RDONLY);calls=[Mock(returncode=0),Mock(returncode=0),Mock(returncode=0),Mock(returncode=0,stdout=b'active\n')]
  with patch.object(activation,'upgrade_lock',return_value=lock),patch.object(activation,'verify'),patch.object(activation,'check_runtime'),patch.object(activation,'preflight') as preflight,patch.object(activation,'configure') as configure,patch.object(activation.subprocess,'run',side_effect=calls) as run:activation.activate(KEY)
  self.assertEqual([call.kwargs for call in preflight.call_args_list],[{'drain':True},{'drain':True},{'drain':False}]);configure.assert_called_once_with(KEY)
  self.assertEqual(run.call_args_list[1].args[0],['/usr/bin/systemctl','enable','brazacommerce-hermes-bridge.service']);self.assertEqual(run.call_args_list[2].args[0],['/usr/bin/systemctl','restart','brazacommerce-hermes-bridge.service'])
 def test_busy_activation_never_writes_or_restarts_and_clears_maintenance(self):
  lock=os.open('/dev/null',os.O_RDONLY)
  with patch.object(activation,'upgrade_lock',return_value=lock),patch.object(activation,'verify'),patch.object(activation,'check_runtime'),patch.object(activation,'preflight',side_effect=[activation.ActivationError('BRIDGE_EXECUTION_IN_PROGRESS'),None]) as preflight,patch.object(activation,'configure') as configure,patch.object(activation.subprocess,'run') as run:
   with self.assertRaisesRegex(activation.ActivationError,'IN_PROGRESS'):activation.activate(KEY)
  configure.assert_not_called();run.assert_not_called();self.assertEqual(preflight.call_args_list[-1].kwargs,{'drain':False})

if __name__=='__main__':unittest.main()
