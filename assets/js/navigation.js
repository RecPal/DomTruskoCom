/*
 * Shared navigation for every page. Edit the menu below to update the site.
 * Loaded before main.js so desktop dropdowns and the mobile panel use the same links.
 * A script keeps this static site usable without a build step or a fetch request.
 */
(function () {
    var nav = document.getElementById('nav');
    if (!nav) return;

    // Resolve links from this script, including on pages in subdirectories.
    var siteRoot = new URL('../../', document.currentScript.src);
    var currentPage = window.location.pathname;
    if (currentPage.endsWith('/')) currentPage += 'index.html';

    nav.innerHTML = `
    <ul>
        <li><a href="index.html">Home</a></li>
        <li>
            <a href="#">Projects</a>
            <ul>
                <li><a href="capstone.html">IIoT Smart Manufacturing Capstone</a></li>
                <li>
                    <a href="#">Electrical</a>
                    <ul>
                        <li><a href="sparkyville.html">Student Power-Generator Testbench</a></li>
                        <!--- <li><a href="#">Mechanical Battery</a></li> -->
                        <!--- <li><a href="#">Crash-Detection Bicycle Helmet</a></li> -->
                        <!--- <li><a href="#">Guitar Game-Controller Modernization</a></li> -->
                        <li><a href="radiationanalysis.html"> Radiological Material Sorting Interface </a>
                        </li>
                    </ul>
                </li>
                <li>
                    <a href="#">Mechanical</a>
                    <ul>
                        <!---<li><a href="#">Magnetic Mechanical Battery</a></li> -->
                        <!---<li><a href="#">Guitar Game-Controller Modernization</a></li> -->
                        <li><a href="radiationanalysis.html"> Radiological Material Sorting Interface </a>
                        </li>
                    </ul>
                </li>
                <li>
                    <a href="#">Computing</a>
                    <ul>
                        <li><a href="intothevoid.html">VR Mech-Suit Game</a></li>
                        <li><a href="radiationanalysis.html"> Radiological Material Sorting Interface </a>
                        </li>
                    </ul>
                </li>
                <li>
                    <a href="#">Virtual Reality</a>
                    <ul>
                        <li><a href="intothevoid.html">VR Mech-Suit Game</a></li>
                    </ul>
                </li>
                <li>
                    <a href="#">3d Graphics</a>
                    <ul>
                        <li><a href="intothevoid.html">VR Mech-Suit Game</a></li>
                        <li><a href="radiationanalysis.html"> Radiological Material Sorting Interface </a>
                        </li>
                    </ul>
                </li>
            </ul>
        </li>
    </ul>`;

    nav.querySelectorAll('a[href]').forEach(function (link) {
        var href = link.getAttribute('href');
        if (href === '#') return;

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
})();
