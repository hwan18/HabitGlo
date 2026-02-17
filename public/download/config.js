;(function () {
  window.HABITGLO_WEBSITE_CONFIG = {
    paddle: {
      // "sandbox" for testing, "production" for live.
      environment: 'production',
      // Paddle client-side token from Dashboard -> Developer tools -> Authentication.
      clientToken: 'live_70d8fa8150690f13481ccd14370',
      // Paddle price IDs from Catalog.
      prices: {
        monthly: 'pri_01khmd0ycp143872rde80bj3jg',
        lifetime: 'pri_01khmd8xspdks988pyssx6r24t',
      },
    },
    download: {
      windows: {
        // Update these on each release
        version: '0.1.0',
        fileName: 'HabitGlo_0.1.0_x64-setup.exe',
        directUrl: '',
        releasePageUrl: 'https://github.com/YOUR_ORG/YOUR_REPO/releases/latest',
        sha256: '',
        minOs: 'Windows 10+',
      },
    },
    supportEmail: 'support@habitglo.com',
  }
})()
