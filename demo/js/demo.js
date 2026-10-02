/*!
 * Flower Trend static demo runtime.
 *
 * The real app is an Express + MongoDB server. GitHub Pages has no server, so this script stands
 * in for the backend inside the visitor's browser:
 *
 *   MongoDB collections (users, contacts)    -> localStorage, seeded with one demo account
 *   express-session cookie                   -> a browser-session cookie (same lifetime)
 *   POST /login, /register, /contact, /logout -> submit handlers that mirror
 *                                               controllers/pageController.js, then navigate to
 *                                               the page that controller renders
 *   res.render(view, { error | result })     -> a one-shot "flash" read by the next page
 *
 * Markup that depends on the session or on a controller message is written in place by the
 * FlowerDemo.slot(...) calls that scripts/demo/build.mjs generates from the EJS views.
 *
 * Source: scripts/demo/runtime.js. demo/js/demo.js is a generated copy, do not edit it.
 */
(function () {
  'use strict';

  var BASE = location.pathname.replace(/[^/]*$/, ''); // e.g. "/flower-project-backend/"
  var KEY = 'flowerTrendDemo:' + BASE + ':'; // every Pages site of an owner shares one origin
  var SESSION_COOKIE = 'ftdemo_sid';
  var DEMO_ACCOUNT = { username: 'demo', email: 'demo@example.com', password: 'demo1234' };

  // ------------------------------------------------------------------------------------------
  // Storage helpers (storage can be blocked or full: the pages must still render)
  // ------------------------------------------------------------------------------------------

  function memoryStore() {
    var data = {};
    return {
      getItem: function (key) {
        return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
      },
      setItem: function (key, value) {
        data[key] = String(value);
      },
      removeItem: function (key) {
        delete data[key];
      },
    };
  }

  function openStore(name) {
    try {
      var store = window[name];
      store.getItem(KEY);
      return { store: store, persistent: true };
    } catch (error) {
      return { store: memoryStore(), persistent: false };
    }
  }

  var localStore = openStore('localStorage');
  var tabStore = openStore('sessionStorage');
  var local = localStore.store; // the "database"
  var tab = tabStore.store; // flash messages
  // With site data blocked (e.g. "block all cookies"), nothing survives a page load.
  var storageWorks = localStore.persistent && tabStore.persistent;
  var STORAGE_BLOCKED =
    'This demo keeps its accounts and messages in your browser, but your browser is blocking site data for this page. ' +
    'Allow cookies and site data for this site to try signing in and the forms.';

  function read(store, name, fallback) {
    try {
      var raw = store.getItem(KEY + name);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (error) {
      return fallback;
    }
  }

  function write(store, name, value) {
    try {
      store.setItem(KEY + name, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  function remove(store, name) {
    try {
      store.removeItem(KEY + name);
    } catch (error) {
      /* nothing to clean up */
    }
  }

  function objectId() {
    var id = Math.floor(Date.now() / 1000).toString(16);
    while (id.length < 24) id += Math.floor(Math.random() * 16).toString(16);
    return id;
  }

  function find(list, predicate) {
    for (var i = 0; i < list.length; i++) if (predicate(list[i])) return list[i];
    return null;
  }

  // ------------------------------------------------------------------------------------------
  // "MongoDB": the users and contacts collections
  // ------------------------------------------------------------------------------------------

  function users() {
    var list = read(local, 'users', null);
    if (!Array.isArray(list)) {
      var now = new Date().toISOString();
      list = [
        {
          _id: objectId(),
          username: DEMO_ACCOUNT.username,
          email: DEMO_ACCOUNT.email,
          password: DEMO_ACCOUNT.password,
          createdAt: now,
          updatedAt: now,
        },
      ];
      write(local, 'users', list);
    }
    return list;
  }

  // ------------------------------------------------------------------------------------------
  // "express-session": a cookie without an expiry, like the app's session cookie
  // ------------------------------------------------------------------------------------------

  function sessionCookie() {
    var match = document.cookie.match(new RegExp('(?:^|;\\s*)' + SESSION_COOKIE + '=([^;]*)'));
    if (!match) return null;
    try {
      return decodeURIComponent(match[1]) || null;
    } catch (error) {
      return null;
    }
  }

  function sessionUsername() {
    var username = null;
    try {
      username = sessionCookie();
    } catch (error) {
      /* cookies unavailable */
    }
    return username || read(tab, 'session', null);
  }

  function startSession(username) {
    var stored = false;
    try {
      document.cookie = SESSION_COOKIE + '=' + encodeURIComponent(username) + '; path=' + BASE + '; SameSite=Lax';
      stored = sessionCookie() === username;
    } catch (error) {
      /* cookies unavailable */
    }
    if (!stored) write(tab, 'session', username);
  }

  function endSession() {
    try {
      document.cookie = SESSION_COOKIE + '=; path=' + BASE + '; Max-Age=0; SameSite=Lax';
    } catch (error) {
      /* cookies unavailable */
    }
    remove(tab, 'session');
  }

  // State of the current page view.
  var currentUser = sessionUsername();
  var flash = read(tab, 'flash', null);
  remove(tab, 'flash');

  // ------------------------------------------------------------------------------------------
  // Slots: write the EJS output for the current state where the template would have put it
  // ------------------------------------------------------------------------------------------

  var HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&#34;', "'": '&#39;' };

  /** Same escaping as EJS <%= %>. */
  function escapeXML(value) {
    return value == undefined
      ? ''
      : String(value).replace(/[&<>'"]/g, function (character) {
          return HTML_ESCAPES[character];
        });
  }

  function isOn(dimension) {
    if (dimension === 'session') return !!currentUser; // <% if (!username) %>
    if (dimension === 'error') return !!flash && flash.error !== undefined; // <% if (typeof error !== 'undefined') %>
    if (dimension === 'result') return !!flash && !!flash.result; // <% if (result) %>
    return false;
  }

  function slot(dimension, variants) {
    var script = document.currentScript;
    // The build puts the logged-out markup in a <noscript> right before the slot for visitors
    // without JavaScript; with the runtime running it is not needed.
    var fallback = script && script.previousSibling;
    if (fallback && fallback.nodeName === 'NOSCRIPT' && fallback.hasAttribute('data-demo-slot')) {
      fallback.parentNode.removeChild(fallback);
    }
    var html = (isOn(dimension) ? variants.on : variants.off)
      .split('__DEMO_USERNAME__')
      .join(escapeXML(currentUser))
      .split('__DEMO_ERROR__')
      .join(escapeXML(flash && flash.error))
      .split('__DEMO_RESULT__')
      .join(escapeXML(flash && flash.result));
    document.write(html);
    if (script && script.parentNode) script.parentNode.removeChild(script);
  }

  // ------------------------------------------------------------------------------------------
  // models/userModel.js (Mongoose 8): setters run on assignment, then each path's validators run
  // in order (required first) and only the first failure per path is reported.
  // ------------------------------------------------------------------------------------------

  function required(value) {
    return typeof value === 'string' && value.length > 0;
  }

  function validateUser(body) {
    var check = window.validator; // validator@13 browser build, the same version the model uses
    if (!check) throw new Error('validator.min.js is not loaded on this page');
    var user = {
      username: typeof body.username === 'string' ? body.username.toLowerCase() : body.username, // lowercase: true
      email: body.email,
      password: body.password,
    };
    var rules = {
      username: [
        [required, 'Username area is required'],
        [check.isAlphanumeric, 'Only Alphanumeric characters'],
      ],
      email: [
        [required, 'Email area is required'],
        [check.isEmail, 'Valid email is required'],
      ],
      password: [
        [required, 'Password area is required'],
        [
          function (value) {
            return value.length >= 4;
          },
          'At least 4 characters',
        ],
      ],
    };
    var errors = null;
    Object.keys(rules).forEach(function (path) {
      var value = user[path];
      for (var i = 0; i < rules[path].length; i++) {
        if (i > 0 && value === undefined) break; // only `required` runs on undefined values
        if (!rules[path][i][0](value)) {
          errors = errors || {};
          errors[path] = rules[path][i][1];
          break;
        }
      }
    });
    return { user: user, errors: errors };
  }

  /** Demo only: the real app has these hidden alert boxes in views/Register.ejs but never fills them. */
  function showValidation(errors) {
    ['username', 'email', 'password'].forEach(function (path) {
      var box = document.getElementById(path);
      if (!box) return;
      var message = errors && errors[path];
      box.textContent = message || '';
      box.style.display = message ? 'block' : 'none';
    });
  }

  // ------------------------------------------------------------------------------------------
  // Controllers: POST routes from routs/pageRoute.js
  // ------------------------------------------------------------------------------------------

  /** res.render(view, message): show `page` and hand the message to it. */
  function respond(page, message) {
    if (message) write(tab, 'flash', message);
    var target = new URL(page, location.href).href;
    if (target === location.href) {
      // Navigating to the current URL would replace this history entry, but a form POST adds one.
      // Tag both entries so that Back and Forward between them load the page again (see below).
      var id = objectId();
      history.replaceState({ flowerDemo: 'form', id: id }, '');
      history.pushState({ flowerDemo: 'response', id: id }, '', target);
      location.reload();
    } else {
      location.assign(target);
    }
  }

  // Entries created above share one document, so the browser only fires popstate when moving
  // between them. Reload so Back shows the form again and Forward the response, like the app.
  var documentState = history.state;
  window.addEventListener('popstate', function (event) {
    var state = event.state;
    if (!state || !state.flowerDemo) return; // e.g. a click on one of the template's href="#" links
    if (documentState && documentState.flowerDemo === state.flowerDemo && documentState.id === state.id) return;
    location.reload();
  });

  var controllers = {
    '/login': function (body) {
      var user = find(users(), function (candidate) {
        return candidate.password === body.password && candidate.email === body.email;
      });
      if (!user) return respond('index.html', { error: 'Invalid username or password' });
      startSession(user.username);
      respond('index.html');
    },

    '/register': function (body) {
      var list = users();
      if (find(list, function (candidate) { return candidate.email === body.email; })) {
        return respond('index.html', { error: 'Username already exists' });
      }
      var result = validateUser(body);
      showValidation(result.errors);
      if (result.errors) return;
      var now = new Date().toISOString();
      list.push({
        _id: objectId(),
        username: result.user.username,
        email: result.user.email,
        password: result.user.password,
        createdAt: now,
        updatedAt: now,
      });
      if (!write(local, 'users', list)) {
        return window.alert('The demo could not save your account: browser storage is blocked or full.');
      }
      respond('Register.html');
    },

    '/contact': function (body) {
      var list = read(local, 'contacts', []);
      if (!Array.isArray(list)) list = [];
      list.push({
        _id: objectId(),
        name: body.name,
        email: body.email,
        number: body.number,
        subject: body.subject,
        message: body.message, // the textarea has no name attribute, so this is undefined as in the real app
        date: new Date().toISOString(),
      });
      var saved = write(local, 'contacts', list);
      respond('contact.html', { result: saved ? 'We Received your message' : 'There was an error saving your message' });
    },

    '/logout': function () {
      endSession();
      respond('index.html'); // res.redirect('/')
    },
  };

  function formBody(form) {
    var body = {};
    new FormData(form).forEach(function (value, name) {
      body[name] = typeof value === 'string' ? value : value.name;
    });
    return body;
  }

  document.addEventListener(
    'submit',
    function (event) {
      var form = event.target;
      if (!form || form.tagName !== 'FORM') return;
      if ((form.getAttribute('method') || 'get').toLowerCase() !== 'post') return;
      var controller = controllers[(form.getAttribute('action') || '').toLowerCase()];
      if (!controller) return;
      event.preventDefault();
      if (!storageWorks) return window.alert(STORAGE_BLOCKED);
      try {
        controller(formBody(form));
      } catch (error) {
        window.alert('The demo could not handle this form: ' + error.message);
      }
    },
    true
  );

  // ------------------------------------------------------------------------------------------
  // Demo badge
  // ------------------------------------------------------------------------------------------

  if (read(local, 'badgeHidden', false)) document.documentElement.classList.add('ftdemo-badge-hidden');

  document.addEventListener('click', function (event) {
    var button = event.target && event.target.closest && event.target.closest('[data-demo-badge-close]');
    if (!button) return;
    document.documentElement.classList.add('ftdemo-badge-hidden');
    write(local, 'badgeHidden', true);
  });

  window.FlowerDemo = {
    slot: slot,
    validateUser: validateUser,
    /** Forget every demo account, message and session stored by this site, then reload. */
    reset: function () {
      ['users', 'contacts', 'badgeHidden'].forEach(function (name) {
        remove(local, name);
      });
      remove(tab, 'flash');
      endSession();
      location.reload();
    },
  };
})();
