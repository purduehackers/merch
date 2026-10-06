import { e as createComponent, g as addAttribute, l as renderScript, r as renderTemplate, h as createAstro, k as renderComponent, n as renderHead, o as renderSlot } from './astro/server_CzcP1_xN.mjs';
import 'piccolore';
import 'clsx';
/* empty css                           */

const $$Astro = createAstro();
const $$ClientRouter = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$ClientRouter;
  const { fallback = "animate" } = Astro2.props;
  return renderTemplate`<meta name="astro-view-transitions-enabled" content="true"><meta name="astro-view-transitions-fallback"${addAttribute(fallback, "content")}>${renderScript($$result, "/Users/amberzeng/Documents/code/merch/node_modules/astro/components/ClientRouter.astro?astro&type=script&index=0&lang.ts")}`;
}, "/Users/amberzeng/Documents/code/merch/node_modules/astro/components/ClientRouter.astro", void 0);

const $$Layout = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`<html lang="en"> <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta property="og:type" content="website"><meta property="og:title" content="Purdue Hackers Merch"><meta property="og:description" content="purdue hackers boutique. limited drops every semester."><meta property="og:image" content="{{OG_IMAGE_URL}}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><title>merch</title>${renderComponent($$result, "ViewTransitions", $$ClientRouter, {})}<link rel="icon" href="/bro/icon.svg" type="image/svg+xml"><link rel="prefetch" href="/archive">${renderHead()}</head> <body> <div class="page-shell"> ${renderSlot($$result, $$slots["default"])} </div> </body></html>`;
}, "/Users/amberzeng/Documents/code/merch/src/components/layout.astro", void 0);

export { $$Layout as $ };
