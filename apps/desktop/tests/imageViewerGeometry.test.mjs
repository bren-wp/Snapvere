// Snapvere by Brendigo
import test from 'node:test';
import assert from 'node:assert/strict';
import { fitImageScale } from '../src/lib/imageViewerGeometry.ts';
import { modalFocusWrapIndex, viewerKeyboardShortcut } from '../src/lib/viewerKeyboard.ts';

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

test('viewer hotkeys do not hijack modified search, fullscreen or delete commands', () => {
  const hotkey = (key, ctrl = false, meta = false, alt = false, shift = false, video = false) =>
    viewerKeyboardShortcut(key, ctrl, meta, alt, shift, video);
  assert.equal(hotkey('f'), 'fullscreen');
  assert.equal(hotkey('F'), 'fullscreen');
  assert.equal(hotkey('f', true), null, 'Ctrl+F must not toggle fullscreen');
  assert.equal(hotkey('f', false, true), null, 'Cmd+F must not toggle fullscreen');
  assert.equal(hotkey('Delete'), 'delete');
  assert.equal(hotkey('Delete', true), null, 'Ctrl+Delete must not destroy a capture');
  assert.equal(hotkey('ArrowLeft'), 'previous');
  assert.equal(hotkey('ArrowLeft', true), null);
  assert.equal(hotkey('Escape'), 'escape');
  assert.equal(hotkey('F5'), null);
  assert.equal(hotkey('c', true), 'copy-image');
  assert.equal(hotkey('c', true, false, false, true), 'copy-path');
  assert.equal(hotkey('c', false, true, false, true), 'copy-path');
  assert.equal(hotkey('c', true, false, false, false, true), null,
    'Video Ctrl+C must not steal normal clipboard copy');
  assert.equal(hotkey('c', true, false, false, true, true), 'copy-path');
  assert.equal(hotkey('f', false, false, false, true), null);
  assert.equal(hotkey('c', true, false, true), null);
  assert.equal(hotkey('c', true, true), null);
});

test('modal viewer traps Tab at dialog boundaries without hijacking inner controls', () => {
  assert.equal(modalFocusWrapIndex(-1, 3, false), 0);
  assert.equal(modalFocusWrapIndex(-1, 3, true), 2);
  assert.equal(modalFocusWrapIndex(0, 3, true), 2);
  assert.equal(modalFocusWrapIndex(2, 3, false), 0);
  assert.equal(modalFocusWrapIndex(1, 3, false), null);
  assert.equal(modalFocusWrapIndex(1, 3, true), null);
  assert.equal(modalFocusWrapIndex(0, 0, false), null);
  assert.equal(modalFocusWrapIndex(0, -1, false), null);
});
