// === app.js ===

const loginModalOverlay = document.getElementById('login-modal-overlay');
const loginModal = document.getElementById('login-modal');
const loginInput = document.getElementById('login-input');
const passInput = document.getElementById('pass-input');
const loginBtn = document.getElementById('login-btn');
const loginLoader = document.getElementById('login-loader');
let currentUser = '';

const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzaWsTv8M-bDD3FBHk0JBp3_ffmuAKR21HpbC7gfh-x7MjtdcSmvLEMH4cSID_Eel17/exec';

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


let selectedBlocks = [];
document.querySelectorAll('.block-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    // Сбросить активность всех кнопок
    document.querySelectorAll('.block-btn').forEach(b => b.classList.remove('active'));
    selectedBlocks = [btn.dataset.block];
    btn.classList.add('active');
    console.log('Выбран блок:', selectedBlocks[0]);
  });
});


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

function showCameraLoader() { cameraLoader.classList.remove('hidden'); }
function hideCameraLoader() { cameraLoader.classList.add('hidden'); }

function startScanner() {
  showCameraLoader();
  html5QrCode.start({ facingMode: "environment" }, config, qrSuccess)
    .then(hideCameraLoader)
    .catch(() => {
      hideCameraLoader();
      showToast('Не удалось запустить камеру');
    });
}

function qrSuccess(decodedText) {
  html5QrCode.stop();
  showCameraLoader();
  handleScan(decodedText.trim());
}

let scannedEmployeeId = '';
let employeeName = '';

function handleScan(id) {
  scannedEmployeeId = id;
  const now = new Date();
  const rawDate = now.toLocaleDateString('ru-RU');
  const date = encodeURIComponent(rawDate);

  fetch(`${GOOGLE_SCRIPT_URL}?employeeId=${id}&date=${date}`)
    .then(r => r.json())
    .then(data => {
      hideCameraLoader();

      // ✅ Проверка ТОЛЬКО на отсутствие имени
      if (!data.name || data.name.trim() === '') {
        openFioModal();
        return;
      }

      employeeName = data.name.trim();

      if (data.scans === 0) {
        logAction('Вход', rawDate);
      } else if (data.scans === 1) {
        const lastTime = data.lastTime;
        if (!lastTime || !lastTime.includes(' ')) {
          showToast('Ошибка: неверный формат времени входа');
          setTimeout(startScanner, 20);
          return;
        }

        const cleanedTime = lastTime.replace(/\s+/g, ' ').trim();
        const [datePart, timePart] = cleanedTime.split(' ');
        const [day, month, year] = datePart.split('.').map(Number);
        const [hour, minute, second = 0] = timePart.split(':').map(Number);
        const entryDate = new Date(year, month - 1, day, hour, minute, second);

        if (isNaN(entryDate.getTime())) {
          showToast('Ошибка: некорректное время входа');
          setTimeout(startScanner, 20);
          return;
        }

        const nowDateStr = now.toLocaleDateString('ru-RU');
        const entryDateStr = `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;
        const isSameDay = nowDateStr === entryDateStr;

        if (!isSameDay) {
          showToast('Выход невозможен: вход был выполнен в другой день');
          setTimeout(startScanner, 20);
          return;
        }

        const diffMs = now.getTime() - entryDate.getTime();
        const diffMinutes = Math.floor(diffMs / 60000);

        if (diffMinutes < 30) {
          showToast(`Выход возможен только через 30 минут после входа. Осталось: ${30 - diffMinutes} мин.`);
          setTimeout(startScanner, 20);
          return;
        }

        logAction('Выход', rawDate);
      } else {
        showModalMessage('Этот сотрудник уже совершил вход/выход');
      }
    })
    .catch(() => {
      hideCameraLoader();
      showToast('Ошибка соединения с сервером');
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

function logAction(action, date) {
  if (selectedBlocks.length === 0) {
    showToast('Пожалуйста, выберите хотя бы один блок');
    return;
  }

  const blockString = selectedBlocks.join(', ');
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
      block: blockString
    })
  })
    .then(() => {
      updateUI(action, date, time, blockString);
      setTimeout(startScanner, 20);
    })
    .catch(() => showToast('Ошибка соединения с сервером'));
}

function updateUI(action, date, time, blockString) {
  document.getElementById('result').classList.remove('hidden');
  status.textContent = `${employeeName} — ${action}`;
  timeRecord.innerHTML = `<strong>Дата:</strong> ${date}<br>
                          <strong>Время:</strong> ${time}<br>
                          <strong>Тип:</strong> ${action}<br>
                          <strong>Отсканировал:</strong> ${currentUser}<br>
                          <strong>Блок:</strong> ${blockString}<br>`;
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
  fioModal.querySelector('.modal-content').classList.replace('hide', 'show');
}

function closeFioModal() {
  const c = fioModal.querySelector('.modal-content');
  c.classList.replace('show', 'hide');
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
    setTimeout(startScanner, 20);
  };
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
