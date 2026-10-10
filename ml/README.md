# iPhotos ML

Face detection + embedding service (doc 18, D20): FastAPI + ONNX Runtime +
insightface **buffalo_l** (SCRFD-10G detector + ArcFace w600k_r50, 512-d
embeddings). Stateless — image bytes in, bboxes + embeddings out; all business
rules live in the .NET backend.

## Endpoints

- `GET /health` → `{ status, provider, model }`
- `POST /v1/faces/detect` — body: image bytes (the photo `preview` variant);
  header `X-Api-Key` when `ML_API_KEY` is set. Response:
  `{ model, provider, faces: [{ bbox: [x,y,w,h], detScore, embedding: [512] }] }`
  (unit-norm embeddings; cosine similarity = dot product).

## Configuration (env)

| Var | Default | Meaning |
|---|---|---|
| `ML_EXECUTION_PROVIDER` | `auto` | `auto` (rocm → cuda → dml → cpu within the installed runtime build), `rocm`, `cuda`, `dml` or `cpu` |
| `ML_API_KEY` | *(empty)* | When set, requests must send the matching `X-Api-Key` |
| `ML_DET_SIZE` | `640` | Detector input size (square) |
| `ML_CONCURRENCY` | `2` | Parallel inference slots |
| `ML_MODEL` | `buffalo_l` | Model pack baked under `/models/models/<name>` |

## Build/run

CPU image (universal default):

```sh
docker build -t iphotos.ml .
```

GPU override at build time (the runtime still falls back to CPU if the
provider/driver is missing):

```sh
docker build --build-arg ONNXRUNTIME_SPEC="onnxruntime-rocm==6.x" -t iphotos.ml:rocm .
```

## AMD GPU on a Windows host — DirectML (the working path)

**ROCm under WSL2 only supports RDNA3 (RX 7900 series).** On an RDNA2 card
(e.g. **RX 6700 XT**) the supported way to use the AMD GPU is **DirectML**:
`onnxruntime-directml` is an official ONNX Runtime wheel that runs on any
DirectX 12 GPU through plain Windows Python — no container, no ROCm.

1. Start the host service (first run creates `ml/.venv`, installs deps and
   downloads the buffalo_l models into `ml/.models` on first inference;
   insightface builds a small Cython extension — needs the VS Build Tools
   "Desktop development with C++" workload if not already installed):

   ```powershell
   powershell -ExecutionPolicy Bypass -File ml\start-host-directml.ps1
   ```

   `GET http://127.0.0.1:5207/health` must report
   `"provider": "DmlExecutionProvider"`. (Let the app through the Windows
   Defender firewall prompt so WSL2/Docker can reach it.)

2. Point the compose stack at it (`backend/.env`):

   ```sh
   IPHOTOS_ML_BASE_URL=http://host.docker.internal:5207
   # keep the same key the script uses (default change-me-ml-api-key)
   IPHOTOS_ML_API_KEY=change-me-ml-api-key
   ```

   then `docker compose up -d worker api` from `backend/`.

3. Optionally stop the in-compose CPU service so the port stays free:

   ```sh
   docker compose stop ml
   ```

With the host service running on DirectML, auto-detect picks
`DmlExecutionProvider` and inference runs on the RX 6700 XT; the compose CPU
container remains the zero-setup fallback whenever the host service is off.

The compose service in `backend/compose.yaml` wires this in as `ml`
(loopback debug port 5207; the api/worker reach it over the compose network).
Note: ROCm wheels for onnxruntime are the fragile piece (doc 18 §14) — the CPU
build is the guaranteed path.
