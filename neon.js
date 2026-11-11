
/* =====================================================
   NEON BALL GAME — CORRECTED COMPLETE JAVASCRIPT
   ===================================================== */

/* ==================== SOUND SYSTEM ==================== */

let soundEnabled = true;
let audioContext = null;
let musicInterval = null;
let musicNoteIndex = 0;
let lastWallSound = 0;

const soundBtn = document.getElementById("soundBtn");

const musicNotes = [
    261.63, 329.63, 392, 523.25,
    392, 329.63, 293.66, 349.23
];

function initAudio() {
    if (!audioContext) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) audioContext = new AudioCtx();
    }

    if (audioContext?.state === "suspended") {
        audioContext.resume().catch(() => {});
    }
}

function playTone(frequency, duration = 0.08, volume = 0.06, channel = "sfx") {
    if (!soundEnabled) return;

    initAudio();
    if (!audioContext) return;

    try {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();

        const masterLevel = (gameSettings.masterVolume ?? 75) / 100;

        const channelLevel = channel === "music"
            ? (gameSettings.musicVolume ?? 75) / 100
            : (gameSettings.sfxVolume ?? 75) / 100;

        const finalVolume = volume * masterLevel * channelLevel;

        oscillator.type = "sine";
        oscillator.frequency.value = frequency;

        gain.gain.setValueAtTime(
            Math.max(finalVolume, 0.0001),
            audioContext.currentTime
        );

        gain.gain.exponentialRampToValueAtTime(
            0.0001,
            audioContext.currentTime + duration
        );

        oscillator.connect(gain);
        gain.connect(audioContext.destination);

        oscillator.start();
        oscillator.stop(audioContext.currentTime + duration);

    } catch (error) {
        console.warn("Audio playback failed.", error);
    }
}

function playBackgroundMusic() {
    if (!soundEnabled || musicInterval || !gameRunning || gamePaused) return;

    initAudio();
    if (!audioContext) return;

    musicInterval = setInterval(() => {
        if (!gameRunning || gamePaused || !soundEnabled) return;

        playTone(musicNotes[musicNoteIndex], 0.16, 0.018, "music");
        musicNoteIndex = (musicNoteIndex + 1) % musicNotes.length;
    }, 220);
}

function stopBackgroundMusic() {
    if (musicInterval !== null) {
        clearInterval(musicInterval);
        musicInterval = null;
    }
}

function playPaddleSound() {
    playTone(420, 0.08);
}

function playWallSound() {
    const now = performance.now();
    if (now - lastWallSound < 70) return;
    lastWallSound = now;
    playTone(260, 0.045, 0.025);
}

function playMultiplySound() {
    playTone(520, 0.10);
    setTimeout(() => playTone(780, 0.12), 80);
    setTimeout(() => playTone(1040, 0.14), 160);
}

function playGameOverSound() {
    playTone(400, 0.15);
    setTimeout(() => playTone(300, 0.20), 160);
    setTimeout(() => playTone(200, 0.30), 350);
}

/* ==================== HTML ELEMENTS ==================== */

const gameArea = document.getElementById("gameArea");
const startScreen = document.getElementById("startScreen");
const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");

const scoreDisplay = document.getElementById("score");
const timerDisplay = document.getElementById("timer");
const ballCountDisplay = document.getElementById("ballCount");

const screenTitle = document.getElementById("screenTitle");
const screenMessage = document.getElementById("screenMessage");

const finalScoreDisplay = document.getElementById("finalScore");
const recordBadge = document.getElementById("recordBadge");

const HIGH_SCORE_KEY = "neonBallGameHighScore";

/* Check required HTML elements before starting */
if (
    !gameArea || !startScreen || !startBtn || !pauseBtn ||
    !scoreDisplay || !timerDisplay || !ballCountDisplay ||
    !screenTitle || !screenMessage
) {
    console.error(
        "Neon Game: HTML element missing. Check IDs, especially screenTitle."
    );
}

/* ==================== GAME VARIABLES ==================== */

let score = 0;
let timeLeft = 30;
let balls = [];
let powerUps = [];

let gameRunning = false;
let gamePaused = false;

let timerInterval = null;
let animationId = null;
let scoreAnimationId = null;
let startTransitionTimeout = null;

let selectedMode = "classic";
let gameDuration = 30;
let MAX_BALLS = 16;

let paddleX = 0;
let lastFrame = 0;
let lastMultiply = 0;

const BALL_RADIUS = 9;
const colors = ["cyan", "pink", "green", "yellow", "orange", "purple"];

const paddle = document.createElement("div");
paddle.className = "paddle";

if (gameArea) gameArea.appendChild(paddle);

/* ==================== GAME MODES ==================== */

const modeButtons = document.querySelectorAll(".mode-btn");

modeButtons.forEach(button => {
    button.addEventListener("click", () => {
        if (gameRunning) return;

        modeButtons.forEach(btn => btn.classList.remove("active"));
        button.classList.add("active");

        selectedMode = button.dataset.mode;

        if (selectedMode === "classic") {
            gameDuration = 30;
            MAX_BALLS = 16;
            timeLeft = 30;
        } else if (selectedMode === "challenge") {
            gameDuration = 60;
            MAX_BALLS = 40;
            timeLeft = 60;
        } else if (selectedMode === "unlimited") {
            gameDuration = Infinity;
            MAX_BALLS = 70;
            timeLeft = Infinity;
        }

        updateDisplay();
    });
});

/* ==================== POWER-UP VARIABLES ==================== */

let shieldActive = false;
let slowMotionActive = false;
let megaPaddleActive = false;

let shieldEndTime = 0;
let slowMotionEndTime = 0;
let megaPaddleEndTime = 0;

let activePowerUpName = "";
let activePowerUpEndTime = 0;
let activePowerUpDuration = 0;

let lastPowerUpSpawn = 0;

const POWER_UP_TYPES = [
    { type: "shield", icon: "🛡️", color: "#00ffff", label: "SHIELD" },
    { type: "slow", icon: "⏳", color: "#d580ff", label: "SLOW MOTION" },
    { type: "mega", icon: "↔️", color: "#ffdc71", label: "MEGA PADDLE" },
    { type: "score", icon: "⚡", color: "#8cffb0", label: "SCORE BOOST" }
];

/* ==================== DISPLAY ==================== */


function updateDisplay() {
    scoreDisplay.textContent = score;

    timerDisplay.textContent =
        selectedMode === "unlimited" ? "∞" : timeLeft;

    ballCountDisplay.textContent = balls.length;

    if (typeof checkScoreAchievement === "function") {
        checkScoreAchievement(score);
    }

    if (typeof checkBallAchievement === "function") {
        checkBallAchievement(balls.length);
    }
}


/* ==================== BALL CREATION ==================== */

function createBall(x, y, vx, vy) {
    if (balls.length >= MAX_BALLS) return null;

    const element = document.createElement("div");
    const color = colors[Math.floor(Math.random() * colors.length)];

    element.className = "ball " + color;
    gameArea.appendChild(element);

    const ball = {
        element,
        x: x ?? gameArea.clientWidth / 2,
        y: y ?? gameArea.clientHeight / 2,
        vx: vx ?? (Math.random() < 0.5 ? -3 : 3),
        vy: vy ?? -3,
        color,
        lastPaddleHit: 0
    };

    balls.push(ball);
    return ball;
}

/* ==================== PADDLE CONTROL ==================== */

function movePaddle(clientX) {
    if (!gameArea) return;

    const rect = gameArea.getBoundingClientRect();
    const halfWidth = (megaPaddleActive ? 160 : 110) / 2;

    paddleX = Math.max(
        halfWidth,
        Math.min(gameArea.clientWidth - halfWidth, clientX - rect.left)
    );

    paddle.style.left = paddleX + "px";
}

gameArea.addEventListener("pointermove", event => {
    movePaddle(event.clientX);
});

gameArea.addEventListener("pointerdown", event => {
    movePaddle(event.clientX);
});

/* ==================== MULTIPLY BALLS ==================== */

function multiplyBalls(hitBall) {
    const now = performance.now();

    if (now - lastMultiply < 450 || balls.length >= MAX_BALLS) return;

    lastMultiply = now;
    playMultiplySound();
    showMultiplyCombo();

    const oldBalls = [...balls];
    score += oldBalls.length;

    const additions = Math.min(oldBalls.length, MAX_BALLS - oldBalls.length);
    const rect = gameArea.getBoundingClientRect();

    showMultiplyEffect(
        rect.left + hitBall.x,
        rect.top + hitBall.y,
        oldBalls.length + additions
    );

    showNeonShockwave(rect.left + hitBall.x, rect.top + hitBall.y);
    showParticleExplosion(rect.left + hitBall.x, rect.top + hitBall.y);

    oldBalls.forEach(ball => {
        ball.vy = -Math.abs(ball.vy);
        ball.lastPaddleHit = now;
    });

    for (let i = 0; i < additions; i++) {
        const parent = oldBalls[i % oldBalls.length];

        createBall(
            parent.x,
            parent.y - 12,
            (Math.random() - 0.5) * 7,
            -Math.max(2.5, Math.abs(parent.vy))
        );
    }

    updateDisplay();
}

/* ==================== MAIN GAME LOOP ==================== */

function gameLoop(timestamp) {
    if (!gameRunning || gamePaused) return;

    updatePowerUpHUD();

    const now = performance.now();

    if (slowMotionActive && now >= slowMotionEndTime) {
        slowMotionActive = false;
    }

    if (megaPaddleActive && now >= megaPaddleEndTime) {
        megaPaddleActive = false;
        paddle.style.width = "110px";
    }

    if (shieldActive && now >= shieldEndTime) {
        shieldActive = false;
        shieldEndTime = 0;
    }

    const delta = Math.min(
        (timestamp - (lastFrame || timestamp)) / 16.67,
        2
    );

    lastFrame = timestamp;

    const width = gameArea.clientWidth;
    const height = gameArea.clientHeight;
    const paddleY = height - 25;
    const paddleWidth = megaPaddleActive ? 160 : 110;

    if (timestamp - lastPowerUpSpawn > 7000) {
        spawnPowerUp();
        lastPowerUpSpawn = timestamp;
    }

    updatepowerUps(delta);

    /* Iterate over a copy because balls can be removed during this loop */
    for (const ball of [...balls]) {
        if (!balls.includes(ball)) continue;

  const difficultyMultiplier = getDifficultyMultiplier();

  const ballDelta =
    (slowMotionActive ? delta * 0.55 : delta) *
    difficultyMultiplier;

        ball.x += ball.vx * ballDelta;
        ball.y += ball.vy * ballDelta;

        if (Math.random() < 0.65) {
            const rainbowColors = [
                "#00ffff", "#ff00ff", "#a855f7",
                "#00ff88", "#ffff00", "#ff8800"
            ];

            const trailColor =
                rainbowColors[Math.floor(Math.random() * rainbowColors.length)];

            showNeonTrail(ball.x, ball.y, trailColor);
        }

        /* Left wall */
        if (ball.x < BALL_RADIUS) {
            ball.x = BALL_RADIUS;
            ball.vx = Math.abs(ball.vx);
            playWallSound();
            showNeonImpact(ball.x, ball.y);
            showRainbowFlash();
            showNeonShake();
            showParticleExplosion(ball.x, ball.y);
        }

        /* Right wall */
        if (ball.x > width - BALL_RADIUS) {
            ball.x = width - BALL_RADIUS;
            ball.vx = -Math.abs(ball.vx);
            playWallSound();
            showNeonImpact(ball.x, ball.y);
            showRainbowFlash();
            showNeonShake();
            showParticleExplosion(ball.x, ball.y);
        }

        /* Top wall */
        if (ball.y < BALL_RADIUS) {
            ball.y = BALL_RADIUS;
            ball.vy = Math.abs(ball.vy);
            playWallSound();
            showNeonImpact(ball.x, ball.y);
            showRainbowFlash();
            showNeonShake();
            showParticleExplosion(ball.x, ball.y);
        }

        /* Paddle collision */
        const touchingPaddle =
            ball.vy > 0 &&
            ball.y + BALL_RADIUS >= paddleY &&
            ball.y - BALL_RADIUS <= paddleY + 13 &&
            ball.x >= paddleX - paddleWidth / 2 - BALL_RADIUS &&
            ball.x <= paddleX + paddleWidth / 2 + BALL_RADIUS;

        if (touchingPaddle && timestamp - ball.lastPaddleHit > 200) {
            ball.y = paddleY - BALL_RADIUS;
            ball.vy = -Math.max(3, Math.abs(ball.vy));
            ball.vx += (ball.x - paddleX) * 0.045;
            ball.vx = Math.max(-6, Math.min(6, ball.vx));
            ball.lastPaddleHit = timestamp;

            playPaddleSound();
            gameVibrate(50);
            showNeonImpact(ball.x, ball.y);
            showRainbowFlash();
            showNeonShake();
            showParticleExplosion(ball.x, ball.y);
            multiplyBalls(ball);
        }

        /* Ball missed */
        if (ball.y > height + BALL_RADIUS) {
            if (shieldActive) {
                shieldActive = false;
                shieldEndTime = 0;
                activePowerUpName = "";
                activePowerUpEndTime = 0;
                activePowerUpDuration = 0;
                updatePowerUpHUD();
                ball.y = height - BALL_RADIUS - 5;
                ball.vy = -Math.abs(ball.vy);
            } else {
                ball.element.remove();
                balls = balls.filter(item => item !== ball);
                continue;
            }
        }

        ball.element.style.left = ball.x + "px";
        ball.element.style.top = ball.y + "px";
    }

    if (!gameRunning) return;

    if (balls.length === 0) {
        endGame("Game Over!", "Saari balls miss ho gayi!");
        return;
    }

    updateDisplay();
    animationId = requestAnimationFrame(gameLoop);
}

/* ==================== START GAME ==================== */

function startGame() {
    if (gameRunning) return;

    initAudio();
    stopBackgroundMusic();

    clearInterval(timerInterval);
    timerInterval = null;

    if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    if (scoreAnimationId !== null) {
        cancelAnimationFrame(scoreAnimationId);
        scoreAnimationId = null;
    }

    balls.forEach(ball => ball.element.remove());
    balls = [];

    powerUps.forEach(power => power.element.remove());
    powerUps = [];

    shieldActive = false;
    slowMotionActive = false;
    megaPaddleActive = false;

    shieldEndTime = 0;
    slowMotionEndTime = 0;
    megaPaddleEndTime = 0;

    activePowerUpName = "";
    activePowerUpEndTime = 0;
    activePowerUpDuration = 0;

    const hud = document.getElementById("powerUpHUD");
    if (hud) hud.style.display = "none";

    const powerUpTimer = document.getElementById("powerUpTimer");
    const powerUpProgress = document.getElementById("powerUpProgress");
    const powerUpName = document.getElementById("powerUpName");

    if (powerUpTimer) powerUpTimer.textContent = "0.0s";
    if (powerUpProgress) powerUpProgress.style.width = "0%";
    if (powerUpName) powerUpName.textContent = "";

    paddle.style.width = "110px";
    paddle.style.display = "block";

    score = 0;
    timeLeft = selectedMode === "unlimited" ? Infinity : gameDuration;

    gameRunning = true;
    gamePaused = false;
    lastFrame = 0;
    lastMultiply = 0;
    lastPowerUpSpawn = performance.now();

    pauseBtn.disabled = false;
    pauseBtn.textContent = "⏸️ PAUSE";

    paddleX = gameArea.clientWidth / 2;
    paddle.style.left = paddleX + "px";

    startScreen.classList.remove("screen-exit");
    startScreen.style.display = "none";

    createBall(
        gameArea.clientWidth / 2,
        gameArea.clientHeight / 2,
        3,
        -3
    );

    updateDisplay();
    animationId = requestAnimationFrame(gameLoop);

    if (selectedMode !== "unlimited") {
        timerInterval = setInterval(() => {
            if (!gameRunning || gamePaused) return;

            timeLeft = Math.max(0, timeLeft - 1);
            updateDisplay();

            if (timeLeft <= 0) {
                endGame("Time Up!", "");
            }
        }, 1000);
    } else {
        timerDisplay.textContent = "∞";
    }

    playBackgroundMusic();
}

/* ==================== FINAL SCORE ANIMATION ==================== */

function animateFinalScore(targetScore) {
    if (!finalScoreDisplay) return;

    if (scoreAnimationId !== null) {
        cancelAnimationFrame(scoreAnimationId);
        scoreAnimationId = null;
    }

    finalScoreDisplay.style.display = "block";
    finalScoreDisplay.classList.remove("score-visible");
    finalScoreDisplay.textContent = "0";

    void finalScoreDisplay.offsetWidth;
    finalScoreDisplay.classList.add("score-visible");

    const startTime = performance.now();
    const duration = 1000;

    function animate(timestamp) {
        const progress = Math.min((timestamp - startTime) / duration, 1);
        const easedProgress = 1 - Math.pow(1 - progress, 3);

        finalScoreDisplay.textContent = Math.floor(
            targetScore * easedProgress
        ).toLocaleString();

        if (progress < 1) {
            scoreAnimationId = requestAnimationFrame(animate);
        } else {
            finalScoreDisplay.textContent = targetScore.toLocaleString();
            scoreAnimationId = null;
        }
    }

    scoreAnimationId = requestAnimationFrame(animate);
}

/* ==================== END GAME ==================== */

function endGame(title, message) {
    if (!gameRunning) return;

    /* Stop the game FIRST so no loop or timer can continue */
    gameRunning = false;
    gamePaused = false;

    clearInterval(timerInterval);
    timerInterval = null;

    if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    stopBackgroundMusic();
    playGameOverSound();

    pauseBtn.disabled = true;
    pauseBtn.textContent = "⏸️ PAUSE";

    if (scoreAnimationId !== null) {
        cancelAnimationFrame(scoreAnimationId);
        scoreAnimationId = null;
    }

    powerUps.forEach(power => power.element.remove());
    powerUps = [];

    shieldActive = false;
    slowMotionActive = false;
    megaPaddleActive = false;

    shieldEndTime = 0;
    slowMotionEndTime = 0;
    megaPaddleEndTime = 0;

    paddle.style.width = "110px";
    paddle.style.display = "none";

    const hud = document.getElementById("powerUpHUD");
    if (hud) hud.style.display = "none";

    activePowerUpName = "";
    activePowerUpEndTime = 0;
    activePowerUpDuration = 0;

    let previousHighScore = 0;

    try {
        previousHighScore =
            Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0;
    } catch (error) {
        console.warn("Could not read high score.", error);
    }

    const isNewRecord = score > previousHighScore;

    if (isNewRecord) {
        checkNewRecordAchievement();
    }

    if (isNewRecord) {
        try {
            localStorage.setItem(HIGH_SCORE_KEY, String(score));
        } catch (error) {
            console.warn("Could not save high score.", error);
        }
    }

    /* Show Game Over screen */
    startScreen.classList.remove("screen-exit");
    startScreen.style.display = "flex";

    screenTitle.textContent = title;
    screenMessage.textContent = message;

    animateFinalScore(score);

    if (recordBadge) {
        recordBadge.classList.remove("record-visible");
        recordBadge.style.display = isNewRecord ? "block" : "none";

        if (isNewRecord) {
            void recordBadge.offsetWidth;
            recordBadge.classList.add("record-visible");
        }
    }

    startBtn.textContent = "PLAY AGAIN";
    updateDisplay();
}

/* ==================== PAUSE / RESUME ==================== */

function togglePause() {
    if (!gameRunning) return;

    gamePaused = !gamePaused;

    if (gamePaused) {
        if (animationId !== null) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }

        clearInterval(timerInterval);
        timerInterval = null;
        stopBackgroundMusic();

        pauseBtn.textContent = "▶️ RESUME";
    } else {
        lastFrame = 0;
        pauseBtn.textContent = "⏸️ PAUSE";

        animationId = requestAnimationFrame(gameLoop);

        if (selectedMode !== "unlimited") {
            timerInterval = setInterval(() => {
                if (!gameRunning || gamePaused) return;

                timeLeft = Math.max(0, timeLeft - 1);
                updateDisplay();

                if (timeLeft <= 0) {
                    endGame("Time Up!", "");
                }
            }, 1000);
        } else {
            timerDisplay.textContent = "∞";
        }

        playBackgroundMusic();
    }
}

pauseBtn.addEventListener("click", togglePause);

startBtn.addEventListener("click", () => {
    if (gameRunning || startBtn.disabled) return;

    startBtn.disabled = true;
    startScreen.classList.add("screen-exit");

    if (startTransitionTimeout !== null) {
        clearTimeout(startTransitionTimeout);
    }

    startTransitionTimeout = setTimeout(() => {
        startTransitionTimeout = null;
        startScreen.classList.remove("screen-exit");

        if (finalScoreDisplay) {
            finalScoreDisplay.classList.remove("score-visible");
            finalScoreDisplay.style.display = "none";
        }

        if (recordBadge) {
            recordBadge.classList.remove("record-visible");
            recordBadge.style.display = "none";
        }

        startBtn.disabled = false;
        startGame();
    }, 300);
});

/* ==================== MULTIPLY EFFECTS ==================== */

function showMultiplyEffect(x, y, count) {
    const effect = document.createElement("div");
    effect.className = "multiply-effect";
    effect.textContent = `×${count}`;
    effect.style.left = `${x}px`;
    effect.style.top = `${y}px`;
    document.body.appendChild(effect);
    setTimeout(() => effect.remove(), 900);
}

function showNeonShockwave(x, y) {
    const wave = document.createElement("div");
    wave.className = "neon-shockwave";
    wave.style.left = `${x}px`;
    wave.style.top = `${y}px`;
    document.body.appendChild(wave);
    setTimeout(() => wave.remove(), 700);
}

function showParticleExplosion(x, y) {
    if (gameSettings && (!gameSettings.particles || gameSettings.graphicsQuality === "low")) return;

    const particleColors = [
        "#00ffff", "#ff00ff", "#00ff88",
        "#ffff00", "#ff8800", "#aa66ff"
    ];

    const particleCount = gameSettings?.graphicsQuality === "medium" ? 10 : 18;

    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement("div");
        particle.className = "neon-particle";

        const angle = (Math.PI * 2 * i) / particleCount;
        const distance = 35 + Math.random() * 55;

        particle.style.left = `${x}px`;
        particle.style.top = `${y}px`;

        const color = particleColors[
            Math.floor(Math.random() * particleColors.length)
        ];

        particle.style.color = color;
        particle.style.backgroundColor = color;

        particle.style.setProperty("--move-x", `${Math.cos(angle) * distance}px`);
        particle.style.setProperty("--move-y", `${Math.sin(angle) * distance}px`);

        document.body.appendChild(particle);
        setTimeout(() => particle.remove(), 750);
    }
}

function showMultiplyCombo() {
    const combo = document.createElement("div");
    combo.className = "multiply-combo";
    combo.textContent = "⚡ MULTIPLY COMBO! ⚡";
    document.body.appendChild(combo);
    setTimeout(() => combo.remove(), 1150);
}

function showNeonTrail(x, y, color) {
    if (gameSettings && (!gameSettings.trail || gameSettings.graphicsQuality === "low")) return;

    const trail = document.createElement("div");
    trail.className = "neon-trail";
    trail.style.left = `${x}px`;
    trail.style.top = `${y}px`;
    trail.style.color = color;
    trail.style.background = color;
    gameArea.appendChild(trail);
    setTimeout(() => trail.remove(), 350);
}

function showNeonImpact(x, y) {
    if (gameSettings && !gameSettings.neon) return;

    const impact = document.createElement("div");
    impact.className = "neon-impact";
    impact.style.left = `${x}px`;
    impact.style.top = `${y}px`;
    gameArea.appendChild(impact);
    setTimeout(() => impact.remove(), 400);
}

function showNeonShake() {
    if (!gameSettings?.shake || !gameSettings?.neon) return;

    gameArea.classList.remove("neon-shake");
    void gameArea.offsetWidth;
    gameArea.classList.add("neon-shake");
    setTimeout(() => gameArea.classList.remove("neon-shake"), 200);
}

function showRainbowFlash() {
    if (gameSettings && !gameSettings.neon) return;

    gameArea.classList.remove("neon-rainbow-flash");
    void gameArea.offsetWidth;
    gameArea.classList.add("neon-rainbow-flash");
}

/* ==================== POWER-UP SPAWNER ==================== */

function spawnPowerUp() {
    if (!gameRunning || gamePaused || powerUps.length >= 3) return;

    const typeData = POWER_UP_TYPES[
        Math.floor(Math.random() * POWER_UP_TYPES.length)
    ];

    const element = document.createElement("div");
    element.className = "power-up";
    element.textContent = typeData.icon;
    element.style.setProperty("--power-color", typeData.color);

    const maxX = Math.max(10, gameArea.clientWidth - 48);
    const x = 10 + Math.random() * (maxX - 10);

    element.style.left = x + "px";
    element.style.top = "-45px";
    gameArea.appendChild(element);

    powerUps.push({
        element,
        type: typeData.type,
        x,
        y: -45,
        speed: 1.5 + Math.random(),
        color: typeData.color,
        label: typeData.label
    });
}

function updatepowerUps(delta) {
    for (let i = powerUps.length - 1; i >= 0; i--) {
        const power = powerUps[i];

        power.y += power.speed * delta;
        power.element.style.top = power.y + "px";

        const paddleY = gameArea.clientHeight - 25;
        const paddleWidth = megaPaddleActive ? 160 : 110;

        const touchingPaddle =
            power.y + 30 >= paddleY &&
            power.y <= paddleY + 20 &&
            power.x + 24 >= paddleX - paddleWidth / 2 &&
            power.x <= paddleX + paddleWidth / 2;

        if (touchingPaddle) {
            activatePowerUp(power.type);
            power.element.remove();
            powerUps.splice(i, 1);
            continue;
        }

        if (power.y > gameArea.clientHeight + 45) {
            power.element.remove();
            powerUps.splice(i, 1);
        }
    }
}

/* ==================== ACTIVATE POWER-UP ==================== */

function activatePowerUp(type) {
    const now = performance.now();

    if (type === "shield") {
        shieldActive = true;
        shieldEndTime = now + 5000;
        activePowerUpName = "🛡️ SHIELD";
        activePowerUpDuration = 5000;
    } else if (type === "slow") {
        slowMotionActive = true;
        slowMotionEndTime = now + 5000;
        activePowerUpName = "⏳ SLOW MOTION";
        activePowerUpDuration = 5000;
    } else if (type === "mega") {
        megaPaddleActive = true;
        megaPaddleEndTime = now + 7000;
        paddle.style.width = "160px";
        activePowerUpName = "↔️ MEGA PADDLE";
        activePowerUpDuration = 7000;
    } else if (type === "score") {
        score += 100;
        activePowerUpName = "⚡ +100 BONUS";
        activePowerUpDuration = 2000;
        updateDisplay();
    }

    activePowerUpEndTime = now + activePowerUpDuration;
    updatePowerUpHUD();
}

/* ==================== POWER-UP HUD ==================== */

function updatePowerUpHUD() {
    const hud = document.getElementById("powerUpHUD");
    const name = document.getElementById("powerUpName");
    const timer = document.getElementById("powerUpTimer");
    const progress = document.getElementById("powerUpProgress");

    if (!hud || !name || !timer || !progress) return;

    const remaining = activePowerUpEndTime - performance.now();

    if (
        !activePowerUpName ||
        activePowerUpEndTime <= 0 ||
        activePowerUpDuration <= 0 ||
        remaining <= 0
    ) {
        hud.style.display = "none";
        timer.textContent = "0.0s";
        progress.style.width = "0%";

        activePowerUpName = "";
        activePowerUpEndTime = 0;
        activePowerUpDuration = 0;
        return;
    }

    hud.style.display = "block";
    name.textContent = activePowerUpName;
    timer.textContent = (remaining / 1000).toFixed(1) + "s";

    const percent = Math.max(
        0,
        Math.min(100, (remaining / activePowerUpDuration) * 100)
    );

    progress.style.width = percent + "%";
}

/* ==================== INITIAL DISPLAY ==================== */

updateDisplay();



/* ========== NEON ACHIEVEMENT SYSTEM ========== */

const ACHIEVEMENT_STORAGE_KEY = "neonBallAchievements";

const NEON_ACHIEVEMENTS = {
    first100: {
        icon: "🏆",
        title: "Century Club!",
        description: "You scored 100 points!"
    },

    balls5: {
        icon: "🟢",
        title: "Ball Starter",
        description: "You reached 5 balls!"
    },

    balls10: {
        icon: "🔵",
        title: "Ball Collector",
        description: "You reached 10 balls!"
    },

    balls25: {
        icon: "💜",
        title: "Ball Master",
        description: "You reached 25 balls!"
    },

    balls40: {
        icon: "⚡",
        title: "Ball Storm!",
        description: "You reached 40 balls!"
    },

    balls70: {
        icon: "👑",
        title: "NEON LEGEND",
        description: "You reached 70 balls!"
    },

    newRecord: {
        icon: "🥇",
        title: "NEW HIGH SCORE!",
        description: "You beat your previous best!"
    }
};

let unlockedAchievements = {};

try {
    unlockedAchievements = JSON.parse(
        localStorage.getItem(ACHIEVEMENT_STORAGE_KEY) || "{}"
    );

    if (
        !unlockedAchievements ||
        typeof unlockedAchievements !== "object" ||
        Array.isArray(unlockedAchievements)
    ) {
        unlockedAchievements = {};
    }
} catch (error) {
    unlockedAchievements = {};
}

let achievementToastTimer = null;

function showAchievementToast(achievement) {
    let toast = document.getElementById("achievementToast");

    if (!toast) {
        toast = document.createElement("div");
        toast.id = "achievementToast";
        toast.className = "achievement-toast";

        toast.innerHTML = `
            <div class="achievement-icon"></div>
            <div class="achievement-text">
                <div class="achievement-label">
                    ACHIEVEMENT UNLOCKED
                </div>
                <div class="achievement-title"></div>
                <div class="achievement-description"></div>
            </div>
        `;

        document.body.appendChild(toast);
    }

    toast.querySelector(".achievement-icon").textContent =
        achievement.icon;

    toast.querySelector(".achievement-title").textContent =
        achievement.title;

    toast.querySelector(".achievement-description").textContent =
        achievement.description;

    toast.classList.remove("show");

    void toast.offsetWidth;

    toast.classList.add("show");

    clearTimeout(achievementToastTimer);

    achievementToastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 3500);
}

function unlockAchievement(id) {
    if (unlockedAchievements[id]) {
        return;
    }

    const achievement = NEON_ACHIEVEMENTS[id];

    if (!achievement) {
        return;
    }

    unlockedAchievements[id] = true;

    try {
        localStorage.setItem(
            ACHIEVEMENT_STORAGE_KEY,
            JSON.stringify(unlockedAchievements)
        );
    } catch (error) {
        console.warn("Achievement could not be saved.", error);
    }

    showAchievementToast(achievement);
}

function checkScoreAchievement(currentScore) {
    if (currentScore >= 100) {
        unlockAchievement("first100");
    }
}

function checkBallAchievement(currentBallCount) {
    if (currentBallCount >= 5) {
        unlockAchievement("balls5");
    }

    if (currentBallCount >= 10) {
        unlockAchievement("balls10");
    }

    if (currentBallCount >= 25) {
        unlockAchievement("balls25");
    }

    if (currentBallCount >= 40) {
        unlockAchievement("balls40");
    }

    if (currentBallCount >= 70) {
        unlockAchievement("balls70");
    }
}

function checkNewRecordAchievement() {
    unlockAchievement("newRecord");
}


/* ===== ACHIEVEMENTS COLLECTION PANEL ===== */

const achievementsButton = document.getElementById("achievementsBtn");
const achievementsPanel = document.getElementById("achievementsPanel");
const closeAchievementsButton = document.getElementById("closeAchievementsBtn");
const achievementsList = document.getElementById("achievementsList");
const achievementProgress = document.getElementById("achievementProgress");


function renderAchievementsPanel() {
    if (!achievementsList || !achievementProgress) {
        return;
    }

    let savedAchievements = {};

    try {
        savedAchievements = JSON.parse(
            localStorage.getItem(ACHIEVEMENT_STORAGE_KEY) || "{}"
        );

        if (
            !savedAchievements ||
            typeof savedAchievements !== "object" ||
            Array.isArray(savedAchievements)
        ) {
            savedAchievements = {};
        }
    } catch (error) {
        savedAchievements = {};
    }

    achievementsList.replaceChildren();

    const achievementEntries = Object.entries(NEON_ACHIEVEMENTS);

    const unlockedCount = achievementEntries.filter(([id]) =>
        savedAchievements[id] === true
    ).length;

    achievementProgress.textContent =
        `${unlockedCount} / ${achievementEntries.length} Achievements Unlocked`;

    achievementEntries.forEach(([id, achievement]) => {
        const isUnlocked = savedAchievements[id] === true;

        const card = document.createElement("div");
        card.className =
            `achievement-card ${isUnlocked ? "unlocked" : "locked"}`;

        const icon = document.createElement("div");
        icon.className = "achievement-icon";
        icon.textContent = isUnlocked ? achievement.icon : "🔒";

        const title = document.createElement("div");
        title.className = "achievement-title";
        title.textContent = isUnlocked ? achievement.title : "???";

        const description = document.createElement("div");
        description.className = "achievement-description";
        description.textContent = isUnlocked
            ? achievement.description
            : "Keep playing to unlock this achievement!";

        card.append(icon, title, description);
        achievementsList.appendChild(card);
    });
}


/* ===== ACHIEVEMENTS PANEL BUTTON FIX ===== */

if (achievementsButton && achievementsPanel) {
    achievementsButton.addEventListener("click", () => {
        renderAchievementsPanel();
        achievementsPanel.classList.add("open");
    });
}

if (closeAchievementsButton && achievementsPanel) {
    closeAchievementsButton.addEventListener("click", () => {
        achievementsPanel.classList.remove("open");
    });
}

// ==============================
// NEON BALL GAME SETTINGS
// ==============================

const defaultSettings = {
    volume: true,
    vibration: true,
    shake: true,
    particles: true,
    trail: true,
    autoPause: true,
    neon: true,
    graphicsQuality: "high",
    difficulty: "medium",
    masterVolume: 75,
    musicVolume: 75,
    sfxVolume: 75
};

let gameSettings;

try {
    const savedSettings = JSON.parse(localStorage.getItem("neonSettings") || "{}");
    gameSettings = { ...defaultSettings, ...savedSettings };
} catch (error) {
    gameSettings = { ...defaultSettings };
}

// Keep old or invalid saved values from breaking the game.
if (!["easy", "medium", "hard"].includes(gameSettings.difficulty)) {
    gameSettings.difficulty = "medium";
}
if (!["low", "medium", "high"].includes(gameSettings.graphicsQuality)) {
    gameSettings.graphicsQuality = "high";
}
["masterVolume", "musicVolume", "sfxVolume"].forEach(key => {
    const value = Number(gameSettings[key]);
    gameSettings[key] = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 75;
});

soundEnabled = Boolean(gameSettings.volume);

const settingsOverlay = document.getElementById("settingsOverlay");
const settingsBtn = document.getElementById("settingsBtn");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const resetSettingsBtn = document.getElementById("resetSettingsBtn");

const volumeToggle = document.getElementById("volumeToggle");
const vibrationToggle = document.getElementById("vibrationToggle");
const shakeToggle = document.getElementById("shakeToggle");
const particlesToggle = document.getElementById("particlesToggle");
const trailToggle = document.getElementById("trailToggle");
const autoPauseToggle = document.getElementById("autoPauseToggle");
const neonToggle = document.getElementById("neonToggle");

const graphicsQuality = document.getElementById("graphicsQuality");
const masterVolume = document.getElementById("masterVolume");
const musicVolume = document.getElementById("musicVolume");
const sfxVolume = document.getElementById("sfxVolume");
const masterVolumeValue = document.getElementById("masterVolumeValue");
const musicVolumeValue = document.getElementById("musicVolumeValue");
const sfxVolumeValue = document.getElementById("sfxVolumeValue");

function saveSettings() {
    try {
        localStorage.setItem("neonSettings", JSON.stringify(gameSettings));
    } catch (error) {
        console.warn("Could not save game settings.", error);
    }
}

function updateToggleButton(button, settingName) {
    if (!button) return;
    const enabled = Boolean(gameSettings[settingName]);
    button.textContent = enabled ? "ON" : "OFF";
    button.classList.toggle("active", enabled);
    button.setAttribute("aria-pressed", String(enabled));
}

function updateSettingsUI() {
    updateToggleButton(volumeToggle, "volume");
    updateToggleButton(vibrationToggle, "vibration");
    updateToggleButton(shakeToggle, "shake");
    updateToggleButton(particlesToggle, "particles");
    updateToggleButton(trailToggle, "trail");
    updateToggleButton(autoPauseToggle, "autoPause");
    updateToggleButton(neonToggle, "neon");

    document.querySelectorAll(".difficulty-btn").forEach(button => {
        button.classList.toggle("active", button.dataset.mode === gameSettings.difficulty);
    });

    if (graphicsQuality) graphicsQuality.value = gameSettings.graphicsQuality;

    if (masterVolume) masterVolume.value = gameSettings.masterVolume;
    if (musicVolume) musicVolume.value = gameSettings.musicVolume;
    if (sfxVolume) sfxVolume.value = gameSettings.sfxVolume;

    if (masterVolumeValue) masterVolumeValue.textContent = gameSettings.masterVolume + "%";
    if (musicVolumeValue) musicVolumeValue.textContent = gameSettings.musicVolume + "%";
    if (sfxVolumeValue) sfxVolumeValue.textContent = gameSettings.sfxVolume + "%";

    if (soundBtn) {
        soundBtn.textContent = soundEnabled ? "🔊 SOUND ON" : "🔇 SOUND OFF";
        soundBtn.classList.toggle("sound-off", !soundEnabled);
    }
}

function setSoundEnabled(enabled) {
    gameSettings.volume = Boolean(enabled);
    soundEnabled = gameSettings.volume;

    if (!soundEnabled) {
        stopBackgroundMusic();
    } else if (gameRunning && !gamePaused) {
        initAudio();
        playBackgroundMusic();
    }

    saveSettings();
    updateSettingsUI();
}

if (settingsBtn && settingsOverlay) {
    settingsBtn.addEventListener("click", () => {
        settingsOverlay.classList.add("open");
    });
}

if (closeSettingsBtn && settingsOverlay) {
    closeSettingsBtn.addEventListener("click", () => {
        settingsOverlay.classList.remove("open");
    });
}

if (settingsOverlay) {
    settingsOverlay.addEventListener("click", event => {
        if (event.target === settingsOverlay) {
            settingsOverlay.classList.remove("open");
        }
    });
}

if (volumeToggle) {
    volumeToggle.addEventListener("click", () => setSoundEnabled(!gameSettings.volume));
}

// The main in-game sound button and the Settings sound button stay synchronized.
if (soundBtn) {
    soundBtn.addEventListener("click", () => setSoundEnabled(!gameSettings.volume));
}

[
    [vibrationToggle, "vibration"],
    [shakeToggle, "shake"],
    [particlesToggle, "particles"],
    [trailToggle, "trail"],
    [autoPauseToggle, "autoPause"],
    [neonToggle, "neon"]
].forEach(([button, settingName]) => {
    if (!button) return;
    button.addEventListener("click", () => {
        gameSettings[settingName] = !gameSettings[settingName];
        saveSettings();
        updateSettingsUI();
    });
});

function bindVolumeSlider(slider, valueLabel, settingName) {
    if (!slider) return;
    slider.addEventListener("input", () => {
        gameSettings[settingName] = Math.max(0, Math.min(100, Number(slider.value) || 0));
        if (valueLabel) valueLabel.textContent = gameSettings[settingName] + "%";
        saveSettings();
    });
}

bindVolumeSlider(masterVolume, masterVolumeValue, "masterVolume");
bindVolumeSlider(musicVolume, musicVolumeValue, "musicVolume");
bindVolumeSlider(sfxVolume, sfxVolumeValue, "sfxVolume");

if (graphicsQuality) {
    graphicsQuality.addEventListener("change", () => {
        if (["low", "medium", "high"].includes(graphicsQuality.value)) {
            gameSettings.graphicsQuality = graphicsQuality.value;
            saveSettings();
        }
    });
}

document.querySelectorAll(".difficulty-btn").forEach(button => {
    button.addEventListener("click", () => {
        const selectedDifficulty = button.dataset.mode;
        if (!["easy", "medium", "hard"].includes(selectedDifficulty)) return;
        gameSettings.difficulty = selectedDifficulty;
        saveSettings();
        updateSettingsUI();
    });
});

if (resetSettingsBtn) {
    resetSettingsBtn.addEventListener("click", () => {
        gameSettings = { ...defaultSettings };
        setSoundEnabled(true);
        saveSettings();
        updateSettingsUI();
    });
}

// Automatically pause when the player switches tabs, if that option is enabled.
document.addEventListener("visibilitychange", () => {
    if (document.hidden && gameSettings.autoPause && gameRunning && !gamePaused) {
        if (typeof togglePause === "function") togglePause();
    }
});

const howToPlayBtn = document.getElementById("howToPlayBtn");
const aboutGameBtn = document.getElementById("aboutGameBtn");

if (howToPlayBtn) {
    howToPlayBtn.addEventListener("click", () => {
        alert("HOW TO PLAY\n\nMove your mouse or finger inside the game area to move the paddle. Keep the balls from falling. Collect power-ups to get special abilities. Choose Classic, Challenge, or Unlimited mode.");
    });
}

if (aboutGameBtn) {
    aboutGameBtn.addEventListener("click", () => {
        alert("NEON BALL GAME\n\nA neon-style arcade game. Collect power-ups, build your score, and beat your high score!");
    });
}

function gameVibrate(pattern = 100) {
    if (gameSettings.vibration && typeof navigator.vibrate === "function") {
        navigator.vibrate(pattern);
    }
}

function getDifficultyMultiplier() {
    const levels = { easy: 0.8, medium: 1, hard: 1.25 };
    return levels[gameSettings.difficulty] ?? 1;
}

// Apply saved settings as soon as the script loads.
updateSettingsUI();

// RESTART GAME BUTTON

const restartGameBtn = document.getElementById("restartGameBtn");

if (restartGameBtn) {
    restartGameBtn.addEventListener("click", () => {

        const confirmRestart = confirm(
            "Are you sure you want to restart the game?"
        );

        if (!confirmRestart) return;

        // Stop current game
        gameRunning = false;
        gamePaused = false;

        // Stop timer and animation
        clearInterval(timerInterval);
        timerInterval = null;

        if (animationId !== null) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }

        //Hide settings
        settingsOverlay.classList.remove("open");

        // Hide old game over screen
        startScreen.style.display = "flex";
        startScreen.classList.remove("screen-exit");

        if (finalScoreDisplay) {
            finalScoreDisplay.style.display = "none";
        }

        if (recordBadge) {
            recordBadge.style.display = "none";

        }

        startBtn.textContent = "START GAME";

        // Start fresh game
        startGame();
    });
}