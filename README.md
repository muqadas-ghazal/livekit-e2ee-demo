# Vonage custom E2EE feasibility POC

Next.js proof of concept for custom encoded-frame encryption on the Vonage Video API.

The open page is [`/vonage-e2ee-poc`](src/app/vonage-e2ee-poc/page.tsx). The finding is in [`docs/VONAGE_CUSTOM_E2EE_FEASIBILITY.md`](docs/VONAGE_CUSTOM_E2EE_FEASIBILITY.md).

```bash
npm install
npm run dev
```

A live Vonage session needs `VONAGE_APPLICATION_ID` and `VONAGE_PRIVATE_KEY` in `.env.local`. See `.env.example`. The public SDK does not expose an encoded-frame transform, so those credentials do not enable custom E2EE.

```bash
node scripts/audit-vonage-surface.mjs
```
