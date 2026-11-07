# NYC Transit Hub Backend

Express API for the Metro Sync frontend.

## Run

```powershell
npm install
node server.js
```

The default port is `5000`. Configuration can be supplied through a local
`.env` file based on `../.env.example`.

## Endpoints

- `GET /api/v1/health`
- `GET /api/v1/stations`
- `GET /api/v1/routes/plan`
- `GET /api/v1/trains/live`
- `GET /api/v1/routes/shapes`
- `GET /api/v1/accessibility`

See `../docs/API.md` for request and response details.
