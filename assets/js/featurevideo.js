/* Homepage capstone preview: loop the clean opening of the promo animation over its still image. */
(function () {
    var video = document.querySelector('.capstone-feature-video');
    if (!video || !('IntersectionObserver' in window)) return;

    // Keep the still image for visitors who asked for less motion or less data.
    var connection = navigator.connection;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (connection && connection.saveData) return;

    var loopStart = parseFloat(video.dataset.loopStart);
    var loopEnd = parseFloat(video.dataset.loopEnd);
    var fadeLead = 0.5;
    var loaded = false;
    var visible = false;

    function load() {
        loaded = true;
        video.preload = 'auto';
        video.src = video.dataset.src + '#t=' + loopStart;
        video.addEventListener('loadedmetadata', function () {
            video.currentTime = loopStart;
        }, { once: true });
    }

    function play() {
        if (!loaded) load();
        var attempt = video.play();
        // Autoplay can still be refused (e.g. low-power mode); the still image stays put.
        if (attempt && attempt.catch) attempt.catch(function () {});
    }

    video.addEventListener('playing', function () {
        video.classList.add('is-playing');
    });

    // Dip to the still image just before the loop point, then jump back and fade in again.
    video.addEventListener('timeupdate', function () {
        if (video.currentTime >= loopEnd - fadeLead) video.classList.remove('is-playing');
        if (video.currentTime >= loopEnd) video.currentTime = loopStart;
    });

    video.addEventListener('seeked', function () {
        if (visible && !video.paused) video.classList.add('is-playing');
    });

    new IntersectionObserver(function (entries) {
        visible = entries[entries.length - 1].isIntersecting;
        if (visible) play(); else video.pause();
    }, { rootMargin: '200px 0px' }).observe(video);

    // Browsers pause muted video in background tabs; pick it back up on return.
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden && visible && video.paused) play();
    });
})();
