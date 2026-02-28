# Security Policy

## Security Headers Implementation

### Overview
This repository includes a `_headers` file defining recommended HTTP security headers. However, **GitHub Pages does not natively support the `_headers` file format**.

### Implementation Options

To apply these security headers to your site (salfordhongkongers.co.uk), you need to configure them at the DNS/CDN layer:

#### Option 1: Cloudflare Transform Rules (Recommended)

If your domain uses Cloudflare as DNS/CDN:

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Select your domain `salfordhongkongers.co.uk`
3. Go to **Rules** > **Transform Rules** > **HTTP Response Header Modification**
4. Create a new rule with the following headers:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; font-src 'self' https: data:; connect-src 'self' https:; frame-ancestors 'none'
```

5. Apply to: **All incoming requests** for `salfordhongkongers.co.uk/*`

#### Option 2: GitHub Pages Settings (Partial)

GitHub Pages automatically provides:
- HTTPS enforcement (enable in repository Settings > Pages > Enforce HTTPS)
- Basic security headers

However, custom headers like CSP and Permissions-Policy require CDN-level configuration.

#### Option 3: Alternative CDN/Proxy

If using another CDN (Netlify, Vercel, Fastly, etc.), configure headers in their respective dashboards or configuration files.

### HTTPS Enforcement

**Manual Configuration Required:**

1. Go to: https://github.com/mobiassistantv1-sys/salford-hongkongers/settings/pages
2. Under "Enforce HTTPS", check the box to enable HTTPS enforcement
3. Ensure your custom domain DNS is properly configured with SSL/TLS

**Note:** This setting cannot be automated via GitHub API without GitHub App permissions.

### Reporting Security Issues

If you discover a security vulnerability, please email: **salfordhongkongers@gmail.com**

Do not create public GitHub issues for security vulnerabilities.

---

## Security Best Practices

- ✅ Enable HTTPS enforcement
- ✅ Configure security headers via CDN
- ✅ Keep dependencies updated
- ✅ Review commits for sensitive data
- ✅ Use Dependabot for security alerts

Last updated: 2026-02-28