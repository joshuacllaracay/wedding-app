export {};
// Live countdown to the ceremony, shown under the date in the hero.
const root = document.querySelector<HTMLElement>('#countdown');
const done = document.querySelector<HTMLElement>('#countdown-done');
const target = Date.parse(root?.dataset.target ?? '');

if (root && done && Number.isFinite(target)) {
  const units = {
    days: root.querySelector<HTMLElement>('[data-unit="days"]')!,
    hours: root.querySelector<HTMLElement>('[data-unit="hours"]')!,
    minutes: root.querySelector<HTMLElement>('[data-unit="minutes"]')!,
    seconds: root.querySelector<HTMLElement>('[data-unit="seconds"]')!,
  };
  const pad = (n: number) => String(n).padStart(2, '0');
  let timer = 0;
  const tick = () => {
    const left = target - Date.now();
    if (left <= 0) {
      // The day has arrived: swap the numbers for a short message.
      root.hidden = true; done.hidden = false; window.clearInterval(timer); return;
    }
    const s = Math.floor(left / 1000);
    units.days.textContent = String(Math.floor(s / 86400));
    units.hours.textContent = pad(Math.floor(s / 3600) % 24);
    units.minutes.textContent = pad(Math.floor(s / 60) % 60);
    units.seconds.textContent = pad(s % 60);
  };
  tick();
  timer = window.setInterval(tick, 1000);
} else if (root) root.hidden = true;
