import contextlib
import copy
import hashlib
import importlib.util
from pathlib import Path
from datetime import datetime, timezone
import json
import os
import tempfile
import sys
import unittest
from unittest.mock import Mock,patch
spec=importlib.util.spec_from_file_location('bridge',Path(__file__).with_name('hermes_bridge.py'));bridge=importlib.util.module_from_spec(spec);spec.loader.exec_module(bridge)

STAMP=int(datetime(2026,10,12,12,tzinfo=timezone.utc).timestamp())

def context_fixture(state='READY'):
 pending=[] if state=='READY' else ['PRODUCTION_COST_INCOMPLETE'] if state=='PARTIAL_COSTS' else ['RETURNS_NOT_RECONCILED'] if state=='PROVISIONAL' else ['ADS_UNAVAILABLE']
 known=1000 if state=='PARTIAL_COSTS' else 2000
 totals={'sales_cents':20000,'known_sales_cents':20000,'expected_repass_cents':18000,'production_cost_cents':None if state=='PARTIAL_COSTS' else 2000,'known_production_cost_cents':known,'invoice_tax_cents':8605,'ads_spend_cents':None if state=='WAITING' else 1000,'external_expenses_cents':500,'recharge_addback_cents':0,'net_estimate_cents':5895 if state=='READY' else None,'net_profit_cents':None,'ads_attributed_gmv_cents':20000,'ads_calculated_roas_raw':'20.000000','tacos_bps':None if state=='WAITING' else 500}
 summary={'schema':'monthly_financial_summary_v1','state':state,'balance_cents':None if state=='WAITING' else 7895-known,'before_production_cents':None if state=='WAITING' else 7895,'known_production_cents':known,'production_complete':state!='PARTIAL_COSTS','costs_after_payout_cents':None if state=='WAITING' else known+10105,'production_coverage':{'total_units':2,'known_units':1 if state=='PARTIAL_COSTS' else 2,'pending_units':1 if state=='PARTIAL_COSTS' else 0,'pending_variants':1 if state=='PARTIAL_COSTS' else 0,'pending_products':1 if state=='PARTIAL_COSTS' else 0},'pending':pending.copy(),'basis':'PAID_MONTH_CURRENT_COSTS_AFTER_ADS_TAX_EXPENSES'}
 coverage={'orders':4,'paid':2,'completed':1,'ongoing':1,'cancelled':1,'cancel_pending':0,'unpaid':1,'other':0,'unknown':0,'payment_covered':2,'payment_missing':0,'returns':1 if state=='PROVISIONAL' else 0,'returns_unknown':0}
 action={'code':'COMPLETE_PRODUCTION_COSTS' if state=='PARTIAL_COSTS' else 'RECONCILE_RETURNS' if state=='PROVISIONAL' else 'REFRESH_CALENDAR_ADS' if state=='WAITING' else 'CHECK_STOCK_AND_CAMPAIGN','priority':'MEDIUM' if state=='READY' else 'HIGH','label':'Conferir ação e estoque','detail':'Confira os dados antes de qualquer decisão. Ads LOCKED.','metric_refs':['known_production_cost_cents','net_estimate_cents']}
 return {'schema':'hermes_financial_context_v1','analysis_date':'2026-10-11','captured_at':STAMP,'available':True,'unavailable_code':None,'monthly':{'month':'2026-10','start_date':'2026-10-01','end_date':'2026-10-12','checked_at':STAMP,'status':'COMPLETE','summary':summary,'totals':totals,'order_coverage':coverage,'pending':pending.copy(),'source_checked_at':{'finance_oldest_at':STAMP-60,'finance_latest_at':STAMP,'ads_at':STAMP},'versions':{'bindings':2,'costs':3,'cost_rules':1,'tax_policy':1,'expenses':1,'classifications':1},'top_actions':[action],'product_references':[{'item_id':'201','units':2,'exclusive_repass_cents':18000,'exclusive_production_cents':None if state=='PARTIAL_COSTS' else 2000,'exclusive_contribution_cents':16000 if state=='READY' else None,'mixed_orders':0,'basis':'EXCLUSIVE_BEFORE_ADS_DAS'}],'actual_profit_cents':None,'execution':'READ_ONLY'}}

def bind_context(job,context,raw=None):
 raw=json.dumps(context,ensure_ascii=False,separators=(',',':')) if raw is None else raw
 job['financial_context']=raw
 framing=b'{"job_id":'+json.dumps(job['id'],ensure_ascii=False,separators=(',',':')).encode()+b',"context":'+raw.encode()+b'}'
 job['financial_context_fingerprint']=hashlib.sha256(framing).hexdigest()
 return job

class BridgeTests(unittest.TestCase):
 def job(self,state='READY'):
  return bind_context({'id':'00000000-0000-4000-8000-000000000001','lease':'fixture-lease','task':json.dumps({'type':'daily_review','shop_id':'1178167501','start_date':'2026-10-11','end_date':'2026-10-11','ads_execution':'LOCKED'}),'settings_snapshot':json.dumps({'regular_cents':1800,'mixed_cents':2100,'plus_cents':2300,'ad_share_percent':40})},context_fixture(state))
 def test_monthly_cents_and_deterministic_actions_replace_old_kit_references(self):
  prompt=bridge.parse_job(self.job());self.assertIn('CENTAVOS DE REAL',prompt);self.assertIn('Ads LOCKED',prompt);self.assertIn('get_daily somente para esse dia',prompt);self.assertIn('mes e o intervalo',prompt);self.assertIn('"invoice_tax_cents":8605',prompt);self.assertIn('CHECK_STOCK_AND_CAMPAIGN',prompt)
  for old in ('18.00','21.00','23.00','regular_cents','mixed_cents','plus_cents','40%'):self.assertNotIn(old,prompt)
  self.assertLessEqual(len(prompt.encode()),bridge.PROMPT_LIMIT)
 def test_legacy_settings_cannot_override_financial_values_or_block_custom_product_analysis(self):
  job=self.job();job['settings_snapshot']=json.dumps({'regular_cents':True,'mixed_cents':'PRIVATE_INVALID_LEGACY','plus_cents':None});prompt=bridge.parse_job(job);self.assertNotIn('PRIVATE_INVALID_LEGACY',prompt);self.assertIn('"known_production_cost_cents":2000',prompt)
  job['settings_snapshot']='[]'
  with self.assertRaisesRegex(bridge.BridgeError,'SETTINGS_INVALID'):bridge.parse_job(job)
 def test_arbitrary_task_foreign_shop_and_extra_fields_rejected(self):
  for changes in ({'type':'shell'},{'shop_id':'2'},{'ads_execution':'UNLOCKED'},{'command':'rm -rf /'}):
   job=self.job();task=json.loads(job['task']);task.update(changes);job['task']=json.dumps(task)
   with self.assertRaises(bridge.BridgeError):bridge.parse_job(job)
 def test_all_summary_states_and_unavailable_snapshot_are_supported_without_inventing_profit(self):
  for state in ('READY','PARTIAL_COSTS','PROVISIONAL','WAITING'):
   prompt=bridge.parse_job(self.job(state));self.assertIn('"state":"'+state+'"',prompt);self.assertIn('nunca confirme lucro real recebido',prompt)
  job=self.job();context=context_fixture();context.update(available=False,unavailable_code='LEGACY_CONTEXT_MISSING',monthly=None);bind_context(job,context)
  prompt=bridge.parse_job(job);self.assertIn('"monthly":null',prompt);self.assertIn('LEGACY_CONTEXT_MISSING',prompt)
 def test_missing_oversized_duplicate_and_nonfinite_contexts_stop_before_any_cli_call(self):
  for raw in (None,'x'*12289,'{"schema":"x","schema":"y"}','{"amount":NaN}','{"amount":Infinity}'):
   job=self.job();job['financial_context']=raw
   with patch.object(bridge.subprocess,'Popen') as run,self.assertRaises(bridge.BridgeError):bridge.execute(job,Mock())
   run.assert_not_called()
 def test_unknown_or_unsafe_context_fields_types_and_arithmetic_are_rejected(self):
  changes=[lambda c:c.update(secret='PRIVATE'),lambda c:c.update(available=1),lambda c:c.update(captured_at=True),lambda c:c['monthly'].update(execution='WRITE'),lambda c:c['monthly'].update(actual_profit_cents=0),lambda c:c['monthly']['totals'].update(net_profit_cents=0),lambda c:c['monthly']['totals'].update(ads_spend_cents=10.0),lambda c:c['monthly']['totals'].update(sales_cents=True),lambda c:c['monthly']['summary'].update(balance_cents=5896),lambda c:c['monthly']['summary']['production_coverage'].update(known_units=3),lambda c:c['monthly']['versions'].update(costs=0),lambda c:c['monthly']['top_actions'][0].update(metric_refs=['token']),lambda c:c['monthly']['top_actions'][0].update(code='RUN_SHELL'),lambda c:c['monthly']['top_actions'][0].update(priority='IMMEDIATE'),lambda c:c['monthly']['top_actions'][0].update(label='PRIVATE\nURL'),lambda c:c['monthly']['product_references'][0].update(buyer_name='PRIVATE')]
  for change in changes:
   job=self.job();context=context_fixture();change(context);bind_context(job,context)
   with self.assertRaises(bridge.BridgeError):bridge.parse_job(job)
 def test_context_dates_cannot_cross_task_month_or_claim_a_future_snapshot(self):
  changes=[lambda c:c.update(analysis_date='2026-10-10'),lambda c:c.update(captured_at=1),lambda c:c['monthly'].update(month='2026-09'),lambda c:c['monthly'].update(end_date='2026-11-01'),lambda c:c['monthly'].update(checked_at=STAMP+61)]
  for change in changes:
   job=self.job();context=context_fixture();change(context);bind_context(job,context)
   with self.assertRaises(bridge.BridgeError):bridge.parse_job(job)
 def test_pending_sources_and_product_contribution_must_match_financial_evidence(self):
  changes=[lambda c:c['monthly']['order_coverage'].update(returns=1),lambda c:c['monthly']['order_coverage'].update(payment_covered=1,payment_missing=1),lambda c:c['monthly']['source_checked_at'].update(finance_oldest_at=None,finance_latest_at=None),lambda c:c['monthly']['source_checked_at'].update(ads_at=None),lambda c:c['monthly']['source_checked_at'].update(finance_oldest_at=STAMP-901),lambda c:c['monthly']['product_references'][0].update(exclusive_contribution_cents=16001),lambda c:c['monthly']['totals'].update(tacos_bps=501),lambda c:c['monthly']['totals'].update(known_sales_cents=19999)]
  for change in changes:
   job=self.job();context=context_fixture();change(context);bind_context(job,context)
   with self.assertRaises(bridge.BridgeError):bridge.parse_job(job)
  job=self.job('PROVISIONAL');context=context_fixture('PROVISIONAL');monthly=context['monthly'];monthly['pending']=monthly['summary']['pending']=['FINANCIAL_SOURCE_STALE'];monthly['order_coverage']['returns']=0;monthly['source_checked_at']['finance_oldest_at']=STAMP-1200;bind_context(job,context)
  self.assertIn('FINANCIAL_SOURCE_STALE',bridge.parse_job(job))
 def test_fingerprint_binds_job_and_exact_snapshot_bytes(self):
  job=self.job();job['id']='00000000-0000-4000-8000-000000000002'
  with self.assertRaisesRegex(bridge.BridgeError,'FINGERPRINT'):bridge.parse_job(job)
  job=self.job();job['financial_context']=job['financial_context'].replace('5895','5894')
  with self.assertRaisesRegex(bridge.BridgeError,'FINGERPRINT'):bridge.parse_job(job)
 def test_javascript_snapshot_unicode_and_backslash_fingerprint_is_accepted_without_reencoding(self):
  job=self.job();context=context_fixture();context['monthly']['top_actions'][0]['detail']='Ação infantil: confira "P\\G" e preço; estampa 🟢 sem instruções.'
  program="import crypto from 'node:crypto';import{projectHermesFinancialContext}from'./web/cloudflare/src/hermes-financial-context.mjs';let raw='';for await(const chunk of process.stdin)raw+=chunk;const input=JSON.parse(raw);const context=projectHermesFinancialContext(input.context);if(!context)throw Error('FIXTURE_CONTEXT_INVALID');const payload=JSON.stringify(context);const fingerprint=crypto.createHash('sha256').update(JSON.stringify({job_id:input.job_id,context}),'utf8').digest('hex');process.stdout.write(JSON.stringify({payload,fingerprint}));"
  result=bridge.subprocess.run(['node','--input-type=module','-e',program],input=json.dumps({'job_id':job['id'],'context':context},ensure_ascii=False).encode(),stdout=bridge.subprocess.PIPE,stderr=bridge.subprocess.PIPE,check=True,timeout=10)
  data=json.loads(result.stdout);job.update(financial_context=data['payload'],financial_context_fingerprint=data['fingerprint']);prompt=bridge.parse_job(job);self.assertIn('estampa 🟢',prompt);self.assertIn('P\\\\G',prompt)
 def test_real_javascript_context_builder_agrees_with_python_for_all_financial_states(self):
  program='''import crypto from 'node:crypto';
import{buildHermesFinancialContext}from'./web/cloudflare/src/hermes-financial-context.mjs';
import{buildAdsMeasurement}from'./web/cloudflare/src/ads-measurement.mjs';
import{buildAdsCalendar}from'./web/cloudflare/src/ads-calendar.mjs';
const stamp=Date.parse('2026-10-12T12:00:00Z')/1000,selection={start_date:'2026-10-01',end_date:'2026-10-12'};
const daily=Array.from({length:12},(_,i)=>({date:'2026-10-'+String(i+1).padStart(2,'0'),expense:i===11?'10':'0',broad_gmv:i===11?'200':'0',broad_order:i===11?2:0,broad_roas:20,direct_gmv:0,direct_order:0,direct_roas:0}));
const ads=buildAdsCalendar([buildAdsMeasurement({status:'ok',connected:true,shop:{id:1178167501},period:selection,balance:9999,daily},selection,stamp)],selection,stamp);
const base={schema:'business_month_v1',month:'2026-10',...selection,status:'COMPLETE',checked_at:stamp,progress:{windows_total:1,windows_complete:1,pages_read:1,order_capacity:5},coverage:{orders:4,paid:2,completed:1,ongoing:1,cancelled:1,cancel_pending:0,unpaid:1,other:0,unknown:0,payment_covered:2,payment_missing:0,returns:0,returns_unknown:0},sales_cents:20000,known_sales_cents:20000,expected_repass_cents:18000,known_expected_repass_cents:18000,production_cost_cents:2000,known_production_cost_cents:2000,invoice_tax_cents:8605,known_invoice_tax_cents:8605,ads_adjustment_cents:0,ads,expenses:{revision:1,external_expenses_cents:500,recharge_treatment:'UNCONFIRMED',updated_at:'2026-10-12T12:00:00Z'},result:{net_estimate_cents:5895,net_profit_cents:null,net_margin_bps:2947,pending:[],basis:'PAID_ORDER_CREATE_MONTH_AND_CALENDAR_ADS_ESTIMATE'},unmapped_variants:[],bindings_revision:2,costs_revision:3,tax:{schema:'business_month_tax_v1',regime:'MEI',year:2026,policy_revision:1,monthly_das_cents:8605,tax_cents:8605,status:'DECLARED',source:'OPERATOR_DECLARED_DAS',basis:'MONTHLY_COMPETENCE_NO_PRORATION'},source_checked_at:{finance_oldest_at:stamp-60,finance_latest_at:stamp,ads_at:stamp}};
const output=[];
for(const state of ['READY','PARTIAL_COSTS','PROVISIONAL','WAITING','UNAVAILABLE']){
 const frame=structuredClone(base);
 if(state!=='READY'){frame.result.net_estimate_cents=null;frame.result.net_margin_bps=null;}
 if(state==='PARTIAL_COSTS'){frame.production_cost_cents=null;frame.known_production_cost_cents=1000;frame.unmapped_variants=[{item_id:'201',model_id:'0',quantity:1}];frame.result.pending=['PRODUCTION_COST_INCOMPLETE'];}
 if(state==='PROVISIONAL'){frame.coverage.returns=1;frame.result.pending=['RETURNS_NOT_RECONCILED'];}
 if(state==='WAITING'){frame.ads=null;frame.source_checked_at.ads_at=null;frame.result.pending=['ADS_UNAVAILABLE'];}
 const context=buildHermesFinancialContext(state==='UNAVAILABLE'?null:frame,{analysisDate:'2026-10-11',capturedAt:stamp});
 if(!context||state!=='UNAVAILABLE'&&(!context.available||context.monthly.summary.state!==state))throw Error('FIXTURE_BUILD_INVALID_'+state);
 const job_id='00000000-0000-4000-8000-000000000001',payload=JSON.stringify(context),fingerprint=crypto.createHash('sha256').update(JSON.stringify({job_id,context}),'utf8').digest('hex');output.push({state,payload,fingerprint});
}
process.stdout.write(JSON.stringify(output));'''
  result=bridge.subprocess.run(['node','--input-type=module','-e',program],stdout=bridge.subprocess.PIPE,stderr=bridge.subprocess.PIPE,check=True,timeout=10)
  for value in json.loads(result.stdout):
   job=self.job();job.update(financial_context=value['payload'],financial_context_fingerprint=value['fingerprint']);prompt=bridge.parse_job(job);self.assertIn('CONTEXTO_FINANCEIRO_JSON',prompt)
 def test_top_three_limit_and_distinct_evidence_are_enforced(self):
  for kind in ('actions','refs','products'):
   job=self.job();context=context_fixture();monthly=context['monthly']
   if kind=='actions':monthly['top_actions']*=4
   elif kind=='refs':monthly['top_actions'][0]['metric_refs']=['sales_cents']*2
   else:monthly['product_references']*=4
   bind_context(job,context)
   with self.assertRaises(bridge.BridgeError):bridge.parse_job(job)
 def test_only_total_cost_accepted_rounded_up_and_missing_stays_unknown(self):
  self.assertEqual(bridge.reported_cost({'total_including_auxiliary':{'estimated_cost_usd':0.5518}}),56)
  for report in ({'estimated_cost_usd':1},{'total_including_auxiliary':{'estimated_cost_usd':True}},{'total_including_auxiliary':{'estimated_cost_usd':'NaN'}}):self.assertIsNone(bridge.reported_cost(report))
 def test_root_rejected_before_cli_exec(self):
  with patch.object(bridge.os,'geteuid',return_value=0),patch.object(bridge.subprocess,'run') as run:
   with self.assertRaises(bridge.BridgeError):bridge.check_runtime()
  run.assert_not_called()
 def test_secret_not_in_cli_environment(self):
  with patch.dict(os.environ,{'HERMES_BRIDGE_SECRET':'PRIVATE','HERMES_HOME':'OTHER','HERMES_PROFILE':'OTHER'}):env=bridge.client_env()
  for key in ('HERMES_BRIDGE_SECRET','HERMES_HOME','HERMES_PROFILE'):self.assertNotIn(key,env)
 def test_bridge_operations_not_generic_requests_and_protocol_is_required(self):
  api=bridge.API('fixture-'+'x'*32)
  with self.assertRaises(bridge.BridgeError):api.send('arbitrary',{})
  for operation in ('heartbeat','claim'):
   with self.assertRaises(bridge.BridgeError):api.send(operation,{})
 def test_protocol_ack_is_required_and_utf8_finish_preserves_fingerprint(self):
  for body,success in (({'ok':True},False),({'ok':True,'protocol':bridge.PROTOCOL},True),({'ok':True,'protocol':bridge.PROTOCOL,'draining':True,'safe_to_restart':False},True)):
   response=Mock(status=200);response.read.return_value=json.dumps(body).encode();opener=Mock();opener.open.return_value=contextlib.nullcontext(response);api=bridge.API('fixture-'+'x'*32);api.opener=opener
   if success:self.assertEqual(api.send('heartbeat',{'protocol':bridge.PROTOCOL}),body)
   else:
    with self.assertRaises(bridge.BridgeError):api.send('heartbeat',{'protocol':bridge.PROTOCOL})
  response=Mock(status=200);response.read.return_value=b'{"ok":true}';opener.open.return_value=contextlib.nullcontext(response)
  fingerprint='a'*64;api.send('finish',{'result':'Ação 🟢','financial_context_fingerprint':fingerprint});req=opener.open.call_args.args[0];self.assertIn('Ação 🟢'.encode(),req.data);self.assertEqual(json.loads(req.data)['financial_context_fingerprint'],fingerprint)
 def test_redirect_refused(self):self.assertIsNone(bridge.NoRedirect().redirect_request(None,None,302,'',{},'https://other.invalid'))
 def fixture_program(self,directory,text):
  program=Path(directory)/'hermes-fixture';program.write_text('#!'+sys.executable+'\nimport sys,json\nfrom pathlib import Path\nassert sys.argv[sys.argv.index("-t")+1]=="skills,memory,session_search,todo,mls_ads_readonly"\nassert "HERMES_BRIDGE_SECRET" not in __import__("os").environ\nPath(sys.argv[sys.argv.index("--usage-file")+1]).write_text(json.dumps({"total_including_auxiliary":{"estimated_cost_usd":0.5518}}))\nprint('+repr(text)+')\n');program.chmod(0o700);return program
 def test_real_subprocess_transport_is_bounded_and_appends_trusted_financial_reference(self):
  job=self.job()
  with tempfile.TemporaryDirectory() as directory:
   program=self.fixture_program(directory,'Análise fixture 🟢. Ads LOCKED.')
   with patch.object(bridge,'LAUNCHER',str(program)),patch.object(bridge,'HOME_DIR',directory):report=bridge.execute(job,Mock())
  self.assertEqual(report['status'],'completed');self.assertEqual(report['cost_cents'],56);self.assertTrue(report['result'].startswith('Análise fixture 🟢. Ads LOCKED.'));self.assertIn('2026-10',report['result']);self.assertIn('2026-10-12T12:00:00Z',report['result']);self.assertIn(job['financial_context_fingerprint'],report['result']);self.assertEqual(report['financial_context_fingerprint'],job['financial_context_fingerprint'])
 def test_report_utf16_limit_reserves_reference_and_rejects_emoji_overflow(self):
  for text in ('x'*12000,'🟢'*6000):
   with tempfile.TemporaryDirectory() as directory:
    program=self.fixture_program(directory,text)
    with patch.object(bridge,'LAUNCHER',str(program)),patch.object(bridge,'HOME_DIR',directory),self.assertRaisesRegex(bridge.BridgeError,'OUTPUT_LIMIT'):bridge.execute(self.job(),Mock())
 def test_main_announces_protocol_and_never_reclaims_after_a_finish_failure(self):
  job=self.job();api=Mock();api.send.side_effect=lambda operation,body: {'job':job} if operation=='claim' else {} if operation=='heartbeat' else (_ for _ in ()).throw(bridge.BridgeError('PRIVATE'))
  with patch.object(sys,'argv',['bridge','--once']),patch.object(bridge,'check_runtime'),patch.object(bridge,'API',return_value=api),patch.dict(os.environ,{'HERMES_BRIDGE_SECRET':'fixture-'+'s'*32}),patch.object(bridge,'execute',return_value={'id':job['id'],'lease':job['lease'],'financial_context_fingerprint':job['financial_context_fingerprint'],'status':'completed','cost_cents':1,'result':'Fixture'}),patch('builtins.print'):
   self.assertEqual(bridge.main(),1)
  self.assertEqual([call.args[0] for call in api.send.call_args_list],['heartbeat','claim','finish']);self.assertEqual(api.send.call_args_list[0].args[1],{'protocol':bridge.PROTOCOL});self.assertEqual(api.send.call_args_list[1].args[1],{'protocol':bridge.PROTOCOL})
 def test_unsupported_help_does_not_execute_analysis(self):
  target=Mock();target.is_file.return_value=True;target.parents=[];target.stat.return_value=Mock(st_uid=1000,st_mode=0o755)
  with patch.object(bridge.os,'geteuid',return_value=1000),patch.object(bridge.Path,'resolve',return_value=target),patch.object(bridge.subprocess,'run',return_value=Mock(returncode=0,stdout=b'old CLI without flags')) as run:
   with self.assertRaisesRegex(bridge.BridgeError,'UNSUPPORTED'):bridge.check_runtime()
  self.assertEqual(run.call_args.args[0],[bridge.LAUNCHER,'--help'])

if __name__=='__main__':unittest.main()
