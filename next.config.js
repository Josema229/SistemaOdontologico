const config = {
  serverExternalPackages: ['better-sqlite3'],
  outputFileTracingIncludes: {
    '/*': ['./certs/supabase.crt'],
  },
  turbopack: { root: process.cwd() },
  poweredByHeader: false,
};
export default config;
