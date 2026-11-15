# Optional usage analytics

The React app replaces Vercel Analytics with a consent prompt and minimal PostHog events. Refusal, unset consent, DNT=1 and GPC=true prevent capture. Visitors can reopen preferences and revoke consent. Local storage holds only the choice; visit IDs are in memory and reset on reload. Failed storage reads fail closed. Revocation aborts pending requests but cannot retract requests already received.

Only production on yiiya.vercel.app can send events. The client accepts the exact https://us.i.posthog.com endpoint and a configured public project key. Preview and development builds do not send. Never change production configuration just to test a preview.

| Event | Coverage | Interpretation |
| --- | --- | --- |
| $pageview | React routes /, /app, /how-it-works, /library, /view, /capture, /scan/:id | Consented page event |
| studio_generation_requested | Main studio before stream request | Attempt, not successful generation |
| export_requested | Main workspace asset-card download link | Click, not completed download |

Static Photo Studio routes and library export clicks are not covered. No events prove cloud save/reopen, successful export or AR use. Do not use visit IDs as monthly deduplicated people, or combine events, people and revenue into one metric. There is a 50-event page-lifetime cap; failed events are not retried, so counts can underreport.

Payloads contain allowlisted event/route/format data, a random visit ID and the public project key. Query strings, hashes, scan IDs, prompts, photos, voice and email are not included. No SDK autocapture or recordings are installed. Requests omit credentials and referrer and reject redirects. The receiver still receives normal network transport data; server-side privacy settings require separate verification.

Before release, run lint, typecheck, tests, build and Scan Platform. Check rendered metadata and legacy routes on preview. In the browser, verify initial refusal, saved refusal after reload, reopening preferences, Allow, Turn off, and persistence. Preview transport remains disabled throughout. Core tests use a stub transport for consent/revocation, privacy signals, payload allowlists, failure handling and cross-tab changes. These tests do not prove real PostHog ingestion.
