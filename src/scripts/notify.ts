export {};

const form = document.querySelector<HTMLFormElement>('.notify-form');
const input = form?.querySelector<HTMLInputElement>('input[name="email"]');
const submit = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
const prompt = form?.querySelector<HTMLElement>('.notify-form__prompt');
const promptDefault = form?.querySelector<HTMLElement>('.notify-form__prompt-default');
const processing = form?.querySelector<HTMLElement>('[data-notify-processing]');
const error = form?.querySelector<HTMLElement>('[data-notify-error]');
const success = form?.querySelector<HTMLElement>('[data-notify-success]');

function resetPrompt() {
  prompt?.classList.remove('is-success', 'is-processing', 'is-error');
  promptDefault?.removeAttribute('aria-hidden');
  processing?.setAttribute('aria-hidden', 'true');
  error?.setAttribute('aria-hidden', 'true');
  success?.setAttribute('aria-hidden', 'true');
  success?.classList.remove('is-visible');
}

function showProcessing() {
  resetPrompt();
  prompt?.classList.add('is-processing');
  promptDefault?.setAttribute('aria-hidden', 'true');
  processing?.setAttribute('aria-hidden', 'false');
}

function showError(message: string) {
  resetPrompt();
  if (!prompt || !error) return;
  error.textContent = message;
  prompt.classList.add('is-error');
  promptDefault?.setAttribute('aria-hidden', 'true');
  error.setAttribute('aria-hidden', 'false');
}

function showSuccess() {
  resetPrompt();
  prompt?.classList.add('is-success');
  promptDefault?.setAttribute('aria-hidden', 'true');
  success?.setAttribute('aria-hidden', 'false');
  success?.classList.remove('is-visible');
  requestAnimationFrame(() => success?.classList.add('is-visible'));
}

input?.addEventListener('pointerdown', () => input.dataset.pointerFocus = 'true');
input?.addEventListener('blur', () => delete input.dataset.pointerFocus);

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!input) return;

  resetPrompt();
  if (!input.checkValidity()) {
    input.setAttribute('aria-invalid', 'true');
    showError(input.validity.valueMissing ? 'ENTER YOUR EMAIL.' : 'ENTER A VALID EMAIL.');
    return;
  }
  input.removeAttribute('aria-invalid');

  const endpoint = form.dataset.endpoint;
  if (!endpoint) {
    showError('EMAIL SIGNUP IS NOT CONFIGURED.');
    return;
  }

  input.disabled = true;
  if (submit) submit.disabled = true;
  showProcessing();
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: input.value.trim() }),
    });
    if (response.status === 409) {
      showError("YOU'RE ALREADY ON THE LIST.");
      return;
    }
    if (!response.ok) throw new Error('signup failed');
    input.value = '';
    showSuccess();
  } catch {
    showError('UNABLE TO SAVE YOUR EMAIL. TRY AGAIN.');
  } finally {
    input.disabled = false;
    if (submit) submit.disabled = false;
  }
});
