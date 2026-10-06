import 'piccolore';
import { p as decodeKey } from './chunks/astro/server_CzcP1_xN.mjs';
import 'clsx';
import { N as NOOP_MIDDLEWARE_FN } from './chunks/astro-designed-error-pages_DqR3jufh.mjs';
import 'es-module-lexer';

function sanitizeParams(params) {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => {
      if (typeof value === "string") {
        return [key, value.normalize().replace(/#/g, "%23").replace(/\?/g, "%3F")];
      }
      return [key, value];
    })
  );
}
function getParameter(part, params) {
  if (part.spread) {
    return params[part.content.slice(3)] || "";
  }
  if (part.dynamic) {
    if (!params[part.content]) {
      throw new TypeError(`Missing parameter: ${part.content}`);
    }
    return params[part.content];
  }
  return part.content.normalize().replace(/\?/g, "%3F").replace(/#/g, "%23").replace(/%5B/g, "[").replace(/%5D/g, "]");
}
function getSegment(segment, params) {
  const segmentPath = segment.map((part) => getParameter(part, params)).join("");
  return segmentPath ? "/" + segmentPath : "";
}
function getRouteGenerator(segments, addTrailingSlash) {
  return (params) => {
    const sanitizedParams = sanitizeParams(params);
    let trailing = "";
    if (addTrailingSlash === "always" && segments.length) {
      trailing = "/";
    }
    const path = segments.map((segment) => getSegment(segment, sanitizedParams)).join("") + trailing;
    return path || "/";
  };
}

function deserializeRouteData(rawRouteData) {
  return {
    route: rawRouteData.route,
    type: rawRouteData.type,
    pattern: new RegExp(rawRouteData.pattern),
    params: rawRouteData.params,
    component: rawRouteData.component,
    generate: getRouteGenerator(rawRouteData.segments, rawRouteData._meta.trailingSlash),
    pathname: rawRouteData.pathname || void 0,
    segments: rawRouteData.segments,
    prerender: rawRouteData.prerender,
    redirect: rawRouteData.redirect,
    redirectRoute: rawRouteData.redirectRoute ? deserializeRouteData(rawRouteData.redirectRoute) : void 0,
    fallbackRoutes: rawRouteData.fallbackRoutes.map((fallback) => {
      return deserializeRouteData(fallback);
    }),
    isIndex: rawRouteData.isIndex,
    origin: rawRouteData.origin
  };
}

function deserializeManifest(serializedManifest) {
  const routes = [];
  for (const serializedRoute of serializedManifest.routes) {
    routes.push({
      ...serializedRoute,
      routeData: deserializeRouteData(serializedRoute.routeData)
    });
    const route = serializedRoute;
    route.routeData = deserializeRouteData(serializedRoute.routeData);
  }
  const assets = new Set(serializedManifest.assets);
  const componentMetadata = new Map(serializedManifest.componentMetadata);
  const inlinedScripts = new Map(serializedManifest.inlinedScripts);
  const clientDirectives = new Map(serializedManifest.clientDirectives);
  const serverIslandNameMap = new Map(serializedManifest.serverIslandNameMap);
  const key = decodeKey(serializedManifest.key);
  return {
    // in case user middleware exists, this no-op middleware will be reassigned (see plugin-ssr.ts)
    middleware() {
      return { onRequest: NOOP_MIDDLEWARE_FN };
    },
    ...serializedManifest,
    assets,
    componentMetadata,
    inlinedScripts,
    clientDirectives,
    routes,
    serverIslandNameMap,
    key
  };
}

const manifest = deserializeManifest({"hrefRoot":"file:///Users/amberzeng/Documents/code/merch/","cacheDir":"file:///Users/amberzeng/Documents/code/merch/node_modules/.astro/","outDir":"file:///Users/amberzeng/Documents/code/merch/dist/","srcDir":"file:///Users/amberzeng/Documents/code/merch/src/","publicDir":"file:///Users/amberzeng/Documents/code/merch/public/","buildClientDir":"file:///Users/amberzeng/Documents/code/merch/dist/client/","buildServerDir":"file:///Users/amberzeng/Documents/code/merch/dist/server/","adapterName":"@astrojs/vercel","routes":[{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"type":"page","component":"_server-islands.astro","params":["name"],"segments":[[{"content":"_server-islands","dynamic":false,"spread":false}],[{"content":"name","dynamic":true,"spread":false}]],"pattern":"^\\/_server-islands\\/([^/]+?)\\/?$","prerender":false,"isIndex":false,"fallbackRoutes":[],"route":"/_server-islands/[name]","origin":"internal","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[{"type":"external","value":"/_astro/page.DTPp-pk-.js"}],"styles":[],"routeData":{"type":"endpoint","isIndex":false,"route":"/_image","pattern":"^\\/_image\\/?$","segments":[[{"content":"_image","dynamic":false,"spread":false}]],"params":[],"component":"node_modules/astro/dist/assets/endpoint/generic.js","pathname":"/_image","prerender":false,"fallbackRoutes":[],"origin":"internal","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[{"type":"external","value":"/_astro/page.DTPp-pk-.js"}],"styles":[],"routeData":{"route":"/api/notify","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/notify\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"notify","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/notify.ts","pathname":"/api/notify","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[{"type":"external","value":"/_astro/page.DTPp-pk-.js"}],"styles":[{"type":"inline","content":".astro-route-announcer{position:absolute;left:0;top:0;clip:rect(0 0 0 0);clip-path:inset(50%);overflow:hidden;white-space:nowrap;width:1px;height:1px}@media(prefers-reduced-motion:no-preference){::view-transition-old(root),::view-transition-new(root){animation-duration:.18s;animation-timing-function:cubic-bezier(.2,0,0,1)}::view-transition-old(root){animation-name:page-exit}::view-transition-new(root){animation-name:page-enter}}@keyframes page-exit{0%{opacity:1;filter:blur(0)}to{opacity:0;filter:blur(4px)}}@keyframes page-enter{0%{opacity:0;filter:blur(4px)}to{opacity:1;filter:blur(0)}}\n"},{"type":"external","src":"/_astro/archive.BCL-YgrN.css"}],"routeData":{"route":"/archive","isIndex":false,"type":"page","pattern":"^\\/archive\\/?$","segments":[[{"content":"archive","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/archive.astro","pathname":"/archive","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[{"type":"external","value":"/_astro/page.DTPp-pk-.js"}],"styles":[{"type":"external","src":"/_astro/index.CAb7cAiA.css"},{"type":"inline","content":".astro-route-announcer{position:absolute;left:0;top:0;clip:rect(0 0 0 0);clip-path:inset(50%);overflow:hidden;white-space:nowrap;width:1px;height:1px}@media(prefers-reduced-motion:no-preference){::view-transition-old(root),::view-transition-new(root){animation-duration:.18s;animation-timing-function:cubic-bezier(.2,0,0,1)}::view-transition-old(root){animation-name:page-exit}::view-transition-new(root){animation-name:page-enter}}@keyframes page-exit{0%{opacity:1;filter:blur(0)}to{opacity:0;filter:blur(4px)}}@keyframes page-enter{0%{opacity:0;filter:blur(4px)}to{opacity:1;filter:blur(0)}}\n"}],"routeData":{"route":"/","isIndex":true,"type":"page","pattern":"^\\/$","segments":[],"params":[],"component":"src/pages/index.astro","pathname":"/","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}}],"base":"/","trailingSlash":"ignore","compressHTML":true,"componentMetadata":[["/Users/amberzeng/Documents/code/merch/src/pages/archive.astro",{"propagation":"none","containsHead":true}],["/Users/amberzeng/Documents/code/merch/src/pages/index.astro",{"propagation":"none","containsHead":true}]],"renderers":[],"clientDirectives":[["idle","(()=>{var l=(n,t)=>{let i=async()=>{await(await n())()},e=typeof t.value==\"object\"?t.value:void 0,s={timeout:e==null?void 0:e.timeout};\"requestIdleCallback\"in window?window.requestIdleCallback(i,s):setTimeout(i,s.timeout||200)};(self.Astro||(self.Astro={})).idle=l;window.dispatchEvent(new Event(\"astro:idle\"));})();"],["load","(()=>{var e=async t=>{await(await t())()};(self.Astro||(self.Astro={})).load=e;window.dispatchEvent(new Event(\"astro:load\"));})();"],["media","(()=>{var n=(a,t)=>{let i=async()=>{await(await a())()};if(t.value){let e=matchMedia(t.value);e.matches?i():e.addEventListener(\"change\",i,{once:!0})}};(self.Astro||(self.Astro={})).media=n;window.dispatchEvent(new Event(\"astro:media\"));})();"],["only","(()=>{var e=async t=>{await(await t())()};(self.Astro||(self.Astro={})).only=e;window.dispatchEvent(new Event(\"astro:only\"));})();"],["visible","(()=>{var a=(s,i,o)=>{let r=async()=>{await(await s())()},t=typeof i.value==\"object\"?i.value:void 0,c={rootMargin:t==null?void 0:t.rootMargin},n=new IntersectionObserver(e=>{for(let l of e)if(l.isIntersecting){n.disconnect(),r();break}},c);for(let e of o.children)n.observe(e)};(self.Astro||(self.Astro={})).visible=a;window.dispatchEvent(new Event(\"astro:visible\"));})();"]],"entryModules":{"\u0000@astro-page:src/pages/api/notify@_@ts":"pages/api/notify.astro.mjs","\u0000@astro-page:src/pages/archive@_@astro":"pages/archive.astro.mjs","\u0000@astro-page:src/pages/index@_@astro":"pages/index.astro.mjs","\u0000@astrojs-ssr-virtual-entry":"entry.mjs","\u0000@astro-renderers":"renderers.mjs","\u0000noop-middleware":"_noop-middleware.mjs","\u0000virtual:astro:actions/noop-entrypoint":"noop-entrypoint.mjs","\u0000@astro-page:node_modules/astro/dist/assets/endpoint/generic@_@js":"pages/_image.astro.mjs","\u0000@astrojs-ssr-adapter":"_@astrojs-ssr-adapter.mjs","\u0000@astrojs-manifest":"manifest_5YKdBhOn.mjs","/Users/amberzeng/Documents/code/merch/node_modules/astro/dist/assets/services/sharp.js":"chunks/sharp_BaA9XWd5.mjs","/Users/amberzeng/Documents/code/merch/node_modules/astro/components/ClientRouter.astro?astro&type=script&index=0&lang.ts":"_astro/ClientRouter.astro_astro_type_script_index_0_lang.DxD8ucBX.js","/Users/amberzeng/Documents/code/merch/src/components/hero.astro?astro&type=script&index=0&lang.ts":"_astro/hero.astro_astro_type_script_index_0_lang.DSha0PIN.js","/Users/amberzeng/Documents/code/merch/src/pages/archive.astro?astro&type=script&index=0&lang.ts":"_astro/archive.astro_astro_type_script_index_0_lang.kAWcHq0x.js","/Users/amberzeng/Documents/code/merch/src/pages/index.astro?astro&type=script&index=0&lang.ts":"_astro/index.astro_astro_type_script_index_0_lang.DuxIlnXg.js","astro:scripts/page.js":"_astro/page.DTPp-pk-.js","astro:scripts/before-hydration.js":""},"inlinedScripts":[["/Users/amberzeng/Documents/code/merch/src/pages/archive.astro?astro&type=script&index=0&lang.ts","const t=document.querySelector(\"#hoodie-overlay\"),h=document.querySelector(\"[data-open-hoodie]\"),i=t?.querySelector(\"[data-carousel-current]\"),o=t?Array.from(t.querySelectorAll(\"[data-carousel-thumb]\")):[],s=t?.querySelector(\".hoodie-carousel__main\"),w=t?.querySelector(\"[data-carousel-prev]\"),v=t?.querySelector(\"[data-carousel-next]\"),E=window.matchMedia(\"(prefers-reduced-motion: reduce)\").matches,f=E?0:120;let a,l=0;h?.addEventListener(\"click\",()=>t?.showModal());function g(){if(!(!t?.open||t.classList.contains(\"is-closing\"))){if(!f){t.close();return}t.classList.add(\"is-closing\"),a=window.setTimeout(()=>t.close(),f)}}t?.addEventListener(\"close\",()=>{a&&window.clearTimeout(a),a=void 0,t.classList.remove(\"is-closing\"),h?.focus()});t?.addEventListener(\"cancel\",e=>{e.preventDefault(),g()});t?.addEventListener(\"click\",e=>{e.target===t&&g()});function u(e){if(!i||!o.length)return;const r=o[(e+o.length)%o.length],n=r.dataset.imageSrc;!n||i.src.endsWith(n)||(l=(e+o.length)%o.length,i.src=n,i.alt=r.dataset.imageAlt??\"\",o.forEach(p=>p.classList.toggle(\"is-active\",p===r)))}w?.addEventListener(\"click\",()=>u(l-1));v?.addEventListener(\"click\",()=>u(l+1));let m=0,L=0,c=null,d=!1;s?.addEventListener(\"pointerdown\",e=>{e.pointerType===\"mouse\"||e.target.closest(\".hoodie-carousel__prev, .hoodie-carousel__next\")||(m=e.clientX,L=e.clientY,c=e.pointerId,s.setPointerCapture(e.pointerId))});s?.addEventListener(\"pointerup\",e=>{if(e.pointerId!==c)return;const r=e.clientX-m,n=e.clientY-L;c=null,!(Math.abs(r)<40||Math.abs(r)<Math.abs(n))&&(e.preventDefault(),d=!0,u(l+(r<0?1:-1)))});s?.addEventListener(\"pointercancel\",()=>{c=null});s?.addEventListener(\"click\",e=>{d&&(e.preventDefault(),e.stopPropagation(),d=!1)},!0);"]],"assets":["/_astro/hoodie-front.DCYphaTe.webp","/_astro/hoodie-back.D3CB4DkN.webp","/_astro/hoodie2.R4ymrYoW.webp","/_astro/hoodie3.CH9qEaAH.webp","/_astro/hoodie4.Egr74bVX.webp","/_astro/hoodie5.CR0LB8rT.webp","/_astro/hoodie8.Bcr_pqPA.webp","/_astro/hoodie6.BVNPyH9S.webp","/_astro/hoodie1.Bj-ziIHj.webp","/_astro/hoodie7.DOB9dog5.webp","/_astro/archive-red.B9AVjnrQ.svg","/_astro/archive-star.BJhVf3sK.svg","/_astro/archive-ellipse.E7L8ebqE.svg","/_astro/archive-union.ef2DQqFV.svg","/_astro/merch-concept.BSI8VqSl.webp","/_astro/merch-shirt.Co53zc-9.png","/_astro/merch-hat.BHuJ3Z9f.png","/_astro/mask-bag.XUniyXX4.webp","/_astro/mask-keychain.GvmMQoxn.webp","/_astro/mask-other.eqy8MGMF.svg","/_astro/archive.BCL-YgrN.css","/_astro/index.CAb7cAiA.css","/_astro/ClientRouter.astro_astro_type_script_index_0_lang.DxD8ucBX.js","/_astro/figma-union-243-13.CUiu3vCZ.svg","/_astro/figma-union-243-30.DXIZaL9D.svg","/_astro/figma-union-243-42.DXJ3Q-Tn.svg","/_astro/hero.astro_astro_type_script_index_0_lang.DSha0PIN.js","/_astro/index.E2NZU3JX.js","/_astro/index.astro_astro_type_script_index_0_lang.DuxIlnXg.js","/_astro/page.DTPp-pk-.js","/bro/icon.svg","/fonts/Inconsolata-SemiBold.woff","/fonts/PixelHackers.woff2","/fonts/PolySans-Inky.woff2","/fonts/PolySans-Neutral.woff2","/fonts/PolySans-Relax.woff2","/_astro/page.DTPp-pk-.js"],"buildFormat":"directory","checkOrigin":true,"allowedDomains":[],"actionBodySizeLimit":1048576,"serverIslandNameMap":[],"key":"+BxUQF4wRWhVuvcRqZA5NF6bt7q52Crk+pivhWiQWEE="});
if (manifest.sessionConfig) manifest.sessionConfig.driverModule = null;

export { manifest };
