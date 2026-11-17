// Homepage merch pile. Hovering a cutout pulls it out of the pile, but only a click (on the
// cutout or its row in the list) selects it and changes the detail panel. That way moving
// the pointer over to the sizes or the add button never swaps the panel underneath it.
// The selected item stays pulled out until you click elsewhere.

const init = () => {
  const shop = document.querySelector<HTMLElement>("[data-shop]");
  if (!shop || shop.dataset.ready) return;
  shop.dataset.ready = "true";

  const hits = [...shop.querySelectorAll<HTMLElement>(".pile__hit[data-item]")];
  const rows = [...shop.querySelectorAll<HTMLButtonElement>(".shop-list__row[data-item]")];
  const details = [...shop.querySelectorAll<HTMLElement>("[data-detail]")];
  let pinned = "";

  const expand = (id: string) => {
    shop.dataset.active = id;
    for (const hit of hits) hit.closest(".pile__item")?.classList.toggle("is-active", hit.dataset.item === id);
  };

  const select = (id: string) => {
    pinned = id;
    expand(id);
    for (const row of rows) row.setAttribute("aria-expanded", String(row.dataset.item === id));
    for (const detail of details) detail.hidden = detail.dataset.detail !== id;
    // the open item goes in the address bar (?item=socks), so a shared link opens it too
    const url = new URL(location.href);
    if (id) url.searchParams.set("item", id);
    else url.searchParams.delete("item");
    if (url.href !== location.href) history.replaceState(history.state, "", url);
  };

  for (const hit of hits) {
    const id = hit.dataset.item ?? "";
    hit.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "mouse") expand(id);
    });
    hit.addEventListener("pointerleave", (event) => {
      if (event.pointerType === "mouse") expand(pinned);
    });
    hit.addEventListener("click", () => select(id));
  }
  for (const row of rows) row.addEventListener("click", () => select(row.dataset.item ?? ""));

  // opened from a shared link with ?item=…
  const shared = new URLSearchParams(location.search).get("item");
  if (shared && rows.some((row) => row.dataset.item === shared)) select(shared);

  // clicking away lets the pile settle back; the panel keeps the last selection
  const settle = () => {
    pinned = "";
    expand("");
  };
  const controller = new AbortController();
  document.addEventListener(
    "click",
    (event) => {
      if (pinned && !shop.contains(event.target as Node)) settle();
    },
    { signal: controller.signal },
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && pinned) settle();
    },
    { signal: controller.signal },
  );
  document.addEventListener("astro:before-swap", () => controller.abort(), { once: true });
};

document.addEventListener("astro:page-load", init);
init();
