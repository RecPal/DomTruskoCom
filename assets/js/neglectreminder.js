/* Local slide viewer. Original GIFs are positioned over PowerPoint slide exports. */
(function () {
    'use strict';
    var viewer = document.getElementById('neglect-viewer');
    if (!viewer) return;
    var slides = Array.from(viewer.querySelectorAll('.neglect-slide'));
    var select = viewer.querySelector('select');
    var previous = viewer.querySelector('[data-previous]');
    var next = viewer.querySelector('[data-next]');
    var motion = viewer.querySelector('[data-motion]');
    var fullscreen = viewer.querySelector('[data-fullscreen]');
    var status = viewer.querySelector('[data-status]');
    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    document.querySelectorAll('.neglect-inline-demo').forEach(function (demo) {
        var toggle = demo.querySelector('[data-inline-motion]');
        var expand = demo.querySelector('[data-inline-fullscreen]');
        var feedback = demo.querySelector('[data-inline-status]');
        var running = !reducedMotion.matches;
        function updateDemo() {
            demo.querySelectorAll('[data-animation]').forEach(function (image) {
                var target = running ? image.dataset.animation : image.dataset.poster;
                if (image.getAttribute('src') !== target) image.src = target;
            });
            toggle.textContent = running ? 'Pause demos' : 'Play demos';
            toggle.setAttribute('aria-pressed', String(running));
        }
        demo.querySelector('.neglect-toolbar').hidden = false;
        toggle.addEventListener('click', function () { running = !running; updateDemo(); });
        reducedMotion.addEventListener('change', function (event) { running = !event.matches; updateDemo(); });
        expand.hidden = !document.fullscreenEnabled;
        expand.addEventListener('click', async function () {
            try {
                if (document.fullscreenElement === demo) await document.exitFullscreen();
                else await demo.requestFullscreen();
            } catch (error) {
                feedback.textContent = 'Fullscreen is unavailable. Use the presentation below or download the PowerPoint.';
            }
        });
        document.addEventListener('fullscreenchange', function () {
            expand.textContent = document.fullscreenElement === demo ? 'Exit fullscreen' : 'Fullscreen';
        });
        updateDemo();
    });
    var playing = !reducedMotion.matches;
    var index = 0;

    function render() {
        slides.forEach(function (slide, position) {
            slide.hidden = position !== index;
            slide.querySelectorAll('[data-animation]').forEach(function (image) {
                var target = playing && position === index ? image.dataset.animation : image.dataset.poster;
                if (image.getAttribute('src') !== target) image.src = target;
            });
        });
        select.value = String(index);
        previous.disabled = index === 0;
        next.disabled = index === slides.length - 1;
        var hasAnimation = Boolean(slides[index].querySelector('[data-animation]'));
        motion.hidden = !hasAnimation;
        motion.textContent = playing ? 'Pause demos' : 'Play demos';
        motion.setAttribute('aria-pressed', String(playing));
        status.textContent = 'Slide ' + (index + 1) + ' of ' + slides.length + ': ' + slides[index].dataset.title;
    }
    function go(position) {
        index = Math.max(0, Math.min(slides.length - 1, position));
        render();
    }
    viewer.querySelector('.neglect-toolbar').hidden = false;
    previous.addEventListener('click', function () { go(index - 1); });
    next.addEventListener('click', function () { go(index + 1); });
    select.addEventListener('change', function () { go(Number(select.value)); });
    motion.addEventListener('click', function () { playing = !playing; render(); });
    reducedMotion.addEventListener('change', function (event) { playing = !event.matches; render(); });
    viewer.addEventListener('keydown', function (event) {
        if (/SELECT|INPUT|TEXTAREA/.test(event.target.tagName)) return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            go(index + (event.key === 'ArrowRight' ? 1 : -1));
        }
    });
    fullscreen.hidden = !document.fullscreenEnabled;
    fullscreen.addEventListener('click', async function () {
        try {
            if (document.fullscreenElement === viewer) await document.exitFullscreen();
            else await viewer.requestFullscreen();
        } catch (error) {
            status.textContent = 'Fullscreen is unavailable. Download the PowerPoint to view at full size.';
        }
    });
    document.addEventListener('fullscreenchange', function () {
        fullscreen.textContent = document.fullscreenElement === viewer ? 'Exit fullscreen' : 'Fullscreen';
    });
    document.querySelectorAll('[data-show-slide]').forEach(function (link) {
        link.addEventListener('click', function () { go(Number(link.dataset.showSlide) - 1); });
    });
    render();
})();

/* Render lightbox keeps the project page and scroll position behind the image. */
(function () {
    'use strict';
    var dialog = document.getElementById('neglect-lightbox');
    if (!dialog || typeof dialog.showModal !== 'function') return;
    var renders = Array.from(document.querySelectorAll('.neglect-renders a'));
    var image = dialog.querySelector('.neglect-lightbox-image');
    var caption = dialog.querySelector('[data-render-caption]');
    var counter = dialog.querySelector('[data-render-counter]');
    var selected = 0;
    var trigger;

    function display(index) {
        selected = (index + renders.length) % renders.length;
        var render = renders[selected];
        image.src = render.href;
        image.alt = render.querySelector('img').alt;
        caption.textContent = render.closest('figure').querySelector('figcaption').textContent;
        counter.textContent = 'Render ' + (selected + 1) + ' of ' + renders.length;
    }
    renders.forEach(function (render, index) {
        render.setAttribute('aria-haspopup', 'dialog');
        render.setAttribute('aria-controls', dialog.id);
        render.addEventListener('click', function (event) {
            event.preventDefault();
            trigger = render;
            display(index);
            dialog.showModal();
            document.documentElement.classList.add('neglect-lightbox-open');
        });
    });
    dialog.querySelector('[data-render-close]').addEventListener('click', function () { dialog.close(); });
    dialog.querySelector('[data-render-previous]').addEventListener('click', function () { display(selected - 1); });
    dialog.querySelector('[data-render-next]').addEventListener('click', function () { display(selected + 1); });
    dialog.addEventListener('keydown', function (event) {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            display(selected + (event.key === 'ArrowRight' ? 1 : -1));
        }
    });
    dialog.addEventListener('click', function (event) {
        if (event.target !== dialog) return;
        var bounds = dialog.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right ||
            event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    });
    dialog.addEventListener('close', function () {
        document.documentElement.classList.remove('neglect-lightbox-open');
        if (trigger) trigger.focus({ preventScroll: true });
    });
})();
