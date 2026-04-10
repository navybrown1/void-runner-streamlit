(function () {
  const GRID_SIZE = 20;
  const START_LENGTH = 3;
  const TICK_MS = 140;

  const DIRECTIONS = {
    up: { key: "up", x: 0, y: -1 },
    down: { key: "down", x: 0, y: 1 },
    left: { key: "left", x: -1, y: 0 },
    right: { key: "right", x: 1, y: 0 },
  };

  const KEY_TO_DIRECTION = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    w: "up",
    W: "up",
    a: "left",
    A: "left",
    s: "down",
    S: "down",
    d: "right",
    D: "right",
  };

  const OPPOSITES = {
    up: "down",
    down: "up",
    left: "right",
    right: "left",
  };

  const app = document.getElementById("app");
  const board = document.getElementById("board");
  const scoreDisplay = document.getElementById("scoreDisplay");
  const lengthDisplay = document.getElementById("lengthDisplay");
  const statusDisplay = document.getElementById("statusDisplay");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayCopy = document.getElementById("overlayCopy");
  const overlayRestart = document.getElementById("overlayRestart");
  const footerRestart = document.getElementById("footerRestart");
  const touchButtons = Array.from(document.querySelectorAll("[data-dir]"));

  let cells = [];
  let state = null;
  let timerId = null;

  function createRng(seed) {
    let value = seed >>> 0;
    if (!value) {
      value = 0x6d2b79f5;
    }

    return function rng() {
      value = (1664525 * value + 1013904223) >>> 0;
      return value / 0x100000000;
    };
  }

  function randomSeed() {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const buffer = new Uint32Array(1);
      crypto.getRandomValues(buffer);
      return buffer[0] || Date.now();
    }

    return Date.now();
  }

  function clonePoint(point) {
    return { x: point.x, y: point.y };
  }

  function samePoint(a, b) {
    return a.x === b.x && a.y === b.y;
  }

  function pointKey(point) {
    return `${point.x},${point.y}`;
  }

  function indexFor(point) {
    return point.y * GRID_SIZE + point.x;
  }

  function createInitialSnake() {
    const headX = Math.floor(GRID_SIZE / 2);
    const headY = Math.floor(GRID_SIZE / 2);
    const snake = [];

    for (let i = 0; i < START_LENGTH; i += 1) {
      snake.push({ x: headX - i, y: headY });
    }

    return snake;
  }

  function spawnFood(snake, rng) {
    const occupied = new Set(snake.map(pointKey));
    const openCells = [];

    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        const candidate = { x, y };
        if (!occupied.has(pointKey(candidate))) {
          openCells.push(candidate);
        }
      }
    }

    if (openCells.length === 0) {
      return null;
    }

    return clonePoint(openCells[Math.floor(rng() * openCells.length)]);
  }

  function createState(seed) {
    const snake = createInitialSnake();
    const rng = createRng(seed);
    const food = spawnFood(snake, rng);

    return {
      seed,
      rng,
      snake,
      direction: DIRECTIONS.right,
      queuedDirection: DIRECTIONS.right,
      food,
      score: 0,
      gameOver: false,
      win: false,
      reason: "",
    };
  }

  function buildBoard() {
    const fragment = document.createDocumentFragment();
    cells = [];

    for (let i = 0; i < GRID_SIZE * GRID_SIZE; i += 1) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.setAttribute("aria-hidden", "true");
      cells.push(cell);
      fragment.appendChild(cell);
    }

    board.innerHTML = "";
    board.appendChild(fragment);
  }

  function updateHud() {
    scoreDisplay.textContent = String(state.score);
    lengthDisplay.textContent = String(state.snake.length);
    statusDisplay.textContent = state.gameOver ? (state.win ? "Complete" : "Game over") : "Running";
  }

  function showOverlay(title, copy) {
    overlayTitle.textContent = title;
    overlayCopy.textContent = copy;
    overlay.classList.remove("hidden");
  }

  function hideOverlay() {
    overlay.classList.add("hidden");
  }

  function render() {
    for (let i = 0; i < cells.length; i += 1) {
      cells[i].className = "cell";
    }

    if (state.food) {
      cells[indexFor(state.food)].classList.add("food");
    }

    for (let i = state.snake.length - 1; i >= 0; i -= 1) {
      const segment = state.snake[i];
      const cell = cells[indexFor(segment)];
      if (!cell) {
        continue;
      }

      cell.classList.add(i === 0 ? "snake-head" : "snake-body");
    }

    updateHud();
  }

  function finishGame(reason, win) {
    state.gameOver = true;
    state.win = Boolean(win);
    state.reason = reason;

    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }

    render();
    showOverlay(state.win ? "You win" : "Snake crashed", `${reason} Press Enter or tap Restart to play again.`);
  }

  function advanceState() {
    if (state.gameOver) {
      return;
    }

    const direction = state.queuedDirection;
    const head = state.snake[0];
    const nextHead = {
      x: head.x + direction.x,
      y: head.y + direction.y,
    };

    if (
      nextHead.x < 0 ||
      nextHead.y < 0 ||
      nextHead.x >= GRID_SIZE ||
      nextHead.y >= GRID_SIZE
    ) {
      finishGame("You hit the wall.");
      return;
    }

    const eating = state.food && samePoint(nextHead, state.food);
    const bodyToCheck = eating ? state.snake : state.snake.slice(0, -1);
    const hitsSelf = bodyToCheck.some((segment) => samePoint(segment, nextHead));

    if (hitsSelf) {
      finishGame("You bit yourself.");
      return;
    }

    state.snake.unshift(nextHead);
    state.direction = direction;

    if (eating) {
      state.score += 1;
      state.food = spawnFood(state.snake, state.rng);

      if (!state.food) {
        finishGame("The board is full.", true);
        return;
      }
    } else {
      state.snake.pop();
    }

    render();
  }

  function startLoop() {
    if (timerId !== null) {
      clearInterval(timerId);
    }

    timerId = setInterval(advanceState, TICK_MS);
  }

  function queueDirection(directionKey) {
    const nextDirection = DIRECTIONS[directionKey];
    if (!nextDirection) {
      return;
    }

    if (state.gameOver) {
      restartGame(directionKey);
      return;
    }

    if (OPPOSITES[state.direction.key] === nextDirection.key) {
      return;
    }

    state.queuedDirection = nextDirection;
  }

  function restartGame(directionKey) {
    state = createState(randomSeed());

    if (directionKey) {
      const nextDirection = DIRECTIONS[directionKey];
      if (nextDirection && OPPOSITES[state.direction.key] !== nextDirection.key) {
        state.queuedDirection = nextDirection;
      }
    }

    hideOverlay();
    render();
    startLoop();
    focusRoot();
  }

  function focusRoot() {
    if (typeof app.focus === "function") {
      app.focus({ preventScroll: true });
    }
  }

  function handleKeydown(event) {
    const directionKey = KEY_TO_DIRECTION[event.key];
    if (directionKey) {
      event.preventDefault();
      queueDirection(directionKey);
      return;
    }

    if (event.key === "Enter" || event.key === "r" || event.key === "R") {
      event.preventDefault();
      restartGame();
    }
  }

  function bindControls() {
    window.addEventListener("keydown", handleKeydown);

    window.addEventListener("pointerdown", function () {
      focusRoot();
    });

    touchButtons.forEach(function (button) {
      button.addEventListener("pointerdown", function (event) {
        event.preventDefault();
        const directionKey = button.dataset.dir;
        if (directionKey) {
          queueDirection(directionKey);
        }
        focusRoot();
      });
    });

    overlayRestart.addEventListener("click", function () {
      restartGame();
    });

    footerRestart.addEventListener("click", function () {
      restartGame();
    });
  }

  function init() {
    buildBoard();
    bindControls();
    state = createState(randomSeed());
    render();
    hideOverlay();
    startLoop();
    focusRoot();
  }

  init();
})();
