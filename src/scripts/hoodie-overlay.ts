const dialog = document.querySelector<HTMLDialogElement>('#hoodie-overlay');
const trigger = document.querySelector<HTMLButtonElement>('[data-open-hoodie]');
const currentImage = dialog?.querySelector<HTMLImageElement>('[data-carousel-current]');
const thumbnails = dialog ? Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-carousel-thumb]')) : [];
const previousButton = dialog?.querySelector<HTMLButtonElement>('[data-carousel-prev]');
const nextButton = dialog?.querySelector<HTMLButtonElement>('[data-carousel-next]');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const transitionDuration = prefersReducedMotion ? 0 : 120;
let imageTimer: number | undefined;
let closeTimer: number | undefined;
let currentIndex = 0;

trigger?.addEventListener('click', () => dialog?.showModal());

// if (dialog && !dialog.open) dialog.showModal();

function closeDialog() {
  if (!dialog?.open || dialog.classList.contains('is-closing')) return;
  if (!transitionDuration) {
    dialog.close();
    return;
  }

  dialog.classList.add('is-closing');
  closeTimer = window.setTimeout(() => dialog.close(), transitionDuration);
}

dialog?.addEventListener('close', () => {
  if (closeTimer) window.clearTimeout(closeTimer);
  closeTimer = undefined;
  dialog.classList.remove('is-closing');
  trigger?.focus();
});

dialog?.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeDialog();
});

dialog?.addEventListener('click', (event) => {
  if (event.target === dialog) closeDialog();
});

function showSlide(index: number) {
  if (!currentImage || !thumbnails.length) return;
  const thumbnail = thumbnails[(index + thumbnails.length) % thumbnails.length];
  const source = thumbnail.dataset.imageSrc;
  if (!source || currentImage.src.endsWith(source)) return;

  currentIndex = (index + thumbnails.length) % thumbnails.length;
  if (imageTimer) window.clearTimeout(imageTimer);
  currentImage.classList.add('is-changing');
  currentImage.src = source;
  currentImage.alt = thumbnail.dataset.imageAlt ?? '';
  currentImage.style.objectPosition = thumbnail.dataset.imagePosition ?? '50% 50%';
  imageTimer = window.setTimeout(() => {
    currentImage.classList.remove('is-changing');
    imageTimer = undefined;
  }, transitionDuration);
  thumbnails.forEach((item) => item.setAttribute('aria-pressed', String(item === thumbnail)));
}

thumbnails.forEach((thumbnail, index) => {
  thumbnail.addEventListener('click', () => showSlide(index));
});

previousButton?.addEventListener('click', () => showSlide(currentIndex - 1));
nextButton?.addEventListener('click', () => showSlide(currentIndex + 1));
