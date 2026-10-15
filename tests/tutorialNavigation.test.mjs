import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
for (const name of ['window','document','HTMLElement','Element','Node','navigator']) Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
const React = (await import('react')).default;
const { render, fireEvent, cleanup } = await import('@testing-library/react');
const { MemoryRouter } = await import('react-router-dom');
const dir = await mkdtemp(new URL('../node_modules/tutorial-test-', import.meta.url));
try {
  await build({ entryPoints: [new URL('../src/components/GuidedTour.tsx', import.meta.url).pathname], outfile: `${dir}/guide.mjs`, bundle: true, packages: 'external', platform: 'node', format: 'esm', jsx: 'automatic' });
  const { GuidedTour } = await import(pathToFileURL(`${dir}/guide.mjs`));
  test('tutorial navigates all steps, keeps footer outside scrolling content, closes and reopens at first step', () => {
    let closed = 0;
    const view = open => React.createElement(MemoryRouter, null, React.createElement(GuidedTour, { isOpen: open, onClose: () => closed++ }));
    const ui = render(view(true));
    assert.equal(ui.getByRole('button', { name: 'Anterior' }).disabled, true);
    for (let step = 1; step <= 5; step++) {
      assert.ok(ui.getByText(`Passo ${step} de 5`));
      const button = ui.getByRole('button', { name: step === 5 ? 'Concluir' : 'Próximo' });
      assert.equal(button.closest('footer').parentElement.querySelector('.overflow-y-auto').contains(button), false);
      if (step < 5) fireEvent.click(button);
    }
    fireEvent.click(ui.getByRole('button', { name: 'Anterior' }));
    assert.ok(ui.getByText('Passo 4 de 5'));
    fireEvent.click(ui.getByRole('button', { name: 'Próximo' }));
    fireEvent.click(ui.getByRole('button', { name: 'Concluir' }));
    assert.equal(closed, 1);
    ui.rerender(view(false)); ui.rerender(view(true));
    assert.ok(ui.getByText('Passo 1 de 5'));
    fireEvent.keyDown(document, { key: 'Escape' }); assert.equal(closed, 2);
    ui.rerender(view(false)); assert.equal(document.body.style.overflow, '');
    cleanup();
  });
} finally {
  // The test callback is synchronous; module cleanup is deferred until its execution.
  after(async () => { cleanup(); await rm(dir, { recursive: true, force: true }); dom.window.close(); });
}
