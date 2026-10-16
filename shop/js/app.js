(function () {
    'use strict';

    var searchInput;
    var searchField;
    var suggestBox;
    var header;
    var clearBtn;
    var lastFocusPath = null;

    function boot() {
        searchInput = document.getElementById('searchInput');
        searchField = searchInput ? searchInput.closest('.search-field') : null;
        clearBtn = document.querySelector('[data-action="clear-search"]');
        header = document.getElementById('siteHeader');

        var backendReady = (NC.backend && NC.backend.bootstrapStore)
            ? NC.backend.bootstrapStore()
            : null;

        NC.store.init();
        document.documentElement.setAttribute('data-theme', NC.store.getTheme());
        if (NC.reviews) NC.reviews.init();

        NC.ui.bindGlobal();

        NC.ban = { enforce: enforceBan, block: blockBan };

        var authReady = Promise.resolve();
        if (NC.auth) {
            NC.auth.bindGlobal();
            NC.auth.onChange(paintAccount);
            authReady = NC.auth.init() || Promise.resolve();
        }
        paintAccount();
        buildMenus();
        bindSearch();
        bindScroll();
        bindNetwork();
        stampYear();
        initPwa();

        NC.router.on(onRoute);
        NC.router.start();
        firstVisitGate();

        if (backendReady) {
            backendReady
                .then(function () { return authReady.catch(function () { }); })
                .then(function () { return enforceBan(); })
                .then(function (banned) {
                    if (banned) return;
                    NC.store.init();
                    if (NC.reviews) NC.reviews.apply();
                    buildMenus();
                    NC.ui.updateBadges();
                    NC.ui.renderCartDrawer();
                    var view = document.getElementById('view');
                    if (view) view.dataset.page = '';
                    NC.router.render();
                });
        } else {
            authReady.then(function () { return enforceBan(); });
        }

        registerServiceWorker();
    }

    // Block a visitor whose IP, account id or mobile appears in the ban list.
    function enforceBan() {
        if (!NC.backend || !NC.backend.checkBan) return Promise.resolve(false);
        return NC.backend.getVisitorIp().then(function (ip) {
            window.__ncVisitorIp = ip || '';
            var snap = (NC.auth && NC.auth.snapshot) ? NC.auth.snapshot() : null;
            var user = snap && snap.user;
            if (user && ip && NC.backend.setUserLastIp) NC.backend.setUserLastIp(user.id, ip);
            return NC.backend.checkBan(ip, user && user.id, user && user.phone);
        }).then(function (ban) {
            if (ban) { blockBan(ban); return true; }
            return false;
        }).catch(function () { return false; });
    }

    function blockBan(ban) {
        if (!document.body || document.getElementById('banScreen')) return;
        var screen = document.createElement('div');
        screen.id = 'banScreen';
        screen.className = 'ban-screen';
        var reason = (ban && ban.reason)
            ? '<p class="ban-reason">Reason: ' + escBan(ban.reason) + '</p>'
            : '';
        screen.innerHTML =
            '<div class="ban-card">' +
            '<span class="ban-badge">' + (NC.ui && NC.ui.icon ? NC.ui.icon('i-shield') : '') + '</span>' +
            '<h1>Access blocked</h1>' +
            '<p>Your access to this store has been suspended by the store owner.</p>' +
            reason +
            '<p class="ban-contact">If you think this is a mistake, please contact support.</p>' +
            '</div>';
        document.body.appendChild(screen);
        document.body.classList.add('is-banned');
    }

    function escBan(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function paintAccount() {
        if (!NC.auth) return;
        var snap = NC.auth.snapshot();
        var user = snap && snap.user;
        var label = user
            ? ((snap.profile && snap.profile.name) || user.phone || user.email || 'Your account')
            : 'Sign in';

        document.querySelectorAll('[data-account-menu-label]').forEach(function (el) {
            el.textContent = label;
        });
        document.querySelectorAll('[data-action="open-account"]').forEach(function (el) {
            el.setAttribute('aria-label', user ? 'Your account' : 'Sign in');
        });
    }

    function firstVisitGate() {
        try {
            if (localStorage.getItem('novacart_auth_seen')) return;
            localStorage.setItem('novacart_auth_seen', '1');
        } catch (e) { }
        if (!NC.auth || NC.auth.isSignedIn()) return;
        setTimeout(function () { NC.auth.open('signin'); }, 700);
    }

    function buildMenus() {
        var cats = NC.data.categories();
        var menu = document.querySelector('[data-category-menu]');
        var footer = document.querySelector('[data-footer-categories]');

        if (menu) {
            menu.innerHTML = cats.map(function (c) {
                return '<li><a href="#/?cat=' + c.slug + '" data-action="close-nav">' + NC.ui.icon(c.icon) + NC.ui.esc(c.name) +
                    '<span class="menu-cat-count">' + c.count + '</span></a></li>';
            }).join('');
        }

        if (footer) {
            footer.innerHTML = cats.map(function (c) {
                return '<li><a href="#/?cat=' + c.slug + '">' + NC.ui.esc(c.name) + '</a></li>';
            }).join('');
        }
    }

    function stampYear() {
        document.querySelectorAll('[data-year]').forEach(function (el) {
            el.textContent = new Date().getFullYear();
        });
    }

    function hideSuggestions() {
        if (suggestBox && suggestBox.parentNode) suggestBox.parentNode.removeChild(suggestBox);
        suggestBox = null;
    }

    function showSuggestions(matches, query) {
        hideSuggestions();
        if (!searchField || !searchField.parentNode) return;
        if (!query) return;

        suggestBox = document.createElement('div');
        suggestBox.className = 'suggest-box';
        suggestBox.setAttribute('role', 'listbox');

        if (!matches.length) {
            suggestBox.innerHTML = '<p class="suggest-empty">No products match “' + NC.ui.esc(query) + '”</p>';
        } else {
            suggestBox.innerHTML = matches.slice(0, 6).map(function (p) {
                return '<a class="suggest-item" role="option" href="#/product/' + p.id + '" data-suggest="' + p.id + '">' +
                    '<img src="' + NC.ui.esc(p.images[0]) + '" alt="" loading="lazy" onerror="NC.ui.imgError(this)">' +
                    '<span><span class="suggest-name">' + NC.ui.esc(p.name) + '</span>' +
                    '<span class="suggest-meta">' + NC.ui.esc(p.brand) + ' · ' + NC.ui.esc(p.category) + '</span></span>' +
                    '<strong style="margin-left:auto;font-size:.86rem">' + NC.ui.money(p.price) + '</strong>' +
                    '</a>';
            }).join('') +
                '<a class="suggest-item" role="option" href="#/?q=' + encodeURIComponent(query) + '" data-suggest-all="1">' +
                '<span style="width:42px"></span>' +
                '<span class="suggest-name">See all results for “' + NC.ui.esc(query) + '”</span>' +
                NC.ui.icon('i-arrow-right') + '</a>';
        }

        searchField.parentNode.appendChild(suggestBox);
    }

    function commitSearch(query) {
        hideSuggestions();
        var parsed = NC.router.current();
        if (parsed.path === '/') {
            NC.router.setQuery({ q: query || null });
        } else {
            NC.router.go(query ? '/?q=' + encodeURIComponent(query) : '/');
        }
    }

    function bindSearch() {
        if (!searchInput) return;

        var liveSearch = NC.ui.debounce(function () {
            var query = searchInput.value.trim();
            if (clearBtn) clearBtn.hidden = !searchInput.value;

            if (!query) {
                showSuggestions([], '');
                if (NC.router.current().path === '/' && NC.router.current().query.q) {
                    NC.router.setQuery({ q: null });
                }
                return;
            }

            var matches = NC.data.search(query);
            showSuggestions(matches, query);

            if (NC.router.current().path === '/') {
                NC.router.setQuery({ q: query });
            }
        }, 240);

        searchInput.addEventListener('input', liveSearch);

        searchInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                commitSearch(searchInput.value.trim());
                searchInput.blur();
            } else if (e.key === 'Escape') {
                hideSuggestions();
                searchInput.blur();
            }
        });

        searchInput.addEventListener('focus', function () {
            var query = searchInput.value.trim();
            if (query) showSuggestions(NC.data.search(query), query);
        });

        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                searchInput.value = '';
                clearBtn.hidden = true;
                commitSearch('');
                searchInput.focus();
            });
        }

        document.addEventListener('click', function (e) {
            if (suggestBox && !suggestBox.contains(e.target) && e.target !== searchInput) {
                hideSuggestions();
            }
            if (suggestBox && e.target.closest('[data-suggest], [data-suggest-all]')) {
                hideSuggestions();
                searchInput.blur();
            }
        });

        document.addEventListener('click', function (e) {
            var focusBtn = e.target.closest('[data-action="focus-search"]');
            if (!focusBtn) return;
            searchInput.focus();
            searchInput.select();
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === '/' && document.activeElement !== searchInput) {
                var tag = (document.activeElement && document.activeElement.tagName) || '';
                if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
                e.preventDefault();
                searchInput.focus();
            }
        });
    }

    function bindScroll() {
        if (!header) return;
        var onScroll = function () {
            header.classList.toggle('scrolled', window.scrollY > 6);
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }

    function bindNetwork() {
        var hint = document.querySelector('[data-offline-hint]');

        function paint(online) {
            if (hint) hint.hidden = online;
        }

        paint(navigator.onLine);

        window.addEventListener('online', function () {
            paint(true);
            NC.ui.toast('Back online', 'success');
        });

        window.addEventListener('offline', function () {
            paint(false);
            NC.ui.toast('You are offline — browsing saved items', 'info');
        });
    }

    function updateTabbar(path) {
        var active = path === '/' ? 'home' : (path === '/categories' ? 'categories' : (path === '/wishlist' ? 'saved' : null));
        document.querySelectorAll('.tabbar .tab').forEach(function (tab) {
            var label = (tab.querySelector('span') || {}).textContent || '';
            var match = (active === 'home' && label === 'Home') ||
                (active === 'categories' && label === 'Categories') ||
                (active === 'saved' && label === 'Saved');
            tab.classList.toggle('active', !!match);
        });
    }

    function onRoute(parsed) {
        if (searchInput && document.activeElement !== searchInput) {
            var q = parsed.query.q || '';
            if (searchInput.value !== q) searchInput.value = q;
            if (clearBtn) clearBtn.hidden = !q;
        }
        if (lastFocusPath !== null && lastFocusPath !== parsed.raw) {
            NC.ui.closeDrawer(true);
        }
        lastFocusPath = parsed.raw;

        var cat = (parsed.query.cat || '').split(',')[0];
        document.querySelectorAll('[data-category-menu] a').forEach(function (a) {
            a.classList.toggle('active', parsed.path === '/' && a.getAttribute('href') === '#/?cat=' + cat);
        });

        updateTabbar(parsed.path);
    }

    function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) return;
        if (location.protocol === 'file:') return;

        window.addEventListener('load', function () {
            navigator.serviceWorker.register('sw.js').then(function (reg) {
                reg.addEventListener('updatefound', function () {
                    var sw = reg.installing;
                    if (!sw) return;
                    sw.addEventListener('statechange', function () {
                        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
                            NC.ui.toast('Update available — refresh to apply', 'info', 5000);
                        }
                    });
                });
            }).catch(function (err) {
                console.warn('[app] service worker registration failed', err);
            });
        });
    }

    function initPwa() {
        if (window.deferredInstallPrompt) {
            updateInstallButton(true, false);
        }

        window.addEventListener('beforeinstallprompt', function (e) {
            e.preventDefault();
            window.deferredInstallPrompt = e;
            updateInstallButton(true, false);
        });

        window.addEventListener('pwaready', function () {
            updateInstallButton(true, false);
        });

        window.addEventListener('appinstalled', function () {
            window.deferredInstallPrompt = null;
            updateInstallButton(false, true);
            NC.ui.toast('App installed successfully! Enjoy shopping on ' + ((NC.settings && NC.settings.storeName) || 'DolphinMore') + '.', 'success');
        });

        NC.pwa = {
            install: handlePwaInstall,
            isInstalled: isStandalone,
            openPopup: openInstallPopup,
            closePopup: closeInstallPopup
        };

        if (isStandalone()) {
            updateInstallButton(false, true);
        }

        // If the app is not installed, show the install popup shortly after
        // landing (once per session).
        scheduleAutoInstallPrompt();
    }

    function scheduleAutoInstallPrompt() {
        if (isStandalone()) return;
        var KEY = 'nc_pwa_autoprompt';
        try { if (sessionStorage.getItem(KEY)) return; } catch (e) { /* ignore */ }
        setTimeout(function () {
            if (isStandalone()) return;
            try {
                if (sessionStorage.getItem(KEY)) return;
                sessionStorage.setItem(KEY, '1');
            } catch (e) { /* ignore */ }
            openInstallPopup();
        }, 5000);
    }

    function openInstallPopup() {
        var modal = document.getElementById('installApkModal');
        if (!modal || !modal.hidden) return;
        if (isStandalone()) return;
        NC.ui.closeDrawer();
        var name = (NC.settings && NC.settings.storeName) || 'NovaCart';
        var titleEl = modal.querySelector('.play-app-name');
        if (titleEl) titleEl.textContent = name;
        modal.hidden = false;
        document.body.classList.add('no-scroll');
        var go = modal.querySelector('.install-go');
        if (go) go.focus();
    }

    function closeInstallPopup() {
        var modal = document.getElementById('installApkModal');
        if (!modal) return;
        modal.hidden = true;
        var authOpen = document.getElementById('authModal') && !document.getElementById('authModal').hidden;
        var checkoutOpen = document.getElementById('checkoutModal') && !document.getElementById('checkoutModal').hidden;
        if (!authOpen && !checkoutOpen) {
            document.body.classList.remove('no-scroll');
        }
    }

    function isStandalone() {
        return window.matchMedia('(display-mode: standalone)').matches ||
            window.navigator.standalone === true;
    }

    function isIos() {
        return /iPhone|iPad|iPod/i.test(navigator.userAgent) && !window.MSStream;
    }

    function updateInstallButton(ready, installed) {
        var badge = document.querySelector('.pwa-install-badge span');
        if (!badge) return;
        if (installed || isStandalone()) {
            badge.textContent = 'Installed';
            var btn = document.querySelector('.pwa-install-btn');
            if (btn) btn.classList.add('is-installed');
        } else if (ready) {
            badge.textContent = 'Install';
        }
    }

    function handlePwaInstall() {
        NC.ui.closeDrawer();

        if (isStandalone()) {
            NC.ui.toast('App is already installed on your device!', 'info');
            return;
        }

        var promptEvent = window.deferredInstallPrompt;
        if (promptEvent) {
            promptEvent.prompt().then(function () {
                return promptEvent.userChoice;
            }).then(function (choice) {
                if (choice && choice.outcome === 'accepted') {
                    NC.ui.toast('Installing app to your device...', 'success');
                    updateInstallButton(false, true);
                }
                window.deferredInstallPrompt = null;
            }).catch(function (err) {
                console.warn('[pwa] install error', err);
            });
            return;
        }

        if (isIos()) {
            NC.ui.toast('Tap Safari Share (⬆) and select "Add to Home Screen" to install', 'info', 5000);
            return;
        }

        NC.ui.toast('Tap your browser menu (⋮) and select "Install app" or "Add to Home screen"', 'info', 5000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();