// --- Авторизация ---
const loginModalOverlay = document.getElementById('login-modal-overlay');
const loginModal        = document.getElementById('login-modal');
const loginInput        = document.getElementById('login-input');
const passInput         = document.getElementById('pass-input');
const loginBtn          = document.getElementById('login-btn');
const loginLoader       = document.getElementById('login-loader');
let currentUser         = '';

const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzHz209DXQjuseUn2ShOroxRfYYRgi1rBmWT6CocL8aED7ic4G68-H9PC_ZZjHyTLOt/exec';

loginBtn.addEventListener('click', () => {
  const login = loginInput.value.trim();
  const pass  = passInput.value.trim();
  if (!login || !pass) return alert('Введите логин и пароль');

  // Показать лоадер под кнопкой
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
    .finally(() => {
      // Скрыть лоадер
      loginLoader.classList.add('hidden');
    });
});

// --- QR-сканер ---
const html5QrCode  = new Html5Qrcode("scanner");
const config       = { fps: 6, qrbox: { width: 250, height: 250 } };
const status       = document.getElementById('status');
const timeRecord   = document.getElementById('time-record');
const modalOverlay = document.getElementById('modal-overlay');
const fioModal     = document.getElementById('fio-modal');
const fioInput     = document.getElementById('fio-input');
const submitFioBtn = document.getElementById('submit-fio');
const historyBody  = document.getElementById('history-body');
const cameraLoader = document.getElementById('camera-loader');

function showCameraLoader() { cameraLoader.classList.remove('hidden'); }
function hideCameraLoader() { cameraLoader.classList.add('hidden'); }

function startScanner() {
  showCameraLoader();
  html5QrCode.start({ facingMode: "environment" }, config, qrSuccess)
    .then(hideCameraLoader)
    .catch(() => { hideCameraLoader(); showToast('Не удалось запустить камеру'); });
}

function qrSuccess(decodedText) {
  html5QrCode.stop();
  showCameraLoader();
  handleScan(decodedText.trim());
}

let scannedEmployeeId = '';
let employeeName      = '';

function handleScan(id) {
  scannedEmployeeId = id;
  const now     = new Date();
  const rawDate = now.toLocaleDateString('ru-RU');
  const date    = encodeURIComponent(rawDate);

  fetch(`${GOOGLE_SCRIPT_URL}?employeeId=${id}&date=${date}`)
    .then(r => r.json())
    .then(data => {
      hideCameraLoader();
      if (!data.exists) {
        openFioModal();
      } else {
        employeeName = data.name;
        if (data.scans === 0)      logAction('Вход', rawDate);
        else if (data.scans === 1) logAction('Выход', rawDate);
        else                       showModalMessage('Этот сотрудник уже совершил вход/выход');
      }
    })
    .catch(() => { hideCameraLoader(); showToast('Ошибка соединения с сервером'); });
}

submitFioBtn.addEventListener('click', () => {
  const fio = fioInput.value.trim();
  if (!fio) return alert('Введите ФИО!');
  employeeName = fio;
  fioInput.value = '';
  closeFioModal();
  logAction('Вход', new Date().toLocaleDateString('ru-RU'));
});

function logAction(action, date) {
  const time = new Date().toLocaleTimeString('ru-RU');
  fetch(GOOGLE_SCRIPT_URL, {
    method: 'POST',
    body: new URLSearchParams({
      employeeId: scannedEmployeeId,
      fullName:    employeeName,
      date:        date,
      time:        time,
      action:      action,
      who:         currentUser
    })
  })
  .then(() => {
    updateUI(action, date, time);
    setTimeout(startScanner, 1);
  })
  .catch(() => showToast('Ошибка соединения с сервером'));
}

// --- UI-функции ---
function updateUI(action, date, time) {
  document.getElementById('result').classList.remove('hidden');
  status.textContent = `${employeeName} — ${action}`;
  timeRecord.innerHTML = `<strong>Дата:</strong> ${date}<br>
                          <strong>Время:</strong> ${time}<br>
                          <strong>Тип:</strong> ${action}<br>
                          <strong>Отсканировал:</strong> ${currentUser}`;
  const row = document.createElement('tr');
  row.innerHTML = `<td>${employeeName}</td>
                   <td>${date}</td>
                   <td>${time}</td>
                   <td>${action}</td>
                   <td>${currentUser}</td>`;
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
    setTimeout(startScanner, 500);
  };
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
