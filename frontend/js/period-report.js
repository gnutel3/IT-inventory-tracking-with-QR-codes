function wirePeriodReport() {
  const panel = document.querySelector("#period-report");
  const form = document.querySelector("#period-report-form");
  const unit = form.elements.unit;
  const number = form.elements.number;
  const status = document.querySelector("#period-report-status");
  const list = document.querySelector("#period-report-results");
  const download = document.querySelector("#download-period-report");
  let ready = null;
  let busy = false;
  panel.hidden = false;
  form.elements.year.value = new Date().getFullYear();

  function choices() {
    const count = unit.value === "month" ? 12 : unit.value === "quarter" ? 4 : 1;
    number.replaceChildren(...Array.from({ length: count }, (_, i) => new Option(String(i + 1), String(i + 1))));
    number.value = String(unit.value === "month" ? new Date().getMonth() + 1 : unit.value === "quarter" ?
      Math.floor(new Date().getMonth() / 3) + 1 : 1);
    document.querySelector("#period-number-label").hidden = unit.value === "year";
  }

  function invalidate() {
    ready = null;
    download.disabled = true;
    list.replaceChildren();
    status.textContent = "";
  }
  choices();
  unit.addEventListener("change", choices);
  form.addEventListener("input", invalidate);
  form.addEventListener("change", invalidate);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    invalidate();
    busy = true;
    form.inert = true;
    status.textContent = "Расчёт…";
    const query = new URLSearchParams({
      year: form.elements.year.value, unit: unit.value, number: number.value, scope: form.elements.scope.value,
    });
    try {
      const report = await inventoryApi.request("reports/writeoff?" + query);
      const summary = document.createElement("p");
      summary.textContent = `${report.start} — ${report.end}. Кандидатов: ${report.count}. Остаток: ${formatMoney(report.total_residual)}.`;
      list.append(summary);
      for (const row of report.rows) {
        const item = document.createElement("div");
        item.className = "report-item";
        const title = document.createElement("strong");
        title.textContent = `${row.inventory_number} · ${row.name}`;
        const text = document.createElement("span");
        text.textContent = `${row.location || "Без локации"} · ${row.percent}% · остаток ${formatMoney(row.residual)} · ${row.reason}`;
        item.append(title, text);
        list.append(item);
      }
      const note = document.createElement("p");
      note.textContent = report.note;
      list.append(note);
      ready = query;
      download.disabled = false;
      status.textContent = report.count ? "Отчёт сформирован." : "Кандидатов нет. Можно скачать пустой отчёт с параметрами.";
    } catch (error) {
      status.textContent = error.message;
    } finally {
      form.inert = false;
      busy = false;
    }
  });
  download.addEventListener("click", async () => {
    if (!ready || busy) return;
    busy = true;
    download.disabled = true;
    try {
      const query = new URLSearchParams(ready);
      query.set("format", "xlsx");
      const response = await fetch("/api/v1/reports/writeoff?" + query, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) {
        if (response.status === 401) window.dispatchEvent(new Event("inventory-session-expired"));
        throw new Error("Не удалось скачать отчёт. Повторите вход или сформируйте его заново.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `writeoff-${query.get("year")}-${query.get("unit")}-${query.get("number")}.xlsx`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = "Файл выгружен по данным на момент скачивания.";
    } catch (error) {
      status.textContent = error.message;
    } finally {
      busy = false;
      download.disabled = !ready;
    }
  });
}
