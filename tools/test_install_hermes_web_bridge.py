import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock,patch
from tools import install_hermes_web_bridge as installer

class BridgeInstallTests(unittest.TestCase):
 def setUp(self):
  tmp=tempfile.TemporaryDirectory(dir='/tmp');self.addCleanup(tmp.cleanup);self.anchor=Path(tmp.name);(self.anchor/'opt').mkdir();self.kw={'_anchor':str(self.anchor),'_owner':os.geteuid()};self.target=self.anchor/'opt/brazacommerce-hermes-bridge/hermes_bridge.py'
 def test_reviewed_file_install_idempotent_no_service_or_secret_creation(self):
  self.assertEqual(installer.source(),Path('web/bridge/hermes_bridge.py').read_bytes())
  self.assertEqual(installer.install(**self.kw),'BRIDGE_INSTALLED');self.assertEqual(self.target.stat().st_mode&0o777,0o644);self.assertEqual(self.target.parent.stat().st_mode&0o777,0o755)
  self.assertEqual(installer.install(**self.kw),'BRIDGE_ALREADY_INSTALLED');self.assertEqual(list(self.target.parent.iterdir()),[self.target])
 def test_umask_does_not_make_new_directory_unreadable_by_hermes(self):
  old=os.umask(0o077)
  try:installer.install(**self.kw)
  finally:os.umask(old)
  self.assertEqual(self.target.parent.stat().st_mode&0o777,0o755)
 def test_conflicting_file_never_overwritten(self):
  installer.install(**self.kw);self.target.write_bytes(b'EXISTING_USER_VERSION')
  with self.assertRaisesRegex(ValueError,'CONFLICT'):installer.install(**self.kw)
  self.assertEqual(self.target.read_bytes(),b'EXISTING_USER_VERSION')
 def test_symlink_and_writable_parent_rejected(self):
  self.target.parent.mkdir();outside=self.anchor/'outside';outside.write_bytes(b'UNCHANGED');self.target.symlink_to(outside)
  with self.assertRaises(OSError):installer.install(**self.kw)
  self.assertEqual(outside.read_bytes(),b'UNCHANGED');self.target.unlink();self.target.parent.chmod(0o777)
  with self.assertRaisesRegex(ValueError,'PATH_INVALID'):installer.install(**self.kw)
 def test_artifact_integrity_rejects_changed_data_before_install(self):
  with patch.object(installer,'PACKED_SHA','0'*64),self.assertRaises(ValueError):installer.install(**self.kw)
  self.assertFalse(self.target.parent.exists())
 def test_nonroot_stops_before_filesystem_access(self):
  with patch.object(installer.os,'geteuid',return_value=1000),patch.object(installer.os,'open') as opened:
   with self.assertRaisesRegex(ValueError,'ROOT_REQUIRED'):installer.install()
  opened.assert_not_called()
 def test_partial_write_failure_cleans_own_file(self):
  with patch.object(installer.os,'fsync',side_effect=OSError('PRIVATE')):
   with self.assertRaises(OSError):installer.install(**self.kw)
  self.assertFalse(self.target.exists())

class BridgeUpgradeTests(unittest.TestCase):
 old=b"print('reviewed legacy fixture')\n"
 new=b"print('reviewed finance fixture')\n"
 def setUp(self):
  tmp=tempfile.TemporaryDirectory(dir='/tmp');self.addCleanup(tmp.cleanup);self.anchor=Path(tmp.name);self.directory=self.anchor/'opt/brazacommerce-hermes-bridge';self.directory.mkdir(parents=True);self.target=self.directory/'hermes_bridge.py';self.target.write_bytes(self.old);self.target.chmod(0o644)
  self.check=Mock();self.kw={'_anchor':str(self.anchor),'_owner':os.geteuid(),'_runtime_check':self.check}
  source=patch.object(installer,'source',return_value=self.new);source.start();self.addCleanup(source.stop)
  digest=patch.object(installer,'LEGACY_SOURCE_SHA',hashlib.sha256(self.old).hexdigest());digest.start();self.addCleanup(digest.stop)
 def test_reviewed_upgrade_backup_checks_and_idempotence(self):
  self.assertEqual(installer.upgrade(**self.kw),'BRIDGE_UPGRADED');self.assertEqual(self.target.read_bytes(),self.new);self.assertEqual((self.directory/installer.BACKUP_NAME).read_bytes(),self.old);self.assertEqual(self.target.stat().st_mode&0o777,0o644)
  self.assertEqual([call.args[0].name for call in self.check.call_args_list],['.hermes_bridge.finance-v1.new','hermes_bridge.py'])
  self.assertEqual(installer.upgrade(**self.kw),'BRIDGE_ALREADY_UPGRADED');self.assertEqual(sorted(path.name for path in self.directory.iterdir()),['hermes_bridge.py',installer.BACKUP_NAME])
 def test_custom_version_and_backup_conflict_are_preserved(self):
  self.target.write_bytes(b'CUSTOMIZED')
  with self.assertRaisesRegex(ValueError,'VERSION_NOT_REVIEWED'):installer.upgrade(**self.kw)
  self.assertEqual(self.target.read_bytes(),b'CUSTOMIZED');self.check.assert_not_called();self.target.write_bytes(self.old)
  backup=self.directory/installer.BACKUP_NAME;backup.write_bytes(b'CUSTOMIZED_BACKUP');backup.chmod(0o644)
  with self.assertRaisesRegex(ValueError,'BACKUP_CONFLICT'):installer.upgrade(**self.kw)
  self.assertEqual(backup.read_bytes(),b'CUSTOMIZED_BACKUP');self.assertEqual(self.target.read_bytes(),self.old)
 def test_failed_staging_runtime_preserves_original_and_removes_staging(self):
  self.check.side_effect=ValueError('BRIDGE_UPGRADE_RUNTIME_FAILED')
  with self.assertRaisesRegex(ValueError,'RUNTIME_FAILED'):installer.upgrade(**self.kw)
  self.assertEqual(self.target.read_bytes(),self.old);self.assertFalse((self.directory/'.hermes_bridge.finance-v1.new').exists());self.assertEqual((self.directory/installer.BACKUP_NAME).read_bytes(),self.old)
 def test_failed_final_runtime_rolls_back_and_keeps_backup(self):
  self.check.side_effect=[None,ValueError('BRIDGE_UPGRADE_RUNTIME_FAILED')]
  with self.assertRaisesRegex(ValueError,'RUNTIME_FAILED'):installer.upgrade(**self.kw)
  self.assertEqual(self.target.read_bytes(),self.old);self.assertEqual((self.directory/installer.BACKUP_NAME).read_bytes(),self.old);self.assertFalse(any(path.name.startswith('.') for path in self.directory.iterdir()))
 def test_failed_fsync_after_replace_restores_original(self):
  real_fsync=installer.os.fsync;calls=0
  def fail_once(fd):
   nonlocal calls
   calls+=1
   if calls==5:raise OSError('FSYNC_FIXTURE')
   return real_fsync(fd)
  with patch.object(installer.os,'fsync',side_effect=fail_once),self.assertRaises(OSError):installer.upgrade(**self.kw)
  self.assertEqual(self.target.read_bytes(),self.old);self.assertEqual((self.directory/installer.BACKUP_NAME).read_bytes(),self.old)
 def test_concurrent_target_change_before_replace_is_not_overwritten(self):
  self.check.side_effect=lambda _:self.target.write_bytes(b'CONCURRENT_CUSTOM_VERSION')
  with self.assertRaisesRegex(ValueError,'CONFLICT'):installer.upgrade(**self.kw)
  self.assertEqual(self.target.read_bytes(),b'CONCURRENT_CUSTOM_VERSION')
 def test_backup_symlink_and_held_lock_refuse_mutation(self):
  outside=self.anchor/'outside';outside.write_bytes(b'UNCHANGED');(self.directory/installer.BACKUP_NAME).symlink_to(outside)
  with self.assertRaises(OSError):installer.upgrade(**self.kw)
  self.assertEqual(outside.read_bytes(),b'UNCHANGED');self.assertEqual(self.target.read_bytes(),self.old);(self.directory/installer.BACKUP_NAME).unlink()
  with patch.object(installer.fcntl,'flock',side_effect=BlockingIOError),self.assertRaises(BlockingIOError):installer.upgrade(**self.kw)
  self.assertEqual(list(self.directory.iterdir()),[self.target])
 def test_no_rollback_over_a_version_changed_after_our_replace(self):
  def check(path):
   if path==self.target:self.target.write_bytes(b'NEW_OPERATOR_CHANGE');raise ValueError('RUNTIME_FIXTURE')
  self.check.side_effect=check
  with self.assertRaisesRegex(ValueError,'ROLLBACK_FAILED'):installer.upgrade(**self.kw)
  self.assertEqual(self.target.read_bytes(),b'NEW_OPERATOR_CHANGE');self.assertEqual((self.directory/installer.BACKUP_NAME).read_bytes(),self.old)
 def test_explicit_upgrade_main_does_not_configure_or_start_service(self):
  with patch.object(installer,'upgrade_and_restart',return_value='BRIDGE_UPGRADED') as upgrade,patch.object(installer,'install') as install,patch.object(installer.subprocess,'run') as run,patch('builtins.print'):
   self.assertEqual(installer.main(['--upgrade','--restart']),0)
  upgrade.assert_called_once_with();install.assert_not_called();run.assert_not_called()
 def test_failed_restart_restores_file_before_rollback_restart(self):
  restart=Mock(side_effect=ValueError('SERVICE_FIXTURE'));rollback=Mock()
  with self.assertRaisesRegex(ValueError,'SERVICE_FIXTURE'):installer.upgrade(**self.kw,_after_replace=restart,_after_rollback=rollback)
  self.assertEqual(self.target.read_bytes(),self.old);rollback.assert_called_once_with()

class BridgeMaintenanceTests(unittest.TestCase):
 key='fixture-'+'x'*40
 def test_protocol_and_drain_ack_are_required_before_a_restart(self):
  for value,accepted in (({'ok':True,'protocol':installer.PROTOCOL,'draining':True,'safe_to_restart':True},True),({'ok':True,'protocol':installer.PROTOCOL,'draining':True,'safe_to_restart':False},False),({'ok':True,'protocol':installer.PROTOCOL},False),({'ok':True,'protocol':installer.PROTOCOL,'draining':False,'safe_to_restart':True},False)):
   response=Mock();response.__enter__=Mock(return_value=response);response.__exit__=Mock(return_value=False);response.status=200;response.read.return_value=json.dumps(value).encode();opener=Mock();opener.open.return_value=response
   with patch.object(installer.request,'build_opener',return_value=opener):
    if accepted:installer.maintenance(self.key,True)
    else:
     with self.assertRaises(ValueError):installer.maintenance(self.key,True)
   req=opener.open.call_args.args[0];self.assertEqual(json.loads(req.data),{'protocol':installer.PROTOCOL,'drain':True});self.assertNotIn(self.key,req.data.decode())
 def orchestration(self):
  lock=patch.object(installer,'upgrade_lock',return_value=os.open('/dev/null',os.O_RDONLY));lock.start();self.addCleanup(lock.stop)
  private=patch.object(installer,'private_file',side_effect=[('HERMES_BRIDGE_SECRET='+self.key+'\n').encode(),b'REVIEWED_UNIT']);private.start();self.addCleanup(private.stop)
  digest=patch.object(installer,'UNIT_SHA',hashlib.sha256(b'REVIEWED_UNIT').hexdigest());digest.start();self.addCleanup(digest.stop)
  root=patch.object(installer.os,'geteuid',return_value=0);root.start();self.addCleanup(root.stop)
 def test_orchestrator_drains_renews_restarts_and_releases_without_secret_changes(self):
  self.orchestration()
  def upgraded(**options):options['_after_replace']();return 'BRIDGE_UPGRADED'
  with patch.object(installer,'maintenance') as maintenance,patch.object(installer,'upgrade',side_effect=upgraded),patch.object(installer,'restart_service') as restart:self.assertEqual(installer.upgrade_and_restart(),'BRIDGE_UPGRADED')
  self.assertEqual([call.args for call in maintenance.call_args_list],[(self.key,True),(self.key,True),(self.key,False)]);restart.assert_called_once_with()
 def test_busy_job_prevents_file_replacement_and_service_restart(self):
  self.orchestration()
  with patch.object(installer,'maintenance',side_effect=[ValueError('BRIDGE_EXECUTION_IN_PROGRESS'),None]) as maintenance,patch.object(installer,'upgrade') as upgrade,patch.object(installer,'restart_service') as restart:
   with self.assertRaisesRegex(ValueError,'IN_PROGRESS'):installer.upgrade_and_restart()
  upgrade.assert_not_called();restart.assert_not_called();self.assertEqual(maintenance.call_args_list[-1].args,(self.key,False))
 def test_drain_release_failure_is_reported_after_success_without_secret_output(self):
  self.orchestration()
  with patch.object(installer,'maintenance',side_effect=[None,ValueError('PRIVATE_FIXTURE')]),patch.object(installer,'upgrade',return_value='BRIDGE_UPGRADED'):
   with self.assertRaisesRegex(ValueError,'DRAIN_RELEASE_PENDING'):installer.upgrade_and_restart()
 def test_upgrade_and_restart_flags_are_both_explicit(self):
  for flags in (['--upgrade'],['--restart']):
   with patch.object(installer,'upgrade_and_restart') as upgrade,patch.object(installer,'install') as install,patch('builtins.print') as output:self.assertEqual(installer.main(flags),1)
   upgrade.assert_not_called();install.assert_not_called();self.assertIn('BRIDGE_UPGRADE_RESTART_REQUIRED',repr(output.call_args_list))

if __name__=='__main__':unittest.main()
