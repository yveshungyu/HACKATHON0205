// Keyboard testing removed

// ==================== GLOBAL VARIABLES ====================

let odysseyClient;
let isConnected = false;
let isStreaming = false;
let interactionCount = 0;

// Audio Analysis
let audioContext;
let analyser;
let microphone;
let audioDataArray;
let audioBufferLength;
let currentAudioFeatures = {
    volume: 0,        // 0-100
    pitch: 'mid',     // 'low', 'mid', 'high'
    energy: 0,        // 0-100
    rhythm: 'normal'  // 'slow', 'normal', 'fast'
};

// Advanced audio tracking for dramatic effects
let volumeHistory = [];
let previousVolume = 0;
let loudDuration = 0;
let quietDuration = 0;
let isPaused = false;

// Peak audio tracking during speech
let isSpeaking = false;
let speechAudioPeaks = {
    maxVolume: 0,
    maxEnergy: 0,
    dominantPitch: 'mid',
    avgVolume: 0,
    volumeSamples: []
};

// Speech Recognition
let recognition;
let speechEnabled = true;
let recentWords = [];
let lastVoiceInteractionTime = 0;
let lastAudioEventTime = 0;
const VOICE_INTERACTION_INTERVAL = 2000; // 2 seconds for voice
const AUDIO_EVENT_INTERVAL = 5000; // 5 seconds for audio events
let temporaryMuteUntil = 0; // Timestamp to temporarily mute speech recognition

// Hand Gesture Control
let hands;
let camera;
let handGestureEnabled = true;
let currentGesture = null;

// Finger Pointer / Click-Grounded Editing
let isPointing = false;
let fingerCursorPos = { x: 0, y: 0 }; // Normalized 0-1
let dwellStartTime = 0;
let dwellPos = { x: 0, y: 0 }; // Position when dwell started
let isDwelling = false;
let dwellConfirmed = false; // True after dwell click fires
const DWELL_TIME = 1500; // ms - hold still for 1.5s to click
const DWELL_MOVE_THRESHOLD = 0.03; // Max movement to still count as "still"
let lastClickPos = null; // { xPercent, yPercent }
let lastClickFrameData = null; // { fullFrame, zoomFrame }
let visionResult = null; // Last vision API result
let waitingForVoicePrompt = false; // True after dwell click, waiting for speech
let dwellProgressInterval = null;

// Auto-evolution
let autoEvolutionInterval;
let storyContext = [];
const AUTO_EVOLUTION_INTERVAL = 6000; // 6 seconds auto-evolution (faster!)

// Scene state tracking
let initialStoryline = ''; // Original starting scene
let currentSceneState = ''; // Current evolved state

// Keyboard controls removed

// ==================== DOM ELEMENTS ====================

const apiKeyInput = document.getElementById('apiKey');
const initialPromptInput = document.getElementById('initialPrompt');
const toggleKeyBtn = document.getElementById('toggleKey');
const speechRecognitionCheckbox = document.getElementById('speechRecognition');
const handGesturesCheckbox = document.getElementById('handGestures');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const configSection = document.getElementById('configSection');
const videoSection = document.getElementById('videoSection');
const videoElement = document.getElementById('videoElement');
const connectionStatus = document.getElementById('connectionStatus');
const speechStatusEl = document.getElementById('speechStatus');
const spokenWordsEl = document.getElementById('spokenWords');
const streamStatus = document.getElementById('streamStatus');
const interactionCountEl = document.getElementById('interactionCount');
const generatingIndicator = document.getElementById('generatingIndicator');
const volumeValueEl = document.getElementById('volumeValue');
const pitchValueEl = document.getElementById('pitchValue');
const energyValueEl = document.getElementById('energyValue');
const gestureIndicator = document.getElementById('gestureIndicator');
const handVideo = document.getElementById('handVideo');
const handCanvas = document.getElementById('handCanvas');
const sessionTimerEl = document.getElementById('sessionTimer');

// Finger cursor & click DOM
const fingerCursorEl = document.getElementById('fingerCursor');
const clickMarkerEl = document.getElementById('clickMarker');
const videoDisplay = document.getElementById('videoDisplay');
const videoOverlayCanvas = document.getElementById('videoOverlayCanvas');
const clickPromptPanel = document.getElementById('clickPromptPanel');
const clickPromptInfo = document.getElementById('clickPromptInfo');

// Session timer
let sessionStartTime = 0;
let sessionTimerInterval = null;
const SESSION_DURATION = 150; // 150 seconds

// ==================== INITIALIZATION ====================

// Loaded from config.js (not tracked by git)
const openaiApiKey = window.OPENAI_API_KEY || '';

window.addEventListener('DOMContentLoaded', async () => {
    const savedKey = localStorage.getItem('odyssey_api_key');
    if (savedKey) {
        apiKeyInput.value = savedKey;
    }
    
    
    const savedPrompt = localStorage.getItem('initial_prompt');
    
    // Always use new default (override any old saved prompts for now)
    const defaultPrompt = 'A single man running through a dense forest, third-person frontal tracking shot, camera smoothly dollying backward in front of the runner, cinematic composition, stable motion, photorealistic lighting, natural daylight, continuous shot';
    
    if (!savedPrompt || savedPrompt.includes('A man is running') || savedPrompt.includes('first person POV')) {
        initialPromptInput.value = defaultPrompt;
        localStorage.setItem('initial_prompt', defaultPrompt);
    } else {
        initialPromptInput.value = savedPrompt;
    }
    
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        speechRecognitionCheckbox.disabled = true;
        speechRecognitionCheckbox.checked = false;
        speechEnabled = false;
    }
    
    // Request microphone + camera permissions immediately on page load
    // so the browser remembers and doesn't ask again later
    try {
        console.log('🎤 Pre-requesting microphone & camera permissions...');
        window.microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        window.cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
        console.log('✅ Microphone & camera permissions granted and stored');
    } catch (e) {
        console.warn('⚠️ Could not pre-request permissions:', e.message);
    }
});

initialPromptInput.addEventListener('input', (e) => {
    localStorage.setItem('initial_prompt', e.target.value);
});

toggleKeyBtn.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
        apiKeyInput.type = 'text';
        toggleKeyBtn.textContent = '🔒';
    } else {
        apiKeyInput.type = 'password';
        toggleKeyBtn.textContent = '👁️';
    }
});


apiKeyInput.addEventListener('input', (e) => {
    localStorage.setItem('odyssey_api_key', e.target.value);
});


speechRecognitionCheckbox.addEventListener('change', (e) => {
    speechEnabled = e.target.checked;
});

handGesturesCheckbox.addEventListener('change', (e) => {
    handGestureEnabled = e.target.checked;
});

// ==================== START/STOP ====================

startBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    
    if (!apiKey) {
        alert('❌ Please enter your Odyssey API Key!');
        return;
    }

    try {
        // Initialize Odyssey client
        odysseyClient = new window.Odyssey({ apiKey: apiKey });
        
        // Switch UI
        configSection.style.display = 'none';
        videoSection.style.display = 'block';
        
        connectionStatus.textContent = 'Connecting...';
        connectionStatus.className = 'status-badge connecting';
        
        console.log('🔌 Connecting to Odyssey...');
        
        // Connect and get video stream with error handlers
        const mediaStream = await odysseyClient.connect({
            onStreamStarted: (streamId) => {
                console.log('🎬 Stream started with ID:', streamId);
                isStreaming = true;
            },
            onStreamEnded: () => {
                console.log('🛑 Stream ended - restarting...');
                isStreaming = false;
                
                // Auto-restart stream after a moment
                setTimeout(() => {
                    if (isConnected) {
                        console.log('🔄 Auto-restarting stream...');
                        startVideoStream();
                    }
                }, 2000);
            },
            onError: (error) => {
                console.error('❌ Odyssey stream error:', error);
                handleStreamError(error);
            }
        });
        
        videoElement.srcObject = mediaStream;
        
        // Enable audio from Odyssey (like official site)
        videoElement.muted = false;
        videoElement.volume = 0.7;
        
        isConnected = true;
        connectionStatus.textContent = 'Connected';
        connectionStatus.className = 'status-badge connected';
        
        console.log('✅ Connected to Odyssey');
        
        // Reuse existing microphone stream, or request if somehow missing
        if (!window.microphoneStream) {
            console.log('🎤 Microphone stream not found, requesting...');
            window.microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log('✅ Microphone permission granted');
        } else {
            console.log('✅ Reusing existing microphone stream');
        }
        
        // Setup audio analysis
        await setupAudioAnalysis();
        
        // Start speech recognition
        if (speechEnabled) {
            startSpeechRecognition();
        }
        
        // Start with initial prompt first
        await startVideoStream();
        
        // Start hand gesture tracking after stream is running
        if (handGestureEnabled) {
            setTimeout(() => {
                startHandGestureTracking().catch(e => {
                    console.warn('⚠️ Hand tracking failed, continuing without it:', e.message);
                });
            }, 1000);
        }
        
    } catch (error) {
        console.error('❌ Connection error:', error);
        alert('Failed to connect: ' + error.message);
        videoSection.style.display = 'none';
        configSection.style.display = 'block';
    }
});

stopBtn.addEventListener('click', async () => {
    await stopEverything();
    videoSection.style.display = 'none';
    configSection.style.display = 'block';
});

async function stopEverything() {
    if (recognition) {
        recognition.stop();
    }
    
    if (autoEvolutionInterval) {
        clearInterval(autoEvolutionInterval);
    }
    
    if (sessionTimerInterval) {
        clearInterval(sessionTimerInterval);
        sessionTimerInterval = null;
    }
    
    if (audioContext) {
        audioContext.close();
    }
    
    if (hands) {
        hands.close();
    }
    
    if (camera) {
        camera.stop();
    }
    
    if (odysseyClient) {
        try {
            if (isStreaming) {
                await odysseyClient.endStream();
            }
            odysseyClient.disconnect();
        } catch (error) {
            console.error('Disconnect error:', error);
        }
    }
    
    isConnected = false;
    isStreaming = false;
    interactionCount = 0;
    recentWords = [];
    storyContext = [];
    initialStoryline = '';
    currentSceneState = '';
    lastVoiceInteractionTime = 0;
    lastAudioEventTime = 0;
    initialStoryline = '';
    currentSceneState = '';
    lastClickPos = null;
    lastClickFrameData = null;
    visionResult = null;
    isPointing = false;
    isDwelling = false;
    dwellConfirmed = false;
    waitingForVoicePrompt = false;
    temporaryMuteUntil = 0;
    stopDwellProgress();
    hideFingerCursor();
    hideVoicePromptHint();
}

// ==================== AUDIO ANALYSIS ====================

async function setupAudioAnalysis() {
    try {
        // Use existing microphone stream
        if (!window.microphoneStream) {
            console.error('❌ No microphone stream available');
            return;
        }
        
        // Create audio context
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(window.microphoneStream);
        
        analyser.fftSize = 2048;
        audioBufferLength = analyser.frequencyBinCount;
        audioDataArray = new Uint8Array(audioBufferLength);
        
        microphone.connect(analyser);
        
        // Start continuous analysis
        analyzeAudioContinuously();
        
        console.log('🎤 Audio analysis started');
        
    } catch (error) {
        console.error('Audio analysis setup error:', error);
    }
}

function analyzeAudioContinuously() {
    if (!isConnected) return;
    
    analyser.getByteFrequencyData(audioDataArray);
    
    // Calculate volume (0-100)
    let sum = 0;
    for (let i = 0; i < audioBufferLength; i++) {
        sum += audioDataArray[i];
    }
    const volume = Math.round((sum / audioBufferLength / 255) * 100);
    
    // Find dominant frequency (pitch)
    let maxValue = 0;
    let maxIndex = 0;
    for (let i = 0; i < audioBufferLength; i++) {
        if (audioDataArray[i] > maxValue) {
            maxValue = audioDataArray[i];
            maxIndex = i;
        }
    }
    
    const nyquist = audioContext.sampleRate / 2;
    const frequency = (maxIndex * nyquist) / audioBufferLength;
    
    // Determine pitch category
    let pitch;
    if (frequency < 150) pitch = 'very-low';
    else if (frequency < 300) pitch = 'low';
    else if (frequency < 500) pitch = 'mid-low';
    else if (frequency < 1000) pitch = 'mid';
    else if (frequency < 2000) pitch = 'mid-high';
    else pitch = 'high';
    
    // Calculate energy
    const energy = Math.round((maxValue / 255) * 100);
    
    // Track volume changes
    const volumeChange = Math.abs(volume - previousVolume);
    volumeHistory.push(volume);
    if (volumeHistory.length > 30) volumeHistory.shift(); // Keep last 30 frames
    
    // Track duration of loud/quiet
    if (volume > 50) {
        loudDuration += 0.1;
        quietDuration = 0;
    } else if (volume < 15) {
        quietDuration += 0.1;
        loudDuration = 0;
    } else {
        loudDuration = 0;
        quietDuration = 0;
    }
    
    // Update global features
    currentAudioFeatures = {
        volume: volume,
        pitch: pitch,
        energy: energy,
        frequency: Math.round(frequency),
        volumeChange: volumeChange,
        loudDuration: loudDuration,
        quietDuration: quietDuration
    };
    
    previousVolume = volume;
    
    // Track peaks during speech
    if (isSpeaking) {
        speechAudioPeaks.maxVolume = Math.max(speechAudioPeaks.maxVolume, volume);
        speechAudioPeaks.maxEnergy = Math.max(speechAudioPeaks.maxEnergy, energy);
        speechAudioPeaks.volumeSamples.push(volume);
        
        // Update dominant pitch during speech
        if (volume > 15) { // Only count pitch when actually speaking
            speechAudioPeaks.dominantPitch = pitch;
        }
        
        // Calculate average volume
        if (speechAudioPeaks.volumeSamples.length > 0) {
            const sum = speechAudioPeaks.volumeSamples.reduce((a, b) => a + b, 0);
            speechAudioPeaks.avgVolume = Math.round(sum / speechAudioPeaks.volumeSamples.length);
        }
        
        console.log('📊 Peak tracking - Max vol:', speechAudioPeaks.maxVolume, 'Max energy:', speechAudioPeaks.maxEnergy);
    }
    
    // Update UI
    if (volumeValueEl) volumeValueEl.textContent = volume + '%';
    if (pitchValueEl) pitchValueEl.textContent = pitch;
    if (energyValueEl) energyValueEl.textContent = energy;
    
    requestAnimationFrame(analyzeAudioContinuously);
}

// ==================== SPEECH RECOGNITION ====================

function startSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    
    recognition.continuous = true;  // Keep listening continuously
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;
    
    recognition.onstart = () => {
        console.log('🎤 Speech recognition started');
        speechStatusEl.textContent = 'Listening...';
        speechStatusEl.className = 'status-badge listening';
    };
    
    recognition.onresult = async (event) => {
        // Check if we should temporarily ignore speech (during mute period)
        const now = Date.now();
        if (temporaryMuteUntil > 0 && now < temporaryMuteUntil) {
            console.log('🔇 Speech ignored (waiting for click confirmation)');
            return;
        }
        
        let interimTranscript = '';
        let finalTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript + ' ';
            } else {
                interimTranscript += transcript;
            }
        }
        
        // Start tracking audio peaks when user starts speaking
        if (interimTranscript && !isSpeaking) {
            isSpeaking = true;
            speechAudioPeaks = {
                maxVolume: 0,
                maxEnergy: 0,
                dominantPitch: 'mid',
                avgVolume: 0,
                volumeSamples: []
            };
            console.log('🎤 Started tracking speech audio peaks');
        }
        
        // Update display with what user is saying
        const displayText = finalTranscript || interimTranscript;
        if (displayText) {
            spokenWordsEl.textContent = displayText;
            speechStatusEl.textContent = 'Speaking...';
            speechStatusEl.className = 'status-badge speaking';
        }
        
        if (finalTranscript) {
            const spokenText = finalTranscript.trim();
            
            // Stop tracking and capture the peaks
            isSpeaking = false;
            console.log('🎤 Speech ended - peaks:', speechAudioPeaks);
            
            // Override current audio features with speech peaks
            const originalFeatures = { ...currentAudioFeatures };
            currentAudioFeatures = {
                volume: speechAudioPeaks.maxVolume || currentAudioFeatures.volume,
                pitch: speechAudioPeaks.dominantPitch || currentAudioFeatures.pitch,
                energy: speechAudioPeaks.maxEnergy || currentAudioFeatures.energy,
                frequency: currentAudioFeatures.frequency,
                volumeChange: currentAudioFeatures.volumeChange,
                loudDuration: currentAudioFeatures.loudDuration,
                quietDuration: currentAudioFeatures.quietDuration
            };
            
            addToRecentWords(spokenText);
            console.log('🗣️ Recognized:', spokenText);
            console.log('📊 Speech peaks - Vol:', speechAudioPeaks.maxVolume, 'Energy:', speechAudioPeaks.maxEnergy);
            
            // ONLY process speech if waiting for voice after dwell-click
            if (waitingForVoicePrompt && lastClickPos) {
                console.log('🎯 Voice captured for click-grounded edit:', spokenText);
                handleVoiceGroundedPrompt(spokenText);
            } else {
                console.log('💤 Speech ignored (no active dwell-click)');
            }
            
            // Restore original audio features after processing
            setTimeout(() => {
                currentAudioFeatures = originalFeatures;
            }, 3000);
        }
    };
    
    let shouldRestart = true;
    
    recognition.onerror = (event) => {
        // Ignore no-speech errors - don't log, don't affect restart
        if (event.error === 'no-speech') {
            shouldRestart = true; // Still should restart
            return;
        }
        
        // Ignore aborted
        if (event.error === 'aborted') {
            return;
        }
        
        // Log other errors
        console.log('Speech recognition event:', event.error);
        
        // Don't restart on permission errors
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            console.warn('⚠️ Microphone permission denied');
            speechEnabled = false;
            shouldRestart = false;
        }
    };
    
    recognition.onend = () => {
        // Restart if should continue and still connected
        if (shouldRestart && isConnected && speechEnabled) {
            setTimeout(() => {
                if (isConnected && speechEnabled) {
                    try {
                        recognition.start();
                    } catch (e) {
                        // Silently fail
                    }
                }
            }, 200);
        }
    };
    
    recognition.start();
}

function addToRecentWords(text) {
    const words = text.toLowerCase().split(' ').filter(w => w.length > 2);
    recentWords = [...words, ...recentWords].slice(0, 30);
}

// ==================== ODYSSEY VIDEO CONTROL ====================

async function startVideoStream() {
    try {
        generatingIndicator.classList.add('active');
        connectionStatus.textContent = 'Starting Stream...';
        connectionStatus.className = 'status-badge streaming';
        
        // Get user's initial prompt
        let initialPrompt = initialPromptInput.value.trim();
        
        if (!initialPrompt) {
            initialPrompt = 'A single man running through a dense forest, third-person frontal tracking shot, camera smoothly dollying backward in front of the runner, cinematic composition, stable motion, photorealistic lighting, natural daylight, continuous shot';
        }
        
        // Set initial storyline if first time, or use current state if restarting
        if (!initialStoryline) {
            initialStoryline = initialPrompt;
            console.log('📖 Initial storyline set:', initialStoryline);
        }
        
        // Use current evolved state if available (from previous session), otherwise use initial
        const startPrompt = (currentSceneState && currentSceneState.length > 10) ? currentSceneState : initialPrompt;
        
        console.log('🎬 Starting stream with:', startPrompt);
        console.log('🎬 (Using ' + (currentSceneState ? 'evolved state' : 'initial prompt') + ')');
        
        await odysseyClient.startStream({ 
            prompt: startPrompt,
            portrait: false,
            // Try quality parameters (check Odyssey docs for exact names)
            model: 'odyssey-2-pro',
            quality: 'high'
        });
        
        isStreaming = true;
        streamStatus.textContent = 'Streaming';
        connectionStatus.textContent = 'Streaming';
        
        generatingIndicator.classList.remove('active');
        
        console.log('✅ Stream started');
        console.log('💡 Use WASD keys or speak to control the world');
        
        // Start session timer
        startSessionTimer();
        
        // Don't start auto-evolution - let user control everything
        
    } catch (error) {
        console.error('❌ Stream start error:', error);
        alert('Failed to start stream: ' + error.message);
        generatingIndicator.classList.remove('active');
    }
}

// Auto-evolution: continue story even without speech
function startAutoEvolution() {
    autoEvolutionInterval = setInterval(async () => {
        if (!isStreaming || !isConnected) return;
        
        const now = Date.now();
        
        // If user hasn't spoken recently, auto-evolve
        if (now - lastInteractionTime > INTERACTION_INTERVAL) {
            const autoPrompt = generateAutoEvolutionPrompt();
            console.log('🤖 Auto-evolving:', autoPrompt);
            
            try {
                generatingIndicator.classList.add('active');
                await odysseyClient.interact({ prompt: autoPrompt });
                
                interactionCount++;
                interactionCountEl.textContent = interactionCount;
                
                // Store in context
                storyContext.push(autoPrompt);
                if (storyContext.length > 10) storyContext.shift();
                
                setTimeout(() => {
                    generatingIndicator.classList.remove('active');
                }, 2000);
                
            } catch (error) {
                console.error('Auto-evolution error:', error);
                generatingIndicator.classList.remove('active');
            }
            
            lastInteractionTime = now;
        }
    }, AUTO_EVOLUTION_INTERVAL);
}

function generateAutoEvolutionPrompt() {
    // Dynamic story progression templates - realistic, no fantasy
    const evolutions = [
        // Scene transitions
        'Camera slowly moves forward through the environment',
        'Camera pans to reveal more of the surroundings',
        'Zoom out to show the wider landscape',
        'Camera glides smoothly through the scene',
        
        // Environmental changes
        'Lighting shifts as time passes',
        'Clouds move across the sky',
        'Wind gently moves through the scene',
        'Shadows change with the moving sun',
        
        // Movement
        'Walk forward along the path',
        'Turn to explore a different direction',
        'Move closer to examine details',
        'Step back to see the full view',
        
        // Atmospheric
        'Soft breeze rustles the leaves',
        'Natural ambient sounds and movement',
        'Peaceful atmosphere continues',
        'Serene environment evolves naturally',
        
        // Exploration
        'Continue exploring the environment',
        'Discover new areas ahead',
        'Follow the natural path forward',
        'Observe the changing scenery'
    ];
    
    // Context-aware evolution - realistic only
    if (storyContext.length > 0) {
        const lastContext = storyContext[storyContext.length - 1].toLowerCase();
        
        if (lastContext.includes('forest') || lastContext.includes('tree')) {
            return 'Walk deeper into the forest path';
        } else if (lastContext.includes('building') || lastContext.includes('house')) {
            return 'Approach and explore the building';
        } else if (lastContext.includes('water') || lastContext.includes('river')) {
            return 'Follow along the water\'s edge';
        } else if (lastContext.includes('mountain') || lastContext.includes('hill')) {
            return 'Climb higher up the slope';
        } else if (lastContext.includes('city') || lastContext.includes('street')) {
            return 'Walk down the street exploring the area';
        }
    }
    
    // Random evolution
    return evolutions[Math.floor(Math.random() * evolutions.length)];
}

async function interactWithVideo(spokenText) {
    console.log('🎯 interactWithVideo called');
    console.log('📝 Speech:', spokenText);
    
    if (!isStreaming) {
        console.log('⚠️ Not streaming, skipping interaction');
        return;
    }
    if (!isConnected) {
        console.log('⚠️ Not connected, skipping interaction');
        return;
    }
    
    try {
        lastVoiceInteractionTime = Date.now();
        generatingIndicator.classList.add('active');
        
        // Use OpenAI to generate optimal prompt (speech + audio features)
        const prompt = await generatePromptWithOpenAI(spokenText);
        
        console.log('📤 SENDING TO ODYSSEY:', prompt);
        
        const result = await odysseyClient.interact({ prompt: prompt });
        console.log('✅ Odyssey raw response:', result);
        console.log('✅ Response type:', typeof result);
        
        // Extract scene description from Odyssey response
        let sceneDescription = null;
        
        if (result) {
            // Try different ways to extract the scene
            if (typeof result === 'string') {
                sceneDescription = result;
            } else if (typeof result === 'object') {
                sceneDescription = result.description || result.scene || result.state || JSON.stringify(result);
            }
        }
        
        // Update scene state with full Odyssey description
        if (sceneDescription && sceneDescription.length > 50) {
            // Extract just the scene description part (before "Change:" if it exists)
            const parts = sceneDescription.split('\n\nChange:');
            currentSceneState = parts[0].trim();
            console.log('📍 Scene state updated from Odyssey response');
            console.log('📝 New state:', currentSceneState.substring(0, 100) + '...');
        } else {
            console.warn('⚠️ No valid Odyssey response, keeping previous state');
        }
        
        interactionCount++;
        interactionCountEl.textContent = interactionCount;
        
        // Check if hitting limits
        if (interactionCount >= 30) {
            console.warn('⚠️ Reached 30 interactions - may be hitting API limits');
        }
        
        // Store in context
        storyContext.push(prompt);
        if (storyContext.length > 10) storyContext.shift();
        
        setTimeout(() => {
            generatingIndicator.classList.remove('active');
        }, 2000);
        
        console.log('✅ Interaction applied');
        
    } catch (error) {
        console.error('❌ Interaction error:', error);
        generatingIndicator.classList.remove('active');
    }
}

function checkSpecialCommands(text) {
    const textUpper = text.toUpperCase();
    
    // Director commands
    if (textUpper.includes('CUT')) {
        console.log('🎬 CUT command detected');
        handleCutCommand();
        return true;
    }
    
    if (textUpper.includes('ACTION') || textUpper.includes('CONTINUE')) {
        console.log('🎬 ACTION command detected');
        handleActionCommand();
        return true;
    }
    
    if (textUpper.includes('FREEZE')) {
        console.log('❄️ FREEZE command detected');
        handleFreezeCommand();
        return true;
    }
    
    if (textUpper.includes('SLOW MOTION') || textUpper.includes('SLOW MO')) {
        console.log('🐌 SLOW MOTION command detected');
        handleSlowMotionCommand();
        return true;
    }
    
    if (textUpper.includes('SPEED UP') || textUpper.includes('FAST FORWARD')) {
        console.log('⚡ SPEED UP command detected');
        handleSpeedUpCommand();
        return true;
    }
    
    return false;
}

async function handleCutCommand() {
    isPaused = true;
    gestureIndicator.textContent = '🎬 CUT!';
    gestureIndicator.classList.add('active');
    
    try {
        await odysseyClient.interact({ prompt: 'Freeze frame, complete stop, hold still' });
    } catch (e) {
        console.error('CUT command error:', e);
    }
}

async function handleActionCommand() {
    isPaused = false;
    gestureIndicator.textContent = '🎬 ACTION!';
    gestureIndicator.classList.add('active');
    setTimeout(() => gestureIndicator.classList.remove('active'), 2000);
    
    try {
        await odysseyClient.interact({ prompt: 'Resume normal movement, continue action' });
    } catch (e) {
        console.error('ACTION command error:', e);
    }
}

async function handleFreezeCommand() {
    try {
        await odysseyClient.interact({ prompt: 'Time freeze, everything stops moving, frozen moment' });
    } catch (e) {
        console.error('FREEZE command error:', e);
    }
}

async function handleSlowMotionCommand() {
    try {
        await odysseyClient.interact({ prompt: 'Slow motion effect, everything moves very slowly' });
    } catch (e) {
        console.error('SLOW MOTION command error:', e);
    }
}

async function handleSpeedUpCommand() {
    try {
        await odysseyClient.interact({ prompt: 'Fast forward, everything moves quickly, time lapse' });
    } catch (e) {
        console.error('SPEED UP command error:', e);
    }
}

async function checkDramaticAudioEvents() {
    if (isPaused || !isStreaming || !isConnected) return;
    
    // BLOCK dramatic events during dwell-click / voice-prompt flow
    if (waitingForVoicePrompt || dwellConfirmed || isDwelling) {
        return;
    }
    
    // BLOCK dramatic events for 8 seconds after any intentional interaction
    const now = Date.now();
    if (now - lastVoiceInteractionTime < 8000) {
        return;
    }
    
    const { volume, volumeChange, loudDuration, quietDuration, pitch, energy } = currentAudioFeatures;
    
    // Use separate timer for audio events
    if (now - lastAudioEventTime < AUDIO_EVENT_INTERVAL) return;
    
    let dramaticPrompt = null;
    
    // Sudden loud sound (scream/explosion)
    if (volumeChange > 40 && volume > 60) {
        dramaticPrompt = 'SUDDEN SHOCK explosive dramatic impact, startling intense moment';
        console.log('💥 Sudden loud detected!');
    }
    // Sustained loud (building tension/horror)
    else if (loudDuration > 3) {
        const intensity = Math.min(loudDuration / 10, 1);
        dramaticPrompt = `Increasingly TERRIFYING and INTENSE atmosphere, building dread and horror, escalating ${intensity * 100}% intensity`;
        console.log('😱 Sustained loud - building horror!');
    }
    // Sudden quiet after loud (eerie silence)
    else if (volumeChange > 40 && volume < 20 && previousVolume > 50) {
        dramaticPrompt = 'SUDDEN SILENCE eerie quiet, unsettling calm, ominous stillness';
        console.log('🤫 Sudden silence!');
    }
    // Sustained quiet (suspense) — raised threshold to avoid false triggers
    else if (quietDuration > 10) {
        dramaticPrompt = 'SUSPENSEFUL quiet tension, anticipation building, something is about to happen';
        console.log('😰 Sustained quiet - building suspense!');
    }
    // High pitch scream
    else if (pitch === 'high' && volume > 50) {
        dramaticPrompt = 'TERRIFYING scream effect, horror moment, frightening scene';
        console.log('😱 High pitch scream!');
    }
    // Very low rumble
    else if (pitch === 'very-low' && energy > 40) {
        dramaticPrompt = 'OMINOUS deep rumbling, threatening presence, dark atmosphere';
        console.log('👹 Low rumble - ominous!');
    }
    
    if (dramaticPrompt) {
        lastAudioEventTime = now;
        
        try {
            generatingIndicator.classList.add('active');
            
            // Save current scene state — dramatic events should NOT overwrite it
            const savedSceneState = currentSceneState;
            
            // Use OpenAI for dramatic events too
            const prompt = await generatePromptWithOpenAI(dramaticPrompt);
            
            // Restore scene state so dramatic events don't hijack the narrative
            currentSceneState = savedSceneState;
            
            await odysseyClient.interact({ prompt: prompt });
            interactionCount++;
            interactionCountEl.textContent = interactionCount;
            
            console.log('🎭 Dramatic event sent (scene state preserved)');
            
            setTimeout(() => {
                generatingIndicator.classList.remove('active');
            }, 1500);
            
        } catch (error) {
            console.error('Dramatic event error:', error);
        }
    }
}

// Generate prompt using OpenAI (speech + audio features only, no gestures)
async function generatePromptWithOpenAI(spokenText) {
    try {
        const { volume, pitch, energy } = currentAudioFeatures;
        
        // Build context for OpenAI - prioritize user's words!
        let systemPrompt = `You are a prompt translator for Odyssey video world.

PRIMARY RULE: Execute exactly what the user says. If they say "buildings", show buildings. If they say "red balloon", show red balloon.

Current scene: "${currentSceneState}"

How to interpret input:
- USER'S WORDS = highest priority, execute literally
- Audio features = adjust intensity/mood ONLY (do NOT override user's words)

Output a clear, direct Odyssey prompt. DO NOT add poetic language. Be literal and specific.`;

        let userPrompt = 'Input:\n';
        
        if (spokenText) {
            userPrompt += `- Speech: "${spokenText}"\n`;
        }
        
        userPrompt += `- Volume: ${volume}% (${volume > 40 ? 'LOUD' : volume > 20 ? 'normal' : 'quiet'})\n`;
        userPrompt += `- Pitch: ${pitch} (${pitch.includes('high') ? 'bright/energetic' : pitch.includes('low') ? 'dark/serious' : 'balanced'})\n`;
        userPrompt += `- Energy: ${energy}\n`;
        
        userPrompt += `\nCreate a visual scene description for Odyssey (max 25 words):
- Focus on what user said: translate their words into visual action
- DO NOT include technical parameters (volume, pitch, energy numbers)
- DO NOT describe audio settings
- ONLY describe what happens visually in the scene

Example:
User says: "lots of buildings appears"
Correct output: "Tall buildings rise from the ground and appear in the scene" ✅
Wrong output: "Set volume to X%, buildings emerge" ❌

Output ONLY the visual scene description.`;
        
        console.log('🤖 Asking OpenAI to generate prompt...');
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiApiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                max_tokens: 50,
                temperature: 0.3
            })
        });
        
        if (!response.ok) {
            throw new Error('OpenAI API error: ' + response.status);
        }
        
        const data = await response.json();
        const generatedPrompt = data.choices[0].message.content.trim();
        
        console.log('🤖 OpenAI generated prompt:', generatedPrompt);
        
        // Update current scene state for continuity
        currentSceneState = generatedPrompt;
        console.log('📍 Scene state updated');
        
        return generatedPrompt;
        
    } catch (error) {
        console.error('❌ OpenAI error:', error);
        
        // Fallback to simple prompt if OpenAI fails
        if (spokenText) {
            return spokenText;
        } else {
            return 'continue exploring';
        }
    }
}

function buildVoicePromptWithFeatures(spokenText) {
    const { volume, pitch, energy } = currentAudioFeatures;
    
    // If has text, prioritize the text content
    if (spokenText && spokenText.length > 3) {
        // Simple modifier based on volume only
        if (volume > 40) {
            return `${spokenText} with strong intensity`;
        } else if (volume > 20) {
            return spokenText; // Just use the text as-is
        } else {
            return `${spokenText} gently`;
        }
    } else {
        // No text - use audio features to control atmosphere
        let mood = '';
        
        if (volume > 40 && energy > 40) {
            mood = 'intense dramatic';
        } else if (volume > 20) {
            mood = 'moderate flowing';
        } else {
            mood = 'calm peaceful';
        }
        
        if (pitch === 'high' || pitch === 'mid-high') {
            mood += ' bright';
        } else if (pitch === 'low' || pitch === 'very-low') {
            mood += ' dark';
        }
        
        return `Camera movement ${mood} atmosphere`;
    }
}

// ==================== HAND GESTURE CONTROL ====================

async function startHandGestureTracking() {
    try {
        console.log('🖐️ Starting hand gesture tracking...');
        
        // Initialize MediaPipe Hands
        hands = new window.Hands({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
            }
        });
        
        hands.setOptions({
            maxNumHands: 2,
            modelComplexity: 1,
            minDetectionConfidence: 0.8,  // Increased from 0.5
            minTrackingConfidence: 0.8    // Increased from 0.5
        });
        
        hands.onResults(onHandResults);
        
        // Setup camera - reuse pre-requested stream if available
        if (window.cameraStream) {
            handVideo.srcObject = window.cameraStream;
            console.log('✅ Reusing existing camera stream for hand tracking');
        }
        
        camera = new window.Camera(handVideo, {
            onFrame: async () => {
                if (hands) {
                    await hands.send({ image: handVideo });
                }
            },
            width: 640,
            height: 480
        });
        
        camera.start();
        
        console.log('✅ Hand gesture tracking started');
        
    } catch (error) {
        console.error('❌ Hand tracking error:', error);
        throw error;
    }
}

function onHandResults(results) {
    // Set canvas size if not set
    if (handCanvas.width !== handVideo.videoWidth) {
        handCanvas.width = handVideo.videoWidth;
        handCanvas.height = handVideo.videoHeight;
    }
    
    // Clear canvas
    const canvasCtx = handCanvas.getContext('2d');
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, handCanvas.width, handCanvas.height);
    
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0 && results.multiHandedness) {
        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            const landmarks = results.multiHandLandmarks[i];
            const confidence = results.multiHandedness[i]?.score || 0;
            
            if (confidence < 0.85) {
                continue;
            }
            
            // Draw hand skeleton
            window.drawConnectors(canvasCtx, landmarks, window.HAND_CONNECTIONS, {color: '#00FF00', lineWidth: 3});
            window.drawLandmarks(canvasCtx, landmarks, {color: '#FF0000', lineWidth: 2, radius: 5});
            
            // Recognize gesture
            const gesture = recognizeGesture(landmarks);
            
            // ===== FINGER CURSOR + DWELL CLICK =====
            if (gesture === '☝️ Pointing') {
                const indexTip = landmarks[8];
                const newX = 1.0 - indexTip.x; // Mirror X for webcam
                const newY = indexTip.y;
                
                if (!isPointing) {
                    // Just started pointing
                    isPointing = true;
                    dwellConfirmed = false;
                    dwellStartTime = Date.now();
                    dwellPos.x = newX;
                    dwellPos.y = newY;
                }
                
                fingerCursorPos.x = newX;
                fingerCursorPos.y = newY;
                updateFingerCursor();
                
                // Dwell detection: check if finger is staying still
                const dx = Math.abs(newX - dwellPos.x);
                const dy = Math.abs(newY - dwellPos.y);
                const moved = dx > DWELL_MOVE_THRESHOLD || dy > DWELL_MOVE_THRESHOLD;
                
                if (moved) {
                    // Finger moved — reset dwell
                    dwellPos.x = newX;
                    dwellPos.y = newY;
                    dwellStartTime = Date.now();
                    isDwelling = false;
                    stopDwellProgress();
                    fingerCursorEl?.classList.remove('dwelling');
                } else if (!dwellConfirmed) {
                    // Finger is still — check dwell time
                    const elapsed = Date.now() - dwellStartTime;
                    
                    if (!isDwelling && elapsed > 300) {
                        // Start showing dwell progress after 300ms of stillness
                        isDwelling = true;
                        startDwellProgress();
                        fingerCursorEl?.classList.add('dwelling');
                    }
                    
                    if (elapsed >= DWELL_TIME) {
                        // DWELL CONFIRMED = CLICK!
                        dwellConfirmed = true;
                        isDwelling = false;
                        stopDwellProgress();
                        fingerCursorEl?.classList.remove('dwelling');
                        fingerCursorEl?.classList.add('clicked');
                        setTimeout(() => fingerCursorEl?.classList.remove('clicked'), 500);
                        
                        console.log('🎯 DWELL CLICK at', newX.toFixed(2), newY.toFixed(2));
                        handleFingerClick(newX, newY);
                    }
                }
                
            } else {
                if (isPointing) {
                    isPointing = false;
                    isDwelling = false;
                    stopDwellProgress();
                    hideFingerCursor();
                }
            }
            
            // Update gesture state (for UI display only, not sent to Odyssey)
            if (gesture && gesture !== currentGesture) {
                currentGesture = gesture;
            }
        }
    } else {
        currentGesture = null;
        isPointing = false;
        isDwelling = false;
        stopDwellProgress();
        hideFingerCursor();
        gestureIndicator.classList.remove('active');
    }
    
    canvasCtx.restore();
}

function recognizeGesture(landmarks) {
    // Get key points
    const thumb = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];
    const wrist = landmarks[0];
    const indexBase = landmarks[5];
    
    // Helper: check if finger is extended
    const isExtended = (tip, base) => tip.y < base.y;
    
    const thumbExtended = thumb.x < landmarks[3].x; // Thumb logic different
    const indexExtended = isExtended(indexTip, indexBase);
    const middleExtended = isExtended(middleTip, landmarks[9]);
    const ringExtended = isExtended(ringTip, landmarks[13]);
    const pinkyExtended = isExtended(pinkyTip, landmarks[17]);
    
    // Recognize specific gestures
    
    // 👍 Thumbs up
    if (thumbExtended && !indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
        return '👍 Thumbs Up';
    }
    
    // ✋ Open palm (all fingers extended)
    if (indexExtended && middleExtended && ringExtended && pinkyExtended) {
        return '✋ Open Palm';
    }
    
    // ✊ Fist (all fingers closed)
    if (!indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
        return '✊ Fist';
    }
    
    // ☝️ Pointing (only index extended)
    if (indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
        return '☝️ Pointing';
    }
    
    // ✌️ Peace sign (index + middle)
    if (indexExtended && middleExtended && !ringExtended && !pinkyExtended) {
        return '✌️ Peace';
    }
    
    // 🤘 Rock (index + pinky)
    if (indexExtended && !middleExtended && !ringExtended && pinkyExtended) {
        return '🤘 Rock';
    }
    
    // 🤏 Pinch (thumb + index close together)
    const distance = Math.sqrt(
        Math.pow(thumb.x - indexTip.x, 2) + 
        Math.pow(thumb.y - indexTip.y, 2)
    );
    if (distance < 0.05) {
        return '🤏 Pinch';
    }
    
    return null;
}

// Removed standalone gesture handler - gestures now collected with speech

// ==================== FINGER CURSOR & DWELL-CLICK + VOICE GROUNDING ====================

function updateFingerCursor() {
    if (!fingerCursorEl || !videoDisplay) return;
    
    const rect = videoDisplay.getBoundingClientRect();
    const px = fingerCursorPos.x * rect.width;
    const py = fingerCursorPos.y * rect.height;
    
    fingerCursorEl.style.left = px + 'px';
    fingerCursorEl.style.top = py + 'px';
    fingerCursorEl.classList.add('active');
    
    // Show pointing gesture indicator
    gestureIndicator.textContent = '☝️ Pointing';
    gestureIndicator.classList.add('active');
}

function hideFingerCursor() {
    fingerCursorEl?.classList.remove('active');
    fingerCursorEl?.classList.remove('dwelling');
    fingerCursorEl?.classList.remove('clicked');
    if (gestureIndicator.textContent === '☝️ Pointing') {
        gestureIndicator.classList.remove('active');
    }
}

function startDwellProgress() {
    // Update the CSS custom property for the ring animation
    if (fingerCursorEl) {
        fingerCursorEl.style.setProperty('--dwell-duration', DWELL_TIME + 'ms');
    }
}

function stopDwellProgress() {
    // Reset dwell visual
    if (fingerCursorEl) {
        fingerCursorEl.classList.remove('dwelling');
    }
}

function handleFingerClick(xNorm, yNorm) {
    // Show click marker animation
    if (clickMarkerEl && videoDisplay) {
        const rect = videoDisplay.getBoundingClientRect();
        clickMarkerEl.style.left = (xNorm * rect.width) + 'px';
        clickMarkerEl.style.top = (yNorm * rect.height) + 'px';
        clickMarkerEl.style.display = 'block';
        clickMarkerEl.style.animation = 'none';
        clickMarkerEl.offsetHeight; // Force reflow
        clickMarkerEl.style.animation = 'clickRipple 0.6s ease-out forwards';
        setTimeout(() => { clickMarkerEl.style.display = 'none'; }, 600);
    }
    
    // Store click position
    lastClickPos = { xPercent: xNorm, yPercent: yNorm };
    
    // Capture frames from video
    lastClickFrameData = captureSelectionFrames(xNorm, yNorm);
    
    // IMMEDIATELY pre-analyze scene (don't wait for voice)
    visionResult = null;
    preAnalyzeScene(xNorm, yNorm);
    
    // Mute speech recognition for 1 second after click
    temporaryMuteUntil = Date.now() + 1000;
    console.log('🔇 Speech muted for 1 second after click');
    
    // Enter "waiting for voice prompt" mode after 1 second
    waitingForVoicePrompt = true;
    showVoicePromptHint(xNorm, yNorm, true); // true = show countdown
    
    console.log('📍 Dwell-click registered at', xNorm.toFixed(2), yNorm.toFixed(2));
    console.log('🎤 Will start listening in 1 second...');
}

// Pre-analyze the clicked scene area immediately (runs in background)
async function preAnalyzeScene(xNorm, yNorm) {
    if (!openaiApiKey || !lastClickFrameData) {
        console.warn('⚠️ Cannot pre-analyze: missing key or frame data');
        return;
    }
    
    try {
        console.log('👁️ Pre-analyzing scene at click point...');
        
        const systemPrompt = `You analyze a video frame where the user pointed (marked with a red circle).
Describe what is at and around the click point with detailed spatial relationships.

Return ONLY valid JSON:
{
  "selection": "what is exactly at the click point (1-3 words, e.g. 'dirt road', 'grass field', 'river bank')",
  "locationHint": "detailed spatial description from MULTIPLE perspectives (e.g. 'on the dirt road, in the left foreground of the frame, to the right of the running man')",
  "nearbyAnchor": "the most recognizable nearby object (e.g. 'pine tree', 'red barn', 'stone wall')",
  "framePosition": "position in frame using natural language (e.g. 'left foreground', 'right background', 'center middle-ground', 'far background')",
  "relativeToSubject": "position relative to main subject/person if visible (e.g. 'to the man's right', 'behind the runner', 'in front of the person')",
  "depth": "depth in scene (e.g. 'foreground', 'middle-ground', 'background', 'far background')",
  "sceneDescription": "brief description of the full visible scene (1 sentence)",
  "confidence": 0.0-1.0
}

CRITICAL Rules:
- Provide LAYERED spatial descriptions: frame position + depth + relative to subjects
- Use natural 3D spatial language: left/right foreground, center background, etc.
- If there's a person/main subject, describe position relative to them
- Combine multiple perspectives in locationHint for maximum precision
- Examples of good locationHint:
  ✓ "on the dirt path in the left foreground, to the right side of the running man"
  ✓ "in the background on the right side, behind the trees"
  ✓ "center middle-ground, directly in front of the person"
- Do NOT use vague terms or grid coordinates`;

        const userContent = [
            {
                type: 'image_url',
                image_url: { url: lastClickFrameData.fullFrame, detail: 'low' }
            },
            {
                type: 'image_url',
                image_url: { url: lastClickFrameData.zoomFrame, detail: 'high' }
            },
            {
                type: 'text',
                text: `User pointed at (${(xNorm * 100).toFixed(0)}%, ${(yNorm * 100).toFixed(0)}%) marked with a red circle. Describe what is at and around this exact point.`
            }
        ];
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiApiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userContent }
                ],
                max_tokens: 250,
                temperature: 0.15
            })
        });
        
        if (!response.ok) {
            throw new Error('OpenAI pre-analysis error: ' + response.status);
        }
        
        const data = await response.json();
        const raw = data.choices[0].message.content.trim();
        const clean = raw.replace(/```json|```/g, '').trim();
        visionResult = JSON.parse(clean);
        
        console.log('👁️ Scene pre-analysis complete:', visionResult);
        
        // Update the hint panel with detailed scene info after 1 second
        setTimeout(() => {
            if (clickPromptInfo && waitingForVoicePrompt) {
                const details = [];
                if (visionResult.selection) details.push(`${visionResult.selection}`);
                if (visionResult.framePosition) details.push(`(${visionResult.framePosition})`);
                if (visionResult.relativeToSubject) details.push(`${visionResult.relativeToSubject}`);
                
                clickPromptInfo.textContent = `📍 Pointing at: ${details.join(' ')} — Now speak!`;
            }
        }, 1000);
        
    } catch (error) {
        console.error('❌ Scene pre-analysis error:', error);
        visionResult = null;
    }
}

// Also allow mouse/touch click on video as fallback
if (videoDisplay) {
    videoDisplay.addEventListener('click', (e) => {
        if (e.target.closest('.click-prompt-panel')) return;
        
        const rect = videoDisplay.getBoundingClientRect();
        const xNorm = (e.clientX - rect.left) / rect.width;
        const yNorm = (e.clientY - rect.top) / rect.height;
        
        console.log('🖱️ Mouse click at', xNorm.toFixed(2), yNorm.toFixed(2));
        handleFingerClick(xNorm, yNorm);
    });
}

function showVoicePromptHint(xNorm, yNorm, showCountdown = false) {
    if (!clickPromptPanel) return;
    clickPromptPanel.style.display = 'block';
    
    if (showCountdown) {
        // Show countdown for 1 second
        clickPromptInfo.textContent = `📍 (${(xNorm * 100).toFixed(0)}%, ${(yNorm * 100).toFixed(0)}%) — Ready in 1 second...`;
        setTimeout(() => {
            if (waitingForVoicePrompt) {
                clickPromptInfo.textContent = `🎤 Now speak: what should happen here?`;
            }
        }, 1000);
    } else {
        clickPromptInfo.textContent = `📍 (${(xNorm * 100).toFixed(0)}%, ${(yNorm * 100).toFixed(0)}%) — Now speak: what should happen here?`;
    }
    
    // Auto-timeout after 15 seconds if no speech
    setTimeout(() => {
        if (waitingForVoicePrompt) {
            waitingForVoicePrompt = false;
            temporaryMuteUntil = 0; // Clear mute
            hideVoicePromptHint();
            console.log('⏱️ Voice prompt timed out');
        }
    }, 15000);
}

function hideVoicePromptHint() {
    if (!clickPromptPanel) return;
    clickPromptPanel.style.display = 'none';
    temporaryMuteUntil = 0; // Clear mute when hiding hint
}

// Called from speech recognition when we're in waiting-for-voice-prompt mode
async function handleVoiceGroundedPrompt(spokenText) {
    if (!lastClickPos) return;
    
    waitingForVoicePrompt = false;
    temporaryMuteUntil = 0; // Clear mute
    console.log('🎯 Voice prompt for click:', spokenText);
    
    if (clickPromptInfo) {
        clickPromptInfo.textContent = '🔄 Grounding "' + spokenText + '" to scene...';
    }
    
    try {
        let finalPrompt;
        
        // If we already have pre-analyzed scene data, use it directly
        if (visionResult && visionResult.locationHint) {
            console.log('✅ Using pre-analyzed scene data:', visionResult);
            
            // Try a second vision call with both scene context AND user prompt for best rewrite
            finalPrompt = await getVisionGroundedPrompt(spokenText);
            
        } else {
            // No pre-analysis available, do full vision call now
            console.log('⚠️ No pre-analysis, doing full vision call...');
            finalPrompt = await getVisionGroundedPrompt(spokenText);
        }
        
        console.log('📤 Final grounded prompt:', finalPrompt);
        if (clickPromptInfo) {
            clickPromptInfo.textContent = '✅ Sent: ' + finalPrompt;
        }
        
        // Send to Odyssey midstream
        if (isStreaming && odysseyClient) {
            generatingIndicator.classList.add('active');
            
            await odysseyClient.interact({ prompt: finalPrompt });
            
            interactionCount++;
            interactionCountEl.textContent = interactionCount;
            currentSceneState = finalPrompt;
            storyContext.push(finalPrompt);
            if (storyContext.length > 10) storyContext.shift();
            
            setTimeout(() => generatingIndicator.classList.remove('active'), 2000);
        }
        
        // Auto-hide hint after success
        setTimeout(hideVoicePromptHint, 3000);
        
    } catch (error) {
        console.error('❌ Voice grounded prompt error:', error);
        if (clickPromptInfo) {
            clickPromptInfo.textContent = '❌ Error: ' + error.message;
        }
        setTimeout(hideVoicePromptHint, 3000);
    }
}

function captureSelectionFrames(xNorm, yNorm) {
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const vw = videoElement.videoWidth || 1280;
        const vh = videoElement.videoHeight || 720;
        
        // 1. Full frame with red click marker
        canvas.width = vw;
        canvas.height = vh;
        ctx.drawImage(videoElement, 0, 0, vw, vh);
        
        const markerX = xNorm * vw;
        const markerY = yNorm * vh;
        ctx.beginPath();
        ctx.arc(markerX, markerY, 18, 0, Math.PI * 2);
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(markerX, markerY, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#ff0000';
        ctx.fill();
        
        const fullFrame = canvas.toDataURL('image/jpeg', 0.85);
        
        // 2. Zoom crop around click (25% of frame centered on click)
        const cropSize = Math.min(vw, vh) * 0.25;
        const cropX = Math.max(0, Math.min(vw - cropSize, markerX - cropSize / 2));
        const cropY = Math.max(0, Math.min(vh - cropSize, markerY - cropSize / 2));
        
        const zoomCanvas = document.createElement('canvas');
        zoomCanvas.width = 512;
        zoomCanvas.height = 512;
        const zCtx = zoomCanvas.getContext('2d');
        zCtx.drawImage(videoElement, cropX, cropY, cropSize, cropSize, 0, 0, 512, 512);
        
        const zMarkerX = ((markerX - cropX) / cropSize) * 512;
        const zMarkerY = ((markerY - cropY) / cropSize) * 512;
        zCtx.beginPath();
        zCtx.arc(zMarkerX, zMarkerY, 12, 0, Math.PI * 2);
        zCtx.strokeStyle = '#ff0000';
        zCtx.lineWidth = 3;
        zCtx.stroke();
        
        const zoomFrame = zoomCanvas.toDataURL('image/jpeg', 0.9);
        
        console.log('📸 Captured full frame + zoom crop');
        return { fullFrame, zoomFrame };
        
    } catch (error) {
        console.error('❌ Frame capture error:', error);
        return null;
    }
}

async function getVisionGroundedPrompt(userPrompt) {
    if (!openaiApiKey) {
        console.warn('⚠️ No OpenAI key, using fallback');
        return composeFallbackPrompt(userPrompt);
    }
    
    if (!lastClickFrameData) {
        console.warn('⚠️ No frame data, using fallback');
        return composeFallbackPrompt(userPrompt);
    }
    
    // If we already have pre-analyzed scene and it's high confidence,
    // skip the second vision call and compose directly
    if (visionResult && visionResult.confidence >= 0.7 && visionResult.locationHint) {
        console.log('⚡ Using pre-analyzed scene for fast grounding');
        const composed = composeWithSceneLocation(userPrompt, visionResult.locationHint);
        console.log('📝 Composed prompt:', composed);
        return composed;
    }
    
    try {
        const { xPercent, yPercent } = lastClickPos;
        
        // Build scene context from pre-analysis if available
        let sceneContext = '';
        if (visionResult) {
            sceneContext = `\n\nPre-analysis of click point:
- At click: "${visionResult.selection || 'unknown'}"
- Frame position: "${visionResult.framePosition || 'unknown'}"
- Depth: "${visionResult.depth || 'unknown'}"
- Relative to subject: "${visionResult.relativeToSubject || 'unknown'}"
- Location hint: "${visionResult.locationHint || 'unknown'}"
- Nearby anchor: "${visionResult.nearbyAnchor || 'unknown'}"
- Scene: "${visionResult.sceneDescription || currentSceneState || 'unknown'}"
Use ALL these spatial details to write the MOST precise prompt rewrite possible.`;
        }
        
        const systemPrompt = `You analyze a video frame where the user pointed (marked with a red circle) and rewrite their voice command into a precise, scene-grounded prompt for a video AI.

Return ONLY valid JSON:
{
  "selection": "what is at the click point (1-3 words)",
  "locationHint": "detailed spatial description from multiple perspectives",
  "framePosition": "position in frame (e.g. 'left foreground', 'right background')",
  "relativeToSubject": "position relative to main subject/person if visible",
  "depth": "depth in scene (foreground/middle-ground/background)",
  "nearbyAnchor": "closest recognizable object near the click",
  "confidence": 0.0-1.0,
  "promptRewrite": "the user's intent rewritten with EXACT multi-dimensional scene location"
}

CRITICAL rules for promptRewrite:
- PRESERVE the user's intent exactly (if they say "add a car", the rewrite must add a car)
- REPLACE vague words (here/there/this) with LAYERED spatial descriptions
- Use MULTIPLE spatial references:
  * Frame position: "in the left foreground", "right background"
  * Depth: "in the foreground", "far background"
  * Relative to subjects: "to the man's right", "behind the runner"
  * Landmarks: "beside the tree", "on the road"
- NEVER use grid language like "left area", "upper portion"
- Example good rewrites:
  ✓ "add a car on the dirt road in the left foreground, to the right of the running man"
  ✓ "place a tree in the background on the right side, behind the existing trees"
- The rewrite must specify WHERE in 3D space (left/right + depth + relative)
- Keep under 35 words${sceneContext}`;

        const userContent = [
            {
                type: 'image_url',
                image_url: { url: lastClickFrameData.fullFrame, detail: 'low' }
            },
            {
                type: 'image_url',
                image_url: { url: lastClickFrameData.zoomFrame, detail: 'high' }
            },
            {
                type: 'text',
                text: `User pointed at (${(xPercent * 100).toFixed(0)}%, ${(yPercent * 100).toFixed(0)}%) and said: "${userPrompt}"\n\nRewrite their prompt with exact scene-aware location.`
            }
        ];
        
        console.log('🤖 Calling OpenAI vision for scene-grounded rewrite...');
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiApiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userContent }
                ],
                max_tokens: 250,
                temperature: 0.15
            })
        });
        
        if (!response.ok) {
            throw new Error('OpenAI vision error: ' + response.status);
        }
        
        const data = await response.json();
        const raw = data.choices[0].message.content.trim();
        
        const clean = raw.replace(/```json|```/g, '').trim();
        const result = JSON.parse(clean);
        
        // Update visionResult with the richer data
        visionResult = { ...visionResult, ...result };
        
        console.log('👁️ Vision grounded result:', visionResult);
        
        // Use the prompt rewrite if it's good
        const rewrite = result.promptRewrite || '';
        if (rewrite && !containsGridLanguage(rewrite) && rewrite.length > 5) {
            console.log('✅ Using vision promptRewrite:', rewrite);
            return rewrite;
        }
        
        // Fallback: compose with location hint from either this call or pre-analysis
        const locationHint = result.locationHint || (visionResult && visionResult.locationHint);
        if (locationHint) {
            return composeWithSceneLocation(userPrompt, locationHint);
        }
        
        return composeFallbackPrompt(userPrompt);
        
    } catch (error) {
        console.error('❌ Vision grounding error:', error);
        
        // If pre-analysis exists, use it as fallback
        if (visionResult && visionResult.locationHint) {
            console.log('🔄 Falling back to pre-analyzed scene data');
            return composeWithSceneLocation(userPrompt, visionResult.locationHint);
        }
        
        return composeFallbackPrompt(userPrompt);
    }
}

function containsGridLanguage(text) {
    const gridTerms = ['middle-left', 'top-right', 'bottom-center', 'upper-left', 'lower-right', 'center area', 'left area', 'right area'];
    const lower = text.toLowerCase();
    return gridTerms.some(t => lower.includes(t));
}

function composeWithSceneLocation(userPrompt, locationHint) {
    let prompt = userPrompt
        .replace(/\b(here|there|this area|that area|this spot|that spot)\b/gi, locationHint);
    
    if (prompt === userPrompt) {
        prompt = `${userPrompt} ${locationHint}`;
    }
    
    return prompt;
}

function composeFallbackPrompt(userPrompt) {
    if (!lastClickPos) return userPrompt;
    
    const { xPercent, yPercent } = lastClickPos;
    
    const xDesc = xPercent < 0.33 ? 'on the left side' : xPercent > 0.66 ? 'on the right side' : 'in the center';
    const yDesc = yPercent < 0.33 ? 'at the top' : yPercent > 0.66 ? 'at the bottom' : 'in the middle';
    
    return `${userPrompt} ${xDesc} ${yDesc} of the scene`;
}

// ==================== SESSION TIMER ====================

function startSessionTimer() {
    sessionStartTime = Date.now();
    
    if (sessionTimerInterval) {
        clearInterval(sessionTimerInterval);
    }
    
    sessionTimerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
        const remaining = Math.max(0, SESSION_DURATION - elapsed);
        
        // Update display
        if (sessionTimerEl) {
            sessionTimerEl.textContent = remaining + 's';
            
            // Color coding
            if (remaining <= 0) {
                sessionTimerEl.textContent = '0s';
                sessionTimerEl.className = 'timer-value';
            } else if (remaining <= 30) {
                sessionTimerEl.className = 'timer-value critical';
            } else if (remaining <= 60) {
                sessionTimerEl.className = 'timer-value warning';
            } else {
                sessionTimerEl.className = 'timer-value';
            }
        }
        
        // Stop at 0
        if (remaining <= 0) {
            clearInterval(sessionTimerInterval);
            console.log('⏱️ Session timer reached 0 - waiting for auto-restart');
        }
    }, 100); // Update every 100ms for smooth countdown
    
    console.log('⏱️ Session timer started - 150 seconds');
}

// ==================== ERROR HANDLING ====================

function handleStreamError(error) {
    console.error('🚨 Stream error occurred:', error);
    
    connectionStatus.textContent = 'Error';
    connectionStatus.className = 'status-badge connecting';
    
    // Show user-friendly error message
    const errorMsg = JSON.stringify(error);
    console.error('Error details:', errorMsg);
    
    // Check if it's content policy
    if (errorMsg.includes('safety') || errorMsg.includes('policy') || errorMsg.includes('content')) {
        console.warn('🚫 Content policy violation - clearing words and restarting');
        recentWords = [];
        storyContext = [];
        
        // Restart stream
        setTimeout(() => {
            if (isConnected && !isStreaming) {
                startVideoStream();
            }
        }, 3000);
    }
    // Check for common errors
    else if (errorMsg.includes('limit') || errorMsg.includes('quota')) {
        alert('⚠️ API limit reached. Please check your Odyssey quota.');
    } else if (errorMsg.includes('auth') || errorMsg.includes('key')) {
        alert('⚠️ Authentication error. Please check your API key.');
    } else {
        console.warn('Stream error - will try to continue');
    }
}

// ==================== CLEANUP ====================

window.addEventListener('beforeunload', () => {
    if (odysseyClient) {
        odysseyClient.disconnect();
    }
});

console.log('🎬 Voice Evolution Video loaded');
console.log('📝 Enter your API Keys and click START');
console.log('🎵 Voice Controls:');
console.log('   🎬 Say "CUT" to freeze');
console.log('   🎬 Say "ACTION" to continue');
console.log('   💥 Sudden loud = shock effect');
console.log('   😱 Sustained loud = increasing horror');
console.log('   🤫 Sudden quiet = eerie silence');
console.log('   🖐️ Use hand gestures for actions');
console.log('   ☝️ Point finger = cursor on video');
console.log('   🤏 Pinch = click to select area');
console.log('   🎯 Click + type prompt = grounded scene edit');
