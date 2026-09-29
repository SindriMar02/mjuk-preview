# Vendored libraries

Hosted on the site itself (same address as everything else) instead of the jsDelivr CDN, so the shop does not wait for, or break with, a third-party host, and the build can run offline. Byte-for-byte the files jsDelivr serves for these versions (from the npm packages).

| File | Package | Version | Licence |
| --- | --- | --- | --- |
| gsap.min.js | gsap | 3.12.5 | GSAP Standard "no charge" licence (https://gsap.com/standard-license), header inside the file |
| ScrollTrigger.min.js | gsap | 3.12.5 | same |
| lenis.min.js | lenis | 1.1.13 | MIT |

To update: `npm pack gsap@<v> lenis@<v>`, copy `package/dist/{gsap,ScrollTrigger,lenis}.min.js` here, and check the pages still scroll and reveal (tools/e2e-layout.mjs, tools/e2e-bag.mjs).
