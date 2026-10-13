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
const { render, fireEvent, act, cleanup } = await import('@testing-library/react');
const { AppToast } = await import('../src/components/AppToast.tsx');
const cache = new URL('../node_modules/.cache/', import.meta.url);
await mkdir(cache, { recursive: true });
const dir = await mkdtemp(new URL('modal-ui-', cache));
const entry = `${dir}/Debt.mjs`;
await build({
  entryPoints: [new URL('../src/pages/Debt.tsx', import.meta.url).pathname],
  bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic', outfile: entry,
  plugins: [{
    name: 'mock-bank-and-session',
    setup(builder) {
      builder.onResolve({ filter: /\/lib\/(api|employeeContext)$/ }, args => ({ path: args.path.endsWith('/api') ? 'api' : 'employee', namespace: 'modal-test' }));
      builder.onLoad({ filter: /.*/, namespace: 'modal-test' }, args => ({
        contents: args.path === 'employee' ? 'export const useEmployee = () => ({ currentEmployee: null });' :
          ['subscribeCustomers', 'addCustomer', 'recordPayment', 'deleteCustomer', 'subscribeCustomerSales', 'subscribeCustomerPayments'].map(name => `export const ${name} = (...args) => globalThis.__modalUiApi.${name}(...args);`).join('\n'),
        loader: 'js'
      }));
    }
  }]
});
const { default: Debt } = await import(pathToFileURL(entry).href);

function setup(operation, promise) {
  globalThis.__modalUiApi = {
    subscribeCustomers(callback) {
      callback([{ id: 'customer-1', name: 'Cliente de Teste', totalDebt: 20, previousDebt: 20, createdAt: Date.now(), updatedAt: Date.now(), ownerId: 'test' }]);
      return () => {};
    },
    subscribeCustomerSales(callbackId, callback) { callback([]); return () => {}; },
    subscribeCustomerPayments(callbackId, callback) { callback([]); return () => {}; },
    [operation]: () => promise
  };
  return render(React.createElement(React.Fragment, null, React.createElement(Debt), React.createElement(AppToast)));
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
afterEach(() => { cleanup(); delete globalThis.__modalUiApi; });
after(async () => {
  await rm(dir, { recursive: true, force: true });
  dom.window.close();
  for (const [name, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

for (const succeeds of [true, false]) {
  test(`customer deletion closes after ${succeeds ? 'confirmation' : 'rejection'} and reports the correct outcome`, async t => {
    t.mock.method(console, 'error', () => {});
    const bank = deferred();
    const view = setup('deleteCustomer', bank.promise);
    fireEvent.click(view.getByRole('button', { name: 'Excluir', exact: true }));
    fireEvent.click(view.getByRole('button', { name: 'Sim, Excluir Cliente' }));
    assert.equal(view.getByRole('button', { name: 'Excluindo...' }).disabled, true);
    await act(async () => { if (succeeds) bank.resolve(); else bank.reject(new Error('Denied')); });
    assert.equal(view.queryByRole('heading', { name: 'Excluir Cliente do Fiado?' }), null);
    assert.match(view.getByRole('status').textContent, succeeds ? /Cliente removido com sucesso/ : /Não foi possível remover/);
    if (!succeeds) {
      fireEvent.click(view.getByRole('button', { name: 'Excluir', exact: true }));
      assert.equal(view.getByRole('button', { name: 'Sim, Excluir Cliente' }).disabled, false);
    }
  });

  test(`customer creation closes after ${succeeds ? 'confirmation' : 'rejection'} and releases the form`, async () => {
    const bank = deferred();
    const view = setup('addCustomer', bank.promise);
    fireEvent.click(view.getByRole('button', { name: 'Novo Cliente' }));
    const form = view.container.querySelector('form');
    fireEvent.change(form.querySelector('input[required]'), { target: { value: 'Novo Cliente Teste' } });
    fireEvent.submit(form);
    assert.equal(form.querySelector('[type="submit"]').disabled, true);
    await act(async () => { if (succeeds) bank.resolve('new-id'); else bank.reject(new Error('Denied')); });
    assert.equal(view.queryByRole('heading', { name: 'Novo Cliente' }), null);
    assert.match(view.getByRole('status').textContent, succeeds ? /Cliente cadastrado com sucesso/ : /Não foi possível cadastrar/);
  });

  test(`payment modal closes after ${succeeds ? 'confirmation' : 'rejection'}`, async () => {
    const bank = deferred();
    const view = setup('recordPayment', bank.promise);
    fireEvent.click(view.getByRole('button', { name: 'Receber', exact: true }));
    const form = view.container.querySelector('form');
    fireEvent.submit(form);
    assert.equal(form.querySelector('[type="submit"]').disabled, true);
    await act(async () => { if (succeeds) bank.resolve(); else bank.reject(new Error('Denied')); });
    assert.equal(view.queryByRole('heading', { name: 'Receber Pagamento' }), null);
    assert.match(view.getByRole('status').textContent, succeeds ? /Pagamento registrado com sucesso/ : /Não foi possível registrar/);
  });
}
