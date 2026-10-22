/* HabitGlo demo film: a deterministic, code-built screen recording.
   render(t) derives every element's state from the timeline position t (seconds),
   so seeking to a chapter, pausing and looping are exact. */
;(function () {
  'use strict'

  var viewport = document.getElementById('film')
  if (!viewport || !window.HabitGloLED) return

  var DURATION = 30
  var W = 1280
  var H = 800
  var STRIP = 58
  var TYPED = 'Follow up with leads today'

  var CHAPTERS = [
    { start: 0, end: 5, label: 'Morning', lead: '9:12 AM.', rest: 'Your day is already crowded.' },
    { start: 5, end: 9, label: 'Open', lead: 'Open HabitGlo.', rest: 'One click from the taskbar.' },
    { start: 9, end: 15, label: 'Type', lead: 'Type what matters.', rest: 'Press Enter. That\u2019s it.' },
    { start: 15, end: 20.5, label: 'Dock', lead: 'It docks to the top of your screen.', rest: 'Your windows make room.' },
    { start: 20.5, end: 30, label: 'All day', lead: 'Then it keeps you on track.', rest: 'All day.' },
  ]

  var LED_SEGMENTS = [
    { at: 15.6, speed: 24, msgs: [{ text: 'FOLLOW UP WITH LEADS TODAY', color: 'amber' }] },
    { at: 20.8, speed: 44, msgs: [{ text: 'ONE CONTENT RECORDING BEFORE LUNCH', color: 'amber' }] },
    { at: 22.9, speed: 44, msgs: [{ text: 'DRINK WATER', color: 'green' }, { text: 'SIT UP STRAIGHT', color: 'amber' }, { text: 'BLINK', color: 'green' }] },
    { at: 25.2, speed: 44, msgs: [{ text: 'REVIEW YOUR NUMBERS', color: 'amber' }] },
    { at: 27.5, speed: 40, msgs: [{ text: 'DONE IS BETTER THAN PERFECT', color: 'amber' }] },
  ]

  var CURSOR = [
    [0, 900, 430], [1.6, 760, 300], [3.1, 600, 470], [4.6, 690, 610], [6.2, 750, 774],
    [7.6, 700, 560], [9.5, 560, 306], [13.0, 560, 306], [14.6, 760, 420], [16.6, 640, 210],
    [20.4, 660, 230], [23, 980, 380], [26, 300, 450], [30, 900, 430],
  ]
  var CLICKS = [6.35, 9.65]

  var CAMERA = [
    [0, 640, 400, 1], [4.6, 640, 400, 1], [5.9, 720, 600, 1.22], [8.4, 640, 390, 1.12],
    [9.4, 640, 330, 1.34], [14.6, 640, 330, 1.34], [15.6, 640, 330, 1.08], [16.8, 640, 160, 1.5],
    [19.9, 640, 160, 1.5], [21, 640, 276, 1], [30, 640, 276, 1],
  ]

  var CLOCK = [
    [0, 552], [15, 553], [20.5, 554], [21.1, 665], [22.8, 665], [23.4, 870], [25.1, 870],
    [25.7, 1065], [27.4, 1065], [28.0, 1280], [30, 1280],
  ]

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v }
  function ease(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2 }
  function prog(t, a, b) { return clamp((t - a) / (b - a), 0, 1) }
  function track(keys, t, eased) {
    if (t <= keys[0][0]) return keys[0].slice(1)
    for (var i = 1; i < keys.length; i++) {
      if (t <= keys[i][0]) {
        var a = keys[i - 1]
        var b = keys[i]
        var p = (t - a[0]) / (b[0] - a[0])
        if (eased) p = ease(p)
        var out = []
        for (var k = 1; k < a.length; k++) out.push(a[k] + (b[k] - a[k]) * p)
        return out
      }
    }
    return keys[keys.length - 1].slice(1)
  }
  function fmtClock(mins) {
    mins = Math.round(mins)
    var h = Math.floor(mins / 60) % 24
    var m = mins % 60
    var ap = h >= 12 ? 'PM' : 'AM'
    var hh = h % 12 || 12
    return hh + ':' + (m < 10 ? '0' : '') + m + ' ' + ap
  }

  var built = false
  var el = {}
  var strip
  var t = 0
  var playing = false
  var userPaused = false
  var inView = false
  var last = 0
  var raf = 0
  var ledKey = -1
  var chapterIdx = -1
  var narrow = false
  var cache = {}

  var playBtn = document.getElementById('film-play')
  var chapterList = document.getElementById('film-chapters')
  var caption = document.getElementById('film-caption')
  var realBtn = document.getElementById('film-real')
  var poster = document.getElementById('film-poster')

  var fidCount = 0
  function set(node, prop, value) {
    if (!node._fid) node._fid = 'n' + fidCount++ + ':'
    var key = node._fid + prop
    if (cache[key] === value) return
    cache[key] = value
    if (prop === 'text') node.textContent = value
    else if (prop === 'class') node.className = value
    else node.style[prop] = value
  }

  var MAIL = [
    ['Dana Whitfield', 'Re: Proposal draft', '9:02'],
    ['Accounts', 'Invoice #0112', '8:47'],
    ['Leo Park', 'Lunch Thursday?', '8:30'],
    ['Mira Osei', 'Intro: two new leads', 'Yest.'],
    ['Team', 'Weekly sync notes', 'Yest.'],
    ['Billing', 'Your receipt', 'Mon'],
    ['Sam R.', 'Photos from Sunday', 'Mon'],
    ['Studio', 'Recording slots this week', 'Sun'],
    ['Newsletter', 'Five quiet habits', 'Sun'],
  ]

  function build() {
    if (built) return
    built = true
    var mailRows = MAIL.map(function (m, i) {
      return '<div class="mail-row" data-mail="' + i + '"><i class="dot"></i><div><b>' + m[0] + '</b><span>' + m[1] + '</span></div><time>' + m[2] + '</time></div>'
    }).join('')
    var docLines = ''
    var widths = ['l', 'm', 'l', 's', 'l', 'm', 'l', 'l', 's', 'm', 'l', 'm', 's', 'l', 'm', 'l']
    for (var i = 0; i < widths.length; i++) docLines += '<div class="bar ' + widths[i] + '" data-doc="' + i + '"></div>'
    var cells = '<div class="hd"></div><div class="hd">Oct</div><div class="hd">Nov</div><div class="hd">Dec</div>'
    var rows = [['Leads', '42', '51', '58'], ['Calls', '18', '22', '27'], ['Closed', '6', '8', '11'], ['Content', '9', '12', '14'], ['Revenue', '3.1k', '4.2k', '5.0k'], ['Costs', '1.2k', '1.3k', '1.2k']]
    rows.forEach(function (r) { r.forEach(function (c, j) { cells += '<div' + (j === 0 ? ' class="hd"' : '') + '>' + c + '</div>' }) })
    var bars = ''
    for (var b = 0; b < 7; b++) bars += '<i data-bar="' + b + '"></i>'

    var hgDots = '<svg viewBox="0 0 50 70"><g><circle cx="5" cy="5" r="4"/><circle cx="5" cy="15" r="4"/><circle cx="5" cy="25" r="4"/><circle cx="5" cy="35" r="4"/><circle cx="5" cy="45" r="4"/><circle cx="5" cy="55" r="4"/><circle cx="5" cy="65" r="4"/><circle cx="45" cy="5" r="4"/><circle cx="45" cy="15" r="4"/><circle cx="45" cy="25" r="4"/><circle cx="45" cy="35" r="4"/><circle cx="45" cy="45" r="4"/><circle cx="45" cy="55" r="4"/><circle cx="45" cy="65" r="4"/><circle cx="15" cy="35" r="4"/><circle cx="25" cy="35" r="4"/><circle cx="35" cy="35" r="4"/></g></svg>'

    var html =
      '<div class="stage" aria-hidden="true">' +
        '<div class="cam">' +
          '<div class="wall"><i class="w-base"></i><i class="w-morning"></i><i class="w-noon"></i><i class="w-evening"></i><i class="w-night"></i></div>' +
          '<div class="desk-area">' +
            '<div class="win" data-win="mail" style="left:24px;width:396px"><div class="win-title"><span class="win-ico" style="background:#5d7fae"></span>Inbox<span class="ctl">&#8211; &#9633; &#10005;</span></div><div class="win-body">' + mailRows + '</div></div>' +
            '<div class="win" data-win="doc" style="left:436px;width:488px"><div class="win-title"><span class="win-ico" style="background:#7c8fb8"></span>Launch plan.txt<span class="ctl">&#8211; &#9633; &#10005;</span></div><div class="win-body" style="padding:26px 30px"><div class="bar h"></div>' + docLines + '</div></div>' +
            '<div class="win" data-win="sheet" style="left:940px;width:316px"><div class="win-title"><span class="win-ico" style="background:#5c8f6a"></span>Numbers Q4<span class="ctl">&#8211; &#9633; &#10005;</span></div><div class="win-body"><div class="sheet" style="grid-template-columns:1.3fr 1fr 1fr 1fr">' + cells + '</div><div class="chart">' + bars + '</div></div></div>' +
          '</div>' +
          '<div class="hg-app" data-app>' +
            '<div class="win-title"><span class="hg-mini">' + hgDots + '</span>HabitGlo<span class="ctl">&#8211; &#9633; &#10005;</span></div>' +
            '<div class="hg-app-body">' +
              '<h5>Today&rsquo;s reminders</h5><p>They scroll on your LED strip, in this order.</p>' +
              '<div class="hg-input" data-input><span data-typed></span><span class="caret" data-caret></span><span class="ph" data-ph>Add a reminder&hellip;</span></div>' +
              '<ul class="hg-list">' +
                '<li><i style="background:#5bff6b;box-shadow:0 0 6px #5bff6b"></i>Drink water</li>' +
                '<li><i style="background:#ffb000;box-shadow:0 0 6px #ffb000"></i>Sit up straight</li>' +
                '<li><i style="background:#ffb000;box-shadow:0 0 6px #ffb000"></i>Review your numbers</li>' +
                '<li class="new" data-newitem><i style="background:#ffb000;box-shadow:0 0 6px #ffb000"></i>Follow up with leads today</li>' +
              '</ul>' +
            '</div>' +
            '<div class="keycap" data-key>Enter &#8629;</div>' +
          '</div>' +
          '<div class="strip" data-strip><canvas></canvas></div>' +
          '<div class="taskbar">' +
            '<span class="tb-ico"><span class="tb-start"><i></i><i></i><i></i><i></i></span></span>' +
            '<span class="tb-ico"><span class="tb-glyph" style="border:2px solid #b9b1a4;border-radius:50%;width:16px;height:16px"></span></span>' +
            '<span class="tb-ico active"><span class="tb-glyph" style="background:#5d7fae"></span></span>' +
            '<span class="tb-ico active"><span class="tb-glyph" style="background:#7c8fb8"></span></span>' +
            '<span class="tb-ico active"><span class="tb-glyph" style="background:#5c8f6a"></span></span>' +
            '<span class="tb-ico hg" data-hgicon><span class="hg-mini">' + hgDots + '</span></span>' +
            '<span class="tb-clock"><span data-clock>9:12 AM</span><small>Thursday</small></span>' +
          '</div>' +
          '<div class="timewarp" data-warp>Time-lapse &#9656;&#9656;</div>' +
          '<span class="ripple" data-ripple></span>' +
          '<svg class="cursor" data-cursor viewBox="0 0 22 30"><path d="M2 2 L2 24 L8 18.5 L12.2 27.5 L16 25.8 L11.8 17 L19.5 17 Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>' +
        '</div>' +
        '<div class="fade-black" data-fade></div>' +
      '</div>'

    viewport.insertAdjacentHTML('beforeend', html)
    var q = function (s) { return viewport.querySelector(s) }
    var qa = function (s) { return Array.prototype.slice.call(viewport.querySelectorAll(s)) }
    el.stage = q('.stage')
    el.cam = q('.cam')
    el.walls = { morning: q('.w-morning'), noon: q('.w-noon'), evening: q('.w-evening'), night: q('.w-night') }
    el.wins = qa('[data-win]')
    el.app = q('[data-app]')
    el.input = q('[data-input]')
    el.typed = q('[data-typed]')
    el.caret = q('[data-caret]')
    el.ph = q('[data-ph]')
    el.newItem = q('[data-newitem]')
    el.key = q('[data-key]')
    el.strip = q('[data-strip]')
    el.hgIcon = q('[data-hgicon]')
    el.clock = q('[data-clock]')
    el.warp = q('[data-warp]')
    el.ripple = q('[data-ripple]')
    el.cursor = q('[data-cursor]')
    el.fade = q('[data-fade]')
    el.mail = qa('[data-mail]')
    el.doc = qa('[data-doc]')
    el.bars = qa('[data-bar]')

    strip = new window.HabitGloLED.Sign(el.strip.querySelector('canvas'), {
      rows: 9,
      speed: 24,
      gap: 6,
      messages: LED_SEGMENTS[0].msgs,
    })
    if (!playing) strip.pause()

    if (poster) poster.remove()
    fit()
    if ('ResizeObserver' in window) new ResizeObserver(fit).observe(viewport)
    buildChapters()
    render(t)
  }

  function fit() {
    if (!el.stage) return
    var w = viewport.clientWidth
    narrow = w < 640
    el.stage.style.transform = 'scale(' + w / W + ')'
    cache = {}
    render(t)
  }

  function buildChapters() {
    chapterList.innerHTML = CHAPTERS.map(function (c, i) {
      return '<li><button type="button" data-ch="' + i + '"><span class="track"><span class="fill"></span></span><span class="lbl"><b>0' + (i + 1) + '</b><span>' + c.label + '</span></span><span class="sr-only">: ' + c.lead + ' ' + c.rest + '</span></button></li>'
    }).join('')
    el.chBtns = Array.prototype.slice.call(chapterList.querySelectorAll('button'))
    el.fills = Array.prototype.slice.call(chapterList.querySelectorAll('.fill'))
    el.chBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var c = CHAPTERS[Number(btn.getAttribute('data-ch'))]
        seek(c.start + 0.01)
        userPaused = false
        play()
      })
    })
  }

  function updateLed(time) {
    var idx = -1
    for (var i = 0; i < LED_SEGMENTS.length; i++) if (time >= LED_SEGMENTS[i].at) idx = i
    var target = idx < 0 ? 0 : idx
    if (target === ledKey) return
    ledKey = target
    var seg = LED_SEGMENTS[target]
    strip.setSpeed(seg.speed)
    var cols = strip.cols || 200
    strip.setMessages(seg.msgs, -Math.round(cols * (target === 0 ? 0.42 : 0.2)))
  }

  function render(time) {
    if (!built) return
    var i

    // camera
    var cam = track(CAMERA, time, true)
    var z = reduce ? 1 : cam[2] * (narrow ? 1.45 : 1)
    if (narrow && !reduce) z = Math.max(z, 1.35)
    var vw = W / z
    var vh = H / z
    var left = clamp(cam[0] - vw / 2, 0, W - vw)
    var top = clamp(cam[1] - vh / 2, 0, H - vh)
    set(el.cam, 'transform', 'translate(' + (-left * z).toFixed(2) + 'px,' + (-top * z).toFixed(2) + 'px) scale(' + z.toFixed(4) + ')')

    // time of day
    set(el.walls.morning, 'opacity', String(1 - prog(time, 20.6, 22.6)))
    set(el.walls.noon, 'opacity', String(prog(time, 20.6, 21.6) * (1 - prog(time, 24.9, 25.7))))
    set(el.walls.evening, 'opacity', String(prog(time, 25.0, 25.8) * (1 - prog(time, 27.3, 28.1))))
    set(el.walls.night, 'opacity', String(prog(time, 27.3, 28.3)))
    set(el.clock, 'text', fmtClock(track(CLOCK, time, false)[0]))
    var warp = prog(time, 20.5, 21.0) * (1 - prog(time, 29.0, 29.4))
    set(el.warp, 'opacity', String(warp))

    // dock: strip slides in, windows make room
    var dStrip = ease(prog(time, 15.4, 16.3))
    var dWin = ease(prog(time, 15.6, 16.6))
    set(el.strip, 'transform', 'translateY(' + (-100 + dStrip * 100).toFixed(2) + '%)')
    var winTop = 24 + STRIP * dWin
    var winH = 704 - STRIP * dWin
    for (i = 0; i < el.wins.length; i++) {
      set(el.wins[i], 'top', winTop.toFixed(1) + 'px')
      set(el.wins[i], 'height', winH.toFixed(1) + 'px')
    }

    // the day passes inside the windows
    var day = prog(time, 20.5, 29)
    var readCount = Math.floor(day * 6)
    for (i = 0; i < el.mail.length; i++) set(el.mail[i], 'class', 'mail-row' + (i < readCount || i > 4 ? ' read' : ''))
    var docShown = 6 + Math.floor(day * 10)
    for (i = 0; i < el.doc.length; i++) set(el.doc[i], 'opacity', i < docShown ? '1' : '0')
    var base = [0.35, 0.5, 0.42, 0.6, 0.55, 0.72, 0.8]
    for (i = 0; i < el.bars.length; i++) {
      var hgt = base[i] * (0.55 + 0.45 * clamp(day * 1.4 - i * 0.08, 0, 1))
      set(el.bars[i], 'height', Math.round(hgt * 110) + 'px')
    }

    // HabitGlo app window
    var open = ease(prog(time, 6.5, 7.15))
    var min = ease(prog(time, 15.0, 15.55))
    var appOpacity = open * (1 - min)
    set(el.app, 'opacity', appOpacity.toFixed(3))
    set(el.app, 'visibility', appOpacity > 0.01 ? 'visible' : 'hidden')
    var sc = (0.9 + 0.1 * open) * (1 - 0.7 * min)
    var ty = (1 - open) * 26 + min * 330
    var tx = min * 110
    set(el.app, 'transform', 'translate(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px) scale(' + sc.toFixed(3) + ')')
    set(el.hgIcon, 'class', 'tb-ico hg' + (time >= 6.5 ? ' active' : '') + (time > 5.8 && time < 6.9 ? ' hot' : ''))

    // typing
    var focused = time >= 9.65 && time < 15
    var typedCount = Math.floor(prog(time, 10.0, 12.9) * TYPED.length)
    var cleared = time >= 13.45
    var text = cleared ? '' : TYPED.slice(0, typedCount)
    set(el.typed, 'text', text)
    set(el.ph, 'display', text ? 'none' : '')
    set(el.input, 'class', 'hg-input' + (focused ? ' focus' : ''))
    var typingNow = time >= 10 && time < 12.9
    set(el.caret, 'opacity', focused && (typingNow || Math.floor(time * 2.2) % 2 === 0) ? '1' : '0')
    set(el.caret, 'display', focused ? '' : 'none')
    var added = prog(time, 13.45, 13.9)
    set(el.newItem, 'opacity', added.toFixed(3))
    set(el.newItem, 'transform', 'translateY(' + ((1 - added) * -8).toFixed(1) + 'px)')
    var keyIn = prog(time, 12.95, 13.2) * (1 - prog(time, 14.0, 14.3))
    var pressed = time >= 13.35 && time < 13.55
    set(el.key, 'opacity', keyIn.toFixed(3))
    set(el.key, 'transform', 'translateY(' + (pressed ? 3 : (1 - keyIn) * 10).toFixed(1) + 'px)')

    // cursor + click ripple
    var c = track(CURSOR, time, true)
    set(el.cursor, 'transform', 'translate(' + c[0].toFixed(1) + 'px,' + c[1].toFixed(1) + 'px)')
    var rip = null
    for (i = 0; i < CLICKS.length; i++) if (time >= CLICKS[i] && time < CLICKS[i] + 0.5) rip = (time - CLICKS[i]) / 0.5
    if (rip !== null) {
      set(el.ripple, 'opacity', (0.9 * (1 - rip)).toFixed(3))
      set(el.ripple, 'transform', 'translate(' + c[0].toFixed(1) + 'px,' + c[1].toFixed(1) + 'px) scale(' + (0.3 + rip * 1.1).toFixed(3) + ')')
    } else {
      set(el.ripple, 'opacity', '0')
    }

    // loop fade
    var fade = Math.max(1 - prog(time, 0, 0.5), prog(time, 29.4, 30))
    set(el.fade, 'opacity', (t === 0 && !playing ? 0 : fade).toFixed(3))

    updateLed(time)

    // chapters + caption
    var ci = 0
    for (i = 0; i < CHAPTERS.length; i++) if (time >= CHAPTERS[i].start) ci = i
    if (el.fills) {
      for (i = 0; i < CHAPTERS.length; i++) {
        var p = prog(time, CHAPTERS[i].start, CHAPTERS[i].end)
        set(el.fills[i], 'transform', 'scaleX(' + p.toFixed(4) + ')')
      }
    }
    if (ci !== chapterIdx) {
      chapterIdx = ci
      var ch = CHAPTERS[ci]
      caption.innerHTML = ch.lead + ' <em>' + ch.rest + '</em>'
      if (el.chBtns) el.chBtns.forEach(function (b, j) {
        if (j === ci) b.setAttribute('aria-current', 'step')
        else b.removeAttribute('aria-current')
      })
    }
  }

  function frame(now) {
    if (!playing) return
    var dt = last ? Math.min(0.1, (now - last) / 1000) : 0
    last = now
    t += dt
    if (t >= DURATION) {
      t = 0
      ledKey = -1
    }
    render(t)
    raf = requestAnimationFrame(frame)
  }

  function syncButton() {
    playBtn.setAttribute('data-state', playing ? 'playing' : 'paused')
    playBtn.setAttribute('aria-label', playing ? 'Pause the demo film' : 'Play the demo film')
  }

  function play() {
    build()
    if (playing || !inView || el.video) { syncButton(); return }
    playing = true
    last = 0
    if (strip) strip.play()
    raf = requestAnimationFrame(frame)
    syncButton()
  }

  function pause() {
    playing = false
    cancelAnimationFrame(raf)
    if (strip) strip.pause()
    syncButton()
  }

  function seek(time) {
    t = clamp(time, 0, DURATION - 0.01)
    ledKey = -1
    render(t)
  }

  playBtn.addEventListener('click', function () {
    if (playing) {
      userPaused = true
      pause()
    } else {
      userPaused = false
      if (el.video) closeVideo()
      play()
    }
  })

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) pause()
    else if (inView && !userPaused && !reduce) play()
  })

  window.HabitGloFilm = {
    seek: function (time) { build(); seek(time) },
    pause: function () { userPaused = true; pause() },
    play: function () { userPaused = false; play() },
  }

  // Real recording: shown only when /media/demo.mp4 exists
  function openVideo() {
    pause()
    var v = document.createElement('video')
    v.src = '/media/demo.mp4'
    v.poster = '/media/demo-poster.jpg'
    v.controls = true
    v.playsInline = true
    v.preload = 'metadata'
    v.setAttribute('aria-label', 'HabitGlo screen recording')
    viewport.appendChild(v)
    if (el.stage) el.stage.style.visibility = 'hidden'
    el.video = v
    realBtn.textContent = 'Back to the film'
    v.play().catch(function () {})
  }
  function closeVideo() {
    if (!el.video) return
    el.video.pause()
    el.video.remove()
    el.video = null
    if (el.stage) el.stage.style.visibility = ''
    realBtn.textContent = 'Watch the real recording'
  }
  if (realBtn) {
    realBtn.addEventListener('click', function () {
      if (el.video) {
        closeVideo()
        if (!userPaused) play()
      } else {
        openVideo()
      }
    })
  }
  function probeRecording() {
    if (!window.fetch || !realBtn) return
    fetch('/media/demo.mp4', { method: 'HEAD' }).then(function (res) {
      var type = res.headers.get('content-type') || ''
      if (res.ok && type.indexOf('video') === 0) realBtn.classList.remove('hidden')
    }).catch(function () {})
  }

  // Lazy: build when near, play when mostly visible, pause when off-screen
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) {
        build()
        probeRecording()
        this.disconnect()
      }
    }, { rootMargin: '600px 0px' }).observe(viewport)

    new IntersectionObserver(function (entries) {
      inView = entries[0].intersectionRatio >= 0.35
      if (inView && !userPaused && !reduce) play()
      else if (!inView) pause()
    }, { threshold: [0, 0.35, 0.6] }).observe(viewport)
  } else {
    build()
    inView = true
    if (!reduce) play()
  }
})()
