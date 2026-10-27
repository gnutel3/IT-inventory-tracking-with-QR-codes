const STORAGE_KEY = "it-inventory-qr-state-v1";

const STATUSES = ["В эксплуатации", "На складе", "В ремонте", "Списано", "Потеряно"];

const demoState = {
  assets: [
    {
      id: 1,
      inventoryNumber: "INV-1001",
      name: "Dell Latitude 5440",
      category: "Ноутбук",
      serial: "DL-5440-A91",
      location: "Кабинет 304",
      owner: "Иван Петров",
      status: "В эксплуатации",
      cost: 124000,
      purchaseDate: "2024-02-14",
      usefulLifeMonths: 36,
      notes: "Основной рабочий ноутбук аналитика",
    },
    {
      id: 2,
      inventoryNumber: "INV-1002",
      name: "HP EliteDisplay E243",
      category: "Монитор",
      serial: "HP-E243-77K",
      location: "Кабинет 304",
      owner: "Иван Петров",
      status: "В эксплуатации",
      cost: 28000,
      purchaseDate: "2021-09-08",
      usefulLifeMonths: 48,
      notes: "Левый монитор рабочего места",
    },
    {
      id: 3,
      inventoryNumber: "INV-1003",
      name: "HP EliteDisplay E243",
      category: "Монитор",
      serial: "HP-E243-81M",
      location: "Кабинет 304",
      owner: "Иван Петров",
      status: "В эксплуатации",
      cost: 28000,
      purchaseDate: "2021-09-08",
      usefulLifeMonths: 48,
      notes: "Правый монитор рабочего места",
    },
    {
      id: 4,
      inventoryNumber: "INV-1004",
      name: "Lenovo ThinkPad T14",
      category: "Ноутбук",
      serial: "LNV-T14-321",
      location: "Кабинет 207",
      owner: "Мария Смирнова",
      status: "В эксплуатации",
      cost: 139000,
      purchaseDate: "2023-05-21",
      usefulLifeMonths: 36,
      notes: "Выдан frontend разработчику",
    },
    {
      id: 5,
      inventoryNumber: "INV-1005",
      name: "Canon i-SENSYS MF443dw",
      category: "Принтер",
      serial: "CN-443-009",
      location: "Кабинет 207",
      owner: "Отдел разработки",
      status: "В ремонте",
      cost: 42000,
      purchaseDate: "2020-11-02",
      usefulLifeMonths: 60,
      notes: "Замятие бумаги, передан в сервис",
    },
    {
      id: 6,
      inventoryNumber: "INV-1006",
      name: "MikroTik hAP ac2",
      category: "Сетевое оборудование",
      serial: "MT-HAP-552",
      location: "Склад IT",
      owner: "IT отдел",
      status: "На складе",
      cost: 7400,
      purchaseDate: "2022-03-17",
      usefulLifeMonths: 48,
      notes: "Резервный роутер",
    },
    {
      id: 7,
      inventoryNumber: "INV-1007",
      name: "Apple USB-C Digital AV",
      category: "Переходник",
      serial: "AV-USB-C-19",
      location: "Кабинет 304",
      owner: "Переговорная зона",
      status: "В эксплуатации",
      cost: 6900,
      purchaseDate: "2022-08-10",
      usefulLifeMonths: 24,
      notes: "Часто перемещается между кабинетами",
    },
  ],
  movements: [
    { assetId: 6, from: "Кабинет 101", to: "Склад IT", user: "Алексей Орлов", date: "2026-10-01", reason: "Резерв" },
    { assetId: 5, from: "Кабинет 207", to: "Сервисный центр", user: "Алексей Орлов", date: "2026-10-05", reason: "Ремонт" },
    { assetId: 7, from: "Кабинет 207", to: "Кабинет 304", user: "Мария Смирнова", date: "2026-10-10", reason: "Для презентации" },
  ],
  repairs: [
    { assetId: 5, issue: "Замятие бумаги и следы износа ролика", status: "В работе", contractor: "PrintService", cost: 5200, startedAt: "2026-10-05", finishedAt: "" },
    { assetId: 2, issue: "Проверка битых пикселей", status: "Закрыт", contractor: "IT отдел", cost: 0, startedAt: "2025-12-11", finishedAt: "2025-12-11" },
  ],
  selectedLabelIds: [1, 2, 3, 7],
  inventory: {
    location: "Кабинет 304",
    scans: [],
    unknown: [],
  },
};

let state = loadState();
let pendingImportRows = [];

const titles = {
  dashboard: "Панель управления",
  registry: "Реестр техники",
  labels: "QR метки",
  inventory: "Мобильная инвентаризация",
  reports: "Отчеты",
  import: "Импорт из Excel",
};

const els = {
  title: document.querySelector("#view-title"),
  nav: document.querySelectorAll(".nav-button"),
  views: document.querySelectorAll(".view"),
  metrics: document.querySelector("#metrics"),
  movementFeed: document.querySelector("#movement-feed"),
  attentionList: document.querySelector("#attention-list"),
  assetTable: document.querySelector("#asset-table"),
  assetSearch: document.querySelector("#asset-search"),
  categoryFilter: document.querySelector("#category-filter"),
  locationFilter: document.querySelector("#location-filter"),
  statusFilter: document.querySelector("#status-filter"),
  labelPicker: document.querySelector("#label-picker"),
  labelSheet: document.querySelector("#label-sheet"),
  inventoryLocation: document.querySelector("#inventory-location"),
  scanInput: document.querySelector("#scan-input"),
  quickScan: document.querySelector("#quick-scan"),
  inventorySummary: document.querySelector("#inventory-summary"),
  inventoryResults: document.querySelector("#inventory-results"),
  whereReport: document.querySelector("#where-report"),
  writeoffReport: document.querySelector("#writeoff-report"),
  csvFile: document.querySelector("#csv-file"),
  csvInput: document.querySelector("#csv-input"),
  importPreview: document.querySelector("#import-preview"),
  applyImport: document.querySelector("#apply-import"),
  assetDialog: document.querySelector("#asset-dialog"),
  assetDetails: document.querySelector("#asset-details"),
  assetForm: document.querySelector("#asset-form"),
};

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(demoState);
  try {
    return JSON.parse(raw);
  } catch {
    return structuredClone(demoState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatMoney(value) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function qrPayload(asset) {
  return `asset:${asset.id}|${asset.inventoryNumber}`;
}

function monthsBetween(from, to = new Date()) {
  if (!from) return 0;
  const start = new Date(from);
  return Math.max(0, (to.getFullYear() - start.getFullYear()) * 12 + to.getMonth() - start.getMonth());
}

function residualValue(asset) {
  const cost = Number(asset.cost || 0);
  const life = Number(asset.usefulLifeMonths || 36);
  const used = monthsBetween(asset.purchaseDate);
  const residual = Math.max(0, cost * (1 - used / life));
  return Math.round(residual);
}

function depreciationPercent(asset) {
  const cost = Number(asset.cost || 0);
  if (!cost) return 0;
  return Math.round((1 - residualValue(asset) / cost) * 100);
}

function statusClass(status) {
  if (status === "В эксплуатации") return "green";
  if (status === "В ремонте" || status === "На складе") return "yellow";
  return "red";
}

function unique(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, "ru"));
}

function assetById(id) {
  return state.assets.find((asset) => asset.id === Number(id));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderQrSvg(text, size = 120) {
  const qr = new window.QRCode(-1, window.QRErrorCorrectLevel.M);
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const cell = size / count;
  let rects = "";
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.isDark(row, col)) {
        rects += `<rect x="${(col * cell).toFixed(2)}" y="${(row * cell).toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}"/>`;
      }
    }
  }
  return `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="QR ${escapeHtml(text)}"><rect width="${size}" height="${size}" fill="#fff"/><g fill="#111">${rects}</g></svg>`;
}

function setOptions(select, values, allLabel = "Все") {
  const current = select.value;
  select.innerHTML = `<option value="">${allLabel}</option>` + values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  select.value = values.includes(current) ? current : "";
}

function renderDashboard() {
  const active = state.assets.filter((asset) => asset.status === "В эксплуатации").length;
  const repair = state.assets.filter((asset) => asset.status === "В ремонте").length;
  const writeoff = state.assets.filter((asset) => depreciationPercent(asset) >= 90 || asset.status === "Потеряно").length;
  const totalCost = state.assets.reduce((sum, asset) => sum + Number(asset.cost || 0), 0);

  els.metrics.innerHTML = [
    ["Всего единиц", state.assets.length],
    ["В эксплуатации", active],
    ["В ремонте", repair],
    ["К списанию", writeoff],
  ]
    .map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");

  els.movementFeed.innerHTML = state.movements
    .slice()
    .reverse()
    .map((item) => {
      const asset = assetById(item.assetId);
      return `<div class="feed-item"><strong>${escapeHtml(asset?.inventoryNumber || "Неизвестно")} -> ${escapeHtml(item.to)}</strong><span>${escapeHtml(item.date)} · ${escapeHtml(item.user)} · ${escapeHtml(item.reason)}</span></div>`;
    })
    .join("");

  const attention = state.assets
    .filter((asset) => asset.status === "В ремонте" || depreciationPercent(asset) >= 90 || asset.status === "Потеряно")
    .map((asset) => {
      const reason = asset.status === "В ремонте" ? "нужно контролировать ремонт" : `амортизация ${depreciationPercent(asset)}%`;
      return `<div class="attention-item"><strong>${escapeHtml(asset.inventoryNumber)} · ${escapeHtml(asset.name)}</strong><span>${escapeHtml(reason)} · остаточная стоимость ${formatMoney(residualValue(asset))}</span></div>`;
    });
  els.attentionList.innerHTML = attention.join("") || `<div class="attention-item"><strong>Критичных задач нет</strong><span>Суммарная стоимость базы: ${formatMoney(totalCost)}</span></div>`;
}

function renderFilters() {
  setOptions(els.categoryFilter, unique(state.assets.map((asset) => asset.category)));
  setOptions(els.locationFilter, unique(state.assets.map((asset) => asset.location)));
  setOptions(els.statusFilter, STATUSES);
  setOptions(els.inventoryLocation, unique(state.assets.map((asset) => asset.location)), "Выберите локацию");
  if (!els.inventoryLocation.value) els.inventoryLocation.value = state.inventory.location;
}

function filteredAssets() {
  const query = els.assetSearch.value.trim().toLowerCase();
  const category = els.categoryFilter.value;
  const location = els.locationFilter.value;
  const status = els.statusFilter.value;
  return state.assets.filter((asset) => {
    const haystack = [asset.inventoryNumber, asset.name, asset.serial, asset.owner, asset.location, asset.category].join(" ").toLowerCase();
    return (!query || haystack.includes(query)) && (!category || asset.category === category) && (!location || asset.location === location) && (!status || asset.status === status);
  });
}

function renderRegistry() {
  const rows = filteredAssets().map((asset) => {
    return `<tr data-id="${asset.id}">
      <td><strong>${escapeHtml(asset.inventoryNumber)}</strong></td>
      <td>${escapeHtml(asset.name)}</td>
      <td>${escapeHtml(asset.category)}</td>
      <td>${escapeHtml(asset.location)}</td>
      <td>${escapeHtml(asset.owner || "-")}</td>
      <td><span class="pill ${statusClass(asset.status)}">${escapeHtml(asset.status)}</span></td>
      <td>${formatMoney(asset.cost)}</td>
    </tr>`;
  });
  els.assetTable.innerHTML = rows.join("") || `<tr><td colspan="7">Ничего не найдено</td></tr>`;
}

function renderLabels() {
  els.labelPicker.innerHTML = state.assets
    .map((asset) => {
      const checked = state.selectedLabelIds.includes(asset.id) ? "checked" : "";
      return `<label class="asset-option"><input type="checkbox" value="${asset.id}" ${checked}/><span><strong>${escapeHtml(asset.inventoryNumber)}</strong> · ${escapeHtml(asset.name)}<br><small>${escapeHtml(asset.location)}</small></span></label>`;
    })
    .join("");

  const selected = state.assets.filter((asset) => state.selectedLabelIds.includes(asset.id));
  els.labelSheet.innerHTML = selected
    .map((asset) => {
      return `<article class="qr-label">
        ${renderQrSvg(qrPayload(asset), 88)}
        <div>
          <strong>${escapeHtml(asset.inventoryNumber)}</strong>
          <span>${escapeHtml(asset.category)}</span>
          <span>${escapeHtml(asset.name)}</span>
          <span>${escapeHtml(asset.location)}</span>
        </div>
      </article>`;
    })
    .join("") || `<p>Выберите хотя бы одно устройство.</p>`;
}

function classifyInventory() {
  const location = state.inventory.location;
  const expected = state.assets.filter((asset) => asset.location === location && asset.status !== "Списано");
  const scannedIds = new Set(state.inventory.scans.map((scan) => scan.assetId).filter(Boolean));
  const rows = [];

  expected.forEach((asset) => {
    rows.push({
      type: scannedIds.has(asset.id) ? "ok" : "bad",
      title: asset.inventoryNumber,
      text: scannedIds.has(asset.id) ? `${asset.name} найдено по плану` : `${asset.name} отсутствует по факту`,
    });
  });

  state.inventory.scans.forEach((scan) => {
    const asset = assetById(scan.assetId);
    if (!asset) {
      rows.push({ type: "warn", title: scan.code, text: "QR не найден в базе" });
      return;
    }
    if (asset.location !== location) {
      rows.push({ type: "warn", title: asset.inventoryNumber, text: `${asset.name} закреплено за другой локацией: ${asset.location}` });
    }
  });

  state.inventory.unknown.forEach((item) => {
    rows.push({ type: "warn", title: item.name, text: "Найдено вручную, QR отсутствует или поврежден" });
  });

  return { expected, rows };
}

function renderInventory() {
  const location = els.inventoryLocation.value || state.inventory.location;
  state.inventory.location = location;

  const expected = state.assets.filter((asset) => asset.location === location && asset.status !== "Списано");
  els.quickScan.innerHTML = expected
    .map((asset) => `<button type="button" data-code="${escapeHtml(asset.inventoryNumber)}">${escapeHtml(asset.inventoryNumber)}</button>`)
    .join("");

  const { rows } = classifyInventory();
  const found = rows.filter((row) => row.type === "ok").length;
  const issues = rows.filter((row) => row.type !== "ok").length;
  els.inventorySummary.textContent = `${found} найдено · ${issues} расхождений`;
  els.inventoryResults.innerHTML = rows
    .map((row) => `<div class="result-item ${row.type}"><div><strong>${escapeHtml(row.title)}</strong><br><span>${escapeHtml(row.text)}</span></div><span>${row.type === "ok" ? "OK" : "Проверить"}</span></div>`)
    .join("") || `<div class="result-item"><span>Выберите локацию и начните сканирование.</span></div>`;
  saveState();
}

function renderReports() {
  const groups = unique(state.assets.map((asset) => asset.location)).map((location) => {
    const assets = state.assets.filter((asset) => asset.location === location);
    return `<div class="report-item"><strong>${escapeHtml(location)} · ${assets.length} ед.</strong><span>${escapeHtml(assets.map((asset) => `${asset.inventoryNumber} ${asset.name}`).join(", "))}</span></div>`;
  });
  els.whereReport.innerHTML = groups.join("");

  const candidates = state.assets
    .filter((asset) => depreciationPercent(asset) >= 90 || asset.status === "Потеряно")
    .map((asset) => `<div class="report-item"><strong>${escapeHtml(asset.inventoryNumber)} · ${escapeHtml(asset.name)}</strong><span>Амортизация ${depreciationPercent(asset)}% · остаточная ${formatMoney(residualValue(asset))} · ${escapeHtml(asset.status)}</span></div>`);
  els.writeoffReport.innerHTML = candidates.join("") || `<div class="report-item"><strong>Пока нечего списывать</strong><span>Нет устройств с высокой амортизацией или потерей.</span></div>`;
}

function renderAll() {
  renderFilters();
  renderDashboard();
  renderRegistry();
  renderLabels();
  renderInventory();
  renderReports();
}

function switchView(view) {
  els.nav.forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  els.views.forEach((section) => section.classList.toggle("active", section.id === `${view}-view`));
  els.title.textContent = titles[view];
}

function parseScannedAsset(code) {
  const normalized = code.trim();
  const idMatch = normalized.match(/asset:(\d+)/);
  if (idMatch) return assetById(idMatch[1]);
  return state.assets.find((asset) => asset.inventoryNumber.toLowerCase() === normalized.toLowerCase() || qrPayload(asset) === normalized);
}

function addScan(code) {
  if (!code.trim()) return;
  const asset = parseScannedAsset(code);
  state.inventory.scans.push({
    code: code.trim(),
    assetId: asset?.id || null,
    scannedAt: new Date().toISOString(),
  });
  els.scanInput.value = "";
  renderInventory();
}

function openAssetDialog(asset = null) {
  document.querySelector("#dialog-title").textContent = asset ? "Редактировать технику" : "Добавить технику";
  document.querySelector("#asset-id").value = asset?.id || "";
  document.querySelector("#inventory-number").value = asset?.inventoryNumber || "";
  document.querySelector("#asset-name").value = asset?.name || "";
  document.querySelector("#asset-category").value = asset?.category || "";
  document.querySelector("#asset-serial").value = asset?.serial || "";
  document.querySelector("#asset-location").value = asset?.location || "";
  document.querySelector("#asset-owner").value = asset?.owner || "";
  document.querySelector("#asset-cost").value = asset?.cost || "";
  document.querySelector("#asset-purchase-date").value = asset?.purchaseDate || "";
  document.querySelector("#asset-life").value = asset?.usefulLifeMonths || 36;
  document.querySelector("#asset-notes").value = asset?.notes || "";
  const statusSelect = document.querySelector("#asset-status");
  statusSelect.innerHTML = STATUSES.map((status) => `<option value="${status}">${status}</option>`).join("");
  statusSelect.value = asset?.status || "В эксплуатации";
  els.assetDialog.showModal();
}

function saveAssetFromForm(event) {
  event.preventDefault();
  const id = Number(document.querySelector("#asset-id").value);
  const formAsset = {
    id: id || Math.max(0, ...state.assets.map((asset) => asset.id)) + 1,
    inventoryNumber: document.querySelector("#inventory-number").value.trim(),
    name: document.querySelector("#asset-name").value.trim(),
    category: document.querySelector("#asset-category").value.trim(),
    serial: document.querySelector("#asset-serial").value.trim(),
    location: document.querySelector("#asset-location").value.trim(),
    owner: document.querySelector("#asset-owner").value.trim(),
    status: document.querySelector("#asset-status").value,
    cost: Number(document.querySelector("#asset-cost").value || 0),
    purchaseDate: document.querySelector("#asset-purchase-date").value,
    usefulLifeMonths: Number(document.querySelector("#asset-life").value || 36),
    notes: document.querySelector("#asset-notes").value.trim(),
  };

  if (!formAsset.inventoryNumber || !formAsset.name || !formAsset.category || !formAsset.location) return;

  const duplicate = state.assets.find((asset) => asset.inventoryNumber === formAsset.inventoryNumber && asset.id !== formAsset.id);
  if (duplicate) {
    alert("Инвентарный номер уже есть в реестре.");
    return;
  }

  const existingIndex = state.assets.findIndex((asset) => asset.id === formAsset.id);
  if (existingIndex >= 0) state.assets[existingIndex] = formAsset;
  else state.assets.push(formAsset);

  saveState();
  els.assetDialog.close();
  renderAll();
}

function openDetails(asset) {
  document.querySelector("#details-title").textContent = `${asset.inventoryNumber} · ${asset.name}`;
  const repairs = state.repairs.filter((repair) => repair.assetId === asset.id);
  const movements = state.movements.filter((movement) => movement.assetId === asset.id);
  document.querySelector("#details-body").innerHTML = `
    <div class="details-grid">
      <div>${renderQrSvg(qrPayload(asset), 150)}</div>
      <div>
        <p><strong>Категория:</strong> ${escapeHtml(asset.category)}</p>
        <p><strong>Серийный номер:</strong> ${escapeHtml(asset.serial || "-")}</p>
        <p><strong>Локация:</strong> ${escapeHtml(asset.location)}</p>
        <p><strong>Владелец:</strong> ${escapeHtml(asset.owner || "-")}</p>
        <p><strong>Статус:</strong> <span class="pill ${statusClass(asset.status)}">${escapeHtml(asset.status)}</span></p>
        <p><strong>Стоимость:</strong> ${formatMoney(asset.cost)} · остаточная ${formatMoney(residualValue(asset))} · амортизация ${depreciationPercent(asset)}%</p>
        <p><strong>QR payload:</strong> ${escapeHtml(qrPayload(asset))}</p>
      </div>
    </div>
    <div class="detail-section"><h3>История перемещений</h3>${movements.map((item) => `<p>${escapeHtml(item.date)}: ${escapeHtml(item.from)} -> ${escapeHtml(item.to)} · ${escapeHtml(item.reason)}</p>`).join("") || "<p>Перемещений нет.</p>"}</div>
    <div class="detail-section"><h3>Ремонты</h3>${repairs.map((item) => `<p>${escapeHtml(item.status)}: ${escapeHtml(item.issue)} · ${formatMoney(item.cost)} · ${escapeHtml(item.contractor)}</p>`).join("") || "<p>Ремонтов нет.</p>"}</div>
    <div class="button-row end"><button class="ghost-button" id="edit-current">Редактировать</button></div>
  `;
  document.querySelector("#edit-current").addEventListener("click", () => {
    els.assetDetails.close();
    openAssetDialog(asset);
  });
  els.assetDetails.showModal();
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const delimiter = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(delimiter).map((item) => item.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(delimiter).map((item) => item.trim());
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  });
}

function previewImport() {
  const rows = parseCsv(els.csvInput.value);
  pendingImportRows = rows.map((row, index) => {
    const asset = {
      id: Math.max(0, ...state.assets.map((item) => item.id)) + index + 1,
      inventoryNumber: row.inventoryNumber || row["Инвентарный номер"] || "",
      name: row.name || row["Название"] || "",
      category: row.category || row["Категория"] || "",
      serial: row.serial || row["Серийный номер"] || "",
      location: row.location || row["Локация"] || "",
      owner: row.owner || row["Владелец"] || "",
      status: row.status || row["Статус"] || "В эксплуатации",
      cost: Number(row.cost || row["Стоимость"] || 0),
      purchaseDate: row.purchaseDate || row["Дата покупки"] || "",
      usefulLifeMonths: Number(row.usefulLifeMonths || row["Срок службы"] || 36),
      notes: "Импортировано из CSV",
    };
    const errors = [];
    if (!asset.inventoryNumber) errors.push("нет инвентарного номера");
    if (!asset.name) errors.push("нет названия");
    if (!asset.category) errors.push("нет категории");
    if (!asset.location) errors.push("нет локации");
    if (state.assets.some((item) => item.inventoryNumber === asset.inventoryNumber)) errors.push("дубль номера");
    return { asset, errors };
  });

  els.importPreview.innerHTML = pendingImportRows
    .map(({ asset, errors }) => `<div class="result-item ${errors.length ? "bad" : "ok"}"><div><strong>${escapeHtml(asset.inventoryNumber || "Без номера")} · ${escapeHtml(asset.name || "Без названия")}</strong><br><span>${errors.length ? escapeHtml(errors.join(", ")) : "готово к импорту"}</span></div></div>`)
    .join("") || `<div class="result-item warn"><span>Нет строк для импорта.</span></div>`;
  els.applyImport.disabled = !pendingImportRows.length || pendingImportRows.some((row) => row.errors.length);
}

function applyImport() {
  state.assets.push(...pendingImportRows.map((row) => row.asset));
  pendingImportRows = [];
  els.csvInput.value = "";
  els.applyImport.disabled = true;
  els.importPreview.innerHTML = `<div class="result-item ok"><span>Импорт выполнен.</span></div>`;
  saveState();
  renderAll();
}

function exportCsv(rows, filename) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function wireEvents() {
  els.nav.forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  document.querySelector("#add-asset").addEventListener("click", () => openAssetDialog());
  document.querySelector("#reset-demo").addEventListener("click", () => {
    if (!confirm("Вернуть исходные демоданные?")) return;
    state = structuredClone(demoState);
    saveState();
    renderAll();
  });
  els.assetForm.addEventListener("submit", saveAssetFromForm);
  document.querySelector("#close-details").addEventListener("click", () => els.assetDetails.close());

  [els.assetSearch, els.categoryFilter, els.locationFilter, els.statusFilter].forEach((control) => control.addEventListener("input", renderRegistry));

  els.assetTable.addEventListener("click", (event) => {
    const row = event.target.closest("tr[data-id]");
    if (!row) return;
    openDetails(assetById(row.dataset.id));
  });

  els.labelPicker.addEventListener("change", () => {
    state.selectedLabelIds = [...els.labelPicker.querySelectorAll("input:checked")].map((input) => Number(input.value));
    saveState();
    renderLabels();
  });
  document.querySelector("#print-labels").addEventListener("click", () => window.print());

  els.inventoryLocation.addEventListener("change", () => {
    state.inventory.location = els.inventoryLocation.value;
    state.inventory.scans = [];
    state.inventory.unknown = [];
    renderInventory();
  });
  document.querySelector("#scan-button").addEventListener("click", () => addScan(els.scanInput.value));
  els.scanInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") addScan(els.scanInput.value);
  });
  els.quickScan.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-code]");
    if (button) addScan(button.dataset.code);
  });
  document.querySelector("#add-unknown").addEventListener("click", () => {
    state.inventory.unknown.push({ name: "Неизвестный переходник", createdAt: new Date().toISOString() });
    renderInventory();
  });

  document.querySelector("#load-sample").addEventListener("click", () => {
    els.csvInput.value = "inventoryNumber,name,category,serial,location,owner,status,cost,purchaseDate,usefulLifeMonths\nINV-2001,LG UltraFine 24,Монитор,LG-24-993,Кабинет 207,Мария Смирнова,В эксплуатации,31000,2024-04-12,48\nINV-2002,Logitech MX Keys,Клавиатура,LGK-82,Склад IT,IT отдел,На складе,11900,2025-01-19,36";
  });
  document.querySelector("#preview-import").addEventListener("click", previewImport);
  els.applyImport.addEventListener("click", applyImport);
  els.csvFile.addEventListener("change", async () => {
    const file = els.csvFile.files[0];
    if (!file) return;
    els.csvInput.value = await file.text();
  });

  document.querySelector("#export-where").addEventListener("click", () => {
    exportCsv([["Локация", "Инвентарный номер", "Название", "Статус"], ...state.assets.map((asset) => [asset.location, asset.inventoryNumber, asset.name, asset.status])], "where-report.csv");
  });
  document.querySelector("#export-writeoff").addEventListener("click", () => {
    const rows = state.assets.filter((asset) => depreciationPercent(asset) >= 90 || asset.status === "Потеряно");
    exportCsv([["Инвентарный номер", "Название", "Амортизация", "Остаточная стоимость", "Статус"], ...rows.map((asset) => [asset.inventoryNumber, asset.name, `${depreciationPercent(asset)}%`, residualValue(asset), asset.status])], "writeoff-report.csv");
  });
}

wireEvents();
renderAll();
