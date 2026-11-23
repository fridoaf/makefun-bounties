// Keyboard + mouse, read fresh every frame. `pressed` is the edge: a key
// that went down since the last frame. The game loop drains it each step.

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
  Space: 'punch',
  KeyE: 'enter',
  KeyF: 'interact',
  KeyM: 'mute',
  Escape: 'pause',
  Enter: 'confirm',
};

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  let mouseX = 0;
  let mouseY = 0;
  let mouseClicked = false;

  const onDown = (event) => {
    const action = KEYMAP[event.code];
    if (!action) return;
    if (!held.has(action)) pressed.add(action);
    held.add(action);
    if (action === 'punch' || action === 'confirm') event.preventDefault();
  };
  const onUp = (event) => {
    const action = KEYMAP[event.code];
    if (action) held.delete(action);
  };
  const onMove = (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = (event.clientX - rect.left) * (canvas.width / rect.width);
    mouseY = (event.clientY - rect.top) * (canvas.height / rect.height);
  };
  const onClick = (event) => {
    onMove(event);
    mouseClicked = true;
  };
  const onBlur = () => held.clear();

  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mousedown', onClick);

  return {
    held,
    pressed,
    get mouse() {
      return { x: mouseX, y: mouseY };
    },
    /** True while the action key is down. */
    is(action) {
      return held.has(action);
    },
    /** True once, on the frame the key went down. */
    wasPressed(action) {
      return pressed.has(action);
    },
    /** True once, on the frame the canvas was clicked. */
    takeClick() {
      const c = mouseClicked;
      mouseClicked = false;
      return c;
    },
    /** Steering axis: -1 left, +1 right. */
    steer() {
      return (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
    },
    /** Driving axis: +1 throttle, -1 brake/reverse. */
    throttle() {
      return (held.has('up') ? 1 : 0) - (held.has('down') ? 1 : 0);
    },
    /** Walking axis, normalised, from the four move keys. */
    walkAxis() {
      const x = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
      const y = (held.has('down') ? 1 : 0) - (held.has('up') ? 1 : 0);
      const len = Math.hypot(x, y);
      return len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
    },
    /** Drain the edge set; the loop calls this after every step. */
    endFrame() {
      pressed.clear();
    },
  };
}

/** A fake input for the screenshot autopilot: same shape, driven by code. */
export function makeScriptedInput() {
  const held = new Set();
  return {
    held,
    pressed: new Set(),
    mouse: { x: 640, y: 360 },
    is(action) {
      return held.has(action);
    },
    wasPressed() {
      return false;
    },
    takeClick() {
      return false;
    },
    steer() {
      return (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
    },
    throttle() {
      return (held.has('up') ? 1 : 0) - (held.has('down') ? 1 : 0);
    },
    walkAxis() {
      const x = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
      const y = (held.has('down') ? 1 : 0) - (held.has('up') ? 1 : 0);
      const len = Math.hypot(x, y);
      return len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
    },
    endFrame() {},
    set(action, on) {
      if (on) held.add(action);
      else held.delete(action);
    },
    clear() {
      held.clear();
    },
  };
}
