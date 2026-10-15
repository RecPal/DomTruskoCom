/* Progressive enhancement: photo links remain usable without the viewer. */
(function () {
    var dialog = document.getElementById('quiz-lightbox');
    if (!dialog || typeof dialog.showModal !== 'function') return;

    var photos = Array.from(document.querySelectorAll('.quiz-gallery-item'));
    var image = dialog.querySelector('.quiz-lightbox-image');
    var caption = dialog.querySelector('.quiz-lightbox-caption');
    var counter = dialog.querySelector('.quiz-lightbox-counter');
    var selected = 0;
    var trigger;

    function display(index) {
        selected = (index + photos.length) % photos.length;
        var photo = photos[selected];
        image.src = photo.href;
        image.alt = photo.dataset.caption;
        caption.textContent = photo.dataset.caption;
        counter.textContent = 'Photo ' + (selected + 1) + ' of ' + photos.length;
    }

    photos.forEach(function (photo, index) {
        photo.addEventListener('click', function (event) {
            if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            trigger = photo;
            display(index);
            dialog.showModal();
            document.documentElement.classList.add('quiz-viewer-open');
        });
    });

    dialog.querySelector('.quiz-lightbox-close').addEventListener('click', function () { dialog.close(); });
    dialog.querySelector('.quiz-lightbox-prev').addEventListener('click', function () { display(selected - 1); });
    dialog.querySelector('.quiz-lightbox-next').addEventListener('click', function () { display(selected + 1); });
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
        document.documentElement.classList.remove('quiz-viewer-open');
        if (trigger) trigger.focus({ preventScroll: true });
    });
})();
