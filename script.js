/**
[file name]: script.js
[file content begin]
/* ==========================================================================
   HOTEL TASK PRO v4.3 - Fő JavaScript fájl
   ========================================================================== */

/* ==========================================================================
   0. FIREBASE SDK BETÖLTÉS ÉS INICIALIZÁLÁS
   ========================================================================== */

/**
 * Firebase SDK dinamikus betöltése
 * A Firebase csak akkor inicializálható, ha a SDK már betöltődött
 */
function loadFirebaseSDK() {
    return new Promise((resolve, reject) => {
        // Ellenőrizzük, hogy már betöltődött-e a Firebase
        if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
            console.log("Firebase SDK már betöltve");
            resolve();
            return;
        }

        console.log("Firebase SDK betöltése...");

        // Létrehozzuk a betöltési sorrendet
        const firebaseScripts = [
            {
                src: 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js',
                name: 'Firebase App'
            },
            {
                src: 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js',
                name: 'Firebase Auth'
            },
            {
                src: 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js',
                name: 'Firebase Firestore'
            }
        ];

        let loadedCount = 0;

        // Rekurzív függvény a szkriptek szekvenciális betöltéséhez
        function loadNextScript() {
            if (loadedCount >= firebaseScripts.length) {
                console.log("Összes Firebase SDK betöltve");
                resolve();
                return;
            }

            const scriptInfo = firebaseScripts[loadedCount];
            console.log(`Betöltés: ${scriptInfo.name}`);

            const script = document.createElement('script');
            script.src = scriptInfo.src;
            script.async = true;
            script.defer = true;
            
            script.onload = () => {
                loadedCount++;
                console.log(`${scriptInfo.name} betöltve`);
                loadNextScript();
            };
            
            script.onerror = (error) => {
                console.error(`Hiba a ${scriptInfo.name} betöltésekor:`, error);
                reject(new Error(`${scriptInfo.name} betöltése sikertelen`));
            };
            
            document.head.appendChild(script);
        }

        // Betöltés indítása
        loadNextScript();
    });
}

/**
 * Firebase konfiguráció
 * Ezt a konfigurációt a Firebase Console-ból kapod
 */
const firebaseConfig = {
    apiKey: "AIzaSyALaMLBsuwfoL0f_nCZrLOOFoPrwFWcK-Y",
    authDomain: "hotel-task-d6ccb.firebaseapp.com",
    projectId: "hotel-task-d6ccb",
    storageBucket: "hotel-task-d6ccb.firebasestorage.app",
    messagingSenderId: "672933330380",
    appId: "1:672933330380:web:7d5a30d3df8db8b4f87169"
};

/**
 * Firebase inicializálása
 * Egyszerűsített verzió, offline támogatással
 */
function initFirebase() {
    try {
        // Ellenőrizzük, hogy a Firebase elérhető-e
        if (typeof firebase === 'undefined') {
            throw new Error("Firebase SDK nincs betöltve");
        }

        // Inicializálás, ha még nem történt meg
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
            console.log("Firebase alkalmazás inicializálva");
        }

        // Auth és Firestore objektumok
        const db = firebase.firestore();
        const auth = firebase.auth();
        
        console.log("Firebase szolgáltatások elérhetők");

        // Offline támogatás engedélyezése (opcionális, később visszaállítható)
        return db.enablePersistence({ synchronizeTabs: true })
            .then(() => {
                console.log("Firestore offline támogatás engedélyezve");
                return { auth, db };
            })
            .catch((error) => {
                console.log("Offline mód korlátozott:", error.code);
                // Offline hiba esetén is visszaadjuk az objektumokat
                return { auth, db };
            });

    } catch (error) {
        console.error("Firebase inicializálási hiba:", error);
        showNotification("Hiba az alkalmazás indításakor!", "error");
        throw error;
    }
}

/* ==========================================================================
   1. GLOBÁLIS VÁLTOZÓK ÉS ÁLLAPOTKEZELÉS
   ========================================================================== */

// Firebase szolgáltatások
let auth = null;
let db = null;

// Felhasználói adatok
let currentUser = null;
let currentUserNickname = "";
let currentUserRole = "karbantarto";

// Alkalmazás állapotok
let tasks = [];
let rooms = [];
let comments = {};

// Real-time listener leiratkozók
let unsubscribeTasks = null;
let unsubscribeChat = null;
let unsubscribeComments = {};

// UI állapotok
let editingTaskId = null;
let currentFilter = "all";
let currentCategory = "all";
let currentRoomDetail = null;
let currentKanbanSearchQuery = "";
let currentTaskId = null;

// Felhasználók cache
let allUsers = [];
const userCache = new Map();

// Hangvezérlés állapotok
let ttsEnabled = true;
let ttsVoice = null;
let ttsVolume = 1;
let ttsRate = 1;
let ttsPitch = 1;
let recognition = null;
let isListening = false;
let recognitionActive = false;

// Kapcsolat állapot
let isOnline = navigator.onLine;

/* ==========================================================================
   2. KONSTANSOK (Szerepkörök, Szobák, Ikonok)
   ========================================================================== */

// Szerepkörök definíciói
const ROLES = {
    ADMIN: "admin",
    SUPERVISOR: "supervisor",
    HOUSEKEEPER: "szobaasszony",
    MAINTENANCE: "karbantarto",
    RECEPTION: "reception"
};

// Szerepkör megjelenítési nevek
const ROLE_LABELS = {
    admin: "Admin",
    supervisor: "Supervisor",
    szobaasszony: "Szobaasszony",
    karbantarto: "Karbantartó",
    reception: "Recepciós"
};

// Szerepkör színek CSS osztályokhoz
const ROLE_COLORS = {
    admin: "role-admin",
    supervisor: "role-supervisor",
    szobaasszony: "role-housekeeper",
    karbantarto: "role-maintenance",
    reception: "role-reception"
};

// Szobaszámok listája
const ROOM_NUMBERS = [
    "101", "102", "103", "104", "105",
    "201", "202", "203", "204", "205", "206",
    "301", "302", "303",
    "151", "152", "153", "154", "155", "156", "157", "158",
    "111", "112", "113", "114", "115", "116", "117", "118", "119", "120", "121", "122",
    "211", "212", "213", "214", "215", "216", "217", "218", "219", "220", "221", "222",
    "311", "313", "314", "315", "316", "317", "318", "319", "320",
    "KazánH", "KondiT", "Konyha-Étkező", "Mosoda", "Wellness"
];

// Suite szobák
const SUITE_ROOMS = ["155", "206", "121", "212", "221", "222", "314", "319", "320"];

// Akadálymentesített szoba
const ACCESSIBLE_ROOM = "112";

// Létesítmény szobák
const FACILITY_ROOMS = ["KazánH", "KondiT", "Konyha-Étkező", "Mosoda", "Wellness"];

// Létesítmény részletek
const FACILITY_DETAILS = {
    "KazánH": { icon: "fa-fire", name: "Kazánház" },
    "KondiT": { icon: "fa-dumbbell", name: "Konditerem" },
    "Konyha-Étkező": { icon: "fa-utensils", name: "Konyha-Étkező" },
    "Mosoda": { icon: "fa-tshirt", name: "Mosoda" },
    "Wellness": { icon: "fa-spa", name: "Wellness" }
};

// Kategória ikonok
const CATEGORY_ICONS = {
    cleaning: '<i class="fas fa-broom"></i>',
    maintenance: '<i class="fas fa-tools"></i>',
    service: '<i class="fas fa-concierge-bell"></i>',
    supply: '<i class="fas fa-boxes"></i>',
    other: '<i class="fas fa-question-circle"></i>'
};

// Kategória megjelenítési nevek
const CATEGORY_LABELS = {
    cleaning: "Takarítás",
    maintenance: "Karbantartás",
    service: "Szolgáltatás",
    supply: "Készlet",
    other: "Egyéb"
};

/* ==========================================================================
   3. JOGOSULTSÁGRENDSZER (PERMISSIONS)
   ========================================================================== */

// Jogosultság kulcsok
const PERMISSIONS = {
    'CAN_EDIT_TASKS': 'CAN_EDIT_TASKS',
    'CAN_DELETE_TASKS': 'CAN_DELETE_TASKS',
    'CAN_MANAGE_ROOMS': 'CAN_MANAGE_ROOMS',
    'CAN_MANAGE_USERS': 'CAN_MANAGE_USERS',
    'CAN_EXPORT_DATA': 'CAN_EXPORT_DATA',
    'CAN_VIEW_STATISTICS': 'CAN_VIEW_STATISTICS',
    'CAN_MANAGE_COMMENTS': 'CAN_MANAGE_COMMENTS',
    'CAN_ASSIGN_TASKS': 'CAN_ASSIGN_TASKS',
    'CAN_CHANGE_STATUS': 'CAN_CHANGE_STATUS',
    'CAN_ADD_TASKS': 'CAN_ADD_TASKS',
    'CAN_VIEW_ALL_TASKS': 'CAN_VIEW_ALL_TASKS'
};

// Jogosultság megjelenítési nevek
const PERMISSION_LABELS = {
    'CAN_EDIT_TASKS': 'Feladatok szerkesztése',
    'CAN_DELETE_TASKS': 'Feladatok törlése',
    'CAN_MANAGE_ROOMS': 'Szobák kezelése',
    'CAN_MANAGE_USERS': 'Felhasználók kezelése',
    'CAN_EXPORT_DATA': 'Adatok exportálása',
    'CAN_VIEW_STATISTICS': 'Statisztikák megtekintése',
    'CAN_MANAGE_COMMENTS': 'Hozzászólások kezelése',
    'CAN_ASSIGN_TASKS': 'Feladatok kiosztása',
    'CAN_CHANGE_STATUS': 'Státusz módosítása',
    'CAN_ADD_TASKS': 'Új feladatok hozzáadása',
    'CAN_VIEW_ALL_TASKS': 'Összes feladat megtekintése'
};

// Alapértelmezett jogosultságok szerepkörönként
const DEFAULT_PERMISSIONS = {
    admin: {
        'CAN_EDIT_TASKS': true,
        'CAN_DELETE_TASKS': true,
        'CAN_MANAGE_ROOMS': true,
        'CAN_MANAGE_USERS': true,
        'CAN_EXPORT_DATA': true,
        'CAN_VIEW_STATISTICS': true,
        'CAN_MANAGE_COMMENTS': true,
        'CAN_ASSIGN_TASKS': true,
        'CAN_CHANGE_STATUS': true,
        'CAN_ADD_TASKS': true,
        'CAN_VIEW_ALL_TASKS': true
    },
    supervisor: {
        'CAN_EDIT_TASKS': true,
        'CAN_DELETE_TASKS': true,
        'CAN_MANAGE_ROOMS': true,
        'CAN_MANAGE_USERS': false,
        'CAN_EXPORT_DATA': true,
        'CAN_VIEW_STATISTICS': true,
        'CAN_MANAGE_COMMENTS': true,
        'CAN_ASSIGN_TASKS': true,
        'CAN_CHANGE_STATUS': true,
        'CAN_ADD_TASKS': true,
        'CAN_VIEW_ALL_TASKS': true
    },
    reception: {
        'CAN_EDIT_TASKS': true,
        'CAN_DELETE_TASKS': false,
        'CAN_MANAGE_ROOMS': true,
        'CAN_MANAGE_USERS': false,
        'CAN_EXPORT_DATA': false,
        'CAN_VIEW_STATISTICS': true,
        'CAN_MANAGE_COMMENTS': true,
        'CAN_ASSIGN_TASKS': true,
        'CAN_CHANGE_STATUS': true,
        'CAN_ADD_TASKS': true,
        'CAN_VIEW_ALL_TASKS': true
    },
    szobaasszony: {
        'CAN_EDIT_TASKS': true,
        'CAN_DELETE_TASKS': false,
        'CAN_MANAGE_ROOMS': true,
        'CAN_MANAGE_USERS': false,
        'CAN_EXPORT_DATA': false,
        'CAN_VIEW_STATISTICS': true,
        'CAN_MANAGE_COMMENTS': true,
        'CAN_ASSIGN_TASKS': false,
        'CAN_CHANGE_STATUS': true,
        'CAN_ADD_TASKS': true,
        'CAN_VIEW_ALL_TASKS': true
    },
    karbantarto: {
        'CAN_EDIT_TASKS': true,
        'CAN_DELETE_TASKS': false,
        'CAN_MANAGE_ROOMS': true,
        'CAN_MANAGE_USERS': false,
        'CAN_EXPORT_DATA': false,
        'CAN_VIEW_STATISTICS': false,
        'CAN_MANAGE_COMMENTS': true,
        'CAN_ASSIGN_TASKS': false,
        'CAN_CHANGE_STATUS': true,
        'CAN_ADD_TASKS': true,
        'CAN_VIEW_ALL_TASKS': false
    }
};

/* ==========================================================================
   4. ALKALMAZÁS INICIALIZÁLÁSA
   ========================================================================== */

/**
 * Fő inicializáló függvény
 * Betölti a Firebase SDK-t, inicializálja az alkalmazást
 */
async function initializeApp() {
    console.log("Alkalmazás inicializálása...");
    
    try {
        // 1. Firebase SDK betöltése
        await loadFirebaseSDK();
        
        // 2. Firebase inicializálása
        const firebaseServices = await initFirebase();
        auth = firebaseServices.auth;
        db = firebaseServices.db;
        
        console.log("Firebase szolgáltatások inicializálva");
        console.log("Auth objektum:", auth);
        console.log("DB objektum:", db);
        
        // 3. Eseménykezelők beállítása
        setupEventListeners();
        
        // 4. Auth állapot figyelő beállítása
        setupAuthStateListener();
        
        // 5. Óra frissítés indítása
        updateClock();
        setInterval(updateClock, 60000);
        
        // 6. Online állapot figyelése
        setupOnlineStatusListener();
        
        console.log("Alkalmazás sikeresen inicializálva");
        
    } catch (error) {
        console.error("Alkalmazás inicializálási hiba:", error);
        console.error("Hiba részletek:", error.message, error.stack);
        showCriticalError("Az alkalmazás indítása sikertelen. Kérjük, frissítsd az oldalt.");
    }
}

/**
 * Online állapot figyelő beállítása
 */
function setupOnlineStatusListener() {
    window.addEventListener('online', () => {
        isOnline = true;
        showNotification("Online kapcsolat visszaállítva", "success");
        reconnectFirebaseListeners();
    });
    
    window.addEventListener('offline', () => {
        isOnline = false;
        showNotification("Offline mód - korlátozott funkciók", "warning");
    });
}

/**
 * Firebase listener-ek újracsatlakoztatása
 */
function reconnectFirebaseListeners() {
    if (!currentUser) return;
    
    // Chat újrainicializálása
    if (typeof initChat === 'function') {
        setTimeout(() => {
            initChat();
            showNotification("Adatbázis kapcsolat visszaállítva", "success");
        }, 1000);
    }
}

/**
 * Kritikus hiba megjelenítése
 */
function showCriticalError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: white;
        z-index: 9999;
        padding: 20px;
        text-align: center;
    `;
    
    errorDiv.innerHTML = `
        <i class="fas fa-exclamation-triangle" style="font-size: 4rem; margin-bottom: 20px;"></i>
        <h1 style="font-size: 2rem; margin-bottom: 10px;">Hiba</h1>
        <p style="font-size: 1.2rem; margin-bottom: 30px; max-width: 500px;">${message}</p>
        <button onclick="location.reload()" style="
            background: white;
            color: #667eea;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 1rem;
            cursor: pointer;
            font-weight: bold;
        ">
            <i class="fas fa-redo"></i> Oldal frissítése
        </button>
    `;
    
    document.body.appendChild(errorDiv);
}

/* ==========================================================================
   5. AUTHENTIKÁCIÓ ÉS FELHASZNÁLÓKEZELÉS
   ========================================================================== */

/**
 * Auth állapot változás figyelő beállítása
 */
function setupAuthStateListener() {
    auth.onAuthStateChanged(async (user) => {
        console.log("Auth állapot változás:", user ? user.email : "Nincs felhasználó");
        if (user) {
            // Felhasználó bejelentkezett
            await handleUserLogin(user);
        } else {
            // Felhasználó kijelentkezett
            handleUserLogout();
        }
    });
}

/**
 * Felhasználó bejelentkezésének kezelése
 */
async function handleUserLogin(user) {
    try {
        console.log("Felhasználó bejelentkezett:", user.email);
        currentUser = user;
        
        // Felhasználói profil betöltése
        await loadUserProfile(user);
        
        // UI frissítése
        updateUserInterface();
        
        // Fő alkalmazás megjelenítése
        showMainApp();
        
        // Modulok inicializálása
        initModules();
        
        // Üdvözlés
        showNotification(`Üdvözlöm, ${currentUserNickname}! (${ROLE_LABELS[currentUserRole]})`);
        
        if (ttsEnabled) {
            setTimeout(() => {
                speakText(`Üdvözlöm, ${currentUserNickname}!`);
            }, 1500);
        }
        
    } catch (error) {
        console.error("Bejelentkezési hiba:", error);
        showNotification("Hiba a bejelentkezés során", "error");
    }
}

/**
 * Felhasználói profil betöltése
 */
async function loadUserProfile(user) {
    try {
        const userDoc = await db.collection("users").doc(user.uid).get();
        
        if (userDoc.exists) {
            // Meglévő felhasználó
            const userData = userDoc.data();
            currentUserNickname = userData.nickname || user.email.split("@")[0];
            currentUserRole = userData.role || "karbantarto";
            
            // Utolsó bejelentkezés frissítése
            await db.collection("users").doc(user.uid).update({
                lastLogin: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            console.log("Felhasználói profil betöltve:", currentUserNickname, currentUserRole);
        } else {
            // Új felhasználó - profil létrehozása
            currentUserNickname = user.email.split("@")[0];
            currentUserRole = "karbantarto";
            
            await db.collection("users").doc(user.uid).set({
                email: user.email,
                nickname: currentUserNickname,
                role: currentUserRole,
                permissions: DEFAULT_PERMISSIONS[currentUserRole] || {},
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastLogin: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            showNotification("Új profil létrehozva!");
            console.log("Új felhasználói profil létrehozva");
        }
        
        // Cache frissítése
        userCache.set(user.uid, currentUserNickname);
        
    } catch (error) {
        console.error("Hiba a felhasználói profil betöltésekor:", error);
        currentUserNickname = user.email.split("@")[0];
        currentUserRole = "karbantarto";
        console.log("Alapértelmezett profil használata");
    }
}

/**
 * Felhasználói név lekérdezése (cache-elve)
 */
async function getUserNickname(userId) {
    // Cache ellenőrzése
    if (userCache.has(userId)) {
        return userCache.get(userId);
    }
    
    try {
        const userDoc = await db.collection("users").doc(userId).get();
        
        if (userDoc.exists) {
            const nickname = userDoc.data().nickname || "Ismeretlen";
            userCache.set(userId, nickname);
            return nickname;
        }
        
        return "Ismeretlen";
        
    } catch (error) {
        console.error("Hiba a felhasználó név lekérdezésekor:", error);
        return "Ismeretlen";
    }
}

/**
 * Felhasználói jogosultságok lekérdezése
 */
async function getUserPermissions(userId, userRole) {
    try {
        // Először megpróbáljuk a szerepkör alapú jogosultságokat betölteni
        const rolePermissionsDoc = await db.collection('system').doc(`role_permissions_${userRole}`).get();
        
        if (rolePermissionsDoc.exists) {
            return rolePermissionsDoc.data().permissions || DEFAULT_PERMISSIONS[userRole] || {};
        }
        
    } catch (error) {
        console.error('Hiba a szerepkör jogosultságok betöltésekor:', error);
    }
    
    // Alapértelmezett jogosultságok
    return DEFAULT_PERMISSIONS[userRole] || {};
}

/**
 * Felhasználó kijelentkezésének kezelése
 */
function handleUserLogout() {
    console.log("Felhasználó kijelentkezett");
    
    // Listener-ek leállítása
    if (unsubscribeTasks) unsubscribeTasks();
    if (unsubscribeChat) unsubscribeChat();
    
    Object.values(unsubscribeComments).forEach(unsub => {
        if (unsub) unsub();
    });
    unsubscribeComments = {};
    
    // Hangkezelés leállítása
    if ("speechSynthesis" in window) {
        speechSynthesis.cancel();
    }
    
    if (recognition && isListening) {
        recognition.stop();
    }
    
    // Állapotok visszaállítása
    currentUser = null;
    tasks = [];
    rooms = [];
    comments = {};
    
    // UI visszaállítása
    showLoginScreen();
}

/**
 * Fő alkalmazás megjelenítése
 */
function showMainApp() {
    const loginScreen = document.getElementById('loginScreen');
    const mainApp = document.getElementById('mainApp');
    
    if (loginScreen) {
        loginScreen.style.display = 'none';
        loginScreen.classList.add('hidden');
    }
    
    if (mainApp) {
        mainApp.style.display = 'block';
        setTimeout(() => {
            mainApp.classList.add('visible');
        }, 50);
    }
}

/**
 * Bejelentkező képernyő megjelenítése
 */
function showLoginScreen() {
    const loginScreen = document.getElementById('loginScreen');
    const mainApp = document.getElementById('mainApp');
    const registrationScreen = document.getElementById('registrationScreen');
    
    if (mainApp) {
        mainApp.classList.remove('visible');
        setTimeout(() => {
            mainApp.style.display = 'none';
        }, 500);
    }
    
    if (registrationScreen) {
        registrationScreen.classList.remove('active');
    }
    
    if (loginScreen) {
        loginScreen.style.display = 'flex';
        setTimeout(() => {
            loginScreen.classList.remove('hidden');
        }, 50);
    }
}

/* ==========================================================================
   6. MODULOK INICIALIZÁLÁSA
   ========================================================================== */

/**
 * Összes modul inicializálása
 */
function initModules() {
    // Chat rendszer
    initChat();
    
    // Feladatok kezelése
    initTasks();
    
    // Szobák kezelése
    initRooms();
    
    // TTS (Text-to-Speech)
    initTTS();
    
    // Hangfelismerés
    initVoiceRecognition();
    
    // Menürendszer
    initMenuSystem();
    
    // Felhasználók listája
    loadAllUsersList();
    
    // Összecsukható panel állapotok
    loadCollapsibleState();
    
    // Alapértelmezett nézet
    showView("dashboard");
    
    // Plugin rendszer
    initPluginSystem();
}

/* ==========================================================================
   7. UI KEZELÉS ÉS SEGÉDFÜGGVÉNYEK
   ========================================================================== */

/**
 * Felhasználói interfész frissítése
 */
function updateUserInterface() {
    // Felhasználónév megjelenítése
    const nicknameDisplay = document.getElementById('userNicknameDisplay');
    if (nicknameDisplay) {
        nicknameDisplay.textContent = currentUserNickname;
    }
    
    // Szerepkör megjelenítése
    updateUserRoleDisplay();
    
    // Admin panel láthatósága
    toggleAdminPanel();
    
    // Online állapot mutató
    updateOnlineStatusIndicator();
}

/**
 * Felhasználói szerepkör megjelenítése
 */
function updateUserRoleDisplay() {
    const badge = document.getElementById("userRoleBadge");
    if (badge) {
        badge.textContent = ROLE_LABELS[currentUserRole] || "Karbantartó";
        badge.className = `role-badge ${ROLE_COLORS[currentUserRole] || "role-maintenance"}`;
        badge.style.display = "inline-block";
    }
}

/**
 * Online állapot mutató frissítése
 */
function updateOnlineStatusIndicator() {
    const indicator = document.getElementById("onlineIndicator");
    if (indicator) {
        if (isOnline) {
            indicator.innerHTML = '<i class="fas fa-wifi"></i> Online';
            indicator.style.color = "var(--success)";
        } else {
            indicator.innerHTML = '<i class="fas fa-wifi-slash"></i> Offline';
            indicator.style.color = "var(--warning)";
        }
    }
}

/**
 * Admin panel láthatósága
 */
function toggleAdminPanel() {
    const panel = document.getElementById("adminPanel");
    if (panel) {
        if (currentUserRole === ROLES.ADMIN) {
            panel.style.display = "block";
            loadAllUsers();
        } else {
            panel.style.display = "none";
        }
    }
}

/**
 * Óra frissítése
 */
function updateClock() {
    const now = new Date();
    const timeElement = document.querySelector("#clock .time");
    const dateElement = document.querySelector("#clock .date");
    
    if (timeElement) {
        timeElement.textContent = 
            now.getHours().toString().padStart(2, "0") + ":" + 
            now.getMinutes().toString().padStart(2, "0");
    }
    
    if (dateElement) {
        dateElement.textContent = 
            now.getFullYear() + "." + 
            (now.getMonth() + 1).toString().padStart(2, "0") + "." + 
            now.getDate().toString().padStart(2, "0");
    }
}

/**
 * Értesítés megjelenítése
 */
function showNotification(message, type = "info") {
    const notification = document.getElementById("notification");
    const notificationText = document.getElementById("notification-text");
    
    if (!notification || !notificationText) {
        console.log("Értesítés:", message);
        return;
    }
    
    // Szín beállítása típus alapján
    const colors = {
        info: "var(--info)",
        success: "var(--success)",
        warning: "var(--warning)",
        error: "var(--danger)"
    };
    
    notification.style.backgroundColor = colors[type] || colors.info;
    notificationText.textContent = message;
    notification.style.display = "flex";
    
    // TTS értesítés
    if (ttsEnabled && type !== "error") {
        speakText(message, "normal");
    }
    
    // Automatikus eltüntetés
    setTimeout(() => {
        notification.style.display = "none";
    }, 3000);
}

/**
 * Beviteli mezők törlése
 */
function clearInputs() {
    const roomInput = document.getElementById("room");
    const noteInput = document.getElementById("note");
    const prioSelect = document.getElementById("prio");
    const categorySelect = document.getElementById("category");
    
    if (roomInput) roomInput.value = "";
    if (noteInput) noteInput.value = "";
    if (prioSelect) prioSelect.value = "2";
    if (categorySelect) categorySelect.value = "cleaning";
    
    updateMicStatus("Kattintson a mikrofon gombra a diktáláshoz");
}

/* ==========================================================================
   8. BEJELENTKEZÉSI ŰRLAP KEZELÉSE
   ========================================================================== */

/**
 * Bejelentkezési űrlap kezelése
 */
async function handleLogin(event) {
    event.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorElement = document.getElementById('loginError');
    const loginButton = document.getElementById('loginBtn');
    
    console.log("Bejelentkezési kísérlet:", email);
    console.log("Auth objektum állapota:", auth);
    
    // UI állapot beállítása
    if (errorElement) errorElement.classList.remove('show');
    if (loginButton) {
        loginButton.disabled = true;
        loginButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Bejelentkezés...';
    }
    
    try {
        console.log("Firebase signInWithEmailAndPassword meghívása...");
        await auth.signInWithEmailAndPassword(email, password);
        console.log("Bejelentkezés sikeres");
        // Sikeres bejelentkezés, az auth state listener kezeli a továbbiakat
        
    } catch (error) {
        console.error("Bejelentkezési hiba részletesen:", error);
        console.error("Hibakód:", error.code);
        console.error("Hibaüzenet:", error.message);
        
        // Hibák fordítása magyarra
        let errorMessage = "Hibás email vagy jelszó";
        switch (error.code) {
            case 'auth/user-not-found':
                errorMessage = "Felhasználó nem található";
                break;
            case 'auth/wrong-password':
                errorMessage = "Hibás jelszó";
                break;
            case 'auth/invalid-email':
                errorMessage = "Érvénytelen email cím";
                break;
            case 'auth/user-disabled':
                errorMessage = "Felhasználó letiltva";
                break;
            case 'auth/too-many-requests':
                errorMessage = "Túl sok próbálkozás, próbáld újra később";
                break;
            case 'auth/network-request-failed':
                errorMessage = "Hálózati hiba, ellenőrizd az internetkapcsolatot";
                break;
            case 'auth/operation-not-allowed':
                errorMessage = "Email/jelszó bejelentkezés nincs engedélyezve a Firebase konzolban";
                break;
            default:
                errorMessage = `Ismeretlen hiba: ${error.code}`;
        }
        
        // Hiba megjelenítése
        if (errorElement) {
            errorElement.textContent = errorMessage;
            errorElement.classList.add('show');
        }
        
        // Gomb visszaállítása
        if (loginButton) {
            loginButton.disabled = false;
            loginButton.innerHTML = '<i class="fas fa-sign-in-alt"></i> Bejelentkezés';
        }
    }
}

/**
 * Regisztrációs űrlap megjelenítése
 */
function showRegistrationForm() {
    const loginScreen = document.getElementById('loginScreen');
    const registrationScreen = document.getElementById('registrationScreen');
    
    if (loginScreen && registrationScreen) {
        loginScreen.classList.add('hidden');
        setTimeout(() => {
            loginScreen.style.display = 'none';
            registrationScreen.classList.add('active');
        }, 300);
    }
}

/**
 * Bejelentkezési űrlap visszaállítása
 */
function showLoginForm() {
    const loginScreen = document.getElementById('loginScreen');
    const registrationScreen = document.getElementById('registrationScreen');
    
    if (loginScreen && registrationScreen) {
        registrationScreen.classList.remove('active');
        setTimeout(() => {
            registrationScreen.style.display = 'none';
            loginScreen.style.display = 'flex';
            setTimeout(() => {
                loginScreen.classList.remove('hidden');
            }, 50);
        }, 300);
    }
}

/**
 * Regisztrációs űrlap kezelése
 */
async function handleRegistration(event) {
    event.preventDefault();
    
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirmPassword').value;
    const nickname = document.getElementById('regNickname').value.trim();
    const role = document.getElementById('regRole').value;
    const errorElement = document.getElementById('registrationError');
    
    // Validáció
    if (!errorElement) return;
    
    errorElement.classList.remove('show');
    
    if (password !== confirmPassword) {
        errorElement.textContent = "A jelszavak nem egyeznek!";
        errorElement.classList.add('show');
        return;
    }
    
    if (password.length < 6) {
        errorElement.textContent = "A jelszónak legalább 6 karakter hosszúnak kell lennie!";
        errorElement.classList.add('show');
        return;
    }
    
    if (!nickname) {
        errorElement.textContent = "A niknév megadása kötelező!";
        errorElement.classList.add('show');
        return;
    }
    
    try {
        console.log("Felhasználó létrehozása:", email);
        // Felhasználó létrehozása
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        console.log("Felhasználó létrehozva:", user.uid);
        
        // Felhasználói adatok mentése Firestore-ba
        await db.collection("users").doc(user.uid).set({
            email: user.email,
            nickname: nickname,
            role: role,
            permissions: await getUserPermissions(user.uid, role),
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        console.log("Felhasználói adatok mentve Firestore-ba");
        
        // Sikeres regisztráció
        errorElement.classList.remove('show');
        showNotification("Sikeres regisztráció! Automatikusan bejelentkeztetve.");
        
        // Felhasználói adatok beállítása
        currentUserNickname = nickname;
        currentUserRole = role;
        
    } catch (error) {
        console.error("Regisztrációs hiba:", error);
        
        let errorMessage = "Hiba a regisztráció során";
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = "Ez az email cím már használatban van";
        } else if (error.code === 'auth/weak-password') {
            errorMessage = "A jelszó túl gyenge";
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = "Érvénytelen email cím";
        }
        
        errorElement.textContent = errorMessage;
        errorElement.classList.add('show');
    }
}

/* ==========================================================================
   9. ESEMÉNYKEZELŐK BEÁLLÍTÁSA
   ========================================================================== */

/**
 * Összes eseménykezelő beállítása
 */
function setupEventListeners() {
    console.log("Eseménykezelők beállítása...");
    
    // Bejelentkezési űrlap
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Regisztrációs gomb
    const registerBtn = document.getElementById('registerBtn');
    if (registerBtn) {
        registerBtn.addEventListener('click', showRegistrationForm);
    }
    
    // Vissza a bejelentkezéshez gomb
    const backToLoginBtn = document.getElementById('backToLoginBtn');
    if (backToLoginBtn) {
        backToLoginBtn.addEventListener('click', showLoginForm);
    }
    
    // Regisztrációs űrlap
    const registrationForm = document.getElementById('registrationForm');
    if (registrationForm) {
        registrationForm.addEventListener('submit', handleRegistration);
    }
    
    // Kijelentkezés gomb
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
    
    // Chat űrlap
    const chatForm = document.getElementById('chatForm');
    if (chatForm) {
        chatForm.addEventListener('submit', handleChatSubmit);
    }
    
    // Feladat hozzáadása gomb
    const addTaskBtn = document.getElementById('addTaskBtn');
    if (addTaskBtn) {
        addTaskBtn.addEventListener('click', addTask);
    }
    
    // Mikrofon gomb
    const micButton = document.getElementById('micButton');
    if (micButton) {
        micButton.addEventListener('click', toggleVoiceInput);
    }
    
    // TTS kapcsoló gomb
    const ttsToggleBtn = document.getElementById('ttsToggleBtn');
    if (ttsToggleBtn) {
        ttsToggleBtn.addEventListener('click', toggleTTS);
    }
    
    // Kanban keresés
    const kanbanSearchInput = document.getElementById('kanbanSearchInput');
    if (kanbanSearchInput) {
        kanbanSearchInput.addEventListener('input', performKanbanSearch);
    }
    
    // Drag and drop események
    setupDragAndDrop();
    
    // Globális események
    document.addEventListener('click', handleGlobalClicks);
    
    // Billentyűzet események
    document.addEventListener('keydown', handleKeyboardShortcuts);
    
    // Szűrők változásának figyelése
    const periodFilter = document.getElementById('f-period');
    const categoryFilter = document.getElementById('f-category');
    
    if (periodFilter) {
        periodFilter.addEventListener('change', renderTasks);
    }
    
    if (categoryFilter) {
        categoryFilter.addEventListener('change', renderTasks);
    }
    
    console.log("Eseménykezelők sikeresen beállítva");
}

/**
 * Globális kattintás kezelése
 */
function handleGlobalClicks(event) {
    // Szoba részletek modal bezárása
    const roomModal = document.getElementById('room-detail-modal');
    if (roomModal && roomModal.classList.contains('active')) {
        if (event.target === roomModal || event.target.classList.contains('modal-close')) {
            closeRoomDetailModal();
        }
    }
    
    // Feladat modal bezárása
    const taskModal = document.getElementById('task-modal');
    if (taskModal && taskModal.classList.contains('active')) {
        if (event.target === taskModal || event.target.classList.contains('modal-close')) {
            closeTaskModal();
        }
    }
    
    // Jogosultságok modal bezárása
    const permissionsModal = document.getElementById('permissions-modal');
    if (permissionsModal && permissionsModal.classList.contains('active')) {
        if (event.target === permissionsModal || event.target.classList.contains('modal-close')) {
            closePermissionsModal();
        }
    }
    
    // Menü bezárása
    const menuOverlay = document.getElementById('menuOverlay');
    if (menuOverlay && menuOverlay.style.display === 'block') {
        if (event.target === menuOverlay) {
            closeMenu();
        }
    }
}

/**
 * Billentyűparancsok kezelése
 */
function handleKeyboardShortcuts(event) {
    // Escape - modal-ok bezárása
    if (event.key === 'Escape') {
        closeRoomDetailModal();
        closeTaskModal();
        closePermissionsModal();
        closeMenu();
    }
    
    // Ctrl + N - új feladat (ha a note mező nincs fókuszban)
    if (event.ctrlKey && event.key === 'n' && document.activeElement.id !== 'note') {
        event.preventDefault();
        document.getElementById('room')?.focus();
    }
    
    // Ctrl + F - keresés fókusz
    if (event.ctrlKey && event.key === 'f') {
        event.preventDefault();
        document.getElementById('kanbanSearchInput')?.focus();
    }
}

/**
 * Drag and drop események beállítása
 */
function setupDragAndDrop() {
    document.querySelectorAll(".kanban-column").forEach(column => {
        column.addEventListener("dragover", function(e) {
            e.preventDefault();
            this.style.border = "3px dashed var(--primary)";
        });
        
        column.addEventListener("dragleave", function() {
            this.style.border = "3px dashed oklch(90% .05 260 / .5)";
        });
        
        column.addEventListener("drop", function(e) {
            e.preventDefault();
            this.style.border = "3px dashed oklch(90% .05 260 / .5)";
            const taskId = e.dataTransfer.getData("text/plain");
            const status = this.id.replace("col-", "");
            
            if (taskId && ["todo", "prog", "done"].includes(status)) {
                updateTaskStatus(taskId, status);
            }
        });
    });
    
    // Globális drag események
    document.addEventListener("dragstart", function(e) {
        if (e.target.classList.contains("compact-card")) {
            e.dataTransfer.setData("text/plain", e.target.dataset.id);
            e.target.style.opacity = "0.5";
        }
    });
    
    document.addEventListener("dragend", function(e) {
        if (e.target.classList.contains("compact-card")) {
            e.target.style.opacity = "1";
        }
    });
}

/* ==========================================================================
   10. HANGVEZÉRLÉS ÉS TTS (TEXT-TO-SPEECH)
   ========================================================================== */

/**
 * Hangfelismerés inicializálása
 */
function initVoiceRecognition() {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
        console.warn("Hangfelismerés nem támogatott ebben a böngészőben");
        const micButton = document.getElementById('micButton');
        const micStatus = document.getElementById('micStatus');
        
        if (micButton) micButton.style.display = 'none';
        if (micStatus) micStatus.textContent = "Hangfelismerés nem támogatott";
        return;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    
    // Beállítások
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'hu-HU';
    recognition.maxAlternatives = 1;
    
    // Eseménykezelők
    recognition.onstart = function() {
        isListening = true;
        updateMicButton(true);
        updateMicStatus("Hallgat... beszéljen most");
    };
    
    recognition.onresult = function(event) {
        const transcript = event.results[0][0].transcript;
        const noteTextarea = document.getElementById('note');
        
        if (!noteTextarea) return;
        
        const currentText = noteTextarea.value;
        
        if (currentText.length > 0 && !currentText.endsWith(' ') && !currentText.endsWith('\n')) {
            noteTextarea.value = currentText + ' ' + transcript;
        } else {
            noteTextarea.value = currentText + transcript;
        }
        
        updateMicStatus("Diktálás befejezve: " + transcript.substring(0, 50) + 
                       (transcript.length > 50 ? "..." : ""));
        noteTextarea.focus();
        noteTextarea.scrollTop = noteTextarea.scrollHeight;
    };
    
    recognition.onerror = function(event) {
        console.error("Hangfelismerési hiba:", event.error);
        isListening = false;
        updateMicButton(false);
        
        let errorMsg = "Hangfelismerési hiba";
        switch (event.error) {
            case 'no-speech':
                errorMsg = "Nem érzékeltünk beszédet";
                break;
            case 'audio-capture':
                errorMsg = "Nem található mikrofon";
                break;
            case 'not-allowed':
                errorMsg = "Mikrofon hozzáférés megtagadva";
                break;
        }
        
        updateMicStatus(errorMsg);
    };
    
    recognition.onend = function() {
        isListening = false;
        updateMicButton(false);
        if (!recognitionActive) {
            updateMicStatus("Kattintson a mikrofon gombra a diktáláshoz");
        }
    };
    
    console.log("Hangfelismerés inicializálva");
}

/**
 * Hangfelismerés indítása/leállítása
 */
function toggleVoiceInput() {
    if (!recognition) {
        showNotification("Hangfelismerés nem elérhető");
        return;
    }
    
    if (isListening) {
        stopVoiceRecognition();
    } else {
        startVoiceRecognition();
    }
}

/**
 * Hangfelismerés indítása
 */
function startVoiceRecognition() {
    if (!recognition) return;
    
    try {
        recognition.start();
        recognitionActive = true;
        showNotification("Hangfelismerés elindítva");
    } catch (error) {
        console.error("Hiba a hangfelismerés indításakor:", error);
        updateMicStatus("Hiba: " + error.message);
    }
}

/**
 * Hangfelismerés leállítása
 */
function stopVoiceRecognition() {
    if (!recognition) return;
    
    try {
        recognition.stop();
        recognitionActive = false;
    } catch (error) {
        console.error("Hiba a hangfelismerés leállításakor:", error);
    }
}

/**
 * Mikrofon gomb állapotának frissítése
 */
function updateMicButton(listening) {
    const micButton = document.getElementById('micButton');
    if (!micButton) return;
    
    const micIcon = micButton.querySelector('i');
    if (!micIcon) return;
    
    if (listening) {
        micButton.classList.add('listening');
        micIcon.className = 'fas fa-microphone-slash';
        micButton.title = "Kattintson a diktálás leállításához";
    } else {
        micButton.classList.remove('listening');
        micIcon.className = 'fas fa-microphone';
        micButton.title = "Hangalapú diktálás";
    }
}

/**
 * Mikrofon állapot üzenet frissítése
 */
function updateMicStatus(message) {
    const micStatus = document.getElementById('micStatus');
    if (micStatus) {
        micStatus.textContent = message;
    }
}

/**
 * TTS (Text-to-Speech) inicializálása
 */
function initTTS() {
    if (!("speechSynthesis" in window)) {
        console.warn("TTS nem támogatott ebben a böngészőben");
        showNotification("A hangvezérlés nem támogatott ebben a böngészőben", "warning");
        return;
    }
    
    // Hangok betöltése
    const loadVoices = () => {
        const voices = speechSynthesis.getVoices();
        const hungarianVoices = voices.filter(v => v.lang.includes("hu"));
        
        if (hungarianVoices.length > 0) {
            ttsVoice = hungarianVoices[0];
        }
    };
    
    loadVoices();
    
    if (speechSynthesis.getVoices().length === 0) {
        speechSynthesis.onvoiceschanged = loadVoices;
    }
    
    // Beállítások betöltése
    loadTTSSettings();
    
    console.log("TTS rendszer inicializálva");
    
    // Teszt üzenet (késleltetve)
    setTimeout(() => {
        if (ttsEnabled) {
            speakText("TTS rendszer aktiválva");
        }
    }, 1000);
}

/**
 * Szöveg felolvasása
 */
function speakText(text, priority = "normal") {
    if (!ttsEnabled || !("speechSynthesis" in window)) {
        return;
    }
    
    // Előző beszéd leállítása
    speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Beállítások
    if (ttsVoice) utterance.voice = ttsVoice;
    utterance.volume = ttsVolume;
    utterance.rate = ttsRate;
    utterance.pitch = ttsPitch;
    utterance.lang = "hu-HU";
    
    // Prioritás alapján hangbeállítások
    if (priority === "high") {
        utterance.volume = Math.min(1, ttsVolume * 1.5);
    } else if (priority === "urgent") {
        utterance.volume = 1;
        utterance.rate = 1.2;
    }
    
    utterance.onerror = null; // Hiba kezelés kikapcsolása
    
    try {
        speechSynthesis.speak(utterance);
    } catch (error) {
        console.error("TTS hiba:", error);
    }
}

/**
 * TTS be/kapcsolása
 */
function toggleTTS() {
    ttsEnabled = !ttsEnabled;
    localStorage.setItem("tts_enabled", ttsEnabled.toString());
    
    if (ttsEnabled) {
        showNotification("Hangértesítések bekapcsolva");
        speakText("Hangértesítések bekapcsolva");
    } else {
        showNotification("Hangértesítések kikapcsolva");
    }
    
    updateTTSButtons();
}

/**
 * TTS beállítások mentése
 */
function saveTTSSettings() {
    const settings = {
        enabled: ttsEnabled,
        volume: ttsVolume,
        rate: ttsRate,
        pitch: ttsPitch
    };
    localStorage.setItem("tts_settings", JSON.stringify(settings));
}

/**
 * TTS beállítások betöltése
 */
function loadTTSSettings() {
    const saved = localStorage.getItem("tts_settings");
    
    if (saved) {
        try {
            const settings = JSON.parse(saved);
            ttsEnabled = settings.enabled === undefined ? true : settings.enabled;
            ttsVolume = settings.volume || 1;
            ttsRate = settings.rate || 1;
            ttsPitch = settings.pitch || 1;
        } catch (error) {
            console.error("Hiba a TTS beállítások betöltésekor:", error);
            resetTTSSettings();
        }
    } else {
        resetTTSSettings();
    }
    
    updateTTSButtons();
}

/**
 * TTS beállítások visszaállítása
 */
function resetTTSSettings() {
    ttsEnabled = true;
    ttsVolume = 1;
    ttsRate = 1;
    ttsPitch = 1;
}

/**
 * TTS gombok frissítése
 */
function updateTTSButtons() {
    const button = document.getElementById("ttsToggleBtn");
    const text = document.getElementById("ttsToggleText");
    
    if (button && text) {
        if (ttsEnabled) {
            button.innerHTML = '<i class="fas fa-volume-up"></i> <span id="ttsToggleText">TTS: Be</span>';
            text.textContent = "TTS: Be";
        } else {
            button.innerHTML = '<i class="fas fa-volume-mute"></i> <span id="ttsToggleText">TTS: Ki</span>';
            text.textContent = "TTS: Ki";
        }
    }
}

/* ==========================================================================
   11. CHAT RENDSZER
   ========================================================================== */

/**
 * Chat inicializálása
 */
function initChat() {
    // Korábbi listener leállítása
    if (unsubscribeChat) {
        unsubscribeChat();
    }
    
    try {
        // Új real-time listener
        unsubscribeChat = db.collection("messages")
            .orderBy("createdAt", "asc")
            .limit(100)
            .onSnapshot((snapshot) => {
                const chatMessages = document.getElementById("chatMessages");
                if (!chatMessages) return;
                
                chatMessages.innerHTML = "";
                
                snapshot.forEach(async (doc) => {
                    const message = { id: doc.id, ...doc.data() };
                    await renderMessage(message);
                });
                
                // Görgetés aljára
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }, (error) => {
                console.error("Chat listener hiba:", error);
                // Próbáljuk újra 5 másodperc múlva
                if (isOnline) {
                    setTimeout(initChat, 5000);
                }
            });
    } catch (error) {
        console.error("Chat inicializálási hiba:", error);
    }
}

/**
 * Üzenet megjelenítése
 */
async function renderMessage(message) {
    const chatMessages = document.getElementById("chatMessages");
    if (!chatMessages) return;
    
    const messageElement = document.createElement("div");
    const isOwn = message.senderId === currentUser?.uid;
    
    // Feladónév lekérdezése
    let senderName = message.senderNickname;
    if (!senderName && message.senderId) {
        senderName = await getUserNickname(message.senderId);
    }
    
    // CSS osztályok
    messageElement.className = "message-bubble " + (isOwn ? "own" : "other");
    
    // Idő formázása
    let timeString = "";
    if (message.createdAt && message.createdAt.toDate) {
        const date = message.createdAt.toDate();
        timeString = date.getHours() + ":" + 
                    String(date.getMinutes()).padStart(2, "0");
    }
    
    // Törlés gomb (admin vagy saját üzenet)
    let deleteButton = "";
    if (currentUserRole === ROLES.ADMIN || message.senderId === currentUser?.uid) {
        deleteButton = `
            <button class="message-delete-btn" onclick="deleteMessage('${message.id}')" title="Üzenet törlése">
                <i class="fas fa-trash"></i>
            </button>
        `;
    }
    
    // HTML összeállítása
    messageElement.innerHTML = `
        <div class="message-info">
            ${isOwn ? "Én" : senderName} • ${timeString}
            ${deleteButton}
        </div>
        <div>${message.text}</div>
    `;
    
    chatMessages.appendChild(messageElement);
}

/**
 * Chat üzenet küldése
 */
function handleChatSubmit(event) {
    event.preventDefault();
    
    const messageInput = document.getElementById("messageInput");
    if (!messageInput || !currentUser) return;
    
    const message = messageInput.value.trim();
    if (!message) return;
    
    db.collection("messages").add({
        text: message,
        senderId: currentUser.uid,
        senderNickname: currentUserNickname,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        messageInput.value = "";
    }).catch((error) => {
        console.error("Hiba az üzenet küldésekor:", error);
        showNotification("Nem sikerült elküldeni az üzenetet", "error");
    });
}

/**
 * Üzenet törlése
 */
async function deleteMessage(messageId) {
    if (!confirm("Biztosan törli ezt az üzenetet?")) {
        return;
    }
    
    try {
        const messageDoc = await db.collection("messages").doc(messageId).get();
        if (!messageDoc.exists) return;
        
        const messageData = messageDoc.data();
        
        // Ellenőrzés: csak admin vagy saját üzenet törölhető
        if (currentUserRole !== ROLES.ADMIN && 
            messageData.senderId !== currentUser?.uid) {
            showNotification("Csak saját üzenetét törölheti!");
            return;
        }
        
        await db.collection("messages").doc(messageId).delete();
        showNotification("Üzenet törölve");
        
    } catch (error) {
        console.error("Hiba az üzenet törlésekor:", error);
        showNotification("Hiba az üzenet törlésekor", "error");
    }
}

/* ==========================================================================
   12. SZOBÁK KEZELÉSE (ROOM MANAGEMENT)
   ========================================================================== */

/**
 * Szobák inicializálása
 */
function initRooms() {
    try {
        // Real-time listener szobákhoz
        db.collection("rooms").onSnapshot((snapshot) => {
            rooms = [];
            
            snapshot.forEach((doc) => {
                const roomData = doc.data();
                rooms.push({
                    id: doc.id,
                    number: roomData.number,
                    status: roomData.status || "green",
                    notes: roomData.notes || "",
                    longTermTasks: roomData.longTermTasks || "",
                    inventory: roomData.inventory || "",
                    bathroomNotes: roomData.bathroomNotes || "",
                    bathroomLongTermTasks: roomData.bathroomLongTermTasks || "",
                    bathroomInventory: roomData.bathroomInventory || "",
                    heliosLastCleaned: roomData.heliosLastCleaned || null,
                    fanCoilLastCleaned: roomData.fanCoilLastCleaned || null,
                    facilityName: roomData.facilityName || "",
                    facilityIcon: roomData.facilityIcon || "fa-building",
                    lastUpdated: roomData.lastUpdated?.toDate ? 
                               roomData.lastUpdated.toDate() : 
                               new Date(roomData.lastUpdated)
                });
            });
            
            // Szobák rendezése a definiált sorrend szerint
            rooms.sort((a, b) => {
                const indexA = ROOM_NUMBERS.indexOf(a.number);
                const indexB = ROOM_NUMBERS.indexOf(b.number);
                return indexA - indexB;
            });
            
            // Grid renderelése
            renderRoomGrid();
            
            // Ha éppen nyitva van a szoba részletek modal, frissítsük
            if (currentRoomDetail && 
                document.getElementById("room-detail-modal")?.classList.contains("active")) {
                const updatedRoom = rooms.find(r => r.id === currentRoomDetail.id);
                if (updatedRoom) {
                    openRoomDetailModal(updatedRoom);
                }
            }
            
        }, (error) => {
            console.error("Szoba listener hiba:", error);
            // Próbáljuk újra 5 másodperc múlva
            if (isOnline) {
                setTimeout(initRooms, 5000);
            }
        });
    } catch (error) {
        console.error("Szobák inicializálási hiba:", error);
    }
}

/**
 * Szoba grid renderelése
 */
function renderRoomGrid() {
    const roomGrid = document.getElementById("roomGrid");
    if (!roomGrid) return;
    
    roomGrid.innerHTML = "";
    
    rooms.forEach((room) => {
        const roomElement = document.createElement("div");
        roomElement.className = `room-item room-status-${room.status}`;
        
        // Speciális szobák jelölése
        if (SUITE_ROOMS.includes(room.number)) {
            roomElement.classList.add("suite-room");
        }
        
        if (room.number === ACCESSIBLE_ROOM) {
            roomElement.classList.add("accessible-room");
        }
        
        if (FACILITY_ROOMS.includes(room.number)) {
            roomElement.classList.add("facility-room");
            roomElement.dataset.facility = room.number;
        }
        
        // Kattintás esemény
        roomElement.onclick = () => openRoomDetailModal(room);
        
        // Tartalom
        roomElement.innerHTML = `
            <div class="room-number">${room.number}</div>
            <div class="room-status-indicator"></div>
        `;
        
        roomGrid.appendChild(roomElement);
    });
}

/**
 * Szoba részletek modal megnyitása
 */
function openRoomDetailModal(room) {
    currentRoomDetail = room;
    
    const modal = document.getElementById("room-detail-modal");
    const title = document.getElementById("room-detail-title");
    const number = document.getElementById("room-detail-number");
    const icon = document.getElementById("room-detail-icon");
    const body = document.getElementById("room-detail-body");
    
    if (!modal || !title || !number || !icon || !body) return;
    
    // Cím és ikon beállítása
    number.textContent = room.number;
    
    if (FACILITY_ROOMS.includes(room.number)) {
        const facility = FACILITY_DETAILS[room.number];
        title.textContent = facility?.name || room.number;
        icon.className = `fas ${facility?.icon || "fa-building"}`;
        renderFacilityRoomDetails(body, room);
    } else {
        title.textContent = "Szoba";
        icon.className = "fas fa-door-closed";
        renderNormalRoomDetails(body, room);
    }
    
    modal.classList.add("active");
}

/**
 * Normál szoba részletek renderelése
 */
function renderNormalRoomDetails(container, room) {
    container.innerHTML = `
        <div class="room-section">
            <div class="section-title"><i class="fas fa-flag"></i> Szoba állapota</div>
            <div class="room-status-buttons" id="room-status-buttons">
                <button class="status-btn status-btn-green ripple" onclick="changeRoomStatus('green')" data-status="green">
                    <i class="fas fa-check-circle"></i><span>Minden rendben</span>
                </button>
                <button class="status-btn status-btn-lilac ripple" onclick="changeRoomStatus('lilac')" data-status="lilac">
                    <i class="fas fa-broom"></i><span>Takarítás alatt</span>
                </button>
                <button class="status-btn status-btn-orange ripple" onclick="changeRoomStatus('orange')" data-status="orange">
                    <i class="fas fa-tools"></i><span>Karbantartás alatt</span>
                </button>
                <button class="status-btn status-btn-red ripple" onclick="changeRoomStatus('red')" data-status="red">
                    <i class="fas fa-hammer"></i><span>Javítás alatt</span>
                </button>
            </div>
        </div>
        
        <div class="room-sections-grid">
            <div class="room-section room-section-room">
                <div class="section-title"><i class="fas fa-bed"></i> Szoba</div>
                <div class="section-content">
                    <div class="form-group">
                        <label class="form-label">Megjegyzés</label>
                        <textarea id="room-notes" class="section-textarea" placeholder="Szoba megjegyzései...">${room.notes || ""}</textarea>
                        <button class="btn" style="background:var(--primary);margin-top:12px;width:100%" onclick="saveRoomNotes()">
                            <i class="fas fa-save"></i> Mentés
                        </button>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Hosszú távú feladatok</label>
                        <textarea id="room-long-term-tasks" class="section-textarea" placeholder="Hosszú távú feladatok a szobához...">${room.longTermTasks || ""}</textarea>
                        <button class="btn" style="background:var(--secondary);margin-top:12px;width:100%" onclick="saveRoomLongTermTasks()">
                            <i class="fas fa-tasks"></i> Mentés
                        </button>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Leltárkészlet</label>
                        <textarea id="room-inventory" class="section-textarea" placeholder="Szoba leltárkészlete...">${room.inventory || ""}</textarea>
                        <button class="btn" style="background:var(--info);margin-top:12px;width:100%" onclick="saveRoomInventory()">
                            <i class="fas fa-clipboard-list"></i> Mentés
                        </button>
                    </div>
                </div>
            </div>
            
            <div class="room-section room-section-bathroom">
                <div class="section-title"><i class="fas fa-bath"></i> Fürdőszoba</div>
                <div class="section-content">
                    <div class="form-group">
                        <label class="form-label">Megjegyzés</label>
                        <textarea id="bathroom-notes" class="section-textarea" placeholder="Fürdőszoba megjegyzései...">${room.bathroomNotes || ""}</textarea>
                        <button class="btn" style="background:var(--primary);margin-top:12px;width:100%" onclick="saveBathroomNotes()">
                            <i class="fas fa-save"></i> Mentés
                        </button>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Hosszú távú feladatok</label>
                        <textarea id="bathroom-long-term-tasks" class="section-textarea" placeholder="Hosszú távú feladatok a fürdőszobához...">${room.bathroomLongTermTasks || ""}</textarea>
                        <button class="btn" style="background:var(--secondary);margin-top:12px;width:100%" onclick="saveBathroomLongTermTasks()">
                            <i class="fas fa-tasks"></i> Mentés
                        </button>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Leltárkészlet</label>
                        <textarea id="bathroom-inventory" class="section-textarea" placeholder="Fürdőszoba leltárkészlete...">${room.bathroomInventory || ""}</textarea>
                        <button class="btn" style="background:var(--info);margin-top:12px;width:100%" onclick="saveBathroomInventory()">
                            <i class="fas fa-clipboard-list"></i> Mentés
                        </button>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="room-section maintenance-section">
            <div class="section-title"><i class="fas fa-calendar-alt"></i> Időszakos karbantartási feladatok</div>
            
            <div class="maintenance-item">
                <div class="maintenance-header">
                    <div class="maintenance-title">Helios fürdőszoba ventillátor filter tisztítása</div>
                    <div class="maintenance-status" id="helios-status">Betöltés...</div>
                </div>
                <div class="maintenance-info">
                    <div class="last-cleaned">
                        <strong>Utoljára tisztítva:</strong>
                        <span id="helios-last-cleaned">-</span>
                    </div>
                    <div class="date-selector">
                        <input type="date" id="helios-cleaning-date" style="flex:1">
                        <button class="btn" style="background:var(--primary);padding:10px 16px" onclick="updateHeliosCleaning()">
                            <i class="fas fa-calendar-check"></i> Frissítés
                        </button>
                    </div>
                </div>
            </div>
            
            <div class="maintenance-item">
                <div class="maintenance-header">
                    <div class="maintenance-title">Fan-coil filter tisztítása</div>
                    <div class="maintenance-status" id="fancoil-status">Betöltés...</div>
                </div>
                <div class="maintenance-info">
                    <div class="last-cleaned">
                        <strong>Utoljára tisztítva:</strong>
                        <span id="fancoil-last-cleaned">-</span>
                    </div>
                    <div class="date-selector">
                        <input type="date" id="fancoil-cleaning-date" style="flex:1">
                        <button class="btn" style="background:var(--primary);padding:10px 16px" onclick="updateFanCoilCleaning()">
                            <i class="fas fa-calendar-check"></i> Frissítés
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Aktív állapot gomb beállítása
    document.querySelectorAll(".status-btn").forEach(btn => {
        btn.classList.remove("active");
        if (btn.dataset.status === room.status) {
            btn.classList.add("active");
        }
    });
    
    // Karbantartási dátumok frissítése
    updateMaintenanceDates(room);
}

/**
 * Létesítmény szoba részletek renderelése
 */
function renderFacilityRoomDetails(container, room) {
    container.innerHTML = `
        <div class="room-section">
            <div class="section-title">
                <i class="fas fa-flag"></i> ${FACILITY_DETAILS[room.number]?.name || room.number} állapota
            </div>
            <div class="room-status-buttons" id="room-status-buttons">
                <button class="status-btn status-btn-green ripple" onclick="changeRoomStatus('green')" data-status="green">
                    <i class="fas fa-check-circle"></i><span>Minden rendben</span>
                </button>
                <button class="status-btn status-btn-lilac ripple" onclick="changeRoomStatus('lilac')" data-status="lilac">
                    <i class="fas fa-broom"></i><span>Takarítás alatt</span>
                </button>
                <button class="status-btn status-btn-orange ripple" onclick="changeRoomStatus('orange')" data-status="orange">
                    <i class="fas fa-tools"></i><span>Karbantartás alatt</span>
                </button>
                <button class="status-btn status-btn-red ripple" onclick="changeRoomStatus('red')" data-status="red">
                    <i class="fas fa-hammer"></i><span>Javítás alatt</span>
                </button>
            </div>
        </div>
        
        <div class="single-section-container">
            <div class="single-section-item">
                <h4><i class="fas fa-sticky-note"></i> Megjegyzés</h4>
                <textarea id="facility-notes" class="single-section-textarea" placeholder="Megjegyzések...">${room.notes || ""}</textarea>
                <button class="btn" style="background:var(--primary);margin-top:12px;width:100%" onclick="saveFacilityNotes()">
                    <i class="fas fa-save"></i> Mentés
                </button>
            </div>
            
            <div class="single-section-item">
                <h4><i class="fas fa-tasks"></i> Hosszú távú feladatok</h4>
                <textarea id="facility-long-term-tasks" class="single-section-textarea" placeholder="Hosszú távú feladatok...">${room.longTermTasks || ""}</textarea>
                <button class="btn" style="background:var(--secondary);margin-top:12px;width:100%" onclick="saveFacilityLongTermTasks()">
                    <i class="fas fa-tasks"></i> Mentés
                </button>
            </div>
            
            <div class="single-section-item">
                <h4><i class="fas fa-clipboard-list"></i> Leltárkészlet</h4>
                <textarea id="facility-inventory" class="single-section-textarea" placeholder="Leltárkészlet...">${room.inventory || ""}</textarea>
                <button class="btn" style="background:var(--info);margin-top:12px;width:100%" onclick="saveFacilityInventory()">
                    <i class="fas fa-clipboard-list"></i> Mentés
                </button>
            </div>
        </div>
    `;
    
    // Aktív állapot gomb beállítása (késleltetve)
    setTimeout(() => {
        document.querySelectorAll(".status-btn").forEach(btn => {
            btn.classList.remove("active");
            if (btn.dataset.status === room.status) {
                btn.classList.add("active");
            }
        });
    }, 100);
}

/**
 * Szoba részletek modal bezárása
 */
function closeRoomDetailModal() {
    const modal = document.getElementById("room-detail-modal");
    if (modal) {
        modal.classList.remove("active");
    }
    currentRoomDetail = null;
}

/**
 * Szoba állapotának módosítása
 */
function changeRoomStatus(status) {
    if (!currentRoomDetail) return;
    
    db.collection("rooms").doc(currentRoomDetail.id).update({
        status: status,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        // UI frissítése
        const container = document.getElementById("room-detail-body");
        if (container) {
            container.querySelectorAll(".status-btn").forEach(btn => {
                btn.classList.remove("active");
                if (btn.dataset.status === status) {
                    btn.classList.add("active");
                }
            });
        }
        
        showNotification(`Szoba állapota frissítve: ${getRoomStatusText(status)}`);
        
    }).catch((error) => {
        console.error("Hiba a szoba állapotának frissítésekor:", error);
        showNotification("Hiba a frissítés során", "error");
    });
}

/**
 * Szoba állapot szöveges leírása
 */
function getRoomStatusText(status) {
    const statusTexts = {
        green: "Zöld - Minden rendben",
        lilac: "Akáclila - Takarítás alatt",
        orange: "Narancssárga - Karbantartás alatt",
        red: "Piros - Javítás és felújítás alatt"
    };
    
    return statusTexts[status] || "Ismeretlen";
}

// Szoba mentési funkciók

function saveRoomNotes() {
    if (!currentRoomDetail) return;
    const notes = document.getElementById("room-notes")?.value.trim() || "";
    db.collection("rooms").doc(currentRoomDetail.id).update({
        notes: notes,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => showNotification("Szoba megjegyzések mentve"));
}

function saveRoomLongTermTasks() {
    if (!currentRoomDetail) return;
    const tasks = document.getElementById("room-long-term-tasks")?.value.trim() || "";
    db.collection("rooms").doc(currentRoomDetail.id).update({
        longTermTasks: tasks,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => showNotification("Szoba hosszú távú feladatok mentve"));
}

function saveRoomInventory() {
    if (!currentRoomDetail) return;
    const inventory = document.getElementById("room-inventory")?.value.trim() || "";
    db.collection("rooms").doc(currentRoomDetail.id).update({
        inventory: inventory,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => showNotification("Szoba leltárkészlet mentve"));
}

function saveBathroomNotes() {
    if (!currentRoomDetail) return;
    const notes = document.getElementById("bathroom-notes")?.value.trim() || "";
    db.collection("rooms").doc(currentRoomDetail.id).update({
        bathroomNotes: notes,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => showNotification("Fürdőszoba megjegyzések mentve"));
}

function saveBathroomLongTermTasks() {
    if (!currentRoomDetail) return;
    const tasks = document.getElementById("bathroom-long-term-tasks")?.value.trim() || "";
    db.collection("rooms").doc(currentRoomDetail.id).update({
        bathroomLongTermTasks: tasks,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => showNotification("Fürdőszoba hosszú távú feladatok mentve"));
}

function saveBathroomInventory() {
    if (!currentRoomDetail) return;
    const inventory = document.getElementById("bathroom-inventory")?.value.trim() || "";
    db.collection("rooms").doc(currentRoomDetail.id).update({
        bathroomInventory: inventory,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => showNotification("Fürdőszoba leltárkészlet mentve"));
}

function saveFacilityNotes() {
    if (!currentRoomDetail) return;
    const notes = document.getElementById("facility-notes")?.value.trim() || "";
    db.collection("rooms").doc(currentRoomDetail.id).update({
        notes: notes,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => showNotification("Megjegyzések mentve"));
}

function saveFacilityLongTermTasks() {
    if (!currentRoomDetail) return;
    const tasks = document.getElementById("facility-long-term-tasks")?.value.trim() || "";
    db.collection("rooms").doc(currentRoomDetail.id).update({
        longTermTasks: tasks,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => showNotification("Hosszú távú feladatok mentve"));
}

function saveFacilityInventory() {
    if (!currentRoomDetail) return;
    const inventory = document.getElementById("facility-inventory")?.value.trim() || "";
    db.collection("rooms").doc(currentRoomDetail.id).update({
        inventory: inventory,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => showNotification("Leltárkészlet mentve"));
}

/* ==========================================================================
   13. KARBANTARTÁSI LOGIKA (MAINTENANCE)
   ========================================================================== */

/**
 * Karbantartási dátumok frissítése
 */
function updateMaintenanceDates(room) {
    // Helios dátum
    if (room.heliosLastCleaned) {
        const date = room.heliosLastCleaned.toDate ? 
                    room.heliosLastCleaned.toDate() : 
                    new Date(room.heliosLastCleaned);
        
        const lastCleanedElement = document.getElementById("helios-last-cleaned");
        const dateInputElement = document.getElementById("helios-cleaning-date");
        
        if (lastCleanedElement) {
            lastCleanedElement.textContent = date.toLocaleDateString("hu-HU");
        }
        
        if (dateInputElement) {
            dateInputElement.value = date.toISOString().split("T")[0];
        }
        
        updateMaintenanceStatus("helios", Math.floor((new Date() - date) / 86400000));
    } else {
        const lastCleanedElement = document.getElementById("helios-last-cleaned");
        const dateInputElement = document.getElementById("helios-cleaning-date");
        const statusElement = document.getElementById("helios-status");
        
        if (lastCleanedElement) lastCleanedElement.textContent = "-";
        if (dateInputElement) dateInputElement.value = "";
        if (statusElement) {
            statusElement.textContent = "Nincs adat";
            statusElement.className = "maintenance-status";
        }
    }
    
    // Fan-coil dátum
    if (room.fanCoilLastCleaned) {
        const date = room.fanCoilLastCleaned.toDate ? 
                    room.fanCoilLastCleaned.toDate() : 
                    new Date(room.fanCoilLastCleaned);
        
        const lastCleanedElement = document.getElementById("fancoil-last-cleaned");
        const dateInputElement = document.getElementById("fancoil-cleaning-date");
        
        if (lastCleanedElement) {
            lastCleanedElement.textContent = date.toLocaleDateString("hu-HU");
        }
        
        if (dateInputElement) {
            dateInputElement.value = date.toISOString().split("T")[0];
        }
        
        updateMaintenanceStatus("fancoil", Math.floor((new Date() - date) / 86400000));
    } else {
        const lastCleanedElement = document.getElementById("fancoil-last-cleaned");
        const dateInputElement = document.getElementById("fancoil-cleaning-date");
        const statusElement = document.getElementById("fancoil-status");
        
        if (lastCleanedElement) lastCleanedElement.textContent = "-";
        if (dateInputElement) dateInputElement.value = "";
        if (statusElement) {
            statusElement.textContent = "Nincs adat";
            statusElement.className = "maintenance-status";
        }
    }
}

/**
 * Karbantartási állapot frissítése
 */
function updateMaintenanceStatus(type, days) {
    const statusElement = document.getElementById(`${type}-status`);
    if (!statusElement) return;
    
    if (days <= 30) {
        statusElement.textContent = "Zöld - frissen tisztítva";
        statusElement.className = "maintenance-status status-green";
    } else if (days <= 60) {
        statusElement.textContent = "Narancs - 1 hónapja tisztítva";
        statusElement.className = "maintenance-status status-orange";
    } else {
        statusElement.textContent = "Piros - 2 hónapja tisztítva";
        statusElement.className = "maintenance-status status-red";
    }
}

/**
 * Helios tisztítási dátum frissítése
 */
function updateHeliosCleaning() {
    if (!currentRoomDetail) return;
    
    const dateInput = document.getElementById("helios-cleaning-date");
    if (!dateInput || !dateInput.value) {
        showNotification("Kérjük, válasszon dátumot!", "warning");
        return;
    }
    
    const date = new Date(dateInput.value);
    
    db.collection("rooms").doc(currentRoomDetail.id).update({
        heliosLastCleaned: date,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        updateMaintenanceStatus("helios", Math.floor((new Date() - date) / 86400000));
        showNotification("Helios filter tisztítási dátum frissítve");
    }).catch((error) => {
        console.error("Hiba a Helios dátum frissítésekor:", error);
        showNotification("Hiba a frissítés során", "error");
    });
}

/**
 * Fan-coil tisztítási dátum frissítése
 */
function updateFanCoilCleaning() {
    if (!currentRoomDetail) return;
    
    const dateInput = document.getElementById("fancoil-cleaning-date");
    if (!dateInput || !dateInput.value) {
        showNotification("Kérjük, válasszon dátumot!", "warning");
        return;
    }
    
    const date = new Date(dateInput.value);
    
    db.collection("rooms").doc(currentRoomDetail.id).update({
        fanCoilLastCleaned: date,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        updateMaintenanceStatus("fancoil", Math.floor((new Date() - date) / 86400000));
        showNotification("Fan-coil filter tisztítási dátum frissítve");
    }).catch((error) => {
        console.error("Hiba a Fan-coil dátum frissítésekor:", error);
        showNotification("Hiba a frissítés során", "error");
    });
}

/* ==========================================================================
   14. FELADATKEZELŐ RENDSZER (TASK/KANBAN)
   ========================================================================== */

/**
 * Feladatok inicializálása
 */
function initTasks() {
    // Korábbi listener leállítása
    if (unsubscribeTasks) {
        unsubscribeTasks();
    }
    
    try {
        // Új real-time listener
        unsubscribeTasks = db.collection("tasks")
            .orderBy("created", "desc")
            .onSnapshot(async (snapshot) => {
                const promises = [];
                tasks = [];
                
                snapshot.forEach(async (doc) => {
                    const task = { id: doc.id, ...doc.data() };
                    
                    // Felhasználó nevek lekérdezése
                    const nicknamePromise = getUserNickname(task.userId)
                        .then(nickname => {
                            task.userNickname = nickname;
                        });
                    promises.push(nicknamePromise);
                    
                    if (task.assignedTo) {
                        const assignedPromise = getUserNickname(task.assignedTo)
                            .then(nickname => {
                                task.assignedToName = nickname;
                            });
                        promises.push(assignedPromise);
                    }
                    
                    tasks.push(task);
                    
                    // Hozzászólások inicializálása
                    initTaskComments(doc.id);
                });
                
                // Várjuk meg az összes név lekérdezést
                await Promise.all(promises);
                
                // Feladatok renderelése
                renderTasks();
                
            }, (error) => {
                console.error("Task listener hiba:", error);
                // Próbáljuk újra 5 másodperc múlva
                if (isOnline) {
                    setTimeout(initTasks, 5000);
                }
            });
    } catch (error) {
        console.error("Feladatok inicializálási hiba:", error);
    }
}

/**
 * Feladat hozzászólások inicializálása
 */
function initTaskComments(taskId) {
    // Korábbi listener leállítása
    if (unsubscribeComments[taskId]) {
        unsubscribeComments[taskId]();
    }
    
    try {
        // Új real-time listener
        unsubscribeComments[taskId] = db.collection("tasks")
            .doc(taskId)
            .collection("comments")
            .orderBy("createdAt", "asc")
            .onSnapshot((snapshot) => {
                comments[taskId] = [];
                
                snapshot.forEach((doc) => {
                    const comment = { id: doc.id, ...doc.data() };
                    comments[taskId].push(comment);
                });
                
                // Komment indikátor frissítése
                updateTaskCommentIndicator(taskId);
                
                // Ha éppen nyitva van a feladat modal, frissítsük a kommenteket
                if (currentTaskId === taskId && 
                    document.getElementById("task-modal")?.classList.contains("active")) {
                    renderComments(taskId);
                }
                
            }, (error) => {
                console.error(`Comment listener hiba (${taskId}):`, error);
            });
    } catch (error) {
        console.error(`Komment inicializálási hiba (${taskId}):`, error);
    }
}

/**
 * Feladatok renderelése (szűréssel)
 */
function renderTasks() {
    // Aktuális szűrők lekérdezése
    const periodFilter = document.getElementById("f-period");
    const categoryFilter = document.getElementById("f-category");
    
    currentFilter = periodFilter ? periodFilter.value : "all";
    currentCategory = categoryFilter ? categoryFilter.value : "all";
    
    const today = new Date();
    let filteredTasks = tasks.filter(task => {
        // Csak érvényes státuszú feladatok
        if (!["todo", "prog", "done"].includes(task.status)) {
            return false;
        }
        
        // Szűrés időszakra
        switch (currentFilter) {
            case "today":
                if (!task.created) return false;
                const createdDate = task.created.toDate ? 
                                  task.created.toDate() : 
                                  new Date(task.created);
                return createdDate.toDateString() === today.toDateString();
                
            case "week":
                if (!task.created) return false;
                const weekAgo = new Date(today - 604800000);
                const taskDate = task.created.toDate ? 
                               task.created.toDate() : 
                               new Date(task.created);
                return taskDate >= weekAgo;
                
            case "urgent":
                return task.prio === 5;
                
            case "my":
                return task.userId === currentUser?.uid || 
                       task.assignedTo === currentUser?.uid;
                
            case "withComments":
                return comments[task.id] && comments[task.id].length > 0;
                
            case "unassigned":
                return !task.assignedTo;
                
            default:
                return true;
        }
    });
    
    // Kategória szűrés
    if (currentCategory !== "all") {
        filteredTasks = filteredTasks.filter(task => task.category === currentCategory);
    }
    
    // Keresés szűrés
    if (currentKanbanSearchQuery) {
        const query = currentKanbanSearchQuery.toLowerCase();
        filteredTasks = filteredTasks.filter(task =>
            (task.room && task.room.toLowerCase().includes(query)) ||
            (task.note && task.note.toLowerCase().includes(query)) ||
            (task.category && task.category.toLowerCase().includes(query)) ||
            (task.userNickname && task.userNickname.toLowerCase().includes(query)) ||
            (task.assignedToName && task.assignedToName.toLowerCase().includes(query))
        );
    }
    
    // Rendezés: prioritás (csökkenő), majd dátum (csökkenő)
    filteredTasks.sort((a, b) => {
        if (b.prio !== a.prio) {
            return b.prio - a.prio;
        }
        
        const dateA = a.created?.toDate ? a.created.toDate() : new Date(a.created);
        const dateB = b.created?.toDate ? b.created.toDate() : new Date(b.created);
        return dateB - dateA;
    });
    
    // Oszlopok frissítése
    updateColumn("todo", filteredTasks.filter(t => t.status === "todo"));
    updateColumn("prog", filteredTasks.filter(t => t.status === "prog"));
    updateColumn("done", filteredTasks.filter(t => t.status === "done"));
    
    // Számlálók frissítése
    updateColumnCounts();
}

/**
 * Kanban oszlop frissítése
 */
function updateColumn(columnId, tasksList) {
    const container = document.getElementById(`list-${columnId}`);
    if (!container) return;
    
    container.innerHTML = "";
    
    tasksList.forEach(task => {
        container.appendChild(createTaskCard(task));
    });
}

/**
 * Feladat kártya létrehozása
 */
function createTaskCard(task) {
    const card = document.createElement("div");
    card.className = `compact-card prio-${task.prio}`;
    card.dataset.id = task.id;
    card.draggable = true;
    
    // Kattintás esemény (kivéve select elemekre)
    card.addEventListener("click", (e) => {
        if (!e.target.closest("select")) {
            showTaskModal(task);
        }
    });
    
    // Drag and drop események
    card.ondragstart = (e) => {
        e.dataTransfer.setData("text/plain", task.id);
        card.classList.add("dragging");
    };
    
    card.ondragend = () => {
        card.classList.remove("dragging");
    };
    
    // Kategória ikon
    const categoryIcon = CATEGORY_ICONS[task.category] || CATEGORY_ICONS.other;
    
    // Prioritás szöveges leírása
    const priorityText = getPriorityText(task.prio);
    
    // Kommentszám
    const taskComments = comments[task.id] || [];
    
    // HTML tartalom
    card.innerHTML = `
        <div class="card-content">
            <div class="room-badge">${task.room}</div>
            <div class="category-icon">${categoryIcon}</div>
            <div class="priority-badge">${priorityText}</div>
        </div>
    `;
    
    // Komment indikátor hozzáadása
    if (taskComments.length > 0) {
        const commentIndicator = document.createElement("div");
        commentIndicator.className = "comment-indicator";
        commentIndicator.title = `${taskComments.length} hozzászólás`;
        commentIndicator.textContent = taskComments.length;
        card.appendChild(commentIndicator);
    }
    
    return card;
}

/**
 * Oszlop számlálók frissítése
 */
function updateColumnCounts() {
    const counts = {
        todo: tasks.filter(t => t.status === "todo").length,
        prog: tasks.filter(t => t.status === "prog").length,
        done: tasks.filter(t => t.status === "done").length
    };
    
    Object.keys(counts).forEach(column => {
        const el = document.getElementById(`count-${column}`);
        if (el) {
            el.textContent = counts[column];
        }
    });
}

/**
 * Új feladat hozzáadása
 */
function addTask() {
    const roomInput = document.getElementById("room");
    const noteInput = document.getElementById("note");
    const categorySelect = document.getElementById("category");
    const prioSelect = document.getElementById("prio");
    
    if (!roomInput || !noteInput || !categorySelect || !prioSelect) {
        showNotification("Hiba a feladat hozzáadásakor", "error");
        return;
    }
    
    const room = roomInput.value.trim();
    const note = noteInput.value.trim();
    const category = categorySelect.value;
    const prio = parseInt(prioSelect.value);
    
    // Validáció
    if (!room) {
        showNotification("Kérjük, adja meg a szoba számát!", "warning");
        roomInput.focus();
        return;
    }
    
    if (!note) {
        showNotification("Kérjük, adja meg a feladat leírását!", "warning");
        noteInput.focus();
        return;
    }
    
    // Feladat adatai
    const taskData = {
        room: room,
        note: note,
        category: category,
        prio: prio,
        status: "todo",
        created: firebase.firestore.FieldValue.serverTimestamp(),
        updated: firebase.firestore.FieldValue.serverTimestamp(),
        userId: currentUser.uid,
        userNickname: currentUserNickname,
        userRole: currentUserRole,
        assignedTo: "",
        dueDate: null,
        completed: null
    };
    
    // Firebase-be mentés
    db.collection("tasks").add(taskData)
        .then(() => {
            // Beviteli mezők törlése
            clearInputs();
            
            // Értesítés
            showNotification(`Feladat hozzáadva: ${room}. szoba`);
            
            // TTS értesítés
            if (ttsEnabled) {
                speakText(`Új feladat: ${room} szoba, ${getPriorityText(prio)} prioritás`);
            }
            
            // Chat értesítés
            db.collection("messages").add({
                text: `Új feladat: ${room}. szoba (${getPriorityText(prio)}) - ${currentUserNickname}`,
                senderId: currentUser.uid,
                senderNickname: currentUserNickname,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
        })
        .catch((error) => {
            console.error("Hiba feladat hozzáadásakor:", error);
            showNotification("Hiba a feladat hozzáadásakor", "error");
        });
}

/**
 * Feladat státuszának frissítése
 */
function updateTaskStatus(taskId, status) {
    const updateData = {
        status: status,
        updated: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // Speciális mezők státusztól függően
    if (status === "done") {
        updateData.completed = firebase.firestore.FieldValue.serverTimestamp();
        updateData.completedBy = currentUser.uid;
        updateData.completedByName = currentUserNickname;
        
        // TTS értesítés
        if (ttsEnabled) {
            const task = tasks.find(t => t.id === taskId);
            if (task) {
                speakText(`${task.room} szoba feladata befejezve`, "high");
            }
        }
        
    } else if (status === "prog") {
        updateData.startedAt = firebase.firestore.FieldValue.serverTimestamp();
        updateData.startedBy = currentUser.uid;
        updateData.startedByName = currentUserNickname;
    }
    
    db.collection("tasks").doc(taskId).update(updateData)
        .then(() => {
            showNotification(`Feladat státusza frissítve: ${getStatusText(status)}`);
            
            // Ha nyitva van a modal, frissítsük a státusz választót
            if (document.getElementById("task-modal")?.classList.contains("active")) {
                const statusSelect = document.getElementById("modal-status");
                if (statusSelect) {
                    statusSelect.value = status;
                }
            }
        })
        .catch((error) => {
            console.error("Hiba a státusz frissítésekor:", error);
            showNotification("Hiba a státusz frissítésekor", "error");
        });
}

/**
 * Feladat felelősének frissítése
 */
function updateTaskAssignee(taskId, assigneeId) {
    db.collection("tasks").doc(taskId).update({
        assignedTo: assigneeId,
        updated: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(() => {
        showNotification("Felelős frissítve");
    })
    .catch((error) => {
        console.error("Hiba a felelős frissítésekor:", error);
        showNotification("Hiba a felelős frissítésekor", "error");
    });
}

/**
 * Feladat törlése
 */
function deleteTask(taskId) {
    if (!confirm("Biztosan törli ezt a feladatot?")) {
        return;
    }
    
    db.collection("tasks").doc(taskId).delete()
        .then(() => {
            // Ha nyitva van a modal, zárjuk be
            if (document.getElementById("task-modal")?.classList.contains("active")) {
                closeTaskModal();
            }
            
            showNotification("Feladat törölve");
        })
        .catch((error) => {
            console.error("Hiba a feladat törlésekor:", error);
            showNotification("Hiba a feladat törlésekor", "error");
        });
}

/**
 * Feladat modal megnyitása
 */
async function showTaskModal(task) {
    currentTaskId = task.id;
    
    // Kategória adatok
    const categoryIcon = CATEGORY_ICONS[task.category] || CATEGORY_ICONS.other;
    const categoryLabel = CATEGORY_LABELS[task.category] || "Egyéb";
    
    // Prioritás adatok
    const priorityColors = {
        1: { text: "Alacsony", color: "var(--secondary)" },
        2: { text: "Normál", color: "var(--info)" },
        3: { text: "Közepes", color: "oklch(70% .25 200)" },
        4: { text: "Magas", color: "var(--warning)" },
        5: { text: "Sürgős", color: "var(--danger)" }
    };
    
    const priorityInfo = priorityColors[task.prio] || priorityColors[2];
    const taskComments = comments[task.id] || [];
    
    // Alapadatok beállítása
    const modalRoom = document.getElementById("modal-room");
    const modalCategory = document.getElementById("modal-category");
    const modalPriority = document.getElementById("modal-priority");
    const modalNote = document.getElementById("modal-note");
    const modalCreator = document.getElementById("modal-creator");
    const modalCommentsCount = document.getElementById("modal-comments-count");
    
    if (modalRoom) modalRoom.textContent = task.room || "-";
    if (modalCategory) modalCategory.innerHTML = `${categoryIcon} ${categoryLabel}`;
    if (modalPriority) modalPriority.innerHTML = `<span style="color: ${priorityInfo.color}">${priorityInfo.text}</span>`;
    if (modalNote) modalNote.textContent = task.note || "-";
    if (modalCreator) modalCreator.textContent = task.userNickname || "Ismeretlen";
    if (modalCommentsCount) modalCommentsCount.textContent = taskComments.length;
    
    // Felelős választó
    const assignSelect = document.getElementById("modal-assignedTo");
    if (assignSelect) {
        assignSelect.innerHTML = '<option value="">Nincs felelős</option>';
        
        if (allUsers.length === 0) {
            await loadAllUsersList();
        }
        
        allUsers.forEach(user => {
            const option = document.createElement("option");
            option.value = user.id;
            option.textContent = user.nickname || user.email;
            
            if (user.id === task.assignedTo) {
                option.selected = true;
            }
            
            assignSelect.appendChild(option);
        });
        
        assignSelect.onchange = function() {
            if (currentTaskId) {
                updateTaskAssignee(currentTaskId, this.value);
            }
        };
    }
    
    // Határidő
    const dueDateInput = document.getElementById("modal-dueDate");
    if (dueDateInput) {
        dueDateInput.value = task.dueDate || "";
        dueDateInput.onchange = function() {
            if (currentTaskId) {
                db.collection("tasks").doc(currentTaskId).update({
                    dueDate: this.value,
                    updated: firebase.firestore.FieldValue.serverTimestamp()
                })
                .then(() => showNotification("Határidő frissítve"));
            }
        };
    }
    
    // Státusz
    const statusSelect = document.getElementById("modal-status");
    if (statusSelect) {
        statusSelect.value = task.status || "todo";
        statusSelect.onchange = function() {
            if (currentTaskId) {
                updateTaskStatus(currentTaskId, this.value);
            }
        };
    }
    
    // Létrehozás dátuma
    const createdElement = document.getElementById("modal-created");
    if (createdElement) {
        if (task.created && task.created.toDate) {
            const createdDate = task.created.toDate();
            createdElement.textContent = 
                createdDate.toLocaleDateString("hu-HU") + " " + 
                createdDate.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" });
        } else {
            createdElement.textContent = "-";
        }
    }
    
    // Utolsó módosítás
    const updatedElement = document.getElementById("modal-updated");
    if (updatedElement) {
        if (task.updated && task.updated.toDate) {
            updatedElement.textContent = getTimeAgo(task.updated.toDate());
        } else {
            updatedElement.textContent = "-";
        }
    }
    
    // Gombok
    const completeButton = document.getElementById("modal-complete");
    const deleteButton = document.getElementById("modal-delete");
    const editButton = document.getElementById("modal-edit");
    
    if (completeButton) {
        completeButton.onclick = () => {
            updateTaskStatus(task.id, "done");
            closeTaskModal();
        };
    }
    
    if (deleteButton) {
        deleteButton.onclick = () => deleteTask(task.id);
    }
    
    if (editButton) {
        editButton.innerHTML = '<i class="fas fa-edit"></i> Szerkesztés';
        editButton.onclick = function() {
            if (editingTaskId === task.id) {
                // Mentés
                const noteTextarea = document.querySelector("#modal-note textarea");
                if (noteTextarea) {
                    const newNote = noteTextarea.value.trim();
                    if (!newNote) {
                        showNotification("A feladat leírása nem lehet üres!", "warning");
                        return;
                    }
                    
                    db.collection("tasks").doc(task.id).update({
                        note: newNote,
                        updated: firebase.firestore.FieldValue.serverTimestamp(),
                        updatedBy: currentUser.uid,
                        updatedByName: currentUserNickname
                    })
                    .then(() => {
                        // UI visszaállítása
                        document.getElementById("modal-note").innerHTML = 
                            `<div class="task-description-text">${newNote}</div>`;
                        
                        this.innerHTML = '<i class="fas fa-edit"></i> Szerkesztés';
                        editingTaskId = null;
                        
                        showNotification("Feladat leírása frissítve");
                        
                        // Feladatok újrarajzolása
                        setTimeout(() => renderTasks(), 500);
                    });
                }
            } else {
                // Szerkesztés mód
                editingTaskId = task.id;
                const currentText = document.getElementById("modal-note").textContent;
                
                document.getElementById("modal-note").innerHTML = 
                    `<textarea id="modal-note-textarea" style="width: 100%; min-height: 150px; padding: 16px; border: 2px solid oklch(85% .05 260); border-radius: 12px; font-family: inherit; font-size: 16px; resize: vertical; background: var(--card-bg); color: var(--dark);">${currentText}</textarea>`;
                
                this.innerHTML = '<i class="fas fa-save"></i> Mentés';
                
                // Fókusz a textarea-ra
                setTimeout(() => {
                    const ta = document.getElementById("modal-note-textarea");
                    if (ta) {
                        ta.focus();
                        ta.setSelectionRange(ta.value.length, ta.value.length);
                    }
                }, 100);
            }
        };
    }
    
    // Komment űrlap
    const commentForm = document.getElementById("comment-form");
    if (commentForm) {
        commentForm.onsubmit = (e) => {
            e.preventDefault();
            const commentInput = document.getElementById("comment-input");
            if (commentInput) {
                addComment(task.id, commentInput.value);
            }
        };
    }
    
    // Kommentek renderelése
    renderComments(task.id);
    
    // Modal megjelenítése
    const taskModal = document.getElementById("task-modal");
    if (taskModal) {
        taskModal.classList.add("active");
    }
}

/**
 * Feladat modal bezárása
 */
function closeTaskModal() {
    const taskModal = document.getElementById("task-modal");
    if (taskModal) {
        taskModal.classList.remove("active");
    }
    
    currentTaskId = null;
    editingTaskId = null;
    
    // Szerkesztés gomb visszaállítása
    const editButton = document.getElementById("modal-edit");
    if (editButton) {
        editButton.innerHTML = '<i class="fas fa-edit"></i> Szerkesztés';
    }
    
    // Komment mező törlése
    const commentInput = document.getElementById("comment-input");
    if (commentInput) {
        commentInput.value = "";
    }
}

/**
 * Komment hozzáadása
 */
async function addComment(taskId, text) {
    if (!text.trim()) {
        showNotification("Kérjük, írjon hozzászólást!", "warning");
        return;
    }
    
    try {
        // Komment mentése
        await db.collection("tasks")
            .doc(taskId)
            .collection("comments")
            .add({
                text: text.trim(),
                userId: currentUser.uid,
                userNickname: currentUserNickname,
                userRole: currentUserRole,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        
        // Feladat frissítési dátuma
        await db.collection("tasks")
            .doc(taskId)
            .update({
                updated: firebase.firestore.FieldValue.serverTimestamp()
            });
        
        showNotification("Hozzászólás elküldve!");
        
        // Komment mező törlése
        const commentInput = document.getElementById("comment-input");
        if (commentInput) {
            commentInput.value = "";
        }
        
    } catch (error) {
        console.error("Hiba a komment hozzáadásakor:", error);
        showNotification("Hiba a komment hozzáadásakor", "error");
    }
}

/**
 * Kommentek renderelése
 */
function renderComments(taskId) {
    const taskComments = comments[taskId] || [];
    const commentsList = document.getElementById("task-comments-list");
    const commentsCount = document.getElementById("comments-count");
    
    if (!commentsList) return;
    
    // Komment számláló
    if (commentsCount) {
        commentsCount.textContent = taskComments.length;
    }
    
    // Nincs komment
    if (taskComments.length === 0) {
        commentsList.innerHTML = `
            <div class="no-comments">
                <i class="fas fa-comment-slash" style="font-size: 2rem; margin-bottom: 12px;"></i>
                <p>Még nincsenek hozzászólások</p>
                <p style="font-size: 0.95rem; color: var(--gray);">Legyen Ön az első!</p>
            </div>
        `;
        return;
    }
    
    // Kommentek renderelése
    commentsList.innerHTML = "";
    
    taskComments.forEach(comment => {
        const commentDate = comment.createdAt?.toDate ? 
                          comment.createdAt.toDate() : 
                          new Date(comment.createdAt);
        
        const userInitial = comment.userNickname ? 
                          comment.userNickname.charAt(0).toUpperCase() : "?";
        
        const commentElement = document.createElement("div");
        commentElement.className = "comment-item";
        
        commentElement.innerHTML = `
            <div class="comment-header">
                <div class="comment-user">
                    <div class="comment-user-avatar">${userInitial}</div>
                    <div class="comment-user-info">
                        <div class="comment-user-name">${comment.userNickname || "Ismeretlen"}</div>
                        <div class="comment-user-role">${ROLE_LABELS[comment.userRole] || "Felhasználó"}</div>
                    </div>
                </div>
                <div class="comment-time" title="${commentDate.toLocaleString("hu-HU")}">
                    ${getTimeAgo(commentDate)}
                </div>
            </div>
            <div class="comment-content">${comment.text}</div>
            <div class="comment-actions">
                ${comment.userId === currentUser?.uid ? 
                    `<button class="comment-action-btn" onclick="deleteComment('${taskId}', '${comment.id}')">
                        <i class="fas fa-trash"></i> Törlés
                    </button>` : ""}
                ${currentUserRole === ROLES.ADMIN ? 
                    `<button class="comment-action-btn" onclick="deleteComment('${taskId}', '${comment.id}')">
                        <i class="fas fa-trash"></i> Admin törlés
                    </button>` : ""}
            </div>
        `;
        
        commentsList.appendChild(commentElement);
    });
    
    // Görgetés aljára
    commentsList.scrollTop = commentsList.scrollHeight;
}

/**
 * Komment törlése
 */
async function deleteComment(taskId, commentId) {
    if (!confirm("Biztosan törli ezt a hozzászólást?")) {
        return;
    }
    
    try {
        await db.collection("tasks")
            .doc(taskId)
            .collection("comments")
            .doc(commentId)
            .delete();
        
        showNotification("Hozzászólás törölve");
        
    } catch (error) {
        console.error("Hiba a komment törlésekor:", error);
        showNotification("Hiba a komment törlésekor", "error");
    }
}

/**
 * Feladat komment indikátor frissítése
 */
function updateTaskCommentIndicator(taskId) {
    const taskComments = comments[taskId] || [];
    const card = document.querySelector(`.compact-card[data-id="${taskId}"]`);
    
    if (!card) return;
    
    // Régi indikátor eltávolítása
    const existingIndicator = card.querySelector(".comment-indicator");
    if (existingIndicator) {
        existingIndicator.remove();
    }
    
    // Új indikátor hozzáadása
    if (taskComments.length > 0) {
        const indicator = document.createElement("div");
        indicator.className = "comment-indicator";
        indicator.title = `${taskComments.length} hozzászólás`;
        indicator.textContent = taskComments.length;
        card.appendChild(indicator);
    }
}

/* ==========================================================================
   15. ADMINISZTRÁCIÓS PANEL ÉS SZEREPKÖRÖK
   ========================================================================== */

// Szerepkör-jogosultság kezelő
let rolePermissionsManager = {
    currentRole: null,
    originalPermissions: {},
    affectedUsers: []
};

/**
 * Szerepkör-jogosultság kezelő megnyitása
 */
function openRolePermissionsManager() {
    if (currentUserRole !== ROLES.ADMIN) {
        showNotification("Csak adminok módosíthatják a szerepköröket!", "warning");
        return;
    }
    
    const modal = document.getElementById('role-permissions-manager-modal');
    const roleSelect = document.getElementById('role-permissions-select');
    
    if (!modal || !roleSelect) return;
    
    modal.classList.add('active');
    roleSelect.value = 'supervisor';
    loadRolePermissions('supervisor');
}

/**
 * Szerepkör-jogosultság kezelő bezárása
 */
function closeRolePermissionsManagerModal() {
    const modal = document.getElementById('role-permissions-manager-modal');
    if (modal) {
        modal.classList.remove('active');
    }
    
    rolePermissionsManager.currentRole = null;
    rolePermissionsManager.originalPermissions = {};
}

/**
 * Szerepkör jogosultságok betöltése
 */
async function loadRolePermissions(role) {
    rolePermissionsManager.currentRole = role;
    
    const roleNameElement = document.getElementById('selected-role-name');
    if (roleNameElement) {
        roleNameElement.textContent = ROLE_LABELS[role] || role;
    }
    
    try {
        const roleDoc = await db.collection('system')
            .doc(`role_permissions_${role}`)
            .get();
        
        let permissions = {};
        
        if (roleDoc.exists) {
            permissions = roleDoc.data().permissions || {};
            rolePermissionsManager.originalPermissions = { ...permissions };
        } else {
            permissions = DEFAULT_PERMISSIONS[role] || {};
            rolePermissionsManager.originalPermissions = { ...DEFAULT_PERMISSIONS[role] };
        }
        
        // Jogosultságok megjelenítése
        const permissionsGrid = document.getElementById('role-permissions-grid');
        if (!permissionsGrid) return;
        
        permissionsGrid.innerHTML = '';
        
        Object.keys(PERMISSION_LABELS).forEach(permissionKey => {
            const isChecked = permissions[permissionKey] || false;
            const isDefault = DEFAULT_PERMISSIONS[role]?.[permissionKey] || false;
            
            const permissionItem = document.createElement('div');
            permissionItem.className = 'permission-item';
            
            permissionItem.innerHTML = `
                <input type="checkbox" id="role-perm-${permissionKey}" ${isChecked ? 'checked' : ''}>
                <label for="role-perm-${permissionKey}">
                    ${PERMISSION_LABELS[permissionKey]}
                    ${isDefault ? 
                        '<span style="font-size:0.8em;color:var(--secondary);margin-left:5px">(alapértelmezett)</span>' : 
                        ''}
                </label>
            `;
            
            permissionsGrid.appendChild(permissionItem);
        });
        
        // Érintett felhasználók betöltése
        await loadAffectedUsers(role);
        
    } catch (error) {
        console.error('Hiba a szerepkör jogosultságok betöltésekor:', error);
        showNotification('Hiba a jogosultságok betöltésekor', 'error');
    }
}

/**
 * Érintett felhasználók betöltése
 */
async function loadAffectedUsers(role) {
    try {
        const usersSnapshot = await db.collection('users')
            .where('role', '==', role)
            .get();
        
        rolePermissionsManager.affectedUsers = [];
        const affectedList = document.getElementById('affected-users-list');
        
        if (!affectedList) return;
        
        affectedList.innerHTML = '';
        
        if (usersSnapshot.empty) {
            affectedList.innerHTML = `
                <div style="text-align:center;padding:20px;color:var(--gray)">
                    <i class="fas fa-user-slash"></i> Nincs felhasználó ezzel a szerepkörrel
                </div>
            `;
            return;
        }
        
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            rolePermissionsManager.affectedUsers.push({ 
                id: doc.id, 
                ...userData 
            });
            
            const userElement = document.createElement('div');
            userElement.style.cssText = `
                padding: 10px;
                margin-bottom: 8px;
                background: ${doc.id === currentUser?.uid ? 
                           'oklch(95% 0.05 240 / .3)' : 
                           'oklch(98% .02 260 / .9)'};
                border-radius: 8px;
                border-left: 4px solid var(--primary);
                font-size: 0.9rem;
            `;
            
            userElement.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        <strong>${userData.nickname || userData.email}</strong>
                        ${doc.id === currentUser?.uid ? 
                         ' <span style="color:var(--info)">(én)</span>' : ''}
                    </div>
                    <div style="font-size:0.85rem;color:var(--gray)">
                        ${userData.email}
                    </div>
                </div>
            `;
            
            affectedList.appendChild(userElement);
        });
        
    } catch (error) {
        console.error('Hiba a felhasználók betöltésekor:', error);
    }
}

/**
 * Szerepkör jogosultságok mentése
 */
async function saveRolePermissions() {
    const role = rolePermissionsManager.currentRole;
    if (!role) return;
    
    try {
        const permissions = {};
        
        // Jogosultságok összegyűjtése
        document.querySelectorAll('#role-permissions-grid input[type="checkbox"]')
            .forEach(checkbox => {
                permissions[checkbox.id.replace('role-perm-', '')] = checkbox.checked;
            });
        
        // Mentés Firestore-ba
        await db.collection('system')
            .doc(`role_permissions_${role}`)
            .set({
                role: role,
                permissions: permissions,
                updatedBy: currentUser.uid,
                updatedByName: currentUserNickname,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        
        showNotification(`${ROLE_LABELS[role]} szerepkör jogosultságai mentve!`, 'success');
        
        // Cache frissítése
        userCache.set(`role_permissions_${role}`, permissions);
        
    } catch (error) {
        console.error('Hiba a szerepkör jogosultságok mentésekor:', error);
        showNotification('Hiba a mentés során', 'error');
    }
}

/**
 * Jogosultságok alkalmazása minden felhasználóra
 */
async function applyToAllUsers() {
    const role = rolePermissionsManager.currentRole;
    
    if (!role || 
        !confirm(`Biztosan alkalmazza ezeket a jogosultságokat az összes ${ROLE_LABELS[role]} felhasználóra?`)) {
        return;
    }
    
    try {
        const permissions = {};
        
        // Jogosultságok összegyűjtése
        document.querySelectorAll('#role-permissions-grid input[type="checkbox"]')
            .forEach(checkbox => {
                permissions[checkbox.id.replace('role-perm-', '')] = checkbox.checked;
            });
        
        const batch = db.batch();
        const usersSnapshot = await db.collection('users')
            .where('role', '==', role)
            .get();
        
        let updatedCount = 0;
        
        usersSnapshot.forEach(doc => {
            batch.update(doc.ref, { 
                permissions: permissions,
                permissionsUpdated: firebase.firestore.FieldValue.serverTimestamp()
            });
            updatedCount++;
            
            // Cache frissítése
            if (userCache.has(doc.id)) {
                userCache.set(doc.id + '_permissions', permissions);
            }
        });
        
        await batch.commit();
        
        showNotification(`${updatedCount} felhasználó jogosultságai frissítve!`, 'success');
        
        // Érintett felhasználók lista frissítése
        await loadAffectedUsers(role);
        
    } catch (error) {
        console.error('Hiba a jogosultságok alkalmazásakor:', error);
        showNotification('Hiba az alkalmazás során', 'error');
    }
}

/**
 * Szerepkör jogosultságok visszaállítása
 */
async function resetRolePermissions() {
    const role = rolePermissionsManager.currentRole;
    
    if (!role || 
        !confirm(`Biztosan visszaállítja az alapértelmezett jogosultságokat?`)) {
        return;
    }
    
    try {
        await db.collection('system')
            .doc(`role_permissions_${role}`)
            .delete();
        
        // Újratöltés
        loadRolePermissions(role);
        
        showNotification(`${ROLE_LABELS[role]} szerepkör jogosultságai visszaállítva`, 'success');
        
    } catch (error) {
        console.error('Hiba a visszaállítás során:', error);
        showNotification('Hiba a visszaállítás során', 'error');
    }
}

/**
 * Összes felhasználó listájának betöltése (select-ekhez)
 */
async function loadAllUsersList() {
    try {
        const usersSnapshot = await db.collection("users")
            .orderBy("nickname")
            .get();
        
        allUsers = [];
        
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            allUsers.push({ 
                id: doc.id, 
                ...userData 
            });
            
            // Cache frissítése
            userCache.set(doc.id, userData.nickname || "Ismeretlen");
        });
        
    } catch (error) {
        console.error("Hiba a felhasználók listájának betöltésekor:", error);
    }
}

/**
 * Összes felhasználó betöltése (admin panelhez)
 */
async function loadAllUsers() {
    if (currentUserRole !== ROLES.ADMIN) return;
    
    try {
        const usersSnapshot = await db.collection("users")
            .orderBy("createdAt", "desc")
            .get();
        
        const usersList = document.getElementById("usersList");
        if (!usersList) return;
        
        usersList.innerHTML = "";
        
        if (usersSnapshot.empty) {
            usersList.innerHTML = `
                <div style="text-align: center; padding: 20px; color: var(--gray);">
                    Nincs felhasználó
                </div>
            `;
            return;
        }
        
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            const userId = doc.id;
            const isCurrentUser = userId === currentUser?.uid;
            
            const userElement = document.createElement("div");
            userElement.className = "user-item";
            
            userElement.innerHTML = `
                <div class="user-info" style="${isCurrentUser ? 
                                               "background: oklch(95% 0.05 240);" : ""}">
                    <div class="user-nickname">
                        ${userData.nickname || "Nincs niknév"}
                        ${isCurrentUser ? " (én)" : ""}
                    </div>
                    <div class="user-email">${userData.email}</div>
                    <div style="font-size:0.8rem;color:var(--gray);margin-top:4px">
                        ${ROLE_LABELS[userData.role] || userData.role}
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <select class="user-role-select" data-user-id="${userId}">
                        <option value="admin" ${userData.role === "admin" ? "selected" : ""}>
                            Admin
                        </option>
                        <option value="supervisor" ${userData.role === "supervisor" ? "selected" : ""}>
                            Supervisor
                        </option>
                        <option value="reception" ${userData.role === "reception" ? "selected" : ""}>
                            Recepciós
                        </option>
                        <option value="szobaasszony" ${userData.role === "szobaasszony" ? "selected" : ""}>
                            Szobaasszony
                        </option>
                        <option value="karbantarto" ${!userData.role || userData.role === "karbantarto" ? "selected" : ""}>
                            Karbantartó
                        </option>
                    </select>
                    <button onclick="updateUserRole('${userId}')" class="btn" 
                            style="padding: 8px 14px; font-size: 0.95rem; background: var(--secondary);">
                        <i class="fas fa-save"></i>
                    </button>
                    <button onclick="openPermissionsModal('${userId}')" 
                            class="btn user-permissions-btn">
                        <i class="fas fa-key"></i>
                    </button>
                </div>
            `;
            
            usersList.appendChild(userElement);
        });
        
    } catch (error) {
        console.error("Hiba a felhasználók betöltésekor:", error);
        showNotification("Hiba a felhasználók betöltésekor", "error");
    }
}

/**
 * Felhasználó szerepkörének frissítése
 */
async function updateUserRole(userId, newRole = null) {
    if (currentUserRole !== ROLES.ADMIN) return;
    
    if (!newRole) {
        const selectElement = document.querySelector(`.user-role-select[data-user-id="${userId}"]`);
        if (!selectElement) return;
        newRole = selectElement.value;
    }
    
    try {
        await db.collection("users").doc(userId).update({
            role: newRole,
            updated: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Cache frissítése
        userCache.set(userId + "_role", newRole);
        
        // Ha a jelenlegi felhasználó volt, frissítsük a globális változót
        if (userId === currentUser?.uid) {
            currentUserRole = newRole;
            updateUserRoleDisplay();
            toggleAdminPanel();
        }
        
        // Felhasználók listájának újratöltése
        await loadAllUsersList();
        
        showNotification(`Felhasználó rangja frissítve: ${ROLE_LABELS[newRole]}`, "success");
        
    } catch (error) {
        console.error("Hiba a felhasználó rangjának frissítésekor:", error);
        showNotification("Hiba a rang frissítésekor", "error");
    }
}

/**
 * Inaktív felhasználók törlése
 */
async function deleteInactiveUsers() {
    if (currentUserRole !== ROLES.ADMIN) return;
    
    if (!confirm("Biztosan törli az inaktív felhasználókat? (30 nap)")) {
        return;
    }
    
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 30);
        
        const usersSnapshot = await db.collection("users").get();
        let deletedCount = 0;
        
        const deletions = [];
        
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            const lastLogin = userData.lastLogin?.toDate ? 
                            userData.lastLogin.toDate() : 
                            new Date(userData.lastLogin);
            
            // Csak nem-admin, nem-jelenlegi felhasználók, akik inaktívak
            if (userData.role !== ROLES.ADMIN && 
                doc.id !== currentUser?.uid && 
                lastLogin < cutoffDate) {
                
                deletions.push(db.collection("users").doc(doc.id).delete());
                deletedCount++;
            }
        });
        
        // Összes törlés egyszerre
        await Promise.all(deletions);
        
        showNotification(`${deletedCount} inaktív felhasználó törölve`, "success");
        
        // Lista frissítése
        loadAllUsers();
        
    } catch (error) {
        console.error("Hiba a törlés során:", error);
        showNotification("Hiba a törlés során", "error");
    }
}

/**
 * Felhasználói jogosultságok modal megnyitása
 */
async function openPermissionsModal(userId) {
    try {
        const userDoc = await db.collection("users").doc(userId).get();
        
        if (!userDoc.exists) {
            showNotification("Felhasználó nem található", "error");
            return;
        }
        
        const userData = userDoc.data();
        const permissions = userData.permissions || 
                           DEFAULT_PERMISSIONS[userData.role] || {};
        
        // UI elemek
        const usernameElement = document.getElementById("permissions-username");
        const userinfoElement = document.getElementById("permissions-userinfo");
        const emailElement = document.getElementById("permissions-email");
        const roleSelect = document.getElementById("permissions-role");
        const statusElement = document.getElementById("permissions-status");
        const permissionsGrid = document.getElementById("permissions-grid");
        
        if (!usernameElement || !userinfoElement || !emailElement || 
            !roleSelect || !statusElement || !permissionsGrid) {
            return;
        }
        
        // Adatok beállítása
        usernameElement.textContent = userData.nickname || userData.email;
        userinfoElement.textContent = userData.nickname ? 
                                     `${userData.nickname} (${ROLE_LABELS[userData.role] || userData.role})` : 
                                     userData.email;
        emailElement.textContent = userData.email;
        roleSelect.value = userData.role || "karbantarto";
        statusElement.textContent = userData.lastLogin ? "Aktív" : "Inaktív";
        
        // Jogosultságok megjelenítése
        permissionsGrid.innerHTML = "";
        
        Object.keys(PERMISSION_LABELS).forEach(permissionKey => {
            const permissionItem = document.createElement("div");
            permissionItem.className = "permission-item";
            
            const isChecked = permissions[permissionKey] === true;
            
            permissionItem.innerHTML = `
                <input type="checkbox" id="perm-${permissionKey}">
                <label for="perm-${permissionKey}">${PERMISSION_LABELS[permissionKey]}</label>
            `;
            
            const checkbox = permissionItem.querySelector('input');
            checkbox.checked = isChecked;
            
            permissionsGrid.appendChild(permissionItem);
        });
        
        // User ID tárolása a modalban
        const modal = document.getElementById("permissions-modal");
        if (modal) {
            modal.dataset.userId = userId;
            modal.classList.add("active");
        }
        
    } catch (error) {
        console.error("Hiba a jogosultságok betöltésekor:", error);
        showNotification("Hiba a jogosultságok betöltésekor", "error");
    }
}

/**
 * Felhasználói jogosultságok mentése
 */
async function savePermissions() {
    const modal = document.getElementById("permissions-modal");
    if (!modal) return;
    
    const userId = modal.dataset.userId;
    if (!userId) {
        showNotification("Nincs kiválasztott felhasználó", "error");
        return;
    }
    
    try {
        const roleSelect = document.getElementById("permissions-role");
        if (!roleSelect) return;
        
        const role = roleSelect.value;
        const permissions = {};
        
        // Jogosultságok összegyűjtése
        document.querySelectorAll('#permissions-grid input[type="checkbox"]')
            .forEach(checkbox => {
                permissions[checkbox.id.replace('perm-', '')] = checkbox.checked;
            });
        
        // Mentés Firestore-ba
        await db.collection("users").doc(userId).update({
            role: role,
            permissions: permissions,
            updated: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Cache frissítése
        userCache.set(userId + "_role", role);
        
        // Ha a jelenlegi felhasználó volt, frissítsük a globális változót
        if (userId === currentUser?.uid) {
            currentUserRole = role;
            updateUserRoleDisplay();
            toggleAdminPanel();
        }
        
        // Felhasználók listájának frissítése
        await loadAllUsersList();
        
        showNotification(`Felhasználó jogosultságai frissítve`, "success");
        
        // Modal bezárása
        closePermissionsModal();
        
    } catch (error) {
        console.error("Hiba a jogosultságok mentésekor:", error);
        showNotification("Hiba a jogosultságok mentésekor", "error");
    }
}

/**
 * Jogosultságok modal bezárása
 */
function closePermissionsModal() {
    const modal = document.getElementById("permissions-modal");
    if (modal) {
        modal.classList.remove("active");
        modal.dataset.userId = "";
    }
}

/* ==========================================================================
   16. NAVIGÁCIÓ ÉS MENÜKEZELÉS
   ========================================================================== */

/**
 * Menürendszer inicializálása
 */
function initMenuSystem() {
    document.querySelectorAll(".menu-item").forEach(item => {
        item.addEventListener("mouseenter", function() {
            this.style.background = "oklch(95% .02 260 / 0.5)";
        });
        
        item.addEventListener("mouseleave", function() {
            this.style.background = "none";
        });
    });
}

/**
 * Menü megnyitása
 */
function openMenu() {
    const overlay = document.getElementById("menuOverlay");
    const sidebar = document.querySelector(".menu-sidebar");
    
    if (overlay && sidebar) {
        overlay.style.display = "block";
        
        setTimeout(() => {
            sidebar.style.transform = "translateX(0)";
        }, 10);
    }
}

/**
 * Menü bezárása
 */
function closeMenu() {
    const overlay = document.getElementById("menuOverlay");
    const sidebar = document.querySelector(".menu-sidebar");
    
    if (overlay && sidebar) {
        sidebar.style.transform = "translateX(-100%)";
        
        setTimeout(() => {
            overlay.style.display = "none";
        }, 300);
    }
}

/**
 * Nézet váltása
 */
function showView(viewId) {
    // Összes nézet elrejtése
    document.querySelectorAll(".view-container").forEach(view => {
        view.style.display = "none";
    });
    
    // Cél nézet megjelenítése
    const targetView = document.getElementById(viewId + "View");
    if (targetView) {
        targetView.style.display = "block";
        
        // Nézet-specifikus inicializálás
        switch (viewId) {
            case "statistics":
                initStatistics();
                break;
            case "settings":
                initSettingsView();
                break;
            case "about":
                initAboutView();
                break;
            case "export":
                initExportView();
                break;
            case "plugins":
                initPluginView();
                break;
        }
    }
    
    // Menü bezárása
    closeMenu();
}

/**
 * Kijelentkezés
 */
function logout() {
    if (confirm("Biztosan ki szeretne jelentkezni?")) {
        auth.signOut()
            .then(() => {
                showNotification("Sikeres kijelentkezés");
            })
            .catch((error) => {
                console.error("Hiba a kijelentkezéskor:", error);
                showNotification("Hiba a kijelentkezéskor", "error");
            });
    }
}

/* ==========================================================================
   17. ÖSSZECSUKTHATÓ PANELEK
   ========================================================================== */

/**
 * Összecsukható panel váltása
 */
function toggleCollapsible(sectionId) {
    const header = document.getElementById(`${sectionId}-header`);
    const content = document.getElementById(`${sectionId}-content`);
    
    if (!content || !header) return;
    
    if (content.classList.contains("collapsed")) {
        content.classList.remove("collapsed");
        header.classList.remove("collapsed");
    } else {
        content.classList.add("collapsed");
        header.classList.add("collapsed");
    }
    
    saveCollapsibleState();
}

/**
 * Összecsukható panel állapotok mentése
 */
function saveCollapsibleState() {
    const states = {
        chat: !document.getElementById("chat-content")?.classList.contains("collapsed"),
        "control-panel": !document.getElementById("control-panel-content")?.classList.contains("collapsed"),
        kanban: !document.getElementById("kanban-content")?.classList.contains("collapsed"),
        "quick-actions": !document.getElementById("quick-actions-content")?.classList.contains("collapsed"),
        "room-status": !document.getElementById("room-status-content")?.classList.contains("collapsed")
    };
    
    localStorage.setItem("collapsible_states", JSON.stringify(states));
}

/**
 * Összecsukható panel állapotok betöltése
 */
function loadCollapsibleState() {
    const saved = localStorage.getItem("collapsible_states");
    
    if (saved) {
        try {
            const states = JSON.parse(saved);
            
            Object.keys(states).forEach(sectionId => {
                const header = document.getElementById(`${sectionId}-header`);
                const content = document.getElementById(`${sectionId}-content`);
                
                if (content && header) {
                    if (states[sectionId]) {
                        content.classList.remove("collapsed");
                        header.classList.remove("collapsed");
                    } else {
                        content.classList.add("collapsed");
                        header.classList.add("collapsed");
                    }
                }
            });
            
        } catch (error) {
            console.error("Hiba a collapsible állapotok betöltésekor:", error);
        }
    }
}

/* ==========================================================================
   18. SEGÉDFÜGGVÉNYEK
   ========================================================================== */

/**
 * Prioritás szöveges leírása
 */
function getPriorityText(priority) {
    const texts = {
        1: "Alacsony",
        2: "Normál",
        3: "Közepes",
        4: "Magas",
        5: "Sürgős"
    };
    
    return texts[priority] || "Normál";
}

/**
 * Státusz szöveges leírása
 */
function getStatusText(status) {
    const texts = {
        todo: "Várakozik",
        prog: "Folyamatban",
        done: "Kész"
    };
    
    return texts[status] || "Várakozik";
}

/**
 * Relatív idő formázása
 */
function getTimeAgo(date) {
    const now = new Date();
    const diff = now - date;
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
        return `${days} napja`;
    }
    
    if (hours > 0) {
        return `${hours} órája`;
    }
    
    if (minutes > 0) {
        return `${minutes} perce`;
    }
    
    return "éppen most";
}

/**
 * Komment űrlap törlése
 */
function clearCommentForm() {
    const commentInput = document.getElementById("comment-input");
    if (commentInput) {
        commentInput.value = "";
    }
}

/**
 * Kanban keresés végrehajtása
 */
function performKanbanSearch() {
    const searchInput = document.getElementById("kanbanSearchInput");
    if (searchInput) {
        currentKanbanSearchQuery = searchInput.value.trim().toLowerCase();
        renderTasks();
    }
}

/**
 * Feladatok szűrése
 */
function filterTasks(filter) {
    const periodFilter = document.getElementById("f-period");
    if (periodFilter) {
        periodFilter.value = filter;
        renderTasks();
    }
}

/**
 * Ma befejezett feladatok szűrése
 */
function showCompletedToday() {
    filterTasks("today");
    
    const categoryFilter = document.getElementById("f-category");
    if (categoryFilter) {
        categoryFilter.value = "all";
    }
    
    renderTasks();
}

/**
 * Drag and drop helper függvények
 */
function allowDrop(e) {
    e.preventDefault();
}

function drop(e) {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain");
    const status = e.currentTarget.id.replace("col-", "");
    
    if (taskId) {
        updateTaskStatus(taskId, status);
    }
}

/* ==========================================================================
   19. STATISZTIKÁK (Műszerfal & Donut Chartok)
   ========================================================================== */

/**
 * Statisztikák nézet inicializálása - Donut Chart verzió
 */
function initStatistics() {
    const statisticsView = document.getElementById("statisticsView");
    if (!statisticsView) return;

    // Stílus a diagramokhoz (beillesztjük dinamikusan, hogy ne kelljen a CSS fájlt szerkeszteni)
    const styleId = 'stats-styles';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .stats-container { padding: 20px; display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
            .stat-card { background: white; padding: 20px; border-radius: 16px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid rgba(0,0,0,0.05); }
            .stat-header { font-size: 1.1rem; font-weight: 600; color: #333; margin-bottom: 15px; border-bottom: 2px solid #f0f0f0; padding-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
            
            /* Donut Chart CSS */
            .chart-wrapper { display: flex; align-items: center; justify-content: space-around; flex-wrap: wrap; gap: 20px; }
            .donut-chart { position: relative; width: 140px; height: 140px; border-radius: 50%; background: #eee; flex-shrink: 0; transition: all 0.5s ease; }
            .donut-hole { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 90px; height: 90px; background: white; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: inset 0 2px 5px rgba(0,0,0,0.05); }
            .donut-value { font-size: 1.5rem; font-weight: bold; color: #333; }
            .donut-label { font-size: 0.75rem; color: #888; text-transform: uppercase; }
            
            /* Jelmagyarázat */
            .chart-legend { flex: 1; min-width: 120px; }
            .legend-item { display: flex; align-items: center; margin-bottom: 8px; font-size: 0.9rem; }
            .legend-color { width: 12px; height: 12px; border-radius: 3px; margin-right: 8px; }
            
            /* KPI Grid */
            .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
            .kpi-box { background: white; padding: 15px; border-radius: 12px; text-align: center; border: 1px solid #eee; }
            .kpi-num { font-size: 1.5rem; font-weight: bold; color: var(--primary); }
            .kpi-text { font-size: 0.8rem; color: #666; }
        `;
        document.head.appendChild(style);
    }

    statisticsView.innerHTML = `
        <div style="padding: 20px;">
            <h2 style="margin-bottom: 20px; color: var(--dark);"><i class="fas fa-chart-pie"></i> Teljesítmény Áttekintés</h2>
            
            <div class="kpi-row">
                <div class="kpi-box" style="border-bottom: 3px solid var(--primary);">
                    <div class="kpi-num" id="stat-total-open">0</div>
                    <div class="kpi-text">Nyitott</div>
                </div>
                <div class="kpi-box" style="border-bottom: 3px solid var(--success);">
                    <div class="kpi-num" id="stat-completed-today">0</div>
                    <div class="kpi-text">Ma Kész</div>
                </div>
                <div class="kpi-box" style="border-bottom: 3px solid var(--danger);">
                    <div class="kpi-num" id="stat-urgent">0</div>
                    <div class="kpi-text">Sürgős</div>
                </div>
                <div class="kpi-box" style="border-bottom: 3px solid var(--warning);">
                    <div class="kpi-num" id="stat-maint">0</div>
                    <div class="kpi-text">Karbantartás</div>
                </div>
            </div>

            <div class="stats-container">
                <div class="stat-card">
                    <div class="stat-header">
                        <span>Feladat Típusok</span>
                        <i class="fas fa-folder text-primary"></i>
                    </div>
                    <div class="chart-wrapper">
                        <div id="chart-categories" class="donut-chart">
                            <div class="donut-hole">
                                <span class="donut-value" id="total-tasks-count">0</span>
                                <span class="donut-label">Összes</span>
                            </div>
                        </div>
                        <div id="legend-categories" class="chart-legend"></div>
                    </div>
                </div>

                <div class="stat-card">
                    <div class="stat-header">
                        <span>Sürgősségi Szintek</span>
                        <i class="fas fa-layer-group text-danger"></i>
                    </div>
                    <div class="chart-wrapper">
                        <div id="chart-priorities" class="donut-chart">
                            <div class="donut-hole">
                                <span class="donut-value" id="avg-prio-val">-</span>
                                <span class="donut-label">Átlag Prio</span>
                            </div>
                        </div>
                        <div id="legend-priorities" class="chart-legend"></div>
                    </div>
                </div>

                <div class="stat-card">
                    <div class="stat-header">
                        <span>Top 5 Problémás Szoba</span>
                        <i class="fas fa-door-open text-warning"></i>
                    </div>
                    <div id="top-rooms-list">
                        <div style="text-align:center;padding:20px;color:var(--gray)">
                            <i class="fas fa-spinner fa-spin"></i> Betöltés...
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    updateStatistics();
}

/**
 * Statisztikák számítása és diagramok rajzolása
 */
function updateStatistics() {
    if (!tasks) return;

    // --- ADAT ELŐKÉSZÍTÉS ---
    const openTasks = tasks.filter(t => t.status !== 'done');
    const today = new Date();
    today.setHours(0,0,0,0);
    const completedToday = tasks.filter(t => t.status === 'done' && t.completed && t.completed.toDate && t.completed.toDate() >= today).length;
    const urgentCount = openTasks.filter(t => t.prio >= 4).length;
    const maintCount = tasks.filter(t => t.category === 'maintenance' && t.status !== 'done').length;

    // KPI Frissítés
    document.getElementById('stat-total-open').textContent = openTasks.length;
    document.getElementById('stat-completed-today').textContent = completedToday;
    document.getElementById('stat-urgent').textContent = urgentCount;
    document.getElementById('stat-maint').textContent = maintCount;
    document.getElementById('total-tasks-count').textContent = tasks.length;

    // --- 1. KATEGÓRIA DIAGRAM ---
    const catCounts = {};
    tasks.forEach(t => {
        const cat = t.category || 'other';
        catCounts[cat] = (catCounts[cat] || 0) + 1;
    });

    // Kategória színek (CSS változók alapján vagy fixen)
    const catColors = {
        'cleaning': '#20c997',       // Teal
        'maintenance': '#0d6efd',    // Blue
        'service': '#ffc107',        // Yellow
        'supply': '#6c757d',         // Grey
        'other': '#adb5bd'
    };

    renderDonutChart(
        'chart-categories', 
        'legend-categories', 
        catCounts, 
        catColors, 
        CATEGORY_LABELS
    );

    // --- 2. PRIORITÁS DIAGRAM (Csak nyitott feladatok) ---
    const prioCounts = { 'Alacsony': 0, 'Normál': 0, 'Magas': 0, 'Azonnal': 0 };
    let prioSum = 0;
    openTasks.forEach(t => {
        const p = parseInt(t.prio) || 3;
        prioSum += p;
        if (p <= 2) prioCounts['Alacsony']++;
        else if (p === 3) prioCounts['Normál']++;
        else if (p === 4) prioCounts['Magas']++;
        else prioCounts['Azonnal']++;
    });

    const prioColors = {
        'Alacsony': '#20c997', // Zöld
        'Normál': '#0d6efd',   // Kék
        'Magas': '#ffc107',    // Sárga
        'Azonnal': '#dc3545'   // Piros
    };

    renderDonutChart(
        'chart-priorities', 
        'legend-priorities', 
        prioCounts, 
        prioColors, 
        null
    );
    
    // Átlag prio kiszámítása
    const avgPrio = openTasks.length ? (prioSum / openTasks.length).toFixed(1) : '-';
    document.getElementById('avg-prio-val').textContent = avgPrio;

    // --- 3. TOP SZOBÁK ---
    const roomCounts = {};
    tasks.forEach(t => {
        if (t.room) roomCounts[t.room] = (roomCounts[t.room] || 0) + 1;
    });
    
    const sortedRooms = Object.entries(roomCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    
    document.getElementById('top-rooms-list').innerHTML = sortedRooms.map(([room, count], idx) => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding: 10px 0; border-bottom: 1px solid #eee;">
            <div>
                <span style="font-weight:bold; color:var(--primary);">#${idx+1}</span>
                <span style="margin-left:10px; font-weight:600;">${room}</span>
            </div>
            <span class="badge" style="background:#eee; color:#333;">${count} db</span>
        </div>
    `).join('') || '<div class="text-muted">Nincs elég adat.</div>';
}

/**
 * Univerzális Donut Chart Rajzoló (CSS Conic Gradient)
 * @param {string} chartId - A diagram DIV ID-ja
 * @param {string} legendId - A jelmagyarázat DIV ID-ja
 * @param {object} dataObj - Adatok {kulcs: érték}
 * @param {object} colorMap - Színek {kulcs: színkód}
 * @param {object} labelMap - Opcionális címke fordítás {kulcs: szép név}
 */
function renderDonutChart(chartId, legendId, dataObj, colorMap, labelMap) {
    const total = Object.values(dataObj).reduce((a, b) => a + b, 0);
    let currentDeg = 0;
    let gradientParts = [];
    let legendHtml = '';

    // Ha nincs adat, szürke kör
    if (total === 0) {
        document.getElementById(chartId).style.background = '#eee';
        document.getElementById(legendId).innerHTML = '<span style="color:#999">Nincs adat</span>';
        return;
    }

    for (const [key, value] of Object.entries(dataObj)) {
        if (value === 0) continue;

        const percent = (value / total) * 100;
        const deg = (value / total) * 360;
        const color = colorMap[key] || '#999';
        const label = labelMap ? (labelMap[key] || key) : key;

        // CSS Gradient építése: "color startDeg endDeg"
        gradientParts.push(`${color} ${currentDeg}deg ${currentDeg + deg}deg`);
        currentDeg += deg;

        // Jelmagyarázat építése
        legendHtml += `
            <div class="legend-item">
                <div class="legend-color" style="background: ${color}"></div>
                <div style="flex:1;">${label}</div>
                <div style="font-weight:bold;">${Math.round(percent)}%</div>
            </div>
        `;
    }

    const chartEl = document.getElementById(chartId);
    if (chartEl) {
        chartEl.style.background = `conic-gradient(${gradientParts.join(', ')})`;
    }
    
    const legendEl = document.getElementById(legendId);
    if (legendEl) {
        legendEl.innerHTML = legendHtml;
    }
}

/**
 * Részletes statisztikák frissítése
 */
function updateDetailedStatistics() {
    const detailedStats = document.getElementById("detailedStats");
    if (!detailedStats) return;
    
    const userStats = {};
    const categoryStats = {};
    
    // Adatok összegyűjtése
    tasks.forEach(task => {
        // Felhasználói statisztikák
        if (task.userId) {
            if (!userStats[task.userId]) {
                userStats[task.userId] = { 
                    created: 0, 
                    completed: 0, 
                    name: task.userNickname || "Ismeretlen" 
                };
            }
            
            userStats[task.userId].created++;
            
            if (task.status === "done") {
                userStats[task.userId].completed++;
            }
        }
        
        // Kategória statisztikák
        const category = task.category || "other";
        if (!categoryStats[category]) {
            categoryStats[category] = { total: 0, completed: 0 };
        }
        
        categoryStats[category].total++;
        
        if (task.status === "done") {
            categoryStats[category].completed++;
        }
    });
    
    // HTML generálás
    let html = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <div>
                <h4 style="margin-top: 0; color: var(--dark);">
                    Felhasználók teljesítménye
                </h4>
    `;
    
    // Felhasználók
    Object.entries(userStats).forEach(([userId, stats]) => {
        html += `
            <div style="margin-bottom: 15px; padding: 15px; background: oklch(98% .02 260 / .9); border-radius: 12px;">
                <div style="display: flex; justify-content: space-between;">
                    <strong>${stats.name}</strong>
                    <span>${stats.completed}/${stats.created}</span>
                </div>
            </div>
        `;
    });
    
    html += `
            </div>
            <div>
                <h4 style="margin-top: 0; color: var(--dark);">
                    Kategóriák
                </h4>
    `;
    
    // Kategóriák
    Object.entries(categoryStats).forEach(([category, stats]) => {
        const categoryLabel = CATEGORY_LABELS[category] || category;
        
        html += `
            <div style="margin-bottom: 15px; padding: 15px; background: oklch(98% .02 260 / .9); border-radius: 12px;">
                <div style="display: flex; justify-content: space-between;">
                    <strong>${categoryLabel}</strong>
                    <span>${stats.completed}/${stats.total}</span>
                </div>
            </div>
        `;
    });
    
    html += `
            </div>
        </div>
    `;
    
    detailedStats.innerHTML = html;
}

/**
 * Beállítások nézet inicializálása
 */
function initSettingsView() {
    const settingsView = document.getElementById("settingsView");
    if (!settingsView) return;
    
    settingsView.innerHTML = `
        <div class="glass-effect" style="margin: 20px; padding: 24px;">
            <h2 style="margin-top: 0; color: var(--dark);">
                <i class="fas fa-cog"></i> Beállítások
            </h2>
            
            <div class="settings-tabs">
                <button class="settings-tab active" data-tab="profile" onclick="switchSettingsTab('profile')">
                    <i class="fas fa-user"></i> Profil
                </button>
                <button class="settings-tab" data-tab="notifications" onclick="switchSettingsTab('notifications')">
                    <i class="fas fa-bell"></i> Értesítések
                </button>
            </div>
            
            <div class="settings-content">
                <div id="profileSettings" class="settings-tab-content">
                    <h3><i class="fas fa-user-edit"></i> Profil beállítások</h3>
                    <div class="profile-form" style="max-width: 500px;">
                        <div class="form-group">
                            <label>Email cím</label>
                            <input type="email" id="profileEmail" value="${currentUser?.email || ''}" disabled 
                                   style="width: 100%; padding: 15px; border-radius: 12px; background: oklch(95% .02 260);">
                        </div>
                        <div class="form-group">
                            <label>Niknév</label>
                            <input type="text" id="profileNickname" value="${currentUserNickname}" 
                                   style="width: 100%; padding: 15px; border-radius: 12px;">
                        </div>
                        <button class="btn" style="background: var(--primary); width: 100%;" onclick="updateProfile()">
                            <i class="fas fa-save"></i> Profil frissítése
                        </button>
                    </div>
                </div>
                
                <div id="notificationSettings" class="settings-tab-content" style="display: none;">
                    <h3><i class="fas fa-bell"></i> Értesítési beállítások</h3>
                    <div class="notification-form" style="max-width: 500px;">
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="ttsSetting" ${ttsEnabled ? "checked" : ""} 
                                       onchange="updateTTSEnabled()"> 
                                Hangértesítések (TTS)
                            </label>
                        </div>
                        <button class="btn" style="background: var(--secondary); width: 100%;" onclick="testTTS()">
                            <i class="fas fa-volume-up"></i> Hang teszt
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Beállítások lap váltása
 */
function switchSettingsTab(tabId) {
    // Aktív gomb
    document.querySelectorAll(".settings-tab").forEach(tab => {
        tab.classList.remove("active");
    });
    
    const activeTab = document.querySelector(`.settings-tab[data-tab="${tabId}"]`);
    if (activeTab) {
        activeTab.classList.add("active");
    }
    
    // Tartalom
    document.querySelectorAll(".settings-tab-content").forEach(content => {
        content.style.display = "none";
    });
    
    const activeContent = document.getElementById(tabId + "Settings");
    if (activeContent) {
        activeContent.style.display = "block";
    }
}

/**
 * Profil frissítése
 */
async function updateProfile() {
    const nicknameInput = document.getElementById("profileNickname");
    if (!nicknameInput) return;
    
    const nickname = nicknameInput.value.trim();
    
    if (!nickname) {
        showNotification("A niknév nem lehet üres!", "warning");
        return;
    }
    
    try {
        await db.collection("users")
            .doc(currentUser.uid)
            .update({
                nickname: nickname,
                updated: firebase.firestore.FieldValue.serverTimestamp()
            });
        
        // Globális változók frissítése
        currentUserNickname = nickname;
        userCache.set(currentUser.uid, nickname);
        
        // UI frissítése
        updateUserInterface();
        
        showNotification("Profil frissítve!", "success");
        
    } catch (error) {
        console.error("Hiba a profil frissítésekor:", error);
        showNotification("Hiba a profil frissítésekor", "error");
    }
}

/**
 * TTS beállítás frissítése
 */
function updateTTSEnabled() {
    const ttsCheckbox = document.getElementById("ttsSetting");
    if (!ttsCheckbox) return;
    
    ttsEnabled = ttsCheckbox.checked;
    localStorage.setItem("tts_enabled", ttsEnabled.toString());
    
    updateTTSButtons();
    
    showNotification(
        ttsEnabled ? "Hangértesítések bekapcsolva" : "Hangértesítések kikapcsolva",
        "success"
    );
}

/**
 * TTS teszt
 */
function testTTS() {
    speakText("Ez egy teszt üzenet a hangrendszer működésének ellenőrzéséhez.");
}

/**
 * Névjegy nézet inicializálása
 */
function initAboutView() {
    const aboutView = document.getElementById("aboutView");
    if (!aboutView) return;
    
    aboutView.innerHTML = `
        <div class="glass-effect" style="margin: 20px; padding: 24px;">
            <h2 style="margin-top: 0; color: var(--dark);">
                <i class="fas fa-info-circle"></i> Névjegy
            </h2>
            
            <div style="text-align: center; margin: 40px 0;">
                <div style="width: 120px; height: 120px; background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%); border-radius: 30px; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                    <i class="fas fa-hotel" style="color: white; font-size: 60px;"></i>
                </div>
                <h3 style="color: var(--dark);">Hotel Task Pro</h3>
                <p style="color: var(--gray);">v4.3</p>
            </div>
            
            <div style="margin: 40px 0; padding: 20px; background: oklch(98% .02 260 / .9); border-radius: 16px;">
                <h4 style="color: var(--dark); margin-top: 0;">Funkciók</h4>
                <ul style="color: var(--gray); line-height: 1.8;">
                    <li>Szoba állapot, és készlet nyilvántartás</li>
                    <li>Feladatkezelő tábla</li>
                    <li>Aura AI v1.6.1. Asszisztens</li>
                    <li>Hangvezérlés (TTS)</li>
                    <li>Hangfelismerés (diktálás)</li>
                    <li>Időszakos karbantartások nyomon követése</li>
                    <li>Adatok exportálása/importálása</li>
                </ul>
            </div>
                <p>Fejlesztő: ᛕᗩᒪᗩ _⊹ ʕ👀ʔ ♖ Miskolc</p>
            </div>
        </div>
    `;
}

/**
 * Export nézet inicializálása
 */
function initExportView() {
    const exportView = document.getElementById("exportView");
    if (!exportView) return;
    
    exportView.innerHTML = `
        <div class="glass-effect" style="margin: 20px; padding: 24px;">
            <h2 style="margin-top: 0; color: var(--dark);">
                <i class="fas fa-database"></i> Adatkezelés
            </h2>
            
            <div class="data-actions">
                <div class="export-section">
                    <h3><i class="fas fa-download"></i> Adatok exportálása</h3>
                    <div class="export-options" style="margin-top: 20px;">
                        <label style="display: block; margin-bottom: 10px;">
                            <input type="checkbox" id="exportTasks" checked> Feladatok
                        </label>
                        <label style="display: block; margin-bottom: 10px;">
                            <input type="checkbox" id="exportRooms" checked> Szoba állapotok
                        </label>
                        <button onclick="exportData('json')" class="btn" 
                                style="background: var(--secondary); margin-top: 10px; width: 100%;">
                            <i class="fas fa-file-export"></i> Export JSON
                        </button>
                    </div>
                </div>
                
                <div class="import-section" style="margin-top: 30px;">
                    <h3><i class="fas fa-upload"></i> Adatok importálása</h3>
                    <div class="import-options" style="margin-top: 20px;">
                        <input type="file" id="importFile" accept=".json" 
                               style="width: 100%; padding: 15px; border-radius: 12px; margin-bottom: 10px;">
                        <label style="display: block; margin-bottom: 10px;">
                            <input type="checkbox" id="importMerge"> Meglévő adatok megtartása
                        </label>
                        <button onclick="importData()" class="btn" 
                                style="background: var(--primary); width: 100%;">
                            <i class="fas fa-file-import"></i> Importálás
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Adatok exportálása
 */
async function exportData(format = "json") {
    const exportTasks = document.getElementById("exportTasks")?.checked || false;
    const exportRooms = document.getElementById("exportRooms")?.checked || false;
    
    // Export adatok összeállítása
    const data = {
        metadata: {
            exportedAt: new Date().toISOString(),
            exportedBy: currentUserNickname,
            userId: currentUser?.uid,
            format: format
        },
        tasks: exportTasks ? tasks : [],
        rooms: exportRooms ? rooms : [],
        users: allUsers
    };
    
    // JSON formázás
    const content = JSON.stringify(data, null, 2);
    
    // Fájl létrehozása
    const filename = `hotel_task_pro_export_${new Date().toISOString().split("T")[0]}.json`;
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    // Letöltés indítása
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Memória felszabadítása
    URL.revokeObjectURL(url);
    
    showNotification(`Adatok exportálva: ${filename}`, "success");
}

/**
 * Adatok importálása
 */
async function importData() {
    const fileInput = document.getElementById("importFile");
    const mergeData = document.getElementById("importMerge")?.checked || false;
    
    if (!fileInput || !fileInput.files.length) {
        showNotification("Válassz egy fájlt!", "error");
        return;
    }
    
    const file = fileInput.files[0];
    const reader = new FileReader();
    
    reader.onload = async function(e) {
        try {
            const content = e.target.result;
            const data = JSON.parse(content);
            
            // Meglévő adatok törlése (ha nem merge)
            if (!mergeData) {
                await clearAllData(true);
            }
            
            let importedCount = 0;
            
            // Feladatok importálása
            if (data.tasks && Array.isArray(data.tasks)) {
                for (const task of data.tasks) {
                    const { id, ...taskData } = task;
                    await db.collection("tasks").add(taskData);
                    importedCount++;
                }
            }
            
            // Szobák importálása
            if (data.rooms && Array.isArray(data.rooms)) {
                for (const room of data.rooms) {
                    await db.collection("rooms").doc(room.number).set(room);
                    importedCount++;
                }
            }
            
            showNotification(`${importedCount} elem importálva sikeresen`, "success");
            
            // UI frissítése
            setTimeout(() => {
                renderTasks();
                renderRoomGrid();
                updateStatistics();
            }, 1000);
            
        } catch (error) {
            console.error("Importálási hiba:", error);
            showNotification(`Importálási hiba: ${error.message}`, "error");
        }
    };
    
    reader.readAsText(file);
}

/**
 * Összes adat törlése
 */
async function clearAllData(silent = false) {
    if (!silent && !confirm("Biztosan törli az összes adatot?")) {
        return;
    }
    
    try {
        // Feladatok törlése
        const tasksDelete = db.collection("tasks").get()
            .then(snapshot => {
                const deletions = [];
                snapshot.forEach(doc => {
                    deletions.push(doc.ref.delete());
                });
                return Promise.all(deletions);
            });
        
        // Szobák alaphelyzetbe állítása
        const roomsReset = rooms.map(room => 
            db.collection("rooms").doc(room.id).update({
                status: "green",
                notes: "",
                longTermTasks: "",
                inventory: "",
                bathroomNotes: "",
                bathroomLongTermTasks: "",
                bathroomInventory: "",
                heliosLastCleaned: null,
                fanCoilLastCleaned: null,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            })
        );
        
        await Promise.all([tasksDelete, ...roomsReset]);
        
        if (!silent) {
            showNotification("Összes adat törölve", "success");
        }
        
    } catch (error) {
        console.error("Hiba az adatok törlésekor:", error);
        if (!silent) {
            showNotification("Hiba az adatok törlésekor", "error");
        }
    }
}

/* ==========================================================================
   20. PLUGIN RENDSZER
   ========================================================================== */

let nexusAI = null;

/**
 * Plugin rendszer inicializálása
 */
function initPluginSystem() {
    // Csak Admin láthatja a menüt
    const pluginMenuBtn = document.getElementById('pluginMenuBtn');
    if (pluginMenuBtn && currentUserRole === 'admin') {
        pluginMenuBtn.style.display = 'flex';
    }

    // AI Plugin betöltése
    loadAIPlugin();
}

/**
 * AI Plugin betöltése
 */
function loadAIPlugin() {
    // Ellenőrizzük, hogy engedélyezve van-e a plugin
    const settings = JSON.parse(localStorage.getItem('plugin_settings') || '{"ai_chat": true}');
    
    if (settings.ai_chat && typeof AIChatPlugin !== 'undefined') {
        // AppData objektum a context megosztáshoz
        const appData = {
            tasks: window.tasks || [], // Globális tasks változó
            rooms: window.rooms || [], // Globális rooms változó
            currentUserNickname: window.currentUserNickname || ''
        };

        nexusAI = new AIChatPlugin(db, auth, appData);
        nexusAI.init();
        
        // Globális hozzáférés
        window.nexusAI = nexusAI;
        
        console.log("NEXUS AI plugin betöltve");
    } else {
        const container = document.getElementById('ai-chat-plugin-container');
        if (container) {
            container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--gray)">A NEXUS AI modul ki van kapcsolva.</div>';
        }
    }
}

/**
 * Plugin nézet inicializálása
 */
function initPluginView() {
    const pluginsView = document.getElementById("pluginsView");
    if (!pluginsView) return;
    
    renderPluginView();
}

/**
 * Plugin nézet renderelése
 */
function renderPluginView() {
    const view = document.getElementById('pluginsView');
    if (!view) return;

    const apiKey = localStorage.getItem('groq_api_key') || '';
    const settings = JSON.parse(localStorage.getItem('plugin_settings') || '{"ai_chat": true}');

    view.innerHTML = `
        <div class="glass-effect" style="margin: 20px; padding: 24px;">
            <h2 style="margin-top: 0; color: var(--dark);">
                <i class="fas fa-microchip"></i> Plugin Asszisztens
            </h2>
            
            <div class="plugin-card" style="background: var(--card-bg); padding: 20px; border-radius: 12px; border: 1px solid oklch(90% .05 260); margin-bottom: 20px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px">
                    <h3 style="margin:0"><i class="fas fa-brain"></i> Aura AI Asszisztens</h3>
                    <label class="switch">
                        <input type="checkbox" id="aiPluginToggle" ${settings.ai_chat ? 'checked' : ''} onchange="togglePlugin('ai_chat', this.checked)">
                        <span class="slider round"></span>
                    </label>
                </div>
                <p style="color:var(--gray); font-size:0.9rem">
                    A NEXUS AI hozzáfér a feladatlistához és a szobaállapotokhoz, hogy segítse a munkát.
                    Képes feladatokat létrehozni és lekérdezéseket végezni.
                </p>
                
                <div style="margin-top: 15px;">
                    <label style="display:block; margin-bottom:8px; font-weight:bold">Groq API Kulcs</label>
                    <div style="display:flex; gap:10px">
                        <input type="password" id="groqApiKeyInput" value="${apiKey}" placeholder="gsk_..." style="flex:1; padding:10px; border-radius:8px; border:1px solid #ccc">
                        <button class="btn" onclick="saveGroqKey()" style="background:var(--primary)">Mentés</button>
                    </div>
                    <small style="color:var(--gray)">Az API kulcs csak a böngésződben (localStorage) tárolódik.</small>
                </div>
            </div>
            
            <div class="notification" style="background:var(--info); display:block; position:relative; width:auto; right:auto; top:auto;">
                <i class="fas fa-info-circle"></i> A változtatások érvénybe léptetéséhez frissítsd az oldalt.
            </div>
        </div>
    `;
}

/**
 * Plugin be/kapcsolása
 */
function togglePlugin(pluginName, isEnabled) {
    const settings = JSON.parse(localStorage.getItem('plugin_settings') || '{}');
    settings[pluginName] = isEnabled;
    localStorage.setItem('plugin_settings', JSON.stringify(settings));
    showNotification("Plugin állapot módosítva (Frissítés szükséges)");
}

/**
 * Groq API kulcs mentése
 */
function saveGroqKey() {
    const key = document.getElementById('groqApiKeyInput').value.trim();
    localStorage.setItem('groq_api_key', key);
    // Frissítsük az élő példányt is
    if (nexusAI) nexusAI.groqApiKey = key;
    showNotification("API kulcs mentve!");
}

/* ==========================================================================
   21. ALKALMAZÁS INDÍTÁSA
   ========================================================================== */

/**
 * DOM betöltésének kezelése
 */
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM betöltve, alkalmazás indítása...");
    
    // Mobilon alapértelmezetten összecsukjuk a szoba státuszt
    if (window.innerWidth <= 768) {
        const saved = localStorage.getItem("collapsible_states");
        if (!saved) {
            const roomStatusContent = document.getElementById("room-status-content");
            const roomStatusHeader = document.getElementById("room-status-header");
            
            if (roomStatusContent && roomStatusHeader) {
                roomStatusContent.classList.add("collapsed");
                roomStatusHeader.classList.add("collapsed");
            }
        }
    }
    
    // Alkalmazás inicializálása
    initializeApp();
});

/**
 * Hibakezelés globális szinten
 */
window.addEventListener('error', function(event) {
    console.error("Globális hiba:", event.error);
    
    // UI elemek ellenőrzése (a második hiba kijavításához)
    if (event.message && event.message.includes("Cannot set properties of null")) {
        console.warn("UI elem nem található, lehet a DOM még nem töltődött be teljesen");
    }
});

console.log("Script.js betöltve és inicializálva");

/* ==========================================================================
   22. HIBAKEZELÉS ÉS VISSZAÁLLÍTÁS
   ========================================================================== */

/**
 * Firebase kapcsolat ellenőrzése
 */
function checkFirebaseConnection() {
    if (!db) {
        console.error("Firebase nincs inicializálva");
        return false;
    }
    
    // Próbáljunk egy egyszerű lekérdezést
    db.collection("system").doc("connection_test").get()
        .then(() => {
            console.log("Firebase kapcsolat OK");
            return true;
        })
        .catch((error) => {
            console.error("Firebase kapcsolat hiba:", error);
            return false;
        });
}

/**
 * Alkalmazás visszaállítása alaphelyzetbe
 */
function resetApplication() {
    if (confirm("Biztosan visszaállítja az alkalmazást az alapértelmezett állapotba? Minden beállítás visszaáll, de az adatok megmaradnak.")) {
        localStorage.clear();
        sessionStorage.clear();
        location.reload();
    }
}

/**
 * Adatbázis kapcsolat tesztelése
 */
function testDatabaseConnection() {
    const startTime = Date.now();
    
    db.collection("system").doc("connection_test").get()
        .then(() => {
            const endTime = Date.now();
            const ping = endTime - startTime;
            showNotification(`Adatbázis kapcsolat OK (${ping}ms)`, "success");
        })
        .catch((error) => {
            showNotification(`Adatbázis kapcsolat hiba: ${error.message}`, "error");
        });
}

/* ==========================================================================
   23. GLOBÁLIS VÁLTOZÓK EXPORTÁLÁSA AI MODULHOZ
   ========================================================================== */

/**
 * Globális változók exportálása az AI plugin számára
 */
window.exportTasksToNexus = function() {
    window.tasks = tasks;
    window.rooms = rooms;
    window.currentUserNickname = currentUserNickname;
    
    // Frissítsük az AI adatokat
    if (window.nexusAI && typeof window.nexusAI.refreshData === 'function') {
        window.nexusAI.refreshData();
    }
};

/**
 * Az eredeti függvények mentése a felülírás előtt
 */
const originalInitTasks = initTasks;
const originalInitRooms = initRooms;
const originalAddTask = addTask;

/**
 * Feladatok inicializálásának frissítése - AI integráció
 */
function initTasksWithAI() {
    originalInitTasks();
    window.exportTasksToNexus(); // Adatok küldése az AI-nek
}

/**
 * Szobák inicializálásának frissítése - AI integráció
 */
function initRoomsWithAI() {
    originalInitRooms();
    window.exportTasksToNexus(); // Adatok küldése az AI-nek
}

/**
 * Feladat hozzáadásának frissítése - AI integráció
 */
function addTaskWithAI() {
    originalAddTask();
    setTimeout(() => {
        window.exportTasksToNexus(); // Kis késleltetés az adatbázis szinkronizáláshoz
    }, 1000);
}

/**
 * Függvények felülírása az AI integrált verziókkal
 */
initTasks = initTasksWithAI;
initRooms = initRoomsWithAI;
addTask = addTaskWithAI;

/**
 * AI modul adatok inicializálása az alkalmazás indításakor
 */
function initAIData() {
    setTimeout(() => {
        if (typeof window.exportTasksToNexus === 'function') {
            window.exportTasksToNexus();
        }
    }, 3000); // 3 másodperc várakozás az alkalmazás teljes betöltéséhez
}

// AI adatok inicializálása
initAIData();

// ================================ KÖVETKEZŐ SOROK ================================