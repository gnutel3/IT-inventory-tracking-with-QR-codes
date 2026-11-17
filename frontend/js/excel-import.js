function wireExcelImport(onApplied) {
  const fileInput = document.querySelector("#excel-file");
  const preview = document.querySelector("#excel-preview");
  const apply = document.querySelector("#excel-apply");
  const status = document.querySelector("#excel-status");
  const results = document.querySelector("#excel-results");
  let busy = false;
  let approvedFile = null;

  function controls() {
    fileInput.disabled = busy;
    preview.disabled = busy || !fileInput.files[0];
    apply.disabled = busy || !approvedFile;
  }

  function upload(file, action) {
    const data = new FormData();
    data.set("file", file);
    return inventoryApi.request(`import/xlsx/${action}`, "POST", data);
  }

  fileInput.addEventListener("change", () => {
    approvedFile = null;
    status.textContent = "";
    results.replaceChildren();
    controls();
  });

  preview.addEventListener("click", async () => {
    const file = fileInput.files[0];
    if (!file || busy) return;
    approvedFile = null;
    busy = true;
    status.textContent = "Проверяем Excel…";
    results.replaceChildren();
    controls();
    try {
      const { rows } = await upload(file, "preview");
      const bad = rows.filter((row) => row.errors.length).length;
      const items = document.createDocumentFragment();
      for (const row of rows) {
        const item = document.createElement("div");
        item.className = `result-item ${row.errors.length ? "bad" : "ok"}`;
        const title = document.createElement("strong");
        title.textContent = `Строка ${row.row} · ${row.inventory_number || "Без номера"} · ${row.name || "Без названия"}`;
        const detail = document.createElement("span");
        detail.textContent = row.errors.join("; ") || "Готово";
        item.append(title, detail);
        items.append(item);
      }
      results.append(items);
      status.textContent = bad ? `Строк с ошибками: ${bad}. Ничего не добавлено.` : `Готово к импорту: ${rows.length}.`;
      if (!bad && rows.length) approvedFile = file;
    } catch (error) {
      status.textContent = error.message;
    } finally {
      busy = false;
      controls();
    }
  });

  apply.addEventListener("click", async () => {
    if (!approvedFile || busy) return;
    const file = approvedFile;
    approvedFile = null;
    busy = true;
    status.textContent = "Сохраняем устройства…";
    controls();
    try {
      const { added } = await upload(file, "apply");
      status.textContent = `Импорт завершён. Добавлено: ${added}.`;
      fileInput.value = "";
      results.replaceChildren();
      await onApplied();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      busy = false;
      controls();
    }
  });
}
