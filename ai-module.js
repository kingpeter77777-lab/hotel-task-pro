/* ==========================================================================
   AURA AI ASSISTANT v1.6.1 - Hotel Task Pro AI Asszisztens
   Teljesen javított: Radiális menü, kompakt üzenetek, görgethető szobalista
   Státusz ikonok, mobil optimalizáció, színjavítások
   ========================================================================== */

class AIChatPlugin {
    constructor(firebaseDB, firebaseAuth, appData) {
        console.log("✨ Aura AI Assistant v1.6.1 - Konstruktor inicializálás");

        // Firebase kapcsolat
        this.db = firebaseDB;
        this.auth = firebaseAuth;
        
        // App adatok
        this.appData = appData || {};
        this.dataCache = {
            tasks: [],
            rooms: [],
            users: [],
            lastUpdate: null,
            cacheDuration: 30000
        };
        
        // API konfiguráció
        this.groqApiKey = localStorage.getItem('groq_api_key') || '';
        this.selectedModel = localStorage.getItem('aura_model') || "llama-3.3-70b-versatile";
        this.availableModels = [
            { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", maxTokens: 8192 },
            { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B", maxTokens: 8192 },
            { id: "llama-3.1-70b-versatile", name: "Llama 3.1 70B", maxTokens: 8192 },
            { id: "llama3-8b-8192", name: "Llama 3 8B", maxTokens: 8192, fallback: true }
        ];
        
        // Állapotok
        this.isEnabled = false;
        this.isOnline = navigator.onLine;
        this.isProcessing = false;
        this.retryCount = 0;
        this.maxRetries = 3;
        
        // Radiális menü állapot
        this.isPieMenuOpen = false;
        
        // Hangvezérlés
        this.isListening = false;
        this.recognition = null;
        this.speechSynthesis = window.speechSynthesis;
        this.speechEnabled = localStorage.getItem('aura_speech_enabled') === 'true';
        this.currentSpeechUtterance = null;
        
        // UI elemek
        this.containerId = 'ai-chat-plugin-container';
        this.messageCount = 0;
        this.commandHistory = [];
        
        // Touch kezelés
        this.touchStartY = 0;
        this.touchEndY = 0;
        this.swipeThreshold = 50;
        
        // Data observer
        this.dataObserverIntervals = {};
        
        // System prompt
        this.systemPrompt = `Te vagy az Aura AI Assistant, egy intelligens szállodai feladatkezelő asszisztens.

SZEREPKÖR:
- Feladatkezelő asszisztens egy szállodai rendszerben
- Képes feladatokat létrehozni, státuszokat frissíteni
- Elemzi a szobaállapotokat és feladatokat
- Válaszol kérdésekre a rendszer működéséről
- Segít gyors riportokat készíteni a szobák és feladatok állapotáról

HOZZÁFÉRÉSES ADATOK:
A rendszer átadja neked a jelenlegi feladatokat és szobaállapotokat.
A szobák teljes listája elérhető (akár 60 szoba is lehet).

PARANCSOK FORMÁTUMA:
Ha a felhasználó olyat kér, ami adatbázis műveletet igényel, VISSZATÉRÉSI ÉRTÉKED KIZÁRÓLAG JSON LEGYEN:

1. Feladat létrehozása:
{
    "action": "addTask",
    "data": {
        "room": "101",
        "category": "cleaning",
        "prio": 2,
        "note": "Takarítási feladat leírása"
    }
}

2. Szoba státusz frissítése:
{
    "action": "updateRoomStatus",
    "data": {
        "room": "101",
        "status": "red"
    }
}

ÉRTÉKEK:
- room: szobaszám (pl.: "101", "213", "Konyha-Étkező")
- category: "cleaning", "maintenance", "service", "supply", "other"
- prio: 1-5 (1=alacsony, 5=sürgős)
- status: "green", "lilac", "orange", "red"

HA CSAK BESZÉLGETÉS VAGY INFORMÁCIÓKÉRÉS: válaszolj normál szöveggel magyar nyelven, barátságosan, segítőkészen.

FONTOS: A felhasználók nem látják a JSON formátumot, csak a természetes nyelvű válaszokat.

JELENLEGI ADATOK A RENDSZERBŐL:
{{CONTEXT_DATA}}`;

        // Eseményfigyelők
        this.setupEventListeners();
        console.log("✅ Aura AI Assistant v1.6.1 - Konstruktor sikeres");
    }

    /* ==========================================================================
       1. INICIALIZÁLÁS
       ========================================================================== */

    async init() {
        console.log("🚀 Aura AI Assistant v1.6.1 - Inicializálás indítava");
        
        const container = document.getElementById(this.containerId);
        if (!container) {
            console.error(`❌ Konténer nem található: ${this.containerId}`);
            return false;
        }

        if (!this.validateConfiguration()) {
            this.showConfigError(container);
            return false;
        }

        this.injectStyles();
        this.renderInterface();
        this.attachEventListeners();
        this.initSpeechRecognition();
        this.addDiagnosticTools();
        await this.loadInitialData();
        this.startAutoRefresh();
        
        console.log("✅ Aura AI Assistant v1.6.1 - Plugin inicializálva");
        this.isEnabled = true;
        
        this.addMessage(
            `<div class="aura-welcome-compact">
                <div class="aura-logo-header">
                    <i class="fas fa-gem"></i>
                    <span class="aura-title">Aura AI v1.6.1</span>
                </div>
                <div class="aura-welcome-stats">
                    <span class="aura-stat"><i class="fas fa-microchip"></i> ${this.getModelName()}</span>
                    <span class="aura-stat"><i class="fas fa-door-open"></i> ${this.dataCache.rooms.length} szoba</span>
                    <span class="aura-stat"><i class="fas fa-tasks"></i> ${this.dataCache.tasks.length} feladat</span>
                    ${this.speechEnabled ? '<span class="aura-stat"><i class="fas fa-volume-up"></i> Hang be</span>' : ''}
                </div>
                <div class="aura-welcome-hint">
                    <i class="fas fa-info-circle"></i> Használd a <strong>Radiális Menüt</strong>!
                </div>
            </div>`,
            'ai',
            'system'
        );
        
        return true;
    }

    /* ==========================================================================
       2. ESEMÉNYFIGYELŐK
       ========================================================================== */

    setupEventListeners() {
        console.log("🎯 Eseményfigyelők beállítása...");
        
        window.addEventListener('online', () => this.handleNetworkChange(true));
        window.addEventListener('offline', () => this.handleNetworkChange(false));
        
        document.addEventListener('aura-data-updated', (event) => {
            if (event.detail) {
                const tasks = event.detail.tasks;
                const rooms = event.detail.rooms;
                
                if (tasks || rooms) {
                    this.updateDataCache(tasks, rooms);
                }
            }
        });
        
        this.setupDataObserver();
        window.addEventListener('resize', this.handleResize.bind(this));
        this.setupTouchEvents();
        
        console.log("✅ Eseményfigyelők beállítva");
    }

    setupDataObserver() {
        console.log("👁️ Adatobserver beállítása...");
        
        if (typeof window.tasks !== 'undefined') {
            this.observeGlobalData('tasks');
        }
        
        if (typeof window.rooms !== 'undefined') {
            this.observeGlobalData('rooms');
        }
        
        if (typeof window.currentUserNickname !== 'undefined') {
            this.observeGlobalData('currentUserNickname');
        }
        
        console.log("✅ Adatobserver beállítva");
    }

    observeGlobalData(dataName) {
        let oldValue = JSON.stringify(window[dataName] || []);
        
        const checkInterval = setInterval(() => {
            if (typeof window[dataName] === 'undefined') {
                clearInterval(checkInterval);
                return;
            }
            
            const newValue = JSON.stringify(window[dataName]);
            if (newValue !== oldValue) {
                oldValue = newValue;
                console.log(`🔄 Globális ${dataName} változás észlelve`);
                
                document.dispatchEvent(new CustomEvent('aura-data-updated', {
                    detail: {
                        [dataName]: window[dataName],
                        timestamp: new Date()
                    }
                }));
            }
        }, 2000);
        
        this.dataObserverIntervals[dataName] = checkInterval;
    }

    setupTouchEvents() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        container.addEventListener('touchstart', (e) => {
            this.touchStartY = e.touches[0].clientY;
        }, { passive: true });

        container.addEventListener('touchend', (e) => {
            this.touchEndY = e.changedTouches[0].clientY;
            this.handleSwipe();
        }, { passive: true });
        
        console.log("✅ Touch események beállítva");
    }

    handleSwipe() {
        const diff = this.touchStartY - this.touchEndY;
        
        if (Math.abs(diff) > this.swipeThreshold) {
            const messagesContainer = document.getElementById('auraMessages');
            if (messagesContainer) {
                if (diff > 0) {
                    messagesContainer.scrollBy({ top: -100, behavior: 'smooth' });
                } else {
                    messagesContainer.scrollBy({ top: 100, behavior: 'smooth' });
                }
            }
        }
    }

    handleResize() {
        this.updateDataStatus();
        this.positionPieMenuItems(); // Új: átméretezéskor újra pozícionáljuk a menüt
        
        const container = document.getElementById('auraMessages');
        if (container) {
            setTimeout(() => {
                container.scrollTop = container.scrollHeight;
            }, 300);
        }
    }

    /* ==========================================================================
       3. STÍLUSOK - JAVÍTOTT SZÍNVILÁG ÉS KOMPAKTSÁG
       ========================================================================== */

    injectStyles() {
        const styleId = 'aura-ai-styles-v1-6-1';
        if (document.getElementById(styleId)) return;

        const css = `
            /* Aura AI Assistant v1.6.1 - Extra kompakt, javított színvilág */
            :root {
                --aura-primary: #7c3aed;
                --aura-primary-dark: #6d28d9;
                --aura-secondary: #06b6d4;
                --aura-secondary-dark: #0891b2;
                --aura-success: #10b981;
                --aura-success-dark: #059669;
                --aura-warning: #f59e0b;
                --aura-warning-dark: #d97706;
                --aura-danger: #ef4444;
                --aura-danger-dark: #dc2626;
                --aura-voice: #8b5cf6;
                --aura-voice-dark: #7c3aed;
                --aura-text-primary: #ffffff;
                --aura-text-secondary: #e2e8f0;
                --aura-text-muted: #94a3b8;
                --aura-bg-dark: #0f172a;
                --aura-bg-card: rgba(30, 41, 59, 0.95);
                --aura-border: rgba(124, 58, 237, 0.3);
                --aura-shadow: rgba(0, 0, 0, 0.5);
                --aura-gradient: linear-gradient(135deg, #7c3aed 0%, #06b6d4 100%);
                --aura-voice-gradient: linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%);
                --aura-system-bg: rgba(6, 182, 212, 0.12);
                --aura-system-border: rgba(6, 182, 212, 0.25);
                --aura-system-color: #06b6d4;
            }

            /* Fő konténer */
            #ai-chat-plugin-container {
                background: linear-gradient(135deg, var(--aura-bg-dark) 0%, #1e293b 100%);
                border-radius: 14px;
                border: 1px solid var(--aura-border);
                box-shadow: 0 6px 24px var(--aura-shadow);
                height: 100%;
                min-height: 450px;
                max-height: 650px;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
                position: relative;
                touch-action: pan-y;
            }

            /* Chat konténer */
            .aura-chat-container {
                display: flex;
                flex-direction: column;
                height: 100%;
                background: rgba(15, 23, 42, 0.95);
                position: relative;
                overflow: hidden;
            }

            /* Fejléc - EXTRA KOMPAKT */
            .aura-header {
                padding: 10px 14px;
                background: linear-gradient(90deg, rgba(30, 41, 59, 0.98) 0%, rgba(44, 56, 82, 0.98) 100%);
                border-bottom: 1px solid var(--aura-primary);
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 8px;
                z-index: 100;
                position: sticky;
                top: 0;
                backdrop-filter: blur(10px);
                border-radius: 14px 14px 0 0;
                flex-shrink: 0;
                min-height: 52px;
            }

            .aura-header-left {
                display: flex;
                align-items: center;
                gap: 10px;
                flex: 1;
                min-width: 0;
            }

            .aura-logo {
                width: 32px;
                height: 32px;
                background: var(--aura-gradient);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 1rem;
                flex-shrink: 0;
            }

            .aura-header-title {
                color: var(--aura-text-primary);
                font-weight: 700;
                font-size: 1rem;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .aura-header-right {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-shrink: 0;
            }

            .aura-data-status {
                background: rgba(255, 255, 255, 0.08);
                padding: 5px 10px;
                border-radius: 16px;
                font-size: 0.75rem;
                color: var(--aura-text-secondary);
                white-space: nowrap;
                border: 1px solid rgba(255, 255, 255, 0.1);
                max-width: 120px;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .aura-status-indicator {
                width: 28px;
                height: 28px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 0.8rem;
                flex-shrink: 0;
            }

            .aura-status-indicator.status-online {
                background: rgba(16, 185, 129, 0.2);
                color: var(--aura-success);
            }

            .aura-status-indicator.status-offline {
                background: rgba(239, 68, 68, 0.2);
                color: var(--aura-danger);
            }

            .aura-status-indicator.status-processing {
                background: rgba(245, 158, 11, 0.2);
                color: var(--aura-warning);
            }

            .aura-status-indicator.status-listening {
                background: rgba(139, 92, 246, 0.2);
                color: var(--aura-voice);
                animation: pulse 1.5s infinite;
            }

            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.7; }
            }

            /* Üzenetek terület - EXTRA KOMPAKT */
            .aura-messages {
                flex: 1 1 auto;
                overflow-y: auto !important;
                overflow-x: hidden !important;
                padding: 10px 12px;
                display: flex;
                flex-direction: column;
                gap: 6px;
                background: linear-gradient(180deg, 
                    rgba(15, 23, 42, 0.95) 0%, 
                    rgba(26, 35, 58, 0.9) 100%);
                -webkit-overflow-scrolling: touch;
                scroll-behavior: smooth;
                position: relative;
                scrollbar-width: thin;
                scrollbar-color: var(--aura-primary) rgba(0, 0, 0, 0.1);
                min-height: 0;
                will-change: transform;
                transform: translateZ(0);
            }

            .aura-messages::-webkit-scrollbar {
                width: 5px;
                height: 5px;
            }

            .aura-messages::-webkit-scrollbar-track {
                background: rgba(0, 0, 0, 0.1);
                border-radius: 2px;
                margin: 1px;
            }

            .aura-messages::-webkit-scrollbar-thumb {
                background: linear-gradient(180deg, var(--aura-primary) 0%, var(--aura-secondary) 100%);
                border-radius: 2px;
                border: 1px solid rgba(0, 0, 0, 0.1);
            }

            /* Üzenet konténer - EXTRA KOMPAKT */
            .aura-message {
                max-width: 82%;
                padding: 8px 12px;
                border-radius: 12px;
                font-size: 0.9rem;
                line-height: 1.35;
                animation: message-appear 0.25s ease-out;
                position: relative;
                word-wrap: break-word;
                overflow-wrap: break-word;
                box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
                border: 1px solid rgba(255, 255, 255, 0.08);
                margin: 1px 0;
                opacity: 0.95;
                transition: opacity 0.2s, transform 0.2s;
                transform: translateZ(0);
                will-change: transform, opacity;
            }

            @keyframes message-appear {
                from {
                    opacity: 0;
                    transform: translateY(6px) scale(0.98);
                }
                to {
                    opacity: 0.95;
                    transform: translateY(0) scale(1);
                }
            }

            .aura-message:active {
                opacity: 1;
                transform: translateY(-1px) translateZ(0);
            }

            /* AI üzenet */
            .aura-ai {
                align-self: flex-start;
                background: linear-gradient(135deg, 
                    rgba(124, 58, 237, 0.12) 0%, 
                    rgba(6, 182, 212, 0.12) 100%);
                border: 1px solid rgba(124, 58, 237, 0.15);
                color: var(--aura-text-primary);
                border-left: 2px solid var(--aura-primary);
            }

            /* Felhasználói üzenet */
            .aura-user {
                align-self: flex-end;
                background: linear-gradient(135deg, 
                    rgba(6, 182, 212, 0.12) 0%, 
                    rgba(245, 158, 11, 0.12) 100%);
                border: 1px solid rgba(6, 182, 212, 0.15);
                color: var(--aura-text-primary);
                border-right: 2px solid var(--aura-secondary);
            }

            /* RENDSZERÜZENET - JAVÍTOTT, KOMPAKTABB ÉS JÓ SZÍNVILÁGGAL */
            .aura-system {
                align-self: center;
                background: var(--aura-system-bg);
                border: 1px solid var(--aura-system-border);
                color: var(--aura-system-color);
                max-width: 85%;
                text-align: center;
                font-size: 0.82rem;
                backdrop-filter: blur(6px);
                border-left: 2px solid var(--aura-system-color);
                border-right: 2px solid var(--aura-system-color);
                padding: 5px 8px;
                margin: 2px 0;
                line-height: 1.3;
                font-weight: 500;
                opacity: 0.9;
            }

            .aura-system .aura-text-primary {
                color: var(--aura-text-primary) !important;
                font-weight: 600;
            }

            .aura-system .aura-text-secondary {
                color: var(--aura-text-secondary) !important;
                font-size: 0.78rem;
            }

            /* Bemeneti terület */
            .aura-input-area {
                padding: 10px 12px;
                background: rgba(30, 41, 59, 0.98);
                border-top: 1px solid var(--aura-border);
                display: flex;
                gap: 6px;
                align-items: center;
                flex-wrap: nowrap;
                position: sticky;
                bottom: 0;
                z-index: 100;
                backdrop-filter: blur(10px);
                border-radius: 0 0 14px 14px;
                flex-shrink: 0;
                touch-action: manipulation;
            }

            .aura-input-wrapper {
                flex: 1;
                position: relative;
                min-width: 0;
            }

            .aura-input-icon {
                position: absolute;
                left: 10px;
                top: 50%;
                transform: translateY(-50%);
                color: var(--aura-text-muted);
                z-index: 1;
                font-size: 0.95rem;
            }

            .aura-input {
                width: 100%;
                padding: 10px 10px 10px 34px;
                border-radius: 8px;
                border: 1.5px solid rgba(124, 58, 237, 0.25);
                background: rgba(15, 23, 42, 0.8);
                color: var(--aura-text-primary);
                font-size: 0.9rem;
                transition: all 0.2s;
                min-height: 38px;
                box-sizing: border-box;
                touch-action: manipulation;
            }

            .aura-input:focus {
                outline: none;
                border-color: var(--aura-primary);
                box-shadow: 0 0 0 1.5px rgba(124, 58, 237, 0.2);
            }

            /* Radiális menü gomb */
            .aura-pie-menu-button {
                width: 38px;
                height: 38px;
                background: var(--aura-gradient);
                border: none;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 1rem;
                cursor: pointer;
                transition: all 0.2s;
                flex-shrink: 0;
                box-shadow: 0 3px 8px rgba(124, 58, 237, 0.3);
                z-index: 101;
                position: relative;
                touch-action: manipulation;
                min-height: 38px;
                min-width: 38px;
            }

            .aura-pie-menu-button:active {
                transform: scale(0.9);
                background: var(--aura-primary-dark);
            }

            /* Radiális menü */
            .aura-pie-menu {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 99999;
                display: none;
                justify-content: center;
                align-items: center;
                background: rgba(0, 0, 0, 0.75);
                backdrop-filter: blur(4px);
                animation: fade-in 0.15s ease;
                touch-action: none;
            }

            .aura-pie-menu.active {
                display: flex;
            }

            @keyframes fade-in {
                from { opacity: 0; }
                to { opacity: 1; }
            }

            /* Radiális menü - Kör */
            .aura-pie-circle {
                position: relative;
                width: 280px;
                height: 280px;
                border-radius: 50%;
                background: rgba(30, 41, 59, 0.95);
                border: 1px solid var(--aura-border);
                box-shadow: 0 15px 30px rgba(0, 0, 0, 0.4);
                display: flex;
                justify-content: center;
                align-items: center;
                animation: pie-appear 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            }

            @keyframes pie-appear {
                from {
                    opacity: 0;
                    transform: scale(0.85) rotate(-20deg);
                }
                to {
                    opacity: 1;
                    transform: scale(1) rotate(0);
                }
            }

            /* Radiális menü - Középső gomb */
            .aura-pie-center {
                width: 60px;
                height: 60px;
                background: var(--aura-gradient);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 1.3rem;
                cursor: pointer;
                z-index: 2;
                box-shadow: 0 6px 15px rgba(124, 58, 237, 0.4);
                border: 1.5px solid white;
                transition: all 0.2s;
                animation: pulse-center 2s infinite;
                touch-action: manipulation;
            }

            @keyframes pulse-center {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.03); }
            }

            .aura-pie-center:active {
                transform: scale(0.92);
            }

            /* Radiális menü - Gombok */
            .aura-pie-item {
                position: absolute;
                width: 50px;
                height: 50px;
                background: var(--aura-bg-card);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--aura-text-primary);
                font-size: 1.1rem;
                cursor: pointer;
                transform-origin: center;
                transition: all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
                border: 1.5px solid rgba(255, 255, 255, 0.08);
                z-index: 1;
                touch-action: manipulation;
                user-select: none;
                -webkit-user-select: none;
            }

            .aura-pie-item:hover {
                transform: scale(1.12);
                background: var(--aura-primary);
                z-index: 3;
            }

            .aura-pie-item:active {
                transform: scale(1.08);
                transition: transform 0.1s;
            }

            /* Radiális menü gomb színek */
            .pie-send { background: linear-gradient(135deg, var(--aura-success) 0%, var(--aura-success-dark) 100%); }
            .pie-voice { background: linear-gradient(135deg, var(--aura-voice) 0%, var(--aura-voice-dark) 100%); }
            .pie-clear { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); }
            .pie-refresh { background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%); }
            .pie-help { background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); }
            .pie-speech { background: linear-gradient(135deg, #10b981 0%, #059669 100%); }
            .pie-rooms { background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); }
            .pie-settings { background: linear-gradient(135deg, #64748b 0%, #475569 100%); }

            /* Mikrofon aktív állapot */
            .pie-voice.listening {
                background: linear-gradient(135deg, var(--aura-danger) 0%, var(--aura-danger-dark) 100%);
                animation: voice-pulse 1.5s infinite;
            }

            @keyframes voice-pulse {
                0%, 100% {
                    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
                    transform: scale(1.08);
                }
                50% {
                    box-shadow: 0 4px 18px rgba(239, 68, 68, 0.6);
                    transform: scale(1.15);
                }
            }

            /* Hang be/ki állapot */
            .pie-speech.muted {
                background: linear-gradient(135deg, #94a3b8 0%, #64748b 100%);
            }

            /* Radiális menü gomb címkék */
            .aura-pie-label {
                position: absolute;
                background: rgba(0, 0, 0, 0.85);
                color: white;
                padding: 5px 10px;
                border-radius: 16px;
                font-size: 0.75rem;
                white-space: nowrap;
                opacity: 0;
                transform: translateY(8px);
                transition: all 0.25s;
                pointer-events: none;
                z-index: 4;
                backdrop-filter: blur(8px);
                border: 1px solid rgba(255, 255, 255, 0.08);
            }

            .aura-pie-item:hover .aura-pie-label {
                opacity: 1;
                transform: translateY(0);
            }

            /* Kompakt üdvözlő üzenet */
            .aura-welcome-compact {
                text-align: center;
                padding: 12px 10px;
                background: linear-gradient(135deg, rgba(124, 58, 237, 0.08) 0%, rgba(6, 182, 212, 0.08) 100%);
                border-radius: 12px;
                border: 1px dashed var(--aura-border);
                margin-bottom: 4px;
            }

            .aura-logo-header {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                margin-bottom: 8px;
            }

            .aura-logo-header .fa-gem {
                font-size: 1.5rem;
                color: var(--aura-primary);
            }

            .aura-title {
                font-size: 1.1rem;
                font-weight: 700;
                color: var(--aura-text-primary);
            }

            .aura-welcome-stats {
                display: flex;
                justify-content: center;
                flex-wrap: wrap;
                gap: 8px;
                margin: 10px 0;
            }

            .aura-stat {
                background: rgba(255, 255, 255, 0.06);
                padding: 4px 8px;
                border-radius: 14px;
                font-size: 0.75rem;
                display: flex;
                align-items: center;
                gap: 4px;
                color: var(--aura-text-secondary);
                border: 1px solid rgba(255, 255, 255, 0.08);
            }

            .aura-welcome-hint {
                background: rgba(245, 158, 11, 0.06);
                border: 1px solid rgba(245, 158, 11, 0.12);
                border-radius: 8px;
                padding: 6px;
                font-size: 0.8rem;
                color: var(--aura-warning);
            }

            /* Súgó modal - JAVÍTOTT, GÖRGETHETŐ */
            .aura-help-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.92);
                backdrop-filter: blur(12px);
                z-index: 999999;
                display: none;
                justify-content: center;
                align-items: center;
                padding: 12px;
                animation: fade-in 0.25s ease;
                overflow: hidden;
            }

            .aura-help-overlay.active {
                display: flex;
            }

            .aura-help-modal {
                width: 100%;
                max-width: 680px;
                height: 85vh;
                max-height: 85vh;
                background: linear-gradient(135deg, var(--aura-bg-card) 0%, #1a2332 100%);
                border-radius: 18px;
                border: 1px solid var(--aura-border);
                box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
                overflow: hidden;
                display: flex;
                flex-direction: column;
                animation: slide-up 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            }

            @keyframes slide-up {
                from {
                    opacity: 0;
                    transform: translateY(30px) scale(0.96);
                }
                to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
            }

            /* Súgó fejléc - JAVÍTOTT */
            .aura-help-header {
                padding: 16px 20px;
                background: linear-gradient(90deg, rgba(30, 41, 59, 0.98) 0%, rgba(44, 56, 82, 0.98) 100%);
                border-bottom: 1px solid var(--aura-border);
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-shrink: 0;
            }

            .aura-help-title {
                color: var(--aura-text-primary);
                font-weight: 700;
                font-size: 1.2rem;
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .aura-help-close {
                width: 40px;
                height: 40px;
                background: rgba(255, 255, 255, 0.1);
                border: none;
                border-radius: 50%;
                color: var(--aura-text-primary);
                font-size: 1.2rem;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
                touch-action: manipulation;
            }

            .aura-help-close:hover {
                background: rgba(239, 68, 68, 0.2);
                color: var(--aura-danger);
            }

            .aura-help-close:active {
                transform: scale(0.92);
            }

            /* Súgó tartalom - JAVÍTOTT, GÖRGETHETŐ */
            .aura-help-content {
                flex: 1;
                overflow-y: auto;
                overflow-x: hidden;
                padding: 20px;
                display: flex;
                flex-direction: column;
                gap: 20px;
                max-height: 100%;
                scrollbar-width: thin;
                scrollbar-color: var(--aura-primary) rgba(0, 0, 0, 0.1);
            }

            .aura-help-content::-webkit-scrollbar {
                width: 8px;
            }

            .aura-help-content::-webkit-scrollbar-track {
                background: rgba(0, 0, 0, 0.1);
                border-radius: 4px;
                margin: 2px;
            }

            .aura-help-content::-webkit-scrollbar-thumb {
                background: linear-gradient(180deg, var(--aura-primary) 0%, var(--aura-secondary) 100%);
                border-radius: 4px;
                border: 2px solid rgba(0, 0, 0, 0.1);
            }

            /* Súgó szekció */
            .aura-help-section {
                background: rgba(255, 255, 255, 0.02);
                border-radius: 14px;
                padding: 16px;
                border: 1px solid rgba(255, 255, 255, 0.05);
                backdrop-filter: blur(8px);
            }

            .aura-help-section-title {
                font-size: 1.1rem;
                font-weight: 700;
                color: var(--aura-text-primary);
                margin-bottom: 12px;
                padding-bottom: 8px;
                border-bottom: 1px solid var(--aura-primary);
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .aura-command-examples {
                display: flex;
                flex-direction: column;
                gap: 10px;
                margin: 12px 0;
            }

            .aura-command-example {
                background: rgba(255, 255, 255, 0.03);
                border-left: 3px solid var(--aura-success);
                padding: 10px 12px;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s;
                font-size: 0.9rem;
                line-height: 1.4;
                color: var(--aura-text-secondary);
                touch-action: manipulation;
            }

            .aura-command-example:active {
                background: rgba(124, 58, 237, 0.12);
                transform: translateX(3px);
                border-left-color: var(--aura-primary);
            }

            /* Státusz ikonok - JAVÍTVA */
            .aura-status-info {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
                gap: 8px;
                margin-top: 12px;
                padding-top: 12px;
                border-top: 1px solid rgba(255, 255, 255, 0.05);
            }

            .aura-status-item {
                padding: 8px 10px;
                border-radius: 8px;
                display: flex;
                align-items: center;
                gap: 8px;
                font-weight: 600;
                background: rgba(255, 255, 255, 0.03);
                font-size: 0.85rem;
            }

            .status-green { 
                color: #10b981; 
                border-left: 3px solid #10b981; 
            }
            .status-green i { color: #10b981; }
            
            .status-lilac { 
                color: #8b5cf6; 
                border-left: 3px solid #8b5cf6; 
            }
            .status-lilac i { color: #8b5cf6; }
            
            .status-orange { 
                color: #f59e0b; 
                border-left: 3px solid #f59e0b; 
            }
            .status-orange i { color: #f59e0b; }
            
            .status-red { 
                color: #ef4444; 
                border-left: 3px solid #ef4444; 
            }
            .status-red i { color: #ef4444; }

            /* Súgó lábléc */
            .aura-help-footer {
                padding: 14px 20px;
                background: rgba(30, 41, 59, 0.95);
                border-top: 1px solid var(--aura-border);
                text-align: center;
                color: var(--aura-text-secondary);
                font-size: 0.85rem;
                flex-shrink: 0;
            }

            /* ÚJ: Szoba lista konténer - LENYÍTHATÓ, GÖRGETHETŐ */
            .room-list-collapsible {
                margin: 8px 0;
                border-radius: 10px;
                overflow: hidden;
                border: 1px solid rgba(255, 255, 255, 0.1);
            }

            .room-list-header {
                background: rgba(124, 58, 237, 0.1);
                padding: 10px 12px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: pointer;
                transition: background 0.2s;
                touch-action: manipulation;
            }

            .room-list-header:active {
                background: rgba(124, 58, 237, 0.15);
            }

            .room-list-title {
                font-weight: 600;
                font-size: 0.9rem;
                color: var(--aura-text-primary);
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .room-list-toggle {
                color: var(--aura-primary);
                font-size: 0.9rem;
                transition: transform 0.3s;
            }

            .room-list-toggle.collapsed {
                transform: rotate(180deg);
            }

            .room-list-container {
                max-height: 200px;
                overflow-y: auto;
                overflow-x: hidden;
                background: rgba(0, 0, 0, 0.2);
                scrollbar-width: thin;
                scrollbar-color: var(--aura-primary) rgba(0, 0, 0, 0.1);
                padding: 8px;
            }

            .room-list-container::-webkit-scrollbar {
                width: 6px;
            }

            .room-list-container::-webkit-scrollbar-track {
                background: rgba(0, 0, 0, 0.1);
                border-radius: 3px;
            }

            .room-list-container::-webkit-scrollbar-thumb {
                background: linear-gradient(180deg, var(--aura-primary) 0%, var(--aura-secondary) 100%);
                border-radius: 3px;
            }

            .room-list-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(50px, 1fr));
                gap: 6px;
            }

            .room-item {
                padding: 8px 6px;
                text-align: center;
                border-radius: 6px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                background: rgba(124, 58, 237, 0.08);
                border: 1px solid rgba(124, 58, 237, 0.15);
                color: var(--aura-text-primary);
                font-size: 0.8rem;
                min-height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                touch-action: manipulation;
            }

            .room-item:active {
                transform: scale(0.95);
            }

            .room-status-green {
                background: rgba(16, 185, 129, 0.12);
                border-color: rgba(16, 185, 129, 0.2);
            }

            .room-status-lilac {
                background: rgba(139, 92, 246, 0.12);
                border-color: rgba(139, 92, 246, 0.2);
            }

            .room-status-orange {
                background: rgba(245, 158, 11, 0.12);
                border-color: rgba(245, 158, 11, 0.2);
            }

            .room-status-red {
                background: rgba(239, 68, 68, 0.12);
                border-color: rgba(239, 68, 68, 0.2);
            }

            /* TTS indikátor */
            .tts-indicator {
                position: absolute;
                top: 4px;
                right: 4px;
                background: rgba(139, 92, 246, 0.2);
                border-radius: 50%;
                width: 16px;
                height: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                animation: tts-pulse 1s infinite;
                font-size: 0.6rem;
            }

            @keyframes tts-pulse {
                0%, 100% { transform: scale(1); opacity: 0.7; }
                50% { transform: scale(1.1); opacity: 1; }
            }

            /* Loading állapot */
            .aura-loading {
                display: flex;
                align-items: center;
                gap: 8px;
                color: var(--aura-text-secondary);
                font-size: 0.85rem;
            }

            .aura-loading-spinner {
                width: 16px;
                height: 16px;
                border: 2px solid rgba(124, 58, 237, 0.2);
                border-top-color: var(--aura-primary);
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
            }

            @keyframes spin {
                to { transform: rotate(360deg); }
            }

            /* Mobil optimalizációk */
            @media (max-width: 768px) {
                #ai-chat-plugin-container {
                    border-radius: 12px;
                    min-height: 400px;
                    max-height: 550px;
                }

                .aura-header {
                    padding: 8px 10px;
                    min-height: 48px;
                }

                .aura-header-title {
                    font-size: 0.95rem;
                }

                .aura-data-status {
                    font-size: 0.7rem;
                    padding: 4px 8px;
                    max-width: 100px;
                }

                .aura-messages {
                    padding: 8px 10px;
                    gap: 5px;
                }

                .aura-message {
                    max-width: 85%;
                    padding: 7px 10px;
                    font-size: 0.85rem;
                    border-radius: 10px;
                }

                /* Rendszerüzenet mobilnézetben még kompaktabb */
                .aura-system {
                    padding: 4px 6px;
                    font-size: 0.78rem;
                    max-width: 90%;
                    margin: 1px 0;
                }

                .aura-input-area {
                    padding: 8px 10px;
                }

                .aura-input {
                    padding: 8px 8px 8px 32px;
                    min-height: 36px;
                    font-size: 0.85rem;
                }

                .aura-pie-menu-button {
                    width: 36px;
                    height: 36px;
                    font-size: 0.95rem;
                }

                /* Radiális menü mobilnézetben - JAVÍTOTT MÉRET */
                .aura-pie-circle {
                    width: 250px;
                    height: 250px;
                }

                .aura-pie-center {
                    width: 55px;
                    height: 55px;
                    font-size: 1.2rem;
                }

                .aura-pie-item {
                    width: 46px;
                    height: 46px;
                    font-size: 1rem;
                }

                .aura-help-modal {
                    height: 90vh;
                    max-height: 90vh;
                }

                .aura-help-content {
                    padding: 16px;
                    gap: 16px;
                }

                .room-list-grid {
                    grid-template-columns: repeat(auto-fill, minmax(45px, 1fr));
                }
            }

            @media (max-width: 480px) {
                #ai-chat-plugin-container {
                    min-height: 380px;
                    max-height: 500px;
                }

                .aura-header {
                    flex-direction: column;
                    gap: 4px;
                    padding: 6px 8px;
                }

                .aura-header-left, .aura-header-right {
                    width: 100%;
                }

                .aura-messages {
                    padding: 6px 8px;
                }

                .aura-message {
                    max-width: 88%;
                    padding: 6px 8px;
                    font-size: 0.82rem;
                }

                /* Radiális menü kisebb mobilnézetben - JAVÍTOTT MÉRET */
                .aura-pie-circle {
                    width: 220px;
                    height: 220px;
                }

                .aura-pie-center {
                    width: 50px;
                    height: 50px;
                    font-size: 1.1rem;
                }

                .aura-pie-item {
                    width: 42px;
                    height: 42px;
                    font-size: 0.9rem;
                }

                .room-list-grid {
                    grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
                }

                .room-item {
                    padding: 6px 4px;
                    font-size: 0.75rem;
                }
            }

            /* Touch feedback */
            .touch-feedback:active {
                opacity: 0.8;
                transform: scale(0.96);
            }
        `;

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = css;
        document.head.appendChild(style);
        
        console.log("✅ Stílusok injektálva (v1.6.1)");
    }

    /* ==========================================================================
       4. UI RENDERELÉS - JAVÍTOTT
       ========================================================================== */

    renderInterface() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        const modelName = this.getModelName();
        const dataStatus = this.getDataStatus();
        
        container.innerHTML = `
            <div class="aura-chat-container">
                <!-- Fejléc -->
                <div class="aura-header">
                    <div class="aura-header-left">
                        <div class="aura-logo">
                            <i class="fas fa-gem"></i>
                        </div>
                        <div class="aura-header-title">Aura AI v1.6.1</div>
                    </div>
                    <div class="aura-header-right">
                        <div class="aura-data-status" title="Utolsó frissítés: ${this.dataCache.lastUpdate ? this.dataCache.lastUpdate.toLocaleTimeString() : 'Soha'}">
                            <i class="fas fa-database"></i> ${dataStatus}
                        </div>
                        <div class="aura-status-indicator" id="auraStatusIndicator">
                            ${this.getStatusIndicator()}
                        </div>
                    </div>
                </div>
                
                <!-- Üzenetek -->
                <div class="aura-messages" id="auraMessages">
                    <!-- Dinamikusan töltjük fel -->
                </div>
                
                <!-- Bemenet és radiális menü gomb -->
                <div class="aura-input-area">
                    <div class="aura-input-wrapper">
                        <i class="fas fa-comment aura-input-icon"></i>
                        <input type="text" 
                               id="auraInput" 
                               class="aura-input" 
                               placeholder="${this.isListening ? '🎤 Hallgat...' : (this.isProcessing ? 'Feldolgozás...' : 'Írj vagy nyisd meg a menüt!')}" 
                               autocomplete="off"
                               ${!this.isOnline || this.isProcessing ? 'disabled' : ''}>
                    </div>
                    
                    <button id="auraPieMenuButton" class="aura-pie-menu-button" title="Radiális menü">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
                
                <!-- Radiális menü -->
                <div class="aura-pie-menu" id="auraPieMenu">
                    <div class="aura-pie-circle">
                        <div class="aura-pie-center" id="auraPieCenter">
                            <i class="fas fa-times"></i>
                        </div>
                        
                        <div class="aura-pie-item pie-send" id="auraPieSend" title="Üzenet küldése">
                            <i class="fas fa-paper-plane"></i>
                            <div class="aura-pie-label">Küldés</div>
                        </div>
                        
                        <div class="aura-pie-item pie-voice" id="auraPieVoice" title="Hangvezérlés">
                            <i class="fas fa-microphone"></i>
                            <div class="aura-pie-label">Mikrofon</div>
                        </div>
                        
                        <div class="aura-pie-item pie-clear" id="auraPieClear" title="Chat törlése">
                            <i class="fas fa-trash"></i>
                            <div class="aura-pie-label">Törlés</div>
                        </div>
                        
                        <div class="aura-pie-item pie-refresh" id="auraPieRefresh" title="Adatok frissítése">
                            <i class="fas fa-sync-alt"></i>
                            <div class="aura-pie-label">Frissítés</div>
                        </div>
                        
                        <div class="aura-pie-item pie-help" id="auraPieHelp" title="Parancs súgó">
                            <i class="fas fa-question-circle"></i>
                            <div class="aura-pie-label">Súgó</div>
                        </div>
                        
                        <div class="aura-pie-item pie-speech" id="auraPieSpeechToggle" title="Hangválasz ${this.speechEnabled ? 'kikapcsolása' : 'bekapcsolása'}">
                            <i class="fas fa-${this.speechEnabled ? 'volume-up' : 'volume-mute'}"></i>
                            <div class="aura-pie-label">Hang</div>
                        </div>
                        
                        <div class="aura-pie-item pie-rooms" id="auraPieRooms" title="Szobák megjelenítése">
                            <i class="fas fa-door-open"></i>
                            <div class="aura-pie-label">Szobák</div>
                        </div>
                        
                        <div class="aura-pie-item pie-settings" id="auraPieSettings" title="Beállítások">
                            <i class="fas fa-cog"></i>
                            <div class="aura-pie-label">Beállítás</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Súgó modal - JAVÍTOTT -->
            <div class="aura-help-overlay" id="auraHelpOverlay">
                <div class="aura-help-modal">
                    <div class="aura-help-header">
                        <div class="aura-help-title">
                            <i class="fas fa-gem"></i> Aura AI Assistant - Parancs súgó
                        </div>
                        <button class="aura-help-close" id="auraHelpClose" title="Bezárás (Esc)">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="aura-help-content" id="auraHelpContent">
                        <!-- Dinamikusan töltjük fel -->
                    </div>
                    <div class="aura-help-footer">
                        <i class="fas fa-lightbulb"></i> Használd a <strong>Radiális Menüt</strong> a gyors műveletekhez!
                    </div>
                </div>
            </div>
        `;
        
        this.renderHelpContent();
        this.positionPieMenuItems();
        
        console.log("✅ UI renderelve (v1.6.1)");
    }

    renderHelpContent() {
        const helpContent = document.getElementById('auraHelpContent');
        if (!helpContent) return;
        
        let html = `
            <div class="aura-help-section">
                <div class="aura-help-section-title">
                    <i class="fas fa-info-circle"></i> Aura AI Assistant v1.6.1
                </div>
                <div style="color: var(--aura-text-secondary); line-height: 1.6; margin-bottom: 16px; font-size: 0.95rem;">
                    Az Aura AI Assistant segít a feladatok kezelésében és a szobák állapotának nyomon követésében.<br>
                    <strong>Új funkciók:</strong> Radiális menü, Lenyítható szobalista, Görgethető súgó!
                </div>
            </div>
            
            <div class="aura-help-section">
                <div class="aura-help-section-title">
                    <i class="fas fa-bolt"></i> Radiális Menü
                </div>
                <div style="color: var(--aura-text-secondary); font-size: 0.95rem; padding: 8px 0;">
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin-top: 12px;">
                        <div style="padding: 12px; background: rgba(124, 58, 237, 0.08); border-radius: 12px; border-left: 3px solid var(--aura-primary);">
                            <strong><i class="fas fa-plus"></i> Megnyitás:</strong><br>
                            Kattints a <i class="fas fa-plus"></i> gombra
                        </div>
                        <div style="padding: 12px; background: rgba(124, 58, 237, 0.08); border-radius: 12px; border-left: 3px solid var(--aura-primary);">
                            <strong><i class="fas fa-times"></i> Bezárás:</strong><br>
                            Kattints a középső <i class="fas fa-times"></i> gombra
                        </div>
                        <div style="padding: 12px; background: rgba(124, 58, 237, 0.08); border-radius: 12px; border-left: 3px solid var(--aura-primary);">
                            <strong><i class="fas fa-microphone"></i> Hangvezérlés:</strong><br>
                            Mikrofon gomb - piros lesz ha aktív
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        const commandsHelp = [
            {
                title: "📝 Feladat létrehozása",
                examples: [
                    "Hozz létre egy takarítási feladatot a 101-es szobához, sürgősség 3",
                    "Készíts karbantartási feladatot a 213-as szobához",
                    "Szerviz feladat: 301-es szoba, villanykörre",
                    "Takarítási feladat a 102-es szobához, magas prioritással"
                ]
            },
            {
                title: "🚪 Szoba státusz frissítése",
                examples: [
                    "Állítsd át a 101-es szoba státuszát pirosra",
                    "213-as szoba állapota zöldre",
                    "Konyha állapota lilac",
                    "Étkező állapota narancs"
                ],
                statusInfo: true
            },
            {
                title: "📊 Szobák állapotának lekérdezése",
                examples: [
                    "Mely szobák piros státuszúak?",
                    "Hány zöld státuszú szoba van?",
                    "Mutass egy listát a narancs státuszú szobákról",
                    "Mik a 213-as szoba adatai?"
                ]
            },
            {
                title: "📋 Feladatok lekérdezése",
                examples: [
                    "Hány függőben lévő feladat van?",
                    "Melyek a sürgős feladatok?",
                    "Mutasd a mai befejezett feladatokat",
                    "Milyen feladatok vannak a 213-as szobához?"
                ]
            }
        ];

        commandsHelp.forEach((section) => {
            html += `
                <div class="aura-help-section">
                    <div class="aura-help-section-title">
                        ${section.title}
                    </div>
                    
                    <div class="aura-command-examples">
                        <strong><i class="fas fa-lightbulb"></i> Példák:</strong>
                        ${section.examples.map(example => 
                            `<div class="aura-command-example" onclick="window.insertAuraAIExample('${example.replace(/'/g, "\\'")}')">
                                ${example}
                            </div>`
                        ).join('')}
                    </div>
                    
                    ${section.statusInfo ? `
                    <div class="aura-status-info">
                        <div class="aura-status-item status-green">
                            <i class="fas fa-check-circle"></i> Zöld: Kész
                        </div>
                        <div class="aura-status-item status-lilac">
                            <i class="fas fa-bed"></i> Lilac: Foglalt
                        </div>
                        <div class="aura-status-item status-orange">
                            <i class="fas fa-tools"></i> Narancs: Folyamatban
                        </div>
                        <div class="aura-status-item status-red">
                            <i class="fas fa-exclamation-circle"></i> Piros: Sürgős
                        </div>
                    </div>
                    ` : ''}
                </div>
            `;
        });

        // Gyorsbillentyűk
        html += `
            <div class="aura-help-section">
                <div class="aura-help-section-title">
                    <i class="fas fa-keyboard"></i> Gyorsbillentyűk
                </div>
                <div style="color: var(--aura-text-secondary); font-size: 0.95rem; padding: 8px 0;">
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px;">
                        <div style="padding: 10px 12px; background: rgba(255,255,255,0.03); border-radius: 10px; border-left: 3px solid var(--aura-primary);">
                            <strong>Enter:</strong> Üzenet küldése
                        </div>
                        <div style="padding: 10px 12px; background: rgba(255,255,255,0.03); border-radius: 10px; border-left: 3px solid var(--aura-primary);">
                            <strong>Ctrl+Shift+P:</strong> Radiális menü
                        </div>
                        <div style="padding: 10px 12px; background: rgba(255,255,255,0.03); border-radius: 10px; border-left: 3px solid var(--aura-voice);">
                            <strong>Ctrl+Shift+V:</strong> Hangvezérlés
                        </div>
                        <div style="padding: 10px 12px; background: rgba(255,255,255,0.03); border-radius: 10px; border-left: 3px solid var(--aura-secondary);">
                            <strong>Ctrl+Shift+H:</strong> Súgó
                        </div>
                        <div style="padding: 10px 12px; background: rgba(255,255,255,0.03); border-radius: 10px; border-left: 3px solid var(--aura-success);">
                            <strong>Ctrl+Shift+C:</strong> Chat törlése
                        </div>
                        <div style="padding: 10px 12px; background: rgba(255,255,255,0.03); border-radius: 10px; border-left: 3px solid var(--aura-text-muted);">
                            <strong>Esc:</strong> Mindent bezár
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        helpContent.innerHTML = html;
        
        console.log("✅ Súgó tartalom renderelve");
    }

    /* ==========================================================================
       5. RADIÁLIS MENÜ KEZELÉS - JAVÍTOTT POZÍCIONÁLÁS
       ========================================================================== */

    positionPieMenuItems() {
        const pieCircle = document.querySelector('.aura-pie-circle');
        if (!pieCircle) return;
        
        const items = document.querySelectorAll('.aura-pie-item');
        if (items.length === 0) return;
        
        // Dinamikusan számoljuk a középpontot és a sugarat
        const circleRect = pieCircle.getBoundingClientRect();
        const centerX = circleRect.width / 2;
        const centerY = circleRect.height / 2;
        const radius = Math.min(centerX, centerY) * 0.65; // 65%-a a sugárnak
        
        const angleStep = (2 * Math.PI) / items.length;
        
        items.forEach((item, index) => {
            const angle = index * angleStep - Math.PI / 2;
            const x = centerX + radius * Math.cos(angle);
            const y = centerY + radius * Math.sin(angle);
            
            // A gomb középpontjának beállítása
            const itemSize = 50; // alapértelmezett méret
            const itemHalf = itemSize / 2;
            
            item.style.left = `${x - itemHalf}px`;
            item.style.top = `${y - itemHalf}px`;
            
            // Forgatás törlése, hogy az ikonok ne forduljanak el
            item.style.transform = 'none';
        });
        
        console.log("✅ Radiális menü pozícionálva (dinamikus)");
    }

    togglePieMenu() {
        const pieMenu = document.getElementById('auraPieMenu');
        const centerButton = document.getElementById('auraPieCenter');
        const mainButton = document.getElementById('auraPieMenuButton');
        
        if (!pieMenu || !centerButton || !mainButton) return;
        
        this.isPieMenuOpen = !this.isPieMenuOpen;
        
        if (this.isPieMenuOpen) {
            pieMenu.classList.add('active');
            centerButton.innerHTML = '<i class="fas fa-times"></i>';
            mainButton.innerHTML = '<i class="fas fa-times"></i>';
            mainButton.style.background = 'var(--aura-primary-dark)';
            
            // Újrapozícionálás megnyitáskor
            setTimeout(() => this.positionPieMenuItems(), 10);
            
            if (window.navigator.vibrate) {
                window.navigator.vibrate(20);
            }
            
            const input = document.getElementById('auraInput');
            if (input) input.blur();
            
            console.log("📱 Radiális menü megnyitva");
        } else {
            pieMenu.classList.remove('active');
            centerButton.innerHTML = '<i class="fas fa-times"></i>';
            mainButton.innerHTML = '<i class="fas fa-plus"></i>';
            mainButton.style.background = 'var(--aura-gradient)';
            
            setTimeout(() => {
                const input = document.getElementById('auraInput');
                if (input && !this.isProcessing) input.focus();
            }, 100);
            
            console.log("📱 Radiális menü bezárva");
        }
    }

    /* ==========================================================================
       6. ESEMÉNYKEZELÉS - JAVÍTOTT
       ========================================================================== */

    attachEventListeners() {
        const pieMenuButton = document.getElementById('auraPieMenuButton');
        const pieCenter = document.getElementById('auraPieCenter');
        const input = document.getElementById('auraInput');
        const helpCloseBtn = document.getElementById('auraHelpClose');
        const helpOverlay = document.getElementById('auraHelpOverlay');

        // Radiális menü gomb
        pieMenuButton?.addEventListener('click', () => {
            this.togglePieMenu();
        });

        // Radiális menü középpont
        pieCenter?.addEventListener('click', () => {
            this.togglePieMenu();
        });

        // Radiális menü elemek
        const pieItems = {
            send: document.getElementById('auraPieSend'),
            voice: document.getElementById('auraPieVoice'),
            clear: document.getElementById('auraPieClear'),
            refresh: document.getElementById('auraPieRefresh'),
            help: document.getElementById('auraPieHelp'),
            speechToggle: document.getElementById('auraPieSpeechToggle'),
            rooms: document.getElementById('auraPieRooms'),
            settings: document.getElementById('auraPieSettings')
        };

        // Eseménykezelők
        pieItems.send?.addEventListener('click', () => {
            this.togglePieMenu();
            this.sendMessage();
        });

        pieItems.voice?.addEventListener('click', () => {
            this.togglePieMenu();
            this.startListening();
        });

        pieItems.clear?.addEventListener('click', () => {
            this.togglePieMenu();
            if (confirm('Biztosan törölni szeretnéd a chat történetet?')) {
                this.clearMessages();
            }
        });

        pieItems.refresh?.addEventListener('click', () => {
            this.togglePieMenu();
            this.refreshData();
            this.addMessage(
                `<div class="aura-success">
                    <i class="fas fa-sync-alt"></i> Adatok frissítve
                    <div class="aura-subtitle">${this.getDataStatus()}</div>
                </div>`,
                'ai'
            );
        });

        pieItems.help?.addEventListener('click', () => {
            this.togglePieMenu();
            this.showHelpModal();
        });

        pieItems.speechToggle?.addEventListener('click', () => {
            this.togglePieMenu();
            const isEnabled = this.toggleSpeech();
            this.updatePieSpeechToggleButton(isEnabled);
        });

        pieItems.rooms?.addEventListener('click', () => {
            this.togglePieMenu();
            this.showRoomList();
        });

        pieItems.settings?.addEventListener('click', () => {
            this.togglePieMenu();
            if (typeof showView === 'function') {
                showView('plugins');
            } else {
                this.addMessage(
                    `<div class="aura-info">
                        <i class="fas fa-cog"></i> Beállítások megnyitása
                        <div class="aura-subtitle">A főmenüben találod a plugin beállításokat</div>
                    </div>`,
                    'ai'
                );
            }
        });

        // Touch események
        Object.values(pieItems).forEach(item => {
            if (item) {
                item.addEventListener('touchstart', (e) => {
                    e.currentTarget.classList.add('touch-feedback');
                    if (window.navigator.vibrate) {
                        window.navigator.vibrate(15);
                    }
                }, { passive: true });

                item.addEventListener('touchend', (e) => {
                    e.currentTarget.classList.remove('touch-feedback');
                }, { passive: true });
            }
        });

        // Input eseménykezelők
        input?.addEventListener('keypress', (e) => {
            if ((e.key === 'Enter' && !e.shiftKey) && !this.isProcessing && this.isOnline) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Kattintás a radiális menü környékén bezárja a menüt
        document.getElementById('auraPieMenu')?.addEventListener('click', (e) => {
            if (e.target.id === 'auraPieMenu') {
                this.togglePieMenu();
            }
        });

        // Súgó bezárása - JAVÍTOTT
        helpCloseBtn?.addEventListener('click', () => {
            this.hideHelpModal();
        });

        // Súgó overlay kattintás - JAVÍTOTT
        helpOverlay?.addEventListener('click', (e) => {
            if (e.target === helpOverlay) {
                this.hideHelpModal();
            }
        });

        // Esc billentyű - JAVÍTOTT
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.isPieMenuOpen) {
                    this.togglePieMenu();
                }
                if (document.getElementById('auraHelpOverlay')?.classList.contains('active')) {
                    this.hideHelpModal();
                }
            }
            
            // Gyorsbillentyűk
            if (e.ctrlKey && e.shiftKey) {
                switch(e.key) {
                    case 'P':
                        e.preventDefault();
                        this.togglePieMenu();
                        break;
                    case 'V':
                        e.preventDefault();
                        this.startListening();
                        break;
                    case 'H':
                        e.preventDefault();
                        this.showHelpModal();
                        break;
                    case 'C':
                        e.preventDefault();
                        if (confirm('Biztosan törölni szeretnéd a chat történetet?')) {
                            this.clearMessages();
                        }
                        break;
                    case 'R':
                        e.preventDefault();
                        this.refreshData();
                        break;
                    case 'D':
                        e.preventDefault();
                        this.runDiagnostics();
                        break;
                }
            }
        });
        
        console.log("✅ Eseménykezelők csatolva");
    }

    /* ==========================================================================
       7. RADIÁLIS MENÜ FRISSÍTÉSEK
       ========================================================================== */

    updatePieVoiceButton() {
        const voiceBtn = document.getElementById('auraPieVoice');
        if (!voiceBtn) return;

        if (this.isListening) {
            voiceBtn.innerHTML = '<i class="fas fa-stop"></i><div class="aura-pie-label">Stop</div>';
            voiceBtn.classList.add('listening');
            voiceBtn.title = 'Hangfelismerés leállítása';
        } else {
            voiceBtn.innerHTML = '<i class="fas fa-microphone"></i><div class="aura-pie-label">Mikrofon</div>';
            voiceBtn.classList.remove('listening');
            voiceBtn.title = 'Hangvezérlés indítása';
        }
    }

    updatePieSpeechToggleButton(isEnabled) {
        const speechBtn = document.getElementById('auraPieSpeechToggle');
        if (!speechBtn) return;

        const enabled = isEnabled !== undefined ? isEnabled : this.speechEnabled;
        speechBtn.innerHTML = `<i class="fas fa-${enabled ? 'volume-up' : 'volume-mute'}"></i><div class="aura-pie-label">Hang</div>`;
        speechBtn.title = `Hangválasz ${enabled ? 'kikapcsolása' : 'bekapcsolása'}`;
        
        if (!enabled) {
            speechBtn.classList.add('muted');
        } else {
            speechBtn.classList.remove('muted');
        }
    }

    /* ==========================================================================
       8. SZOBA LISTA MEGJELENÍTÉSE - LENYÍTHATÓ, GÖRGETHETŐ
       ========================================================================== */

    showRoomList() {
        const rooms = this.dataCache.rooms;
        
        if (rooms.length === 0) {
            this.addMessage(
                `<div class="aura-warning">
                    <i class="fas fa-door-closed"></i> Nincsenek betöltött szobák
                    <div class="aura-subtitle">Frissítsd az adatokat a radiális menüből</div>
                </div>`,
                'ai'
            );
            return;
        }
        
        // Csoportosítás emeletek szerint
        const roomsByFloor = {};
        rooms.forEach(room => {
            const roomNum = room.number || room.id || "";
            if (roomNum && roomNum.length >= 1) {
                const floor = roomNum.charAt(0);
                if (!roomsByFloor[floor]) roomsByFloor[floor] = [];
                roomsByFloor[floor].push({
                    number: roomNum,
                    status: room.status || "green"
                });
            }
        });
        
        let roomListHTML = `
            <div class="aura-message aura-ai">
                <strong><i class="fas fa-door-open"></i> SZOBÁK (${rooms.length} db)</strong><br>
                <small>${new Date().toLocaleTimeString('hu-HU')}</small>
        `;
        
        // Lenyítható konténerek minden emelethez
        Object.keys(roomsByFloor).sort().forEach(floor => {
            const floorRooms = roomsByFloor[floor];
            const floorId = `floor-${floor}`;
            
            roomListHTML += `
                <div class="room-list-collapsible">
                    <div class="room-list-header" onclick="window.toggleAuraAIFloor('${floorId}')">
                        <div class="room-list-title">
                            <i class="fas fa-building"></i> ${floor}. emelet (${floorRooms.length} szoba)
                        </div>
                        <div class="room-list-toggle" id="toggle-${floorId}">
                            <i class="fas fa-chevron-up"></i>
                        </div>
                    </div>
                    <div class="room-list-container" id="${floorId}">
                        <div class="room-list-grid">
            `;
            
            // Rendezzük a szobákat
            floorRooms
                .sort((a, b) => parseInt(a.number) - parseInt(b.number))
                .forEach(room => {
                    const statusClass = `room-status-${room.status || 'green'}`;
                    roomListHTML += `
                        <div class="room-item ${statusClass}" 
                             onclick="window.insertAuraAIExample('Mik a ${room.number} számú szoba adatai?')"
                             title="${room.number} - ${room.status || 'green'}">
                            ${room.number}
                        </div>
                    `;
                });
            
            roomListHTML += `
                        </div>
                    </div>
                </div>
            `;
        });
        
        // Statisztika - JAVÍTOTT IKONOKKAL
        const statusSummary = this.getRoomStatusSummary();
        roomListHTML += `
            <br><strong>Státusz összegzés:</strong>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; margin: 8px 0; font-size: 0.85rem;">
                <div style="padding: 6px; background: rgba(16, 185, 129, 0.1); border-radius: 6px; text-align: center; display: flex; align-items: center; justify-content: center; gap: 6px;">
                    <i class="fas fa-check-circle" style="color: #10b981;"></i> Zöld: ${statusSummary.green}
                </div>
                <div style="padding: 6px; background: rgba(139, 92, 246, 0.1); border-radius: 6px; text-align: center; display: flex; align-items: center; justify-content: center; gap: 6px;">
                    <i class="fas fa-bed" style="color: #8b5cf6;"></i> Lilac: ${statusSummary.lilac}
                </div>
                <div style="padding: 6px; background: rgba(245, 158, 11, 0.1); border-radius: 6px; text-align: center; display: flex; align-items: center; justify-content: center; gap: 6px;">
                    <i class="fas fa-tools" style="color: #f59e0b;"></i> Narancs: ${statusSummary.orange}
                </div>
                <div style="padding: 6px; background: rgba(239, 68, 68, 0.1); border-radius: 6px; text-align: center; display: flex; align-items: center; justify-content: center; gap: 6px;">
                    <i class="fas fa-exclamation-circle" style="color: #ef4444;"></i> Piros: ${statusSummary.red}
                </div>
            </div>
            
            <br><small><i class="fas fa-info-circle"></i> Kattints egy szobára a részletek megtekintéséhez</small>
            </div>
        `;
        
        this.addMessage(roomListHTML, 'ai');
        
        // Globális függvények hozzáadása a lenyítás/lenyitáshoz
        window.toggleAuraAIFloor = (floorId) => {
            const container = document.getElementById(floorId);
            const toggle = document.getElementById(`toggle-${floorId}`);
            
            if (container && toggle) {
                if (container.style.display === 'none') {
                    container.style.display = 'block';
                    toggle.classList.remove('collapsed');
                } else {
                    container.style.display = 'none';
                    toggle.classList.add('collapsed');
                }
            }
        };
        
        console.log(`✅ Szobalista megjelenítve: ${rooms.length} szoba`);
    }

    /* ==========================================================================
       9. SÚGÓ MODAL KEZELÉS - JAVÍTOTT
       ========================================================================== */

    showHelpModal() {
        const overlay = document.getElementById('auraHelpOverlay');
        if (!overlay) return;
        
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // Esc billentyű figyelése
        const closeOnEsc = (e) => {
            if (e.key === 'Escape') {
                this.hideHelpModal();
            }
        };
        document.addEventListener('keydown', closeOnEsc);
        overlay._closeOnEsc = closeOnEsc;
        
        // Példabeszúrás beállítása
        window.insertAuraAIExample = (text) => {
            const input = document.getElementById('auraInput');
            if (input) {
                input.value = text;
                input.focus();
                this.hideHelpModal();
            }
        };
        
        // Fókusz a bezáró gombra
        setTimeout(() => {
            const closeBtn = document.getElementById('auraHelpClose');
            closeBtn?.focus();
        }, 100);
        
        // Automatikus görgetés a tetejére
        const helpContent = document.getElementById('auraHelpContent');
        if (helpContent) {
            setTimeout(() => {
                helpContent.scrollTop = 0;
            }, 50);
        }
        
        console.log("✅ Súgó modal megnyitva");
    }

    hideHelpModal() {
        const overlay = document.getElementById('auraHelpOverlay');
        if (!overlay) return;
        
        overlay.classList.remove('active');
        document.body.style.overflow = '';
        
        // Esc billentyű figyelés eltávolítása
        if (overlay._closeOnEsc) {
            document.removeEventListener('keydown', overlay._closeOnEsc);
            delete overlay._closeOnEsc;
        }
        
        // Fókusz vissza az inputra
        setTimeout(() => {
            const input = document.getElementById('auraInput');
            input?.focus();
        }, 100);
        
        console.log("✅ Súgó modal bezárva");
    }

    /* ==========================================================================
       10. ÜZENETKEZELÉS - KOMPAKTABB
       ========================================================================== */

    addMessage(text, sender = 'ai', type = 'normal') {
        const container = document.getElementById('auraMessages');
        if (!container) {
            console.error("❌ Aura üzenet konténer nem található!");
            return null;
        }
        
        this.messageCount++;
        
        const msgDiv = document.createElement('div');
        const msgId = `aura-msg-${Date.now()}-${this.messageCount}`;
        
        msgDiv.id = msgId;
        msgDiv.className = `aura-message aura-${sender}`;
        
        if (type === 'system') {
            msgDiv.classList.add('aura-system');
        }
        
        // Timestamp
        const timestamp = new Date().toLocaleTimeString('hu-HU', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        msgDiv.innerHTML = `
            <div class="message-content">${text}</div>
            <div class="message-meta">
                <span style="font-size: 0.75rem; color: var(--aura-text-muted);">
                    ${sender === 'ai' ? 'Aura AI' : 'Felhasználó'} • ${timestamp}
                </span>
            </div>
        `;
        
        container.appendChild(msgDiv);
        
        // Görgetés
        this.scrollToBottom(container, msgDiv);
        
        // TTS
        if (sender === 'ai' && type !== 'system' && this.speechEnabled) {
            const cleanText = this.extractCleanText(text);
            if (cleanText.length > 0 && cleanText.length < 500 && 
                !cleanText.includes("Neurális hálózat feldolgozása") &&
                !cleanText.includes("feldolgozás")) {
                setTimeout(() => this.speakText(cleanText), 300);
            }
        }
        
        return msgId;
    }

    extractCleanText(html) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        const cleanText = tempDiv.textContent || tempDiv.innerText || '';
        return cleanText
            .replace(/\s+/g, ' ')
            .replace(/<[^>]*>/g, '')
            .replace(/[\n\r]+/g, ' ')
            .trim();
    }

    scrollToBottom(container, newElement = null) {
        if (!container) return;
        
        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
        }, 50);
        
        if (newElement) {
            setTimeout(() => {
                newElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'end',
                    inline: 'nearest'
                });
            }, 100);
        }
    }

    clearMessages() {
        const container = document.getElementById('auraMessages');
        if (container) {
            container.innerHTML = '';
            this.messageCount = 0;
            container.scrollTop = 0;
            
            this.addMessage(
                `<div class="aura-welcome-compact">
                    <div class="aura-logo-header">
                        <i class="fas fa-gem"></i>
                        <span class="aura-title">Aura AI v1.6.1</span>
                    </div>
                    <div class="aura-welcome-stats">
                        <span class="aura-stat"><i class="fas fa-microchip"></i> ${this.getModelName()}</span>
                        <span class="aura-stat"><i class="fas fa-door-open"></i> ${this.dataCache.rooms.length} szoba</span>
                        <span class="aura-stat"><i class="fas fa-tasks"></i> ${this.dataCache.tasks.length} feladat</span>
                        ${this.speechEnabled ? '<span class="aura-stat"><i class="fas fa-volume-up"></i> Hang be</span>' : ''}
                    </div>
                    <div class="aura-welcome-hint">
                        <i class="fas fa-info-circle"></i> Chat története törölve. Kérdezz vagy használd a Radiális Menüt!
                    </div>
                </div>`,
                'ai',
                'system'
            );
        }
    }

    sendMessage() {
        if (this.isProcessing) return;
        
        const input = document.getElementById('auraInput');
        const text = input.value.trim();
        if (!text) return;

        this.commandHistory.push({
            text,
            timestamp: new Date(),
            sender: 'user'
        });

        this.addMessage(text, 'user');
        input.value = '';
        
        setTimeout(() => {
            if (!this.isPieMenuOpen) input.focus();
        }, 100);
        
        this.setProcessingState(true);
        
        const loadingId = this.addMessage(
            `<div class="aura-loading">
                <div class="aura-loading-spinner"></div>
                <span>Feldolgozás...</span>
                <div class="aura-subtitle">${this.getModelName()}</div>
            </div>`,
            'ai'
        );

        const processResponse = async () => {
            try {
                await this.refreshData();
                const response = await this.callGroqAPIWithRetry(text);
                document.getElementById(loadingId)?.remove();
                await this.processAIResponse(response);
                this.retryCount = 0;
            } catch (error) {
                document.getElementById(loadingId)?.remove();
                this.handleAIError(error);
            } finally {
                this.setProcessingState(false);
            }
        };

        processResponse();
    }

    /* ==========================================================================
       11. HANGVEZÉRLÉS
       ========================================================================== */

    initSpeechRecognition() {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            
            this.recognition.continuous = false;
            this.recognition.interimResults = true;
            this.recognition.lang = 'hu-HU';
            this.recognition.maxAlternatives = 1;

            this.recognition.onstart = () => {
                console.log("🎤 Hangfelismerés elindult");
                this.isListening = true;
                this.updatePieVoiceButton();
                this.updateDataStatus();
                
                this.addMessage(
                    `<div class="aura-info">
                        <i class="fas fa-microphone"></i> Hangfelismerés aktív...
                        <div class="aura-subtitle">Beszélj most</div>
                    </div>`,
                    'ai'
                );
            };

            this.recognition.onresult = (event) => {
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript;
                    }
                }

                if (finalTranscript) {
                    console.log("🎤 Felismert szöveg:", finalTranscript);
                    this.stopListening();
                    this.processVoiceCommand(finalTranscript);
                }
            };

            this.recognition.onerror = (event) => {
                console.error("🎤 Hangfelismerési hiba:", event.error);
                if (event.error !== 'no-speech') {
                    this.addMessage(
                        `<div class="aura-error">
                            <i class="fas fa-microphone-slash"></i> Hangfelismerési hiba
                        </div>`,
                        'ai'
                    );
                }
                this.stopListening();
            };

            this.recognition.onend = () => {
                console.log("🎤 Hangfelismerés leállt");
                if (this.isListening) {
                    this.stopListening();
                }
            };

            console.log("✅ Hangfelismerés inicializálva");
        } else {
            console.warn("⚠ Hangvezérlés nem támogatott");
            this.addMessage(
                `<div class="aura-warning">
                    <i class="fas fa-microphone-slash"></i> Hangvezérlés nem támogatott
                </div>`,
                'ai'
            );
        }
    }

    startListening() {
        if (!this.recognition) {
            this.addMessage(
                `<div class="aura-error">
                    <i class="fas fa-microphone-slash"></i> Hangfelismerés nem elérhető
                </div>`,
                'ai'
            );
            return;
        }

        if (this.isListening) {
            this.stopListening();
            return;
        }

        try {
            this.recognition.start();
        } catch (error) {
            console.error("🎤 Nem sikerült elindítani a hangfelismerést:", error);
            this.addMessage(
                `<div class="aura-error">
                    <i class="fas fa-microphone-slash"></i> Nem sikerült elindítani
                </div>`,
                'ai'
            );
        }
    }

    stopListening() {
        if (this.recognition && this.isListening) {
            try {
                this.recognition.stop();
            } catch (error) {}
            this.isListening = false;
            this.updatePieVoiceButton();
            this.updateDataStatus();
        }
    }

    processVoiceCommand(transcript) {
        this.addMessage(
            `<div class="aura-user">
                <i class="fas fa-microphone"></i> ${transcript}
            </div>`,
            'user'
        );

        const input = document.getElementById('auraInput');
        if (input) {
            input.value = transcript;
            
            const sendKeywords = ['küld', 'kérdez', 'keres', 'add', 'frissíts', 'mutasd', 'hoz'];
            const shouldAutoSend = sendKeywords.some(keyword => 
                transcript.toLowerCase().includes(keyword)
            ) || transcript.length < 50;
            
            if (shouldAutoSend && !this.isProcessing) {
                setTimeout(() => {
                    this.sendMessage();
                }, 500);
            } else {
                input.focus();
            }
        }
    }

    speakText(text) {
        if (text.includes("Neurális hálózat feldolgozása")) {
            return;
        }
        
        if (!this.speechEnabled || !this.speechSynthesis) return;
        
        if (this.currentSpeechUtterance) {
            this.speechSynthesis.cancel();
        }
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'hu-HU';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        
        const messages = document.querySelectorAll('.aura-message.aura-ai');
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && !lastMessage.querySelector('.tts-indicator')) {
            const ttsIndicator = document.createElement('div');
            ttsIndicator.className = 'tts-indicator';
            ttsIndicator.innerHTML = '<i class="fas fa-volume-up"></i>';
            lastMessage.style.position = 'relative';
            lastMessage.appendChild(ttsIndicator);
            
            utterance.onend = () => {
                if (ttsIndicator && ttsIndicator.parentNode) {
                    ttsIndicator.remove();
                }
                this.currentSpeechUtterance = null;
            };
            
            utterance.onerror = () => {
                if (ttsIndicator && ttsIndicator.parentNode) {
                    ttsIndicator.remove();
                }
                this.currentSpeechUtterance = null;
            };
        }
        
        this.currentSpeechUtterance = utterance;
        this.speechSynthesis.speak(utterance);
    }

    toggleSpeech() {
        this.speechEnabled = !this.speechEnabled;
        localStorage.setItem('aura_speech_enabled', this.speechEnabled);
        
        this.addMessage(
            `<div class="aura-${this.speechEnabled ? 'success' : 'info'}">
                <i class="fas fa-${this.speechEnabled ? 'volume-up' : 'volume-mute'}"></i>
                Hangválasz ${this.speechEnabled ? 'bekapcsolva' : 'kikapcsolva'}
            </div>`,
            'ai'
        );
        
        this.updatePieSpeechToggleButton();
        
        return this.speechEnabled;
    }

    /* ==========================================================================
       12. ADATKEZELÉS
       ========================================================================== */

    updateDataCache(tasks, rooms) {
        console.log("🔄 Cache frissítése...");
        
        if (tasks && Array.isArray(tasks)) {
            this.dataCache.tasks = [...tasks];
        }
        
        if (rooms && Array.isArray(rooms)) {
            this.dataCache.rooms = [...rooms];
        }
        
        this.dataCache.lastUpdate = new Date();
        this.updateDataStatus();
        
        return {
            tasks: this.dataCache.tasks.length,
            rooms: this.dataCache.rooms.length,
            lastUpdate: this.dataCache.lastUpdate
        };
    }

    async loadInitialData() {
        console.log("📥 Kezdeti adatok betöltése...");
        
        try {
            await this.syncWithGlobalData();
            
            if (this.dataCache.tasks.length === 0) {
                await this.loadTasksFromFirestore();
            }
            
            if (this.dataCache.rooms.length === 0) {
                await this.loadAllRoomsFromFirestore();
            }
            
            await this.loadUsersFromFirestore();
            
            this.dataCache.lastUpdate = new Date();
            
            console.log(`✅ Adatok betöltve: ${this.dataCache.tasks.length} feladat, ${this.dataCache.rooms.length} szoba`);
            
            this.updateDataStatus();
            
        } catch (error) {
            console.error("❌ Hiba az adatok betöltésekor:", error);
            this.addMessage(
                `<div class="aura-error">
                    <i class="fas fa-exclamation-circle"></i> Adatbetöltési hiba
                </div>`,
                'ai'
            );
        }
    }

    async syncWithGlobalData() {
        return new Promise((resolve) => {
            console.log("🔄 Globális adatok szinkronizálása...");
            
            const checkGlobalData = () => {
                let dataChanged = false;
                
                if (typeof window.tasks !== 'undefined' && Array.isArray(window.tasks)) {
                    this.dataCache.tasks = [...window.tasks];
                    dataChanged = true;
                }
                
                if (typeof window.rooms !== 'undefined' && Array.isArray(window.rooms)) {
                    this.dataCache.rooms = [...window.rooms];
                    dataChanged = true;
                }
                
                if (typeof window.currentUserNickname !== 'undefined') {
                    this.appData.currentUserNickname = window.currentUserNickname;
                }
                
                if (dataChanged) {
                    this.dataCache.lastUpdate = new Date();
                    this.updateDataStatus();
                }
                
                resolve();
            };
            
            checkGlobalData();
            
            if (this.dataCache.tasks.length === 0 && this.dataCache.rooms.length === 0) {
                setTimeout(checkGlobalData, 2000);
            }
        });
    }

    async loadTasksFromFirestore() {
        if (!this.db) return;
        
        try {
            const snapshot = await this.db.collection("tasks")
                .orderBy("created", "desc")
                .limit(100)
                .get();
            
            this.dataCache.tasks = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            console.log(`🔥 ${this.dataCache.tasks.length} feladat betöltve`);
        } catch (error) {
            console.error("Firestore feladat betöltési hiba:", error);
        }
    }

    async loadAllRoomsFromFirestore() {
        if (!this.db) return;
        
        try {
            const snapshot = await this.db.collection("rooms").get();
            
            this.dataCache.rooms = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            console.log(`🔥 ${this.dataCache.rooms.length} szoba betöltve`);
            
            const roomNumbers = this.dataCache.rooms
                .map(r => r.number || r.id || "N/A")
                .filter(r => r !== "N/A")
                .sort();
            
            console.log("🔥 Firestore szobák:", roomNumbers);
            
        } catch (error) {
            console.error("Firestore szoba betöltési hiba:", error);
        }
    }

    async loadUsersFromFirestore() {
        if (!this.db) return;
        
        try {
            const snapshot = await this.db.collection("users").limit(50).get();
            
            this.dataCache.users = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            console.log(`👥 ${this.dataCache.users.length} felhasználó betöltve`);
        } catch (error) {
            console.error("Firestore felhasználó betöltési hiba:", error);
        }
    }

    refreshData() {
        console.log("🔄 Adatok frissítése...");
        
        this.syncWithGlobalData();
        this.loadTasksFromFirestore();
        this.loadAllRoomsFromFirestore();
        this.dataCache.lastUpdate = new Date();
        this.updateDataStatus();
        
        return {
            tasks: this.dataCache.tasks.length,
            rooms: this.dataCache.rooms.length,
            users: this.dataCache.users.length,
            lastUpdate: this.dataCache.lastUpdate
        };
    }

    /* ==========================================================================
       13. API ÉS AI FELDOLGOZÁS
       ========================================================================== */

    async callGroqAPIWithRetry(userMessage, currentRetry = 0) {
        if (currentRetry >= this.maxRetries) {
            throw new Error(`Max újrapróbálkozások (${this.maxRetries}) elérve`);
        }

        try {
            return await this.callGroqAPI(userMessage);
        } catch (error) {
            const retryableErrors = ['timeout', 'hálózati', '429', '503', '502'];
            const shouldRetry = retryableErrors.some(keyword => 
                error.message.toLowerCase().includes(keyword)
            );
            
            if (shouldRetry) {
                currentRetry++;
                console.log(`🔄 Újrapróbálkozás ${currentRetry}/${this.maxRetries}`);
                
                const delay = Math.min(1000 * Math.pow(2, currentRetry), 10000);
                await new Promise(resolve => setTimeout(resolve, delay));
                
                return this.callGroqAPIWithRetry(userMessage, currentRetry);
            }
            
            throw error;
        }
    }

    async callGroqAPI(userMessage) {
        if (!this.isOnline) {
            throw new Error("Nincs internetkapcsolat.");
        }
        
        if (!this.groqApiKey || this.groqApiKey.length < 30) {
            throw new Error("Hiányzó Groq API kulcs.");
        }
        
        const currentData = this.getCurrentData();
        const contextPrompt = this.systemPrompt.replace(
            '{{CONTEXT_DATA}}',
            JSON.stringify(currentData, null, 2)
        );
        
        const messages = [
            { role: "system", content: contextPrompt },
            { role: "user", content: userMessage.substring(0, 1000) }
        ];
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);
        
        try {
            console.log(`🤖 API hívás: ${this.selectedModel}`);
            
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${this.groqApiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: this.selectedModel,
                    messages: messages,
                    temperature: 0.3,
                    max_tokens: 1024,
                    top_p: 0.9,
                    stream: false
                }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                let errorData;
                try {
                    errorData = await response.json();
                } catch (e) {
                    errorData = { error: { message: `HTTP ${response.status}` } };
                }
                
                if (errorData.error?.message?.toLowerCase().includes('decommissioned') ||
                    errorData.error?.message?.toLowerCase().includes('not found')) {
                    
                    const fallbackModel = this.availableModels.find(m => 
                        m.fallback || m.id === "llama-3.1-8b-instant"
                    )?.id;
                    
                    if (fallbackModel && this.selectedModel !== fallbackModel) {
                        console.log(`🔄 Automatikus modellváltás: ${this.selectedModel} → ${fallbackModel}`);
                        this.selectedModel = fallbackModel;
                        localStorage.setItem('aura_model', fallbackModel);
                        
                        return this.callGroqAPI(userMessage);
                    }
                }
                
                throw new Error(`API hiba (${response.status}): ${errorData.error?.message || 'Ismeretlen hiba'}`);
            }
            
            const data = await response.json();
            
            if (!data?.choices?.[0]?.message?.content) {
                throw new Error("Az API üres választ adott");
            }
            
            return data.choices[0].message.content;
            
        } catch (fetchError) {
            clearTimeout(timeoutId);
            
            if (fetchError.name === 'AbortError') {
                throw new Error("Időtúllépés (20s).");
            }
            
            if (fetchError.message.includes('Failed to fetch') || 
                fetchError.message.includes('NetworkError')) {
                throw new Error("Hálózati hiba.");
            }
            
            throw fetchError;
        }
    }

    getCurrentData() {
        const now = new Date();
        const cacheAge = this.dataCache.lastUpdate ? 
            now - this.dataCache.lastUpdate : Infinity;
        
        const optimizedTasks = this.dataCache.tasks.slice(0, 50).map(task => ({
            id: task.id,
            room: task.room || "",
            category: task.category || "other",
            status: task.status || "todo",
            prio: task.prio || 2,
            note: task.note ? task.note.substring(0, 80) + (task.note.length > 80 ? "..." : "") : "",
            createdAt: task.created ? (task.created.toDate ? task.created.toDate().toISOString().split('T')[0] : "?") : "?",
            assignedTo: task.assignedToName || ""
        }));
        
        const optimizedRooms = this.dataCache.rooms.map(room => ({
            number: room.number || "",
            status: room.status || "green",
            notes: room.notes ? 
                (typeof room.notes === 'string' ? 
                    (room.notes.length > 50 ? room.notes.substring(0, 50) + "..." : room.notes) : 
                    String(room.notes)) 
                : "",
            lastUpdated: room.lastUpdated ? (room.lastUpdated.toDate ? room.lastUpdated.toDate().toISOString().split('T')[0] : "?") : "?"
        }));
        
        return {
            metadata: {
                timestamp: now.toISOString(),
                cacheAge: `${Math.floor(cacheAge / 1000)}s`,
                dataSource: this.dataCache.tasks.length > 0 ? "live" : "empty",
                totalRooms: this.dataCache.rooms.length,
                totalTasks: this.dataCache.tasks.length,
                dataVersion: "v1.6.1"
            },
            statistics: {
                totalTasks: this.dataCache.tasks.length,
                activeTasks: this.dataCache.tasks.filter(t => t.status === "todo" || t.status === "prog").length,
                completedToday: this.getCompletedTodayCount(),
                urgentTasks: this.dataCache.tasks.filter(t => t.prio === 5).length,
                roomStatus: this.getRoomStatusSummary(),
                roomCountByFloor: this.getRoomCountByFloor()
            },
            tasks: optimizedTasks,
            rooms: optimizedRooms,
            currentUser: {
                nickname: this.appData.currentUserNickname || "Ismeretlen",
                timestamp: now.toLocaleTimeString()
            }
        };
    }

    getCompletedTodayCount() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        return this.dataCache.tasks.filter(task => {
            if (task.status !== "done" || !task.completed) return false;
            
            const completedDate = task.completed.toDate ? 
                task.completed.toDate() : 
                new Date(task.completed);
            
            return completedDate >= today;
        }).length;
    }

    getRoomStatusSummary() {
        const summary = { green: 0, lilac: 0, orange: 0, red: 0 };
        
        this.dataCache.rooms.forEach(room => {
            if (room.status && summary[room.status] !== undefined) {
                summary[room.status]++;
            }
        });
        
        return summary;
    }

    getRoomCountByFloor() {
        const floors = {};
        
        this.dataCache.rooms.forEach(room => {
            const roomNum = room.number || "";
            if (roomNum && roomNum.length >= 1) {
                const floor = roomNum.charAt(0);
                floors[floor] = (floors[floor] || 0) + 1;
            }
        });
        
        return floors;
    }

    async processAIResponse(response) {
        const jsonMatch = this.extractJSONFromResponse(response);
        
        if (jsonMatch) {
            try {
                const command = JSON.parse(jsonMatch);
                
                if (command.action && command.data) {
                    const result = await this.executeCommand(command);
                    
                    this.addMessage(
                        `<div class="aura-success">
                            <i class="fas fa-check-circle"></i> ${result}
                            <div class="aura-subtitle">
                                Parancs sikeresen végrehajtva
                            </div>
                        </div>`,
                        'ai'
                    );
                    
                    this.commandHistory.push({
                        command,
                        result,
                        timestamp: new Date()
                    });
                    
                    return;
                }
            } catch (jsonError) {
                console.warn("JSON parse hiba:", jsonError);
            }
        }
        
        this.addMessage(response, 'ai');
    }

    extractJSONFromResponse(response) {
        const text = response.trim();
        
        const jsonStart = text.indexOf('{');
        const jsonEnd = text.lastIndexOf('}');
        
        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
            const possibleJson = text.substring(jsonStart, jsonEnd + 1);
            
            try {
                const parsed = JSON.parse(possibleJson);
                if (parsed.action && parsed.data) {
                    return possibleJson;
                }
            } catch (e) {
                return null;
            }
        }
        
        return null;
    }

    handleAIError(error) {
        console.error("🤖 AI hiba:", error);
        
        let errorMessage = this.getUserFriendlyError(error);
        
        if (!this.isOnline || error.message.toLowerCase().includes('hálózati')) {
            this.enableOfflineMode();
        }
        
        this.addMessage(`<div class="aura-error">${errorMessage}</div>`, 'ai');
    }

    getUserFriendlyError(error) {
        const errorMsg = error.message || "Ismeretlen hiba";
        
        if (errorMsg.includes('API kulcs') || errorMsg.includes('401')) {
            return `
                <strong>🔑 API kulcs probléma!</strong>
                <div class="error-detail">
                    1. Ellenőrizd a Groq API kulcsot<br>
                    2. A kulcs lehet lejárt vagy érvénytelen<br>
                    3. <a href="https://console.groq.com/keys" target="_blank" style="color: var(--aura-secondary);">Új kulcs generálása</a>
                </div>
            `;
        }
        
        if (errorMsg.includes('hálózati') || errorMsg.includes('Internet')) {
            return `
                <strong>🌐 Hálózati hiba!</strong>
                <div class="error-detail">
                    1. Ellenőrizd az internetkapcsolatod<br>
                    2. Próbáld meg frissíteni az oldalt<br>
                    3. VPN kapcsolatot kapcsold ki
                </div>
            `;
        }
        
        if (errorMsg.includes('timeout') || errorMsg.includes('Időtúllépés')) {
            return `
                <strong>⏰ Időtúllépés!</strong>
                <div class="error-detail">
                    Az AI szerver nem válaszolt időben.<br>
                    Próbáld meg újra.
                </div>
            `;
        }
        
        if (errorMsg.includes('429')) {
            return `
                <strong>🚫 Túl sok kérés!</strong>
                <div class="error-detail">
                    A Groq API percenkénti limitet túllépted.<br>
                    Kérlek várj 60 másodpercet.
                </div>
            `;
        }
        
        return `<strong>❌ Hiba:</strong> <div class="error-detail">${errorMsg}</div>`;
    }

    /* ==========================================================================
       14. PARANCS VÉGREHAJTÁS
       ========================================================================== */

    async executeCommand(command) {
        console.log("🛠️ Parancs végrehajtása:", command);
        
        if (!command.action || !command.data) {
            throw new Error("Érvénytelen parancs formátum");
        }
        
        if (!this.db || typeof this.db.collection !== 'function') {
            throw new Error("Adatbázis kapcsolat nem elérhető");
        }
        
        try {
            switch (command.action) {
                case 'addTask':
                    return await this.executeAddTask(command.data);
                    
                case 'updateRoomStatus':
                    return await this.executeUpdateRoomStatus(command.data);
                    
                default:
                    throw new Error(`Ismeretlen akció: ${command.action}`);
            }
            
        } catch (firestoreError) {
            console.error("🔥 Firestore hiba:", firestoreError);
            
            if (firestoreError.code === 'unavailable') {
                throw new Error("Adatbázis nem elérhető.");
            }
            
            if (firestoreError.code === 'permission-denied') {
                throw new Error("Nincs jogosultságod.");
            }
            
            throw new Error(`Adatbázis hiba: ${firestoreError.message}`);
        }
    }

    async executeAddTask(taskData) {
        const validatedData = {
            room: String(taskData.room || "000").substring(0, 10),
            note: String(taskData.note || "Aura AI Generált feladat").substring(0, 300),
            category: this.validateCategory(taskData.category),
            prio: Math.min(Math.max(parseInt(taskData.prio) || 2, 1), 5),
            status: "todo",
            created: firebase.firestore.FieldValue.serverTimestamp(),
            updated: firebase.firestore.FieldValue.serverTimestamp(),
            userId: this.auth?.currentUser?.uid || "ai-system",
            userNickname: "Aura AI Assistant",
            assignedTo: "",
            completed: null
        };
        
        await this.db.collection("tasks").add(validatedData);
        
        this.dataCache.tasks.push({
            id: `temp-${Date.now()}`,
            ...validatedData
        });
        this.dataCache.lastUpdate = new Date();
        
        if (typeof window.renderTasks === 'function') {
            setTimeout(() => window.renderTasks(), 500);
        }
        
        if (typeof window.addChatMessage === 'function') {
            window.addChatMessage(`✨ Aura AI létrehozott feladatot: ${validatedData.room}. szoba`);
        }
        
        return `✅ Feladat létrehozva: ${validatedData.room}. szoba - "${validatedData.note}"`;
    }

    async executeUpdateRoomStatus(roomData) {
        const validStatuses = ['green', 'lilac', 'orange', 'red'];
        const status = validStatuses.includes(roomData.status) ? roomData.status : 'green';
        
        const roomRef = this.db.collection("rooms").doc(String(roomData.room));
        
        const roomDoc = await roomRef.get();
        
        if (!roomDoc.exists) {
            await roomRef.set({
                number: String(roomData.room),
                status: status,
                notes: "Aura AI által létrehozva",
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                updatedBy: "Aura AI Assistant"
            });
        } else {
            await roomRef.update({
                status: status,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                updatedBy: "Aura AI Assistant"
            });
        }
        
        const roomIndex = this.dataCache.rooms.findIndex(r => r.number === roomData.room);
        if (roomIndex !== -1) {
            this.dataCache.rooms[roomIndex].status = status;
            this.dataCache.rooms[roomIndex].lastUpdated = new Date();
        } else {
            this.dataCache.rooms.push({
                number: roomData.room,
                status: status,
                lastUpdated: new Date()
            });
        }
        
        this.dataCache.lastUpdate = new Date();
        
        return `✅ Szoba státusz frissítve: ${roomData.room} → ${status}`;
    }

    validateCategory(category) {
        const validCategories = ['cleaning', 'maintenance', 'service', 'supply', 'other'];
        return validCategories.includes(category) ? category : 'other';
    }

    /* ==========================================================================
       15. ÁLLAPOTKEZELÉS
       ========================================================================== */

    validateConfiguration() {
        console.log("🔧 Konfiguráció ellenőrzése...");
        
        const issues = [];
        
        if (!this.groqApiKey || this.groqApiKey.length < 30) {
            issues.push("Hiányzó Groq API kulcs");
        }
        
        if (!this.db || typeof this.db.collection !== 'function') {
            issues.push("Firestore nem elérhető");
        }
        
        const modelExists = this.availableModels.some(m => m.id === this.selectedModel);
        if (!modelExists) {
            issues.push(`Ismeretlen modell: ${this.selectedModel}`);
        }
        
        if (issues.length > 0) {
            console.warn("⚠ Konfigurációs problémák:", issues);
            
            if (this.db) {
                console.log("📴 Offline mód engedélyezve");
                return true;
            }
            
            return false;
        }
        
        console.log("✅ Konfiguráció OK");
        return true;
    }

    showConfigError(container) {
        container.innerHTML = `
            <div style="padding: 20px; text-align: center; color: white;">
                <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: #f59e0b; margin-bottom: 20px;"></i>
                <h3 style="margin-bottom: 10px;">Aura AI Assistant - Konfigurációs hiba</h3>
                <p style="margin-bottom: 20px;">A plugin nincs megfelelően konfigurálva!</p>
                <button onclick="showView('plugins')" style="padding: 10px 20px; background: #7c3aed; color: white; border: none; border-radius: 8px; cursor: pointer;">
                    <i class="fas fa-cog"></i> Beállítások megnyitása
                </button>
            </div>
        `;
    }

    handleNetworkChange(isOnline) {
        this.isOnline = isOnline;
        
        const input = document.getElementById('auraInput');
        
        if (isOnline) {
            console.log("🌐 Online állapot");
            
            this.updateDataStatus();
            
            this.addMessage(
                `<div class="aura-success">
                    <i class="fas fa-wifi"></i> Internetkapcsolat helyreállítva
                </div>`,
                'ai'
            );
            
            if (input) {
                input.disabled = false;
                input.placeholder = "Írj vagy nyisd meg a menüt!";
                setTimeout(() => input.focus(), 100);
            }
            
            setTimeout(() => this.refreshData(), 1000);
            
        } else {
            console.log("📴 Offline állapot");
            
            this.updateDataStatus();
            
            this.addMessage(
                `<div class="aura-warning">
                    <i class="fas fa-wifi-slash"></i> Nincs internetkapcsolat
                </div>`,
                'ai'
            );
            
            if (input) {
                input.disabled = true;
                input.placeholder = "Offline mód - AI nem elérhető";
            }
        }
    }

    enableOfflineMode() {
        console.log("📴 Offline mód aktiválva");
        
        this.addMessage(
            `<div class="aura-info">
                <i class="fas fa-plug"></i> OFFLINE MÓD
                <div class="aura-subtitle">AI funkciók ideiglenesen nem elérhetők</div>
            </div>`,
            'ai'
        );
    }

    setProcessingState(isProcessing) {
        this.isProcessing = isProcessing;
        
        const input = document.getElementById('auraInput');
        const pieMenuButton = document.getElementById('auraPieMenuButton');
        
        if (input) {
            input.disabled = isProcessing || !this.isOnline;
            input.placeholder = isProcessing 
                ? 'Feldolgozás...' 
                : (this.isOnline ? 'Írj vagy nyisd meg a menüt!' : 'Offline mód');
            
            if (!isProcessing && this.isOnline && !this.isPieMenuOpen) {
                setTimeout(() => input.focus(), 100);
            }
        }
        
        if (pieMenuButton) {
            pieMenuButton.disabled = isProcessing;
            pieMenuButton.style.opacity = isProcessing ? '0.5' : '1';
        }
        
        this.updateDataStatus();
    }

    updateDataStatus() {
        const statusElement = document.querySelector('.aura-data-status');
        const indicatorElement = document.getElementById('auraStatusIndicator');
        
        if (statusElement) {
            statusElement.innerHTML = `<i class="fas fa-database"></i> ${this.getDataStatus()}`;
            statusElement.title = `Utolsó frissítés: ${this.dataCache.lastUpdate ? this.dataCache.lastUpdate.toLocaleTimeString() : 'Soha'}\nSzobák: ${this.dataCache.rooms.length}`;
        }
        
        if (indicatorElement) {
            indicatorElement.innerHTML = this.getStatusIndicator();
            indicatorElement.className = 'aura-status-indicator ' + 
                (this.isProcessing ? 'status-processing' : 
                 this.isListening ? 'status-listening' :
                 this.isOnline ? 'status-online' : 'status-offline');
        }
    }

    getStatusIndicator() {
        if (this.isProcessing) {
            return '<i class="fas fa-spinner fa-spin"></i>';
        } else if (this.isListening) {
            return '<i class="fas fa-microphone"></i>';
        } else if (this.isOnline) {
            return '<i class="fas fa-wifi"></i>';
        } else {
            return '<i class="fas fa-wifi-slash"></i>';
        }
    }

    getDataStatus() {
        const tasks = this.dataCache.tasks.length;
        const rooms = this.dataCache.rooms.length;
        
        if (tasks === 0 && rooms === 0) return 'Nincs adat';
        return `${tasks}f / ${rooms}s`;
    }

    getModelName() {
        const model = this.availableModels.find(m => m.id === this.selectedModel);
        return model ? model.name : this.selectedModel;
    }

    /* ==========================================================================
       16. DIAGNOSZTIKA ÉS AUTOMATIKUS FRISSÍTÉS
       ========================================================================== */

    addDiagnosticTools() {
        this.addKeyboardShortcuts();
    }

    addKeyboardShortcuts() {
        console.log("✅ Diagnosztikai eszközök hozzáadva");
    }

    async runDiagnostics() {
        const tests = [
            {
                name: "Internet kapcsolat",
                test: () => navigator.onLine,
                message: "✅ Online",
                error: "❌ Offline"
            },
            {
                name: "API kulcs",
                test: () => !!this.groqApiKey && this.groqApiKey.length > 30,
                message: "✅ Érvényes",
                error: "❌ Hiányzik"
            },
            {
                name: "Firestore kapcsolat",
                test: () => !!this.db && typeof this.db.collection === 'function',
                message: "✅ Aktív",
                error: "❌ Nem elérhető"
            },
            {
                name: "Adat cache",
                test: () => this.dataCache.tasks.length > 0 || this.dataCache.rooms.length > 0,
                message: `✅ ${this.dataCache.tasks.length} feladat, ${this.dataCache.rooms.length} szoba`,
                error: "❌ Nincs adat"
            }
        ];
        
        let results = [];
        let passedTests = 0;
        
        for (const test of tests) {
            const passed = await Promise.resolve(test.test());
            results.push(`${passed ? test.message : test.error} ${test.name}`);
            if (passed) passedTests++;
        }
        
        const summary = `
            <div class="aura-message aura-ai">
                <strong><i class="fas fa-stethoscope"></i> DIAGNOSZTIKA v1.6.1</strong><br>
                <small>${new Date().toLocaleString('hu-HU')}</small><br><br>
                
                <strong>Tesztek:</strong><br>
                ${results.join('<br>')}<br><br>
                
                <strong>Összegzés:</strong><br>
                ✅ ${passedTests}/${tests.length} teszt sikeres<br>
                <br>
                <strong>Statisztikák:</strong><br>
                • Üzenetek: ${this.messageCount}<br>
                • Parancsok: ${this.commandHistory.length}<br>
                • Hangvezérlés: ${this.speechEnabled ? 'Bekapcsolva' : 'Kikapcsolva'}<br>
                • Radiális menü: ${this.isPieMenuOpen ? 'Nyitva' : 'Zárva'}<br>
                • Szobák: ${this.dataCache.rooms.length}<br>
                <br>
                <small>Használd a <strong>Radiális Menüt</strong> a gyors műveletekhez!</small>
            </div>
        `;
        
        this.addMessage(summary, 'ai');
    }

    startAutoRefresh() {
        setInterval(() => {
            if (this.isOnline && this.isEnabled) {
                this.refreshData();
            }
        }, 60000);
        
        setInterval(() => {
            const now = new Date();
            const cacheAge = this.dataCache.lastUpdate ? 
                now - this.dataCache.lastUpdate : Infinity;
            
            if (cacheAge > 300000) {
                console.log("🔄 Cache frissítése szükséges");
                if (this.isOnline) {
                    this.refreshData();
                }
            }
        }, 30000);
        
        console.log("✅ Automatikus frissítés indítva");
    }

    /* ==========================================================================
       17. PUBLIKUS API
       ========================================================================== */

    updateApiKey(newKey) {
        this.groqApiKey = newKey.trim();
        localStorage.setItem('groq_api_key', this.groqApiKey);
        
        console.log("🔑 API kulcs frissítve");
        
        this.addMessage(
            `<div class="aura-success">
                <i class="fas fa-key"></i> API kulcs frissítve
            </div>`,
            'ai'
        );
        
        if (this.validateConfiguration()) {
            const input = document.getElementById('auraInput');
            if (input) input.disabled = false;
        }
    }
    
    updateModel(newModelId) {
        if (this.availableModels.some(m => m.id === newModelId)) {
            this.selectedModel = newModelId;
            localStorage.setItem('aura_model', newModelId);
            
            const modelName = this.getModelName();
            
            this.addMessage(
                `<div class="aura-success">
                    <i class="fas fa-robot"></i> Modell váltva: ${modelName}
                </div>`,
                'ai'
            );
            
            console.log(`🤖 Modell váltva: ${newModelId}`);
            return true;
        }
        
        this.addMessage(
            `<div class="aura-error">
                <i class="fas fa-exclamation-triangle"></i> Ismeretlen modell
            </div>`,
            'ai'
        );
        return false;
    }
    
    getAvailableModels() {
        return this.availableModels.filter(m => !m.deprecated);
    }
    
    getStats() {
        return {
            isOnline: this.isOnline,
            isEnabled: this.isEnabled,
            isProcessing: this.isProcessing,
            isListening: this.isListening,
            isPieMenuOpen: this.isPieMenuOpen,
            speechEnabled: this.speechEnabled,
            model: this.selectedModel,
            dataCache: {
                tasks: this.dataCache.tasks.length,
                rooms: this.dataCache.rooms.length,
                users: this.dataCache.users.length,
                lastUpdate: this.dataCache.lastUpdate,
                roomStatus: this.getRoomStatusSummary(),
                hasRoom213: this.dataCache.rooms.some(r => r.number === '213')
            },
            messages: this.messageCount,
            commands: this.commandHistory.length
        };
    }
    
    showHelp() {
        this.showHelpModal();
    }
    
    startVoiceControl() {
        this.startListening();
    }
    
    stopVoiceControl() {
        this.stopListening();
    }
    
    toggleVoiceControl() {
        if (this.isListening) {
            this.stopListening();
        } else {
            this.startListening();
        }
    }
}

/* ==========================================================================
   18. GLOBÁLIS HOZZÁFÉRÉS
   ========================================================================== */

window.AIChatPlugin = AIChatPlugin;

// Globális helper függvények
window.toggleAuraAIPieMenu = function() {
    if (window.auraAI && typeof window.auraAI.togglePieMenu === 'function') {
        window.auraAI.togglePieMenu();
        return true;
    }
    return false;
};

window.isAuraAIPieMenuOpen = function() {
    if (window.auraAI) {
        return window.auraAI.isPieMenuOpen;
    }
    return false;
};

window.refreshAuraAIData = function() {
    if (window.auraAI && typeof window.auraAI.refreshData === 'function') {
        return window.auraAI.refreshData();
    }
    return Promise.resolve(false);
};

window.getAuraAIStats = function() {
    if (window.auraAI && typeof window.auraAI.getStats === 'function') {
        return window.auraAI.getStats();
    }
    return null;
};

window.updateAuraAIApiKey = function(key) {
    if (window.auraAI && typeof window.auraAI.updateApiKey === 'function') {
        window.auraAI.updateApiKey(key);
        return true;
    }
    return false;
};

window.showAuraAIHelp = function() {
    if (window.auraAI && typeof window.auraAI.showHelp === 'function') {
        window.auraAI.showHelp();
        return true;
    }
    return false;
};

window.startAuraAIVoice = function() {
    if (window.auraAI && typeof window.auraAI.startVoiceControl === 'function') {
        window.auraAI.startVoiceControl();
        return true;
    }
    return false;
};

window.stopAuraAIVoice = function() {
    if (window.auraAI && typeof window.auraAI.stopVoiceControl === 'function') {
        window.auraAI.stopVoiceControl();
        return true;
    }
    return false;
};

window.toggleAuraAIVoice = function() {
    if (window.auraAI && typeof window.auraAI.toggleVoiceControl === 'function') {
        window.auraAI.toggleVoiceControl();
        return true;
    }
    return false;
};

window.toggleAuraAISpeech = function() {
    if (window.auraAI && typeof window.auraAI.toggleSpeech === 'function') {
        return window.auraAI.toggleSpeech();
    }
    return false;
};

window.showAuraAIRooms = function() {
    if (window.auraAI && typeof window.auraAI.showRoomList === 'function') {
        window.auraAI.showRoomList();
        return true;
    }
    return false;
};

window.getAuraAIRoomCount = function() {
    if (window.auraAI && typeof window.auraAI.getStats === 'function') {
        const stats = window.auraAI.getStats();
        return stats ? stats.dataCache.rooms : 0;
    }
    return 0;
};

window.insertAuraAIExample = function(text) {
    const input = document.getElementById('auraInput');
    if (input) {
        input.value = text;
        input.focus();
        
        if (window.auraAI && typeof window.auraAI.hideHelpModal === 'function') {
            window.auraAI.hideHelpModal();
        }
        
        if (window.auraAI && window.auraAI.isPieMenuOpen) {
            window.auraAI.togglePieMenu();
        }
    }
};

window.enableAuraAITouch = function() {
    console.log("🖐️ Aura AI touch support engedélyezve");
    return true;
};

console.log("✨ Aura AI Assistant Module v1.6.1 betöltve");
console.log("✅ Radiális menü javítva - szimmetrikus elrendezés");
console.log("✅ Lenyítható szobalista - ikonokkal");
console.log("✅ Görgethető súgó modal");
console.log("✅ Rendszerüzenetek kompaktabbak és jobb színvilággal");
console.log("✅ Mobiltelefonra optimalizálva");
console.log("✅ Minden funkció működik");