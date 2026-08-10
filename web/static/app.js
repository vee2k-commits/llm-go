(function() {
  var evtSource = null;
  var state = { layers: [], lexicon: {}, theme: {}, settings: {}, registry: {} };
  var chatSessionId = null;      // kept from the last /api/chat response
  var prevLayerVisible = {};     // to detect "layer became visible"
  var gameActive = false;        // a game/demo iframe is embedded right now

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
    if (topic === "settings.changed" && payload) { state.settings[payload.key] = payload.value; }
    if (topic === "state.registry.game") { state.registry.games = payload || []; renderGameShelf(); }
    // `screensaver.activated` is an event, so a browser opened while the
    // arcade is already running would otherwise miss it.  The state mirror
    // makes the Paper Playground reliable on reconnect as well.
    if (topic === "state.arcade") {
      if (payload && payload.active) onScreensaverActivated();
      else onScreensaverDeactivated();
    }
    if (topic === "notify.push") { renderToast(payload); }
    if (topic === "chat.message" || topic === "chat.token" || topic === "chat.ended") { renderChatEvent(topic, payload); }
    if (topic === "layer.activated") { onLayerActivated(payload); }
    if (topic === "screensaver.activated") { onScreensaverActivated(); }
    if (topic === "screensaver.deactivated") { onScreensaverDeactivated(); }
    if (topic === "stt.utterance") { onSttUtterance(payload); }
    if (topic === "arcade.launched") { onArcadeLaunched(payload); }
    if (topic === "arcade.game.demo") { onArcadeDemo(payload); }
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
      // settings drawer loads its schema the moment it becomes visible
      if (l.id === "settings" && l.visible && prevLayerVisible[l.id] === false) {
        loadSettings();
      }
      prevLayerVisible[l.id] = l.visible;
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

  // ---------------------------------------------------------------- chat

  function sendChat(text) {
    text = (text || "").trim();
    if (!text) return;
    var body = { content: text };
    if (chatSessionId) body.sessionId = chatSessionId;
    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data && data.sessionId) chatSessionId = data.sessionId;
      })
      .catch(function() {});
  }

  function renderChatEvent(topic, payload) {
    var msgs = document.getElementById("chat-messages");
    if (!msgs) return;
    if (topic === "chat.message") {
      // an assistant chat.message with empty content marks stream start:
      // create the div now, tokens append into it
      var div = document.createElement("div");
      div.className = "chat-msg chat-" + (payload.role || "assistant");
      div.textContent = payload.content || "";
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
    } else if (topic === "chat.token") {
      var last = msgs.lastElementChild;
      if (last && last.classList.contains("chat-assistant")) {
        last.textContent += payload.delta;
        msgs.scrollTop = msgs.scrollHeight;
      }
    } else if (topic === "chat.ended") {
      msgs.scrollTop = msgs.scrollHeight;
    }
  }

  function onLayerActivated(payload) {
    if (!payload) return;
    if (payload.layer === "desktop" && payload.x != null) {
      spawnChatBubble(payload.x, payload.y);
    }
    // only Click is exposed on /api/layers, so a layer.activated for
    // "settings" is the gear button's toggle signal
    if (payload.layer === "settings") {
      toggleSettingsPanel();
    }
  }

  function spawnChatBubble(x, y) {
    var bubble = document.getElementById("chat-bubble");
    if (!bubble) return;
    bubble.classList.remove("hidden");
    bubble.style.left = x + "px";
    bubble.style.top = y + "px";
    bubble.innerHTML = "";
    var input = document.createElement("input");
    input.type = "text";
    input.className = "bubble-input";
    input.placeholder = "Ask Vee...";
    input.addEventListener("keydown", function(e) {
      if (e.key === "Enter") {
        sendChat(input.value);
        bubble.classList.add("hidden");
      }
    });
    bubble.appendChild(input);
    input.focus();
    setTimeout(function() { bubble.classList.add("hidden"); }, 5000);
  }

  // ------------------------------------------------------------- settings

  function toggleSettingsPanel() {
    var panel = document.getElementById("settings-panel");
    if (!panel) return;
    panel.classList.toggle("hidden");
    if (!panel.classList.contains("hidden")) loadSettings();
  }

  function loadSettings() {
    fetch("/api/settings")
      .then(function(r) { return r.json(); })
      .then(renderSettings)
      .catch(function() {});
  }

  function renderSettings(schema) {
    var body = document.getElementById("settings-body");
    if (!body) return;
    body.innerHTML = "";
    var groups = {};
    var order = [];
    (schema || []).forEach(function(sp) {
      var g = sp.group || "General";
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(sp);
    });
    order.forEach(function(g) {
      var sec = document.createElement("div");
      sec.className = "settings-group";
      var h = document.createElement("h3");
      h.className = "settings-group-title";
      h.textContent = g;
      sec.appendChild(h);
      groups[g].forEach(function(sp) { sec.appendChild(settingField(sp)); });
      body.appendChild(sec);
    });
  }

  function settingField(sp) {
    var row = document.createElement("label");
    row.className = "setting-row";
    if (sp.description) row.title = sp.description;

    var label = document.createElement("span");
    label.className = "setting-label";
    label.textContent = sp.label || sp.key;
    row.appendChild(label);

    var input;
    if (sp.options && sp.options.length) {
      input = document.createElement("select");
      sp.options.forEach(function(opt) {
        var o = document.createElement("option");
        o.value = opt.value;
        o.textContent = opt.label || opt.value;
        if (String(sp.value) === String(opt.value)) o.selected = true;
        input.appendChild(o);
      });
    } else if (sp.type === "bool") {
      input = document.createElement("input");
      input.type = "checkbox";
      input.checked = String(sp.value) === "true";
    } else if (sp.type === "number") {
      input = document.createElement("input");
      input.type = "number";
      input.value = sp.value;
      if (sp.min !== undefined && sp.min !== 0) input.min = sp.min;
      if (sp.max !== undefined && sp.max !== 0) input.max = sp.max;
    } else {
      input = document.createElement("input");
      input.type = "text";
      input.value = sp.value || "";
    }
    input.className = "setting-input";
    input.addEventListener("change", function() {
      var val = input.type === "checkbox" ? (input.checked ? "true" : "false") : input.value;
      fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: sp.key, value: String(val) })
      }).catch(function() {});
    });
    row.appendChild(input);
    return row;
  }

  // -------------------------------------------------------------- arcade

  var ARCADE_ART = {
    arkanoid: "Craft Breaker",
    tetris: "Paper Stack",
    frogger: "Puddle Hopper",
    mario: "Big Fold-Out",
    racer: "Grand Prix",
    sidescroller: "Sticker Safari",
    dressup: "Wardrobe"
  };

  var ARCADE_BLURBS = {
    arkanoid: "Bounce a paper ball through Violet's craft-table bricks.",
    tetris: "Stack gift-box pieces and fold bright rows into airplanes.",
    frogger: "Help Violet hop across toy roads and tissue-paper water.",
    mario: "Leap through a pop-up-book world full of friendly surprises.",
    racer: "Race wind-up toys around a cheerful cardboard track.",
    sidescroller: "Run, hop and peel new friends into your sticker book.",
    dressup: "Make a look, save a Polaroid and share the sparkle."
  };
  var PAPER_PLAYGROUND_IDS = {
    arkanoid: true, tetris: true, frogger: true, mario: true,
    racer: true, sidescroller: true, dressup: true
  };

  function arcadeLabel(entry) {
    return entry.name || entry.title || entry.id || "New game";
  }

  function arcadeMeta(entry) {
    return (entry.meta && (entry.meta.genre || entry.meta.engine)) || entry.description || "Paper playground";
  }

  function renderGameShelf() {
    var content = document.getElementById("arcade-content");
    if (!content || gameActive) return;
    content.innerHTML = "";

    var header = document.createElement("header");
    header.className = "arcade-head";
    header.innerHTML =
      '<div class="arcade-kicker">Vee’s paper playground</div>' +
      '<div class="arcade-head-row">' +
        '<div><h1>Pick a little adventure</h1><p>Every game is made for curious hands: kind challenges, big celebrations and plenty of room to play.</p></div>' +
        '<button class="arcade-dismiss" type="button" aria-label="Close arcade">Close</button>' +
      '</div>';
    content.appendChild(header);

    var welcome = document.createElement("section");
    welcome.className = "arcade-welcome";
    welcome.setAttribute("aria-label", "Meet the arcade friends");
    welcome.innerHTML =
      '<div class="arcade-welcome-copy">' +
        '<span class="arcade-badge">★ 7 handmade games</span>' +
        '<h2>Violet saved you a seat.</h2>' +
        '<p>Collect stickers, discover new outfits, and keep every good try.</p>' +
      '</div>' +
      '<div class="arcade-friends">' +
        '<figure class="arcade-friend arcade-friend--violet"><img src="/static/assets/characters/violet/solo.png" alt="Violet, the arcade adventurer"></figure>' +
        '<figure class="arcade-friend arcade-friend--flex"><img src="/static/assets/characters/frogmaster-flex/solo.png" alt="Frogmaster Flex"></figure>' +
        '<figure class="arcade-friend arcade-friend--kellee"><img src="/static/assets/characters/princess-kellee/solo.png" alt="Princess Kellee"></figure>' +
      '</div>';
    content.appendChild(welcome);

    var shelfHeading = document.createElement("div");
    shelfHeading.className = "arcade-shelf-heading";
    shelfHeading.innerHTML = '<h2 id="arcade-games-heading">Choose a game</h2><p>Arrow keys and touch both work in every adventure.</p>';
    content.appendChild(shelfHeading);

    var shelf = document.createElement("div");
    shelf.className = "game-shelf";
    shelf.id = "game-shelf";
    shelf.setAttribute("aria-labelledby", "arcade-games-heading");
    // The registry can retain legacy game entries from older Vee installs.
    // The Paper Playground is a deliberately curated seven-game collection;
    // don't put stale cartridges on the new shelf where their files no longer
    // exist and a young player can accidentally choose one.
    var games = (state.registry.games || []).filter(function(entry) {
      return !!PAPER_PLAYGROUND_IDS[entry.id];
    });
    if (!games.length) {
      var empty = document.createElement("div");
      empty.className = "arcade-empty";
      empty.textContent = "The shelf is empty — no cartridges yet.";
      shelf.appendChild(empty);
    }
    games.forEach(function(entry) {
      var tile = document.createElement("button");
      tile.type = "button";
      tile.className = "game-tile game-tile--" + (entry.id || "new");
      tile.setAttribute("data-game", entry.id);
      tile.setAttribute("aria-label", "Play " + arcadeLabel(entry));
      var art = document.createElement("div");
      art.className = "game-art";
      art.setAttribute("aria-hidden", "true");
      var icon = document.createElement("span");
      icon.className = "game-art-icon";
      icon.textContent = ARCADE_ART[entry.id] || "Play";
      art.appendChild(icon);
      var title = document.createElement("div");
      title.className = "game-title";
      title.textContent = arcadeLabel(entry);
      var meta = document.createElement("div");
      meta.className = "game-meta";
      meta.textContent = ARCADE_BLURBS[entry.id] || arcadeMeta(entry);
      var cta = document.createElement("span");
      cta.className = "game-cta";
      cta.textContent = "Play now";
      tile.appendChild(art);
      tile.appendChild(title);
      tile.appendChild(meta);
      tile.appendChild(cta);
      shelf.appendChild(tile);
    });
    content.appendChild(shelf);

    var dismiss = header.querySelector(".arcade-dismiss");
    if (dismiss) dismiss.addEventListener("click", function(ev) {
      ev.stopPropagation();
      var overlay = document.getElementById("arcade-overlay");
      if (overlay) overlay.classList.add("hidden");
      fetch("/api/arcade/dismiss", { method: "POST" }).catch(function() {});
    });
  }

  function showArcadeChoice() {
    var overlay = document.getElementById("arcade-overlay");
    if (!overlay || overlay.querySelector(".arcade-choice")) return;
    var box = document.createElement("div");
    box.className = "arcade-choice";

    var pitter = document.createElement("button");
    pitter.className = "choice-btn";
    pitter.textContent = "pitter-patter";
    pitter.addEventListener("click", function(ev) {
      ev.stopPropagation();
      fetch("/api/arcade/dismiss", { method: "POST" }).catch(function() {});
    });

    var games = document.createElement("button");
    games.className = "choice-btn";
    games.textContent = "games";
    games.addEventListener("click", function(ev) {
      ev.stopPropagation();
      box.remove();
      var shelf = document.getElementById("game-shelf");
      if (shelf) shelf.classList.add("shelf-highlight");
    });

    box.appendChild(pitter);
    box.appendChild(games);
    overlay.appendChild(box);
  }

  // the arcade publishes {"game": Game} with untagged struct fields,
  // so keys arrive uppercase (ID/Title/Entry) — accept both shapes
  function embedGame(payload, demo) {
    var g = (payload && payload.game) || payload || {};
    var id = g.ID || g.id;
    var entry = g.Entry || g.entry || "index.html";
    var title = g.Title || g.title || id;
    if (!id) return;
    var content = document.getElementById("arcade-content");
    if (!content) return;
    gameActive = true;
    content.innerHTML = "";

    var frame = document.createElement("div");
    frame.className = "game-frame";

    var bar = document.createElement("div");
    bar.className = "game-bar";
    var name = document.createElement("span");
    name.className = "game-bar-title";
    name.textContent = title + (demo ? " — demo" : "");
    var close = document.createElement("button");
    close.className = "game-close";
    close.textContent = "Back to shelf";
    close.title = "Close";
    close.addEventListener("click", function(ev) {
      ev.stopPropagation();
      fetch("/api/arcade/dismiss", { method: "POST" }).catch(function() {});
      teardownGame();
    });
    bar.appendChild(name);
    bar.appendChild(close);

    var iframe = document.createElement("iframe");
    iframe.className = "game-iframe";
    iframe.src = "/arcade/games/" + id + "/" + entry;
    iframe.setAttribute("allow", "fullscreen; gamepad; autoplay");

    frame.appendChild(bar);
    frame.appendChild(iframe);
    content.appendChild(frame);
  }

  function teardownGame() {
    gameActive = false;
    renderGameShelf();
  }

  function onArcadeLaunched(payload) { embedGame(payload, false); }
  function onArcadeDemo(payload) { embedGame(payload, true); }

  function onScreensaverActivated() {
    var arcade = document.getElementById("arcade-overlay");
    if (arcade) arcade.classList.remove("hidden");
    gameActive = false;
    renderGameShelf();
  }

  function onScreensaverDeactivated() {
    var arcade = document.getElementById("arcade-overlay");
    if (arcade) {
      arcade.classList.add("hidden");
      var choice = arcade.querySelector(".arcade-choice");
      if (choice) choice.remove();
    }
    teardownGame();
  }

  // --------------------------------------------------------------- speech

  function onSttUtterance(payload) {
    if (!payload || !payload.text) return;
    var bubble = document.getElementById("chat-bubble");
    var input = (bubble && !bubble.classList.contains("hidden"))
      ? bubble.querySelector("input")
      : document.getElementById("chat-input");
    if (input) {
      input.value = payload.text;
      input.focus();
    }
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

    // desktop click: glowing cursor at the point + server-side click
    document.getElementById("desktop").addEventListener("click", function(e) {
      var x = e.clientX, y = e.clientY;
      var cursor = document.getElementById("cursor");
      if (cursor) {
        cursor.style.left = x + "px";
        cursor.style.top = y + "px";
        cursor.style.display = "block";
        cursor.classList.remove("pulse");
        void cursor.offsetWidth; // restart the pulse animation
        cursor.classList.add("pulse");
      }
      fetch("/api/layers", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({layer:"desktop",x:x,y:y}) });
    });

    // arcade overlay: tile click launches, any other click asks the question
    document.getElementById("arcade-overlay").addEventListener("click", function(e) {
      if (gameActive) return;
      var tile = e.target.closest("[data-game]");
      if (tile) {
        var gameId = tile.getAttribute("data-game");
        fetch("/api/arcade/launch", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({gameId:gameId}) });
        return;
      }
      if (e.target.closest(".arcade-choice")) return;
      showArcadeChoice();
    });

    // chat input: Enter, send button, all via fetch (no htmx)
    var chatInput = document.getElementById("chat-input");
    if (chatInput) {
      chatInput.addEventListener("keydown", function(e) {
        if (e.key === "Enter") {
          sendChat(chatInput.value);
          chatInput.value = "";
        }
      });
    }
    var sendBtn = document.getElementById("chat-send");
    if (sendBtn) {
      sendBtn.addEventListener("click", function() {
        sendChat(chatInput.value);
        chatInput.value = "";
      });
    }

    // mic: start a recording; the result arrives as stt.utterance over SSE
    var micBtn = document.getElementById("mic-btn");
    if (micBtn) {
      micBtn.addEventListener("click", function() {
        fetch("/api/speech/record", { method: "POST" }).catch(function() {});
      });
    }

    // gear button: /api/layers only exposes Click, so publish the click and
    // let the layer.activated round-trip toggle the drawer
    var gear = document.getElementById("settings-gear");
    if (gear) {
      gear.addEventListener("click", function() {
        fetch("/api/layers", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({layer:"settings"}) });
      });
    }

    // generic [data-command] delegation → macros (backs #vee-btn)
    document.addEventListener("click", function(e) {
      var el = e.target.closest ? e.target.closest("[data-command]") : null;
      if (!el) return;
      var id = el.getAttribute("data-command");
      if (!id) return;
      fetch("/api/macros/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: id })
      }).catch(function() {});
    });

    applyLexicon();
    applyTheme();
  });
})();
