# Local Dev

Run this project from the real project root:

`D:\Desktop\psynote`

Expected local ports:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`

Useful commands:

- `npm run dev`
- `npm run dev:client`
- `npm run dev:server`
- `npm run dev:status`

Notes:

- The Vite dev server now uses `strictPort`, so if `5173` is already occupied it will fail fast instead of silently switching to another port.
- If the app opens but data requests fail, check `http://localhost:4000/api/health`.
- If ports look wrong, make sure you are not running a different copy of Psynote from another folder or worktree.
