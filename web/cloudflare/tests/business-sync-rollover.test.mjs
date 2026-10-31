import test from 'node:test';
import * as api from '../src/business-sync.mjs';
import {rolloverScenarios,runRolloverScenario} from './business-sync-rollover-fixture.mjs';

for(const scenario of rolloverScenarios)test(`Brasília midnight collector guard: ${scenario}`,async t=>runRolloverScenario(t,api,scenario));
