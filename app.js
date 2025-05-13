// === app.js (рефакторинг) ===

// --- Константы и переменные ---
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw8lwqgrDlhKTx6Sz0uYq39duz7oBjRY_i_gHtAzNFPwJpTuBG3pA_8_oaaQZtbdcq2kA/exec';

const loginModalOverlay = document.getElementById('login-modal-overlay');
const loginModal = document.getElementById('login-modal');
const loginInput = document.getElementById('login-input');
const passInput = document.getElementById('pass-input');
const loginBtn = document.getElementById('login-btn');
const loginLoader = document.getElementById('login-loader');

const html5QrCode = new Html5Qrcode("scanner");
const config = { fps: 6, qrbox: { width: 250, height: 250 } };
const status = document.getElementById('status');
const timeRecord = document.getElementById('time-record');
const modalOverlay = document.getElementById('modal-overlay');
const fioModal = document.getElementById('fio-modal');
const fioInput = document.getElementById('fio-input');
const submitFioBtn = document.getElementById('submit-fio');
const historyBody = document.getElementById('history-body');
const cameraLoader = document.getElementById('camera-loader');
const scannerPauseOverlay = document.getElementById('scanner-pause-overlay');

let currentUser = '';
let employeeName = '';
let scannedEmployeeId = '';
let scannerStarted = false;
let selectedBlocks = [];

// --- Авторизация ---
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
    .catch(err => {
      console.error('[LOGIN] Ошибка:', err);
      alert('Ошибка авторизации');
    })
    .finally(() => loginLoader.classList.add('hidden'));
});

// --- Выбор блока ---
document.querySelectorAll('.block-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.block-btn').forEach(b => b.classList.remove('active'));
    selectedBlocks = [btn.dataset.block];
    btn.classList.add('active');
  });
});

// --- Работа сканера ---
function showCameraLoader() { cameraLoader.classList.remove('hidden'); }
function hideCameraLoader() { cameraLoader.classList.add('hidden'); }

function startScanner() {
  showCameraLoader();
  html5QrCode.start({ facingMode: "environment" }, config, qrSuccess)
    .then(() => {
      hideCameraLoader();
      const st = document.querySelector('#scanner > .html5-qrcode-status');
      if (st) st.remove();
    })
    .catch(err => {
      console.error('[SCANNER START] Ошибка:', err);
      hideCameraLoader();
      showToast('Не удалось запустить камеру');
    });
}

function qrSuccess(decodedText) {
  handleScan(decodedText.trim());
}

function handleScan(id) {
  scannedEmployeeId = id;
  html5QrCode.pause();
  const st = document.querySelector('#scanner > .html5-qrcode-status');
  if (st) st.remove();
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

// --- Работа с ФИО ---
submitFioBtn.addEventListener('click', () => {
  try {
    const fio = fioInput.value.trim();
    if (!fio) return alert('Введите ФИО!');
    employeeName = fio;
    fioInput.value = '';
    closeFioModal();
    logAction('Вход', new Date().toLocaleDateString('ru-RU'));
  } catch (err) {
    console.error('[FIO SUBMIT] Ошибка:', err);
    showToast('Ошибка при сохранении ФИО');
  }
});

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

// --- Обновление интерфейса ---
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

// --- Модальные уведомления ---
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

function resumeScanner() {
  scannerPauseOverlay.classList.remove('visible');
  html5QrCode.resume();
}
