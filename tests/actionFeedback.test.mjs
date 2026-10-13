import test from 'node:test';
import assert from 'node:assert/strict';
import { withActionDeadline, ConfirmationTimeoutError, createToastController, showToast, showActionError, TOAST_EVENT } from '../src/lib/actionFeedback.ts';

test('confirmed results and database failures preserve their outcomes', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  assert.equal(await withActionDeadline(async () => 'saved', 30)(), 'saved');
  const denied = new Error('Permission denied');
  await assert.rejects(withActionDeadline(async () => { throw denied; }, 30)(), error => error === denied);
  t.mock.timers.tick(100);
});

test('pending confirmation stops waiting without reporting success or cancelling the database job', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let confirm;
  const operation = new Promise(resolve => { confirm = resolve; });
  const waiting = withActionDeadline(async () => operation, 30)();
  const rejected = assert.rejects(waiting, ConfirmationTimeoutError);
  t.mock.timers.tick(30);
  await rejected;
  confirm('saved later');
  assert.equal(await operation, 'saved later');
});

test('new toasts retain their full four seconds and replace older timers', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let current;
  const controller = createToastController(notice => { current = notice; });
  controller.show({ message: 'First', kind: 'success' });
  t.mock.timers.tick(3000);
  controller.show({ message: 'Second', kind: 'success' });
  t.mock.timers.tick(1000);
  assert.equal(current.message, 'Second');
  t.mock.timers.tick(2999);
  assert.equal(current.message, 'Second');
  t.mock.timers.tick(1);
  assert.equal(current, null);
  controller.dispose();
});

test('uncertain outcomes produce warnings; rejected writes never produce success toasts', t => {
  const target = new EventTarget();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value: target, configurable: true });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else delete globalThis.window;
  });
  const notices = [];
  target.addEventListener(TOAST_EVENT, event => notices.push(event.detail));
  showToast('Cliente cadastrado');
  showActionError(new Error('Denied'), 'Não foi possível salvar');
  showActionError(new ConfirmationTimeoutError(), 'Não foi possível salvar');
  assert.deepEqual(notices.map(notice => notice.kind), ['success', 'error', 'warning']);
  assert.match(notices[2].message, /Confira os dados antes de repetir/);
});
