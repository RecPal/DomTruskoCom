/* Shared project data and navigation for every page; no build or fetch required. */
(function () {
    var nav = document.getElementById('nav');
    if (!nav) return;

    var siteRoot = new URL('../../', document.currentScript.src);
    var currentPage = window.location.pathname;
    if (currentPage.endsWith('/')) currentPage += 'index.html';

    var projects = {
        neglect: {
            name: 'Neglect Reminder', page: 'neglectreminder.html',
            image: 'images/NeglectReminder/case-front-preview.webp', width: 1920, height: 1080,
            description: 'An assistive device that uses head tracking and visual prompts to support patient responses and record session data for clinicians.',
            client: 'Barrow Neurological Institute'
        },
        capstone: {
            name: 'IIoT Smart Manufacturing Capstone', page: 'capstone.html',
            image: 'images/Capstone/animation-overview.webp', width: 1600, height: 900,
            description: 'An educational manufacturing cell integrating industrial robots, conveyors, PLC controls, and live data visualization for hands-on technical training.',
            client: 'Society of Manufacturing Engineers & Manufacturing Education Alliance'
        },
        testbench: {
            name: 'Student Power-Generator Testbench', page: 'sparkyville.html',
            image: 'images/Sparkyville/testbench-scan.webp', width: 1204, height: 672,
            description: 'A rebuilt testbench for student wind, water, and solar generators, replacing aging hardware with a durable system for classroom use.',
            client: 'ASU Polytechnic Engineering'
        },
        quiz: {
            name: 'Tactile Classroom Quiz System', page: 'classroomquiz.html',
            image: 'images/MathCraft/assembled-system.webp', width: 1600, height: 900,
            description: 'A hands-on quiz system combining physical answer cubes, custom electronics, and four player stations to bring friendly competition into classroom learning.',
            client: 'Local elementary school students'
        },
        radiation: {
            name: 'Radiological Material Sorting Interface', page: 'radiationanalysis.html',
            image: 'images/RadiationAnalysis/sorting-scan.webp', width: 1280, height: 720,
            description: 'A telepresence sorting concept pairing a robotic arm with a custom interface to reduce operator exposure when handling radioactive waste.',
            client: 'Los Alamos National Labs · Spring 2025 Hackathon'
        },
        void: {
            name: 'VR Mech-Suit Game', page: 'intothevoid.html',
            image: 'images/IntoTheVoid/VoidIcon-upscaled.webp', width: 1758, height: 895,
            description: 'Call of the V.O.I.D., a virtual reality combat game featuring pilotable mech suits, custom 3D assets, and detailed weapon and armor systems.',
            client: 'ASU Game Design · University game jam'
        }
    };
    var categories = [
        { name: 'Electrical', projects: ['neglect', 'capstone', 'testbench', 'quiz', 'radiation'] },
        { name: 'Mechanical', projects: ['capstone', 'quiz', 'radiation'] },
        { name: 'Computing', projects: ['neglect', 'capstone', 'void', 'radiation'] },
        { name: 'Virtual Reality', projects: ['void'] },
        { name: '3D Graphics', projects: ['capstone', 'void', 'radiation'] }
    ];

    function escapeHTML(value) {
        return value.replace(/[&<>"']/g, function (character) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
        });
    }

    function projectCard(key, categoryIndex) {
        var project = projects[key];
        var titleId = 'project-' + categoryIndex + '-' + key;
        // Keep the last two words together as a fallback for text-wrap: balance.
        var description = escapeHTML(project.description).replace(/ (\S+)$/, '&nbsp;$1');
        return `<li><a class="project-preview" href="${project.page}" data-nav-label="${escapeHTML(project.name)}" aria-labelledby="${titleId}">
            <span class="project-preview-image"><img src="${new URL(project.image, siteRoot).href}" alt="" ${project.width ? `width="${project.width}" height="${project.height}"` : ''} loading="lazy" decoding="async" /></span>
            <span class="project-preview-copy">
                <span class="project-preview-title" id="${titleId}">${escapeHTML(project.name)}</span>
                <span class="project-preview-description">${description}</span>
                <span class="project-preview-client"><span class="project-preview-for">For</span> ${escapeHTML(project.client)}</span>
            </span>
        </a></li>`;
    }

    nav.innerHTML = `<ul>
        <li><a href="index.html">Home</a></li>
        <li class="projects-nav">
            <a href="#project-categories" class="projects-trigger" aria-expanded="false" aria-controls="project-categories">Projects</a>
            <ul class="project-categories" id="project-categories" hidden>
                ${categories.map(function (category, index) {
                    return `<li class="project-category">
                        <a href="#project-previews-${index}" class="project-category-trigger" aria-expanded="false" aria-controls="project-previews-${index}">${category.name}</a>
                        <ul class="project-previews" id="project-previews-${index}" aria-label="${category.name} projects" hidden>
                            ${category.projects.map(function (key) { return projectCard(key, index); }).join('')}
                        </ul>
                    </li>`;
                }).join('')}
            </ul>
        </li>
    </ul>`;

    nav.querySelectorAll('a[href]').forEach(function (link) {
        var href = link.getAttribute('href');
        if (href.charAt(0) === '#') return;
        var target = new URL(href, siteRoot);
        link.href = target.href;
        if (target.pathname !== currentPage) return;
        link.setAttribute('aria-current', 'page');
        var item = link.parentElement;
        while (item && item !== nav) {
            if (item.tagName === 'LI') item.classList.add('current');
            item = item.parentElement;
        }
    });

    var container = nav.querySelector('.projects-nav');
    var trigger = nav.querySelector('.projects-trigger');
    var menu = nav.querySelector('.project-categories');
    var categoryLinks = Array.from(nav.querySelectorAll('.project-category-trigger'));
    var activeIndex = 0;
    var closeTimer;

    function selectCategory(index) {
        activeIndex = index;
        categoryLinks.forEach(function (link, itemIndex) {
            var active = itemIndex === index;
            link.setAttribute('aria-expanded', String(active));
            link.parentElement.classList.toggle('is-selected', active);
            document.getElementById(link.getAttribute('aria-controls')).hidden = !active;
        });
    }

    function openMenu() {
        window.clearTimeout(closeTimer);
        menu.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        selectCategory(activeIndex);
        // Leave room for the menu on shorter screens and when the page is scrolled.
        menu.style.setProperty('--project-menu-height', Math.max(180, Math.min(660, window.innerHeight - menu.getBoundingClientRect().top - 24)) + 'px');
    }

    function closeMenu() {
        window.clearTimeout(closeTimer);
        menu.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        categoryLinks.forEach(function (link) { link.setAttribute('aria-expanded', 'false'); });
    }

    trigger.addEventListener('click', function (event) {
        event.preventDefault();
        if (menu.hidden) openMenu(); else closeMenu();
    });
    container.addEventListener('pointerenter', function (event) {
        if (event.pointerType === 'mouse') openMenu();
    });
    container.addEventListener('pointerleave', function (event) {
        if (event.pointerType === 'mouse' && !container.contains(document.activeElement)) {
            closeTimer = window.setTimeout(closeMenu, 180);
        }
    });
    container.addEventListener('focusout', function () {
        window.setTimeout(function () {
            if (!container.contains(document.activeElement)) closeMenu();
        }, 0);
    });
    categoryLinks.forEach(function (link, index) {
        link.addEventListener('pointerenter', function (event) {
            if (event.pointerType === 'mouse') selectCategory(index);
        });
        link.addEventListener('focus', function () { selectCategory(index); });
        link.addEventListener('click', function (event) {
            event.preventDefault();
            selectCategory(index);
        });
    });
    container.addEventListener('keydown', function (event) {
        var categoryIndex = categoryLinks.indexOf(document.activeElement);
        if (event.key === 'Escape' && !menu.hidden) {
            event.preventDefault();
            closeMenu();
            trigger.focus();
        } else if (document.activeElement === trigger && event.key === 'ArrowDown') {
            event.preventDefault();
            openMenu();
            categoryLinks[activeIndex].focus();
        } else if (categoryIndex !== -1 && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            categoryLinks[(categoryIndex + (event.key === 'ArrowDown' ? 1 : -1) + categoryLinks.length) % categoryLinks.length].focus();
        } else if (categoryIndex !== -1 && event.key === 'ArrowRight') {
            event.preventDefault();
            categoryLinks[categoryIndex].nextElementSibling.querySelector('a').focus();
        } else if (document.activeElement.classList.contains('project-preview') && event.key === 'ArrowLeft') {
            event.preventDefault();
            categoryLinks[activeIndex].focus();
        }
    });
    document.addEventListener('pointerdown', function (event) {
        if (!container.contains(event.target)) closeMenu();
    });
    window.addEventListener('resize', closeMenu);
})();
