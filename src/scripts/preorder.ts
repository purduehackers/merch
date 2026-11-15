import { readPrices, selectedItems } from "./preorder-data.js";

document.querySelectorAll<HTMLFormElement>(".preorder__form").forEach((form) => {
  const total = form.querySelector<HTMLOutputElement>("[data-preorder-total]");
  const summary = form.querySelector<HTMLDivElement>(".preorder__summary");
  const inputs = [...form.querySelectorAll<HTMLInputElement>('input[name="items"]')];

  const prices = readPrices();

  const update = () => {
    const selected = selectedItems(inputs.filter((item) => item.checked).map((item) => item.value), prices);
    summary?.replaceChildren(...selected.map(({ name, price }) => {
      const row = document.createElement("div");
      const label = document.createElement("span");
      const amount = document.createElement("output");
      label.textContent = name;
      amount.value = price.toFixed(2);
      row.append(label, amount);
      return row;
    }));
    if (total) total.value = selected.reduce((sum, item) => sum + item.price, 0).toFixed(2);
  };

  inputs.forEach((item) => item.addEventListener("change", update));
  update();
});
