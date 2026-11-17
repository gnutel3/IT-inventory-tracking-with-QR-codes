function inventoryQrToken(value) {
  return /^[a-f0-9]{32}$/.test(value || "") ? value : null;
}

function normalizeInventoryQr(value) {
  const code = value.trim();
  try {
    const url = new URL(code);
    if (["http:", "https:"].includes(url.protocol) && url.pathname === "/app/" &&
        url.searchParams.get("mode") === "server") {
      const token = inventoryQrToken(url.searchParams.get("device"));
      if (token) return `qr:${token}`;
    }
  } catch {
    // Inventory numbers and legacy QR payloads are not URLs.
  }
  return code;
}

function wireQrScanner(onScan, feedback) {
  const camera = document.querySelector("#start-camera");
  const video = document.querySelector("#qr-video");
  const canvas = document.createElement("canvas");
  let ctx;
  let active = null;
  let photoJob = 0;

  function stop() {
    photoJob++;
    if (active) {
      clearTimeout(active.timer);
      active.stream?.getTracks().forEach((track) => track.stop());
      active = null;
    }
    video.srcObject = null;
    video.hidden = true;
    camera.textContent = "Камера";
  }

  function decode(source, width, height) {
    ctx ??= canvas.getContext("2d", { willReadFrequently: true });
    const scale = Math.min(1, 1280 / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return window.jsQR(pixels.data, pixels.width, pixels.height)?.data;
  }

  async function start() {
    if (active) {
      stop();
      feedback("Камера выключена.");
      return;
    }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      feedback("Для прямой камеры нужен HTTPS или localhost. Можно снять или загрузить фото.");
      return;
    }
    const session = {};
    active = session;
    photoJob++;
    camera.textContent = "Выключить камеру";
    feedback("Запрашиваем доступ к камере…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      if (active !== session) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      session.stream = stream;
      video.srcObject = stream;
      video.hidden = false;
      await video.play();
      if (active !== session) return;
      feedback("Наведите камеру на QR-метку.");
      const tick = () => {
        if (active !== session) return;
        try {
          if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
            const code = decode(video, video.videoWidth, video.videoHeight);
            if (code) {
              stop();
              onScan(code);
              return;
            }
          }
          session.timer = setTimeout(tick, 180);
        } catch {
          stop();
          feedback("Не удалось прочитать видео. Попробуйте фото.");
        }
      };
      tick();
    } catch {
      if (active !== session) return;
      stop();
      feedback("Камера недоступна. Проверьте разрешение или загрузите фото.");
    }
  }

  function wirePhoto(buttonId, inputId) {
    const input = document.getElementById(inputId);
    document.getElementById(buttonId).addEventListener("click", () => {
      stop();
      feedback("");
      input.click();
    });
    input.addEventListener("change", async () => {
      const file = input.files[0];
      input.value = "";
      if (!file) return;
      const job = ++photoJob;
      const url = URL.createObjectURL(file);
      feedback("Ищем QR на фото…");
      try {
        const photo = new Image();
        photo.src = url;
        await photo.decode();
        if (job !== photoJob) return;
        const code = decode(photo, photo.naturalWidth, photo.naturalHeight);
        if (code) onScan(code);
        else feedback("QR не найден. Попробуйте фото крупнее или введите номер.");
      } catch {
        if (job === photoJob) feedback("Не удалось открыть фото. Попробуйте JPG или PNG.");
      } finally {
        URL.revokeObjectURL(url);
      }
    });
  }

  camera.addEventListener("click", start);
  wirePhoto("capture-qr", "qr-capture-input");
  wirePhoto("upload-qr", "qr-upload-input");
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && active) {
      stop();
      feedback("Камера выключена.");
    }
  });
  window.addEventListener("pagehide", stop);
  return stop;
}
