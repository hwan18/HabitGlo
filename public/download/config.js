;(function () {
  window.HABITGLO_WEBSITE_CONFIG = {
    supabase: {
      // Supabase project URL and publishable anon key for website auth flows.
      url: 'https://bgsmwattqizqnobkdfqi.supabase.co',
      anonKey: 'sb_publishable_rpqjoDOjxYH77IEzMxkKww_dnXkzhSs',
    },
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
        version: '1.0.0',
        fileName: 'HabitGlo_1.0.0_x64_en-US.msi',
        directUrl: 'https://github.com/hwan18/HabitGlo/releases/download/v1.0.0/HabitGlo_1.0.0_x64_en-US.msi',
        releasePageUrl: 'https://github.com/hwan18/HabitGlo/releases/latest',
        sha256: '5B9DB010DAE6F6D0BDAEF3DD89DBC72CAF199BE84E4210D4FE828E78828C163F',
        minOs: 'Windows 10+',
      },
    },
    supportEmail: 'support@habitglo.com',
  }
})()
