"""iPhotos ML service — face detection + embeddings (doc 18, D20).

Stateless HTTP seam between the .NET worker and the insightface model zoo:
image bytes in, face bounding boxes + 512-d ArcFace embeddings out. All
business rules (thresholds, clustering, persons) live in the backend; this
service only runs the ONNX models.
"""

import asyncio
import logging
import os
import threading

import cv2
import numpy as np
import onnxruntime as ort
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

MODEL_NAME = os.environ.get("ML_MODEL", "buffalo_l")
API_KEY = os.environ.get("ML_API_KEY", "")
DET_SIZE = int(os.environ.get("ML_DET_SIZE", "640"))
CONCURRENCY = int(os.environ.get("ML_CONCURRENCY", "2"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("iphotos-ml")


def pick_providers() -> list[str]:
    """Execution provider selection (doc 18 §4.2): ML_EXECUTION_PROVIDER=auto picks
    the best provider present in the installed onnxruntime build (rocm -> cuda ->
    dml -> cpu); explicit values force one. CPU is always the fallback, so the
    CPU-only image runs everywhere. DirectML (dml) covers any DirectX 12 GPU —
    the working GPU path on Windows hosts with AMD cards (e.g. RDNA2, which ROCm
    does not support under WSL2)."""
    preference = os.environ.get("ML_EXECUTION_PROVIDER", "auto").strip().lower()
    order = {
        "rocm": ["ROCmExecutionProvider", "CUDAExecutionProvider", "CPUExecutionProvider"],
        "cuda": ["CUDAExecutionProvider", "ROCmExecutionProvider", "CPUExecutionProvider"],
        "dml": ["DmlExecutionProvider", "CPUExecutionProvider"],
        "cpu": ["CPUExecutionProvider"],
    }.get(
        preference,
        ["ROCmExecutionProvider", "CUDAExecutionProvider", "DmlExecutionProvider", "CPUExecutionProvider"],
    )
    available = ort.get_available_providers()
    chosen = [p for p in order if p in available]
    if not chosen:
        chosen = ["CPUExecutionProvider"]
    logger.info("Execution providers: available=%s chosen=%s", available, chosen)
    return chosen


PROVIDERS = pick_providers()

app = FastAPI(title="iPhotos ML", version="1.0.0")
_analyzer = None
_inference_slots = threading.Semaphore(max(1, CONCURRENCY))


def get_analyzer():
    global _analyzer
    if _analyzer is None:
        from insightface.app import FaceAnalysis

        # Models are baked into the image at /models/models/<name>/ (the extra
        # level is insightface's storage layout: <root>/models/<name>/*.onnx).
        _analyzer = FaceAnalysis(name=MODEL_NAME, root="/models", providers=PROVIDERS)
        _analyzer.prepare(ctx_id=0 if PROVIDERS[0] != "CPUExecutionProvider" else -1, det_size=(DET_SIZE, DET_SIZE))
        logger.info("FaceAnalysis ready (model=%s providers=%s)", MODEL_NAME, PROVIDERS)
    return _analyzer


def run_detection(body: bytes) -> list[dict]:
    image = cv2.imdecode(np.frombuffer(body, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="Body is not a decodable image.")
    results = []
    for face in get_analyzer().get(image):
        x1, y1, x2, y2 = [float(v) for v in face.bbox]
        embedding = getattr(face, "normed_embedding", None)
        if embedding is None:
            raw = face.get("embedding")
            embedding = raw / np.linalg.norm(raw) if raw is not None else None
        if embedding is None:
            continue
        results.append(
            {
                "bbox": [round(x1, 1), round(y1, 1), round(x2 - x1, 1), round(y2 - y1, 1)],
                "detScore": round(float(face.det_score), 4),
                # Unit-norm so backend cosine similarity is a plain dot product.
                "embedding": [round(float(v), 6) for v in embedding],
            }
        )
    return results


def authorize(request: Request) -> None:
    if API_KEY and request.headers.get("X-Api-Key") != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key.")


class _InferenceSlot:
    """Async context manager over the blocking inference semaphore: the event loop
    stays free while the bounded number of worker threads run the models."""

    def __init__(self, semaphore: threading.Semaphore):
        self._semaphore = semaphore

    async def __aenter__(self):
        await asyncio.get_running_loop().run_in_executor(None, self._semaphore.acquire)
        return self

    async def __aexit__(self, *exc):
        self._semaphore.release()
        return False


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "provider": PROVIDERS[0], "model": MODEL_NAME}


@app.post("/v1/faces/detect")
async def detect_faces(request: Request):
    authorize(request)
    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="Empty body.")

    loop = asyncio.get_running_loop()
    async with _InferenceSlot(_inference_slots):
        try:
            faces = await loop.run_in_executor(None, lambda: run_detection(body))
        except HTTPException:
            raise
        except Exception as exc:  # pragma: no cover - model/runtime failures
            logger.exception("Inference failed")
            raise HTTPException(status_code=500, detail=f"Inference failed: {exc}") from exc

    return JSONResponse({"model": MODEL_NAME, "provider": PROVIDERS[0], "faces": faces})
