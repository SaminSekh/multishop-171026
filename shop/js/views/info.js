(function () {
    'use strict';

    function findPage(slug) {
        var pages = (NC.settings && NC.settings.pages) || [];
        for (var i = 0; i < pages.length; i++) {
            if (pages[i] && String(pages[i].slug) === slug) return pages[i];
        }
        return null;
    }

    function render(view, query, params) {
        view.dataset.page = 'info';
        var page = findPage(params.slug);

        if (!page) {
            view.innerHTML = '<div class="page">' + NC.ui.emptyState({
                icon: 'i-info',
                title: 'Page not found',
                text: 'This page is not available right now.',
                actionHref: '#/',
                actionLabel: 'Back to shop'
            }) + '</div>';
            return;
        }

        var paragraphs = String(page.body || '').split(/\n+/).filter(function (p) {
            return p.trim();
        }).map(function (p) {
            return '<p>' + NC.ui.esc(p.trim()) + '</p>';
        }).join('');

        view.innerHTML = '<div class="page">' +
            NC.ui.breadcrumb([
                { name: 'Home', href: '#/' },
                { name: page.title || 'Page', href: '#/info/' + NC.ui.esc(page.slug) }
            ]) +
            '<article class="info-page">' +
            '<h1 class="page-title">' + NC.ui.esc(page.title || '') + '</h1>' +
            (paragraphs || '<p>' + NC.ui.esc(page.body || '') + '</p>') +
            '</article>' +
            '</div>';
    }

    NC.views = NC.views || {};
    NC.views.info = { render: render };
    NC.router.add('/info/:slug', render);
})();
