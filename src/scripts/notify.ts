export {};

const form = document.querySelector<HTMLFormElement>('.notify-form');
const input = form?.querySelector<HTMLInputElement>('input[name="email"]');
const status = form?.querySelector<HTMLElement>('[data-notify-status]');
const success = form?.querySelector<HTMLElement>('[data-notify-success]');

function setStatus(message: string) {
  if (!status) return;
  status.classList.remove('is-visible');
  status.textContent = message;
  if (message) requestAnimationFrame(() => status.classList.add('is-visible'));
}

input?.addEventListener('pointerdown', () => input.dataset.pointerFocus = 'true');
input?.addEventListener('blur', () => delete input.dataset.pointerFocus);

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!input) return;

  if (success) success.hidden = true;
  setStatus('');
  if (!input.checkValidity()) {
    input.setAttribute('aria-invalid', 'true');
    setStatus(input.validity.valueMissing ? 'Enter your email.' : 'Enter a valid email.');
    return;
  }
  input.removeAttribute('aria-invalid');

  const endpoint = form.dataset.endpoint;
  if (!endpoint) {
    setStatus('Email signup is not configured yet.');
    return;
  }

  input.disabled = true;
  setStatus('adding you to the list…');
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: input.value.trim() }),
    });
    if (response.status === 409) {
      setStatus("You're already on the list.");
      return;
    }
    if (!response.ok) throw new Error('signup failed');
    input.value = '';
    if (success) {
      success.hidden = false;
      success.classList.remove('is-visible');
      requestAnimationFrame(() => success.classList.add('is-visible'));
    }
    setStatus('');
  } catch {
    if (success) success.hidden = true;
    setStatus('Unable to save your email. Please try again.');
  } finally {
    input.disabled = false;
  }
});
