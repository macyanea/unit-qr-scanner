
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/ВАШ_ID/exec';

const canvas = document.getElementById('camera-canvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let currentUser = '';
let scannedEmployeeId = '';
let employeeName = '';
let selectedBlocks = [];
let scanInterval = null;

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function startQRScan(video) {
  if (scanInterval) clearInterval(scanInterval);
  scanInterval = setInterval(() => {
    try {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, canvas.width, canvas.height);
      if (code) {
        clearInterval(scanInterval);
        handleScan(code.data.trim());
      }
    } catch (e) {
      console.error("QR error:", e);
    }
  }, 500);

  function drawLoop() {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    requestAnimationFrame(drawLoop);
  }
  drawLoop();
}

function startScanner() {
  navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
    .then(stream => {
      const video = document.createElement("video");
      video.srcObject = stream;
      video.setAttribute("playsinline", true);
      video.muted = true;
      video.autoplay = true;

      video.onloadedmetadata = () => {
        video.play();
        showToast("✅ Камера активна");
        startQRScan(video);
      };
    })
    .catch(err => {
      console.error("Камера не запущена:", err);
      showToast("❌ Камера не доступна");
    });
}

function handleScan(id) {
  scannedEmployeeId = id;
  const now = new Date();
  const rawDate = now.toLocaleDateString('ru-RU');
  const date = encodeURIComponent(rawDate);

  fetch(`${GOOGLE_SCRIPT_URL}?employeeId=${id}&date=${date}`)
    .then(r => r.json())
    .then(data => {
      if (!data.name || typeof data.name !== 'string') {
        employeeName = prompt("Введите ФИО:");
        if (!employeeName) return resumeScanner();
        logAction('Вход', rawDate);
        return;
      }

      employeeName = data.name.trim();

      if (data.scans === 0) {
        logAction('Вход', rawDate);
      } else if (data.scans === 1) {
        const [datePart, timePart] = data.lastTime.split(' ');
        const [d, m, y] = datePart.split('.').map(Number);
        const [h, min, s = 0] = timePart.split(':').map(Number);
        const entryDate = new Date(y, m - 1, d, h, min, s);
        if (isNaN(entryDate.getTime())) {
          showToast("⛔ Ошибка входа");
          return resumeScanner();
        }

        if (now.toLocaleDateString('ru-RU') !== datePart) {
          showToast("⚠️ Вход был в другой день");
          return resumeScanner();
        }

        const diff = (now - entryDate) / 60000;
        if (diff < 30) {
          showToast("⏳ Выход через " + Math.ceil(30 - diff) + " мин");
          return resumeScanner();
        }

        logAction('Выход', rawDate);
      } else {
        showToast("🔁 Уже вход/выход");
        resumeScanner();
      }
    })
    .catch(() => {
      showToast("Ошибка связи с сервером");
      resumeScanner();
    });
}

function logAction(action, date) {
  const block = selectedBlocks[0] || 'не выбран';
  const time = new Date().toLocaleTimeString('ru-RU');

  fetch(GOOGLE_SCRIPT_URL, {
    method: 'POST',
    body: new URLSearchParams({
      employeeId: scannedEmployeeId,
      fullName: employeeName,
      date: date,
      time: time,
      action: action,
      who: currentUser,
      block: block
    })
  })
    .then(() => {
      showToast(employeeName + " — " + action + " в блок " + block);
      resumeScanner();
    })
    .catch(() => {
      showToast("Ошибка при записи");
      resumeScanner();
    });
}

function resumeScanner() {
  startScanner();
}

window.addEventListener("load", () => {
  currentUser = "admin"; // временно, до ввода авторизации
  selectedBlocks = ["3"]; // временно
  startScanner();
});
