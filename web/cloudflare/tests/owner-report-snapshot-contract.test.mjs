import test from 'node:test';
import assert from 'node:assert/strict';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';

test('local owner snapshot rejects malformed or unknown monthly contracts before building any Worker',async()=>{
 for(const localReadSnapshotContract of [null,'business-month-view-v0','business-month-view-v7','business-month-view-v6?force=true',6,{},[]])await assert.rejects(compiledOwnerReportPage(false,{localReadSnapshot:true,localReadSnapshotContract}),/supported finite monthly-view contract/);
});
