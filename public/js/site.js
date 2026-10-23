;(function () {
  'use strict'

  var nav = document.querySelector('.nav')
  if (nav) {
    var onScroll = function () { nav.classList.toggle('is-scrolled', window.scrollY > 8) }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
  }

  var targets = document.querySelectorAll('.reveal, .scribble, [data-reveal]')
  if (!('IntersectionObserver' in window)) {
    for (var i = 0; i < targets.length; i++) targets[i].classList.add('is-in')
    return
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        e.target.classList.add('is-in')
        io.unobserve(e.target)
      }
    })
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 })
  for (var j = 0; j < targets.length; j++) io.observe(targets[j])
})()
