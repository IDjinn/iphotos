# iPhotos ML (doc 18 §4): FastAPI + ONNX Runtime + insightface buffalo_l baked in.
# Default build is CPU-only (runs everywhere). GPU variants override the onnxruntime
# package at build time, e.g.:
#   docker build --build-arg ONNXRUNTIME_SPEC="onnxruntime-rocm==..." -t iphotos.ml:rocm .
# The service still auto-detects providers at startup and falls back to CPU.
FROM python:3.12-slim AS builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential g++ \
    && rm -rf /var/lib/apt/lists/*

# insightface ships a Cython extension: build it against the pinned numpy in this
# same environment so the runtime stage gets a consistent wheel set.
ARG ONNXRUNTIME_SPEC="onnxruntime>=1.20,<2"
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir "cython<3.1" && \
    pip wheel --no-cache-dir --wheel-dir /wheels "numpy>=1.26,<2" ${ONNXRUNTIME_SPEC} -r /tmp/requirements.txt

FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /wheels /wheels
# onnxruntime + numpy explicitly: the wheel set is resolved in the builder stage
# (ARG ONNXRUNTIME_SPEC), so the runtime stage installs exactly those builds.
RUN pip install --no-cache-dir --no-index --find-links=/wheels \
        fastapi "uvicorn[standard]" insightface onnxruntime numpy && rm -rf /wheels

# Model zoo (buffalo_l: SCRFD-10G detection + ArcFace w600k_r50, 512-d embeddings).
# insightface resolves <root>/models/<name>/*.onnx, hence the doubled directory.
ADD https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip /tmp/buffalo_l.zip
RUN python -m zipfile -e /tmp/buffalo_l.zip /models/models/buffalo_l/ && rm /tmp/buffalo_l.zip

ENV INSIGHTFACE_ROOT=/models \
    ML_MODEL=buffalo_l \
    ML_EXECUTION_PROVIDER=auto

WORKDIR /app
COPY app/main.py /app/main.py

EXPOSE 8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
