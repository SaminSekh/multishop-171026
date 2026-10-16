(function () {
    'use strict';

    var routes = [];
    var listeners = [];
    var currentPath = null;
    var currentRoute = null;
    var redirecting = false;

    function parseHash() {
        var raw = String(window.location.hash || '').replace(/^#/, '');
        if (!raw) raw = '/';
        var qIndex = raw.indexOf('?');
        var path = qIndex === -1 ? raw : raw.slice(0, qIndex);
        var queryStr = qIndex === -1 ? '' : raw.slice(qIndex + 1);
        var query = {};
        new URLSearchParams(queryStr).forEach(function (value, key) {
            if (query[key] === undefined) query[key] = value;
        });
        if (path.length > 1 && path.slice(-1) === '/') path = path.slice(0, -1);
        return { path: path || '/', query: query, raw: raw };
    }

    function match(path) {
        for (var i = 0; i < routes.length; i++) {
            var r = routes[i];
            if (r.pattern === path) return { route: r, params: {} };
            var names = [];
            var regexSource = r.pattern
                .replace(/[.+^${}()|[\]\\]/g, '\\$&')
                .replace(/:(\w+)/g, function (_, name) {
                    names.push(name);
                    return '([^/]+)';
                });
            var regex = new RegExp('^' + regexSource + '$');
            var m = regex.exec(path);
            if (m) {
                var params = {};
                names.forEach(function (name, idx) {
                    params[name] = decodeURIComponent(m[idx + 1]);
                });
                return { route: r, params: params };
            }
        }
        return null;
    }

    function render() {
        var parsed = parseHash();
        var hit = match(parsed.path);
        var view = document.getElementById('view');

        if (!hit) {
            if (redirecting || parsed.path === '/') {
                view.innerHTML = NC.ui.emptyState({
                    icon: 'i-info',
                    title: 'Page not found',
                    text: 'That link does not lead anywhere in this store.',
                    actionHref: '#/',
                    actionLabel: 'Back to shop'
                });
                return;
            }
            redirecting = true;
            NC.router.go('/', true);
            redirecting = false;
            return;
        }

        var sameRoute = currentPath === parsed.path;
        currentPath = parsed.path;
        currentRoute = parsed;

        var scrollY = window.scrollY;
        if (!sameRoute && view) view.dataset.page = '';

        try {
            hit.route.render(view, parsed.query, hit.params);
        } catch (err) {
            console.error('[router] render failed for ' + parsed.path, err);
            view.innerHTML = NC.ui.emptyState({
                icon: 'i-info',
                title: 'Something went wrong',
                text: 'We could not load this page. Try going back to the shop.',
                actionHref: '#/',
                actionLabel: 'Back to shop'
            });
        }

        listeners.forEach(function (fn) {
            try {
                fn(parsed, hit.params);
            } catch (e) {
                console.error('[router] listener failed', e);
            }
        });

        if (sameRoute) {
            window.scrollTo(0, scrollY);
        } else {
            window.scrollTo(0, 0);
            view.focus({ preventScroll: true });
        }
    }

    function go(path, replace) {
        var target = '#' + (path.charAt(0) === '/' ? path : '/' + path);
        if (window.location.hash === target) {
            render();
            return;
        }
        if (replace && window.history.replaceState) {
            window.history.replaceState(null, '', target);
            render();
        } else {
            window.location.hash = target;
        }
    }

    function setQuery(patch, opts) {
        opts = opts || {};
        var parsed = parseHash();
        var query = {};
        Object.keys(parsed.query).forEach(function (k) { query[k] = parsed.query[k]; });
        Object.keys(patch || {}).forEach(function (k) {
            var v = patch[k];
            if (v === null || v === undefined || v === '' || v === 'all') {
                delete query[k];
            } else {
                query[k] = v;
            }
        });

        var qs = new URLSearchParams(query).toString();
        var target = '#' + parsed.path + (qs ? '?' + qs : '');
        var samePath = true;

        if (window.history.replaceState && opts.replace !== false) {
            window.history.replaceState(null, '', target);
            render();
        } else if (window.location.hash === target) {
            render();
        } else {
            window.location.hash = target;
            samePath = false;
        }
        return samePath;
    }

    function current() {
        return currentRoute || parseHash();
    }

    function add(pattern, renderFn) {
        routes.push({ pattern: pattern, render: renderFn });
    }

    function on(fn) {
        listeners.push(fn);
    }

    function start() {
        window.addEventListener('hashchange', render);
        if (!window.location.hash) {
            window.history.replaceState(null, '', '#/');
        }
        render();
    }

    NC.router = {
        add: add,
        start: start,
        go: go,
        setQuery: setQuery,
        current: current,
        parse: parseHash,
        on: on,
        render: render
    };
})();