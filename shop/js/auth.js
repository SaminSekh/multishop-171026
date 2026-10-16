/* ============================================================
   NovaCart — accounts & sign-in
   Mobile number + password accounts backed by the store's own
   "users" table (Supabase when configured, otherwise a local,
   browser-only store). Passwords are stored in plain text so the
   admin panel can view and change them — convenient but not secure.
   Exposes: NC.auth
   ============================================================ */
(function () {
    'use strict';

    var cfg = (window.NC_CONFIG || {});
    var authCfg = cfg.auth || {};
    var LOCAL_DOMAIN = authCfg.domain || 'phone.novacart.local';

    var KEYS = {
        accounts: 'novacart_accounts',
        session: 'novacart_session',
        profile: 'novacart_profile_',
        seen: 'novacart_auth_seen'
    };

    var listeners = [];
    var pendingAfter = null;
    var visitTracked = {};

    var state = {
        ready: false,
        user: null,
        session: null,
        profile: blankProfile()
    };

    var ui = { tab: 'signin', busy: false, error: '' };

    /* ---------------- helpers ---------------- */

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function $(sel, root) { return (root || document).querySelector(sel); }
    function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

    function digits(value) { return String(value == null ? '' : value).replace(/\D/g, ''); }

    function isPhone(value) {
        return /^[6-9]\d{9}$/.test(digits(value));
    }

    // Kept for backwards compatibility with callers that only stored a phone.
    function emailForPhone(phone) {
        return digits(phone) + '@' + LOCAL_DOMAIN;
    }

    function blankProfile() {
        return { name: '', phone: '', email: '', addresses: [] };
    }

    function dedupeAddresses(list) {
        if (!Array.isArray(list)) return [];
        var seen = {};
        var out = [];
        list.forEach(function (a) {
            if (!a || typeof a !== 'object') return;
            var key = [a.line1, a.line2, a.city, a.state, a.pincode].map(function (v) {
                return String(v == null ? '' : v).trim().toLowerCase();
            }).join('|');
            if (seen[key]) return;
            seen[key] = true;
            out.push(a);
        });
        return out;
    }

    function uid() {
        return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function read(key, fallback) {
        try {
            var raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (e) {
            return fallback;
        }
    }

    function write(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { }
    }

    function remove(key) {
        try { localStorage.removeItem(key); } catch (e) { }
    }

    function backend() { return NC.backend; }

    function cloudEnabled() {
        return !!(backend() && backend().isConfigured && backend().isConfigured());
    }

    function emit(reason) {
        listeners.forEach(function (fn) {
            try { fn(reason, snapshot()); } catch (e) { console.error('[auth] listener failed', e); }
        });
    }

    function snapshot() {
        return {
            ready: state.ready,
            user: state.user,
            profile: state.profile,
            provider: cloudEnabled() ? 'supabase' : 'local'
        };
    }

    /* ---------------- account record <-> user ---------------- */

    function toProfile(account) {
        var p = blankProfile();
        account = account || {};
        p.name = account.name || '';
        p.phone = digits(account.phone || '');
        p.email = account.email || '';
        p.addresses = dedupeAddresses(account.addresses);
        return p;
    }

    function accountFromDetails(details) {
        return {
            id: details.id || uid(),
            name: String(details.name || '').trim(),
            phone: digits(details.phone || ''),
            password: details.password != null ? String(details.password) : '',
            addresses: Array.isArray(details.addresses) ? details.addresses : [],
            cart: Array.isArray(details.cart) ? details.cart : [],
            cartRemoved: Array.isArray(details.cartRemoved) ? details.cartRemoved : [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }

    /* ---------------- local accounts ---------------- */

    function accounts() { return read(KEYS.accounts, []); }
    function saveAccounts(list) { write(KEYS.accounts, list); }

    function findAccountLocal(id) {
        var found = null;
        accounts().forEach(function (a) { if (a.id === id) found = a; });
        return found;
    }

    function findAccountByPhoneLocal(phone) {
        var p = digits(phone);
        var found = null;
        accounts().forEach(function (a) { if (digits(a.phone) === p) found = a; });
        return found;
    }

    function persistAccount(account) {
        var list = accounts();
        var found = false;
        list = list.map(function (a) {
            if (a.id === account.id) { found = true; return account; }
            return a;
        });
        if (!found) list.push(account);
        saveAccounts(list);
    }

    /* Persistence always goes through the backend so the admin panel
       sees the exact same store, whether that is Supabase or this browser. */
    function getAccount(id) {
        if (backend() && backend().getUser) return backend().getUser(id);
        return Promise.resolve(findAccountLocal(id));
    }

    function getAccountByPhone(phone) {
        if (backend() && backend().getUserByPhone) return backend().getUserByPhone(phone);
        return Promise.resolve(findAccountByPhoneLocal(phone) || null);
    }

    function putAccount(account) {
        if (backend() && backend().saveUser) return backend().saveUser(account);
        persistAccount(account);
        return Promise.resolve(account);
    }

    /* ---------------- session ---------------- */

    function setUser(account) {
        state.session = { id: account.id };
        state.user = {
            id: account.id,
            email: account.email || '',
            phone: digits(account.phone || ''),
            name: account.name || '',
            avatar: '',
            provider: 'password'
        };
        state.profile = toProfile(account);
        write(KEYS.session, account.id);
        write(KEYS.profile + account.id, state.profile);
    }

    /* ---------------- public reads ---------------- */

    function isSignedIn() { return !!state.user; }
    function isReady() { return state.ready; }
    function getUser() { return state.user; }
    function getProfile() { return state.profile; }
    function isCloud() { return cloudEnabled(); }

    function onChange(fn) {
        listeners.push(fn);
        return function () {
            var i = listeners.indexOf(fn);
            if (i !== -1) listeners.splice(i, 1);
        };
    }

    /* ---------------- init ---------------- */

    function init() {
        var sessionId = read(KEYS.session, null);
        if (!sessionId) return finishInit(null);
        return getAccount(sessionId).then(function (account) {
            return finishInit(account);
        }).catch(function (err) {
            console.warn('[auth] session load failed:', err && err.message);
            return finishInit(findAccountLocal(sessionId));
        });
    }

    function finishInit(account) {
        if (account && account.banned) {
            if (NC.ban && NC.ban.block) NC.ban.block({ reason: '' });
            account = null;
        }
        if (account) setUser(account);
        else {
            state.user = null;
            state.session = null;
            state.profile = blankProfile();
        }
        state.ready = true;
        trackVisit(account);
        emit('ready');
        return Promise.resolve(state.user);
    }

    // Count storefront visits: once per page load (or sign-in) per shopper.
    function trackVisit(account) {
        var id = account && account.id;
        if (!id || visitTracked[id]) return;
        visitTracked[id] = true;
        var b = backend();
        if (b && b.recordVisit) b.recordVisit(id);
    }

    function loadUser(id) {
        return getAccount(id).then(function (user) {
            if (user) setUser(user);
            return user;
        });
    }

    /* ---------------- profile ---------------- */

    function saveProfile(patch) {
        var p = state.profile || blankProfile();
        if (patch && patch.name != null) p.name = String(patch.name).trim();
        if (patch && patch.phone != null) p.phone = digits(patch.phone);
        if (patch && patch.email != null) p.email = String(patch.email).trim();
        if (patch && Array.isArray(patch.addresses)) p.addresses = patch.addresses;
        state.profile = p;
        if (state.user) {
            state.user.name = p.name;
            state.user.phone = digits(p.phone);
            write(KEYS.profile + state.user.id, p);
        }
        if (!state.user) return Promise.resolve(p);

        var id = state.user.id;
        return getAccount(id).catch(function () { return null; }).then(function (existing) {
            existing = existing || {};
            var account = accountFromDetails({
                id: id,
                name: p.name,
                phone: digits(p.phone),
                password: existing.password,
                addresses: p.addresses,
                cart: existing.cart,
                cartRemoved: existing.cartRemoved
            });
            if (existing.createdAt) account.createdAt = existing.createdAt;
            return putAccount(account);
        }).catch(function (err) {
            console.warn('[auth] profile save failed:', err && err.message);
            return p;
        }).then(function () {
            emit('change');
            return p;
        });
    }

    function saveAddress(address) {
        if (!address) return Promise.resolve(state.profile);
        var p = state.profile || blankProfile();
        var list = Array.isArray(p.addresses) ? p.addresses.slice() : [];
        var normalized = {
            id: address.id || 'a' + Date.now().toString(36),
            label: address.label || 'Home',
            line1: address.line1 || '',
            line2: address.line2 || '',
            city: address.city || '',
            state: address.state || '',
            pincode: address.pincode || '',
            lat: address.lat != null ? address.lat : null,
            lng: address.lng != null ? address.lng : null
        };
        var replaced = false;
        list = list.filter(function (a) {
            var sameId = a.id === normalized.id;
            var samePlace = [a.line1, a.line2, a.city, a.state, a.pincode].map(function (v) {
                return String(v == null ? '' : v).trim().toLowerCase();
            }).join('|') === [normalized.line1, normalized.line2, normalized.city, normalized.state, normalized.pincode].map(function (v) {
                return String(v == null ? '' : v).trim().toLowerCase();
            }).join('|');
            if (sameId || samePlace) {
                if (samePlace && !replaced) normalized.id = a.id;
                replaced = true;
                return false;
            }
            return true;
        });
        list.unshift(normalized);

        var patch = { addresses: list.slice(0, 8) };
        if (address.phone) patch.phone = address.phone;
        if (address.name) patch.name = address.name;
        return saveProfile(patch);
    }

    function lastAddress() {
        var list = (state.profile && state.profile.addresses) || [];
        return list.length ? list[0] : null;
    }

    /* ---------------- public auth actions ---------------- */

    function findAccountByPhone(phone) {
        return getAccountByPhone(phone).catch(function () { return null; });
    }

    function signIn(identity, password) {
        if (!isPhone(identity)) return Promise.reject(new Error('Enter a valid 10-digit mobile number'));
        return findAccountByPhone(identity).then(function (account) {
            if (!account) throw new Error('No account found for that mobile number');
            if (account.banned) throw new Error('This account has been suspended.');
            if (account.password && account.password !== String(password || '')) {
                throw new Error('Incorrect password');
            }
            setUser(account);
            syncCartFrom(account);
            emit('change');
            return state.user;
        });
    }

    function signUp(details) {
        var phone = digits(details && details.phone);
        return findAccountByPhone(phone).then(function (existing) {
            if (existing) {
                if (existing.banned) throw new Error('This account has been suspended.');
                throw new Error('An account with this mobile number already exists');
            }
            var account = accountFromDetails({
                name: details.name,
                phone: phone,
                password: details.password
            });
            return putAccount(account).then(function (saved) {
                setUser(saved && saved.id ? saved : account);
                return state.user;
            });
        });
    }

    function continueAsGuest(phone, password) {
        phone = digits(phone);
        return findAccountByPhone(phone).then(function (existing) {
            if (existing) {
                if (existing.banned) throw new Error('This account has been suspended.');
                if (existing.password && existing.password !== String(password || '')) {
                    throw new Error('Incorrect password');
                }
                setUser(existing);
                syncCartFrom(existing);
                emit('change');
                return state.user;
            }
            var account = accountFromDetails({ name: '', phone: phone, password: password });
            return putAccount(account).then(function (saved) {
                setUser(saved && saved.id ? saved : account);
                return state.user;
            });
        });
    }

    function syncCartFrom(account) {
        try {
            if (NC.store && NC.store.mergeUserCart && account && Array.isArray(account.cart)) {
                NC.store.mergeUserCart(account.cart);
            }
        } catch (e) { }
    }

    function signOut() {
        state.user = null;
        state.session = null;
        state.profile = blankProfile();
        remove(KEYS.session);
        emit('change');
        return Promise.resolve();
    }

    /* ---------------- auth UI ---------------- */

    function open(tab) {
        var modal = $('#authModal');
        if (!modal) return;
        ui.tab = tab || (state.user ? 'account' : 'signin');
        ui.busy = false;
        ui.error = '';
        renderAuth();
        modal.hidden = false;
        document.body.classList.add('no-scroll');
        focusFirst();
    }

    function close() {
        var modal = $('#authModal');
        if (!modal) return;
        modal.hidden = true;
        if (!isSignedIn()) pendingAfter = null;
        if (!$('#checkoutModal') || $('#checkoutModal').hidden) {
            document.body.classList.remove('no-scroll');
        }
    }

    function focusFirst() {
        var modal = $('#authModal');
        if (!modal) return;
        var field = modal.querySelector('.auth-form .input');
        if (field) field.focus();
    }

    function tabButton(id, label) {
        return '<button type="button" class="auth-tab' + (ui.tab === id ? ' active' : '') +
            '" data-auth-tab="' + id + '">' + esc(label) + '</button>';
    }

    function field(name, label, opts) {
        opts = opts || {};
        return '<div class="field"><label for="auth-' + name + '">' + esc(label) +
            (opts.optional ? ' <span class="muted">(optional)</span>' : '') + '</label>' +
            '<input class="input" id="auth-' + name + '" name="' + name + '" type="' + (opts.type || 'text') + '"' +
            ' value="' + esc(opts.value || '') + '"' +
            ' placeholder="' + esc(opts.placeholder || '') + '"' +
            (opts.autocomplete ? ' autocomplete="' + opts.autocomplete + '"' : '') +
            (opts.inputmode ? ' inputmode="' + opts.inputmode + '"' : '') +
            (opts.maxlength ? ' maxlength="' + opts.maxlength + '"' : '') +
            (opts.required ? ' required' : '') + '></div>';
    }

    function formForTab() {
        var p = state.profile || blankProfile();
        if (ui.tab === 'register') {
            return '<form class="auth-form" data-auth-form="register">' +
                field('name', 'Full name', { value: p.name, placeholder: 'Ananya Sharma', autocomplete: 'name', required: true }) +
                field('phone', 'Mobile number', { value: p.phone, placeholder: '9876543210', type: 'tel', inputmode: 'numeric', maxlength: 10, autocomplete: 'tel', required: true }) +
                field('password', 'Password', { placeholder: 'At least 6 characters', type: 'password', autocomplete: 'new-password', required: true }) +
                '<p class="auth-error" data-auth-error' + (ui.error ? '' : ' hidden') + '>' + esc(ui.error) + '</p>' +
                '<button class="btn btn-primary btn-block" type="submit"' + (ui.busy ? ' disabled' : '') + '>' +
                (ui.busy ? 'Creating account…' : 'Create account') + '</button>' +
                '<p class="auth-switch">Already have an account? ' +
                '<button type="button" class="link-btn" data-auth-tab="signin">Sign in</button></p>' +
                '</form>';
        }
        if (ui.tab === 'guest') {
            return '<form class="auth-form" data-auth-form="guest">' +
                field('phone', 'Mobile number', { value: p.phone, placeholder: '9876543210', type: 'tel', inputmode: 'numeric', maxlength: 10, autocomplete: 'tel', required: true }) +
                field('password', 'Password', { placeholder: 'Choose a password', type: 'password', autocomplete: 'new-password', required: true }) +
                '<p class="auth-hint">A mobile number and password is all you need as a guest. You can add your name and address at checkout.</p>' +
                '<p class="auth-error" data-auth-error' + (ui.error ? '' : ' hidden') + '>' + esc(ui.error) + '</p>' +
                '<button class="btn btn-primary btn-block" type="submit"' + (ui.busy ? ' disabled' : '') + '>' +
                (ui.busy ? 'Continuing…' : 'Continue as guest') + '</button>' +
                '</form>';
        }
        return '<form class="auth-form" data-auth-form="signin">' +
            field('identity', 'Mobile number', { value: p.phone, placeholder: '9876543210', type: 'tel', inputmode: 'numeric', maxlength: 10, autocomplete: 'tel', required: true }) +
            field('password', 'Password', { placeholder: 'Your password', type: 'password', autocomplete: 'current-password', required: true }) +
            '<p class="auth-error" data-auth-error' + (ui.error ? '' : ' hidden') + '>' + esc(ui.error) + '</p>' +
            '<button class="btn btn-primary btn-block" type="submit"' + (ui.busy ? ' disabled' : '') + '>' +
            (ui.busy ? 'Signing in…' : 'Sign in') + '</button>' +
            '<p class="auth-switch">New here? ' +
            '<button type="button" class="link-btn" data-auth-tab="register">Create an account</button> · ' +
            '<button type="button" class="link-btn" data-auth-tab="guest">Guest</button></p>' +
            '</form>';
    }

    function accountPanel() {
        var p = state.profile || blankProfile();
        var u = state.user || {};
        var initial = (p.name || p.phone || 'U').trim().charAt(0).toUpperCase();
        var addresses = p.addresses || [];

        return '<div class="account-panel">' +
            '<div class="account-head">' +
            '<span class="account-avatar">' + (u.avatar ? '<img src="' + esc(u.avatar) + '" alt="">' : esc(initial)) + '</span>' +
            '<div><b>' + esc(p.name || 'NovaCart shopper') + '</b>' +
            '<span class="muted">' + esc(p.phone ? '+' + p.phone : 'Guest account') + '</span></div>' +
            '</div>' +
            (p.phone ? '<p class="account-row"><span>Mobile</span><b>' + esc(p.phone) + '</b></p>' : '') +
            '<h4 class="account-sub">Saved addresses</h4>' +
            (addresses.length
                ? addresses.map(function (a) {
                    return '<div class="account-address"><b>' + esc(a.label || 'Address') + '</b>' +
                        '<span>' + esc([a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(', ')) + '</span></div>';
                }).join('')
                : '<p class="muted" style="font-size:.85rem">No saved addresses yet — add one at checkout.</p>') +
            '<div class="account-actions">' +
            '<button class="btn btn-outline btn-block" type="button" data-auth-signout>Sign out</button>' +
            '</div>' +
            '</div>';
    }

    function renderAuth() {
        var modal = $('#authModal');
        if (!modal) return;
        var body = $('[data-auth-body]', modal);
        if (!body) return;

        if (ui.tab === 'account' && state.user) {
            body.innerHTML = accountPanel();
            bindAccount(body);
            return;
        }

        body.innerHTML = '<div class="auth-brand"><span class="brand-mark" data-auth-logo>N</span>' +
            '<b>' + esc((NC.settings && NC.settings.storeName) || 'NovaCart') + '</b></div>' +
            '<div class="auth-tabs">' + tabButton('signin', 'Sign in') + tabButton('register', 'Register') + tabButton('guest', 'Guest') + '</div>' +
            formForTab();

        bindAuth(body);
    }

    function bindAccount(root) {
        var logo = $('[data-auth-logo]', root);
        if (logo && NC.backend && NC.backend.getSettings) {
            var s = NC.backend.getSettings();
            if (s && s.logoUrl) {
                logo.innerHTML = '<img src="' + esc(s.logoUrl) + '" alt="">';
            } else {
                logo.textContent = ((s && s.storeName) || 'N').trim().charAt(0).toUpperCase();
            }
        }
        $$('[data-auth-signout]', root).forEach(function (btn) {
            btn.addEventListener('click', function () {
                signOut().then(function () {
                    if (NC.ui) NC.ui.toast('Signed out', 'info');
                    close();
                });
            });
        });
    }

    function bindAuth(root) {
        $$('[data-auth-tab]', root).forEach(function (btn) {
            btn.addEventListener('click', function () {
                ui.tab = btn.getAttribute('data-auth-tab');
                ui.error = '';
                renderAuth();
            });
        });

        var form = $('.auth-form', root);
        if (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                submitForm(form);
            });
        }
    }

    function submitForm(form) {
        var kind = form.getAttribute('data-auth-form');
        var data = {};
        $$('.input', form).forEach(function (input) { data[input.name] = input.value.trim(); });

        if (kind === 'signin') {
            if (!data.identity || !data.password) return setBusy(false, 'Enter your details to continue');
            setBusy(true, '');
            signIn(data.identity, data.password).then(afterAuth).catch(fail);
        } else if (kind === 'register') {
            var err = validateNew(data);
            if (err) return setBusy(false, err);
            setBusy(true, '');
            signUp({ name: data.name, phone: data.phone, password: data.password })
                .then(afterAuth).catch(fail);
        } else if (kind === 'guest') {
            if (!isPhone(data.phone)) return setBusy(false, 'Enter a valid 10-digit mobile number');
            if (!data.password || data.password.length < 6) return setBusy(false, 'Password must be at least 6 characters');
            setBusy(true, '');
            continueAsGuest(data.phone, data.password)
                .then(afterAuth).catch(fail);
        }
    }

    function validateNew(data) {
        if (!data.name || data.name.length < 3) return 'Enter your full name';
        if (!isPhone(data.phone)) return 'Enter a valid 10-digit mobile number';
        if (!data.password || data.password.length < 6) return 'Password must be at least 6 characters';
        return '';
    }

    function afterAuth() {
        ui.busy = false;
        trackVisit(state.user);
        emit('change');
        if (NC.ban && NC.ban.enforce) NC.ban.enforce();
        if (NC.ui) NC.ui.toast('Welcome' + (state.profile.name ? ', ' + state.profile.name.split(' ')[0] : '') + '!', 'success');
        close();
        var cb = pendingAfter;
        pendingAfter = null;
        if (typeof cb === 'function') setTimeout(cb, 0);
    }

    function fail(err) {
        setBusy(false, (err && err.message) || 'Something went wrong. Please try again.');
    }

    function setBusy(busy, error) {
        ui.busy = busy;
        ui.error = error || '';
        renderAuth();
        if (error) {
            var msg = $('#authModal [data-auth-error]');
            if (msg) { msg.hidden = false; msg.textContent = error; }
        }
    }

    function requireAuth(after) {
        if (isSignedIn()) { after(); return; }
        pendingAfter = after;
        open('signin');
    }

    /* ---------------- boot ---------------- */

    function bindGlobal() {
        document.addEventListener('click', function (e) {
            if (e.target.closest('[data-action="open-auth"]')) { open(); }
            else if (e.target.closest('[data-action="open-account"]')) { open('account'); }
            else if (e.target.closest('[data-auth-close]')) { close(); }
            else if (e.target.closest('[data-auth-scrim]')) { close(); }
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                var modal = $('#authModal');
                if (modal && !modal.hidden) close();
            }
        });
    }

    NC.auth = {
        init: init,
        onChange: onChange,
        snapshot: snapshot,
        getUser: getUser,
        getProfile: getProfile,
        isSignedIn: isSignedIn,
        isReady: isReady,
        isCloud: isCloud,
        isPhone: isPhone,
        emailForPhone: emailForPhone,
        loadUser: loadUser,
        signIn: signIn,
        signUp: signUp,
        continueAsGuest: continueAsGuest,
        signOut: signOut,
        saveProfile: saveProfile,
        saveAddress: saveAddress,
        lastAddress: lastAddress,
        open: open,
        close: close,
        requireAuth: requireAuth,
        bindGlobal: bindGlobal
    };
})();
