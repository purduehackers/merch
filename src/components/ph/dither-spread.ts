// Sets each cell's --d: its distance from a point (in viewport px), 0 at the nearest cell and
// 1 at the farthest, so the CSS transition delay makes the fill ripple out from that point.
export const spreadFrom = (btn: HTMLElement, x: number, y: number) => {
  const cols = Number(btn.dataset.cols);
  const rows = Number(btn.dataset.rows);
  if (!cols || !rows) return;
  const box = btn.getBoundingClientRect();
  const px = x - box.left;
  const py = y - box.top;
  const cellW = box.width / cols;
  const cellH = box.height / rows;

  const cells = btn.querySelectorAll<HTMLElement>(".ph-dither-btn__pixel");
  const dist = new Float32Array(cells.length);
  let max = 0;
  cells.forEach((_, k) => {
    const dx = ((k % cols) + 0.5) * cellW - px;
    const dy = (Math.floor(k / cols) + 0.5) * cellH - py;
    dist[k] = Math.hypot(dx, dy);
    if (dist[k] > max) max = dist[k];
  });
  cells.forEach((cell, k) => cell.style.setProperty("--d", (dist[k] / (max || 1)).toFixed(3)));
};
