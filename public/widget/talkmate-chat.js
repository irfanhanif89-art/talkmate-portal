/*
 * TalkMate embeddable website chat widget.
 * Self-contained, no dependencies, plain vanilla JS, inline styles only.
 *
 * Embed via:
 *   <script src="https://app.talkmate.com.au/widget/talkmate-chat.js" data-business-id="UUID"></script>
 * or programmatically:
 *   window.TalkMateChat.init({ businessId: '...' });
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Work out which script tag loaded us, so we can derive the API origin and
  // read the data-business-id attribute. document.currentScript works during
  // synchronous execution, but we fall back to a src match for safety.
  // ---------------------------------------------------------------------------
  var SCRIPT_MATCH = 'talkmate-chat.js';

  function findOwnScript() {
    if (document.currentScript && document.currentScript.src &&
        document.currentScript.src.indexOf(SCRIPT_MATCH) !== -1) {
      return document.currentScript;
    }
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      if (scripts[i].src && scripts[i].src.indexOf(SCRIPT_MATCH) !== -1) {
        return scripts[i];
      }
    }
    return null;
  }

  var ownScript = findOwnScript();

  // Derive the API base origin from our own src. All API calls hang off this.
  function deriveOrigin() {
    if (ownScript && ownScript.src) {
      try {
        return new URL(ownScript.src).origin;
      } catch (e) {
        // ignore and fall through
      }
    }
    return window.location.origin;
  }

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------

  // RFC4122 version 4 UUID generator. Uses crypto when available.
  function uuidv4() {
    if (window.crypto && window.crypto.getRandomValues) {
      var buf = new Uint8Array(16);
      window.crypto.getRandomValues(buf);
      buf[6] = (buf[6] & 0x0f) | 0x40;
      buf[8] = (buf[8] & 0x3f) | 0x80;
      var hex = [];
      for (var i = 0; i < 256; i++) {
        hex[i] = (i + 0x100).toString(16).substr(1);
      }
      return (
        hex[buf[0]] + hex[buf[1]] + hex[buf[2]] + hex[buf[3]] + '-' +
        hex[buf[4]] + hex[buf[5]] + '-' +
        hex[buf[6]] + hex[buf[7]] + '-' +
        hex[buf[8]] + hex[buf[9]] + '-' +
        hex[buf[10]] + hex[buf[11]] + hex[buf[12]] + hex[buf[13]] + hex[buf[14]] + hex[buf[15]]
      );
    }
    // Fallback for environments without crypto.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // localStorage with graceful failure (private mode, blocked storage, etc.).
  function lsGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }
  function lsSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      // no-op
    }
  }

  function getVisitorId() {
    var id = lsGet('talkmate_visitor_id');
    if (!id) {
      id = uuidv4();
      lsSet('talkmate_visitor_id', id);
    }
    return id;
  }

  // ---------------------------------------------------------------------------
  // The widget. One instance per business id on a page.
  // ---------------------------------------------------------------------------
  function TalkMateWidget(options) {
    this.origin = deriveOrigin();
    this.businessId = options.businessId;
    this.visitorId = getVisitorId();
    this.config = null;

    this.sessionId = lsGet('talkmate_session_id') || null;
    this.isOpen = false;
    this.greetingShown = false;
    this.leadCaptured = false;
    this.leadFormShown = false;
    this.visitorMessageCount = 0;
    this.sending = false;

    // DOM references, filled in by render().
    this.els = {};
  }

  TalkMateWidget.prototype.start = function () {
    var self = this;
    this.fetchConfig()
      .then(function (config) {
        if (!config || config.enabled === false) {
          // Disabled: render nothing at all.
          return;
        }
        self.config = config;
        self.render();
      })
      .catch(function () {
        // Network or parse failure on config: render nothing, fail silent.
      });
  };

  TalkMateWidget.prototype.fetchConfig = function () {
    return fetch(this.origin + '/api/chat/widget/' + encodeURIComponent(this.businessId), {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    }).then(function (res) {
      if (!res.ok) {
        throw new Error('config http ' + res.status);
      }
      return res.json();
    });
  };

  // The primary colour, with a safe fallback.
  TalkMateWidget.prototype.colour = function () {
    return (this.config && this.config.primaryColor) || '#E8622A';
  };

  TalkMateWidget.prototype.agentName = function () {
    return (this.config && this.config.agentName) || 'Chat';
  };

  TalkMateWidget.prototype.collectLeadsAfter = function () {
    var n = this.config && this.config.collectLeadsAfter;
    if (typeof n === 'number' && n > 0) {
      return n;
    }
    return 2;
  };

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  TalkMateWidget.prototype.render = function () {
    var self = this;
    var colour = this.colour();
    var isMobile = window.innerWidth < 768;

    // Root container so everything sits in one stacking context.
    var root = document.createElement('div');
    root.setAttribute('data-talkmate-widget', this.businessId);
    setStyle(root, {
      position: 'fixed',
      bottom: '0',
      right: '0',
      zIndex: '2147483000',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    });

    // --- Floating button ---
    var button = document.createElement('button');
    button.setAttribute('aria-label', 'Open chat');
    setStyle(button, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      width: '60px',
      height: '60px',
      borderRadius: '50%',
      border: 'none',
      background: colour,
      cursor: 'pointer',
      boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0',
      zIndex: '2147483000'
    });
    button.innerHTML = chatIconSvg();

    // --- Panel ---
    var panel = document.createElement('div');
    var panelStyle = {
      position: 'fixed',
      background: '#ffffff',
      borderRadius: '12px',
      boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
      display: 'none',
      flexDirection: 'column',
      overflow: 'hidden',
      zIndex: '2147483000'
    };
    if (isMobile) {
      panelStyle.top = '0';
      panelStyle.left = '0';
      panelStyle.width = '100vw';
      panelStyle.height = '100vh';
      panelStyle.borderRadius = '0';
    } else {
      panelStyle.bottom = '90px';
      panelStyle.right = '20px';
      panelStyle.width = '340px';
      panelStyle.height = '500px';
    }
    setStyle(panel, panelStyle);

    // --- Header ---
    var header = document.createElement('div');
    setStyle(header, {
      background: colour,
      color: '#ffffff',
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flex: '0 0 auto'
    });
    var title = document.createElement('div');
    title.textContent = this.agentName();
    setStyle(title, { fontWeight: '600', fontSize: '15px' });

    var closeBtn = document.createElement('button');
    closeBtn.setAttribute('aria-label', 'Close chat');
    closeBtn.innerHTML = closeIconSvg();
    setStyle(closeBtn, {
      background: 'transparent',
      border: 'none',
      cursor: 'pointer',
      padding: '4px',
      display: 'flex',
      alignItems: 'center'
    });

    header.appendChild(title);
    header.appendChild(closeBtn);

    // --- Message thread ---
    var thread = document.createElement('div');
    setStyle(thread, {
      flex: '1 1 auto',
      overflowY: 'auto',
      padding: '14px',
      background: '#ffffff',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px'
    });

    // --- Footer ---
    var footer = document.createElement('div');
    setStyle(footer, {
      flex: '0 0 auto',
      borderTop: '1px solid #ececec',
      padding: '10px',
      display: 'flex',
      gap: '8px',
      alignItems: 'center',
      background: '#ffffff'
    });

    var input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Type your message';
    input.maxLength = 500;
    input.setAttribute('inputmode', 'text');
    input.autocomplete = 'off';
    setStyle(input, {
      flex: '1 1 auto',
      border: '1px solid #d9d9d9',
      borderRadius: '20px',
      padding: '10px 14px',
      fontSize: '14px',
      outline: 'none',
      fontFamily: 'inherit',
      // Cross-browser typing hardening. Firefox will not show a caret /
      // accept typing in an input that inherits user-select:none or a
      // transparent text colour from the host page, so set them explicitly.
      color: '#061322',
      background: '#ffffff',
      caretColor: '#061322',
      userSelect: 'text',
      WebkitUserSelect: 'text',
      MozUserSelect: 'text',
      pointerEvents: 'auto'
    });

    var sendBtn = document.createElement('button');
    sendBtn.setAttribute('aria-label', 'Send message');
    sendBtn.innerHTML = sendIconSvg(colour);
    setStyle(sendBtn, {
      background: 'transparent',
      border: 'none',
      cursor: 'pointer',
      padding: '6px',
      display: 'flex',
      alignItems: 'center',
      flex: '0 0 auto'
    });

    footer.appendChild(input);
    footer.appendChild(sendBtn);

    panel.appendChild(header);
    panel.appendChild(thread);
    panel.appendChild(footer);

    root.appendChild(button);
    root.appendChild(panel);
    document.body.appendChild(root);

    // Stash references.
    this.els = {
      root: root,
      button: button,
      panel: panel,
      thread: thread,
      input: input,
      sendBtn: sendBtn
    };

    // --- Wire up events ---
    button.addEventListener('click', function () {
      self.open();
    });
    closeBtn.addEventListener('click', function () {
      self.close();
    });
    sendBtn.addEventListener('click', function () {
      self.handleSend();
    });
    input.addEventListener('keydown', function (e) {
      // Don't hijack Enter while an IME composition is in progress (Firefox
      // reports keyCode 229 mid-composition); only send on a real Enter.
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        self.handleSend();
      }
    });
    // Belt-and-braces focus: clicking anywhere in the footer (including the
    // input's rounded padding) puts the caret in the field. Some browsers
    // otherwise leave the input unfocused if the click lands a pixel off.
    footer.addEventListener('mousedown', function (e) {
      if (e.target !== self.els.sendBtn && !self.els.sendBtn.contains(e.target)) {
        // Defer so the browser's own focus handling runs first.
        setTimeout(function () { try { self.els.input.focus(); } catch (err) {} }, 0);
      }
    });

    // Keep the mobile vs desktop panel layout correct on resize.
    window.addEventListener('resize', function () {
      self.applyPanelLayout();
    });
  };

  // Re-apply the panel size depending on viewport, used on resize.
  TalkMateWidget.prototype.applyPanelLayout = function () {
    var panel = this.els.panel;
    if (!panel) {
      return;
    }
    var isMobile = window.innerWidth < 768;
    if (isMobile) {
      setStyle(panel, {
        top: '0', left: '0', bottom: 'auto', right: 'auto',
        width: '100vw', height: '100vh', borderRadius: '0'
      });
    } else {
      setStyle(panel, {
        top: 'auto', left: 'auto', bottom: '90px', right: '20px',
        width: '340px', height: '500px', borderRadius: '12px'
      });
    }
  };

  // ---------------------------------------------------------------------------
  // Open / close
  // ---------------------------------------------------------------------------
  TalkMateWidget.prototype.open = function () {
    this.isOpen = true;
    this.applyPanelLayout();
    this.els.panel.style.display = 'flex';
    this.els.button.style.display = 'none';

    // Show the greeting as the first assistant bubble, once.
    if (!this.greetingShown) {
      this.greetingShown = true;
      var greeting = (this.config && this.config.greeting) || 'Hi, how can we help?';
      this.addBubble(greeting, 'assistant');
    }
    var self = this;
    setTimeout(function () {
      try { self.els.input.focus(); } catch (e) {}
    }, 50);
  };

  TalkMateWidget.prototype.close = function () {
    this.isOpen = false;
    this.els.panel.style.display = 'none';
    this.els.button.style.display = 'flex';
  };

  // ---------------------------------------------------------------------------
  // Message bubbles
  // ---------------------------------------------------------------------------
  // role is 'assistant' or 'user'. Text is set with textContent only (no XSS).
  TalkMateWidget.prototype.addBubble = function (text, role) {
    var isUser = role === 'user';
    var colour = this.colour();

    var row = document.createElement('div');
    setStyle(row, {
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start'
    });

    var bubble = document.createElement('div');
    bubble.textContent = text;
    setStyle(bubble, {
      maxWidth: '80%',
      padding: '9px 12px',
      borderRadius: '14px',
      fontSize: '14px',
      lineHeight: '1.4',
      wordWrap: 'break-word',
      whiteSpace: 'pre-wrap',
      background: isUser ? colour : '#f1f1f1',
      color: isUser ? '#ffffff' : '#1a1a1a'
    });

    row.appendChild(bubble);
    this.els.thread.appendChild(row);
    this.scrollToBottom();
    return row;
  };

  TalkMateWidget.prototype.scrollToBottom = function () {
    var thread = this.els.thread;
    thread.scrollTop = thread.scrollHeight;
  };

  // Animated typing indicator (three pulsing dots). Returns the row so it can
  // be removed once the real response arrives.
  TalkMateWidget.prototype.showTyping = function () {
    var row = document.createElement('div');
    setStyle(row, { display: 'flex', justifyContent: 'flex-start' });

    var bubble = document.createElement('div');
    setStyle(bubble, {
      padding: '11px 14px',
      borderRadius: '14px',
      background: '#f1f1f1',
      display: 'flex',
      gap: '4px',
      alignItems: 'center'
    });

    for (var i = 0; i < 3; i++) {
      var dot = document.createElement('span');
      setStyle(dot, {
        width: '7px',
        height: '7px',
        borderRadius: '50%',
        background: '#9a9a9a',
        display: 'inline-block',
        animation: 'talkmate-blink 1.2s infinite ' + (i * 0.2) + 's'
      });
      bubble.appendChild(dot);
    }

    this.ensureKeyframes();
    row.appendChild(bubble);
    this.els.thread.appendChild(row);
    this.scrollToBottom();
    return row;
  };

  // Inject the blink keyframes once.
  TalkMateWidget.prototype.ensureKeyframes = function () {
    if (document.getElementById('talkmate-keyframes')) {
      return;
    }
    var style = document.createElement('style');
    style.id = 'talkmate-keyframes';
    style.textContent =
      '@keyframes talkmate-blink{0%,80%,100%{opacity:0.3}40%{opacity:1}}';
    document.head.appendChild(style);
  };

  // ---------------------------------------------------------------------------
  // Sending a message
  // ---------------------------------------------------------------------------
  TalkMateWidget.prototype.handleSend = function () {
    var self = this;
    if (this.sending) {
      return;
    }
    var text = (this.els.input.value || '').trim();
    if (!text) {
      return;
    }
    if (text.length > 500) {
      text = text.substring(0, 500);
    }

    this.els.input.value = '';
    this.addBubble(text, 'user');
    this.visitorMessageCount++;

    this.setSending(true);
    var typingRow = this.showTyping();

    this.ensureSession()
      .then(function (sessionId) {
        return self.postMessage(sessionId, text);
      })
      .then(function (data) {
        removeNode(typingRow);
        if (data && data.sessionId) {
          self.sessionId = data.sessionId;
          lsSet('talkmate_session_id', data.sessionId);
        }
        var reply = (data && data.response) || 'Thanks for your message.';
        self.addBubble(reply, 'assistant');

        if (data && data.leadCaptured) {
          self.leadCaptured = true;
        }
        self.maybeShowLeadForm();
      })
      .catch(function () {
        removeNode(typingRow);
        self.addBubble('Something went wrong, please try again', 'assistant');
      })
      .then(function () {
        self.setSending(false);
      });
  };

  // Toggle the in-flight state. Disables send and input while a request runs.
  TalkMateWidget.prototype.setSending = function (flag) {
    this.sending = flag;
    this.els.sendBtn.disabled = flag;
    this.els.sendBtn.style.opacity = flag ? '0.5' : '1';
    this.els.sendBtn.style.cursor = flag ? 'default' : 'pointer';
    this.els.input.disabled = flag;
  };

  // Lazily create the session on the visitor's first message.
  TalkMateWidget.prototype.ensureSession = function () {
    var self = this;
    if (this.sessionId) {
      return Promise.resolve(this.sessionId);
    }
    return fetch(this.origin + '/api/chat/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        businessId: this.businessId,
        visitorId: this.visitorId,
        sourceUrl: window.location.href
      })
    }).then(function (res) {
      if (!res.ok) {
        throw new Error('session http ' + res.status);
      }
      return res.json();
    }).then(function (data) {
      var sessionId = data && data.sessionId;
      if (!sessionId) {
        throw new Error('no session id');
      }
      self.sessionId = sessionId;
      lsSet('talkmate_session_id', sessionId);
      return sessionId;
    });
  };

  TalkMateWidget.prototype.postMessage = function (sessionId, text) {
    return fetch(this.origin + '/api/chat/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        sessionId: sessionId,
        businessId: this.businessId,
        message: text,
        visitorId: this.visitorId
      })
    }).then(function (res) {
      if (!res.ok) {
        throw new Error('message http ' + res.status);
      }
      return res.json();
    });
  };

  // ---------------------------------------------------------------------------
  // Lead capture form
  // ---------------------------------------------------------------------------
  TalkMateWidget.prototype.maybeShowLeadForm = function () {
    if (this.leadCaptured || this.leadFormShown) {
      return;
    }
    if (this.visitorMessageCount < this.collectLeadsAfter()) {
      return;
    }
    this.leadFormShown = true;
    this.renderLeadForm();
  };

  TalkMateWidget.prototype.renderLeadForm = function () {
    var self = this;
    var colour = this.colour();

    var wrap = document.createElement('div');
    setStyle(wrap, {
      background: '#f7f7f7',
      border: '1px solid #ececec',
      borderRadius: '12px',
      padding: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    });

    var heading = document.createElement('div');
    heading.textContent = 'Leave your details and we will be in touch';
    setStyle(heading, { fontSize: '13px', fontWeight: '600', color: '#1a1a1a' });
    wrap.appendChild(heading);

    function makeField(placeholder, type) {
      var field = document.createElement('input');
      field.type = type || 'text';
      field.placeholder = placeholder;
      setStyle(field, {
        border: '1px solid #d9d9d9',
        borderRadius: '8px',
        padding: '9px 11px',
        fontSize: '14px',
        outline: 'none',
        fontFamily: 'inherit'
      });
      return field;
    }

    var nameInput = makeField('Name', 'text');
    var phoneInput = makeField('Phone', 'tel');
    var emailInput = makeField('Email (optional)', 'email');

    wrap.appendChild(nameInput);
    wrap.appendChild(phoneInput);
    wrap.appendChild(emailInput);

    var error = document.createElement('div');
    setStyle(error, { fontSize: '12px', color: '#c0392b', display: 'none' });
    wrap.appendChild(error);

    var submit = document.createElement('button');
    submit.textContent = 'Submit';
    setStyle(submit, {
      background: colour,
      color: '#ffffff',
      border: 'none',
      borderRadius: '8px',
      padding: '10px',
      fontSize: '14px',
      fontWeight: '600',
      cursor: 'pointer',
      fontFamily: 'inherit'
    });
    wrap.appendChild(submit);

    var row = document.createElement('div');
    setStyle(row, { display: 'flex', justifyContent: 'flex-start' });
    row.appendChild(wrap);
    setStyle(wrap, { maxWidth: '100%', width: '100%' });
    this.els.thread.appendChild(row);
    this.scrollToBottom();

    submit.addEventListener('click', function () {
      var name = (nameInput.value || '').trim();
      var phone = (phoneInput.value || '').trim();
      var email = (emailInput.value || '').trim();

      if (!name || !phone) {
        error.textContent = 'Please add your name and phone number.';
        error.style.display = 'block';
        return;
      }
      error.style.display = 'none';
      submit.disabled = true;
      submit.style.opacity = '0.5';
      submit.textContent = 'Sending';

      self.postLead(name, phone, email)
        .then(function () {
          self.leadCaptured = true;
          removeNode(row);
          self.addBubble('Thanks, we have your details and will be in touch shortly.', 'assistant');
        })
        .catch(function () {
          submit.disabled = false;
          submit.style.opacity = '1';
          submit.textContent = 'Submit';
          error.textContent = 'Something went wrong, please try again';
          error.style.display = 'block';
        });
    });
  };

  TalkMateWidget.prototype.postLead = function (name, phone, email) {
    return fetch(this.origin + '/api/chat/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        sessionId: this.sessionId,
        businessId: this.businessId,
        name: name,
        phone: phone,
        email: email
      })
    }).then(function (res) {
      if (!res.ok) {
        throw new Error('lead http ' + res.status);
      }
      return res.json();
    }).then(function (data) {
      if (!data || data.success !== true) {
        throw new Error('lead not saved');
      }
      return data;
    });
  };

  // ---------------------------------------------------------------------------
  // Inline SVG icons (white where appropriate).
  // ---------------------------------------------------------------------------
  function chatIconSvg() {
    return '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" ' +
      'xmlns="http://www.w3.org/2000/svg"><path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8l-4 4V5a1 1 0 0 1 1-1z" ' +
      'fill="#ffffff"/></svg>';
  }
  function closeIconSvg() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" ' +
      'xmlns="http://www.w3.org/2000/svg"><path d="M6 6l12 12M18 6L6 18" ' +
      'stroke="#ffffff" stroke-width="2" stroke-linecap="round"/></svg>';
  }
  function sendIconSvg(colour) {
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" ' +
      'xmlns="http://www.w3.org/2000/svg"><path d="M3 12l18-8-8 18-2-7-8-3z" ' +
      'fill="' + colour + '"/></svg>';
  }

  // ---------------------------------------------------------------------------
  // Tiny DOM utilities
  // ---------------------------------------------------------------------------
  function setStyle(el, styles) {
    for (var key in styles) {
      if (Object.prototype.hasOwnProperty.call(styles, key)) {
        el.style[key] = styles[key];
      }
    }
  }
  function removeNode(node) {
    if (node && node.parentNode) {
      node.parentNode.removeChild(node);
    }
  }

  // ---------------------------------------------------------------------------
  // Public API and bootstrap
  // ---------------------------------------------------------------------------
  // Track which business ids are already live, to guard double injection.
  var initialised = {};

  function init(opts) {
    opts = opts || {};
    var businessId = opts.businessId;
    if (!businessId) {
      return;
    }
    if (initialised[businessId]) {
      // Already running for this business id on this page: no-op.
      return;
    }
    initialised[businessId] = true;

    var widget = new TalkMateWidget({ businessId: businessId });
    try {
      widget.start();
    } catch (e) {
      // Never throw out of the bootstrap.
    }
  }

  // Expose the public API, preserving any existing object.
  if (!window.TalkMateChat) {
    window.TalkMateChat = {};
  }
  window.TalkMateChat.init = init;

  // Auto-init from the script tag's data-business-id, if present.
  if (ownScript) {
    var dataId = ownScript.getAttribute('data-business-id');
    if (dataId) {
      // Defer to document ready so document.body exists.
      if (document.body) {
        init({ businessId: dataId });
      } else {
        document.addEventListener('DOMContentLoaded', function () {
          init({ businessId: dataId });
        });
      }
    }
  }
})();
