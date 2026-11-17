const defaultDepreciationRules = {
  term_mode: "device", fixed_months: 36, residual_floor_percent: 0, writeoff_threshold_percent: 90,
};

function calculateDepreciation(asset, rules, today = new Date()) {
  const cents = Math.round(Number(asset.cost || 0) * 100);
  const purchase = new Date(asset.purchaseDate || "");
  if (!cents || !Number.isFinite(purchase.getTime())) return { percent: 0, residual: cents / 100 };
  const months = Math.max(0, (today.getUTCFullYear() - purchase.getUTCFullYear()) * 12 +
    today.getUTCMonth() - purchase.getUTCMonth());
  const life = rules.term_mode === "fixed" ? rules.fixed_months : (asset.usefulLifeMonths || 36);
  const percent = Math.min(100 - rules.residual_floor_percent, 100 * months / life);
  return { percent, residual: Math.round(cents * (1 - percent / 100)) / 100 };
}

function writeoffReason(asset, rules, today) {
  if (asset.status === "Списано") return "";
  if (asset.status === "Потеряно") return "Устройство потеряно";
  return calculateDepreciation(asset, rules, today).percent >= rules.writeoff_threshold_percent ?
    `Достигнут порог амортизации (${rules.writeoff_threshold_percent}%)` : "";
}

function wireDepreciation(getRules, onSaved) {
  const form = document.querySelector("#depreciation-form");
  const status = document.querySelector("#depreciation-status");
  const button = form.querySelector("button");
  const fixed = form.elements.fixed_months;
  const mode = form.elements.term_mode;
  let busy = false;

  function paint(rules) {
    if (busy) return;
    for (const [key, value] of Object.entries(rules)) form.elements[key].value = value;
    fixed.disabled = mode.value !== "fixed";
  }

  mode.addEventListener("change", () => { fixed.disabled = mode.value !== "fixed"; });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    button.disabled = true;
    status.textContent = "Сохранение…";
    const payload = {
      term_mode: mode.value,
      fixed_months: mode.value === "fixed" ? Number(fixed.value) : getRules().fixed_months,
      residual_floor_percent: Number(form.elements.residual_floor_percent.value),
      writeoff_threshold_percent: Number(form.elements.writeoff_threshold_percent.value),
    };
    try {
      const saved = await inventoryApi.request("depreciation/rules", "PUT", payload);
      busy = false;
      onSaved(saved);
      paint(saved);
      status.textContent = "Правила сохранены.";
    } catch (error) {
      status.textContent = error.message;
    } finally {
      busy = false;
      button.disabled = false;
    }
  });
  return paint;
}
