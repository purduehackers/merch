const dialog = document.querySelector<HTMLDialogElement>('#hoodie-overlay');
const trigger = document.querySelector<HTMLButtonElement>('[data-open-hoodie]');
const currentImage = dialog?.querySelector<HTMLImageElement>('[data-carousel-current]');
const thumbnails = dialog ? Array.from(dialog.querySelectorAll<HTMLElement>('[data-carousel-thumb]')) : [];
const carouselMain = dialog?.querySelector<HTMLElement>('.hoodie-carousel__main');
const previousButton = dialog?.querySelector<HTMLButtonElement>('[data-carousel-prev]');
const nextButton = dialog?.querySelector<HTMLButtonElement>('[data-carousel-next]');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const transitionDuration = prefersReducedMotion ? 0 : 120;
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
  currentImage.src = source;
  currentImage.alt = thumbnail.dataset.imageAlt ?? '';
  thumbnails.forEach((item) => item.classList.toggle('is-active', item === thumbnail));
}

previousButton?.addEventListener('click', () => showSlide(currentIndex - 1));
nextButton?.addEventListener('click', () => showSlide(currentIndex + 1));

let swipeStartX = 0;
let swipeStartY = 0;
let swipePointerId: number | null = null;
let suppressClick = false;

carouselMain?.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'mouse' || (event.target as Element).closest('.hoodie-carousel__prev, .hoodie-carousel__next')) return;
  swipeStartX = event.clientX;
  swipeStartY = event.clientY;
  swipePointerId = event.pointerId;
  carouselMain.setPointerCapture(event.pointerId);
});

carouselMain?.addEventListener('pointerup', (event) => {
  if (event.pointerId !== swipePointerId) return;
  const deltaX = event.clientX - swipeStartX;
  const deltaY = event.clientY - swipeStartY;
  swipePointerId = null;
  if (Math.abs(deltaX) < 40 || Math.abs(deltaX) < Math.abs(deltaY)) return;

  event.preventDefault();
  suppressClick = true;
  showSlide(currentIndex + (deltaX < 0 ? 1 : -1));
});

carouselMain?.addEventListener('pointercancel', () => {
  swipePointerId = null;
});

carouselMain?.addEventListener('click', (event) => {
  if (!suppressClick) return;
  event.preventDefault();
  event.stopPropagation();
  suppressClick = false;
}, true);

