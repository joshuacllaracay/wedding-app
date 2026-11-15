export {};
// Opening section: the film plays silently behind the names (the music player handles sound).
// It loops one stretch of the film, starts once the card is opened, and pauses off screen.
const video = document.querySelector<HTMLVideoElement>('#film-video');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (video) {
  const start = Number(video.dataset.loopStart) || 0;
  const end = Number(video.dataset.loopEnd) || 0;
  video.muted = true; // required for autoplay on phones
  video.addEventListener('timeupdate', () => {
    if (end && video.currentTime >= end) video.currentTime = start;
  });
  video.addEventListener('ended', () => { video.currentTime = start; void video.play().catch(() => {}); });

  let opened = false, onScreen = true;
  const sync = () => {
    if (reduced || !opened) return;
    if (onScreen && !document.hidden) void video.play().catch(() => { /* stays on its first frame */ });
    else video.pause();
  };
  new IntersectionObserver(entries => { onScreen = entries.some(e => e.isIntersecting); sync(); }).observe(video);
  document.addEventListener('visibilitychange', sync);
  const begin = () => { opened = true; sync(); };
  if (document.body.classList.contains('invitation-open') || !document.querySelector('#envelope-screen')) begin();
  else window.addEventListener('invitation-open', begin, { once: true });
}
