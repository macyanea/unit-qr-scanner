document.addEventListener("DOMContentLoaded", () => {
  const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/ВАШ_ID/exec';

  const loginModalOverlay = document.getElementById('login-modal-overlay');
  const loginModal = document.getElementById('login-modal');
  const loginInput = document.getElementById('login-input');
  const passInput = document.getElementById('pass-input');
  const loginBtn = document.getElementById('login-btn');
  const loginLoader = document.getElementById('login-loader');
  const video = document.getElementById("camera");
  const canvas = document.getElementById("qr-canvas");
  const ctx = canvas.getContext("2d");
  const scannerPauseOverlay = document.getElementById('scanner-pause-overlay');
  const cameraLoader = document.getElementById('camera-loader');
  const status = document.getElementById('status');
  const timeRecord = document.getElementById('time-record');
  const historyBody = document.getElementById('history-body');
  const modalOverlay = document.getElementById('modal-overlay');
  const fioModal = document.getElementById('fio-modal');
  const fioInput = document.getElementById('fio-input');
  const submitFioBtn = document.getElementById('submit-fio');
  let scanInterval = null;
  let currentUser = '';
  let scannedEmployeeId = '';
  let employeeName = '';
  let selectedBlocks = [];

  loginBtn.addEventListener('click', () => {
    const login = loginInput.value.trim();
    const pass = passInput.value.trim();
    if (!login || !pass) return alert('Введите логин и пароль');
    loginLoader.classList.remove('hidden');

    fetch(`${GOOGLE_SCRIPT_URL}?login=${encodeURIComponent(login)}&password=${encodeURIComponent(pass)}`)
      .then(r => r.json())
      .then(data => {
        if (data.auth) {
          currentUser = login;
          loginModalOverlay.classList.add('hidden');
          loginModal.classList.add('hidden');
          startScanner();
        } else {
          alert('Неверный логин или пароль');
        }
      })
      .catch(() => alert('Ошибка авторизации'))
      .finally(() => loginLoader.classList.add('hidden'));
  });

  function showCameraLoader() { cameraLoader.classList.remove('hidden'); }
  function hideCameraLoader() { cameraLoader.classList.add('hidden'); }

  function startScanner() {
    showCameraLoader();

    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      .then(stream => {
        video.srcObject = stream;
        video.onloadedmetadata = () => {
          video.play();
        alert("✅ Камера запущена");
        console.log("[DEBUG] Камера запущена");
          hideCameraLoader();
          startQRLoop();
        };
      })
      .catch(err => {
        console.error("[CAMERA] Ошибка доступа:", err);
        showToast("Не удалось запустить камеру");
        hideCameraLoader();
      });
  }

  function startQRLoop() {
    scanInterval = setInterval(() => {
      if (video.readyState !== video.HAVE_ENOUGH_DATA) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, canvas.width, canvas.height);

      if (code) {
        clearInterval(scanInterval);
        pauseScanner();
        handleScan(code.data.trim());
      }
    }, 500);
  }

  function pauseScanner() {
    const stream = video.srcObject;
    if (stream) stream.getTracks().forEach(track => track.stop());
  }

  function resumeScanner() {
    scannerPauseOverlay.classList.remove('visible');
    startScanner();
  }

  document.querySelectorAll('.block-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.block-btn').forEach(b => b.classList.remove('active'));
      selectedBlocks = [btn.dataset.block];
      btn.classList.add('active');
    });
  });

  function handleScan(id) {
    scannedEmployeeId = id;
    scannerPauseOverlay.classList.add('visible');

    const now = new Date();
    const rawDate = now.toLocaleDateString('ru-RU');
    const date = encodeURIComponent(rawDate);

    fetch(`${GOOGLE_SCRIPT_URL}?employeeId=${id}&date=${date}`)
      .then(r => r.json())
      .then(data => {
        if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
          hideCameraLoader();
          openFioModal();
          return;
        }

        employeeName = data.name.trim();
        hideCameraLoader();

        if (data.scans === 0) {
          logAction('Вход', rawDate);
        } else if (data.scans === 1) {
          const [datePart, timePart] = data.lastTime.split(' ');
          const [d, m, y] = datePart.split('.').map(Number);
          const [h, min, s = 0] = timePart.split(':').map(Number);
          const entryDate = new Date(y, m - 1, d, h, min, s);

          if (isNaN(entryDate.getTime())) {
            showToast('Ошибка: некорректное время входа');
            return setTimeout(resumeScanner, 1500);
          }

          if (now.toLocaleDateString('ru-RU') !== datePart) {
            showToast('Выход невозможен: вход был в другой день');
            return setTimeout(resumeScanner, 1500);
          }

          const diff = (now - entryDate) / 60000;
          if (diff < 30) {
            showToast(`Выход возможен через ${Math.ceil(30 - diff)} мин.`);
            return setTimeout(resumeScanner, 1500);
          }

          logAction('Выход', rawDate);
        } else {
          hideCameraLoader();
          showModalMessage('Этот сотрудник уже совершил вход/выход');
        }
      })
      .catch(err => {
        console.error('[SCAN] Ошибка:', err);
        hideCameraLoader();
        showToast('Ошибка соединения с сервером');
        resumeScanner();
      });
  }

  function logAction(action, date) {
    if (selectedBlocks.length === 0) {
      showToast('Выберите блок');
      resumeScanner();
      return;
    }

    const blockString = selectedBlocks[0];
    const time = new Date().toLocaleTimeString('ru-RU');

    fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      body: new URLSearchParams({
        employeeId: scannedEmployeeId,
        fullName: employeeName,
        date, time, action, who: currentUser, block: blockString
      })
    })
      .then(() => {
        updateUI(action, date, time, blockString);
        resumeScanner();
      })
      .catch(err => {
        console.error('[POST] Ошибка:', err);
        showToast('Ошибка при записи');
        resumeScanner();
      });
  }

  submitFioBtn.addEventListener('click', () => {
    const fio = fioInput.value.trim();
    if (!fio) return alert('Введите ФИО!');
    employeeName = fio;
    fioInput.value = '';
    closeFioModal();
    logAction('Вход', new Date().toLocaleDateString('ru-RU'));
  });

  function updateUI(action, date, time, blockString) {
    document.getElementById('result').classList.remove('hidden');
    const resultCard = document.querySelector('.result-section');
    resultCard.classList.remove('highlight');
    void resultCard.offsetWidth;
    resultCard.classList.add('highlight');

    status.textContent = `${employeeName} — ${action}`;
    timeRecord.innerHTML = `<strong>Дата:</strong> ${date}<br>
                            <strong>Время:</strong> ${time}<br>
                            <strong>Тип:</strong> ${action}<br>
                            <strong>Блок:</strong> ${blockString}`;

    const row = document.createElement('tr');
    row.innerHTML = `<td>${employeeName}</td>
                     <td>${date}</td>
                     <td>${time}</td>
                     <td>${action}</td>
                     <td>${currentUser}</td>
                     <td>${blockString}</td>`;
    historyBody.prepend(row);
    if (historyBody.rows.length > 5) historyBody.deleteRow(-1);
  }

  function openFioModal() {
    modalOverlay.classList.remove('hidden');
    fioModal.classList.remove('hidden');
    fioModal.querySelector('.modal-content').classList.replace('hide','show');
  }

  function closeFioModal() {
    const c = fioModal.querySelector('.modal-content');
    c.classList.replace('show','hide');
    setTimeout(() => {
      modalOverlay.classList.add('hidden');
      fioModal.classList.add('hidden');
    }, 300);
  }

  function showModalMessage(msg) {
    openFioModal();
    const c = fioModal.querySelector('.modal-content');
    c.innerHTML = `<h2>${msg}</h2><button id="modal-ok">ОК</button>`;
    document.getElementById('modal-ok').onclick = () => {
      closeFioModal();
      resumeScanner();
    };
  }

  function showToast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.getElementById('toast-container').appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }
});