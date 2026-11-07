export {};
// Teaser video with only three controls: pause/play, full screen, and close.
const player = document.querySelector<HTMLElement>('#teaser-player');
const video = document.querySelector<HTMLVideoElement>('#teaser-video');

if (player && video) {
  const start = player.querySelector<HTMLButtonElement>('#teaser-start')!;
  const toggle = player.querySelector<HTMLButtonElement>('#teaser-toggle')!;
  const fullscreen = player.querySelector<HTMLButtonElement>('#teaser-fullscreen')!;
  const close = player.querySelector<HTMLButtonElement>('#teaser-close')!;
  const music = document.querySelector<HTMLAudioElement>('#wedding-audio');
  let musicWasPlaying = false;
  let started = false;
  let hideTimer = 0;
  // Hide browser extras (picture-in-picture, casting, download menu) so only our controls remain.
  video.setAttribute('disablepictureinpicture', '');
  video.setAttribute('disableremoteplayback', '');
  video.setAttribute('controlslist', 'nodownload nofullscreen noplaybackrate noremoteplayback');

  const setState = (state: 'idle' | 'playing' | 'paused') => {
    player.dataset.state = state;
    toggle.setAttribute('aria-label', state === 'playing' ? 'Pause video' : 'Play video');
  };
  // Controls fade out while playing; any movement or tap brings them back.
  const showControls = () => {
    player.classList.add('show-controls');
    window.clearTimeout(hideTimer);
    if (!video.paused) hideTimer = window.setTimeout(() => player.classList.remove('show-controls'), 2500);
  };
  const play = async () => {
    // The cover shows a frame from 6s in; real playback starts at the beginning.
    if (!started) { video.currentTime = 0; started = true; }
    if (music && !music.paused) { musicWasPlaying = true; music.pause(); }
    try { await video.play(); } catch { setState('paused'); }
  };
  const resumeMusic = () => { if (musicWasPlaying && music) { musicWasPlaying = false; void music.play().catch(() => {}); } };
  const isFullscreen = () => document.fullscreenElement === player;
  const exitFullscreen = async () => { if (isFullscreen()) { try { await document.exitFullscreen(); } catch { /* already closed */ } } };
  const closeVideo = async () => {
    video.pause();
    await exitFullscreen();
    started = false; video.currentTime = 6;
    setState('idle'); player.classList.remove('show-controls');
    resumeMusic(); start.focus();
  };

  start.addEventListener('click', () => { void play(); });
  toggle.addEventListener('click', () => { if (video.paused) void play(); else video.pause(); });
  // Tapping the picture itself also pauses/plays.
  video.addEventListener('click', () => { if (player.dataset.state === 'idle') return; if (video.paused) void play(); else video.pause(); });
  close.addEventListener('click', () => { void closeVideo(); });
  fullscreen.addEventListener('click', async () => {
    if (isFullscreen()) { await exitFullscreen(); return; }
    if (player.requestFullscreen) { try { await player.requestFullscreen(); return; } catch { /* fall through */ } }
    // iPhone Safari only allows the video element itself to go full screen.
    const iosVideo = video as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
    iosVideo.webkitEnterFullscreen?.();
  });
  document.addEventListener('fullscreenchange', () => { player.classList.toggle('is-fullscreen', isFullscreen()); showControls(); });

  video.addEventListener('play', () => { setState('playing'); showControls(); });
  video.addEventListener('pause', () => { if (player.dataset.state !== 'idle') setState('paused'); showControls(); });
  video.addEventListener('ended', () => { void closeVideo(); });
  player.addEventListener('pointermove', showControls);
  player.addEventListener('focusin', showControls);
  // No right-click "Save video as…".
  video.addEventListener('contextmenu', event => event.preventDefault());
  // Pause when the guest switches tabs or apps.
  document.addEventListener('visibilitychange', () => { if (document.hidden && !video.paused) video.pause(); });
}
