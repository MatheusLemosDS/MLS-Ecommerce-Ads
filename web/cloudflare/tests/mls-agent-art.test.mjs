import test from 'node:test';
import assert from 'node:assert/strict';
import {MLS_AGENT_ROBOT_SVG,MLS_COMMAND_GLOBE_SVG} from '../src/mls-agent-art.mjs';

test('repeated native artwork stays decorative and independent of external assets or SVG IDs',()=>{
 for(const artwork of [MLS_AGENT_ROBOT_SVG,MLS_COMMAND_GLOBE_SVG]){
  assert.match(artwork,/^<svg\b/);
  assert.match(artwork,/aria-hidden="true"/);
  assert.match(artwork,/focusable="false"/);
  assert.doesNotMatch(artwork,/\bid\s*=|\b(?:href|src)\s*=|url\s*\(|\bon\w+\s*=/i);
  assert.doesNotMatch(artwork,/<(?:script|foreignObject|image|animate\w*|set)\b/i);
  assert.doesNotMatch(artwork,/<text\b|R\$|\b(?:fetch|setInterval)\s*\(/i);
 }
});
