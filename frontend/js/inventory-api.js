const inventoryApi = (() => {
  const statuses = {
    "В эксплуатации": "IN_USE",
    "На складе": "IN_STORAGE",
    "В ремонте": "IN_REPAIR",
    "Списано": "WRITTEN_OFF",
    "Потеряно": "LOST",
  };

  async function request(path, method = "GET", data) {
    let response;
    try {
      response = await fetch(`/api/v1/${path}`, {
        method,
        cache: "no-store",
        ...(data && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
      });
    } catch {
      throw new Error("Нет связи с сервером. Проверьте подключение и обновите реестр.");
    }
    const body = await response.json().catch(() => null);
    if (!response.ok || !body) {
      const detail = body?.detail;
      const message = Array.isArray(detail) ? detail.map((item) => item.loc.at(-1)).join(", ") : null;
      const error = new Error(message ? `Проверьте поля: ${message}` :
        typeof detail === "string" ? detail : `Ошибка сервера (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return body;
  }

  const catalog = async (kind) => new Map((await request(kind)).map((item) => [item.name, item.id]));

  async function catalogId(kind, name, entries) {
    if (!entries.has(name)) {
      try {
        entries.set(name, (await request(kind, "POST", { name })).id);
      } catch (error) {
        if (error.status !== 409) throw error;
        const id = (await catalog(kind)).get(name);
        if (id == null) throw error;
        entries.set(name, id);
      }
    }
    return entries.get(name);
  }

  async function list() {
    const [categories, locations] = await Promise.all([request("categories"), request("locations")]);
    const categoryNames = new Map(categories.map(({ id, name }) => [id, name]));
    const locationNames = new Map(locations.map(({ id, name }) => [id, name]));
    const records = [];
    const limit = 500;
    for (let offset = 0; ; offset += limit) {
      const page = await request(`devices?limit=${limit}&offset=${offset}`);
      records.push(...page);
      if (page.length < limit) break;
    }
    return records.map((row) => fromRecord(row, categoryNames.get(row.category_id), locationNames.get(row.location_id)));
  }

  function fromRecord(row, category, location) {
    return {
      id: row.id, qrToken: row.qr_token, inventoryNumber: row.inventory_number, name: row.name,
      category: category || "", location: location || "", serial: row.serial_number || "",
      owner: row.owner || "", cost: Number(row.purchase_price || 0), purchaseDate: row.purchase_date || "",
      usefulLifeMonths: row.useful_life_months, notes: row.description || "",
      status: Object.keys(statuses).find((key) => statuses[key] === row.status) || row.status,
    };
  }

  async function writer() {
    const [categories, locations] = await Promise.all([catalog("categories"), catalog("locations")]);
    return async (asset, id = null) => {
      const categoryId = await catalogId("categories", asset.category, categories);
      const locationId = await catalogId("locations", asset.location, locations);
      const row = await request(id == null ? "devices" : `devices/${id}`, id == null ? "POST" : "PUT", {
        inventory_number: asset.inventoryNumber, name: asset.name, serial_number: asset.serial || null,
        owner: asset.owner || null, status: statuses[asset.status], description: asset.notes || null,
        purchase_price: asset.cost, purchase_date: asset.purchaseDate || null,
        useful_life_months: asset.usefulLifeMonths, category_id: categoryId, location_id: locationId,
      });
      return fromRecord(row, asset.category, asset.location);
    };
  }

  return {
    list, writer, request,
    async movements(deviceId) {
      const rows = await request(deviceId ? `movements?device_id=${deviceId}` : "movements");
      return rows.map((row) => ({
        assetId: row.device_id, from: row.from_location || "Без локации",
        to: row.to_location || "Без локации", date: row.moved_at.slice(0, 10),
        reason: "Смена локации", user: "",
      }));
    },
  };
})();
