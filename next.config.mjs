/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@resvg/resvg-js"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        // fallback untuk hosted Supabase custom domain jika ada
        protocol: "https",
        hostname: "*.supabase.in",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
}

export default nextConfig
