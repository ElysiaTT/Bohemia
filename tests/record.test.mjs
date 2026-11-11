import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const sides = JSON.parse(await readFile(new URL('../src/data/tracklist.json', import.meta.url), 'utf8'));
// Exercise the actual controller without adding a DOM or browser dependency.
globalThis.document = {querySelectorAll: () => []};
const {initRecord} = await import('../src/scripts/record.ts');
delete globalThis.document;

class Element {
  dataset = {};
  attributes = new Map();
  listeners = new Map();
  textContent = '';
  inert = false;
  disabled = true;
  title = '';
  setAttribute(name, value) { this.attributes.set(name, value); }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  click() { for (const listener of this.listeners.get('click') || []) listener(); }
}

function fixture() {
  const button = new Element(), status = new Element(), root = new Element();
  status.textContent = 'Server-rendered Side A status';
  root.dataset.recordSide = 'side-b';
  const panels = sides.map(side => Object.assign(new Element(), {dataset: {
    recordPanel: side.id, sideLabel: side.side, sideName: side.name,
    sideCoverTitle: side.artwork.title, sideCredit: side.artwork.credit,
    sideHeading: side.heading, sideSubtitle: `${side.name.toUpperCase()} / ${side.heading}`,
    sideDescriptor: side.descriptor, sideIntent: side.intent, sideCount: String(side.tracks.length),
  }}));
  const faces = sides.map(side => Object.assign(new Element(), {dataset: {recordFace: side.id}}));
  const bindings = new Map([
    ['data-record-toggle', [button]], ['data-record-panel', panels], ['data-record-face', faces],
    ...['data-record-button-label', 'data-now-playing-side', 'data-now-playing-name',
      'data-record-hero-title', 'data-record-credit', 'data-now-playing-heading',
      'data-record-side-descriptor', 'data-record-side-intent', 'data-now-playing-count']
      .map(name => [name, [new Element()]]),
    ['data-record-side-subtitle', [new Element(), new Element()]],
  ]);
  root.querySelectorAll = selectors => selectors.split(',').flatMap(selector => bindings.get(selector.trim().slice(1,-1)) || []);
  root.querySelector = selector => selector === '#record-status' ? status : root.querySelectorAll(selector)[0] || null;
  return {root, button, status, panels, faces, bindings};
}

function assertSide(view, index) {
  const active = sides[index], next = sides[(index + 1) % sides.length];
  assert.equal(view.root.dataset.recordSide, active.id);
  assert.equal(view.button.attributes.get('aria-pressed'), String(index === 1));
  assert.equal(view.button.title, `翻至 ${next.side} — ${next.artwork.title}`);
  const expected = {
    'data-record-button-label': `翻至 ${next.side}`,
    'data-now-playing-side': active.side,
    'data-now-playing-name': active.artwork.title,
    'data-record-hero-title': active.artwork.title,
    'data-record-credit': active.artwork.credit,
    'data-now-playing-heading': active.heading,
    'data-record-side-subtitle': `${active.name.toUpperCase()} / ${active.heading}`,
    'data-record-side-descriptor': active.descriptor,
    'data-record-side-intent': active.intent,
    'data-now-playing-count': `${active.tracks.length} 个专栏`,
  };
  for (const [name, value] of Object.entries(expected)) {
    for (const node of view.bindings.get(name)) assert.equal(node.textContent, value, name);
  }
  for (const nodes of [view.panels, view.faces]) nodes.forEach((node, nodeIndex) => {
    assert.equal(node.inert, nodeIndex !== index);
    assert.equal(node.attributes.get('aria-hidden'), String(nodeIndex !== index));
  });
}

test('The record initializes to Side A, enables its button and preserves the initial status', () => {
  const view = fixture();
  initRecord(view.root);
  assertSide(view, 0);
  assert.equal(view.button.disabled, false);
  assert.equal(view.root.dataset.recordReady, 'true');
  assert.equal(view.status.textContent, 'Server-rendered Side A status');
});

test('Repeated and rapid flips keep every label, panel, face and announcement in the same state', () => {
  const view = fixture();
  initRecord(view.root);
  for (let click = 1; click <= 60; click++) {
    view.button.click();
    const index = click % 2, side = sides[index];
    assertSide(view, index);
    assert.equal(view.status.textContent, `当前 ${side.side}，${side.artwork.title}，${side.tracks.length} 个专栏。`);
  }
});

test('Reinitializing an active record leaves the selected side and single click handler intact', () => {
  const view = fixture();
  initRecord(view.root);
  view.button.click();
  initRecord(view.root);
  assertSide(view, 1);
  assert.equal(view.button.listeners.get('click').length, 1);
  view.button.click();
  assertSide(view, 0);
});
