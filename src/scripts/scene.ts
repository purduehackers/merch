import Matter from 'matter-js';
import decomp from 'poly-decomp';

Matter.Common.setDecomp(decomp);
const { Engine, Composite, Bodies, Body, Mouse, MouseConstraint, Query } = Matter;

// the fixed cast — exactly one of each, in order
const SPECS = [
  { type: 'circle',   color: '#ff2e2e' },
  { type: 'triangle', color: '#ff6a00' },
  { type: 'square',   color: '#2e6bff' },
  { type: 'spiral',   color: '#19d219' },
  { type: 'star',     color: '#c026d3', points: 8 },
  { type: 'rainbow',  color: '#5b4fe6' },
  { type: 'tile',     color: '#ffe600' },
];

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

const engine = Engine.create();
engine.gravity.y = 1;
// more solver iterations + tighter slop => far less clipping between big shapes
engine.positionIterations = 14;
engine.velocityIterations = 12;
engine.constraintIterations = 4;

const shapes: any[] = [];
let walls: any[] = [];
let textBodies: any[] = [];
let layout = { fontSize: 0, scaleX: 1, capHeight: 0, xOrigin: 0 };
let W = 0, H = 0, dpr = 1;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

// ---- shape geometry (local verts centered on ~centroid) ----
function centerVerts(v: { x: number; y: number }[]) {
  const cx = v.reduce((s, p) => s + p.x, 0) / v.length;
  const cy = v.reduce((s, p) => s + p.y, 0) / v.length;
  return v.map((p) => ({ x: p.x - cx, y: p.y - cy }));
}
function squareVerts(s: number) {
  return [{ x: -s, y: -s }, { x: s, y: -s }, { x: s, y: s }, { x: -s, y: s }];
}
function polyVerts(r: number, n: number) {
  const v = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    v.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
  }
  return v;
}
function starVerts(r: number, points: number) {
  const inner = r * 0.45;
  const v = [];
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const rad = i % 2 === 0 ? r : inner;
    v.push({ x: rad * Math.cos(a), y: rad * Math.sin(a) });
  }
  return v;
}
// the "rainbow": a thick elliptical arc (open horseshoe), built as a
// compound body of segments so it collides as the real curved band
function makeArc(x: number, y: number, rx: number, ry: number, thick: number, a0: number, a1: number, opts: any) {
  const span = a1 - a0;
  const N = Math.max(8, Math.round((span / (Math.PI * 2)) * 26));
  const mrx = rx - thick / 2, mry = ry - thick / 2;
  const parts = [];
  for (let i = 0; i < N; i++) {
    const a = a0 + ((i + 0.5) / N) * span;
    const px = x + Math.cos(a) * mrx;
    const py = y + Math.sin(a) * mry;
    const tx = -mrx * Math.sin(a), ty = mry * Math.cos(a); // tangent
    const segLen = Math.hypot(tx, ty) * (span / N) * 1.3;
    const seg = Bodies.rectangle(px, py, segLen, thick, opts);
    Body.setAngle(seg, Math.atan2(ty, tx));
    parts.push(seg);
  }
  return Body.create({ parts });
}

// ---- build the fixed cast ----
function buildShape(spec: any, x: number, y: number) {
  const base = Math.min(W, H) * 0.085;
  const size = Math.max(58, Math.min(120, base));
  const opts = { restitution: 0.2, friction: 0.5, frictionStatic: 0.7, slop: 0.02 };

  let body: any;
  let localVerts: { x: number; y: number }[] | null = null;
  let radius = size;
  const ring = { rx: 0, ry: 0, thick: 0, a0: 0, a1: 0, cx: 0, cy: 0 };
  let cells: { x: number; y: number }[] | null = null; // tile cell centers (local)
  let cellSide = 0;

  if (spec.type === 'circle') {
    radius = size;
    body = Bodies.circle(x, y, radius, opts);
  } else if (spec.type === 'spiral') {
    radius = size; // drawn outer radius of the spiral
    // collider grown to encompass the outer ring (arm + stroke width)
    body = Bodies.circle(x, y, radius * 1.18, opts);
  } else if (spec.type === 'rainbow') {
    const gap = 2.4; // ~138° opening
    ring.rx = size * 1.3;
    ring.ry = size * 1.15;
    ring.thick = ring.rx * 0.42;
    ring.a0 = Math.PI / 2 + gap / 2;            // arc wraps the top, gap at the bottom
    ring.a1 = Math.PI / 2 + Math.PI * 2 - gap / 2;
    body = makeArc(x, y, ring.rx, ring.ry, ring.thick, ring.a0, ring.a1, opts);
    // arc's center of mass != geometric center; remember the offset (local frame,
    // angle still 0 here) so drawing can follow the real segments
    ring.cx = x - body.position.x;
    ring.cy = y - body.position.y;
  } else if (spec.type === 'tile') {
    // 5 yellow cells of a 3x3 grid (col, row); row grows downward
    const grid = [[1, 0], [1, 1], [2, 1], [0, 2], [2, 2]];
    const step = size * 0.66;
    cellSide = step;
    const mc = 1.2, mr = 1.2; // centroid of the 5 cells, in grid units
    cells = grid.map(([c, r]) => ({ x: (c - mc) * step, y: (r - mr) * step }));
    // equal-mass cells centered on their centroid => COM lands at (x, y)
    const parts = cells.map((c) => Bodies.rectangle(x + c.x, y + c.y, step, step, opts));
    body = Body.create({ parts });
  } else {
    if (spec.type === 'square') localVerts = squareVerts(size * 0.95);
    else if (spec.type === 'triangle') localVerts = polyVerts(size * 1.15, 3);
    else localVerts = starVerts(size * 1.2, spec.points!); // star
    localVerts = centerVerts(localVerts);
    body = Bodies.fromVertices(
      x, y,
      [localVerts.map((p) => ({ x: x + p.x, y: y + p.y }))],
      opts, true,
    );
  }

  Body.setAngle(body, rand(0, Math.PI * 2));
  Body.setAngularVelocity(body, rand(-0.12, 0.12));
  body.plugin = { ...spec, localVerts, radius, ring, cells, cellSide };
  shapes.push(body);
  Composite.add(engine.world, body);
}

// stack them in a column above the screen with a guaranteed vertical gap, so they
// rain down one at a time (and never spawn overlapping each other) and pile up
function spawnAll() {
  const dropX = W * 0.14;
  const size = Math.max(58, Math.min(120, Math.min(W, H) * 0.085)); // same size buildShape uses
  const gap = size * 3.2; // > the largest shape's extent, so adjacent spawns can't overlap
  SPECS.forEach((spec, i) => {
    buildShape(spec, dropX + rand(-20, 20), -gap * (i + 1));
  });
}

// ---- drawing ----
function drawText() {
  ctx.save();
  ctx.translate(0, H);
  ctx.scale(layout.scaleX, 1);
  ctx.font = `${layout.fontSize}px "PolySans Relax", sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff'; 
  ctx.fillText('MERCH', layout.xOrigin, 0);
  ctx.restore();
}

function drawShape(b: any) {
  const { type, color, localVerts, radius, ring, cells, cellSide } = b.plugin;
  const { x, y } = b.position;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;

  if (type === 'circle') {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'tile') {
    const cos = Math.cos(b.angle), sin = Math.sin(b.angle);
    const o = cellSide / 2;
    ctx.fillStyle = color;
    for (const c of cells) {
      const gx = x + c.x * cos - c.y * sin;
      const gy = y + c.x * sin + c.y * cos;
      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate(b.angle);
      ctx.fillRect(-o - 0.5, -o - 0.5, cellSide + 1, cellSide + 1); // +1 overlap merges adjacent cells seamlessly
      ctx.restore();
    }
  } else if (type === 'rainbow') {
    const cos = Math.cos(b.angle), sin = Math.sin(b.angle);
    // geometric center = COM (body.position) + the stored offset, rotated by the body angle
    const gx = x + ring.cx * cos - ring.cy * sin;
    const gy = y + ring.cx * sin + ring.cy * cos;
    ctx.save();
    ctx.translate(gx, gy);
    ctx.rotate(b.angle);
    ctx.beginPath();
    ctx.ellipse(0, 0, ring.rx, ring.ry, 0, ring.a0, ring.a1);               // outer edge
    ctx.ellipse(0, 0, ring.rx - ring.thick, ring.ry - ring.thick, 0, ring.a1, ring.a0, true); // inner edge back
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  } else if (type === 'spiral') {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(b.angle);
    ctx.lineWidth = Math.max(2, radius * 0.16);
    ctx.lineCap = 'round';
    ctx.beginPath();
    const turns = 3.2;
    const steps = 90;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = t * turns * Math.PI * 2;
      const r = t * radius;
      const px = r * Math.cos(a);
      const py = r * Math.sin(a);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  } else {
    const cos = Math.cos(b.angle), sin = Math.sin(b.angle);
    ctx.beginPath();
    localVerts.forEach((p: any, i: number) => {
      const px = x + p.x * cos - p.y * sin;
      const py = y + p.x * sin + p.y * cos;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fill();
  }
}

function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  drawText();
  for (const b of shapes) drawShape(b);
}

// ---- collision body: a single rectangle covering the whole MERCH text ----
function buildTextBodies() {
  for (const b of textBodies) Composite.remove(engine.world, b);
  textBodies = [];

  const boxH = layout.capHeight;
  const wall = Bodies.rectangle(W / 2, H - boxH / 2, W, boxH, {
    isStatic: true, friction: 0.6,
  });
  textBodies.push(wall);
  Composite.add(engine.world, wall);
}

function buildWalls() {
  for (const b of walls) Composite.remove(engine.world, b);
  const t = 200;
  walls = [
    Bodies.rectangle(W / 2, H + t / 2, W + t * 2, t, { isStatic: true }), // floor
    Bodies.rectangle(-t / 2, H / 2, t, H * 3, { isStatic: true }),          // left
    Bodies.rectangle(W + t / 2, H / 2, t, H * 3, { isStatic: true }),       // right
  ];
  Composite.add(engine.world, walls);
}

// render MERCH offscreen and scan for the true ink bounds (left/right/top-most
// painted pixels), so the M and H strokes touch both edges regardless of font metrics
function measureInk(fs: number) {
  const pad = Math.ceil(fs * 0.5);
  const off = document.createElement('canvas');
  const octx = off.getContext('2d')!;
  const setup = () => {
    octx.font = `${fs}px "PolySans Relax", sans-serif`;
    octx.textAlign = 'left';
    octx.textBaseline = 'alphabetic';
    octx.fillStyle = '#fff';
  };
  setup();
  const adv = octx.measureText('MERCH').width;
  off.width = Math.ceil(adv + pad * 2);
  off.height = Math.ceil(fs * 1.8);
  setup(); // re-apply: resizing the canvas resets its context
  const baseline = Math.round(fs * 1.3);
  octx.fillText('MERCH', pad, baseline);

  const { width: ow, height: oh } = off;
  const data = octx.getImageData(0, 0, ow, oh).data;
  let left = -1, right = -1, top = -1;
  for (let xx = 0; xx < ow; xx++) {
    for (let yy = 0; yy < oh; yy++) {
      if (data[(yy * ow + xx) * 4 + 3] > 40) {
        if (left < 0) left = xx;
        right = xx;
        if (top < 0 || yy < top) top = yy;
        break;
      }
    }
  }
  return { left, right, top, pad, baseline };
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;

  layout.fontSize = W * 0.31;
  const ink = measureInk(layout.fontSize);
  if (ink.right > ink.left) {
    layout.scaleX = W / (ink.right - ink.left + 1); // ink spans the full width
    layout.xOrigin = ink.pad - ink.left;            // leftmost ink lands at x=0
    layout.capHeight = ink.baseline - ink.top;
  } else {
    ctx.font = `${layout.fontSize}px "PolySans Relax", sans-serif`;
    layout.scaleX = W / ctx.measureText('MERCH').width;
    layout.xOrigin = 0;
    layout.capHeight = layout.fontSize * 0.7;
  }

  buildWalls();
  buildTextBodies();
}

// ---- main loop ----
let last = 0;
function frame(now: number) {
  // clamp timestep so a slow frame can't let fast shapes tunnel through each other
  const dt = last ? Math.min(now - last, 18) : 16;
  last = now;
  Engine.update(engine, dt);
  render();
  requestAnimationFrame(frame);
}

function start() {
  resize();
  window.addEventListener('resize', resize);

  // drag + fling
  const mouse = Mouse.create(canvas);
  const mc = MouseConstraint.create(engine, {
    mouse,
    constraint: { stiffness: 0.18, render: { visible: false } },
  });
  Composite.add(engine.world, mc);

  // a quick click (not a drag) launches the shape under the cursor
  let down: any = null;
  canvas.addEventListener('mousedown', (e) => {
    down = { x: e.offsetX, y: e.offsetY, t: e.timeStamp };
  });
  canvas.addEventListener('mouseup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.offsetX - down.x, e.offsetY - down.y);
    const quick = e.timeStamp - down.t < 250;
    down = null;
    if (moved > 8 || !quick) return; // it was a drag — MouseConstraint already flung it
    const hit = Query.point(shapes, { x: e.offsetX, y: e.offsetY })[0];
    if (!hit) return;
    Body.setVelocity(hit, { x: rand(-16, 16), y: rand(-24, -14) });
    Body.setAngularVelocity(hit, rand(-0.4, 0.4));
  });

  spawnAll();

  requestAnimationFrame(frame);
}

// Canvas text does NOT trigger @font-face loading the way DOM text does, and
// document.fonts.ready resolves immediately when nothing has requested the font —
// so explicitly load PolySans and await it before the first render/measure.
const fontset = (document as any).fonts;
Promise.all([
  fontset.load('700 100px "PolySans Relax"'),
  fontset.load('normal 100px "PolySans Relax"'),
])
  .catch(() => {})        // fall back to system sans if it ever fails to load
  .then(() => fontset.ready)
  .then(start);
