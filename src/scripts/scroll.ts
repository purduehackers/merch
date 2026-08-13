import Lenis from 'lenis';

// smooth (inertia) scrolling
const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
function raf(time: number) {
  lenis.raf(time);
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

// 0 = black (hero), 1 = white — driven by scroll position. Shared so the canvas
// (scene.ts) and the page background transition together.
export function bgLevel(): number {
  const start = window.innerHeight * 0.4;
  const end = window.innerHeight;
  return Math.min(1, Math.max(0, (window.scrollY - start) / (end - start)));
}

function update() {
  const v = Math.round(bgLevel() * 255);
  document.body.style.backgroundColor = `rgb(${v}, ${v}, ${v})`;
}
lenis.on('scroll', update);
window.addEventListener('resize', update);
update();
