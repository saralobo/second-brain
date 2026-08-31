/** @type {import('next').NextConfig} */
const nextConfig = {
  // Domain packages are consumed as TypeScript source: the monorepo has no
  // build step for them, and the web layer holds no domain logic of its own.
  transpilePackages: ['@ava/core', '@ava/db', '@ava/app', '@ava/ingestion', '@ava/telemetry', '@ava/llm'],
  serverExternalPackages: ['@electric-sql/pglite'],
  experimental: { esmExternals: true },
}
export default nextConfig
