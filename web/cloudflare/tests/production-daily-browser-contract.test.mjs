import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyProductionFixture} from './production-daily-browser-fixture.mjs';

test('daily manufacturing fixture rejects malformed monthly view contracts before creating any ledger',async()=>{
 for(const monthlyViewContract of [null,6,{},[],'business-month-view-v7','business-month-view-v6?force=true'])await assert.rejects(dailyProductionFixture({monthlyViewContract}),/supported monthly view contract/);
});
