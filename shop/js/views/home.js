(function () {
    'use strict';

    var PRICE_BUCKETS = [
        { id: 'b1', label: 'Under ₹1,000', min: 0, max: 1000 },
        { id: 'b2', label: '₹1,000 – ₹2,500', min: 1000, max: 2500 },
        { id: 'b3', label: '₹2,500 – ₹5,000', min: 2500, max: 5000 },
        { id: 'b4', label: '₹5,000 – ₹15,000', min: 5000, max: 15000 },
        { id: 'b5', label: 'Above ₹15,000', min: 15000, max: Infinity }
    ];

    var SORTS = [
        { id: 'featured', label: 'Featured' },
        { id: 'price-asc', label: 'Price: low to high' },
        { id: 'price-desc', label: 'Price: high to low' },
        { id: 'rating', label: 'Top rated' },
        { id: 'discount', label: 'Biggest discount' },
        { id: 'new', label: 'Newest first' }
    ];

    var RATE_OPTIONS = [
        { id: '', label: 'Any rating' },
        { id: '3.5', label: '3.5 & above' },
        { id: '4', label: '4 & above' },
        { id: '4.5', label: '4.5 & above' }
    ];

    var els = {};
    var heroTimer = null;
    var heroIndex = 0;
    var HERO_DELAY = 4000;

    function list(value) {
        if (!value) return [];
        return String(value).split(',').map(function (v) { return v.trim(); }).filter(Boolean);
    }

    function bucketFor(id) {
        var found = null;
        PRICE_BUCKETS.forEach(function (b) { if (b.id === id) found = b; });
        return found;
    }

    function applyFilters(products, query) {
        var cats = list(query.cat);
        var brands = list(query.brand);
        var buckets = list(query.pr).map(bucketFor).filter(Boolean);
        var minRate = parseFloat(query.rate || '0');
        var inStock = query.stock === '1';
        var onSale = query.sale === '1';
        var term = String(query.q || '').trim().toLowerCase();

        var out = products;

        if (term) {
            out = NC.data.search(term);
        }

        if (cats.length) {
            out = out.filter(function (p) { return cats.indexOf(p.categorySlug) !== -1; });
        }
        if (brands.length) {
            out = out.filter(function (p) { return brands.indexOf(p.brand) !== -1; });
        }
        if (buckets.length) {
            out = out.filter(function (p) {
                return buckets.some(function (b) {
                    return p.price >= b.min && p.price < b.max;
                });
            });
        }
        if (minRate) {
            out = out.filter(function (p) { return p.rating >= minRate; });
        }
        if (inStock) {
            out = out.filter(function (p) { return p.stock > 0; });
        }
        if (onSale) {
            out = out.filter(function (p) { return p.discountPct >= 20; });
        }

        return out;
    }

    function applySort(products, sort) {
        var copy = products.slice();
        switch (sort) {
            case 'price-asc':
                copy.sort(function (a, b) { return a.price - b.price; });
                break;
            case 'price-desc':
                copy.sort(function (a, b) { return b.price - a.price; });
                break;
            case 'rating':
                copy.sort(function (a, b) { return b.rating - a.rating || b.reviewCount - a.reviewCount; });
                break;
            case 'discount':
                copy.sort(function (a, b) { return b.discountPct - a.discountPct; });
                break;
            case 'new':
                copy.sort(function (a, b) { return (b.tags.indexOf('new') !== -1) - (a.tags.indexOf('new') !== -1); });
                break;
            default:
                copy.sort(function (a, b) {
                    var score = b.rating * 10 + b.discountPct;
                    var other = a.rating * 10 + a.discountPct;
                    return score - other;
                });
        }
        return copy;
    }

    function hasFilters(query) {
        return !!(query.cat || query.brand || query.pr || query.rate || query.stock || query.sale || query.q);
    }

    function slideList(settings) {
        var slides = (settings && settings.heroSlides) || [];
        return slides.filter(function (sl) {
            return sl && String(sl.image || '').trim();
        }).map(function (sl) {
            return { image: String(sl.image || '').trim() };
        });
    }

    function heroSection(settings) {
        var slides = slideList(settings);
        return slides.length ? carouselMarkup(slides) : '';
    }

    function carouselMarkup(slides) {
        var track = slides.map(function (sl, i) {
            return '<div class="hero-slide' + (i === 0 ? ' active' : '') + '">' +
                '<img src="' + NC.ui.esc(sl.image) + '" alt="Featured ' + (i + 1) +
                '" loading="' + (i === 0 ? 'eager' : 'lazy') + '" onerror="this.style.display=\'none\'">' +
                '</div>';
        }).join('');

        var dots = slides.length > 1 ? slides.map(function (sl, i) {
            return '<button class="hero-dot' + (i === 0 ? ' active' : '') + '" type="button" data-hero-dot="' + i +
                '" aria-label="Go to slide ' + (i + 1) + '"></button>';
        }).join('') : '';

        var arrows = slides.length > 1
            ? '<button class="hero-arrow prev" type="button" data-hero-prev aria-label="Previous slide">' + NC.ui.icon('i-chevron-left') + '</button>' +
              '<button class="hero-arrow next" type="button" data-hero-next aria-label="Next slide">' + NC.ui.icon('i-chevron-right') + '</button>'
            : '';

        return '<section class="hero-carousel" data-hero aria-roledescription="carousel" aria-label="Featured">' +
            '<div class="hero-track" data-hero-track>' + track + '</div>' +
            arrows +
            (dots ? '<div class="hero-dots" data-hero-dots>' + dots + '</div>' : '') +
            '</section>';
    }

    function heroSlides() {
        if (!els.hero) return [];
        return Array.prototype.slice.call(els.hero.querySelectorAll('.hero-slide'));
    }

    function heroShow(index) {
        var slides = heroSlides();
        if (!slides.length) return;
        heroIndex = (index + slides.length) % slides.length;
        if (els.track) els.track.style.transform = 'translateX(' + (-heroIndex * 100) + '%)';
        slides.forEach(function (slide, i) {
            slide.classList.toggle('active', i === heroIndex);
        });
        Array.prototype.slice.call(els.hero.querySelectorAll('.hero-dot')).forEach(function (dot, i) {
            dot.classList.toggle('active', i === heroIndex);
            if (i === heroIndex) dot.setAttribute('aria-current', 'true');
            else dot.removeAttribute('aria-current');
        });
    }

    function heroNext() { heroShow(heroIndex + 1); }
    function heroPrev() { heroShow(heroIndex - 1); }

    function stopHero() {
        if (heroTimer) { clearInterval(heroTimer); heroTimer = null; }
    }

    function startHero() {
        stopHero();
        if (heroSlides().length < 2) return;
        heroTimer = setInterval(function () {
            if (document.hidden) return;
            heroNext();
        }, HERO_DELAY);
    }

    function bindHero(view) {
        els.hero = view.querySelector('[data-hero]');
        if (!els.hero) { stopHero(); return; }
        els.track = els.hero.querySelector('[data-hero-track]');
        heroIndex = 0;
        heroShow(0);

        els.hero.addEventListener('click', function (e) {
            var dot = e.target.closest('[data-hero-dots] .hero-dot');
            if (dot) {
                heroShow(Array.prototype.slice.call(els.hero.querySelectorAll('.hero-dot')).indexOf(dot));
                startHero();
                return;
            }
            if (e.target.closest('[data-hero-prev]')) { heroPrev(); startHero(); }
            else if (e.target.closest('[data-hero-next]')) { heroNext(); startHero(); }
        });

        els.hero.addEventListener('mouseenter', stopHero);
        els.hero.addEventListener('mouseleave', startHero);

        var startX = null;
        els.hero.addEventListener('touchstart', function (e) {
            startX = e.touches[0].clientX;
            stopHero();
        }, { passive: true });
        els.hero.addEventListener('touchend', function (e) {
            if (startX == null) return;
            var dx = e.changedTouches[0].clientX - startX;
            if (Math.abs(dx) > 40) { if (dx < 0) heroNext(); else heroPrev(); }
            startX = null;
            startHero();
        });

        startHero();
    }

    function shell() {
        var cats = NC.data.categories();
        var brands = NC.data.brands.slice().sort();
        var s = NC.settings || {};

        var chips = '<button class="chip active" type="button" data-action="chip" data-cat="">' +
            NC.ui.icon('i-grid') + 'All' + '<span class="chip-count">' + NC.data.products.length + '</span></button>' +
            cats.map(function (c) {
                return '<button class="chip" type="button" data-action="chip" data-cat="' + c.slug + '">' +
                    NC.ui.icon(c.icon) + NC.ui.esc(c.name) +
                    '<span class="chip-count">' + c.count + '</span></button>';
            }).join('');

        var priceChecks = PRICE_BUCKETS.map(function (b) {
            return '<label class="filter-check"><input type="checkbox" data-filter="pr" value="' + b.id + '">' +
                '<span>' + NC.ui.esc(b.label) + '</span></label>';
        }).join('');

        var brandChecks = brands.map(function (b) {
            return '<label class="filter-check"><input type="checkbox" data-filter="brand" value="' + NC.ui.esc(b) + '">' +
                '<span>' + NC.ui.esc(b) + '</span></label>';
        }).join('');

        var rateChecks = RATE_OPTIONS.map(function (r) {
            return '<label class="filter-check"><input type="radio" name="rate" data-filter="rate" value="' + r.id + '">' +
                '<span>' + NC.ui.esc(r.label) + '</span></label>';
        }).join('');

        return '' +
            heroSection(s) +

            '<section id="categoriesSection">' +
            '<div class="section-head"><h2 class="section-title">' + NC.ui.icon('i-grid') + 'Shop by category</h2>' +
            '<a class="section-link" href="#/categories">View all ' + NC.ui.icon('i-arrow-right') + '</a></div>' +
            '<div class="chip-row" data-chips>' + chips + '</div>' +
            '</section>' +

            '<section>' +
            '<div class="section-head"><h2 class="section-title" data-results-title>All products</h2>' +
            '<span class="toolbar-count" data-results-count></span></div>' +

            '<div class="catalog-layout">' +
            '<aside class="filters" data-filters aria-label="Product filters">' +
            '<div class="filters-mobile-head">' +
            '<span class="drawer-title">Filters</span>' +
            '<button class="icon-btn" type="button" data-action="toggle-filters" aria-label="Close filters">' +
            NC.ui.icon('i-close') + '</button>' +
            '</div>' +
            '<div class="filter-group">' +
            '<h4>Category</h4><div class="filter-list">' +
            cats.map(function (c) {
                return '<label class="filter-check"><input type="checkbox" data-filter="cat" value="' + c.slug + '">' +
                    '<span>' + NC.ui.esc(c.name) + '</span><span class="n">' + c.count + '</span></label>';
            }).join('') +
            '</div></div>' +

            '<div class="filter-group"><h4>Price</h4><div class="filter-list">' + priceChecks + '</div></div>' +

            '<div class="filter-group"><h4>Rating</h4><div class="filter-list">' + rateChecks + '</div></div>' +

            '<div class="filter-group"><h4>Availability</h4><div class="filter-list">' +
            '<label class="filter-check"><input type="checkbox" data-filter="stock" value="1"><span>In stock only</span></label>' +
            '<label class="filter-check"><input type="checkbox" data-filter="sale" value="1"><span>On sale (20%+ off)</span></label>' +
            '</div></div>' +

            '<div class="filter-group"><h4>Brand</h4><div class="filter-list" style="max-height:190px;overflow-y:auto">' +
            brandChecks + '</div></div>' +

            '<button class="btn btn-outline btn-block" type="button" data-action="clear-filters">Clear all filters</button>' +
            '</aside>' +

            '<div>' +
            '<div class="toolbar" style="margin-bottom:1rem">' +
            '<button class="btn btn-outline btn-sm filter-toggle" type="button" data-action="toggle-filters">' +
            NC.ui.icon('i-sliders') + 'Filters</button>' +
            '<div class="select"><select data-sort aria-label="Sort products">' +
            SORTS.map(function (s) {
                return '<option value="' + s.id + '">' + s.label + '</option>';
            }).join('') +
            '</select>' + NC.ui.icon('i-chevron-down') + '</div>' +
            '<div class="toolbar-spacer"></div>' +
            '<div class="active-filters" data-active-filters></div>' +
            '</div>' +
            '<div data-results></div>' +
            '</div>' +
            '</div>' +
            '</section>' +

            '<section data-discover></section>';
    }

    function cacheEls(view) {
        els = {
            chips: view.querySelector('[data-chips]'),
            results: view.querySelector('[data-results]'),
            count: view.querySelector('[data-results-count]'),
            title: view.querySelector('[data-results-title]'),
            filters: view.querySelector('[data-filters]'),
            sort: view.querySelector('[data-sort]'),
            active: view.querySelector('[data-active-filters]'),
            discover: view.querySelector('[data-discover]')
        };
    }

    function tag(label, patch) {
        var payload = JSON.stringify(patch).replace(/"/g, '&quot;');
        return '<button class="filter-tag" type="button" data-action="remove-filter" data-patch="' + payload + '">' +
            NC.ui.esc(label) + NC.ui.icon('i-close') + '</button>';
    }

    function renderActiveFilters(query) {
        if (!els.active) return;
        var tags = [];

        if (query.q) tags.push(tag('“' + query.q + '”', { q: null }));

        list(query.cat).forEach(function (slug) {
            var name = slug;
            NC.data.categories().forEach(function (c) { if (c.slug === slug) name = c.name; });
            tags.push(tag(name, { cat: without(query.cat, slug) }));
        });

        list(query.brand).forEach(function (b) {
            tags.push(tag(b, { brand: without(query.brand, b) }));
        });

        list(query.pr).forEach(function (id) {
            var b = bucketFor(id);
            tags.push(tag(b ? b.label : id, { pr: without(query.pr, id) }));
        });

        if (query.rate) {
            var r = null;
            RATE_OPTIONS.forEach(function (o) { if (o.id === query.rate) r = o; });
            tags.push(tag(r ? r.label + ' stars' : query.rate, { rate: null }));
        }

        if (query.stock === '1') tags.push(tag('In stock', { stock: null }));
        if (query.sale === '1') tags.push(tag('On sale', { sale: null }));

        if (tags.length > 1) {
            tags.push('<button class="btn btn-ghost btn-sm" type="button" data-action="clear-filters">Clear all</button>');
        }

        els.active.innerHTML = tags.join('');
    }

    function without(value, item) {
        return list(value).filter(function (v) { return v !== item; }).join(',') || null;
    }

    function syncControls(query) {
        if (els.sort) els.sort.value = query.sort || 'featured';

        document.querySelectorAll('#view [data-filter]').forEach(function (input) {
            var key = input.getAttribute('data-filter');
            if (key === 'rate') {
                input.checked = (query.rate || '') === input.value;
            } else if (key === 'stock' || key === 'sale') {
                input.checked = query[key] === '1';
            } else {
                input.checked = list(query[key]).indexOf(input.value) !== -1;
            }
        });

        if (els.chips) {
            var cats = list(query.cat);
            els.chips.querySelectorAll('.chip').forEach(function (chip) {
                var slug = chip.getAttribute('data-cat');
                chip.classList.toggle('active', slug === '' ? cats.length === 0 : cats.indexOf(slug) !== -1);
            });
        }
    }

    function titleFor(query) {
        if (query.q) return 'Results for “' + query.q + '”';
        if (query.cat) {
            var names = [];
            list(query.cat).forEach(function (slug) {
                NC.data.categories().forEach(function (c) { if (c.slug === slug) names.push(c.name); });
            });
            if (names.length) return names.join(' + ');
        }
        return 'All products';
    }

    function renderDiscover(query) {
        if (!els.discover) return;
        if (hasFilters(query)) {
            els.discover.innerHTML = '';
            return;
        }

        var trending = NC.data.products
            .slice()
            .sort(function (a, b) { return b.reviewCount - a.reviewCount; })
            .slice(0, 4);

        var deals = NC.data.products
            .filter(function (p) { return p.discountPct >= 30; })
            .sort(function (a, b) { return b.discountPct - a.discountPct; })
            .slice(0, 4);

        var recent = NC.store.getRecent();

        var out = '<div class="section-head"><h2 class="section-title">' + NC.ui.icon('i-bolt') + 'Trending now</h2>' +
            '<a class="section-link" href="#/?sort=rating">See all ' + NC.ui.icon('i-arrow-right') + '</a></div>' +
            NC.ui.grid(trending) +
            '<div class="section-head" style="margin-top:2.5rem"><h2 class="section-title">' + NC.ui.icon('i-tag') +
            'Biggest discounts</h2><a class="section-link" href="#/?sale=1">See all ' + NC.ui.icon('i-arrow-right') + '</a></div>' +
            NC.ui.grid(deals);

        if (recent.length >= 2) {
            out += '<div class="section-head" style="margin-top:2.5rem"><h2 class="section-title">' +
                NC.ui.icon('i-refresh') + 'Recently viewed</h2></div>' + NC.ui.grid(recent.slice(0, 4));
        }

        els.discover.innerHTML = out;
    }

    function paint(query) {
        var filtered = applySort(applyFilters(NC.data.products, query), query.sort || 'featured');

        syncControls(query);
        renderActiveFilters(query);

        if (els.title) els.title.textContent = titleFor(query);
        if (els.count) {
            els.count.textContent = filtered.length + (filtered.length === 1 ? ' product' : ' products');
        }

        if (!filtered.length) {
            els.results.innerHTML = NC.ui.emptyState({
                icon: 'i-search',
                title: 'No products match those filters',
                text: 'Try removing a filter, widening the price range, or searching for something else.',
                actionHref: '#/',
                actionLabel: 'Clear all filters'
            });
        } else {
            els.results.innerHTML = NC.ui.grid(filtered);
        }

        renderDiscover(query);
    }

    function render(view, query) {
        if (view.dataset.page !== 'home') {
            view.dataset.page = 'home';
            view.innerHTML = '<div class="page">' + shell() + '</div>';
            cacheEls(view);
            bind(view);
            bindHero(view);
        }
        paint(query);
    }

    function bind(view) {
        view.addEventListener('click', function (e) {
            var actionEl = e.target.closest('[data-action]');
            if (!actionEl) return;
            var action = actionEl.getAttribute('data-action');

            if (action === 'chip') {
                var slug = actionEl.getAttribute('data-cat');
                NC.router.setQuery({ cat: slug || null });
                return;
            }

            if (action === 'toggle-filters') {
                var isOpen = els.filters.classList.toggle('open');
                var scrim = document.querySelector('[data-scrim]');
                if (scrim) {
                    scrim.hidden = !isOpen;
                    if (isOpen) {
                        requestAnimationFrame(function () { scrim.classList.add('show'); });
                        document.body.classList.add('no-scroll');
                    } else {
                        scrim.classList.remove('show');
                        document.body.classList.remove('no-scroll');
                    }
                }
                return;
            }

            if (action === 'clear-filters') {
                NC.router.setQuery({ cat: null, brand: null, pr: null, rate: null, stock: null, sale: null, q: null });
                return;
            }

            if (action === 'remove-filter') {
                var patch = JSON.parse(actionEl.getAttribute('data-patch'));
                NC.router.setQuery(patch);
            }
        });

        view.addEventListener('change', function (e) {
            var input = e.target.closest('[data-filter]');
            if (!input) return;
            var key = input.getAttribute('data-filter');

            if (key === 'rate') {
                NC.router.setQuery({ rate: input.value || null });
                return;
            }
            if (key === 'stock' || key === 'sale') {
                var flag = {};
                flag[key] = input.checked ? '1' : null;
                NC.router.setQuery(flag);
                return;
            }

            var current = list(NC.router.parse().query[key]);
            var next;
            if (input.checked) {
                if (current.indexOf(input.value) === -1) current.push(input.value);
            } else {
                current = current.filter(function (v) { return v !== input.value; });
            }
            var patch = {};
            patch[key] = current.join(',') || null;
            NC.router.setQuery(patch);
        });

        view.addEventListener('change', function (e) {
            if (!e.target.matches('[data-sort]')) return;
            NC.router.setQuery({ sort: e.target.value === 'featured' ? null : e.target.value });
        });
    }

NC.views = NC.views || {};
NC.views.home = { render: render, filters: applyFilters, sort: applySort, buckets: PRICE_BUCKETS };
NC.router.add('/', render);
NC.router.on(function (parsed) {
    if (parsed.path !== '/') stopHero();
});
})();