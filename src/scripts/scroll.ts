import Lenis from 'lenis';

const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
const home = document.querySelector<HTMLElement>('.home');
const itemsBackground = document.querySelector<HTMLElement>('.items-background');
const controller = new AbortController();
let rafId = 0;

function update() {
  const itemsVisible = Boolean(itemsBackground && itemsBackground.getBoundingClientRect().top <= window.innerHeight * 0.75);
  home?.classList.toggle('home--items-visible', itemsVisible);
  document.body.classList.toggle('items-visible', itemsVisible);
}

function raf(time: number) {
  lenis.raf(time);
  rafId = requestAnimationFrame(raf);
}

rafId = requestAnimationFrame(raf);
lenis.on('scroll', update);
window.addEventListener('scroll', update, { passive: true, signal: controller.signal });
window.addEventListener('resize', update, { signal: controller.signal });
document.addEventListener('astro:before-swap', () => {
  cancelAnimationFrame(rafId);
  lenis.off('scroll', update);
  lenis.destroy();
  document.body.classList.remove('items-visible');
  controller.abort();
}, { once: true });
update();
