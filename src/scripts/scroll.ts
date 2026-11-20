import Lenis from 'lenis';

let activeHome: HTMLElement | null = null;

// how far apart each element's fade-in starts, and how long one takes
const REVEAL_STEP = 55;
const REVEAL_TIME = 600;

function initScroll() {
  const home = document.querySelector<HTMLElement>('.home') as HTMLElement;
  if (!home || home === activeHome) return;
  activeHome = home;

  const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
  const shop = document.getElementById('shop');
  const controller = new AbortController();
  const { signal } = controller;
  let rafId = 0;
  let revealTimer = 0;

  function update() {
    const top = shop?.getBoundingClientRect().top ?? Infinity;
    document.body.classList.toggle('items-visible', top <= window.innerHeight * 0.75);
    // keep the address bar on where you are, so a copied link opens there: #shop once the
    // shop has most of the screen, nothing at the top. replaceState, so scrolling doesn't
    // pile up history entries (and history.state stays ClientRouter's).
    const hash = top <= window.innerHeight * 0.5 ? '#shop' : '';
    if (location.hash !== hash) {
      const url = new URL(location.href);
      url.hash = hash;
      history.replaceState(history.state, '', url);
    }
  }

  function raf(time: number) {
    lenis.raf(time);
    rafId = requestAnimationFrame(raf);
  }

  // "shop winter 2026" and any other #shop link on the page: glide down, no navigation.
  // (Handled on the link itself, so it runs before ClientRouter's document listener, which
  // skips clicks that are already handled.)
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href="#shop"]')) {
    link.addEventListener('click', (event) => {
      if (!shop || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      lenis.scrollTo(shop);
    }, { signal });
  }

  // The shop's pieces fade up one after another the first time it comes into view. Each
  // [data-reveal] gets its place in the queue as --reveal; the classes come off once it's
  // done, so their own opacity/transform rules (dimmed pile, disabled button) apply again.
  const revealing = shop && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (revealing) {
    const pieces = [...shop.querySelectorAll<HTMLElement>('[data-reveal]')];
    pieces.forEach((piece, i) => piece.style.setProperty('--reveal', String(i)));
    shop.classList.add('can-reveal');
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      shop.classList.add('is-revealed');
      revealTimer = window.setTimeout(() => {
        shop.classList.remove('can-reveal', 'is-revealed');
      }, pieces.length * REVEAL_STEP + REVEAL_TIME);
    }, { threshold: 0.2 });
    observer.observe(shop);
    signal.addEventListener('abort', () => observer.disconnect());
  }

  // opened at /#shop (a shared link, or "back to the shop"): go there before the first
  // update() below, which would otherwise see the top of the page and drop the #shop
  if (location.hash === '#shop' && shop) lenis.scrollTo(shop, { immediate: true, force: true });

  rafId = requestAnimationFrame(raf);
  lenis.on('scroll', update);
  window.addEventListener('scroll', update, { passive: true, signal });
  window.addEventListener('resize', update, { signal });
  document.addEventListener('astro:before-swap', () => {
    cancelAnimationFrame(rafId);
    clearTimeout(revealTimer);
    lenis.off('scroll', update);
    lenis.destroy();
    document.body.classList.remove('items-visible');
    activeHome = null;
    controller.abort();
  }, { once: true });
  update();
}

document.addEventListener('astro:page-load', initScroll);
initScroll();
