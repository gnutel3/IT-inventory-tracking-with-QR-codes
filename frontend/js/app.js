const STORAGE_KEY = "it-inventory-qr-state-v1";
const serverMode = new URLSearchParams(location.search).get("mode") === "server";

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

let state = serverMode ? {
  assets: [], movements: [], repairs: [], selectedLabelIds: [],
  inventory: { location: "", scans: [], unknown: [] },
} : loadState();
let pendingImportRows = [];
let serverBusy = false;
let serverLoaded = false;
let stopQrScanner;
let depreciationRules = defaultDepreciationRules;
let paintDepreciation;

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
  if (serverMode) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setServerBusy(busy) {
  serverBusy = busy;
  document.querySelector("#refresh-registry").disabled = busy;
  document.querySelector("#add-asset").disabled = busy || !serverLoaded;
  document.querySelector("#preview-import").disabled = busy || !serverLoaded;
  els.applyImport.disabled = busy || !serverLoaded || !pendingImportRows.length ||
    pendingImportRows.some((row) => row.errors.length);
}

async function refreshRegistry() {
  if (serverBusy) return;
  const status = document.querySelector("#server-status");
  setServerBusy(true);
  status.textContent = "Загрузка общего реестра…";
  try {
    const [assets, movements, rules] = await Promise.all([
      inventoryApi.list(), inventoryApi.movements(), inventoryApi.request("depreciation/rules"),
    ]);
    state.assets = assets;
    state.movements = movements.reverse();
    depreciationRules = rules;
    paintDepreciation(rules);
    serverLoaded = true;
    pendingImportRows = [];
    els.importPreview.textContent = "";
    renderAll();
    status.textContent = "Общий реестр · подключено";
  } catch (error) {
    status.textContent = error.message;
  } finally {
    setServerBusy(false);
  }
}

function formatMoney(value) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value || 0));
}

function qrPayload(asset) {
  if (serverMode && asset.qrToken) {
    const url = new URL("/app/", location.origin);
    url.searchParams.set("mode", "server");
    url.searchParams.set("device", asset.qrToken);
    return url.href;
  }
  if (serverMode) return `device:${asset.id}`;
  return `asset:${asset.id}|${asset.inventoryNumber}`;
}

function depreciationLabel(percent) {
  return `${Math.floor(percent * 10) / 10}%`;
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
  const edge = count + 8;
  let rects = "";
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.isDark(row, col)) {
        rects += `<rect x="${col + 4}" y="${row + 4}" width="1" height="1"/>`;
      }
    }
  }
  return `<svg viewBox="0 0 ${edge} ${edge}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="QR ${escapeHtml(text)}"><rect width="${edge}" height="${edge}" fill="#fff"/><g fill="#111">${rects}</g></svg>`;
}

function setOptions(select, values, allLabel = "Все") {
  const current = select.value;
  select.innerHTML = `<option value="">${allLabel}</option>` + values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  select.value = values.includes(current) ? current : "";
}

function renderDashboard() {
  const active = state.assets.filter((asset) => asset.status === "В эксплуатации").length;
  const repair = state.assets.filter((asset) => asset.status === "В ремонте").length;
  const writeoff = state.assets.filter((asset) => writeoffReason(asset, depreciationRules)).length;
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
    .filter((asset) => asset.status === "В ремонте" || writeoffReason(asset, depreciationRules))
    .map((asset) => {
      const reason = asset.status === "В ремонте" ? "нужно контролировать ремонт" : writeoffReason(asset, depreciationRules);
      return `<div class="attention-item"><strong>${escapeHtml(asset.inventoryNumber)} · ${escapeHtml(asset.name)}</strong><span>${escapeHtml(reason)} · остаточная стоимость ${formatMoney(calculateDepreciation(asset, depreciationRules).residual)}</span></div>`;
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
    if (serverMode && asset.status === "Списано") {
      rows.push({ type: "warn", title: asset.inventoryNumber, text: `${asset.name}: списанное устройство` });
    } else if (asset.location !== location) {
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
  els.inventoryResults.innerHTML = inventoryRows(rows) || `<div class="result-item"><span>Выберите локацию и начните сканирование.</span></div>`;
  document.querySelector("#finish-check").disabled = !location;
  saveState();
}

function inventoryRows(rows) {
  return rows
    .map((row) => `<div class="result-item ${row.type}"><div><strong>${escapeHtml(row.title)}</strong><br><span>${escapeHtml(row.text)}</span></div><span>${row.type === "ok" ? "OK" : "Проверить"}</span></div>`)
    .join("");
}

function renderReports() {
  const groups = unique(state.assets.map((asset) => asset.location)).map((location) => {
    const assets = state.assets.filter((asset) => asset.location === location);
    return `<div class="report-item"><strong>${escapeHtml(location)} · ${assets.length} ед.</strong><span>${escapeHtml(assets.map((asset) => `${asset.inventoryNumber} ${asset.name}`).join(", "))}</span></div>`;
  });
  els.whereReport.innerHTML = groups.join("");

  const candidates = state.assets
    .filter((asset) => writeoffReason(asset, depreciationRules))
    .map((asset) => {
      const result = calculateDepreciation(asset, depreciationRules);
      return `<div class="report-item"><strong>${escapeHtml(asset.inventoryNumber)} · ${escapeHtml(asset.name)}</strong><span>${escapeHtml(writeoffReason(asset, depreciationRules))} · Амортизация ${depreciationLabel(result.percent)} · остаточная ${formatMoney(result.residual)} · ${escapeHtml(asset.status)}</span></div>`;
    });
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
  if (view !== "inventory") stopQrScanner?.();
  els.nav.forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  els.views.forEach((section) => section.classList.toggle("active", section.id === `${view}-view`));
  els.title.textContent = titles[view];
  if (serverMode && view === "inventory") loadChecks();
}

function parseScannedAsset(code) {
  const normalized = code.trim();
  const qrToken = serverMode && normalized.match(/^qr:([a-f0-9]{32})$/)?.[1];
  if (qrToken) return state.assets.find((asset) => asset.qrToken === qrToken);
  const deviceId = serverMode && normalized.match(/^device:(\d+)$/)?.[1];
  if (deviceId) return assetById(deviceId);
  const demoId = !serverMode && normalized.match(/^asset:(\d+)\|/)?.[1];
  if (demoId) return assetById(demoId);
  const taggedNumber = normalized.match(/^asset:\d+\|(.+)$/)?.[1];
  const number = taggedNumber || normalized;
  const exact = state.assets.find((asset) => asset.inventoryNumber === number);
  if (exact) return exact;
  const matches = state.assets.filter((asset) => asset.inventoryNumber.toLowerCase() === number.toLowerCase());
  return matches.length === 1 ? matches[0] : null;
}

function scanFeedback(message) {
  const status = document.querySelector("#scan-status");
  status.textContent = message;
  status.hidden = !message;
}

function addScan(code) {
  const normalized = normalizeInventoryQr(code);
  if (!normalized) return;
  if (normalized.length > 200) {
    scanFeedback("Код слишком длинный. Введите инвентарный номер.");
    return;
  }
  if (!state.inventory.location) {
    scanFeedback("Сначала выберите помещение.");
    return;
  }
  const asset = parseScannedAsset(normalized);
  if (state.inventory.scans.some((scan) => asset ? scan.assetId === asset.id : scan.code.toLowerCase() === normalized.toLowerCase())) {
    els.scanInput.value = "";
    scanFeedback("Код уже отмечен.");
    return;
  }
  state.inventory.scans.push({
    code: normalized,
    assetId: asset?.id || null,
    scannedAt: new Date().toISOString(),
  });
  els.scanInput.value = "";
  renderInventory();
  scanFeedback(asset ? `Отмечено: ${asset.inventoryNumber}` : "Кода нет в реестре. Добавлен в расхождения.");
}

function openAssetDialog(asset = null) {
  if (serverMode && (serverBusy || !serverLoaded)) return;
  stopQrScanner?.();
  document.querySelector("#asset-error").hidden = true;
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

async function saveAssetFromForm(event) {
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

  if (serverMode) {
    if (serverBusy || !serverLoaded) return;
    const errorBox = document.querySelector("#asset-error");
    const controls = els.assetForm.querySelectorAll("button");
    errorBox.hidden = true;
    setServerBusy(true);
    controls.forEach((button) => { button.disabled = true; });
    try {
      const write = await inventoryApi.writer();
      const saved = await write(formAsset, id || null);
      const index = state.assets.findIndex((asset) => asset.id === saved.id);
      if (index < 0) state.assets.push(saved);
      else state.assets[index] = saved;
      els.assetDialog.close();
      renderAll();
      inventoryApi.movements().then((items) => {
        state.movements = items.reverse();
        renderDashboard();
      }).catch(() => {});
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    } finally {
      controls.forEach((button) => { button.disabled = false; });
      setServerBusy(false);
    }
    return;
  }

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
  if (!asset) return;
  const depreciation = calculateDepreciation(asset, depreciationRules);
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
        <p><strong>Стоимость:</strong> ${formatMoney(asset.cost)} · остаточная ${formatMoney(depreciation.residual)} · амортизация ${depreciationLabel(depreciation.percent)}</p>
        ${serverMode && asset.qrToken ? `<p><a href="${escapeHtml(qrPayload(asset))}">Ссылка на паспорт</a></p>` : ""}
      </div>
    </div>
    <div class="detail-section"><h3>История перемещений</h3><div id="device-movements">${movementRows(movements)}</div></div>
    <div class="detail-section"><h3>Ремонты</h3>
      <div id="device-repairs">${repairs.map((item) => `<p>${escapeHtml(item.status)}: ${escapeHtml(item.issue)} · ${formatMoney(item.cost)} · ${escapeHtml(item.contractor)}</p>`).join("") || "<p>Ремонтов нет.</p>"}</div>
      ${serverMode ? `<form id="repair-form" class="form-grid">
        <label><span>Неисправность</span><input name="issue" required maxlength="500" /></label>
        <label><span>Исполнитель</span><input name="contractor" maxlength="120" /></label>
        <label><span>Стоимость</span><input name="cost" type="number" min="0" step="0.01" /></label>
        <button class="ghost-button" type="submit">Открыть ремонт</button>
      </form><p id="repair-status" role="status"></p>` : ""}
    </div>
    <div class="button-row end"><button class="ghost-button" id="edit-current">Редактировать</button></div>
  `;
  document.querySelector("#edit-current").addEventListener("click", () => {
    els.assetDetails.close();
    openAssetDialog(asset);
  });
  els.assetDetails.showModal();
  if (serverMode) wireHistory(asset.id);
}

function movementRows(items) {
  return items.map((item) => `<p>${escapeHtml(item.date)}: ${escapeHtml(item.from)} → ${escapeHtml(item.to)} · ${escapeHtml(item.reason)}</p>`).join("") || "<p>Перемещений нет.</p>";
}

function wireHistory(id) {
  const moveList = document.querySelector("#device-movements");
  const repairList = document.querySelector("#device-repairs");
  const form = document.querySelector("#repair-form");
  const status = document.querySelector("#repair-status");
  const endpoint = `devices/${id}/repairs`;
  let busy = false;
  moveList.textContent = "Загрузка…";
  repairList.textContent = "Загрузка…";
  inventoryApi.movements(id).then((items) => { moveList.innerHTML = movementRows(items); })
    .catch((error) => { moveList.textContent = error.message; });

  async function loadRepairs() {
    const repairs = await inventoryApi.request(endpoint);
    repairList.innerHTML = repairs.map((repair) => `<div class="result-item"><div>
      <strong>${escapeHtml(repair.issue)}</strong><br>
      <span>${escapeHtml(repair.started_at.slice(0, 10))} · ${repair.finished_at ? "Закрыт " + escapeHtml(repair.finished_at.slice(0, 10)) : "В работе"} · ${escapeHtml(repair.contractor || "Без исполнителя")} · ${formatMoney(repair.cost)}</span>
      </div>${repair.finished_at ? "" : `<button type="button" class="ghost-button" data-close-repair="${repair.id}">Закрыть ремонт</button>`}</div>`).join("") || "<p>Ремонтов нет.</p>";
  }

  async function update(action, message = "") {
    if (busy) return;
    busy = true;
    const submit = form.querySelector("button");
    submit.disabled = true;
    status.textContent = "Загрузка…";
    try {
      if (action) await action();
      await loadRepairs();
      status.textContent = message;
    } catch (error) {
      status.textContent = error.message;
    } finally {
      submit.disabled = false;
      busy = false;
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const values = new FormData(form);
    update(async () => {
      await inventoryApi.request(endpoint, "POST", {
        issue: values.get("issue"), contractor: values.get("contractor"), cost: values.get("cost") || "0",
      });
      form.reset();
    }, "Ремонт открыт.");
  });
  repairList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-close-repair]");
    if (button) update(() => inventoryApi.request(`${endpoint}/${button.dataset.closeRepair}/close`, "PUT"), "Ремонт закрыт.");
  });
  update();
}

async function loadChecks() {
  const list = document.querySelector("#saved-checks");
  const refresh = document.querySelector("#refresh-checks");
  if (refresh.disabled) return;
  refresh.disabled = true;
  try {
    const checks = await inventoryApi.request("inventory-checks");
    list.innerHTML = checks.map((check) => `<details data-check-id="${check.id}">
      <summary>№${check.id} · ${escapeHtml(check.location)} · ${escapeHtml(check.created_at.slice(0, 10))} · ${check.found} из ${check.expected}</summary>
      <div class="inventory-results"></div></details>`).join("") || "<p>Проверок пока нет.</p>";
    list.querySelectorAll("details").forEach((entry) => {
      entry.addEventListener("toggle", async () => {
        if (!entry.open || entry.dataset.loaded) return;
        const body = entry.lastElementChild;
        entry.dataset.loaded = "pending";
        body.textContent = "Загрузка…";
        try {
          const check = await inventoryApi.request(`inventory-checks/${entry.dataset.checkId}`);
          body.innerHTML = inventoryRows(check.rows) || "<p>По этой локации ничего не найдено и ничего не ожидалось.</p>";
          entry.dataset.loaded = "yes";
        } catch (error) {
          body.textContent = error.message;
          delete entry.dataset.loaded;
        }
      });
    });
  } catch (error) {
    list.textContent = error.message;
  } finally {
    refresh.disabled = false;
  }
}

async function finishCheck() {
  const draft = document.querySelector("#inventory-draft");
  const status = document.querySelector("#check-status");
  if (draft.inert || !state.inventory.location) return;
  stopQrScanner?.();
  if (!confirm(`Сохранить результаты проверки «${state.inventory.location}»?`)) return;
  draft.inert = true;
  status.hidden = false;
  status.textContent = "Сохранение…";
  try {
    const check = await inventoryApi.request("inventory-checks", "POST", {
      location: state.inventory.location,
      codes: state.inventory.scans.map((scan) => scan.code),
      unknown: state.inventory.unknown.map((item) => item.name),
    });
    state.inventory.scans = [];
    state.inventory.unknown = [];
    renderInventory();
    status.textContent = `Проверка №${check.id} сохранена: найдено ${check.found} из ${check.expected}, расхождений ${check.rows.filter((row) => row.type !== "ok").length}.`;
    await loadChecks();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    draft.inert = false;
  }
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
  const seen = new Set(state.assets.map((item) => item.inventoryNumber));
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
    if (seen.has(asset.inventoryNumber)) errors.push("дубль номера");
    seen.add(asset.inventoryNumber);
    if (!STATUSES.includes(asset.status)) errors.push("неизвестный статус");
    if (!Number.isFinite(asset.cost) || asset.cost < 0) errors.push("некорректная стоимость");
    if (!Number.isInteger(asset.usefulLifeMonths) || asset.usefulLifeMonths < 1) errors.push("некорректный срок службы");
    return { asset, errors };
  });

  els.importPreview.innerHTML = pendingImportRows
    .map(({ asset, errors }) => `<div class="result-item ${errors.length ? "bad" : "ok"}"><div><strong>${escapeHtml(asset.inventoryNumber || "Без номера")} · ${escapeHtml(asset.name || "Без названия")}</strong><br><span>${errors.length ? escapeHtml(errors.join(", ")) : "готово к импорту"}</span></div></div>`)
    .join("") || `<div class="result-item warn"><span>Нет строк для импорта.</span></div>`;
  els.applyImport.disabled = !pendingImportRows.length || pendingImportRows.some((row) => row.errors.length);
}

async function applyImport() {
  if (!pendingImportRows.length || pendingImportRows.some((row) => row.errors.length)) return;
  if (serverMode) {
    if (serverBusy || !serverLoaded) return;
    setServerBusy(true);
    let added = 0;
    let failure = "";
    try {
      const write = await inventoryApi.writer();
      for (const { asset } of pendingImportRows) {
        try {
          state.assets.push(await write(asset));
          added++;
        } catch (error) {
          throw new Error(`${asset.inventoryNumber}: ${error.message}`);
        }
      }
    } catch (error) {
      failure = error.message;
    } finally {
      pendingImportRows = [];
      if (!failure) els.csvInput.value = "";
      els.importPreview.textContent = failure ? `Добавлено: ${added}. Импорт остановлен. ${failure}` :
        `Импорт выполнен. Добавлено: ${added}.`;
      renderAll();
      setServerBusy(false);
    }
    return;
  }
  state.assets.push(...pendingImportRows.map((row) => row.asset));
  pendingImportRows = [];
  els.csvInput.value = "";
  els.applyImport.disabled = true;
  els.importPreview.innerHTML = `<div class="result-item ok"><span>Импорт выполнен.</span></div>`;
  saveState();
  renderAll();
}

function exportCsv(rows, filename) {
  const csv = rows.map((row) => row.map((cell) => {
    const text = typeof cell === "string" && /^\s*[=+@-]/.test(cell) ? "'" + cell : String(cell);
    return `"${text.replaceAll('"', '""')}"`;
  }).join(",")).join("\n");
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
  els.assetDialog.querySelectorAll("[data-close-asset]").forEach((button) =>
    button.addEventListener("click", () => els.assetDialog.close()));
  els.assetDialog.addEventListener("cancel", (event) => {
    if (serverBusy) event.preventDefault();
  });
  document.querySelector("#refresh-registry").addEventListener("click", refreshRegistry);
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
    stopQrScanner();
    scanFeedback("");
    state.inventory.location = els.inventoryLocation.value;
    state.inventory.scans = [];
    state.inventory.unknown = [];
    renderInventory();
  });
  stopQrScanner = wireQrScanner(addScan, scanFeedback);
  document.querySelector("#scan-button").addEventListener("click", () => addScan(els.scanInput.value));
  els.scanInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") addScan(els.scanInput.value);
  });
  els.quickScan.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-code]");
    if (button) addScan(button.dataset.code);
  });
  document.querySelector("#add-unknown").addEventListener("click", () => {
    const input = document.querySelector("#unknown-name");
    const name = serverMode ? input.value.trim() : "Неизвестный переходник";
    if (!name) {
      input.focus();
      return;
    }
    state.inventory.unknown.push({ name, createdAt: new Date().toISOString() });
    input.value = "";
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
    const rows = state.assets.filter((asset) => writeoffReason(asset, depreciationRules)).map((asset) => {
      const result = calculateDepreciation(asset, depreciationRules);
      return [asset.inventoryNumber, asset.name, depreciationLabel(result.percent), result.residual, asset.status, writeoffReason(asset, depreciationRules)];
    });
    exportCsv([["Инвентарный номер", "Название", "Амортизация", "Остаточная стоимость", "Статус", "Причина"], ...rows], "writeoff-report.csv");
  });
}

wireEvents();
renderAll();
if (serverMode) {
  document.querySelector("#reset-demo").hidden = true;
  document.querySelector("#refresh-registry").hidden = false;
  document.querySelector("#server-status").hidden = false;
  document.querySelector("#unknown-name-field").hidden = false;
  document.querySelector("#finish-check-controls").hidden = false;
  document.querySelector("#saved-checks-panel").hidden = false;
  document.querySelector("#excel-panel").hidden = false;
  document.querySelector("#depreciation-panel").hidden = false;
  wireExcelImport(refreshRegistry);
  paintDepreciation = wireDepreciation(() => depreciationRules, (saved) => {
    depreciationRules = saved;
    renderDashboard();
    renderReports();
  });
  document.querySelector("#finish-check").addEventListener("click", finishCheck);
  document.querySelector("#refresh-checks").addEventListener("click", loadChecks);
  refreshRegistry().then(() => {
    if (!serverLoaded) return;
    const params = new URLSearchParams(location.search);
    if (!params.has("device")) return;
    switchView("registry");
    const token = inventoryQrToken(params.get("device"));
    const asset = token && state.assets.find((item) => item.qrToken === token);
    if (asset) openDetails(asset);
    else document.querySelector("#server-status").textContent = "Устройство по этой QR-метке не найдено.";
  });
}
