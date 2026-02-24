;(function () {
  window.HABITGLO_WEBSITE_CONFIG = {
    paddle: {
      // "sandbox" for testing, "production" for live.
      environment: 'sandbox',
      // Paddle client-side token from Dashboard -> Developer tools -> Authentication.
      clientToken: 'test_8d57bc44bcb289856df54242c35',
      // Paddle price IDs from Catalog.
      prices: {
        monthly: 'pri_01kj4c7wbp52txqrjtgg5zwtz9',
        lifetime: 'pri_01kj4c9m37x15rz4k9qmg2dfpf',
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
