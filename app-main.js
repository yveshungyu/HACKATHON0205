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

// Hand Gesture Control
let hands;
let camera;
let handGestureEnabled = true;
let currentGesture = null;
let gesturesInWindow = []; // Store gestures during speech
let collectingGestures = false;

// Virtual Cursor (finger pointing mode)
let cursorModeActive = false;
let virtualCursorEl = null;
let cursorX = 0;
let cursorY = 0;
let smoothCursorX = 0;
let smoothCursorY = 0;
const CURSOR_SMOOTHING = 0.35; // Lower = smoother but more lag (0-1)
let isPinching = false;
let wasPinching = false;
let pinchCooldown = false;
let lastHoveredElement = null;

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
const openaiKeyInput = document.getElementById('openaiKey');
const initialPromptInput = document.getElementById('initialPrompt');
const toggleKeyBtn = document.getElementById('toggleKey');
const toggleOpenAIKeyBtn = document.getElementById('toggleOpenAIKey');
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
virtualCursorEl = document.getElementById('virtualCursor');

// Session timer
let sessionStartTime = 0;
let sessionTimerInterval = null;
const SESSION_DURATION = 150; // 150 seconds

// ==================== INITIALIZATION ====================

let openaiApiKey = '';

window.addEventListener('DOMContentLoaded', () => {
    const savedKey = localStorage.getItem('odyssey_api_key');
    if (savedKey) {
        apiKeyInput.value = savedKey;
    }
    
    const savedOpenAIKey = localStorage.getItem('openai_api_key');
    if (savedOpenAIKey) {
        openaiKeyInput.value = savedOpenAIKey;
        openaiApiKey = savedOpenAIKey;
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

toggleOpenAIKeyBtn.addEventListener('click', () => {
    if (openaiKeyInput.type === 'password') {
        openaiKeyInput.type = 'text';
        toggleOpenAIKeyBtn.textContent = '🔒';
    } else {
        openaiKeyInput.type = 'password';
        toggleOpenAIKeyBtn.textContent = '👁️';
    }
});

apiKeyInput.addEventListener('input', (e) => {
    localStorage.setItem('odyssey_api_key', e.target.value);
});

openaiKeyInput.addEventListener('input', (e) => {
    openaiApiKey = e.target.value;
    localStorage.setItem('openai_api_key', e.target.value);
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
    openaiApiKey = openaiKeyInput.value.trim();
    
    if (!apiKey) {
        alert('❌ Please enter your Odyssey API Key!');
        return;
    }
    
    if (!openaiApiKey) {
        alert('❌ Please enter your OpenAI API Key!');
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
        
        // Request all permissions upfront (only once)
        if (!window.microphoneStream) {
            console.log('🎤 Requesting microphone permission...');
            window.microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log('✅ Microphone permission granted');
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
    
    if (cursorModeActive) {
        exitCursorMode();
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
        
        // Start tracking peaks when user starts speaking
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
        
        if (finalTranscript) {
            const spokenText = finalTranscript.trim();
            
            // Stop tracking and use the peaks
            isSpeaking = false;
            console.log('🎤 Speech ended - using peaks:', speechAudioPeaks);
            
            // Temporarily override current audio features with speech peaks
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
            console.log('📊 Using speech peaks - Vol:', speechAudioPeaks.maxVolume, 'Energy:', speechAudioPeaks.maxEnergy);
            
            // Check for special commands first
            if (checkSpecialCommands(spokenText)) {
                console.log('📌 Special command executed');
                return; // Command handled
            }
            
            // Start collecting gestures when speech is detected
            if (!collectingGestures) {
                collectingGestures = true;
                gesturesInWindow = [];
                console.log('👂 Started collecting gestures for 2 seconds...');
            }
            
            // Wait 2 seconds after speech to collect gestures, then send all together
            setTimeout(async () => {
                if (collectingGestures) {
                    collectingGestures = false;
                    
                    const now = Date.now();
                    const timeSinceLastVoice = now - lastVoiceInteractionTime;
                    
                    if (timeSinceLastVoice > VOICE_INTERACTION_INTERVAL) {
                        console.log('✅ Sending speech + gestures to OpenAI');
                        console.log('📊 Collected gestures:', gesturesInWindow);
                        
                        // Get most recent gesture if any
                        const recentGesture = gesturesInWindow.length > 0 ? 
                            gesturesInWindow[gesturesInWindow.length - 1] : null;
                        
                        await interactWithVideo(spokenText, 'voice', recentGesture);
                    }
                    
                    gesturesInWindow = [];
                }
            }, 2000); // Wait 2 seconds after speech
            
            // Restore original audio features after processing
            setTimeout(() => {
                currentAudioFeatures = originalFeatures;
            }, 3000);
        }
        
        // Also trigger on any sound (even without text) if volume is significant
        const now = Date.now();
        if (!finalTranscript && currentAudioFeatures.volume > 20 && 
            now - lastVoiceInteractionTime > VOICE_INTERACTION_INTERVAL) {
            console.log('🎵 Sound detected (music/humming), triggering audio-based interaction');
            await interactWithVideo('', 'audio');
        }
        
        // Check for dramatic audio events (less frequently)
        await checkDramaticAudioEvents();
        
        const displayText = finalTranscript || interimTranscript;
        if (displayText) {
            spokenWordsEl.textContent = displayText;
            speechStatusEl.textContent = 'Speaking...';
            speechStatusEl.className = 'status-badge speaking';
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

async function interactWithVideo(spokenText, source = 'voice', gesture = null) {
    console.log('🎯 interactWithVideo called');
    console.log('📝 Speech:', spokenText);
    console.log('🖐️ Gesture:', gesture);
    console.log('📊 Source:', source);
    
    if (!isStreaming) {
        console.log('⚠️ Not streaming, skipping interaction');
        return;
    }
    if (!isConnected) {
        console.log('⚠️ Not connected, skipping interaction');
        return;
    }
    
    try {
        // Update the appropriate timer
        if (source === 'voice' || source === 'audio') {
            lastVoiceInteractionTime = Date.now();
        } else {
            lastAudioEventTime = Date.now();
        }
        generatingIndicator.classList.add('active');
        
        // Use OpenAI to generate optimal prompt (with gesture if available)
        const prompt = await generatePromptWithOpenAI(spokenText, gesture);
        
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
    
    const { volume, volumeChange, loudDuration, quietDuration, pitch, energy } = currentAudioFeatures;
    const now = Date.now();
    
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
    // Sustained quiet (suspense)
    else if (quietDuration > 4) {
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
            
            // Use OpenAI for dramatic events too
            const prompt = await generatePromptWithOpenAI(dramaticPrompt, null);
            
            await odysseyClient.interact({ prompt: prompt });
            interactionCount++;
            interactionCountEl.textContent = interactionCount;
            
            setTimeout(() => {
                generatingIndicator.classList.remove('active');
            }, 1500);
            
        } catch (error) {
            console.error('Dramatic event error:', error);
        }
    }
}

// Generate prompt using OpenAI
async function generatePromptWithOpenAI(spokenText, gesture) {
    try {
        const { volume, pitch, energy, volumeChange, loudDuration, quietDuration } = currentAudioFeatures;
        
        // Build context for OpenAI - prioritize user's words!
        let systemPrompt = `You are a prompt translator for Odyssey video world.

PRIMARY RULE: Execute exactly what the user says. If they say "buildings", show buildings. If they say "red balloon", show red balloon.

Current scene: "${currentSceneState}"

How to interpret input:
- USER'S WORDS = highest priority, execute literally
- Hand gesture = modify environment (weather/lighting) to support their words
- Audio features = adjust intensity ONLY

Output a clear, direct Odyssey prompt. DO NOT add poetic language. Be literal and specific.`;

        let userPrompt = 'Input:\n';
        
        if (spokenText) {
            userPrompt += `- Speech: "${spokenText}"\n`;
        }
        
        if (gesture) {
            userPrompt += `- Hand Gesture: ${gesture}\n`;
            userPrompt += `  (Interpret as environmental change: weather, time of day, vegetation, architecture)\n`;
        }
        
        userPrompt += `- Volume: ${volume}% (${volume > 40 ? 'LOUD' : volume > 20 ? 'normal' : 'quiet'})\n`;
        userPrompt += `- Pitch: ${pitch} (${pitch.includes('high') ? 'bright/energetic' : pitch.includes('low') ? 'dark/serious' : 'balanced'})\n`;
        userPrompt += `- Energy: ${energy}\n`;
        
        if (volumeChange > 40) {
            userPrompt += `- SUDDEN volume spike!\n`;
        }
        
        if (loudDuration > 3) {
            userPrompt += `- Sustained LOUD for ${loudDuration.toFixed(1)}s (building intensity)\n`;
        }
        
        if (quietDuration > 4) {
            userPrompt += `- Sustained quiet for ${quietDuration.toFixed(1)}s (building suspense)\n`;
        }
        
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
        } else if (gesture) {
            return gesture.split(' ')[1] || 'continue'; // Extract action from gesture name
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
        
        // Setup camera
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
            
            // Only process if confidence is high enough (85% sure it's a hand)
            if (confidence < 0.85) {
                continue;
            }
            
            // Draw hand skeleton
            window.drawConnectors(canvasCtx, landmarks, window.HAND_CONNECTIONS, {color: '#00FF00', lineWidth: 3});
            window.drawLandmarks(canvasCtx, landmarks, {color: '#FF0000', lineWidth: 2, radius: 5});
            
            // Recognize gesture only for high confidence detections
            const gesture = recognizeGesture(landmarks);
            
            // === VIRTUAL CURSOR MODE ===
            // Pointing gesture activates cursor mode
            if (gesture === '☝️ Pointing') {
                if (!cursorModeActive) {
                    enterCursorMode();
                }
                // Track index finger tip (landmark 8) for cursor position
                updateCursorPosition(landmarks[8]);
            }
            // Pinch gesture while in cursor mode = click
            else if (gesture === '🤏 Pinch' && cursorModeActive) {
                if (!wasPinching) {
                    triggerVirtualClick();
                }
                isPinching = true;
                // Still track thumb-index midpoint for cursor while pinching
                const midX = (landmarks[4].x + landmarks[8].x) / 2;
                const midY = (landmarks[4].y + landmarks[8].y) / 2;
                updateCursorPosition({ x: midX, y: midY });
            }
            // Any other gesture exits cursor mode
            else if (cursorModeActive && gesture && gesture !== '☝️ Pointing' && gesture !== '🤏 Pinch') {
                exitCursorMode();
            }
            
            // Track pinch state
            if (gesture !== '🤏 Pinch') {
                wasPinching = false;
                isPinching = false;
            } else {
                wasPinching = isPinching;
            }
            
            // === ORIGINAL GESTURE COLLECTION (only when NOT in cursor mode) ===
            if (!cursorModeActive && gesture && gesture !== currentGesture) {
                console.log('🖐️ Gesture detected:', gesture);
                currentGesture = gesture;
                
                // If we're collecting gestures (during/after speech), add to collection
                if (collectingGestures) {
                    gesturesInWindow.push(gesture);
                    console.log('📝 Gesture added to collection');
                }
            }
            
            if (!cursorModeActive) {
                currentGesture = gesture;
            }
        }
    } else {
        // No hands detected
        if (cursorModeActive) {
            exitCursorMode();
        }
        currentGesture = null;
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

// ==================== VIRTUAL CURSOR MODE ====================

function enterCursorMode() {
    cursorModeActive = true;
    if (virtualCursorEl) {
        virtualCursorEl.classList.add('active');
    }
    gestureIndicator.textContent = '☝️ Cursor Mode';
    gestureIndicator.classList.add('active', 'cursor-mode');
    console.log('🎯 Cursor mode ACTIVATED');
}

function exitCursorMode() {
    cursorModeActive = false;
    isPinching = false;
    wasPinching = false;
    if (virtualCursorEl) {
        virtualCursorEl.classList.remove('active', 'hovering', 'clicking');
    }
    gestureIndicator.classList.remove('active', 'cursor-mode');
    
    // Remove hover effect from last element
    if (lastHoveredElement) {
        lastHoveredElement = null;
    }
    console.log('🎯 Cursor mode DEACTIVATED');
}

function updateCursorPosition(fingerTip) {
    // MediaPipe gives normalized coords (0-1), camera is mirrored so flip X
    const rawX = 1 - fingerTip.x; // Flip X for mirror
    const rawY = fingerTip.y;
    
    // Map to viewport coordinates
    cursorX = rawX * window.innerWidth;
    cursorY = rawY * window.innerHeight;
    
    // Smooth the cursor movement (lerp)
    smoothCursorX += (cursorX - smoothCursorX) * CURSOR_SMOOTHING;
    smoothCursorY += (cursorY - smoothCursorY) * CURSOR_SMOOTHING;
    
    // Move the virtual cursor element
    if (virtualCursorEl) {
        virtualCursorEl.style.left = smoothCursorX + 'px';
        virtualCursorEl.style.top = smoothCursorY + 'px';
    }
    
    // Check what element is under the cursor
    updateHoverState(smoothCursorX, smoothCursorY);
}

function updateHoverState(x, y) {
    // Temporarily hide cursor to get the element underneath
    if (virtualCursorEl) virtualCursorEl.style.display = 'none';
    const elementUnder = document.elementFromPoint(x, y);
    if (virtualCursorEl) virtualCursorEl.style.display = '';
    
    if (!elementUnder) {
        if (virtualCursorEl) virtualCursorEl.classList.remove('hovering');
        lastHoveredElement = null;
        return;
    }
    
    // Check if hovering over an interactive element
    const isInteractive = elementUnder.matches(
        'button, a, input, textarea, select, [role="button"], .btn, .icon-btn, .checkbox-label, label'
    ) || elementUnder.closest(
        'button, a, input, textarea, select, [role="button"], .btn, .icon-btn, .checkbox-label, label'
    );
    
    if (isInteractive) {
        if (virtualCursorEl) virtualCursorEl.classList.add('hovering');
    } else {
        if (virtualCursorEl) virtualCursorEl.classList.remove('hovering');
    }
    
    lastHoveredElement = elementUnder;
}

function triggerVirtualClick() {
    if (pinchCooldown) return;
    
    // Set cooldown to prevent rapid fire clicks
    pinchCooldown = true;
    setTimeout(() => { pinchCooldown = false; }, 600);
    
    // Visual feedback
    if (virtualCursorEl) {
        virtualCursorEl.classList.add('clicking');
        setTimeout(() => {
            virtualCursorEl.classList.remove('clicking');
        }, 400);
    }
    
    // Find the element under the cursor
    if (virtualCursorEl) virtualCursorEl.style.display = 'none';
    const targetElement = document.elementFromPoint(smoothCursorX, smoothCursorY);
    if (virtualCursorEl) virtualCursorEl.style.display = '';
    
    if (!targetElement) {
        console.log('🎯 Click at empty area');
        return;
    }
    
    console.log('🎯 Virtual CLICK on:', targetElement.tagName, targetElement.id || targetElement.className);
    
    // Find the closest interactive parent if needed
    const clickTarget = targetElement.closest(
        'button, a, input, textarea, select, [role="button"], .btn, .icon-btn, .checkbox-label, label'
    ) || targetElement;
    
    // Dispatch mouse events to simulate a real click
    const eventOptions = {
        bubbles: true,
        cancelable: true,
        clientX: smoothCursorX,
        clientY: smoothCursorY,
        view: window
    };
    
    clickTarget.dispatchEvent(new MouseEvent('mouseenter', eventOptions));
    clickTarget.dispatchEvent(new MouseEvent('mouseover', eventOptions));
    clickTarget.dispatchEvent(new MouseEvent('mousedown', eventOptions));
    clickTarget.dispatchEvent(new MouseEvent('mouseup', eventOptions));
    clickTarget.dispatchEvent(new MouseEvent('click', eventOptions));
    
    // For checkboxes and inputs, also handle focus
    if (clickTarget.tagName === 'INPUT' || clickTarget.tagName === 'TEXTAREA') {
        clickTarget.focus();
    }
    
    // For checkboxes wrapped in labels
    if (clickTarget.tagName === 'LABEL' || clickTarget.classList.contains('checkbox-label')) {
        const checkbox = clickTarget.querySelector('input[type="checkbox"]');
        if (checkbox) {
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }
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
console.log('📝 Enter your Odyssey API Key and click START');
console.log('🎵 Voice Controls:');
console.log('   🎬 Say "CUT" to freeze');
console.log('   🎬 Say "ACTION" to continue');
console.log('   💥 Sudden loud = shock effect');
console.log('   😱 Sustained loud = increasing horror');
console.log('   🤫 Sudden quiet = eerie silence');
console.log('   🖐️ Use hand gestures for actions');
