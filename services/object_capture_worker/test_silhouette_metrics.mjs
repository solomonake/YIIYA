import {test} from 'node:test';
import assert from 'node:assert/strict';
import {silhouetteMetrics as score} from './silhouette-metrics.mjs';
test('exact overlap',()=>assert.equal(score([0,1,1],[0,1,1]).iou,1));
test('disjoint nonempty masks',()=>assert.equal(score([1,0],[0,1]).iou,0));
test('known partial overlap',()=>{const r=score([1,1,0,0],[0,1,1,1]);assert.equal(r.iou,1/4);assert.equal(r.precision,1/3);assert.equal(r.recall,1/2)});
test('empty foreground cannot receive perfect reward',()=>{assert.equal(score([0,0],[0,0]).eligible,false);assert.equal(score([1,0],[0,0]).iou,null)});
test('dimensions must agree',()=>assert.throws(()=>score([1],[1,0])));
