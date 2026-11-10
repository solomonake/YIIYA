import {test} from 'node:test';import assert from 'node:assert/strict';
import {inverseRadialMap} from './radial-distortion.mjs';
const close=(a,b)=>a.forEach((x,i)=>assert.ok(Math.abs(x-b[i])<1e-6));
test('identity and optical center',()=>{const f=inverseRadialMap([3,4],[0,0],10,10);close(f(8,9),[8,9]);close(f(3,4),[3,4])});
test('inverse constant magnification',()=>close(inverseRadialMap([5,5],[1,1],10,10)(9,7),[7,6]));
test('reject nonmonotone or malformed calibration',()=>{for(const table of [[0,-2],[0,NaN],[]])assert.throws(()=>inverseRadialMap([5,5],table,10,10))});
test('known linear radial ramp inversion',()=>{const rmax=Math.hypot(5,5),r=2,m=.2*r/rmax;close(inverseRadialMap([5,5],[0,.2],10,10)(5+r*(1+m),5),[7,5])});
