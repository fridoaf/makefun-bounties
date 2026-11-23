// Ember Pact — keyboard and mouse.
// One file, one job: turn clicks and keys into the ui callbacks main.js owns.

/** Wire the header buttons and the keyboard. Returns nothing; ui owns state. */
export function bindInput(ui) {
  document.getElementById('mute-btn').addEventListener('click', () => ui.onMute());
  document.getElementById('quit-btn').addEventListener('click', () => ui.onTitle());

  document.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    const key = event.key.toLowerCase();

    if (key >= '1' && key <= '5') {
      ui.onPick(Number(key) - 1);
      return;
    }
    if (key === 'enter' || key === ' ') {
      event.preventDefault();
      ui.onConfirm();
      return;
    }
    if (key === 'm') {
      ui.onMulligan();
      return;
    }
    if (key === 'r') {
      ui.onStart();
      return;
    }
    if (key === 'escape') {
      ui.onTitle();
    }
  });
}
