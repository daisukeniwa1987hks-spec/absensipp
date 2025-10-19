import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Atur level log agar lebih mudah melakukan debug
setLogLevel('Debug');

// Gunakan variabel global yang disediakan (jika ada, sesuaikan jika tidak perlu)
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

let app, db, auth;
let userId = null;
let studentsData = {};
let attendanceData = {};
let currentClass = '8A';
const allClasses = ['8A', '8B', '8C', '8D', '8E', '8F', '8G', '8H', '8I', '8J', '8K'];

// --- Elemen DOM ---
const homeView = document.getElementById('home-view');
const attendanceView = document.getElementById('attendance-view');
const overallRecapView = document.getElementById('overall-recap-view');
const recapView = document.getElementById('recap-view');
const studentListContainer = document.getElementById('student-list');
const currentClassTitle = document.getElementById('current-class-title');
const attendanceDateInput = document.getElementById('attendance-date');
const saveBtn = document.getElementById('save-btn');
const recapBtn = document.getElementById('recap-btn');
const manageStudentsBtn = document.getElementById('manage-students-btn');
const backToHomeFromAttendanceBtn = document.getElementById('back-to-home-from-attendance');
const backToHomeFromOverallBtn = document.getElementById('back-to-home-from-overall');
const backToOverallRecapBtn = document.getElementById('back-to-overall-recap');
const downloadRecapBtn = document.getElementById('download-recap-btn');
const downloadOverallRecapBtn = document.getElementById('download-overall-recap-btn');
const messageModal = document.getElementById('message-modal');
const modalText = document.getElementById('modal-text');
const modalSpinner = document.getElementById('modal-spinner');
const modalCloseBtn = document.getElementById('modal-close');
const studentManagementModal = document.getElementById('student-management-modal');
const manageClassTitle = document.getElementById('manage-class-title');
const newStudentNameInput = document.getElementById('new-student-name');
const addStudentBtn = document.getElementById('add-student-btn');
const uploadCsvModalBtn = document.getElementById('upload-csv-modal-btn');
const csvFileInput = document.getElementById('csv-file-input');
const manageStudentList = document.getElementById('manage-student-list');
const closeManageModalBtn = document.getElementById('close-manage-modal');
const confirmInputModal = document.getElementById('confirm-input-modal');
const confirmInputTitle = document.getElementById('confirm-input-title');
const confirmInputMessage = document.getElementById('confirm-input-message');
const confirmInputField = document.getElementById('confirm-input-field');
const confirmOkBtn = document.getElementById('confirm-ok-btn');
const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
const userIdSpan = document.getElementById('user-id');

// --- Fungsi Helper UI ---
const showModal = (message, isLoading = false) => {
    modalText.textContent = message;
    modalSpinner.style.display = isLoading ? 'block' : 'none';
    modalCloseBtn.style.display = isLoading ? 'none' : 'block';
    messageModal.style.display = 'flex';
};

const hideModal = () => {
    messageModal.style.display = 'none';
};

const showManagementModal = () => {
    manageClassTitle.textContent = currentClass;
    renderManagementList();
    studentManagementModal.style.display = 'flex';
};

const hideManagementModal = () => {
    studentManagementModal.style.display = 'none';
};

const showConfirmModal = (title, message) => {
    return new Promise(resolve => {
        confirmInputTitle.textContent = title;
        confirmInputMessage.textContent = message;
        confirmInputField.classList.add('hidden');
        confirmOkBtn.textContent = 'Ya';
        confirmOkBtn.onclick = () => {
            confirmInputModal.style.display = 'none';
            resolve(true);
        };
        confirmCancelBtn.onclick = () => {
            confirmInputModal.style.display = 'none';
            resolve(false);
        };
        confirmInputModal.style.display = 'flex';
    });
};

const showInputModal = (title, message, placeholder, initialValue) => {
    return new Promise(resolve => {
        confirmInputTitle.textContent = title;
        confirmInputMessage.textContent = message;
        confirmInputField.value = initialValue || '';
        confirmInputField.placeholder = placeholder;
        confirmInputField.classList.remove('hidden');
        confirmOkBtn.textContent = 'Simpan';
        confirmOkBtn.onclick = () => {
            confirmInputModal.style.display = 'none';
            resolve(confirmInputField.value);
        };
        confirmCancelBtn.onclick = () => {
            confirmInputModal.style.display = 'none';
            resolve(null);
        };
        confirmInputModal.style.display = 'flex';
    });
};

// --- Inisialisasi Firebase ---
const initFirebase = async () => {
    try {
        if (!firebaseConfig || Object.keys(firebaseConfig).length === 0) {
            // Jika tidak ada konfigurasi, masukkan konfigurasi Anda di sini
            const yourFirebaseConfig = {
                apiKey: "YOUR_API_KEY",
                authDomain: "YOUR_AUTH_DOMAIN",
                projectId: "YOUR_PROJECT_ID",
                storageBucket: "YOUR_STORAGE_BUCKET",
                messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
                appId: "YOUR_APP_ID"
            };
            app = initializeApp(yourFirebaseConfig);
        } else {
            app = initializeApp(firebaseConfig);
        }

        db = getFirestore(app);
        auth = getAuth(app);

        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            await signInAnonymously(auth);
        }

        onAuthStateChanged(auth, (user) => {
            if (user) {
                userId = user.uid;
                userIdSpan.textContent = userId;
                showHomeView();
                setupListeners();
            } else {
                userId = null;
                userIdSpan.textContent = 'Tidak Terautentikasi';
                showModal('Autentikasi gagal. Silakan coba lagi.');
            }
        });

    } catch (error) {
        console.error("Kesalahan saat inisialisasi Firebase:", error);
        showModal(`Kesalahan inisialisasi: ${error.message}. Pastikan konfigurasi Firebase sudah benar.`);
    }
};

// --- Listener Real-time Firestore ---
const setupListeners = () => {
    if (!db || !userId) {
        console.error("Database atau User ID tidak tersedia.");
        return;
    }

    // Dapatkan daftar siswa
    const studentsRef = collection(db, `artifacts/${appId}/users/${userId}/students`);
    onSnapshot(studentsRef, (snapshot) => {
        studentsData = {};
        snapshot.forEach(doc => {
            studentsData[doc.id] = doc.data().students;
        });
        renderAttendanceView(currentClass);
        renderManagementList();
    }, (error) => {
        console.error("Kesalahan saat memuat data siswa:", error);
        showModal(`Gagal memuat siswa: ${error.message}`);
    });

    // Dapatkan data absensi
    const attendanceRef = collection(db, `artifacts/${appId}/users/${userId}/attendance`);
    onSnapshot(attendanceRef, (snapshot) => {
        attendanceData = {};
        snapshot.forEach(doc => {
            attendanceData[doc.id] = doc.data();
        });
        if (!recapView.classList.contains('hidden')) {
            renderStudentRecapView(currentClass);
        }
        if (!overallRecapView.classList.contains('hidden')) {
            renderOverallRecapView();
        }
    }, (error) => {
        console.error("Kesalahan saat memuat data absensi:", error);
        showModal(`Gagal memuat absensi: ${error.message}`);
    });
};

// Data untuk warna dan emoji kelas
const classStyles = {
    '8A': { color: 'bg-indigo-500', emoji: '📚' },
    '8B': { color: 'bg-purple-500', emoji: '✨' },
    '8C': { color: 'bg-emerald-500', emoji: '🚀' },
    '8D': { color: 'bg-amber-500', emoji: '💡' },
    '8E': { color: 'bg-rose-500', emoji: '🌟' },
    '8F': { color: 'bg-cyan-500', emoji: '🌍' },
    '8G': { color: 'bg-fuchsia-500', emoji: '🎨' },
    '8H': { color: 'bg-teal-500', emoji: '🔬' },
    '8I': { color: 'bg-lime-500', emoji: '📐' },
    '8J': { color: 'bg-orange-500', emoji: '🔗' },
    '8K': { color: 'bg-blue-500', emoji: '🧠' },
};

// --- Fungsi Tampilan UI ---
const showHomeView = () => {
    homeView.innerHTML = '';
    allClasses.forEach(cls => {
        const style = classStyles[cls];
        const button = document.createElement('button');
        button.textContent = `${style.emoji} ${cls}`;
        button.classList.add('class-btn', style.color, 'hover:opacity-80', 'text-white', 'font-semibold', 'py-3', 'rounded-lg', 'shadow-md', 'transition', 'duration-300', 'transform', 'hover:scale-105');
        button.addEventListener('click', () => {
            currentClass = cls;
            renderAttendanceView(currentClass);
            attendanceView.classList.remove('hidden');
            homeView.classList.add('hidden');
        });
        homeView.appendChild(button);
    });
    homeView.classList.remove('hidden');
    attendanceView.classList.add('hidden');
    recapView.classList.add('hidden');
    overallRecapView.classList.add('hidden');
};

const renderAttendanceView = (className) => {
    currentClassTitle.textContent = `Absensi Kelas ${className}`;
    studentListContainer.innerHTML = '';
    
    const students = studentsData[className] || [];
    if (students.length === 0) {
        studentListContainer.innerHTML = `<p class="text-center text-gray-500 italic">Belum ada data siswa untuk kelas ini. Silakan tambahkan siswa melalui tombol "Manajemen Siswa".</p>`;
        return;
    }

    const attendanceDate = attendanceDateInput.value;
    const attendanceRecord = attendanceData[`${className}-${attendanceDate}`]?.absensi || {};
    
    const table = document.createElement('table');
    table.classList.add('min-w-full', 'divide-y', 'divide-gray-200');
    table.innerHTML = `
        <thead class="bg-gray-50">
            <tr>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">No.</th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama Siswa</th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Keterangan</th>
            </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200"></tbody>
    `;
    const tbody = table.querySelector('tbody');

    const statusData = {
        'Hadir': { emoji: '✅', color: 'text-green-600' },
        'Sakit': { emoji: '🤒', color: 'text-yellow-600' },
        'Izin': { emoji: '📝', color: 'text-blue-600' },
        'Alpa': { emoji: '❌', color: 'text-red-600' }
    };

    students.forEach((student, index) => {
        const tr = document.createElement('tr');
        tr.classList.add('hover:bg-gray-50');
        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${index + 1}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">${student.name}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                <div class="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                    ${Object.keys(statusData).map(status => `
                        <label class="inline-flex items-center cursor-pointer">
                            <input type="radio" class="form-radio h-4 w-4 text-gray-500 focus:ring-gray-500" name="status-${student.name}" value="${status}" ${attendanceRecord[student.name] === status || (attendanceRecord[student.name] === undefined && status === 'Hadir') ? 'checked' : ''}>
                            <span class="ml-2 text-sm font-medium ${statusData[status].color}">${statusData[status].emoji} ${status}</span>
                        </label>
                    `).join('')}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    studentListContainer.appendChild(table);
};

const renderStudentRecapView = (className) => {
    recapView.classList.remove('hidden');
    attendanceView.classList.add('hidden');
    homeView.classList.add('hidden');
    overallRecapView.classList.add('hidden');

    const recapTableContainer = document.getElementById('recap-table-container');
    recapTableContainer.innerHTML = '';
    
    const allStudents = {};
    const classAttendanceRecords = Object.values(attendanceData).filter(record => record.class === className);
    
    const studentsInClass = studentsData[className] || [];
    if (studentsInClass.length === 0) {
        recapTableContainer.innerHTML = `<p class="text-center text-gray-500 italic">Tidak ada data absensi untuk kelas ini.</p>`;
        return;
    }

    studentsInClass.forEach(student => {
        allStudents[student.name] = { hadir: 0, sakit: 0, izin: 0, alpa: 0, total: 0, className: className };
    });

    classAttendanceRecords.forEach(record => {
        const absensi = record.absensi;
        for (const studentName in absensi) {
            if (allStudents[studentName]) {
                const status = absensi[studentName].toLowerCase();
                if (allStudents[studentName][status] !== undefined) {
                    allStudents[studentName][status]++;
                    allStudents[studentName].total++;
                }
            }
        }
    });

    const table = document.createElement('table');
    table.classList.add('min-w-full', 'divide-y', 'divide-gray-200');
    table.innerHTML = `
        <thead class="bg-gray-50">
            <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama Siswa</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kelas</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hadir ✅</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sakit 🤒</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Izin 📝</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Alpa ❌</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Persentase</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Keterangan</th>
            </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200"></tbody>
    `;
    const tbody = table.querySelector('tbody');
    const sortedStudents = Object.entries(allStudents).sort(([nameA], [nameB]) => nameA.localeCompare(nameB));

    sortedStudents.forEach(([name, data]) => {
        const totalDays = data.total;
        const hadirCount = data.hadir;
        const percentage = totalDays > 0 ? (hadirCount / totalDays * 100).toFixed(0) : 0;
        const remark = percentage >= 80 ? 'Keren' : 'Perlu perhatian';
        const remarkColor = percentage >= 80 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
        const remarkEmoji = percentage >= 80 ? '🎉' : '⚠️';

        const tr = document.createElement('tr');
        tr.classList.add('hover:bg-gray-50');
        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${name}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">${data.className}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">${hadirCount}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">${data.sakit}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">${data.izin}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">${data.alpa}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">${percentage}%</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${remarkColor}">${remarkEmoji} ${remark}</span>
            </td>
        `;
        tbody.appendChild(tr);
    });

    recapTableContainer.appendChild(table);
};

const renderOverallRecapView = () => {
    recapView.classList.add('hidden');
    attendanceView.classList.add('hidden');
    homeView.classList.add('hidden');
    overallRecapView.classList.remove('hidden');

    const overallRecapTableContainer = document.getElementById('overall-recap-table-container');
    overallRecapTableContainer.innerHTML = '';
    
    const classRecaps = [];

    allClasses.forEach(className => {
        const classAttendanceRecords = Object.values(attendanceData).filter(record => record.class === className);
        const studentsInClass = studentsData[className] || [];
        
        let hadir = 0;
        let sakit = 0;
        let izin = 0;
        let alpa = 0;
        let totalSiswaAbsen = 0;

        classAttendanceRecords.forEach(record => {
            const absen = record.absensi;
            for (const studentName in absen) {
                if (studentsInClass.find(s => s.name === studentName)) {
                    totalSiswaAbsen++;
                    const status = absen[studentName].toLowerCase();
                    if (status === 'hadir') hadir++;
                    if (status === 'sakit') sakit++;
                    if (status === 'izin') izin++;
                    if (status === 'alpa') alpa++;
                }
            }
        });

        const totalEntries = hadir + sakit + izin + alpa;
        const hadirPercentage = totalEntries > 0 ? (hadir / totalEntries * 100).toFixed(0) : 0;
        const sakitPercentage = totalEntries > 0 ? (sakit / totalEntries * 100).toFixed(0) : 0;
        const izinPercentage = totalEntries > 0 ? (izin / totalEntries * 100).toFixed(0) : 0;
        const alpaPercentage = totalEntries > 0 ? (alpa / totalEntries * 100).toFixed(0) : 0;

        classRecaps.push({
            className,
            hadir,
            sakit,
            izin,
            alpa,
            hadirPercentage,
            sakitPercentage,
            izinPercentage,
            alpaPercentage
        });
    });

    // Urutkan berdasarkan persentase kehadiran untuk peringkat
    classRecaps.sort((a, b) => b.hadirPercentage - a.hadirPercentage);
    
    const table = document.createElement('table');
    table.classList.add('min-w-full', 'divide-y', 'divide-gray-200');
    table.innerHTML = `
        <thead class="bg-gray-50">
            <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Peringkat</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kelas</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hadir (%)</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sakit (%)</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Izin (%)</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Alpa (%)</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
            </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200"></tbody>
    `;
    const tbody = table.querySelector('tbody');

    classRecaps.forEach((recap, index) => {
        const tr = document.createElement('tr');
        tr.classList.add('hover:bg-gray-50');
        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${index + 1}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">${recap.className}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">${recap.hadirPercentage}%</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">${recap.sakitPercentage}%</td>
            <td class="px-6 py-4 whitespace-now-pae text-sm text-gray-700">${recap.izinPercentage}%</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">${recap.alpaPercentage}%</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">
                <button class="view-detail-btn bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold py-1 px-3 rounded-full transition duration-300" data-class="${recap.className}">Lihat Detail</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    overallRecapTableContainer.appendChild(table);
};

const downloadOverallRecapHTML = () => {
    const style = `
        <style>
            body { font-family: 'Inter', sans-serif; margin: 2rem; }
            h1 { font-size: 2rem; font-weight: bold; margin-bottom: 1rem; }
            h2 { font-size: 1.5rem; font-weight: bold; margin-bottom: 1rem; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #e5e7eb; padding: 0.75rem 1.5rem; text-align: left; }
            thead { background-color: #f9fafb; }
            .bg-green-100 { background-color: #d1fae5; }
            .text-green-800 { color: #166534; }
            .bg-red-100 { background-color: #fee2e2; }
            .text-red-800 { color: #991b1b; }
            .rounded-full { border-radius: 9999px; }
            .px-2 { padding-left: 0.5rem; padding-right: 0.5rem; }
            .inline-flex { display: inline-flex; }
        </style>
    `;
    const title = `<h1>Rekapitulasi Kehadiran Keseluruhan</h1>`;
    const tableContent = document.getElementById('overall-recap-table-container').innerHTML;
    const fullHtml = `<!DOCTYPE html><html><head><title>Rekap Absensi Keseluruhan</title>${style}</head><body>${title}${tableContent}</body></html>`;

    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Rekap_Absensi_Keseluruhan.html`;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

const downloadStudentRecapHTML = () => {
    const style = `
        <style>
            body { font-family: 'Inter', sans-serif; margin: 2rem; }
            h1 { font-size: 2rem; font-weight: bold; margin-bottom: 1rem; }
            h2 { font-size: 1.5rem; font-weight: bold; margin-bottom: 1rem; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #e5e7eb; padding: 0.75rem 1.5rem; text-align: left; }
            thead { background-color: #f9fafb; }
            .bg-green-100 { background-color: #d1fae5; }
            .text-green-800 { color: #166534; }
            .bg-red-100 { background-color: #fee2e2; }
            .text-red-800 { color: #991b1b; }
            .rounded-full { border-radius: 9999px; }
            .px-2 { padding-left: 0.5rem; padding-right: 0.5rem; }
            .inline-flex { display: inline-flex; }
        </style>
    `;
    const title = `<h1>Rekap Kehadiran Siswa</h1>`;
    const tableContent = document.getElementById('recap-table-container').innerHTML;
    const fullHtml = `<!DOCTYPE html><html><head><title>Rekap Absensi</title>${style}</head><body>${title}${tableContent}</body></html>`;

    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Rekap_Absensi_Pancasila.html`;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// --- Fungsi Logika ---
const saveAttendance = async () => {
    if (!userId) {
        showModal("Anda belum terautentikasi. Silakan refresh halaman.");
        return;
    }
    showModal("Menyimpan absensi...", true);

    const attendanceDate = attendanceDateInput.value;
    if (!attendanceDate) {
        showModal("Tanggal harus diisi!");
        return;
    }

    const attendanceRecords = {};
    const studentRadios = studentListContainer.querySelectorAll('input[type="radio"]:checked');
    studentRadios.forEach(radio => {
        const studentName = radio.name.replace('status-', '');
        attendanceRecords[studentName] = radio.value;
    });
    
    const docId = `${currentClass}-${attendanceDate}`;
    const docRef = doc(db, `artifacts/${appId}/users/${userId}/attendance`, docId);
    
    try {
        await setDoc(docRef, {
            class: currentClass,
            date: attendanceDate,
            absensi: attendanceRecords,
            timestamp: new Date()
        }, { merge: true });
        showModal("Absensi berhasil disimpan!");
    } catch (error) {
        console.error("Kesalahan saat menyimpan absensi:", error);
        showModal(`Gagal menyimpan absensi: ${error.message}`);
    }
};

const renderManagementList = () => {
    manageStudentList.innerHTML = '';
    const students = studentsData[currentClass] || [];
    if (students.length === 0) {
        manageStudentList.innerHTML = `<li class="p-4 text-center text-gray-500 italic">Belum ada siswa</li>`;
        return;
    }

    students.forEach((student, index) => {
        const li = document.createElement('li');
        li.classList.add('flex', 'justify-between', 'items-center', 'p-4');
        li.innerHTML = `
            <span class="text-gray-800">${index + 1}. ${student.name}</span>
            <div class="flex space-x-2">
                <button class="edit-student-btn bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-semibold py-1 px-3 rounded-full transition duration-300" data-name="${student.name}">Edit</button>
                <button class="delete-student-btn bg-red-500 hover:bg-red-600 text-white text-sm font-semibold py-1 px-3 rounded-full transition duration-300" data-name="${student.name}">Hapus</button>
            </div>
        `;
        manageStudentList.appendChild(li);
    });
};

const addStudent = async () => {
    if (!userId) {
        showModal("Anda belum terautentikasi. Silakan refresh halaman.");
        return;
    }
    const studentName = newStudentNameInput.value.trim();
    if (studentName === '') {
        showModal("Nama siswa tidak boleh kosong.");
        return;
    }

    showModal("Menambahkan siswa...", true);

    const students = studentsData[currentClass] || [];
    const newStudents = [...students, { name: studentName }];
    
    const docRef = doc(db, `artifacts/${appId}/users/${userId}/students`, currentClass);
    try {
        await setDoc(docRef, {
            class: currentClass,
            students: newStudents,
            timestamp: new Date()
        });
        newStudentNameInput.value = '';
        hideModal();
        showModal("Siswa berhasil ditambahkan!");
    } catch (error) {
        console.error("Kesalahan saat menambahkan siswa:", error);
        showModal(`Gagal menambahkan siswa: ${error.message}`);
    }
};

const handleEditDelete = async (event) => {
    if (!userId) {
        showModal("Anda belum terautentikasi. Silakan refresh halaman.");
        return;
    }
    const button = event.target;
    const studentName = button.dataset.name;
    const students = studentsData[currentClass] || [];
    
    if (button.classList.contains('delete-student-btn')) {
        const confirmed = await showConfirmModal('Konfirmasi Hapus', `Apakah Anda yakin ingin menghapus siswa ${studentName}?`);
        if (!confirmed) return;
        
        showModal("Menghapus siswa...", true);
        const newStudents = students.filter(student => student.name !== studentName);
        await updateStudentList(newStudents);
    } else if (button.classList.contains('edit-student-btn')) {
        const newName = await showInputModal('Ubah Nama', `Ubah nama untuk ${studentName}:`, 'Nama baru', studentName);
        if (!newName || newName.trim() === '' || newName === studentName) return;

        showModal("Memperbarui siswa...", true);
        const newStudents = students.map(student => student.name === studentName ? { name: newName } : student);
        await updateStudentList(newStudents);
    }
};

const updateStudentList = async (newStudents) => {
    const docRef = doc(db, `artifacts/${appId}/users/${userId}/students`, currentClass);
    try {
        await setDoc(docRef, {
            class: currentClass,
            students: newStudents,
            timestamp: new Date()
        });
        hideModal();
        showModal("Data siswa berhasil diperbarui!");
    } catch (error) {
        console.error("Kesalahan saat memperbarui siswa:", error);
        showModal(`Gagal memperbarui siswa: ${error.message}`);
    }
};

const handleFileUpload = async (event) => {
    if (!userId) {
        showModal("Anda belum terautentikasi. Silakan refresh halaman.");
        return;
    }
    const file = event.target.files[0];
    if (!file) return;

    showModal("Mengunggah data siswa...", true);

    const reader = new FileReader();
    reader.onload = async (e) => {
        const text = e.target.result;
        const lines = text.split('\n').filter(line => line.trim() !== '');
        const students = lines.map(line => {
            const name = line.trim().replace(/"/g, '');
            return { name: name };
        });

        if (students.length === 0) {
            showModal("File CSV kosong atau tidak valid.");
            return;
        }

        // Simpan ke Firestore
        const docRef = doc(db, `artifacts/${appId}/users/${userId}/students`, currentClass);
        try {
            await setDoc(docRef, {
                class: currentClass,
                students: students,
                timestamp: new Date()
            });
            hideModal();
            showModal(`Berhasil mengunggah ${students.length} siswa untuk kelas ${currentClass}.`);
        } catch (error) {
            console.error("Kesalahan saat mengunggah siswa:", error);
            showModal(`Gagal mengunggah siswa: ${error.message}`);
        }
    };
    reader.readAsText(file);
};

// --- Event Listeners ---
modalCloseBtn.onclick = hideModal;
closeManageModalBtn.onclick = hideManagementModal;

saveBtn.addEventListener('click', saveAttendance);

recapBtn.addEventListener('click', () => {
    renderOverallRecapView();
});

backToHomeFromOverallBtn.addEventListener('click', showHomeView);
backToHomeFromAttendanceBtn.addEventListener('click', showHomeView);
backToOverallRecapBtn.addEventListener('click', () => {
     renderOverallRecapView();
});


document.getElementById('overall-recap-table-container').addEventListener('click', (event) => {
    if (event.target.classList.contains('view-detail-btn')) {
        const className = event.target.dataset.class;
        renderStudentRecapView(className);
    }
});


downloadRecapBtn.addEventListener('click', downloadStudentRecapHTML);
downloadOverallRecapBtn.addEventListener('click', downloadOverallRecapHTML);

manageStudentsBtn.addEventListener('click', showManagementModal);
addStudentBtn.addEventListener('click', addStudent);
uploadCsvModalBtn.addEventListener('click', () => csvFileInput.click());
csvFileInput.addEventListener('change', handleFileUpload);
manageStudentList.addEventListener('click', handleEditDelete);

// Atur tanggal default ke hari ini
const today = new Date().toISOString().split('T')[0];
attendanceDateInput.value = today;

// Inisialisasi aplikasi
window.onload = initFirebase;