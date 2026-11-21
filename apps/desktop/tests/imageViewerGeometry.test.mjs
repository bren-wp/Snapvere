// Snapvere by Brendigo
import test from 'node:test';
import assert from 'node:assert/strict';
import { fitImageScale } from '../src/lib/imageViewerGeometry.ts';

test('large image fits within the available viewport even below 10% zoom', () => {
  const scale = fitImageScale(1120, 740, 10000, 10000);
  assert.ok(scale < 0.1, 'must not crop big images through an artificial 10% floor');
  assert.ok(scale * 10000 <= 1120 - 96);
  assert.ok(scale * 10000 <= 740 - 160);
});

test('regular portrait and landscape images retain proportional fit', () => {
  const landscape = fitImageScale(1120, 740, 3840, 2160);
  assert.ok(Math.abs(landscape - 1024 / 3840) < 1e-9);
  const portrait = fitImageScale(1120, 740, 1080, 3840);
  assert.ok(Math.abs(portrait - 580 / 3840) < 1e-9);
});

test('small images are never enlarged beyond 100 percent by Fit', () => {
  assert.equal(fitImageScale(1120, 740, 80, 80), 1);
});

test('narrow but valid stages fit without division by zero', () => {
  const scale = fitImageScale(80, 90, 600, 400);
  assert.ok(scale > 0);
  assert.ok(scale * 600 <= 1);
  assert.ok(scale * 400 <= 1);
});

test('unknown intrinsic and viewport dimensions use safe loading fallback', () => {
  assert.equal(fitImageScale(0, 740, 1920, 1080), 1);
  assert.equal(fitImageScale(1120, 740, 0, 1080), 1);
  assert.equal(fitImageScale(Infinity, 740, 1920, 1080), 1);
});
