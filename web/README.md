# web

The Next.js front end. See the [project README](../README.md) for the architecture and how to run everything.

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # static export to out/, served by the Go API in production
```

Site copy lives in `src/content/*.ts` (profile, products, the AI platform, SLOs, postmortems, the on-call drill,
writing and the decision records); `src/content/generated/` holds the pipeline's delivery and changelog snapshots.
