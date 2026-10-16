(function () {
    'use strict';

    function render(view) {
        var cats = NC.data.categories();
        var totalCount = (NC.data.products || []).length;

        var cards = cats.map(function (c) {
            return '<a class="category-card" href="#/?cat=' + encodeURIComponent(c.slug) + '">' +
                '<div class="category-card-icon">' + NC.ui.icon(c.icon) + '</div>' +
                '<strong class="category-card-name">' + NC.ui.esc(c.name) + '</strong>' +
                '<span class="category-card-count">' + c.count + ' product' + (c.count === 1 ? '' : 's') + '</span>' +
                '<span class="category-card-cta">Shop Collection ' + NC.ui.icon('i-arrow-right') + '</span>' +
                '</a>';
        }).join('');

        view.innerHTML = '<div class="page">' +
            NC.ui.breadcrumb([{ name: 'Home', href: '#/' }, { name: 'Categories', href: '#/categories' }]) +
            '<div class="page-head">' +
            '<h1 class="page-title">Explore Categories</h1>' +
            '<p class="page-sub">Browse ' + totalCount + ' curated products across ' + cats.length + ' departments</p>' +
            '</div>' +
            '<div class="categories-grid">' + cards + '</div>' +
            '</div>';
    }

    NC.router.add('/categories', render);
})();
