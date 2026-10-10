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

`ML_DET_SIZE` is the lever for small faces: the detector resizes the whole
image to this size, so it — not the original resolution — decides the smallest
detectable face. Raising it (800–1024) helps group shots and costs compute
~quadratically.

## Recognition tuning knobs (backend side)

Thresholds, filters and clustering live in the .NET worker (`MlOptions`,
doc 18 §6.3) — exposed in `backend/compose.yaml` as env placeholders, no
rebuild needed (restart only):

| Env | Default | Effect of raising |
|---|---|---|
| `IPHOTOS_ML__MIN_DET_SCORE` | `0.5` | Fewer false faces; may drop hard ones (profiles, low light) |
| `IPHOTOS_ML__MIN_FACE_SIZE_PX` | `40` | Less junk; small faces (group shots) stop being indexed |
| `IPHOTOS_ML__MATCH_THRESHOLD` | `0.55` | Cleaner people; more faces stay "Unnamed" until reclustering |
| `IPHOTOS_ML__CLUSTER_THRESHOLD` | `0.55` | Splits people more easily; may split one person in two |
| `IPHOTOS_ML__SUGGEST_THRESHOLD` | `0.65` | Lower bound of the "same person?" review band — unassigned faces cluster as suggestions at this similarity |
| `IPHOTOS_ML__MIN_CLUSTER_FACES` | `2` | Fewer single-photo people; singletons stay unassigned longer |

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

### Driver crash watch (amdxc64.dll) — warmup + supervisor

The AMD DirectML driver has crashed the process with access violations
(`0xC0000005` in `amdxc64.dll`, visible in the Windows Application event log —
Event ID 1000), typically right after the first real inference requests. Two
mitigations are built in:

- **Startup warmup** (`main.py`, `warm_up()`): insightface constructs all model
  sessions on first use — previously inside the first request. Warmup builds
  every session and runs one inference through each at boot, single-threaded,
  before the socket serves. Since this change the service survived hundreds of
  consecutive real requests where it previously died on the first or second.
- **Supervisor loop** (`start-host-directml.ps1`): if the process still dies,
  the script restarts it after 5s and appends each exit code (with hex) to
  `ml\crash-log.txt`. Exit codes seen: bash reports `139` (0xC0000005 as
  SIGSEGV); note `powershell -File` alone reports `0` — it does not propagate
  the inner process code.

If crashes resume, update the AMD Adrenalin driver first — the fault is in the
driver, not in this code.


The compose service in `backend/compose.yaml` wires this in as `ml`
(loopback debug port 5207; the api/worker reach it over the compose network).
Note: ROCm wheels for onnxruntime are the fragile piece (doc 18 §14) — the CPU
build is the guaranteed path.
