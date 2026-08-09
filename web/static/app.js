(function() {
  var evtSource = null;
  var state = { layers: [], lexicon: {}, theme: {}, settings: {}, registry: {} };

  function connectSSE() {
    if (evtSource) evtSource.close();
    evtSource = new EventSource("/api/events");
    evtSource.onmessage = function(e) {
      var msg = JSON.parse(e.data);
      dispatch(msg.topic, msg.payload);
    };
    evtSource.onerror = function() {
      setTimeout(connectSSE, 3000);
    };
  }

  function dispatch(topic, payload) {
    if (topic === "state.layer") { state.layers = payload; renderLayers(); }
    if (topic === "state.lexicon") { state.lexicon = payload || {}; applyLexicon(); }
    if (topic === "state.theme" || topic === "theme.changed") { state.theme = payload || {}; applyTheme(); }
    if (topic === "state.settings") { state.settings = payload || {}; }
    if (topic === "state.registry.game") { state.registry.games = payload || []; }
    if (topic === "notify.push") { renderToast(payload); }
    if (topic === "chat.message" || topic === "chat.token" || topic === "chat.ended") { renderChatEvent(topic, payload); }
    if (topic === "layer.activated") { onLayerActivated(payload); }
    if (topic === "screensaver.activated") { onScreensaverActivated(); }
    if (topic === "screensaver.deactivated") { onScreensaverDeactivated(); }
  }

  function applyLexicon() {
    var els = document.querySelectorAll("[data-lx]");
    els.forEach(function(el) {
      var key = el.getAttribute("data-lx");
      var val = state.lexicon[key];
      if (val === "") { el.style.display = "none"; }
      else if (val !== undefined) { el.textContent = val; }
    });
  }

  function applyTheme() {
    var root = document.documentElement;
    for (var k in state.theme) {
      root.style.setProperty(k, state.theme[k]);
    }
  }

  function renderLayers() {
    state.layers.forEach(function(l) {
      var el = document.querySelector('[data-layer="' + l.id + '"]');
      if (el) { el.classList.toggle("hidden", !l.visible); }
    });
  }

  function renderToast(n) {
    var stack = document.getElementById("notify-stack");
    if (!stack) return;
    var el = document.createElement("div");
    el.className = "toast toast-" + n.level;
    el.innerHTML = "<strong>" + esc(n.title) + "</strong>: " + esc(n.body);
    stack.appendChild(el);
    setTimeout(function() { el.remove(); }, (n.ttl || 5) * 1000);
  }

  function renderChatEvent(topic, payload) {
    var msgs = document.getElementById("chat-messages");
    if (!msgs) return;
    if (topic === "chat.message") {
      var div = document.createElement("div");
      div.className = "chat-msg chat-" + payload.role;
      div.textContent = payload.content;
      msgs.appendChild(div);
    } else if (topic === "chat.token") {
      var last = msgs.lastElementChild;
      if (last && last.classList.contains("chat-assistant")) {
        last.textContent += payload.delta;
      }
    } else if (topic === "chat.ended") {
      msgs.scrollTop = msgs.scrollHeight;
    }
  }

  function onLayerActivated(payload) {
    if (payload.layer === "desktop" && payload.x != null) {
      spawnChatBubble(payload.x, payload.y);
    }
  }

  function spawnChatBubble(x, y) {
    var bubble = document.getElementById("chat-bubble");
    if (!bubble) return;
    bubble.classList.remove("hidden");
    bubble.style.left = x + "px";
    bubble.style.top = y + "px";
    bubble.innerHTML = '<input type="text" placeholder="Ask Vee..." hx-post="/api/chat" hx-target="#chat-messages" hx-swap="innerHTML"/>';
    setTimeout(function() { bubble.classList.add("hidden"); }, 5000);
  }

  function onScreensaverActivated() {
    var arcade = document.getElementById("arcade-overlay");
    if (arcade) arcade.classList.remove("hidden");
  }

  function onScreensaverDeactivated() {
    var arcade = document.getElementById("arcade-overlay");
    if (arcade) arcade.classList.add("hidden");
  }

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  document.addEventListener("DOMContentLoaded", function() {
    connectSSE();

    document.getElementById("vee-wordmark").addEventListener("click", function() {
      var panel = document.getElementById("chat-panel");
      var dot = document.getElementById("wordmark-dot");
      if (panel) panel.classList.toggle("hidden");
      if (dot) dot.classList.toggle("hidden");
    });

    document.getElementById("desktop").addEventListener("click", function(e) {
      var x = e.clientX, y = e.clientY;
      fetch("/api/layers", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({layer:"desktop",x:x,y:y}) });
    });

    document.getElementById("arcade-overlay").addEventListener("click", function(e) {
      if (e.target.closest("[data-game]")) {
        var gameId = e.target.closest("[data-game]").getAttribute("data-game");
        fetch("/api/arcade/launch", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({gameId:gameId}) });
      }
    });

    applyLexicon();
    applyTheme();
  });
})();