/* HabitGlo LED dot-matrix sign: a canvas renderer that behaves like real hardware.
   - 5x7 bitmap font, one font pixel = one LED
   - scrolls by whole columns (discrete steps), with a short phosphor-style decay
   - pre-rendered unlit grid + additive bloom sprites, so a frame is one blit plus N lit dots
   - pauses when off-screen or the tab is hidden; static "page flip" mode for reduced motion */
;(function () {
  'use strict'

  var G = {
    A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
    C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
    D: ['###..', '#..#.', '#...#', '#...#', '#...#', '#..#.', '###..'],
    E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
    G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
    H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
    J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
    K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
    L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
    M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
    N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
    O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
    R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
    S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
    T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
    W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
    X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
    Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
    Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
    0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
    1: ['.#.', '##.', '.#.', '.#.', '.#.', '.#.', '###'],
    2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
    3: ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
    4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
    5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
    7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
    8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
    9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
    '.': ['.', '.', '.', '.', '.', '.', '#'],
    ',': ['..', '..', '..', '..', '..', '.#', '#.'],
    '!': ['#', '#', '#', '#', '#', '.', '#'],
    '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
    '-': ['...', '...', '...', '###', '...', '...', '...'],
    ':': ['.', '#', '.', '.', '.', '#', '.'],
    "'": ['#', '#', '.', '.', '.', '.', '.'],
    '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
    '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
    '$': ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'],
    '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
    '*': ['...', '...', '.#.', '###', '.#.', '...', '...'],
    ' ': ['...', '...', '...', '...', '...', '...', '...'],
  }

  var COLORS = {
    amber: { core: '#fff1c7', body: '#ffb000', glow: '255,176,0' },
    red: { core: '#ffd9d3', body: '#ff3b30', glow: '255,59,48' },
    green: { core: '#e4ffe6', body: '#5bff6b', glow: '91,255,107' },
  }

  var cache = {}
  function glyphCols(ch) {
    if (cache[ch]) return cache[ch]
    var g = G[ch] || G[' ']
    var w = g[0].length
    var cols = []
    for (var x = 0; x < w; x++) {
      var mask = 0
      for (var y = 0; y < 7; y++) if (g[y].charAt(x) === '#') mask |= 1 << y
      cols.push(mask)
    }
    cache[ch] = cols
    return cols
  }

  /* Text -> array of {m: bitmask, c: colorKey, b: brightness} columns */
  function textToCols(text, color, bright) {
    var out = []
    var s = String(text).toUpperCase()
    for (var i = 0; i < s.length; i++) {
      var cols = glyphCols(s.charAt(i))
      for (var j = 0; j < cols.length; j++) out.push({ m: cols[j], c: color, b: bright == null ? 1 : bright })
      out.push({ m: 0, c: color, b: 0 })
    }
    if (out.length) out.pop()
    return out
  }

  function blank(n) {
    var out = []
    for (var i = 0; i < n; i++) out.push({ m: 0, c: 'amber', b: 0 })
    return out
  }

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)')

  function Sign(canvas, opts) {
    opts = opts || {}
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.rows = opts.rows || 11
    this.speed = opts.speed || 18
    this.gap = opts.gap == null ? 7 : opts.gap
    this.mode = opts.mode || 'scroll'
    this.flipMs = opts.flipMs || 1700
    this.housing = opts.housing || '#0b0907'
    this.offDot = opts.offDot || '#211b15'
    this.separator = opts.separator !== false
    this.running = false
    this.userPaused = false
    this.visible = false
    this.offset = 0
    this.acc = 0
    this.last = 0
    this.flipIndex = 0
    this.flipAt = 0
    this.levels = null
    this.colorBuf = null
    this.setMessages(opts.messages || [{ text: 'HABITGLO', color: 'amber' }])
    this._frame = this._frame.bind(this)
    this._observe()
  }

  Sign.prototype.setMessages = function (messages, startColumn) {
    this.messages = messages
    var tape = []
    for (var i = 0; i < messages.length; i++) {
      var m = messages[i]
      tape = tape.concat(textToCols(m.text, m.color || 'amber', 1))
      if (messages.length > 1 || this.mode === 'scroll') {
        tape = tape.concat(blank(this.gap))
        if (this.separator) tape = tape.concat(textToCols('*', m.color || 'amber', 0.55))
        tape = tape.concat(blank(this.gap))
      }
    }
    this.tape = tape
    this.flipPages = null
    this.flipIndex = 0
    this.flipAt = 0
    this.offset = startColumn == null ? -(this.cols || 0) : startColumn
    this.dirty = true
    if (this.cols) this._buildFlipPages()
    if (!this.running) this.draw()
  }

  Sign.prototype.setSpeed = function (s) { this.speed = s }

  Sign.prototype._isStatic = function () {
    return this.mode === 'flip' || (reduceMotion && reduceMotion.matches)
  }

  /* Split messages into pages that fit the visible width (word-wrapped), for static mode */
  Sign.prototype._buildFlipPages = function () {
    var pages = []
    var cols = this.cols
    for (var i = 0; i < this.messages.length; i++) {
      var m = this.messages[i]
      var words = String(m.text).split(/\s+/)
      var line = ''
      for (var w = 0; w < words.length; w++) {
        var next = line ? line + ' ' + words[w] : words[w]
        if (textToCols(next, m.color).length <= cols - 2 || !line) {
          line = next
        } else {
          pages.push(this._center(textToCols(line, m.color || 'amber', 1)))
          line = words[w]
        }
      }
      if (line) pages.push(this._center(textToCols(line, m.color || 'amber', 1)))
    }
    this.flipPages = pages
  }

  Sign.prototype._center = function (cols) {
    var pad = Math.max(0, Math.floor((this.cols - cols.length) / 2))
    var out = blank(pad).concat(cols)
    return out.slice(0, this.cols)
  }

  Sign.prototype.resize = function () {
    var rect = this.canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return false
    var dpr = Math.min(window.devicePixelRatio || 1, 2)
    var W = Math.round(rect.width * dpr)
    var H = Math.round(rect.height * dpr)
    if (W === this.W && H === this.H) return true
    this.W = W
    this.H = H
    this.canvas.width = W
    this.canvas.height = H
    this.pitch = H / this.rows
    this.cols = Math.ceil(W / this.pitch)
    this.padX = (W - this.cols * this.pitch) / 2
    this.levels = new Float32Array(this.cols * 7)
    this.colorBuf = new Array(this.cols * 7)
    this.variance = new Float32Array(this.cols * 7)
    for (var i = 0; i < this.variance.length; i++) this.variance[i] = 0.84 + Math.random() * 0.16
    this._buildSprites()
    this._buildGrid()
    this._buildFlipPages()
    if (this.offset < -this.cols) this.offset = -this.cols
    return true
  }

  Sign.prototype._buildGrid = function () {
    var p = this.pitch
    var c = document.createElement('canvas')
    c.width = this.W
    c.height = this.H
    var g = c.getContext('2d')
    g.fillStyle = this.housing
    g.fillRect(0, 0, this.W, this.H)
    var r = p * 0.34
    for (var y = 0; y < this.rows; y++) {
      for (var x = 0; x < this.cols; x++) {
        var cx = this.padX + x * p + p / 2
        var cy = y * p + p / 2
        var grad = g.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r)
        grad.addColorStop(0, '#2c251d')
        grad.addColorStop(1, this.offDot)
        g.fillStyle = grad
        g.beginPath()
        g.arc(cx, cy, r, 0, Math.PI * 2)
        g.fill()
      }
    }
    this.grid = c
  }

  Sign.prototype._buildSprites = function () {
    var p = this.pitch
    var size = Math.ceil(p * 3.2)
    this.spriteSize = size
    this.sprites = {}
    for (var key in COLORS) {
      var col = COLORS[key]
      var c = document.createElement('canvas')
      c.width = c.height = size
      var g = c.getContext('2d')
      var mid = size / 2
      var halo = g.createRadialGradient(mid, mid, 0, mid, mid, mid)
      halo.addColorStop(0, 'rgba(' + col.glow + ',0.34)')
      halo.addColorStop(0.22, 'rgba(' + col.glow + ',0.16)')
      halo.addColorStop(0.5, 'rgba(' + col.glow + ',0.05)')
      halo.addColorStop(1, 'rgba(' + col.glow + ',0)')
      g.fillStyle = halo
      g.fillRect(0, 0, size, size)
      var r = p * 0.36
      var dot = g.createRadialGradient(mid - r * 0.2, mid - r * 0.25, 0, mid, mid, r)
      dot.addColorStop(0, col.core)
      dot.addColorStop(0.45, col.body)
      dot.addColorStop(1, 'rgba(' + col.glow + ',0.85)')
      g.fillStyle = dot
      g.beginPath()
      g.arc(mid, mid, r, 0, Math.PI * 2)
      g.fill()
      this.sprites[key] = c
    }
  }

  Sign.prototype._columnsForFrame = function () {
    if (this._isStatic() && this.flipPages && this.flipPages.length) {
      return this.flipPages[this.flipIndex % this.flipPages.length]
    }
    var out = new Array(this.cols)
    var n = this.tape.length
    for (var x = 0; x < this.cols; x++) {
      var i = this.offset + x
      if (i < 0 || !n) { out[x] = null; continue }
      out[x] = this.tape[i % n]
    }
    return out
  }

  Sign.prototype.draw = function (decay) {
    if (!this.levels && !this.resize()) return
    var g = this.ctx
    var p = this.pitch
    var cols = this._columnsForFrame()
    var lv = this.levels
    var cb = this.colorBuf
    var k = decay == null ? 0 : decay
    for (var x = 0; x < this.cols; x++) {
      var col = cols[x]
      for (var y = 0; y < 7; y++) {
        var idx = x * 7 + y
        var on = col && col.m & (1 << y) ? col.b : 0
        if (on > 0) { lv[idx] = on; cb[idx] = col.c }
        else lv[idx] = lv[idx] * k
      }
    }
    g.globalCompositeOperation = 'source-over'
    g.globalAlpha = 1
    g.drawImage(this.grid, 0, 0)
    g.globalCompositeOperation = 'lighter'
    var half = this.spriteSize / 2
    var top = Math.floor((this.rows - 7) / 2)
    for (var i = 0; i < lv.length; i++) {
      var l = lv[i]
      if (l < 0.04) continue
      var cx = this.padX + Math.floor(i / 7) * p + p / 2
      var cy = (top + (i % 7)) * p + p / 2
      g.globalAlpha = Math.min(1, l * this.variance[i])
      g.drawImage(this.sprites[cb[i] || 'amber'], cx - half, cy - half)
    }
    g.globalAlpha = 1
    g.globalCompositeOperation = 'source-over'
  }

  Sign.prototype._frame = function (now) {
    if (!this.running) return
    var dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0
    this.last = now
    if (this._isStatic()) {
      if (!this.flipAt) this.flipAt = now + this.flipMs
      if (now >= this.flipAt) {
        this.flipIndex++
        this.flipAt = now + this.flipMs
      }
      this.draw(0)
    } else {
      this.acc += dt * this.speed
      var steps = Math.floor(this.acc)
      if (steps > 0) {
        this.acc -= steps
        this.offset += steps
        if (this.tape.length && this.offset > this.tape.length * 4) this.offset -= this.tape.length * 3
      }
      this.draw(Math.pow(1e-12, dt))
    }
    this.raf = requestAnimationFrame(this._frame)
  }

  Sign.prototype._update = function () {
    var should = this.visible && !this.userPaused && !document.hidden
    if (should && !this.running) {
      this.running = true
      this.last = 0
      this.raf = requestAnimationFrame(this._frame)
    } else if (!should && this.running) {
      this.running = false
      cancelAnimationFrame(this.raf)
    }
  }

  Sign.prototype.pause = function () { this.userPaused = true; this._update() }
  Sign.prototype.play = function () { this.userPaused = false; this._update() }
  Sign.prototype.toggle = function () { this.userPaused ? this.play() : this.pause(); return !this.userPaused }

  Sign.prototype._observe = function () {
    var self = this
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        self.visible = entries[0].isIntersecting
        if (self.visible) { self.resize(); self.draw() }
        self._update()
      }, { rootMargin: '80px' }).observe(this.canvas)
    } else {
      this.visible = true
    }
    if ('ResizeObserver' in window) {
      new ResizeObserver(function () {
        if (self.resize()) self.draw()
      }).observe(this.canvas)
    }
    document.addEventListener('visibilitychange', function () { self._update() })
    if (reduceMotion && reduceMotion.addEventListener) {
      reduceMotion.addEventListener('change', function () { self.draw() })
    }
    this._update()
  }

  window.HabitGloLED = { Sign: Sign, textToCols: textToCols }

  /* Auto-init: <canvas data-led='[{"text":"...","color":"amber"}]' data-led-rows="11" data-led-speed="18"> */
  function autoInit() {
    var nodes = document.querySelectorAll('canvas[data-led]')
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i]
      if (el._sign) continue
      var msgs
      try { msgs = JSON.parse(el.getAttribute('data-led')) } catch (e) { msgs = [{ text: el.getAttribute('data-led') }] }
      el._sign = new Sign(el, {
        messages: msgs,
        rows: Number(el.getAttribute('data-led-rows')) || 11,
        speed: Number(el.getAttribute('data-led-speed')) || 18,
        mode: el.getAttribute('data-led-mode') || 'scroll',
      })
    }
    var toggles = document.querySelectorAll('[data-led-toggle]')
    for (var j = 0; j < toggles.length; j++) {
      ;(function (btn) {
        var target = document.getElementById(btn.getAttribute('data-led-toggle'))
        if (!target || !target._sign) return
        btn.addEventListener('click', function () {
          var playing = target._sign.toggle()
          btn.setAttribute('aria-pressed', playing ? 'false' : 'true')
          btn.setAttribute('aria-label', playing ? 'Pause the LED sign' : 'Play the LED sign')
        })
      })(toggles[j])
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoInit)
  else autoInit()
})()
