import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
const previous = new Map();
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'CustomEvent', 'Event', 'MutationObserver']) {
  previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import('react');
const { render, fireEvent, act, cleanup, waitFor } = await import('@testing-library/react');
Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) }, configurable: true });
dom.window.HTMLMediaElement.prototype.play = async () => {};
Object.defineProperty(dom.window.HTMLVideoElement.prototype, 'videoWidth', { get: () => 1280 });
Object.defineProperty(dom.window.HTMLVideoElement.prototype, 'videoHeight', { get: () => 720 });
const cache = new URL('../node_modules/.cache/', import.meta.url);
await mkdir(cache, { recursive: true });
const dir = await mkdtemp(new URL('camera-ui-', cache));
const entry = `${dir}/Camera.mjs`;
await build({
  entryPoints: [new URL('../src/components/CameraCaptureModal.tsx', import.meta.url).pathname],
  bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic', outfile: entry,
  plugins: [{ name: 'mock-database', setup(builder) {
    builder.onResolve({ filter: /\/lib\/api$/ }, () => ({ path: 'api', namespace: 'camera-test' }));
    builder.onLoad({ filter: /.*/, namespace: 'camera-test' }, () => ({ contents: 'export const addMultipleProducts = async () => { throw new Error("No database writes permitted in this test"); };', loader: 'js' }));
  } }]
});
const { CameraCaptureModal } = await import(pathToFileURL(entry).href);
function setup() {
  dom.window.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
  dom.window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,aW1hZ2U=';
  return render(React.createElement(CameraCaptureModal, { isOpen: true, onClose() { assert.fail('analysis must not close the modal'); }, availableCategories: ['Bebidas', 'Diversos'] }));
}
async function capture(ui) {
  const button = await ui.findByRole('button', { name: 'Tirar Foto do Produto' });
  await waitFor(() => assert.equal(button.disabled, false));
  fireEvent.click(button);
}
afterEach(cleanup);
after(async () => {
  await rm(dir, { recursive: true, force: true });
  dom.window.close();
  for (const [name, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

test('canvas capture sends raw Base64 and fills only name/category', async t => {
  let finish;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(JSON.parse(options.body).imageBase64, 'aW1hZ2U=');
    assert.equal(JSON.parse(options.body).mimeType, 'image/jpeg');
    return new Promise(resolve => { finish = resolve; });
  });
  const ui = setup();
  await capture(ui);
  assert.ok(ui.getByText('Processando imagem com IA...'));
  await act(async () => { finish(Response.json({ success: true, product: { name: 'Suco de Uva', category: 'Bebidas', stock: 99, suggestedSalePrice: 100 } })); });
  assert.ok(ui.getByDisplayValue('Suco de Uva'));
  assert.equal(ui.container.querySelector('select').value, 'Bebidas');
  const manualNumbers = ui.container.querySelectorAll('input[type="number"]');
  assert.equal(manualNumbers.length, 3);
  for (const input of manualNumbers) assert.equal(input.value, '');
});

for (const failure of ['network', 'quota', 'canvas']) {
  test(`${failure} failure keeps manual entry open and focuses the name`, async t => {
    t.mock.method(globalThis, 'fetch', async () => {
      if (failure === 'network') throw new TypeError('Failed to fetch');
      return Response.json({ error: 'Quota' }, { status: 429 });
    });
    const ui = setup();
    if (failure === 'canvas') dom.window.HTMLCanvasElement.prototype.toDataURL = () => { throw new Error('Canvas blocked'); };
    await capture(ui);
    assert.ok(await ui.findByText('Preenchimento manual disponível'));
    const name = ui.getByPlaceholderText('Ex: Coca-Cola 2L ou Cerveja Heineken 330ml');
    await waitFor(() => assert.equal(document.activeElement, name));
    fireEvent.change(name, { target: { value: 'Produto manual' } });
    assert.equal(name.value, 'Produto manual');
    assert.ok(!ui.queryByText('Processando imagem com IA...'));
  });
}

function galleryRuntime(t) {
  const names = ['FileReader', 'Image'];
  const saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: dom.window.FileReader });
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: class {
    width = 1280; height = 720;
    set src(value) { queueMicrotask(() => this.onload()); }
  } });
  t.after(() => {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
}

test('gallery upload uses the same raw Base64 analysis and leaves financial fields manual', async t => {
  galleryRuntime(t);
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(JSON.parse(options.body).imageBase64, 'aW1hZ2U=');
    return Response.json({ success: true, product: { name: 'Produto da Galeria', category: 'Bebidas' } });
  });
  const ui = setup();
  fireEvent.change(ui.container.querySelector('input[type="file"]'), { target: { files: [new dom.window.File(['image'], 'produto.jpg', { type: 'image/jpeg' })] } });
  assert.ok(await ui.findByDisplayValue('Produto da Galeria'));
  assert.equal(ui.container.querySelector('select').value, 'Bebidas');
  for (const input of ui.container.querySelectorAll('input[type="number"]')) assert.equal(input.value, '');
  assert.ok(!ui.queryByText('Processando imagem com IA...'));
});

test('gallery file read failure resets loading and keeps manual name/category editable', async t => {
  galleryRuntime(t);
  Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: class {
    readAsDataURL() { queueMicrotask(() => this.onerror()); }
  } });
  t.mock.method(globalThis, 'fetch', () => assert.fail('No Gemini request after a file read error'));
  const ui = setup();
  fireEvent.change(ui.container.querySelector('input[type="file"]'), { target: { files: [new dom.window.File(['image'], 'produto.jpg', { type: 'image/jpeg' })] } });
  assert.ok(await ui.findByText('Preenchimento manual disponível'));
  assert.ok(!ui.queryByText('Processando imagem com IA...'));
  const input = ui.getByPlaceholderText('Ex: Coca-Cola 2L ou Cerveja Heineken 330ml');
  fireEvent.change(input, { target: { value: 'Nome manual' } });
  assert.equal(input.value, 'Nome manual');
});
