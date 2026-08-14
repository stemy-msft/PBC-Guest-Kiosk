# Frontend Deployment

**Status:** Authoritative (Documentation Wave 4). **Release:** `v1.0.0-rc.2`.
**Scope:** Installing, configuring, building, and serving the React/Vite
frontend. For the full single-host path see [QuickStart.md](QuickStart.md).

Every command and path here is verified against `frontend/package.json` and
`frontend/vite.config.js`.

---

## 1. Frontend responsibilities

The frontend is a single-page React application (Vite build) that provides:

- the **visitor kiosk** flow (check-in, photo capture, badge confirmation),
- the **staff/admin** interface (sign-in, visitor search, settings, dashboard),
- all screen navigation via **in-app screen state** — there are **no URL
  routes** for individual screens (e.g. no `/admin` path).

It talks to the backend exclusively over HTTP using a single configured base
URL. Architecture context: [SystemComponents.md](../01-Architecture/SystemComponents.md).

---

## 2. Prerequisites

| Requirement | Version | Notes |
| --- | --- | --- |
| Node.js + npm | **20+** | Vite 8 requires a current LTS Node. See [SoftwareMatrix.md § 2](../06-Reference/SoftwareMatrix.md#2-runtimes). |
| Backend reachable | — | The browser must be able to reach the backend URL (§ 10). |

Runtime dependencies are `react` and `react-dom` only; everything else is a
build/dev/test tool. Full list: [SoftwareMatrix.md § 4](../06-Reference/SoftwareMatrix.md#4-frontend-dependencies).

---

## 3. Dependency installation

```bash
cd frontend
npm install
```

This installs the versions locked in `package-lock.json`.

---

## 4. API base configuration

The frontend needs to know where the backend is. This is the single variable
`VITE_API_BASE`, read from `frontend/.env`:

```bash
# from the repository root
cp frontend/.env.example frontend/.env
```

Edit `frontend/.env`:

```
VITE_API_BASE=http://<backend-host-ip>:8000
```

Critical detail, verified against Vite behaviour:

- `VITE_API_BASE` is a **Vite build-time variable** (`import.meta.env`). Its
  value is **baked into the bundle** when the app is built or when the dev server
  starts. Changing it later requires restarting `npm run dev` or rebuilding.
- Set it to a host/IP the **browser** can reach — not `localhost`, unless the
  browser runs on the same machine as the backend.

Reference: [EnvironmentVariables.md § 2](../06-Reference/EnvironmentVariables.md#2-frontend).

---

## 5. Development startup (validated runtime)

```bash
npm run dev
```

- Runs the Vite dev server, bound to `0.0.0.0` (`"dev": "vite --host 0.0.0.0"`),
  on the default port `5173`.
- This is the **validated way the kiosk UI is served** in the reference build
  (frontend served from the dev server on the LAN).

Open `http://<this-host-ip>:5173` in a browser.

> `frontend/vite.config.js` sets `allowedHosts: ["kiosk.palmettobiblecamp.com"]`,
> which permits serving the dev site under that hostname in addition to
> localhost/IP access.

---

## 6. Production build

To produce an optimised static bundle:

```bash
npm run build
```

This runs `vite build`. At `v1.0.0-rc.2` the build produced a single-page bundle of
roughly 330–340 KB of assets under `assets/` (run `npm run build` to see the current
size).

You can preview a built bundle locally with:

```bash
npm run preview
```

`vite preview` serves the built `dist/` for **local verification only**. It is
not a production web server — see § 8 and
[ProductionReadiness.md § 6](ProductionReadiness.md#6-frontend-hosting-gap).

---

## 7. Build output

- `npm run build` writes to **`frontend/dist/`** (the Vite default —
  `vite.config.js` does not override `build.outDir`).
- `dist/` contains `index.html` plus a hashed `assets/` directory.
- The built output is fully static; the visitor's browser needs only the files
  in `dist/` plus network access to the backend.

---

## 8. Serving the built frontend

There are two verified options, and one important gap:

| Option | Command | Suitable for |
| --- | --- | --- |
| Vite dev server | `npm run dev` | The kiosk runtime used in the validated reference build ([KNOWN_GOOD_BUILD.md](../KNOWN_GOOD_BUILD.md)). |
| Vite preview server | `npm run preview` | Local verification of a production build only. |
| Dedicated static host for `dist/` | *(not shipped)* | Production — **you must supply your own** static host/CDN/web server. |

> **Gap:** this repository does **not** include a production static-file host,
> reverse-proxy configuration, or hosting scripts for `frontend/dist/`. Serving
> the built bundle behind a real web server is an unsupported, bring-your-own
> step. This is tracked in [ProductionReadiness.md § 6](ProductionReadiness.md#6-frontend-hosting-gap).
> Do not assume a production frontend host exists.

---

## 9. Browser and camera requirements

- Photo check-in requires a browser with camera access (`getUserMedia`) and the
  user granting camera permission.
- Validated browsers and platforms (iPad Safari/Chrome, Android Chrome/Edge,
  desktop Chromium) are listed in
  [SoftwareMatrix.md § 6](../06-Reference/SoftwareMatrix.md#6-browser-compatibility-kiosk--admin-ui).
- The browser camera API (`getUserMedia`) is only available in a **secure context**: a
  page served from `localhost`/`127.0.0.1`, or over **HTTPS**. Over plain HTTP from a LAN
  IP or hostname — i.e. a **remote** kiosk device — camera access **may be blocked**,
  depending on the browser and version; being on a "trusted LAN" does not make the origin
  secure. This repository ships **no** TLS/HTTPS, so reliable camera capture is guaranteed
  only for a `localhost` browser or an HTTPS origin you provide. Treat the missing HTTPS
  support as an unresolved deployment / production-readiness gap
  (see [ProductionReadiness.md § 7](ProductionReadiness.md#7-reverse-proxy--tls-status));
  no certificate or reverse-proxy procedure ships.

---

## 10. Backend connectivity

- The frontend calls the backend at `VITE_API_BASE`. That host/port must be
  reachable from the browser device.
- If the UI and API are on **different origins**, the backend's CORS allow-list
  must include the UI origin. In production (`PBC_ENV=production`) the backend
  requires `PBC_CORS_ALLOWED_ORIGINS` to be set explicitly. See
  [EnvironmentVariables.md § 1.4](../06-Reference/EnvironmentVariables.md#14-cors--cross-origin-access-f-008)
  and [NetworkFlow.md](../01-Architecture/NetworkFlow.md).

---

## 11. Validation checklist

- [ ] `npm install` completed without error.
- [ ] `frontend/.env` exists with `VITE_API_BASE` pointing at a browser-reachable backend URL.
- [ ] `npm run dev` serves the UI on port `5173`; the page loads in a browser.
- [ ] The footer shows the version (`1.0.0 RC2`).
- [ ] Staff sign-in reaches the backend (no CORS or network errors in the browser console).
- [ ] Camera permission can be granted and a photo captured on the target device.
- [ ] *(If building)* `npm run build` completes and writes `frontend/dist/`.

---

## 12. Known limitations

- **Native path has no production host:** the native procedure in this guide
  provides no production web server for `frontend/dist/` (§ 8). The optional
  container path serves it with nginx; see
  [../container-deployment.md](../container-deployment.md).
- **Build-time API base:** `VITE_API_BASE` is fixed at build/dev-start time; it
  cannot be changed at runtime without restarting/rebuilding.
- **No client-side routing:** navigation is in-app screen state; there are no
  deep-linkable per-screen URLs.
- **Native path has no TLS:** camera-sensitive browsers may require HTTPS; the
  LAN reference build relies on a trusted network. The optional Caddy container
  variant provides HTTPS when the operator supplies authorized DNS and exposes
  ports 80/443.
