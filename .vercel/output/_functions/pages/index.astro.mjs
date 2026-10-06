import { e as createComponent, m as maybeRenderHead, g as addAttribute, l as renderScript, r as renderTemplate, k as renderComponent } from '../chunks/astro/server_CzcP1_xN.mjs';
import 'piccolore';
/* empty css                                 */
import { $ as $$Layout } from '../chunks/layout_CpRaNrFm.mjs';
import 'clsx';
export { renderers } from '../renderers.mjs';

const concept = new Proxy({"src":"/_astro/merch-concept.BSI8VqSl.webp","width":544,"height":982,"format":"webp"}, {
						get(target, name, receiver) {
							if (name === 'clone') {
								return structuredClone(target);
							}
							if (name === 'fsPath') {
								return "/Users/amberzeng/Documents/code/merch/src/assets/merch-concept.webp";
							}
							
							return target[name];
						}
					});

const merchHat = new Proxy({"src":"/_astro/merch-hat.BHuJ3Z9f.png","width":528,"height":506,"format":"png"}, {
						get(target, name, receiver) {
							if (name === 'clone') {
								return structuredClone(target);
							}
							if (name === 'fsPath') {
								return "/Users/amberzeng/Documents/code/merch/src/assets/merch-hat.png";
							}
							
							return target[name];
						}
					});

const merchShirt = new Proxy({"src":"/_astro/merch-shirt.Co53zc-9.png","width":356,"height":396,"format":"png"}, {
						get(target, name, receiver) {
							if (name === 'clone') {
								return structuredClone(target);
							}
							if (name === 'fsPath') {
								return "/Users/amberzeng/Documents/code/merch/src/assets/merch-shirt.png";
							}
							
							return target[name];
						}
					});

const $$Hero = createComponent(($$result, $$props, $$slots) => {
  const notifyEndpoint = "/api/notify";
  return renderTemplate`${maybeRenderHead()}<main class="home" aria-labelledby="page-title"> <div class="home__stage"> <canvas id="scene" aria-hidden="true"></canvas> <h1 id="page-title" class="sr-only">
Merch
</h1> <p class="home__descriptor">for the doers, makers, and dreamers</p> <a class="home__archive" href="/archive">
archive
</a> <div class="home__scene-clip" aria-hidden="true"> <div class="home__concept"> <img${addAttribute(concept.src, "src")} alt="" width="323" height="1144" loading="eager" decoding="async"> </div> </div> <form class="notify-form"${addAttribute(notifyEndpoint, "data-endpoint")} novalidate> <label class="notify-form__prompt" for="notify-email"> <span class="notify-form__prompt-default">
NOTIFY ME WHEN W2026 DROPS
</span> <span class="notify-form__prompt-processing" data-notify-processing aria-hidden="true">
ADDING YOU TO THE LIST…
</span> <span class="notify-form__prompt-error" data-notify-error aria-hidden="true"></span> <span class="notify-form__success" data-notify-success aria-hidden="true"> <span style="--i: 0">YOU'RE</span> <span style="--i: 1">ON</span> <span style="--i: 2">THE</span> <span style="--i: 3">LIST</span> </span> </label> <div class="notify-form__field"> <input id="notify-email" name="email" type="email" autocomplete="email" placeholder="purduehackers@gmail.com" required> </div> <button class="notify-form__submit" type="submit">
enter
</button> <p class="notify-form__status" data-notify-status aria-live="polite" aria-atomic="true"></p> </form> <div class="items-background" aria-hidden="true"></div> <div class="lower-art"> <div class="cutout-group"> <div class="orbit-item orbit-item--shirt"> <button class="product product--shirt product--image" type="button" aria-label="Shirt"> <img class="product-image"${addAttribute(merchShirt.src, "src")} alt="" width="356" height="396" loading="eager" decoding="async"> </button> </div> <div class="orbit-item orbit-item--cap"> <button class="product product--cap product--image" type="button" aria-label="Hat"> <img class="product-image"${addAttribute(merchHat.src, "src")} alt="" width="528" height="506" loading="eager" decoding="async"> </button> </div> </div> </div> </div> </main> ${renderScript($$result, "/Users/amberzeng/Documents/code/merch/src/components/hero.astro?astro&type=script&index=0&lang.ts")}`;
}, "/Users/amberzeng/Documents/code/merch/src/components/hero.astro", void 0);

const $$Index = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, {}, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Hero", $$Hero, {})} ${renderScript($$result2, "/Users/amberzeng/Documents/code/merch/src/pages/index.astro?astro&type=script&index=0&lang.ts")} ` })}`;
}, "/Users/amberzeng/Documents/code/merch/src/pages/index.astro", void 0);

const $$file = "/Users/amberzeng/Documents/code/merch/src/pages/index.astro";
const $$url = "";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
	__proto__: null,
	default: $$Index,
	file: $$file,
	url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
